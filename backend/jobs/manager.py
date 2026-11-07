"""Sequential in-process job runner: transcription, engine downloads, exports.

Everything runs on background threads; the UI polls status endpoints. UI and
processing are decoupled so transcoding never freezes the interface.
"""
from __future__ import annotations

import threading
import time
import traceback
from typing import Any, Callable, Dict, Optional

_lock = threading.Lock()
_jobs: Dict[str, Dict[str, Any]] = {}
_seq = 0


def _next_id() -> str:
    global _seq
    with _lock:
        _seq += 1
        return f"job{_seq:04d}{int(time.time()) % 100000}"


def create(kind: str, label: str, worker: Callable[[Dict[str, Any], Callable, Callable], Any],
           project_id: Optional[str] = None) -> str:
    """Run `worker(progress, is_cancelled)` on a background thread."""
    jid = _next_id()
    job: Dict[str, Any] = {
        "id": jid, "kind": kind, "label": label,
        "projectId": project_id, "status": "running", "progress": 0,
        "message": "", "result": None,
        "error": None, "createdAt": time.time(),
    }
    with _lock:
        _jobs[jid] = job

    def progress(pct: int, msg: str = "") -> None:
        if 0 <= pct <= 100:
            job["progress"] = pct
            if msg:
                job["message"] = msg

    def is_cancelled() -> bool:
        return job["status"] in ("cancelling", "cancelled")

    def run() -> None:
        try:
            result = worker(progress, is_cancelled)
            if job["status"] == "cancelling":
                job["status"] = "cancelled"
            else:
                job["status"] = "done"
                job["progress"] = 100
            job["result"] = result
        except Exception as e:  # noqa: BLE001
            if is_cancelled() or "cancelled" in str(e).lower():
                job["status"] = "cancelled"
                job["error"] = "Cancelled by user"
            elif "cancelled" in type(e).__name__.lower():
                job["status"] = "cancelled"
                job["error"] = "Cancelled by user"
            else:
                job["status"] = "failed"
                job["error"] = f"{type(e).__name__}: {e}"
                traceback.print_exc()

    job["thread"] = threading.Thread(target=run, daemon=True, name=f"rasp-{kind}")
    job["thread"].start()
    return jid


def get(jid: str) -> Optional[Dict[str, Any]]:
    j = _jobs.get(jid)
    if not j:
        return None
    return {k: v for k, v in j.items() if k != "thread"}


def cancel(jid: str) -> bool:
    j = _jobs.get(jid)
    if not j:
        return False
    if j["status"] in ("running",):
        j["status"] = "cancelling"
        return True
    return False


def list_recent(limit: int = 12) -> list:
    out = sorted(_jobs.values(), key=lambda j: -j["createdAt"])
    return [{k: v for k, v in j.items() if k != "thread"} for j in out[:limit]]


def is_running(kind: str, project_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    for j in _jobs.values():
        if j["kind"] == kind and j["status"] == "running":
            if project_id is None or (j["projectId"] and j["projectId"] == project_id):
                return j
    return None
