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


@router.post("/projects/{pid}/director")
def ai_director(pid: str, body: dict):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    tr = _load_transcript(pid)
    if not tr:
        raise HTTPException(400, "Transcribe the video first")
    mode = str(body.get("mode", "viral"))
    if mode not in ("subtle", "viral", "aggressive"):
        mode = "viral"
    from backend.composition.layout import merge_settings
    settings = merge_settings(json.loads(p["settings"] or "{}"))
    meta = None
    try:
        from backend.video_engine.ffprobe import probe
        meta = probe(p["source_path"])
    except Exception:
        pass
    duration = meta["duration"] if meta else 60.0

    # Build editing plan
    plan = _build_editing_plan(tr, settings, mode, duration, body)
    # Save to project settings
    settings["ai_director"]["mode"] = mode
    settings["ai_director"]["editing_plan"] = plan
    db.update_project(pid, settings=settings)
    return {"ok": True, "plan": plan, "events": len(plan.get("motion_events", []))}


@router.post("/projects/{pid}/director/undo")
def ai_director_undo(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    from backend.composition.layout import merge_settings
    settings = merge_settings(json.loads(p["settings"] or "{}"))
    settings["ai_director"]["editing_plan"] = None
    # Reset effects motion/visual to empty
    if "effects" in settings:
        settings["effects"]["motion"] = []
        settings["effects"]["visual_effects"] = []
    db.update_project(pid, settings=settings)
    return {"ok": True}
    f = project_dir(pid) / "transcript.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return None
def _build_editing_plan(tr, settings, mode, duration, body):
    """Build an AI editing plan using local heuristics + optional OpenRouter."""
    import uuid
    segments = tr.get("segments", [])
    enabled = body.get("enabled_actions", {})
    if not enabled:
        enabled = settings.get("ai_director", {}).get("enabled_actions", {
            "dynamic_zoom": True, "punch_zoom": True, "smooth_camera": True,
            "subtitle_emphasis": True, "audio_aware": True, "smart_visual": True,
            "silence_removal": False, "speed_changes": False,
        })

    mode_params = {
        "subtle": {"max_zoom": 1.08, "punch_freq": 0.1, "shake_freq": 0.05, "zoom_freq": 0.3},
        "viral": {"max_zoom": 1.12, "punch_freq": 0.25, "shake_freq": 0.15, "zoom_freq": 0.5},
        "aggressive": {"max_zoom": 1.18, "punch_freq": 0.4, "shake_freq": 0.3, "zoom_freq": 0.7},
    }
    params = mode_params.get(mode, mode_params["viral"])

    motion_events = []
    subtitle_emphasis = []

    from backend.ai import openrouter as ai_mod
    if ai_mod.ai_available():
        try:
            import httpx, json as _json, re
            transcript_text = " ".join(s["text"] for s in segments)
            prompt = (
                f"You are a video editing AI. Analyze this transcript and create an editing plan.\n"
                f"Mode: {mode}. Duration: {duration:.1f}s.\n"
                f"Transcript:\n{transcript_text[:3000]}\n\n"
                f"Return ONLY valid JSON with this structure:\n"
                f'{{"motion_events": [{{"start": 0.0, "end": 3.0, "effect": "slow_zoom_in", '
                f'"from_scale": 1.0, "to_scale": 1.1, "easing": "ease_in_out", "intensity": 60, '
                f'"reason": "important statement", "confidence": 0.9}}], '
                f'"subtitle_emphasis": [{{"start": 0.0, "end": 3.0, "keyword": "KEYWORD", "color": "accent"}}]}}\n'
                f"Rules: max zoom 1.2, punch zoom 0.2-0.7s, smooth zoom 1.5-4s, min 2s between punch zooms. "
                f"Only suggest effects for genuinely important moments. Return valid JSON only."
            )
            resp = httpx.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {ai_mod.api_key()}", "Content-Type": "application/json"},
                json={"model": ai_mod.model(), "messages": [{"role": "user", "content": prompt}], "max_tokens": 1000, "temperature": 0.7},
                timeout=30,
            )
            if resp.status_code == 200:
                data = resp.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
                if not text:
                    reasoning = (data.get("choices") or [{}])[0].get("message", {}).get("reasoning", "")
                    m = re.search(r'\{.*\}', reasoning, re.DOTALL)
                    if m:
                        text = m.group(0)
                if text:
                    text = text.strip()
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                    plan_data = _json.loads(text)
                    for ev in plan_data.get("motion_events", []):
                        if _validate_motion_event(ev, duration, params):
                            ev["id"] = ev.get("id", f"event_{uuid.uuid4().hex[:6]}")
                            ev["enabled"] = True
                            motion_events.append(ev)
                    for se in plan_data.get("subtitle_emphasis", []):
                        if se.get("start", 0) < se.get("end", 0) <= duration:
                            subtitle_emphasis.append(se)
        except Exception:
            pass

    # Local fallback / supplement
    if not motion_events and enabled.get("dynamic_zoom", True):
        import random
        random.seed(42)
        for i, seg in enumerate(segments):
            text = seg.get("text", "").lower()
            start = float(seg.get("start", 0))
            end = float(seg.get("end", 0))
            dur = end - start
            if dur < 1.0:
                continue
            score = 0
            hooks = ["secret", "never", "best", "worst", "insane", "crazy", "actually", "why", "how", "must", "important", "key", "truth", "real"]
            for h in hooks:
                if h in text:
                    score += 1
            if "?" in text or "!" in text:
                score += 1
            if len(text.split()) > 15:
                score += 0.5

            if score >= 1 and random.random() < params["zoom_freq"]:
                if enabled.get("punch_zoom") and score >= 2 and random.random() < params["punch_freq"]:
                    motion_events.append({
                        "id": f"event_{uuid.uuid4().hex[:6]}",
                        "start": round(start, 2),
                        "end": round(min(start + 0.5, end), 2),
                        "effect": "punch_zoom",
                        "scale": round(1.0 + params["max_zoom"] * 0.3, 3),
                        "intensity": min(90, 50 + score * 10),
                        "reason": "Strong statement",
                        "confidence": min(0.95, 0.7 + score * 0.05),
                        "enabled": True,
                        "easing": "ease_out",
                        "focalX": 50, "focalY": 50,
                    })
                else:
                    motion_events.append({
                        "id": f"event_{uuid.uuid4().hex[:6]}",
                        "start": round(start, 2),
                        "end": round(end, 2),
                        "effect": "slow_zoom_in",
                        "from_scale": 1.0,
                        "to_scale": round(1.0 + (params["max_zoom"] - 1.0) * 0.5, 3),
                        "easing": "ease_in_out",
                        "intensity": min(80, 40 + score * 10),
                        "reason": "Important statement",
                        "confidence": min(0.9, 0.6 + score * 0.05),
                        "enabled": True,
                        "focalX": 50, "focalY": 50,
                    })

    if enabled.get("subtitle_emphasis", True) and not subtitle_emphasis:
        emphasis_words = ["secret", "never", "best", "worst", "insane", "crazy", "actually", "truth", "real", "important", "key"]
        for seg in segments:
            words = seg.get("words", [])
            for w in words:
                if w.get("word", "").strip(".,!?").lower() in emphasis_words:
                    subtitle_emphasis.append({
                        "start": round(float(w["start"]), 2),
                        "end": round(float(w["end"]), 2),
                        "keyword": w["word"].strip(".,!?").upper(),
                        "color": "accent",
                    })

    motion_events.sort(key=lambda e: e.get("start", 0))

    filtered = []
    for ev in motion_events:
        overlap = False
        for existing in filtered:
            if ev["start"] < existing.get("end", 0) and ev["end"] > existing.get("start", 0):
                if ev.get("confidence", 0) > existing.get("confidence", 0):
                    filtered.remove(existing)
                else:
                    overlap = True
                    break
        if not overlap:
            filtered.append(ev)
    motion_events = filtered

    return {
        "version": 1,
        "editing_mode": mode,
        "motion_events": motion_events,
        "subtitle_emphasis": subtitle_emphasis,
        "confidence": 0.8 if motion_events else 0.5,
    }


def _validate_motion_event(ev, duration, params):
    if not isinstance(ev, dict):
        return False
    effect = ev.get("effect")
    if effect not in ("slow_zoom_in", "slow_zoom_out", "punch_zoom", "micro_shake", "dynamic_pan", "focus_zoom"):
        return False
    start = ev.get("start", 0)
    end = ev.get("end", 0)
    if not (0 <= start < end <= duration):
        return False
    if end - start < 0.1:
        return False
    intensity = ev.get("intensity", 50)
    if not (0 <= intensity <= 100):
        return False
    for key in ("from_scale", "to_scale", "scale"):
        if key in ev:
            val = ev[key]
            if not isinstance(val, (int, float)) or val < 0.5 or val > 2.0:
                return False
    return True
