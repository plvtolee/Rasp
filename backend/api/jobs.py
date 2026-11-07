"""Job polling + app settings endpoints."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from backend.jobs import manager as jobs
from backend.storage import db
from backend.composition.layout import DEFAULT_SETTINGS

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs/{jid}")
def job_status(jid: str):
    j = jobs.get(jid)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@router.get("/jobs")
def all_jobs():
    return {"jobs": jobs.list_recent()}


@router.post("/jobs/{jid}/cancel")
def cancel_job(jid: str):
    if not jobs.cancel(jid):
        raise HTTPException(400, "Job cannot be cancelled")
    return {"ok": True}


@router.get("/settings")
def get_settings():
    val = db.get_app_setting("app")
    return json.loads(val) if val else {
        "defaultExportDir": DEFAULT_EXPORT_DIR,
        "resolution": 1080,
        "crf": 22,
        "transcriptionModel": "tiny",
        "subtitleStyle": DEFAULT_SETTINGS["subtitles"],
        "headlineStyle": DEFAULT_SETTINGS["headline"],
        "logoPath": None,
    }


@router.put("/settings")
def put_settings(body: dict):
    db.set_app_setting("app", json.dumps(body, ensure_ascii=False))
    return {"ok": True}
