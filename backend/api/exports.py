"""Export endpoints + job polling + output folder opening."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.jobs import manager as jobs
from backend.composition.renderer import ExportRunner, RenderError, render_duration
from backend.storage import appconfig, db
from backend.utils.paths import DEFAULT_EXPORT_DIR
from backend.video_engine.ffprobe import probe

router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("")
def history(limit: int = 50):
    return {"exports": db.list_exports(limit)}


@router.post("/projects/{pid}")
def start_export(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    src = p["source_path"]
    if not src or not Path(src).exists():
        raise HTTPException(400, "Project has no source video")
    running = jobs.is_running("export", pid)
    if running:
        return {"jobId": running["id"], "alreadyRunning": True}

    try:
        meta = probe(src)
    except Exception as e:
        raise HTTPException(400, str(e))
    settings = json.loads(p["settings"] or "{}")
    from backend.composition.layout import merge_settings
    settings = merge_settings(settings)

    runner = ExportRunner(
        project_id=pid, project_name=p["name"], source=src,
        src_w=meta["width"], src_h=meta["height"], src_duration=meta["duration"],
        src_fps_override=meta["fps"], has_audio=meta["hasAudio"], settings=settings,
    )
    out = runner.out_path(Path(appconfig.export_dir()))
    dur = render_duration(settings, meta["duration"])

    def worker(progress, is_cancelled):
        progress(2, "preparing composition")
        try:
            runner.run(out, progress, is_cancelled)
        except RenderError as e:
            if "cancelled" in str(e).lower():
                raise
            raise RuntimeError(str(e)) from e
        rec = db.record_export(pid, p["name"], out, dur, settings["export"]["width"] or 1080,
                               round((settings["export"]["width"] or 1080) * 16 / 9))
        return {"export": rec, "output": str(out)}

    jid = jobs.create("export", f"exporting {p['name']}", worker, pid)
    return {"jobId": jid, "output": str(out), "duration": dur}


@router.post("/open-folder")
def open_folder(body: dict):
    path = str(body.get("path", ""))
    target = Path(path)
    folder = target if target.is_dir() else (target.parent if target.exists() else None)
    if not folder or not folder.exists():
        raise HTTPException(400, "Folder does not exist")
    if target.is_file():
        subprocess.Popen(["explorer", "/select,", str(target)])
    else:
        subprocess.Popen(["explorer", str(folder)])
    return {"ok": True}


@router.post("/delete-file")
def delete_file(body: dict):
    p = Path(str(body.get("path", "")))
    if p.exists() and p.is_file():
        p.unlink()
        return {"ok": True}
    return {"ok": False}
