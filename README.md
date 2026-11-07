# RASP — Lightweight AI Shorts Formatter

**RASP** takes an existing landscape video and automatically formats it into a
polished vertical 9:16 Short:

- automatic speech subtitles burned into the footage,
- an editable headline above the footage,
- an optional logo underneath,
- black-background composition that follows the reference layout,
- real H.264 MP4 export.

RASP is a **local-first** application. All video processing runs on your own
machine with FFmpeg + whisper.cpp (CPU). No cloud video rendering. OpenRouter
is optional for AI headline suggestions; the app works fully without an API key.

Target hardware: Intel Core i3, 8 GB RAM, integrated graphics, Windows 10/11.

---

## Quick start

### 1. Backend (Python)

```bash
cd "path\to\Rasp"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The backend creates `projects/` (SQLite + media + transcripts) and `exports/`
automatically on first run.

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### 3. Engine setup (whisper.cpp)

The first time you transcribe, RASP downloads the official whisper.cpp Windows
CPU build and the ggml Tiny/Base model from the Settings page
(**Settings → Install / Repair**). After that, transcription is fully offline.

---

## Features

1. **Upload** landscape MP4 / MOV / MKV / WEBM (drag-and-drop or file browser,
   or reference a local path with zero copy).
2. **Trim** with start/end timestamps or use the AI range finder (offline
   heuristic on transcript hook-words).
3. **Real transcription** via whisper.cpp (Tiny or Base), CPU inference, with
   token-level word timestamps.
4. **Editable subtitles**: phrase / word / karaoke modes, font, size, colour,
   outline, shadow, highlight keywords, line spacing, position. Edit each line
   and re-export.
5. **Headline editor**: multi-line, font, size, letter spacing, line height,
   alignment, italic, colour, stroke, shadow, background block, offsets.
6. **Optional AI headline** via OpenRouter; falls back to a local heuristic.
7. **Logo upload** (PNG/JPG/JPEG/WEBP) with width, opacity, position, rotation.
   Transparent PNGs preserve alpha. No logo = black area (never invented).
8. **Video adjustments**: scale, position, horizontal/vertical crop, brightness,
   saturation, audio volume, fade in/out.
9. **Live 9:16 preview** with play/pause, seek, safe-area guides, fullscreen.
10. **Export** real 1080×1920 (or 720×1280) H.264 MP4 with burned subtitles,
    headline, logo, preserved audio, faststart, real progress, cancellation,
    output-folder opening.

---

## Acceptance tests

`scripts/test_pipeline.py` runs the complete upload → transcribe → edit → export
pipeline against a live backend and verifies the output is a real 1080×1920
H.264 MP4. See `INSTALLATION.md` for the full test procedure.

---

## Known limitations

- whisper.cpp must be downloaded on first use (Settings → Install / Repair).
  Requires internet for the initial ~15 MB engine + model.
- Caption word-timing is real when whisper's tokens are available; older or
  custom whisper.cpp builds without tokens fall back to proportional timing
  (flagged `wordsApprox: true` in the transcript).
- Headline italic uses a CSS/Pillow shear (no true italic font shipped).
- Fonts must be installed or shipped in `assets/fonts/` for libass to render
  the requested family; bundled fonts are Archivo Black, Space Grotesk,
  IBM Plex Mono.
- No YouTube download, no live stream ingestion, no template marketplace,
  no multi-layer graphics editor — by design.
- OpenRouter requires a key in the environment; without it, AI features fall
  back to local heuristics.
- Tested on Windows 10/11. macOS/Linux are not officially supported but the
  Python backend should run cross-platform.

---

## License

MIT.
