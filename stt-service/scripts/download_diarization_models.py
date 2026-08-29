import hashlib
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path


SEGMENTATION_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
)
SEGMENTATION_SHA256 = "24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488"
EMBEDDING_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
)
EMBEDDING_SHA256 = "1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b"


def download(url: str, target: Path, expected_sha256: str) -> None:
    digest = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=120) as response, target.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != expected_sha256:
        target.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 mismatch for {url}")


def safe_extract(archive: Path, output_dir: Path) -> None:
    output_root = output_dir.resolve()
    with tarfile.open(archive, "r:bz2") as bundle:
        for member in bundle.getmembers():
            member_path = (output_dir / member.name).resolve()
            if output_root not in member_path.parents and member_path != output_root:
                raise RuntimeError(f"Unsafe archive entry: {member.name}")
        bundle.extractall(output_dir, filter="data")


def main() -> None:
    output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/diarization-models")
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        temporary_dir = Path(temporary)
        segmentation_archive = temporary_dir / "segmentation.tar.bz2"
        embedding_download = temporary_dir / "embedding.onnx"
        download(SEGMENTATION_URL, segmentation_archive, SEGMENTATION_SHA256)
        download(EMBEDDING_URL, embedding_download, EMBEDDING_SHA256)
        safe_extract(segmentation_archive, output_dir)
        shutil.move(
            str(embedding_download),
            output_dir / "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
        )


if __name__ == "__main__":
    main()
