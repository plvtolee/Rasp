"""RASP backend entry point.

Run:  python -m uvicorn backend.main:app --port 8000
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import ai as ai_api
from backend.api import exports as exports_api
from backend.api import jobs as jobs_api
from backend.api import media as media_api
from backend.api import projects as projects_api
from backend.storage.db import init_db
from backend.transcription import engine as whisper
from backend.composition.layout import DEFAULT_SETTINGS
from backend.utils.paths import DEFAULT_EXPORT_DIR

app = FastAPI(title="RASP", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(media_api.router)
app.include_router(projects_api.router)
app.include_router(ai_api.router)
app.include_router(exports_api.router)
app.include_router(jobs_api.router)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/system")
def system():
    import shutil
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    ffprobe_ok = shutil.which("ffprobe") is not None
    try:
        wh = whisper.status()
    except Exception:
        wh = {"ready": False}
    return {
        "app": "RASP",
        "version": "1.0.0",
        "ffmpeg": ffmpeg_ok,
        "ffprobe": ffprobe_ok,
        "whisper": wh,
        "openRouter": bool(os.environ.get("OPENROUTER_API_KEY")),
        "exportDir": DEFAULT_EXPORT_DIR,
        "defaults": DEFAULT_SETTINGS,
    }


@app.get("/api/health")
def health():
    return {"ok": True}
