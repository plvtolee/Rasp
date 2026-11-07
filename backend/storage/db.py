"""SQLite storage for projects, export history and app settings.

Uses the stdlib sqlite3 module — no ORM, no heavyweight dependencies.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.utils.paths import DATABASE_PATH

_local = threading.local()


def _conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None or getattr(_local, "dbpath", None) != str(DATABASE_PATH):
        conn = sqlite3.connect(str(DATABASE_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        _local.conn = conn
        _local.dbpath = str(DATABASE_PATH)
    return conn


def init_db() -> None:
    conn = _conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source_path TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            settings TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS exports (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            output_path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            duration REAL,
            width INTEGER,
            height INTEGER,
            status TEXT NOT NULL DEFAULT 'done'
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
    conn.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


# ---------- projects ----------

def create_project(name: str, source_path: Optional[str], settings: Optional[dict]) -> Dict[str, Any]:
    pid = new_id()
    conn = _conn()
    conn.execute(
        "INSERT INTO projects (id, name, source_path, created_at, updated_at, settings) VALUES (?,?,?,?,?,?)",
        (pid, name, source_path, now_iso(), now_iso(), json.dumps(settings or {})),
    )
    conn.commit()
    return get_project(pid)


def get_project(pid: str) -> Optional[Dict[str, Any]]:
    row = _conn().execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not row:
        return None
    return dict(row)


def list_projects() -> List[Dict[str, Any]]:
    rows = _conn().execute(
        "SELECT * FROM projects ORDER BY updated_at DESC LIMIT 50"
    ).fetchall()
    return [dict(r) for r in rows]


def update_project(pid: str, **fields: Any) -> None:
    if not fields:
        return
    sets, vals = [], []
    for k, v in fields.items():
        if k == "settings" and isinstance(v, dict):
            v = json.dumps(v)
        sets.append(f"{k}=?")
        vals.append(v)
    vals.append(now_iso())
    vals.append(pid)
    _conn().execute(f"UPDATE projects SET {', '.join(sets)}, updated_at=? WHERE id=?", vals)
    _conn().commit()


def delete_project(pid: str) -> None:
    conn = _conn()
    conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    conn.execute("DELETE FROM exports WHERE project_id=?", (pid,))
    conn.commit()


# ---------- exports ----------

def record_export(pid: str, project_name: str, output_path: Path,
                  duration: float, width: int, height: int) -> Dict[str, Any]:
    eid = new_id()
    _conn().execute(
        "INSERT INTO exports (id, project_id, project_name, output_path, created_at, duration, width, height, status)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (eid, pid, project_name, str(output_path), now_iso(), duration, width, height, "done"),
    )
    _conn().commit()
    return dict(_conn().execute("SELECT * FROM exports WHERE id=?", (eid,)).fetchone())


def list_exports(limit: int = 50) -> List[Dict[str, Any]]:
    rows = _conn().execute(
        "SELECT * FROM exports ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


# ---------- app settings ----------

def get_app_setting(key: str) -> Optional[str]:
    row = _conn().execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else None


def set_app_setting(key: str, value: str) -> None:
    conn = _conn()
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?,?)"
        " ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    conn.commit()
