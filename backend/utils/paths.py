"""Central path resolution for RASP."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("RASP_ROOT", Path(__file__).resolve().parents[2]))

PROJECTS_DIR = ROOT / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR = PROJECTS_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = PROJECTS_DIR / "rasp.db"
EXPORTS_DIR = ROOT / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

ASSETS_DIR = ROOT / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
WHISPER_DIR = ASSETS_DIR / "whisper"
WHISPER_BIN_DIR = WHISPER_DIR / "bin"
WHISPER_MODELS_DIR = WHISPER_DIR / "models"

WORK_DIR = PROJECTS_DIR / "_work"
WORK_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_EXPORT_DIR = str(EXPORTS_DIR)


def project_dir(project_id: str) -> Path:
    d = PROJECTS_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def sanitize(name: str) -> str:
    keep = [c if c.isalnum() or c in "-_ " else "" for c in name]
    s = "".join(keep).strip() or "clip"
    return s[:48]
