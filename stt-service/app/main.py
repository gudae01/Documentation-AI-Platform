import os
import tempfile
import threading
from dataclasses import dataclass
from math import exp
from pathlib import Path

import av
import numpy as np
import sherpa_onnx
from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool


MODEL_NAME = os.getenv("STT_MODEL", "small")
DEVICE = os.getenv("STT_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")
MODEL_CACHE = os.getenv("STT_MODEL_CACHE", "/models")
LANGUAGE = os.getenv("STT_LANGUAGE", "ko")
INITIAL_PROMPT = os.getenv("STT_INITIAL_PROMPT", "").strip() or None
CPU_THREADS = max(1, int(os.getenv("STT_CPU_THREADS", "4")))
NUM_WORKERS = max(1, int(os.getenv("STT_NUM_WORKERS", "1")))
MAX_AUDIO_BYTES = max(1, int(os.getenv("STT_MAX_AUDIO_MB", "100"))) * 1024 * 1024
DIARIZATION_SEGMENTATION_MODEL = os.getenv(
    "DIARIZATION_SEGMENTATION_MODEL",
    "/opt/diarization-models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx",
)
DIARIZATION_EMBEDDING_MODEL = os.getenv(
    "DIARIZATION_EMBEDDING_MODEL",
    "/opt/diarization-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
)
DIARIZATION_PROVIDER = os.getenv("DIARIZATION_PROVIDER", "cpu")
DIARIZATION_THREADS = max(1, int(os.getenv("DIARIZATION_THREADS", str(CPU_THREADS))))
DIARIZATION_NUM_SPEAKERS = max(0, int(os.getenv("DIARIZATION_NUM_SPEAKERS", "0")))
DIARIZATION_THRESHOLD = float(os.getenv("DIARIZATION_THRESHOLD", "0.9"))
DIARIZATION_MODEL_NAME = "sherpa-onnx-pyannote-3.0+3dspeaker-eres2net"

ALLOWED_SUFFIXES = {".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".wav", ".webm"}
app = FastAPI(title="MEDIFLOW Local STT", docs_url=None, redoc_url=None)
_model: WhisperModel | None = None
_diarizer: sherpa_onnx.OfflineSpeakerDiarization | None = None
_model_lock = threading.Lock()
_diarizer_lock = threading.Lock()
_inference_lock = threading.Lock()


@dataclass(frozen=True)
class DiarizationTurn:
    start: float
    end: float
    speaker: int


class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    confidence: float
    speaker: str
    speakerRole: str = "확인 필요"


class TranscriptResponse(BaseModel):
    text: str
    language: str
    languageProbability: float
    duration: float
    model: str
    diarizationModel: str
    speakerCount: int
    segments: list[TranscriptSegment]


def get_model() -> WhisperModel:
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            _model = WhisperModel(
                MODEL_NAME,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                download_root=MODEL_CACHE,
                cpu_threads=CPU_THREADS,
                num_workers=NUM_WORKERS,
            )
    return _model


def get_diarizer() -> sherpa_onnx.OfflineSpeakerDiarization:
    global _diarizer
    if _diarizer is not None:
        return _diarizer
    with _diarizer_lock:
        if _diarizer is None:
            segmentation_path = Path(DIARIZATION_SEGMENTATION_MODEL)
            embedding_path = Path(DIARIZATION_EMBEDDING_MODEL)
            if not segmentation_path.is_file() or not embedding_path.is_file():
                raise RuntimeError("화자 분리 모델 파일을 찾을 수 없습니다.")
            segmentation = sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                    model=str(segmentation_path),
                ),
                num_threads=DIARIZATION_THREADS,
                provider=DIARIZATION_PROVIDER,
            )
            embedding = sherpa_onnx.SpeakerEmbeddingExtractorConfig(
                model=str(embedding_path),
                num_threads=DIARIZATION_THREADS,
                provider=DIARIZATION_PROVIDER,
            )
            clustering = sherpa_onnx.FastClusteringConfig(
                num_clusters=DIARIZATION_NUM_SPEAKERS if DIARIZATION_NUM_SPEAKERS else -1,
                threshold=DIARIZATION_THRESHOLD,
            )
            config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
                segmentation=segmentation,
                embedding=embedding,
                clustering=clustering,
            )
            if not config.validate():
                raise RuntimeError("화자 분리 모델 설정이 올바르지 않습니다.")
            _diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    return _diarizer


def decode_audio(path: str) -> np.ndarray:
    chunks: list[np.ndarray] = []
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
    with av.open(path) as container:
        for frame in container.decode(audio=0):
            for converted in resampler.resample(frame):
                chunks.append(converted.to_ndarray().reshape(-1))
        for converted in resampler.resample(None):
            chunks.append(converted.to_ndarray().reshape(-1))
    if not chunks:
        raise RuntimeError("음성 샘플을 읽을 수 없습니다.")
    return np.concatenate(chunks).astype(np.float32, copy=False)


def diarize_file(path: str) -> list[DiarizationTurn]:
    samples = decode_audio(path)
    result = get_diarizer().process(samples)
    return [
        DiarizationTurn(start=float(segment.start), end=float(segment.end), speaker=int(segment.speaker))
        for segment in result.sort_by_start_time()
        if segment.end > segment.start
    ]


