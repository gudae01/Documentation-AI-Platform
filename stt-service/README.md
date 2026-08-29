# MEDIFLOW Local STT

환자 음성을 외부 AI API로 보내지 않고 내부 서버에서 처리하는 Faster-Whisper + sherpa-onnx 서비스입니다.

- 기본 모델: `small`
- 기본 언어: `ko`
- 기본 실행: CPU `int8`
- 공개 ONNX 화자 분리 모델로 `화자 A`, `화자 B` 자동 구분
- 업로드 음성은 임시 파일로만 처리하고 전사 완료 후 삭제
- 화자별 의료진·환자·보호자 역할은 추측하지 않고 `확인 필요`로 반환

주요 환경변수:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `STT_MODEL` | `small` | Whisper 모델 이름 또는 로컬 모델 경로 |
| `STT_LANGUAGE` | `ko` | 전사 언어 |
| `STT_DEVICE` | `cpu` | `cpu` 또는 `cuda` |
| `STT_COMPUTE_TYPE` | `int8` | CPU는 `int8`, GPU는 보통 `float16` |
| `STT_CPU_THREADS` | `4` | CPU 추론 스레드 수 |
| `STT_NUM_WORKERS` | `1` | 동시 추론 워커 수 |
| `STT_MAX_AUDIO_MB` | `100` | 업로드 최대 크기 |
| `STT_MODEL_CACHE` | `/models` | 모델 저장 경로 |
| `DIARIZATION_PROVIDER` | `cpu` | 화자 분리 ONNX 실행 장치 |
| `DIARIZATION_THREADS` | `STT_CPU_THREADS` | 화자 분리 CPU 스레드 수 |
| `DIARIZATION_NUM_SPEAKERS` | `0` | `0`은 화자 수 자동 추정, 양수는 고정 인원 |
| `DIARIZATION_THRESHOLD` | `0.9` | 자동 화자 군집 임계값. 높을수록 더 적은 화자로 묶임 |

Whisper 모델은 최초 요청 시 `/models` 볼륨에 다운로드됩니다. 화자 분리 모델은 Docker 이미지 빌드 시 공식 sherpa-onnx 릴리스에서 내려받고 SHA-256을 검증해 포함합니다. 이후 음성 데이터는 모델 제공처로 전송하지 않습니다.
