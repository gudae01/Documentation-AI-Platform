FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STT_MODEL_CACHE=/models \
    DIARIZATION_SEGMENTATION_MODEL=/opt/diarization-models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx \
    DIARIZATION_EMBEDDING_MODEL=/opt/diarization-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx

RUN useradd --system --uid 10002 --create-home stt \
    && mkdir -p /app /models \
    && chown -R stt:stt /app /models

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt
COPY scripts/download_diarization_models.py /tmp/download_diarization_models.py
RUN python /tmp/download_diarization_models.py /opt/diarization-models \
    && rm /tmp/download_diarization_models.py
COPY --chown=stt:stt app ./app

USER stt
VOLUME ["/models"]
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1", "--no-access-log"]
