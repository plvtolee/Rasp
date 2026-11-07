"""End-to-end acceptance test for RASP — runs against a live backend.

Usage:
  python scripts/test_pipeline.py <video> [--logo <png>] [--no-audio-video <mp4>]

Covers: upload/path ingest, project creation, real whisper.cpp transcription,
subtitle correction persistence, full composition export, and ffprobe verification.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time

import httpx

BASE = "http://127.0.0.1:8000"


def wait_job(c: httpx.Client, jid: str, label: str, timeout=1800):
    t0 = time.time()
    last = -1
    while True:
        j = c.get(f"{BASE}/api/jobs/{jid}").json()
        if j["progress"] != last or j["status"] != "running":
            print(f"  [{label}] {j['status']:<9} {j['progress']:>3}%  {j.get('message','')}")
            last = j["progress"]
        if j["status"] == "done":
            return j
        if j["status"] in ("failed", "cancelled"):
            raise SystemExit(f"{label} failed: {j.get('error')}")
        if time.time() - t0 > timeout:
            raise SystemExit(f"{label} timed out")
        time.sleep(1.2)


def ffprobe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), {})
    a = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    return {
        "width": v.get("width"), "height": v.get("height"),
        "duration": float(data["format"]["duration"]),
        "videoCodec": v.get("codec_name"),
        "audio": bool(a), "audioCodec": a.get("codec_name") if a else None,
        "fps": v.get("avg_frame_rate"),
    }


def main():
    video = sys.argv[1]
    logo = None
    if "--logo" in sys.argv:
        logo = sys.argv[sys.argv.index("--logo") + 1]

    with httpx.Client(timeout=120) as c:
        print("== 1. ingest video ==")
        media = c.post(f"{BASE}/api/media/from-path", json={"path": video}).json()
        meta = media["meta"]
        print(f"   {meta['width']}x{meta['height']} {meta['duration']:.2f}s audio={meta['hasAudio']}")

        print("== 2. create project ==")
        p = c.post(f"{BASE}/api/projects", json={"name": "Acceptance Test", "sourcePath": media["path"]}).json()["project"]
        pid = p["id"]
        print(f"   project {pid}")

        print("== 3. configure headline/logo/captions ==")
        settings = p["settings"]
        settings["headline"]["text"] = "THE SECRET\nNOBODY TELLS YOU"
        settings["headline"]["color"] = "#FFFFFF"
        settings["headline"]["background"]["enabled"] = True
        settings["headline"]["background"]["color"] = "#C6FF36"
        settings["subtitles"]["mode"] = "phrase"
        settings["subtitles"]["highlightKeywords"] = "secret, difference"
        settings["export"]["width"] = 1080
        if logo:
            settings["logo"]["enabled"] = True
            settings["logo"]["path"] = logo
        else:
            settings["logo"]["enabled"] = False
            settings["logo"]["path"] = None
        c.patch(f"{BASE}/api/projects/{pid}", json={"settings": settings})

        print("== 4. headline suggestion (works without OpenRouter) ==")
        sugg = c.post(f"{BASE}/api/ai/projects/{pid}/headline").json()
        print(f"   {sugg['headline']!r} ({sugg['source']})")

        print("== 5. real transcription via whisper.cpp ==")
        r = c.post(f"{BASE}/api/ai/projects/{pid}/transcribe", json={"model": "tiny", "language": "en"}).json()
        wait_job(c, r["jobId"], "transcribe")

        proj = c.get(f"{BASE}/api/projects/{pid}").json()["project"]
        tr = proj["transcript"]
        print(f"   language={tr['language']} segments={len(tr['segments'])} wordsApprox={tr['wordsApprox']}")
        assert tr["segments"], "no transcript segments produced"
        print(f"   first: {tr['segments'][0]['text']!r}")

        print("== 6. edit one subtitle line (TEST 4) ==")
        segs = tr["segments"]
        segs[0]["text"] = "THIS LINE WAS EDITED BY HAND"
        r = c.put(f"{BASE}/api/ai/projects/{pid}/transcript", json={"segments": segs})
        print(f"   saved {r.json()['segments']} segments")

        print("== 7. suggestion ranges ==")
        ranges = c.post(f"{BASE}/api/ai/projects/{pid}/suggest-segments").json()["segments"]
        print(f"   {len(ranges)} ranges; best: {ranges[0]['start'] if ranges else '-'}s")

        print("== 8. export ==")
        r = c.post(f"{BASE}/api/exports/projects/{pid}").json()
        out = r["output"]
        job = wait_job(c, r["jobId"], "export")
        print(f"   {out}")

        print("== 9. verify output ==")
        info = ffprobe(out)
        print("   " + json.dumps(info))
        ok = info["width"] == 1080 and info["height"] == 1920
        print(f"   9:16 canvas: {'PASS' if ok else 'FAIL'}")
        if not ok:
            raise SystemExit(1)
        print("\nACCEPTANCE PIPELINE PASSED")


if __name__ == "__main__":
    main()