def speaker_label(speaker: int) -> str:
    if 0 <= speaker < 26:
        return f"화자 {chr(ord('A') + speaker)}"
    return f"화자 {speaker + 1}"


def speaker_at(start: float, end: float, turns: list[DiarizationTurn]) -> int:
    if not turns:
        return 0
    overlap_by_speaker: dict[int, float] = {}
    for turn in turns:
        overlap = max(0.0, min(end, turn.end) - max(start, turn.start))
        if overlap:
            overlap_by_speaker[turn.speaker] = overlap_by_speaker.get(turn.speaker, 0.0) + overlap
    if overlap_by_speaker:
        return max(overlap_by_speaker, key=lambda speaker: overlap_by_speaker[speaker])
    midpoint = (start + end) / 2
    nearest = min(turns, key=lambda turn: min(abs(midpoint - turn.start), abs(midpoint - turn.end)))
    return nearest.speaker


def build_transcript_segments(whisper_segments: list[object], turns: list[DiarizationTurn]) -> list[TranscriptSegment]:
    transcript_segments: list[TranscriptSegment] = []
    for whisper_segment in whisper_segments:
        words = list(whisper_segment.words or [])
        if not words:
            text = whisper_segment.text.strip()
            if text:
                transcript_segments.append(TranscriptSegment(
                    id=len(transcript_segments),
                    start=round(whisper_segment.start, 2),
                    end=round(whisper_segment.end, 2),
                    text=text,
                    confidence=round(exp(min(0.0, whisper_segment.avg_logprob)), 4),
                    speaker=speaker_label(speaker_at(whisper_segment.start, whisper_segment.end, turns)),
                ))
            continue

        grouped_words: list[object] = []
        grouped_speaker: int | None = None
        for word in words:
            word_start = float(word.start if word.start is not None else whisper_segment.start)
            word_end = float(word.end if word.end is not None else word_start)
            word_speaker = speaker_at(word_start, word_end, turns)
            if grouped_words and word_speaker != grouped_speaker:
                transcript_segments.append(transcript_segment_from_words(
                    len(transcript_segments), grouped_words, int(grouped_speaker), whisper_segment,
                ))
                grouped_words = []
            grouped_speaker = word_speaker
            grouped_words.append(word)
        if grouped_words and grouped_speaker is not None:
            transcript_segments.append(transcript_segment_from_words(
                len(transcript_segments), grouped_words, grouped_speaker, whisper_segment,
            ))
    return transcript_segments


def transcript_segment_from_words(segment_id: int, words: list[object], speaker: int,
                                  fallback_segment: object) -> TranscriptSegment:
    start = float(words[0].start if words[0].start is not None else fallback_segment.start)
    end = float(words[-1].end if words[-1].end is not None else fallback_segment.end)
    probabilities = [float(word.probability) for word in words if word.probability is not None]
    confidence = sum(probabilities) / len(probabilities) if probabilities else exp(min(0.0, fallback_segment.avg_logprob))
    return TranscriptSegment(
        id=segment_id,
        start=round(start, 2),
        end=round(end, 2),
        text="".join(word.word for word in words).strip(),
        confidence=round(confidence, 4),
        speaker=speaker_label(speaker),
    )


def transcribe_file(path: str) -> TranscriptResponse:
    with _inference_lock:
        diarization_turns = diarize_file(path)
        segments_iterator, info = get_model().transcribe(
            path,
            language=LANGUAGE or None,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=True,
            initial_prompt=INITIAL_PROMPT,
            word_timestamps=True,
        )
        segments = build_transcript_segments(list(segments_iterator), diarization_turns)
        speaker_count = len({segment.speaker for segment in segments})
    return TranscriptResponse(
        text=" ".join(segment.text for segment in segments).strip(),
        language=info.language,
        languageProbability=round(info.language_probability, 4),
        duration=round(info.duration, 2),
        model=MODEL_NAME,
        diarizationModel=DIARIZATION_MODEL_NAME,
        speakerCount=speaker_count,
        segments=segments,
    )


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "modelLoaded": _model is not None,
        "diarizationModel": DIARIZATION_MODEL_NAME,
        "diarizationModelLoaded": _diarizer is not None,
    }


@app.post("/v1/transcriptions", response_model=TranscriptResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscriptResponse:
    suffix = Path(file.filename or "audio.webm").suffix.lower()
    content_type = (file.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    supported_content = content_type.startswith("audio/") or content_type in {
        "video/mp4", "application/octet-stream",
    }
    if suffix not in ALLOWED_SUFFIXES or not supported_content:
        raise HTTPException(status_code=415, detail="지원하지 않는 음성 파일 형식입니다.")

    temp_path = ""
    total_bytes = 0
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            temp_path = temporary.name
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > MAX_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="음성 파일 크기 제한을 초과했습니다.")
                temporary.write(chunk)
        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="빈 음성 파일은 변환할 수 없습니다.")
        return await run_in_threadpool(transcribe_file, temp_path)
    except HTTPException:
        raise
    except Exception as exception:
        raise HTTPException(status_code=422, detail="음성 파일을 변환하지 못했습니다.") from exception
    finally:
        await file.close()
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
