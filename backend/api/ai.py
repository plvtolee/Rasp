"""Transcription + AI endpoints."""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.jobs import manager as jobs
from backend.ai import openrouter as ai
from backend.storage import db
from backend.transcription import engine as whisper
from backend.utils.paths import WORK_DIR, project_dir
from backend.video_engine.ffmpeg import extract_audio_wav, FfmpegError
from backend.video_engine.ffprobe import probe

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status")
def status():
    return {
        "whisper": whisper.status(),
        "openRouter": {"available": ai.ai_available(), "model": ai.model() if ai.ai_available() else None},
    }


@router.post("/download-engine")
def download_engine(body: dict):
    model = str(body.get("model", "tiny"))
    if whisper.needs_download(model):

        def worker(progress, is_cancelled):
            whisper.ensure_engine(model, progress)
            return {"ok": True}

        jid = jobs.create("download", f"whisper.cpp engine ({model})", worker)
        return {"jobId": jid, "alreadyInstalled": False}
    return {"jobId": None, "alreadyInstalled": True}


@router.post("/projects/{pid}/transcribe")
def transcribe(pid: str, body: dict):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    src = p["source_path"]
    if not src or not Path(src).exists():
        raise HTTPException(400, "Project has no source video")
    running = jobs.is_running("transcribe", pid)
    if running:
        return {"jobId": running["id"], "alreadyRunning": True}

    model = str(body.get("model", "tiny"))
    if model not in ("tiny", "base"):
        model = "tiny"
    language = str(body.get("language", "auto"))

    try:
        meta = probe(src)
    except Exception as e:
        raise HTTPException(400, str(e))
    if not meta["hasAudio"]:
        raise HTTPException(400, "This video has no audio track — nothing to transcribe.")
    dur = meta["duration"]
    settings = json.loads(p["settings"] or "{}")
    from backend.composition.layout import merge_settings
    s = merge_settings(settings)
    start = max(0.0, float(s.get("trimStart") or 0.0))
    end = float(s["trimEnd"]) if s.get("trimEnd") is not None else dur
    span = max(1.0, min(end, dur) - start)

    uid = uuid.uuid4().hex[:8]
    wav = WORK_DIR / f"{pid}_{uid}.wav"

    def worker(progress, is_cancelled):
        progress(5, "extracting audio")
        extract_audio_wav(src, wav, start, span)
        progress(8, "running whisper.cpp")

        class _Cancel(Exception):
            pass

        try:
            result = whisper.transcribe(
                wav, model, language,
                offset=start,
                progress_cb=progress,
                should_cancel=is_cancelled,
            )
        except Exception as e:
            wav.unlink(missing_ok=True)
            if "cancelled" in str(e).lower():
                raise
            raise
        wav.unlink(missing_ok=True)
        out = project_dir(pid) / "transcript.json"
        out.write_text(json.dumps({
            "language": result["language"], "model": model,
            "offset": start, "wordsApprox": result["wordsApprox"],
            "segments": result["segments"],
            "transcribedAt": time.strftime("%Y-%m-%d %H:%M"),
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        progress(100, "ready")
        return {"segments": len(result["segments"]), "language": result["language"]}

    jid = jobs.create("transcribe", "transcribing audio", worker, pid)
    return {"jobId": jid}


@router.post("/projects/{pid}/headline")
def headline(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    tr = _load_transcript(pid)
    if tr:
        text = " ".join(s["text"] for s in tr["segments"])
    else:
        text = ""
    result = ai.suggest_headline(text)
    return result


@router.post("/projects/{pid}/suggest-segments")
def suggest_segments(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    tr = _load_transcript(pid)
    if not tr:
        return {"segments": []}
    return {"segments": ai.suggest_segments(tr["segments"])}


@router.put("/projects/{pid}/transcript")
def save_transcript(pid: str, body: dict):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    segments = body.get("segments")
    if not isinstance(segments, list):
        raise HTTPException(400, "segments list required")
    f = project_dir(pid) / "transcript.json"
    data = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {"language": "auto", "model": "manual", "offset": 0, "wordsApprox": False, "segments": []}
    # carry word timings when segment text is unchanged; drop words for edited text
    by_start = {round(s["start"], 2): s for s in data["segments"]}
    for seg in segments:
        prev = by_start.get(round(float(seg.get("start", 0)), 2))
        same = prev and (prev.get("text") == seg.get("text"))
        if same:
            seg["words"] = prev.get("words", [])
            seg["wordsApprox"] = prev.get("wordsApprox", False)
        else:
            seg.setdefault("words", [])
            seg["wordsApprox"] = True if not seg.get("words") else False
    data["segments"] = sorted(
        [s for s in segments if str(s.get("text", "")).strip()], key=lambda s: float(s.get("start", 0))
    )
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True, "segments": len(data["segments"])}


def _load_transcript(pid: str):
    f = project_dir(pid) / "transcript.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return None
