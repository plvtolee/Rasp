"""Project CRUD: a project = one source video + its full settings blob."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.composition.layout import merge_settings
from backend.storage import db
from backend.utils.paths import project_dir

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    sourcePath: Optional[str] = None


@router.get("")
def list_all():
    projects = db.list_projects()
    for p in projects:
        p["settings"] = json.loads(p["settings"] or "{}")
    return {"projects": projects}


@router.post("")
def create(body: ProjectCreate):
    from backend.composition.layout import DEFAULT_SETTINGS, merge_settings
    from backend.storage import appconfig
    import copy
    settings = appconfig.apply_to_new_project(copy.deepcopy(DEFAULT_SETTINGS))
    p = db.create_project(body.name, body.sourcePath, settings)
    p["settings"] = merge_settings(json.loads(p["settings"] or "{}"))
    return {"project": p}


@router.get("/{pid}")
def get_one(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    p["settings"] = merge_settings(json.loads(p["settings"] or "{}"))
    p["transcript"] = _load_transcript(pid)
    p["exports"] = [e for e in db.list_exports(100) if e["project_id"] == pid]
    meta = None
    if p.get("source_path"):
        try:
            from backend.video_engine.ffprobe import probe
            meta = probe(p["source_path"])
        except Exception:
            meta = None
    p["meta"] = meta
    return {"project": p}


@router.patch("/{pid}")
def update(pid: str, body: dict):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    fields = {}
    if "settings" in body and isinstance(body["settings"], dict):
        merged = db.get_project(pid)["settings"]
        merged_json = json.loads(merged or "{}")
        from backend.composition.layout import merge_settings  # base for defaults
        current = merge_settings(merged_json)
        merged_json = _deep_merge(merged_json, body["settings"])
        fields["settings"] = merged_json
    if "name" in body and body["name"]:
        fields["name"] = body["name"]
    if "source_path" in body:
        fields["source_path"] = body["source_path"]
    db.update_project(pid, **fields)
    return get_one(pid)


@router.delete("/{pid}")
def delete(pid: str):
    db.delete_project(pid)
    # remove project workspace (transcript, render cache) — media stays
    d = project_dir(pid)
    for f in ("transcript.json",):
        (d / f).unlink(missing_ok=True)
    return {"ok": True}


def _load_transcript(pid: str):
    f = project_dir(pid) / "transcript.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return None


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out
