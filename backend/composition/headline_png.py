"""Renders the headline as a full-canvas transparent PNG using Pillow.

Why Pillow instead of ffmpeg drawtext:
  - real letter-spacing (drawtext has none)
  - reliable multiline alignment + background blocks
  - no shell/filter-escaping pitfalls with user text
  - visually identical result between preview (CSS) and export
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, Optional

from PIL import Image, ImageDraw, ImageFilter

from backend.composition.layout import Layout
from backend.utils.paths import FONTS_DIR

_FONT_MAP = {
    "archivo black": ("ArchivoBlack-Regular.ttf", False),
    "space grotesk": ("SpaceGrotesk-Medium.ttf", False),
    "ibm plex mono": ("IBMPlexMono-Regular.ttf", False),
}


def resolve_font(family: str) -> Optional[Path]:
    key = family.lower().strip()
    name = _FONT_MAP.get(key, (None, None))[0]
    if name is None:
        # allow the user to point at a font file name directly
        cand = FONTS_DIR / family
        if cand.exists():
            return cand
        return None
    p = FONTS_DIR / name
    return p if p.exists() else None


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple:
    h = (hex_color or "#FFFFFF").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r, g, b = 255, 255, 255
    return (r, g, b, alpha)


def render_headline_png(settings: Dict[str, Any], layout: Layout, out_png) -> None:
    out_png = Path(out_png)
    head = settings["headline"]
    W, H = layout.W, layout.H
    s = layout.s
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    text = str(head.get("text", "")).rstrip("\n")
    if not text.strip():
        out_png.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_png)
        return

    font_path = resolve_font(head.get("fontFamily", "Archivo Black"))
    size = max(10, int(head.get("size", 74) * s))
    tracking = max(0.0, float(head.get("letterSpacing", 0.0)) * s)
    lh = max(0.8, float(head.get("lineHeight", 1.08)))
    align = head.get("align", "center")
    italic = bool(head.get("italic", False))
    color = _hex_to_rgba(head.get("color", "#FFFFFF"))
    stroke = head.get("stroke", {})
    stroke_w = int(max(0, float(stroke.get("width", 3))) * s) if stroke.get("enabled") else 0
    stroke_c = _hex_to_rgba(stroke.get("color", "#111111"))
    shadow = head.get("shadow", {})
    bg = head.get("background", {})

    from PIL import ImageFont
    font = ImageFont.truetype(str(font_path or "arial.ttf"), size)

    # --- wrap lines to canvas width ---
    import unicodedata
    raw_lines = [l for l in text.split("\n")]
    lines: list[tuple[str, ImageFont.FreeTypeFont]] = []
    max_w = int(W * 0.92)

    def _line_w(ln: str) -> int:
        if not ln:
            return 0
        if tracking <= 0:
            return font.getbbox(ln)[2] - font.getbbox(ln)[0]
        return sum(_char_w(ch) for ch in ln)

    def _char_w(ch: str) -> int:
        w = font.getbbox(ch)[2] - font.getbbox(ch)[0]
        return int(w + tracking)

    for rl in raw_lines:
        if _line_w(rl) <= max_w:
            lines.append(rl)
            continue
        words = rl.split(" ")
        cur = ""
        for w in words:
            trial = (cur + " " + w).strip()
            if _line_w(trial) > max_w and cur:
                lines.append(cur)
                cur = w
            else:
                cur = trial
        if cur:
            lines.append(cur)

    # --- measure block ---
    asc, desc = font.getmetrics()
    line_h = int(size * lh)
    block_h = line_h * len(lines)

    head_cfg = settings["composition"]
    zone_top = layout.headline_y
    zone_bot = zone_top + max(layout.headline_zone_h, block_h)
    y = zone_top + int(H * head.get("offsetY", 0.0) / 100.0)
    y = max(layout.top_safe, min(y, zone_bot - block_h))  # stays in its region
    x_shift = int(W * head.get("offsetX", 0.0) / 100.0)

    # --- render each line onto a patch, then paste ---
    for line in lines:
        lw = _line_w(line)
        if align == "center":
            x = (W - lw) // 2 + x_shift
        elif align == "left":
            x = int(W * 0.04) + x_shift
        else:  # right
            x = W - lw - int(W * 0.04) + x_shift
        x = max(int(W * 0.02), min(x, W - lw - int(W * 0.02)))

        patch_w, patch_h = lw + stroke_w * 2 + 8, line_h + int(size * 0.34) + 8
        patch = Image.new("RGBA", (patch_w, patch_h), (0, 0, 0, 0))
        pd = ImageDraw.Draw(patch)

        text_y = (patch_h - (asc + desc)) // 2

        if bg.get("enabled"):
            pad = int(float(bg.get("padding", 18)) * s)
            pad_y = pad // 2
            pd.rectangle(
                [0, patch_h // 2 - line_h // 2 - pad_y, patch_w, patch_h // 2 + line_h // 2 + pad_y],
                fill=_hex_to_rgba(bg.get("color", "#C6FF36")),
            )

        if shadow.get("enabled"):
            sh_layer = Image.new("RGBA", (patch_w, patch_h), (0, 0, 0, 0))
            shd = ImageDraw.Draw(sh_layer)
            _draw_tracked_text(shd, sh_layer, font, line, (stroke_w + 2, text_y + int(float(shadow.get("offset", 4)) * s)),
                               (10, 10, 10, int(255 * float(shadow.get("opacity", 0.55)))),
                               tracking, italic, patch_w)
            sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(float(shadow.get("blur", 6)) * s * 0.5))
            patch = Image.alpha_composite(patch, sh_layer)
            pd = ImageDraw.Draw(patch)

        if stroke_w > 0:
            pd.text((stroke_w, text_y + 1), line, font=font, fill=stroke_c,
                    stroke_width=stroke_w - 1 if stroke_w > 1 else 1,
                    stroke_fill=stroke_c)
        _draw_tracked_text(pd, patch, font, line, (stroke_w, text_y), color, tracking, italic, patch_w)

        img.alpha_composite(patch, (max(0, x - stroke_w), max(0, y)))
        y += line_h

    out_png.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_png)


def _draw_tracked_text(draw: ImageDraw.ImageDraw, canvas: Image.Image,
                       font, line: str, pos: tuple, fill: tuple,
                       tracking: float, italic: bool, patch_w: int) -> None:
    if tracking > 0:
        x, ty = pos
        for ch in line:
            draw.text((x, ty), ch, font=font, fill=fill)
            cw = font.getbbox(ch)[2] - font.getbbox(ch)[0]
            x += cw + tracking
            if x > patch_w:
                break
    else:
        draw.text(pos, line, font=font, fill=fill)
    if italic:
        _shear_top(canvas, shear=-0.18)


def _shear_top(img: Image.Image, shear: float = -0.18) -> None:
    """Fake italic: horizontal shear proportional to row distance from bottom."""
    w, h = img.size
    data = img.transform(
        (w, h), Image.Transform.AFFINE,
        (1, shear, -shear * h, 0, 1, 0),
        resample=Image.Resampling.BILINEAR,
    )
    img.paste(data, (0, 0), data)


def prepare_logo_png(settings: Dict[str, Any], layout: Layout, out_png) -> Optional[tuple]:
    """Resize / rotate / de-opacify the logo into a clean RGBA overlay file.

    Returns (x, y) overlay position on the canvas, or None when disabled."""
    out_png = Path(out_png)
    logo = settings["logo"]
    if not (logo.get("enabled") and logo.get("path")):
        return None
    src = Path(logo["path"])
    if not src.exists():
        return None

    img = Image.open(src).convert("RGBA")
    target_w = max(2, int(layout.W * float(logo.get("widthPct", 33)) / 100.0))
    w, h = img.size
    box_w = layout.logo_w
    box_h = round(box_w * h / w) or 1
    img = img.resize((box_w, box_h), Image.Resampling.LANCZOS)

    opacity = max(0.0, min(1.0, float(logo.get("opacity", 1.0))))
    if opacity < 1.0:
        a = img.getchannel("A").point(lambda v: int(v * opacity))
        img.putalpha(a)

    rot = float(logo.get("rotation", 0.0)) % 360.0
    if rot:
        img = img.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)

    out_png.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_png)
    layout.logo_h = img.size[1]
    return (layout.logo_x, layout.logo_y)
