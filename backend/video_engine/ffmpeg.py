"""FFmpeg execution helpers — subprocess only, file-streamed, never in RAM."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable, List, Optional


class FfmpegError(Exception):
    pass


def run_ffmpeg(args: List[str], on_done: Optional[Callable[[], None]] = None) -> None:
    """Blocking ffmpeg run. Raises FfmpegError on failure."""
    try:
        proc = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error"] + args,
                              capture_output=True, text=True)
    except FileNotFoundError as e:
        raise FfmpegError("FFmpeg was not found on PATH.") from e
    if proc.returncode != 0:
        raise FfmpegError(f"FFmpeg failed: {proc.stderr.strip()[-600:]}")


def extract_audio_wav(source: str, out_wav: Path, start: float, duration: Optional[float]) -> None:
    """16 kHz mono PCM for whisper.cpp."""
    args = ["-y", "-i", source]
    if start > 0:
        args += ["-ss", f"{start:.3f}"]
    if duration and duration > 0:
        args += ["-t", f"{duration:.3f}"]
    args += ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out_wav)]
    run_ffmpeg(args)
    if not out_wav.exists() or out_wav.stat().st_size == 0:
        raise FfmpegError("Audio extraction produced no data. Does this video have an audio track?")
