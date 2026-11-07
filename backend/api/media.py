"""Media intake: upload files (multipart) or reference a local path directly."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.utils.paths import MEDIA_DIR
from backend.video_engine.ffprobe import probe, ProbeError

router = APIRouter(prefix="/api/media", tags=["media"])

ALLOWED_VIDEO = {".mp4", ".mov", ".mkv", ".webm"}
ALLOWED_IMAGE = {".png", ".jpg", ".jpeg", ".webp"}
mime_by_ext = {".mp4": "video/mp4", ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".webm": "video/webm"}


@router.get("/stream")
def stream_video(path: str):
    """Streams a local file to the preview player (range-request friendly)."""
    p = Path(path.strip().strip('"'))
    if not p.exists():
        raise HTTPException(404, "File not found")
    if p.suffix.lower() not in ALLOWED_VIDEO:
        raise HTTPException(400, "Not a video file")
    return FileResponse(p, media_type=mime_by_ext.get(p.suffix.lower(), "video/mp4"))


@router.get("/image")
def stream_image(path: str):
    """Streams a local image (logo preview)."""
    p = Path(path.strip().strip('"'))
    if not p.exists():
        raise HTTPException(404, "File not found")
    if p.suffix.lower() not in ALLOWED_IMAGE:
        raise HTTPException(400, "Not an image file")
    import mimetypes
    return FileResponse(p, media_type=mimetypes.guess_type(str(p))[0] or "image/png")


def _metadata_response(path: Path, file_id: str) -> dict:
    try:
        meta = probe(str(path))
    except ProbeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "fileId": file_id,
        "path": str(path),
        "name": path.name,
        "meta": meta,
    }


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_VIDEO:
        raise HTTPException(400, f"Unsupported video type '{ext}'. Use MP4, MOV, MKV or WEBM.")
    file_id = uuid.uuid4().hex[:10]
    dest = MEDIA_DIR / f"{file_id}{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    if dest.stat().st_size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Empty upload.")
    return _metadata_response(dest, file_id)


@router.post("/from-path")
async def use_local_path(body: dict):
    """Zero-copy intake for files already on this machine (fastest on weak hardware)."""
    p = Path(str(body.get("path", "")).strip().strip('"'))
    if not p.exists() or not p.is_file():
        raise HTTPException(400, f"File not found: {p}")
    if p.suffix.lower() not in ALLOWED_VIDEO:
        raise HTTPException(400, f"Unsupported type '{p.suffix}'. Use MP4, MOV, MKV or WEBM.")
    return _metadata_response(p, p.name)


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE:
        raise HTTPException(400, f"Unsupported image type '{ext}'. Use PNG, JPG, JPEG or WEBP.")
    file_id = uuid.uuid4().hex[:10]
    dest = MEDIA_DIR / f"logo_{file_id}{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": str(dest), "name": file.filename}


@router.post("/from-image-path")
async def use_image_path(body: dict):
    p = Path(str(body.get("path", "")).strip().strip('"'))
    if not p.exists() or not p.is_file():
        raise HTTPException(400, f"File not found: {p}")
    if p.suffix.lower() not in ALLOWED_IMAGE:
        raise HTTPException(400, f"Unsupported image '{p.suffix}'. Use PNG, JPG, JPEG or WEBP.")
    return {"path": str(p), "name": p.name}
