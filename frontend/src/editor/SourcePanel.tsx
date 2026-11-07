import { useState } from 'react'
import { CalendarClock, Clock, Crop, Film, Scissors, Wand2 } from 'lucide-react'
import { api } from '../services/api'
import { MonoStat, Panel } from '../components/ui'
import { useToast } from '../components/Toasts'
import { MediaMeta, Project, Settings, SuggestedSegment } from '../types'
import { fmt } from './Preview'

interface Props {
  project: Project
  meta: MediaMeta | null
  mutate: (patch: any) => void
  currentTime: number
  reload: () => void
}

function parseTs(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const parts = s.split(':').map(parseFloat)
  if (parts.some((p) => isNaN(p))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function tsStr(t: number) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

export default function SourcePanel({ project, meta, mutate, currentTime, reload }: Props) {
  const toast = useToast()
  const s = project.settings
  const dur = meta?.duration || 0
  const trimStart = s.trimStart || 0
  const trimEnd = s.trimEnd ?? dur
  const [suggestions, setSuggestions] = useState<SuggestedSegment[] | null>(null)
  const [loadingSug, setLoadingSug] = useState(false)

  const setTrim = (start: number, end: number | null) => {
    const st = Math.max(0, Math.min(start, dur))
    const en = end == null ? null : Math.max(st + 0.2, Math.min(end, dur))
    mutate({ trimStart: Math.round(st * 100) / 100, trimEnd: en == null ? null : Math.round(en * 100) / 100 })
  }

  const suggest = async () => {
    setLoadingSug(true)
    try {
      const r = await api.post<{ segments: SuggestedSegment[] }>(`/api/ai/projects/${project.id}/suggest-segments`)
      setSuggestions(r.segments)
      if (!r.segments.length) toast('info', 'No suggestions', 'No transcript yet — transcribe first')
    } catch (e: any) {
      toast('error', 'Suggestion failed', e.message)
    } finally {
      setLoadingSug(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel label="SOURCE" accent="cobalt" right={<span className="chip">FIXED 9:16</span>}>
        <div className="mb-2 flex items-start gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center border-2 border-ink bg-cobalt text-white">
            <Film size={17} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold leading-tight">{project.name}</div>
            <div className="mt-0.5 truncate font-mono text-[10px] lowercase text-ink/50">
              {project.source_path?.split(/[\\/]/).pop() || 'no file'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MonoStat k="RES" v={meta ? `${meta.width}×${meta.height}` : '—'} />
          <MonoStat k="FPS" v={meta?.fps ? `${meta.fps}` : '—'} />
          <MonoStat k="DURATION" v={meta ? fmt(meta.duration) : '—'} />
          <MonoStat k="AUDIO" v={meta ? (meta.hasAudio ? meta.audioCodec || 'yes' : 'NONE') : '—'} accent={meta && !meta.hasAudio ? 'tang' : undefined} />
          <MonoStat k="CODEC" v={meta?.codec || '—'} />
          <MonoStat k="SIZE" v={meta ? `${(meta.sizeBytes / 1048576).toFixed(1)} MB` : '—'} />
        </div>
        {meta && !meta.hasAudio && (
          <p className="mt-2 border-2 border-ink bg-acid px-2 py-1 font-mono text-[10px] lowercase leading-snug">
            no audio track — subtitles unavailable; export still works.
          </p>
        )}
      </Panel>

      <Panel label="CLIP RANGE" accent="tang" right={<Scissors size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label mb-1 block">START</span>
            <input
              className="field field-mono w-full"
              defaultValue={tsStr(trimStart)}
              key={`st-${trimStart}`}
              onBlur={(e) => {
                const v = parseTs(e.target.value)
                if (v != null) setTrim(v, trimEnd)
                else e.target.value = tsStr(trimStart)
              }}
            />
          </label>
          <label className="block">
            <span className="label mb-1 block">END</span>
            <input
              className="field field-mono w-full"
              defaultValue={trimEnd ? tsStr(trimEnd) : ''}
              key={`en-${trimEnd}`}
              onBlur={(e) => {
                const v = parseTs(e.target.value)
                setTrim(trimStart, v)
              }}
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn btn-xs" onClick={() => setTrim(currentTime, trimEnd)}>
            <CalendarClock size={11} /> START = PLAYHEAD
          </button>
          <button className="btn btn-xs" onClick={() => setTrim(trimStart, currentTime)}>
            <CalendarClock size={11} /> END = PLAYHEAD
          </button>
          <button className="btn btn-xs" onClick={() => setTrim(0, null)}>
            FULL LENGTH
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between border-t-2 border-ink/10 pt-2 font-mono text-[10px] lowercase text-ink/60">
          <span>selected</span>
          <span className="font-bold text-ink">
            {fmt(trimStart)} — {fmt(trimEnd || dur)} · {(Math.max(0.2, (trimEnd || dur) - trimStart)).toFixed(1)}s
          </span>
        </div>
      </Panel>

      <Panel
        label="RANGE FINDER"
        accent="acid"
        right={
          <button className="btn btn-xs" onClick={suggest} disabled={loadingSug}>
            <Wand2 size={11} /> {loadingSug ? '…' : 'SUGGEST'}
          </button>
        }
      >
        <p className="mb-2 font-mono text-[10px] lowercase leading-relaxed text-ink/45">
          offline heuristic on transcript hook-words &amp; speech density. no API needed.
        </p>
        {suggestions === null && (
          <div className="border-2 border-dashed border-ink/25 p-3 text-center font-mono text-[10px] uppercase tracking-wider text-ink/35">
            press suggest
          </div>
        )}
        {suggestions && suggestions.length === 0 && (
          <div className="border-2 border-dashed border-ink/25 p-3 text-center font-mono text-[10px] uppercase tracking-wider text-ink/35">
            nothing found
          </div>
        )}
        {suggestions && suggestions.length > 0 && (
          <div className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
            {suggestions.map((sg, i) => (
              <button
                key={i}
                className="group border-2 border-ink bg-card px-2 py-1.5 text-left hover:bg-acid"
                onClick={() => {
                  setTrim(sg.start, sg.end)
                  toast('ok', 'Range applied', `${fmt(sg.start)} → ${fmt(sg.end)}`)
                }}
              >
                <div className="flex items-center justify-between font-mono text-[10px] font-bold">
                  <span>
                    {fmt(sg.start)} → {fmt(sg.end)}
                  </span>
                  <span className="text-ink/40">SCORE {sg.score}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink/70">{sg.text}…</div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}