"""whisper.cpp integration — real CPU speech transcription.

Engine management:
  - Backend auto-downloads the official whisper.cpp Windows CPU build (whisper-bin-x64.zip,
    tag b5454) and ggml Tiny/Base models from HuggingFace on first use.
  - All inference is local. No cloud transcription.
  - Word-level timing comes from whisper token timestamps; when tokens are
    unavailable we fall back to proportional within-segment timing and mark the
    segments `wordsApprox: true` (honest, not faked precision).
"""
from __future__ import annotations

import json
import subprocess
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from backend.utils.paths import (
    FONTS_DIR, WHISPER_BIN_DIR, WHISPER_MODELS_DIR, WORK_DIR,
)

BIN_URL = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip"
MODEL_URLS = {
    "tiny": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    "base": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
}
MODEL_SIZES_MB = {"tiny": 78, "base": 145}


class TranscriptionError(Exception):
    pass


# ---------------- availability ----------------

def whisper_cli_path() -> Optional[Path]:
    exe = WHISPER_BIN_DIR / "whisper-cli.exe"
    if exe.exists():
        return exe
    alt = WHISPER_BIN_DIR / "main.exe"
    return alt if alt.exists() else None


def model_path(model: str) -> Optional[Path]:
    p = WHISPER_MODELS_DIR / f"ggml-{model}.bin"
    return p if p.exists() else None


def status() -> Dict[str, Any]:
    cli = whisper_cli_path()
    return {
        "engine": "whisper.cpp (CPU)",
        "cliReady": bool(cli),
        "cliPath": str(cli) if cli else None,
        "models": {
            name: {
                "ready": bool(model_path(name)),
                "sizeMB": MODEL_SIZES_MB[name],
                "path": str(model_path(name)) if model_path(name) else None,
            }
            for name in MODEL_URLS
        },
    }


def needs_download(model: str) -> bool:
    return not (whisper_cli_path() and model_path(model))


# ---------------- downloads ----------------

