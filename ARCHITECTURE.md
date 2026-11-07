# ARCHITECTURE — RASP

## Overview

RASP is a local-first web application: a React + Vite frontend talks to a
Python FastAPI backend over HTTP on `127.0.0.1`. All heavy work (FFmpeg,
whisper.cpp) runs as subprocesses, never inside the Python process memory.
The frontend never renders video — it composes a lightweight DOM preview.

```
┌──────────────────┐  HTTP   ┌────────────────────────────┐
│  React/Vite UI   │◄──────►│  FastAPI (backend/)        │
│  (frontend/)     │        │  jobs, projects, exports    │
└──────────────────┘        └──────┬──────────┬──────────┘
                                   │          │
                                   │          └──► SQLite (projects/rasp.db)
                                   │
        ┌──────────────────────────┼─────────────────────────────┐
        │                          │                             │
        ▼                          ▼                             ▼
   FFmpeg / FFprobe        whisper.cpp (CPU)                Pillow (headline PNG)
   (subprocess)            (subprocess)                    (in-process, tiny)
```

## Directory layout

```
Rasp/
├── frontend/                React + Vite + TypeScript + Tailwind
│   └── src/
│       ├── components/      ui.tsx, NavRail, Toasts
│       ├── pages/           Dashboard, NewProject, Exports, Settings
│       ├── editor/          EditorPage, Preview, panels, layout, useProject
│       ├── hooks/           useJobs
│       └── services/api.ts
├── backend/
│   ├── main.py              FastAPI app + routers
│   ├── api/                 media, projects, ai, exports, jobs
│   ├── video_engine/        ffprobe metadata, ffmpeg audio extract
│   ├── transcription/       whisper.cpp runner + download manager
│   ├── subtitle_engine/     ASS generator (phrase/word/karaoke)
│   ├── composition/         layout.py (zone math), headline_png.py, renderer.py
│   ├── storage/             db.py (SQLite), appconfig.py
│   ├── jobs/                manager.py (threaded job registry)
│   ├── ai/                  openrouter.py (optional) + heuristics
│   └── utils/paths.py       all filesystem locations
├── assets/fonts/            Archivo Black, Space Grotesk, IBM Plex Mono
├── assets/whisper/          whisper.cpp binary + ggml models (downloaded)
├── projects/                SQLite + media + transcripts + render cache
├── exports/                 finished MP4s
├── scripts/test_pipeline.py end-to-end acceptance test
└── docs: README, ARCHITECTURE, INSTALLATION, requirements, .env.example
```

## Vertical composition (1080 × 1920)

`backend/composition/layout.py` is the single source of truth; the frontend
preview (`frontend/src/editor/layout.ts`) mirrors the same numbers.

| Zone | Region | Notes |
|------|--------|-------|
| A — Top safe | ~24.5% of height | Black, empty (platform UI) |
| B — Headline | above footage | editable, Archivo Black default |
| C — Footage | middle band | 16:9 preserved, never stretched |
| D — Subtitles | inside footage, low | burned ASS, never covers faces/safe areas |
| E — Logo | below footage | optional transparent PNG |
| Bottom safe | ~18% of height | Black (platform descriptions) |

All zone sizes are percentages and configurable per project.

## Export pipeline

1. `ExportRunner._build_assets()` — computes layout, renders headline PNG
   (Pillow), prepares logo PNG (resize/rotate/opacity), writes ASS subtitles.
2. `ExportRunner._build_cmd()` — assembles the FFmpeg command.
3. `ExportRunner._filtergraph()` — builds the filter graph:
   `[0:v]` fps → crop → eq → scale (AR preserved) → `[vid]`;
   `[vid]` subtitles (burned onto footage) → `[vid_sub]`;
   black canvas → `[base]`;
   `[base][vid_sub]` overlay → `[comp]`;
   `[comp][headline]` overlay → `[hded]`;
   `[hded][logo]` overlay → `[vout]`;
   audio: volume/fade or `anullsrc` silent track.
4. `ExportRunner.run()` — streams progress via `-progress pipe:1`,
   supports cancellation, cleans up temp files.

## Transcription

`backend/transcription/engine.py` runs `whisper-cli` (whisper.cpp) as a
subprocess with `-ojf` (full JSON including tokens). Token offsets are real
word timings; when tokens are absent, word timings are distributed
proportionally and flagged `wordsApprox: true`. Segments are split into
caption phrases at punctuation/pauses using real word timestamps.

## Job system

`backend/jobs/manager.py` runs transcription, engine download and export on
background threads. The UI polls `/api/jobs/{id}` and stays responsive.

## Storage

- SQLite (`projects/rasp.db`) — projects, exports, app settings.
- Filesystem — uploaded media, transcripts JSON, render cache, exports.
- Projects are portable: a project stores its source path + settings blob.

## Performance

- No video loaded into RAM; FFmpeg streams from disk.
- Sequential jobs by default (one at a time per kind).
- Whisper Tiny/Base only, CPU inference, int8-friendly.
- Low-res DOM preview (no full render on every edit).
- Temporary render files cleaned after each export.
- Cancellation kills the subprocess.
