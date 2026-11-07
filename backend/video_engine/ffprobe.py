"""FFprobe wrapper: extracts media metadata as plain JSON."""
from __future__ import annotations

import json
import subprocess
from typing import Any, Dict, Optional

from backend.utils.paths import ROOT


class ProbeError(Exception):
    pass


def probe(path: str) -> Dict[str, Any]:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60, cwd=str(ROOT),
        )
    except FileNotFoundError as e:
        raise ProbeError("FFprobe was not found on PATH. Install FFmpeg first.") from e
    if out.returncode != 0 or not out.stdout.strip():
        raise ProbeError(f"FFprobe could not read this file: {out.stderr.strip()[:300]}")
    data = json.loads(out.stdout)

    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    if not v:
        raise ProbeError("This file has no video stream.")

    def _fps(st: Dict[str, Any]) -> Optional[float]:
        raw = st.get("avg_frame_rate") or st.get("r_frame_rate")
        if not raw or raw == "0/0":
            return None
        try:
            num, den = raw.split("/")
            f = float(num) / float(den)
            return round(f, 3) if f > 0 else None
        except Exception:
            return None

    dur = float(data.get("format", {}).get("duration") or v.get("duration") or 0)
    fr = _fps(v)
    return {
        "duration": dur,
        "width": int(v.get("width", 0)),
        "height": int(v.get("height", 0)),
        "fps": fr,
        "codec": v.get("codec_name"),
        "hasAudio": bool(a),
        "audioCodec": a.get("codec_name") if a else None,
        "sizeBytes": int(data.get("format", {}).get("size", 0)),
        "format": data.get("format", {}).get("format_name"),
    }
