"""Export engine: builds the real FFmpeg filter graph and renders the final MP4.

Composition colour source (black canvas) -> footage overlay -> burned subtitles
-> logo -> headline. Audio: original with volume/fades, or silent track when the
source has none. Encoding: H.264 (libx264), CRF, faststart.
"""
from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from backend.composition.headline_png import render_headline_png, prepare_logo_png
from backend.composition.layout import Layout, even
from backend.subtitle_engine.ass import build_ass
from backend.utils.paths import EXPORTS_DIR, FONTS_DIR, project_dir


class RenderError(Exception):
    pass


def render_duration(settings: Dict[str, Any], src_duration: float) -> float:
    start = max(0.0, float(settings.get("trimStart") or 0.0))
    end = float(settings["trimEnd"]) if settings.get("trimEnd") is not None else float(src_duration)
    return max(0.2, min(end, src_duration) - start)


def _esc_filter_path(p: Path) -> str:
    """Escape a Windows path for use inside a ffmpeg filter option."""
    s = str(p).replace("\\", "/")
    # colon must be escaped, and the whole option is wrapped in single quotes
    return s.replace(":", "\\:")


class ExportRunner:
    """One export job. Runs FFmpeg in a subprocess with parseable progress."""

    def __init__(self, project_id: str, project_name: str, source: str,
                 src_w: int, src_h: int, src_duration: float, src_fps_override: Optional[float],
                 has_audio: bool, settings: Dict[str, Any]):
        self.project_id = project_id
        self.project_name = project_name
        self.source = source
        self.src_w, self.src_h = int(src_w), int(src_h)
        self.src_duration = float(src_duration)
        self.src_fps = src_fps_override
        self.has_audio = has_audio
        self.settings = settings
        self.proc: Optional[subprocess.Popen] = None
        self.cancelled = False
        self.tmp_dir = project_dir(project_id) / "render"
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    # ---------- artifacts ----------

    def _build_assets(self) -> Dict[str, Any]:
        settings = self.settings
        exp = settings["export"]
        W = int(exp.get("width", 1080))
        if W not in (720, 1080):
            W = 1080
        layout = Layout(W, settings, self.src_w, self.src_h)

        dur = render_duration(settings, self.src_duration)
        fps = exp.get("fps") or self.src_fps or 30.0

        ass_text = build_ass(_segments_for_export(self.project_id), settings, layout)
        ass_file = None
        if ass_text:
            ass_file = self.tmp_dir / "subs.ass"
            ass_file.write_text(ass_text, encoding="utf-8")

        headline_file = self.tmp_dir / "headline.png"
        render_headline_png(settings, layout, headline_file)

        logo_file = self.tmp_dir / "logo.png"
        logo_pos = prepare_logo_png(settings, layout, logo_file)
        if logo_pos is None:
            logo_file = None

        return {"W": W, "H": layout.H, "dur": dur, "fps": fps, "layout": layout,
                "ass": ass_file, "headline": headline_file, "logo": logo_file,
                "logo_pos": logo_pos}

    def _build_cmd(self, a: Dict[str, Any], out_file: Path) -> list:
        settings = self.settings
        layout: Layout = a["layout"]
        W, H, dur, fps = a["W"], a["H"], a["dur"], a["fps"]
        comp = settings["composition"]

        start = max(0.0, float(settings.get("trimStart") or 0.0))
        end = start + dur
        crf = str(int(settings["export"].get("crf", 22)))
        preset = str(settings["export"].get("preset", "veryfast"))

        cmd = ["ffmpeg", "-y", "-hide_banner"]
        cmd += ["-ss", f"{start:.3f}", "-i", str(self.source), "-t", f"{dur:.3f}"]
        cmd += ["-i", str(a["headline"])]
        if a["logo"]:
            cmd += ["-i", str(a["logo"])]
        cmd += ["-filter_complex", self._filtergraph(a)]
        cmd += ["-map", "[vout]"]
        if self.has_audio:
            cmd += ["-map", "[aout]"]
        else:
            cmd += ["-map", "[amute]"]
        cmd += [
            "-c:v", "libx264", "-preset", preset, "-crf", crf,
            "-r", f"{fps:.3f}", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", "-shortest", "-t", f"{dur:.3f}",
            str(out_file),
        ]
        return cmd

    def _filtergraph(self, a: Dict[str, Any]) -> str:
        settings = self.settings
        layout: Layout = a["layout"]
        W, H, fps = a["W"], a["H"], a["fps"]
        foot = settings["footage"]
        crop = foot["crop"]

        chains = []
        # footage: fps normalise -> optional crop -> optional eq -> scale (AR preserved)
        vf = [f"fps={fps:.3f}"]
        if crop["left"] or crop["right"] or crop["top"] or crop["bottom"]:
            cw = max(4, int(self.src_w * (1 - crop["left"] / 100 - crop["right"] / 100)))
            cx = int(self.src_w * crop["left"] / 100)
            chh = max(4, int(self.src_h * (1 - crop["top"] / 100 - crop["bottom"] / 100)))
            cy = int(self.src_h * crop["top"] / 100)
            vf.append(f"crop={cw}:{chh}:{cx}:{cy}")
        brightness = max(-1.0, min(1.0, float(foot.get("brightness", 0))))
        saturation = max(0.0, min(3.0, float(foot.get("saturation", 1))))
        if brightness or saturation != 1.0:
            vf.append(f"eq=brightness={brightness:.3f}:saturation={saturation:.3f}")
        sw, sh = layout.footage_scaled_w, layout.footage_scaled_h
        vf.append(f"scale={sw}:{sh}:flags=lanczos,setsar=1")
        chains.append("[0:v]" + ",".join(vf) + "[vid]")

        chains.append(f"color=black:s={W}x{H}:r={fps:.3f}:d={a['dur']:.3f}[base]")
        chains.append(f"[base][vid]overlay=x={layout.footage_x}:y={layout.footage_y}[comp]")

        cur = "comp"
        if a["ass"]:
            fdir = _esc_filter_path(Path(a["ass"]).parent)
            fpath = _esc_filter_path(Path(a["ass"]))
            from backend.utils.paths import FONTS_DIR
            fontdir = _esc_filter_path(FONTS_DIR)
            chains.append(f"[{cur}]subtitles=filename='{fpath}':fontsdir='{fontdir}'[subbed]")
            cur = "subbed"
        # headline
        chains.append(f"[{cur}][1:v]overlay=x=0:y=0[hded]")
        cur = "hded"
        # logo last
        if a["logo"]:
            lx, ly = a["logo_pos"]
            chains.append(f"[{cur}][2:v]overlay=x={lx}:y={ly}[vout]")
        else:
            chains.append(f"[{cur}]copy[vout]")

        # audio
        audio = settings["audio"]
        vol = max(0.0, float(audio.get("volume", 1.0)))
        part = []
        part.append(f"volume={vol:.3f}")
        if float(audio.get("fadeIn", 0) or 0) > 0:
            part.append(f"afade=t=in:d={float(audio['fadeIn']):.2f}")
        if float(audio.get("fadeOut", 0) or 0) > 0:
            part.append(f"afade=t=out:st={max(0.0, a['dur'] - float(audio['fadeOut'])):.2f}:d={float(audio['fadeOut']):.2f}")
        if self.has_audio:
            chains.append("[0:a]" + ",".join(part) + "[aout]")
        else:
            chains.append(f"anullsrc=r=44100:cl=stereo:d={a['dur']:.3f}"
                          + (f",volume={vol:.3f}" if vol < 1 else "") + "[amute]")

        return ";".join(chains)

    # ---------- execution ----------

    def run(self, out_path: Path,
            progress: Callable[[int, str], None],
            should_cancel: Callable[[], bool]) -> None:
        assets = self._build_assets()
        cmd = self._build_cmd(assets, out_path)
        cmd += ["-progress", "pipe:1", "-nostats", "-loglevel", "warning"]

        out_path.parent.mkdir(parents=True, exist_ok=True)
        total_us = max(1.0, assets["dur"] * 1_000_000)
        errors: list = []

        try:
            self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                         text=True, encoding="utf-8", errors="replace")
        except FileNotFoundError:
            raise RenderError("FFmpeg was not found on PATH.")

        import threading

        def pump_err():
            tail = ""
            for line in (self.proc.stderr or []):
                tail = (tail + line)[-2000:]

        t = threading.Thread(target=pump_err, daemon=True)
        t.start()

        for line in (self.proc.stdout or []):
            line = line.strip()
            if line.startswith("out_time_us="):
                try:
                    us = float(line.split("=", 1)[1])
                    pct = min(99, int(us / total_us * 100))
                    progress(pct, "rendering")
                except ValueError:
                    pass
            if should_cancel():
                self.cancelled = True
                self.proc.kill()
                break
        self.proc.wait(timeout=120)
        t.join(timeout=1)

        if self.cancelled:
            out_path.unlink(missing_ok=True)
            self._cleanup()
            raise RenderError("cancelled")
        if self.proc.returncode != 0 or not out_path.exists():
            self._cleanup()
            raise RenderError(f"FFmpeg render failed (code {self.proc.returncode}).")
        self._cleanup()

    def _cleanup(self) -> None:
        for p in (self.tmp_dir / "subs.ass", self.tmp_dir / "headline.png", self.tmp_dir / "logo.png"):
            try:
                p.unlink()
            except OSError:
                pass

    def out_path(self, export_root: Path) -> Path:
        from backend.utils.paths import sanitize
        safe = sanitize(self.project_name)
        name = f"{safe}_{self.project_id}.mp4"
        d = export_root / self.project_id
        d.mkdir(parents=True, exist_ok=True)
        return d / name


def _segments_for_export(project_id: str) -> list:
    """Load transcript segments to burn (edited by the user)."""
    p = project_dir(project_id) / "transcript.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8")).get("segments", [])
    return []
