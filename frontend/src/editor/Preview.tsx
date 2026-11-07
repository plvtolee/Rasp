import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Pause, Play } from 'lucide-react'
import { PreviewLayout, computeLayout, px } from './layout'
import { Settings, Transcript, TranscriptSegment } from '../types'

interface Props {
  settings: Settings
  transcript: Transcript | null
  videoPath: string | null
  srcW: number
  duration?: number
  showSafe?: boolean
  onTime?: (t: number) => void
  refreshKey?: number
}

function fontStyleCSS(settings: Settings, l: PreviewLayout) {
  const head = settings.headline
  const s = l.scale
  return {
    fontFamily: `"${head.fontFamily}", Impact, sans-serif`,
    fontSize: px(l, head.size),
    lineHeight: head.lineHeight,
    letterSpacing: px(l, head.letterSpacing),
    color: head.color,
    textAlign: head.align as any,
    fontStyle: head.italic ? 'italic' : 'normal',
    WebkitTextStrokeWidth: head.stroke.enabled ? px(l, head.stroke.width * 0.5) : 0,
    WebkitTextStrokeColor: head.stroke.color,
    textShadow: head.shadow.enabled
      ? `${px(l, head.shadow.offset)}px ${px(l, head.shadow.offset)}px ${px(l, head.shadow.blur)}px rgba(0,0,0,${head.shadow.opacity})`
      : undefined,
    background: head.background.enabled ? head.background.color : undefined,
    padding: head.background.enabled ? px(l, head.background.padding / 2) : undefined,
    fontWeight: 900 as const,
    whiteSpace: 'pre-wrap' as any,
    textTransform: 'uppercase' as any,
  }
}

function subsStyle(settings: Settings, l: PreviewLayout): React.CSSProperties {
  const sub = settings.subtitles
  const s = l.scale
  return {
    fontFamily: `"${sub.fontFamily}", ui-sans-serif, sans-serif`,
    fontSize: px(l, sub.size),
    lineHeight: 1.25,
    letterSpacing: px(l, (sub.lineSpacing - 1.5) * 1.2),
    color: sub.color,
    fontWeight: 700 as const,
    textAlign: 'center' as any,
    WebkitTextStrokeWidth: px(l, sub.outlineWidth * 0.5),
    WebkitTextStrokeColor: sub.outlineColor,
    textShadow: sub.shadow
      ? `${px(l, 2)}px ${px(l, 2)}px ${px(l, 3)}px rgba(0,0,0,0.65)`
      : undefined,
    textTransform: sub.uppercase ? 'uppercase' as any : 'none',
  }
}

