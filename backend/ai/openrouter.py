"""Optional AI helpers via OpenRouter. Everything degrades gracefully without a key."""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional

import httpx


def api_key() -> Optional[str]:
    return os.environ.get("OPENROUTER_API_KEY") or None


def model() -> str:
    return os.environ.get("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")


def ai_available() -> bool:
    return bool(api_key())


def suggest_headline(transcript_text: str, paragraphs: int = 3) -> Dict[str, Any]:
    """Returns {'headline': str, 'source': 'ai'|'heuristic', ...}

    No key (or network failure) -> deterministic heuristic picked from the
    transcript itself. The app must keep working either way (TEST 13).
    """
    src = " ".join((transcript_text or "").split())[:4000]
    if not src.strip():
        return {"headline": "YOUR HEADLINE HERE", "source": "empty-transcript", "options": []}

    if ai_available():
        prompt = (
            "You write punchy vertical-video headlines. Respond with ONLY one headline, "
            "max 9 words, no quotes, no emojis. It is displayed in huge bold type above "
            "landscape footage. Frequency: energetic but not cringe.\n\n"
            f"Transcript excerpt:\n\"{src[:2200]}\""
        )
        try:
            resp = httpx.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key()}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model(),
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 40,
                    "temperature": 0.8,
                },
                timeout=25,
            )
            if resp.status_code == 200:
                data = resp.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
                text = text.strip().strip('"').strip()
                if text:
                    return {"headline": clean(text), "source": "ai"}
        except (httpx.HTTPError, ValueError, KeyError):
            pass  # fall through to the heuristic

    return {"headline": heuristic_headline(src), "source": "heuristic", "options": heuristics(src, 3)}


def suggest_segments(segments: List[Dict[str, Any]], max_take: float = 60.0) -> List[Dict[str, Any]]:
    """Highlight-selection WITHOUT any model: rank contiguous windows of transcript
    segments by an interest score (numbers, superlatives, questions, density).

    Works offline and is honest about being a heuristic."""
    if not segments:
        return []
    hooks = ["?", "!", "never", "best", "worst", "insane", "crazy", "secret", "mistake",
             "million", "thousand", "billion", "must", "actually", "why", "how", "top",
             "revealed", "trick", "hack", "money", "free", "problem", "fix", "number",
             "%", "$", "1st", "2nd", "3rd"]
    scored: List[Dict[str, Any]] = []
    n = len(segments)
    span = max(1, min(n, 6))
    for i in range(max(1, n - span)):
        window = segments[i: min(i + span, n)]
        text = " ".join(s["text"] for s in window).lower()
        dur = float(window[-1]["end"]) - float(window[0]["start"])
        if dur > max_take:
            continue
        score = sum(text.count(h) for h in hooks)
        score += 2 if any(s["start"] < 6.0 for s in window) else 0  # strong openers
        score += round(len(text) / max(12.0, dur) / 2.5, 1)          # speech density
        scored.append({
            "start": round(float(window[0]["start"]), 2),
            "end": round(float(window[-1]["end"]), 2),
            "text": " ".join(s["text"] for s in window)[:120],
            "score": round(score, 2),
        })
    scored.sort(key=lambda x: -x["score"])
    deduped: List[Dict[str, Any]] = []
    for s in scored:
        if all(abs(s["start"] - d["start"]) > 4.0 for d in deduped[:8]):
            deduped.append(s)
        if len(deduped) >= 8:
            break
    return deduped


STOP = set("the a an and or but if then that this these those is are was were be been to of in on for with at by from as it its i we you they he she not do does did so my our your".split())


def heuristic_headline(src: str) -> str:
    for cand in heuristics(src, 1):
        return cand
    return "YOUR HEADLINE HERE"


def heuristics(src: str, k: int) -> List[str]:
    """Pick the most 'headline-worthy' sentences from the transcript itself."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", src) if len(s.split()) >= 4]
    if not sentences and src.strip():
        return [src.strip()[:60].upper()]
    scored = []
    for s in sentences[:60]:
        words = [w for w in re.findall(r"[a-z0-9$%']+", s.lower()) if w not in STOP]
        uniq_ratio = len(set(words)) / max(1, len(words))
        score = uniq_ratio * 2 + sum(2 for c in "?!$%" if c in s)
        score += 3 if s.lower().startswith(("how", "why", "top", "never", "the secret")) else 0
        mod = abs(len(words) - 6.5)
        score += max(0.0, 2.0 - mod * 0.35)
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    out = []
    for _, s in scored[:k]:
        out.append(clean(s))
    return out


def clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[-–—:\s]+", "", text)
    return text[:80]
