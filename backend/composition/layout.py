"""Composition layout math — single source of truth for the vertical 9:16 zones.

The frontend preview (frontend/src/editor/layout.ts) mirrors these exact numbers.
All fractions are relative to canvas height (1920 at 1080 width).
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

# Default project settings. Stored per-project in SQLite, edited at runtime.
DEFAULT_SETTINGS: Dict[str, Any] = {
    "trimStart": 0.0,
    "trimEnd": None,                      # None = full source duration
    "composition": {
        "topSafePct": 24.5,                # Zone A: black safe area for platform UI
        "bottomSafePct": 18.0,             # bottom safe area
        "headlineZonePct": 7.8,            # Zone B height
        "footageGapPct": 0.9,              # gap headline -> footage
        "logoGapPct": 3.4,                 # gap footage -> logo (Zone E)
    },
    "headline": {
        "enabled": True,
        "text": "YOUR HEADLINE HERE\nSECOND LINE",
        "fontFamily": "Archivo Black",
        "fontWeight": "bold",
        "size": 74,                        # px at 1080 canvas width
        "lineHeight": 1.08,
        "letterSpacing": 0.0,              # px at 1080 canvas width
        "italic": False,
        "align": "center",
        "color": "#FFFFFF",
        "stroke": {"enabled": False, "width": 3, "color": "#111111"},
        "shadow": {"enabled": True, "blur": 6, "offset": 4, "opacity": 0.55},
        "background": {"enabled": False, "color": "#C6FF36", "padding": 18},
        "offsetX": 0.0,                    # percent of canvas width
        "offsetY": 0.0,                    # percent of canvas height (within zone)
    },
    "footage": {
        "scale": 1.0,                      # 1.0 = fit canvas width
        "offsetX": 0.0,                    # percent of canvas width
        "offsetY": 0.0,                    # percent of canvas height
        "crop": {"left": 0.0, "right": 0.0, "top": 0.0, "bottom": 0.0},  # percent
        "brightness": 0.0,                 # -1..1
        "saturation": 1.0,                 # 0..3 (1 = neutral)
    },
    "subtitles": {
        "enabled": True,
        "mode": "phrase",                  # phrase | word | karaoke
        "fontFamily": "Space Grotesk",
        "size": 46,                        # px at 1080 canvas width
        "color": "#FFFFFF",
        "outlineWidth": 4,
        "outlineColor": "#111111",
        "shadow": True,
        "highlightKeywords": "",           # comma separated
        "highlightColor": "#C6FF36",
        "lineSpacing": 1.5,
        "marginPct": 2.0,                  # horizontal margin, % of canvas width
        "bottomGapPct": 1.8,               # gap above footage bottom edge (as % of H)
        "uppercase": False,
    },
    "logo": {
        "enabled": True,
        "path": None,                      # absolute path to uploaded image
        "widthPct": 33.0,                  # % of canvas width
        "opacity": 1.0,
        "offsetX": 0.0,                    # percent of canvas width
        "offsetY": 0.0,                    # percent of canvas height
        "rotation": 0.0,                   # degrees
    },
    "audio": {
        "volume": 1.0,
        "fadeIn": 0.0,
        "fadeOut": 0.0,
    },
    "effects": {
        "version": 1,
        "adjustments": {
            "brightness": 0,
            "contrast": 100,
            "saturation": 100,
            "temperature": 0,
            "tint": 0,
            "sharpen": 0,
            "blur": 0,
            "vignette": 0,
        },
        "motion": [],
        "visual_effects": [],
        "transitions": {
            "fade_in": 0.0,
            "fade_out": 0.0,
            "zoom_in": 0.0,
            "zoom_out": 0.0,
            "blur_in": 0.0,
            "flash_in": 0.0,
        },
    },
    "ai_director": {
        "mode": "viral",
        "enabled_actions": {
            "dynamic_zoom": True,
            "punch_zoom": True,
            "smooth_camera": True,
            "subtitle_emphasis": True,
            "audio_aware": True,
            "smart_visual": True,
            "silence_removal": False,
            "speed_changes": False,
        },
        "editing_plan": None,
    },
    "export": {
        "width": 1080,                     # 1080 or 720
        "fps": None,                       # None = source fps
        "crf": 22,
        "preset": "veryfast",
    },
}


def merge_settings(stored: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Deep-merge stored settings over defaults so old projects keep working."""
    base = copy.deepcopy(DEFAULT_SETTINGS)
    if not stored:
        return base
    _merge(base, stored)
    return base