export default function Preview({ settings, transcript, videoPath, srcW, duration = 0, showSafe = true, onTime, refreshKey }: Props) {
  const [width, setWidth] = useState(340)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [muted, setMuted] = useState(true)

  const trimStart = settings.trimStart || 0
  const trimEnd = settings.trimEnd ?? null

  // measure available width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(160, Math.min(480, e.contentRect.width))
        setWidth(Math.floor(w))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const l = useMemo(
    () => computeLayout(settings, srcW, Math.round(srcW * 9 / 16), width),
    [settings, srcW, width],
  )

  const seekMax = (settings.trimEnd ?? duration) || 0

  // loop inside trim window
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTimeUpdate = () => {
      let t = v.currentTime
      const end = settings.trimEnd ?? null
      if (end != null && t >= end) {
        t = settings.trimStart || 0
        v.currentTime = t
      }
      if (t < (settings.trimStart || 0) - 0.2) {
        v.currentTime = settings.trimStart || 0
        t = settings.trimStart || 0
      }
      setTime(t)
      onTime?.(t)
    }
    v.addEventListener('timeupdate', onTimeUpdate)
    return () => v.removeEventListener('timeupdate', onTimeUpdate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.trimStart, settings.trimEnd, onTime])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < (settings.trimStart || 0) || ((settings.trimEnd ?? null) != null && v.currentTime >= (settings.trimEnd as number))) {
        v.currentTime = settings.trimStart || 0
      }
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const segments = transcript?.segments ?? []
  const activeSegment: TranscriptSegment | null = useMemo(() => {
    const t = time
    for (const s of segments) {
      if (t >= s.start && t < s.end + 0.12) return s
    }
    return null
  }, [segments, time])

  /* ---- subtitle rendering per caption mode ---- */
  const subtitleContent = useMemo(() => {
    if (!settings.subtitles.enabled) return null
    const seg = activeSegment
    if (!seg) return null
    if (settings.subtitles.mode === 'word' && seg.words?.length) {
      const lower = time
      let cur = null as { word: string; start: number; end: number } | null
      for (const w of seg.words) {
        if (lower >= w.start && lower < w.end) { cur = w; break }
        if (lower >= w.end) cur = w
      }
      return cur ? <span>{settings.subtitles.uppercase ? cur.word.toUpperCase() : cur.word}</span> : null
    }
    if (settings.subtitles.mode === 'karaoke' && seg.words?.length) {
      return seg.words.map((w, i) => (
        <span key={i} style={w.start <= time + 0.02 ? { color: settings.subtitles.highlightColor } : undefined}>
          {w.word}{' '}
        </span>
      ))
    }
    // phrase with keyword highlight
    const keywords = settings.subtitles.highlightKeywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
    if (!keywords.length) return <span>{settings.subtitles.uppercase ? seg.text.toUpperCase() : seg.text}</span>
    return seg.text.split(' ').map((word, i) => {
      const isHi = keywords.includes(word.replace(/[.,!?;:'"]/g, '').toLowerCase())
      return (
        <span key={i} style={isHi ? { color: settings.subtitles.highlightColor } : undefined}>
          {word}{' '}
        </span>
      )
    })
  }, [activeSegment, time, settings.subtitles])

  const headCSS = fontStyleCSS(settings, l)

  return (
    <div ref={containerRef} className="flex w-full min-w-0 flex-col items-center gap-2">
      <div
        className="relative overflow-hidden border-2 border-ink bg-black shadow-brutal-lg"
        style={{ width, height: Math.floor(width * 16 / 9) }}
      >
        {/* ZONE A: top safe */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: px(l, l.topSafe), background: '#000' }} />

        {/* ZONE B: headline */}
        {settings.headline.enabled && (
          <div
            style={{
              position: 'absolute',
              top: px(l, l.headlineY),
              left: px(l, l.footageX),
              width: width - px(l, l.footageX),
              height: px(l, l.headlineZoneH) || 'auto',
              maxHeight: px(l, l.headlineZoneH) || undefined,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                ...headCSS,
                position: 'relative',
                width: '100%',
                transform: `translateY(${px(l, settings.headline.offsetY * 1.92)}px) translateX(${px(l, settings.headline.offsetX)}px)`,
              }}
            >
              {settings.headline.text}
            </div>
          </div>
        )}

        {/* ZONE C: footage */}
        <video
          key={videoPath || 'novideo'}
          ref={videoRef}
          src={videoPath ? `/api/media/stream?path=${encodeURIComponent(videoPath)}` : undefined}
          muted={muted}
          playsInline
          onClick={togglePlay}
          style={{
            position: 'absolute',
            left: px(l, l.footageX),
            top: px(l, l.footageY),
            width: px(l, l.footageW),
            height: px(l, l.footageH),
            objectFit: 'contain',
            background: '#000',
            cursor: 'pointer',
            filter: `brightness(${1 + settings.footage.brightness}) saturate(${settings.footage.saturation})`,
          }}
        />

        {/* ZONE D: subtitles */}
        {settings.subtitles.enabled && (
          <div
            style={{
              position: 'absolute',
              left: px(l, l.footageX),
              top: px(l, l.footageY),
              width: px(l, l.footageW),
              height: px(l, l.footageH),
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: `0 ${px(l, l.subtitleMH)}px 0 ${px(l, l.subtitleMH)}px`,
              paddingBottom: px(l, l.subtitleMV),
              pointerEvents: 'none',
            }}
          >
            <div style={{ ...subsStyle(settings, l), maxHeight: '100%', overflow: 'hidden' }}>{subtitleContent}</div>
          </div>
        )}

        {/* ZONE E: logo */}
        {settings.logo.enabled && settings.logo.path && (
          <img
            src={`/api/media/image?path=${encodeURIComponent(settings.logo.path)}`}
            alt="logo"
            style={{
              position: 'absolute',
              left: px(l, l.logoX),
              top: px(l, l.logoY),
              width: px(l, l.logoW),
              opacity: settings.logo.opacity,
              transform: `rotate(${settings.logo.rotation}deg)`,
            }}
          />
        )}

        {/* bottom safe area */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: px(l, l.H - l.bottomSafeTop), background: '#000', zIndex: 5 }} />

        {/* safe-area guide */}
        {showSafe && (
          <>
            <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-tang/70" style={{ top: px(l, l.topSafe) }}>
              <span className="absolute right-1 -top-4 bg-tang px-1 font-mono text-[8px] font-bold text-ink">SAFE TOP</span>
            </div>
            <div className="pointer-events-none absolute inset-x-0 border-b-2 border-dashed border-tang/70" style={{ top: px(l, l.bottomSafeTop) }}>
              <span className="absolute right-1 -bottom-4 bg-tang px-1 font-mono text-[8px] font-bold text-ink">SAFE BOTTOM</span>
            </div>
            <div className="pointer-events-none absolute inset-y-0 w-6 border-x-2 border-dashed border-tang/50" style={{ right: 0 }} />
          </>
        )}

        {/* fullscreen */}
        <button
          className="absolute right-2 top-2 z-10 border-2 border-ink bg-card p-1 shadow-brutal-sm"
          onClick={() => containerRef.current?.requestFullscreen?.()}
          title="Fullscreen preview"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* playback controls */}
      <div className="panel-flat w-full max-w-[560px] px-3 py-2">
        <div className="flex items-center gap-2">
          <button className="btn btn-lime !px-4" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
          </button>
          <input
            type="range"
            min={trimStart}
            max={Math.max(seekMax, trimStart + 0.1)}
            step={0.02}
            value={Math.min(Math.max(time, trimStart), seekMax || trimStart)}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (videoRef.current) videoRef.current.currentTime = v
              setTime(v)
            }}
            className="flex-1"
          />
          <span className="min-w-[92px] text-right font-mono text-[12px] font-bold">
            {fmt(time)} <span className="text-ink/40">/ {fmt(seekMax)}</span>
          </span>
          <button className="btn btn-xs" onClick={() => setMuted((m) => !m)} title="Audio preview">
            {muted ? 'MUTED' : 'SOUND'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function fmt(t: number): string {
  if (!isFinite(t)) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
