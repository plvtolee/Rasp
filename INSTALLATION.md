# INSTALLATION — RASP

## Prerequisites

- **Windows 10/11** (primary target).
- **Python 3.10+** (tested on 3.14).
- **Node.js 18+** and npm.
- **FFmpeg + FFprobe** on `PATH` (download from https://ffmpeg.org/download.html
  or `winget install Gyan.FFmpeg`).

Verify:

```powershell
python --version
node --version
ffmpeg -version | findstr version
ffprobe -version | findstr version
```

## Setup

```powershell
# 1. Clone
git clone https://github.com/plvtolee/Rasp.git
cd Rasp

# 2. Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 3. Frontend
cd frontend
npm install
cd ..
```

## Configuration

Copy `.env.example` to `.env` and edit if you want:

```
OPENROUTER_API_KEY=sk-or-v1-...   # optional — AI headline suggestions
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
```

Everything works without these values (TEST 13).

## Running

Terminal 1 — backend:

```powershell
cd Rasp
.venv\Scripts\activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```powershell
cd Rasp\frontend
npm run dev
```

Open **http://localhost:5173**.

## Engine setup (whisper.cpp)

1. Open **Settings** in the app.
2. Choose a model (Tiny ~78 MB or Base ~145 MB).
3. Click **Install / Repair**. The backend downloads the official whisper.cpp
   Windows CPU build and the ggml model. Progress is shown in the UI.
4. After install, the status shows `INSTALLED` / `READY`.

## Testing the complete pipeline

### Automated (CLI)

```powershell
cd Rasp
# Generate a test video with real speech (PowerShell TTS)
powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; \$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; \$s.SetOutputToWaveFile('C:\temp\speech.wav'); \$s.Speak('Here is the secret nobody tells you about vertical video. Most people crop the footage and lose the whole frame. Instead, place the landscape clip on a black canvas, put a bold headline above it, and burn the captions right into the picture.'); \$s.Dispose()"
ffmpeg -y -f lavfi -i "testsrc2=size=1280x720:rate=30" -i "C:\temp\speech.wav" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "C:\temp\landscape.mp4"

python scripts/test_pipeline.py "C:\temp\landscape.mp4"
```

Expected output: `ACCEPTANCE PIPELINE PASSED` with a real 1080×1920 H.264 MP4.

### Manual (UI)

1. **TEST 1** — Upload `landscape.mp4` on the New Project page; preview shows.
2. **TEST 2** — Type a headline in the Headline tab; it appears above the footage.
3. **TEST 3** — Subtitles tab → Transcribe; real captions appear in the track list.
4. **TEST 4** — Edit a subtitle line; re-export; the correction is in the MP4.
5. **TEST 5** — Upload a transparent PNG logo; it appears below the footage.
6. **TEST 6** — Preview shows all zones (top safe, headline, footage, subs, logo,
   bottom safe).
7. **TEST 7** — Export → 1080×1920 MP4 created.
8. **TEST 8** — `ffprobe` confirms 1080×1920, H.264, no stretched footage.
9. **TEST 9/11** — Export without a logo → no fake logo appears.
10. **TEST 10** — Export a video with no audio → graceful, silent audio track added.
11. **TEST 12** — UI stays responsive during transcription/export.
12. **TEST 13** — Works without `OPENROUTER_API_KEY`.
13. **TEST 14** — Interface follows the Neo-Brutalist Editorial Swiss direction.

## Troubleshooting

- **"FFmpeg was not found"** — install FFmpeg and add to `PATH`.
- **Transcription fails with "no audio track"** — the source has no audio stream;
  subtitles will be disabled but export still works.
- **Whisper download fails** — check internet; retry from Settings.
- **Export fails with "FFmpeg render failed"** — check the backend log for the
  exact ffmpeg error; usually a path/permission issue.
- **Frontend can't reach backend** — ensure backend is on port 8000 and the
  Vite proxy in `vite.config.ts` points to it.
- **Port 8000 in use** — change the port in both the uvicorn command and
  `vite.config.ts`.

## Cleaning up

- Delete `projects/` to reset all projects and transcripts.
- Delete `exports/` to remove finished videos.
- Delete `assets/whisper/` to force a fresh engine download.