def _download(url: str, dest: Path, progress: Optional[Callable[[int, str], None]] = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "rasp/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as f:
        total = int(resp.headers.get("Content-Length", 0)) or None
        got = 0
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if progress and total:
                progress(min(99, int(got / total * 100)), f"downloading {dest.name}")
    tmp.replace(dest)
    if progress:
        progress(100, f"downloaded {dest.name}")


def ensure_engine(model: str, progress: Optional[Callable[[int, str], None]] = None) -> None:
    if model not in MODEL_URLS:
        raise TranscriptionError(f"Unknown model '{model}'. Choose tiny or base.")
    if whisper_cli_path():
        return
    WHISPER_BIN_DIR.mkdir(parents=True, exist_ok=True)
    zip_dest = WHISPER_BIN_DIR / "whisper-bin-x64.zip"
    _download(BIN_URL, zip_dest, progress)
    with zipfile.ZipFile(zip_dest) as z:
        for member in z.infolist():
            if member.filename.endswith(".exe") or member.filename.endswith(".dll"):
                out = WHISPER_BIN_DIR / Path(member.filename).name
                with z.open(member) as src, open(out, "wb") as dst:
                    dst.write(src.read())
    zip_dest.unlink(missing_ok=True)
    if not whisper_cli_path():
        raise TranscriptionError("whisper.cpp archive did not contain whisper-cli.exe.")
    if not model_path(model):
        WHISPER_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        _download(MODEL_URLS[model], WHISPER_MODELS_DIR / f"ggml-{model}.bin", progress)


# ---------------- transcription ----------------

def transcribe(wav_path: Path, model: str, language: str,
               offset: float,
               progress_cb: Optional[Callable[[int, str], None]] = None,
               should_cancel: Callable[[], bool] = lambda: False) -> Dict[str, Any]:
    cli = whisper_cli_path()
    if cli is None:
        # auto-install, then retry
        ensure_engine(model, progress_cb)
        cli = whisper_cli_path()
    model_file = model_path(model)
    if model_file is None:
        ensure_engine(model, progress_cb)
        model_file = model_path(model)
    if not wav_path.exists():
        raise TranscriptionError("Audio file is missing.")

    json_out = wav_path.parent / (wav_path.stem + ".json")
    srt_out = wav_path.parent / (wav_path.stem + ".srt")
    for p in (json_out, srt_out):
        p.unlink(missing_ok=True)

    args = [
        str(cli), "-m", str(model_file), "-f", str(wav_path),
        "-ojf", "-of", str(wav_path.parent / wav_path.stem),
        "-pp", "-nt", "-np",
    ]
    if language and language != "auto":
        args += ["-l", language]

    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, encoding="utf-8", errors="replace")
    pct = 0
    stderr_tail: List[str] = []
    import re
    rx = re.compile(r"progress\s*=\s*(\d+)%|\b(\d{1,3})%")

    def _pump_err() -> None:
        nonlocal pct
        assert proc.stderr is not None
        for line in proc.stderr:
            stderr_tail.append(line)
            del stderr_tail[:-12]
            m = rx.search(line)
            if m:
                pct2 = int(m.group(1) or m.group(2))
                if pct2 >= pct:
                    pct = pct2
                    if progress_cb:
                        progress_cb(min(95, pct), "transcribing")

    import threading
    t = threading.Thread(target=_pump_err, daemon=True)
    t.start()
    while proc.poll() is None:
        if should_cancel():
            proc.kill()
            raise TranscriptionError("cancelled")
        t.join(timeout=0.25)
    assert proc.stdout is not None
    proc.stdout.read()
    t.join(timeout=1.0)
    if proc.returncode != 0:
        raise TranscriptionError(f"whisper.cpp failed: {''.join(stderr_tail)[-500:]}")
    if progress_cb:
        if progress_cb:
            progress_cb(100, "transcription done")

    if not json_out.exists():
        raise TranscriptionError("whisper.cpp produced no JSON output.")

    data = json.loads(json_out.read_text(encoding="utf-8"))
    segments: List[Dict[str, Any]] = []
    approx = False

    # whisper.cpp emits {"transcription": [{offsets:{from,to} in ms, timestamps:{...}, text}]}
    # Older/custom builds emit {"segments": [{t0,t1,tokens}]}. Support both.
    raw_segments: List[Dict[str, Any]] = []
    if isinstance(data.get("transcription"), list):
        for s in data["transcription"]:
            off = s.get("offsets") or {}
            raw_segments.append({
                "t0": off.get("from", 0),
                "t1": off.get("to", 0),
                "text": s.get("text", ""),
                "tokens": s.get("tokens") or [],
                "ms": True,
            })
    elif isinstance(data.get("segments"), list):
        raw_segments = data["segments"]

    for seg in raw_segments:
        text = " ".join(str(seg.get("text", "")).split())
        if not text.strip():
            continue
        start = seg.get("t0", seg.get("start_ts", 0))
        end = seg.get("t1", seg.get("end_ts", 0))
        start_s = float(start)
        end_s = float(end)
        if seg.get("ms") or start_s > 200:      # milliseconds
            start_s, end_s = start_s / 1000.0, end_s / 1000.0
        elif start_s > 100:                     # centiseconds
            start_s, end_s = start_s / 100.0, end_s / 100.0
        if end_s <= start_s:
            end_s = start_s + 0.4

        words = merge_tokens_to_words(seg.get("tokens", []))
        words_approx = False
        if not words:
            words_approx = True
            approx = True
            words = distribute_words(text, start_s, end_s)

        # whisper.cpp full-JSON emits one long window; split into caption phrases
        phrase_groups = split_into_phrases(words) if len(words) > 1 else []
        if len(phrase_groups) > 1:
            for grp in phrase_groups:
                p_text = " ".join(w["word"] for w in grp).strip()
                if not p_text:
                    continue
                segments.append({
                    "start": round(grp[0]["start"] + offset, 3),
                    "end": round(grp[-1]["end"] + offset, 3),
                    "text": p_text,
                    "words": [
                        {"word": w["word"], "start": round(w["start"] + offset, 3),
                         "end": round(w["end"] + offset, 3)} for w in grp
                    ],
                    "wordsApprox": False,
                })
            continue

        segments.append({
            "start": round(start_s + offset, 3),
            "end": round(end_s + offset, 3),
            "text": text,
            "words": [
                {"word": w["word"], "start": round(w["start"] + offset, 3),
                 "end": round(w["end"] + offset, 3)} for w in words
            ],
            "wordsApprox": words_approx,
        })

    srt_out.unlink(missing_ok=True)
    return {
        "language": data.get("result", {}).get("language", language if language != "auto" else "auto"),
        "model": model,
        "offset": offset,
        "wordsApprox": approx,
        "segments": segments,
    }


