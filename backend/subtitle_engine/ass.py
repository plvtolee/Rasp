"""ASS subtitle generation for the vertical composition.

Subtitles are burned across the full 1080x1920 canvas (PlayRes canvas == export
canvas) and positioned INSIDE the landscape footage band, near its bottom edge,
so they never cover the headline, logo, or safe areas.
"""
from __future__ import annotations

from typing import Any, Dict, List

from backend.composition.layout import Layout


def _ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    cs = int(round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_color(hex_color: str, alpha: int = 0) -> str:
    """#RRGGBB -> &HAABBGGRR (ASS uses BGR + alpha)."""
    h = (hex_color or "#FFFFFF").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r, g, b = 255, 255, 255
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


_FONT_FILES = {
    "archivo black": "ArchivoBlack-Regular.ttf",
    "space grotesk": "SpaceGrotesk-Medium.ttf",
    "ibm plex mono": "IBMPlexMono-Regular.ttf",
}

_STYLE_FONT = {
    "Archivo Black": "Archivo Black",
    "Space Grotesk": "Space Grotesk",
    "IBM Plex Mono": "IBM Plex Mono",
}


def build_ass(segments: List[Dict[str, Any]], settings: Dict[str, Any],
              layout: Layout) -> str:
    subs = settings["subtitles"]
    if not subs.get("enabled", True):
        return ""

    s = layout.s
    size = max(8, int(subs.get("size", 46) * s))
    spacing = max(0, round(float(subs.get("lineSpacing", 1.5)) * s * 2) / 2)
    outline = max(0.0, float(subs.get("outlineWidth", 4)) * s)
    shadow = 3 * s if subs.get("shadow", True) else 0
    margin_v = layout.subtitle_margin_v
    margin_h = layout.subtitle_margin_h
    base_color = _ass_color(subs.get("color", "#FFFFFF"))
    outline_color = _ass_color(subs.get("outlineColor", "#111111"))
    back_color = _ass_color("#000000", alpha=0x60 if subs.get("shadow", True) else 0xB4)
    uppercase = bool(subs.get("uppercase", False))

    style_name = _STYLE_FONT.get(subs.get("fontFamily", "Space Grotesk"), "") \
        or fallback_font_name(subs.get("fontFamily", ""))

    mode_first = subs.get("mode", "phrase")
    # In karaoke mode the \k flip uses SecondaryColour -> PrimaryColour:
    # words start in the base colour and fill with the highlight colour.
    primary = _ass_color(subs.get("highlightColor", "#C6FF36")) if mode_first == "karaoke" else base_color
    secondary = base_color if mode_first == "karaoke" else _ass_color(subs.get("highlightColor", "#C6FF36"))

    header = f"""[Script Info]
Title: Rasp subtitles
ScriptType: v4.00+
PlayResX: {layout.W}
PlayResY: {layout.H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Rasp,{style_name},{size},{primary},{secondary},{outline_color},{back_color},-1,0,0,0,100,100,{spacing},0,1,{outline},{shadow},2,{margin_h},{margin_h},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: List[str] = []
    mode = subs.get("mode", "phrase")
    keywords = [k.strip().lower() for k in str(subs.get("highlightKeywords", "")).split(",") if k.strip()]
    hi_color = _ass_color(subs.get("highlightColor", "#C6FF36"))

    def _fmt_text(text: str) -> str:
        return (text.upper() if uppercase else text).replace("\n", "\\N")

    for seg in segments:
        text = seg.get("text", "").strip()
        start, end = float(seg.get("start", 0)), float(seg.get("end", 0))
        words: List[Dict[str, Any]] = seg.get("words") or []
        if mode == "karaoke":
            keywords = []  # karaoke \k handles the sweep coloring itself

        def _maybe_highlight(word: str) -> str:
            if keywords and word.strip(".,!?;:'\"").lower() in keywords:
                return "{\\1c" + hi_color + "}" + word + "{\\1c" + base_color + "}"
            return word

        if mode == "word" and words:
            for w in words:
                w_start = float(w["start"])
                w_end = float(w["end"])
                events.append(
                    f"Dialogue: 0,{_ts(w_start)},{_ts(w_end)},Rasp,,0,0,0,,"
                    f"{{\\fad(20,0)}}{_maybe_highlight(w['word'].upper() if uppercase else w['word'])}"
                )
        elif mode == "karaoke" and words and not seg.get("wordsApprox", False):
            parts = []
            for i, w in enumerate(words):
                if i > 0:
                    gap = max(0.0, float(w["start"]) - float(words[i - 1]["end"]))
                    if gap > 0.01:
                        parts.append(f"{{\\k{max(1, round(gap * 100))}}} ")
                dur_cs = max(1, round((float(w["end"]) - float(w["start"])) * 100))
                parts.append(f"{{\\k{dur_cs}}}{_fmt_text(w['word'])}")
                if i < len(words) - 1:
                    parts.append(" ")
            events.append(
                f"Dialogue: 0,{_ts(start)},{_ts(end)},Rasp,,0,0,0,,{''.join(parts)}"
            )
        else:
            events.append(
                f"Dialogue: 0,{_ts(start)},{_ts(end)},Rasp,,0,0,0,,{escape_ass(_fmt_text(text), keywords, hi_color, base_color)}"
            )

    return header + "\n".join(events) + "\n"


def escape_ass(text: str, keywords: List[str], hi_color: str, base_color: str) -> str:
    """Brace-escape AND apply keyword highlighting inline."""
    safe = text.replace("{", "(").replace("}", ")")
    if not keywords:
        return safe
    out = []
    for word in safe.split(" "):
        if word.strip(".,!?;:'\"").lower() in keywords:
            out.append("{\\1c" + hi_color + "}" + word + "{\\1c" + base_color + "}")
        else:
            out.append(word)
    return " ".join(out)


def fallback_font_name(family: str) -> str:
    """Resolve a font family name for libass from our bundled fonts directory."""
    stem = _FONT_FILES.get(family.lower().strip())
    if stem:
        return stem.rsplit(".", 1)[0]
    return family or "Arial"
