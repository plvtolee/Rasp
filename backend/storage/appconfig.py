"""App-wide preferences (SQLite-backed), applied when creating projects/exports."""
from __future__ import annotations

import json
from typing import Any, Dict

from backend.composition.layout import DEFAULT_SETTINGS
from backend.storage import db
from backend.utils.paths import DEFAULT_EXPORT_DIR


def defaults() -> Dict[str, Any]:
    return {
        "defaultExportDir": DEFAULT_EXPORT_DIR,
        "resolution": 1080,
        "crf": 22,
        "transcriptionModel": "tiny",
        "subtitleStyle": DEFAULT_SETTINGS["subtitles"],
        "headlineStyle": DEFAULT_SETTINGS["headline"],
        "logoPath": None,
    }


def get() -> Dict[str, Any]:
    raw = db.get_app_setting("app")
    base = defaults()
    if raw:
        try:
            stored = json.loads(raw)
            for k, v in stored.items():
                if isinstance(v, dict) and isinstance(base.get(k), dict):
                    base[k] = {**base[k], **v}
                else:
                    base[k] = v
        except json.JSONDecodeError:
            pass
    return base


def apply_to_new_project(settings: Dict[str, Any]) -> Dict[str, Any]:
    cfg = get()
    settings["export"]["width"] = int(cfg.get("resolution", 1080) or 1080)
    settings["export"]["crf"] = int(cfg.get("crf", 22) or 22)
    if isinstance(cfg.get("headlineStyle"), dict):
        for k, v in cfg["headlineStyle"].items():
            if isinstance(v, dict) and isinstance(settings["headline"].get(k), dict):
                settings["headline"][k].update(v)
            else:
                settings["headline"][k] = v
    if isinstance(cfg.get("subtitleStyle"), dict):
        for k, v in cfg["subtitleStyle"].items():
            settings["subtitles"][k] = v
    if cfg.get("logoPath"):
        settings["logo"]["path"] = cfg["logoPath"]
    return settings


def export_dir() -> str:
    return get().get("defaultExportDir") or DEFAULT_EXPORT_DIR