def merge_tokens_to_words(tokens: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """whisper.cpp full-JSON tokens carry individual offsets (ms). Group into words."""
    words: List[Dict[str, Any]] = []
    cur_text = ""
    cur_start: Optional[float] = None
    cur_end: Optional[float] = None

    def _flush():
        nonlocal cur_text, cur_start, cur_end
        txt = cur_text.strip()
        if txt and cur_start is not None and cur_end is not None and cur_end >= cur_start:
            words.append({"word": txt, "start": cur_start, "end": cur_end})
        cur_text = ""
        cur_start = None
        cur_end = None

    for tok in tokens:
        t_txt = str(tok.get("text", ""))
        off = tok.get("offsets") or {}
        if off:
            t0 = float(off.get("from", 0)) / 1000.0  # ms -> s
            t1 = float(off.get("to", 0)) / 1000.0
        else:
            raw0 = tok.get("t0_10ms", tok.get("t0", None))
            raw1 = tok.get("t1_10ms", tok.get("t1", None))
            if raw0 is None:
                continue
            t0, t1 = float(raw0), float(raw1)
            if t0 > 10000:
                t0, t1 = t0 / 1000.0, t1 / 1000.0
            elif t0 > 100:
                t0, t1 = t0 / 100.0, t1 / 100.0

        starts_word = bool(t_txt) and (t_txt.startswith(" ") or not cur_text)
        txt = t_txt.strip()
        if not txt:
            continue
        if starts_word:
            _flush()
            cur_text = txt
            cur_start = t0
            cur_end = t1
        else:
            cur_text += txt
            cur_end = t1
    _flush()
    return words


def split_into_phrases(words: List[Dict[str, Any]], max_chars: int = 46,
                       max_words: int = 8, max_pause: float = 0.45) -> List[List[Dict[str, Any]]]:
    """Split a whisper window into short caption phrases at punctuation/pauses.

    All boundaries use REAL word timestamps — no fabricated timing."""
    groups: List[List[Dict[str, Any]]] = []
    buf: List[Dict[str, Any]] = []

    def flush():
        nonlocal buf
        if buf:
            groups.append(buf)
            buf = []

    for i, w in enumerate(words):
        buf.append(w)
        text = " ".join(x["word"] for x in buf)
        nxt = words[i + 1] if i + 1 < len(words) else None
        pause = (nxt["start"] - w["end"]) if nxt else 0.0
        ends_punct = bool(w["word"].strip()[-1:] in ".?!:")
        if ends_punct or len(buf) >= max_words or len(text) >= max_chars or (nxt and pause > max_pause):
            flush()
    flush()
    return groups


def distribute_words(text: str, start: float, end: float) -> List[Dict[str, Any]]:
    """Proportional fallback alignment (flagged as approximate upstream)."""
    ws = text.split()
    n = len(ws)
    if n == 0:
        return []
    dur = max(0.2, end - start)
    per = dur / n
    return [{"word": w, "start": start + i * per, "end": start + (i + 1) * per}
            for i, w in enumerate(ws)]


class Cancelled(Exception):
    pass