def _merge(base: Dict[str, Any], override: Dict[str, Any]) -> None:
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v


def even(n: float) -> int:
    v = int(round(n))
    return v - (v % 2)


class Layout:
    """Computed zone geometry for one render/preview."""

    def __init__(self, canvas_w: int, settings: Dict[str, Any], src_w: int, src_h: int):
        self.W = canvas_w
        self.H = even(canvas_w * 16 / 9)
        self.s = canvas_w / 1080.0
        self.src_w = src_w
        self.src_h = src_h
        comp = settings["composition"]

        self.top_safe = round(self.H * comp["topSafePct"] / 100.0)
        self.bottom_safe = round(self.H * comp["bottomSafePct"] / 100.0)
        self.bottom_safe_top = self.H - self.bottom_safe

        head = settings["headline"]
        self.headline_zone_h = round(self.H * comp["headlineZonePct"] / 100.0)
        self.headline_y = round(self.top_safe + self.H * 0.006)
        self.headline_enabled = bool(head.get("enabled", False))

        footage_top_gap = round(self.H * comp["footageGapPct"] / 100.0)
        if not self.headline_enabled:
            # headline zone collapses; footage moves up naturally
            self.headline_zone_h = 0
            self.headline_y = self.top_safe
            footage_top_gap = round(self.H * 0.8 / 100)

        # Zone C: footage crop box -> scaled size (never stretched)
        crop = settings["footage"]["crop"]
        cw = src_w * (1 - crop["left"] / 100.0 - crop["right"] / 100.0)
        ch = src_h * (1 - crop["top"] / 100.0 - crop["bottom"] / 100.0)
        cw = max(2.0, cw)
        ch = max(2.0, ch)
        scale = max(0.05, float(settings["footage"].get("scale", 1.0)))
        self.footage_scaled_w = even(self.W * scale)
        self.footage_scaled_h = even(self.footage_scaled_w * ch / cw)

        self.footage_y = self.headline_y + self.headline_zone_h + footage_top_gap
        self.footage_x = even((self.W - self.footage_scaled_w) / 2
                              + self.W * settings["footage"].get("offsetX", 0.0) / 100.0)
        self.footage_y += round(self.H * settings["footage"].get("offsetY", 0.0) / 100.0)
        self.footage_bottom = self.footage_y + self.footage_scaled_h

        # Zone E: logo under footage
        logo = settings["logo"]
        self.logo_h_zone = round(self.H * 0.088)
        self.logo_gap = round(self.H * comp["logoGapPct"] / 100.0)
        self.logo_enabled = bool(logo.get("enabled", False)) and bool(logo.get("path"))
        if self.logo_enabled:
            self.logo_w = even(self.W * logo.get("widthPct", 33.0) / 100.0)
            self.logo_y = round(self.footage_bottom + self.logo_gap
                                + self.H * logo.get("offsetY", 0.0) / 100.0)
            self.logo_x = even((self.W - self.logo_w) / 2
                               + self.W * logo.get("offsetX", 0.0) / 100.0)
        else:
            self.logo_w = 0
            self.logo_x = even(self.W / 2)
            self.logo_y = self.footage_bottom + self.logo_gap

        # Zone D: subtitles live inside the footage area, low. ASS alignment=2 is
        # canvas-relative, so marginV must be measured from the CANVAS bottom.
        subs = settings["subtitles"]
        self.subtitle_inset_h = round(self.W * subs.get("marginPct", 2.0) / 100.0)
        self.subtitle_inset_v = round(self.footage_scaled_h * subs.get("bottomGapPct", 1.8) / 100.0)
        self.subtitle_margin_h = max(8, (self.W - self.footage_scaled_w) // 2 + self.subtitle_inset_h)
        self.subtitle_margin_v = max(0, round(self.H - self.footage_bottom)) + self.subtitle_inset_v


def safe_names(settings: Dict[str, Any]) -> List[str]:
    return ["topSafePct", "bottomSafePct", "headlineZonePct", "footageGapPct", "logoGapPct"]
