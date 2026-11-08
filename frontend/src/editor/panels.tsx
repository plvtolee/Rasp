import { useCallback, useEffect, useState } from 'react'
import { Eraser, Plus, Sparkles, Trash2, Upload, Wand2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { api } from '../services/api'
import { Field, SegButton, Slider, Toggle, Select, MonoStat } from '../components/ui'
import { useToast } from '../components/Toasts'
import { useJobFollow } from '../hooks/useJobs'
import { Project, Settings, Transcript } from '../types'
import { fmt } from './Preview'

interface Common {
  project: Project
  mutate: (patch: any) => void
  transcript: Transcript | null
  setTranscript: (t: Transcript | null) => void
  reload: () => void
  currentTime: number
  jobsBusy: boolean
}

/* ---------------- HEADLINE ---------------- */

const FONTS = ['Archivo Black', 'Space Grotesk', 'IBM Plex Mono']

export function HeadlinePanel({ project, mutate, transcript }: Common) {
  const toast = useToast()
  const [suggesting, setSuggesting] = useState(false)
  const h = project.settings.headline
  const set = (patch: any) => mutate({ headline: patch })

  const suggest = async () => {
    setSuggesting(true)
    try {
      const r = await api.post<{ headline: string; source: string }>(`/api/ai/projects/${project.id}/headline`)
      set({ text: r.headline, enabled: true })
      toast('ok', 'Headline set', r.source === 'ai' ? 'OpenRouter suggestion' : r.source === 'empty-transcript' ? 'No transcript yet — typed a placeholder' : 'Local heuristic pick')
    } catch (e: any) {
      toast('error', 'Suggestion failed', e.message)
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle label="Headline" checked={h.enabled} onChange={(v) => set({ enabled: v })} />
      <Field label="Text" hint="enter for new line">
        <textarea
          className="field h-[74px] resize-y leading-snug"
          value={h.text}
          placeholder="TYPE YOUR HEADLINE"
          onChange={(e) => set({ text: e.target.value })}
        />
      </Field>
      <button className="btn btn-cobalt w-full" disabled={suggesting} onClick={suggest}>
        <Sparkles size={15} /> {suggesting ? 'THINKING…' : 'AI SUGGEST'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Font">
          <Select value={h.fontFamily} onChange={(v) => set({ fontFamily: v })} options={FONTS.map((f) => ({ value: f, label: f }))} />
        </Field>
        <Field label="Align">
          <div className="flex border-2 border-ink bg-white">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`flex-1 py-1.5 font-mono text-[10px] font-bold uppercase ${h.align === a ? 'bg-ink text-lime' : ''} hover:bg-paper`} onClick={() => set({ align: a })}>
                {a}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Size" value={h.size} min={20} max={140} onChange={(v) => set({ size: v })} unit="px" />
        <Slider label="Line height" value={h.lineHeight} min={0.8} max={1.8} step={0.02} onChange={(v) => set({ lineHeight: v })} />
        <Slider label="Letter spacing" value={h.letterSpacing} min={-4} max={24} onChange={(v) => set({ letterSpacing: v })} unit="px" />
        <Slider label="Offset X" value={h.offsetX} min={-40} max={40} onChange={(v) => set({ offsetX: v })} unit="%" />
        <Slider label="Offset Y" value={h.offsetY} min={-8} max={9} step={0.1} onChange={(v) => set({ offsetY: v })} unit="%" />
        <div className="flex items-end gap-1.5">
          <button className={`btn flex-1 !px-1 ${h.italic ? 'btn-tang' : ''}`} onClick={() => set({ italic: !h.italic })}>
            <em>I</em>
          </button>
          <input type="color" className="h-[30px] w-9 cursor-pointer border-2 border-ink bg-white p-0" value={h.color} onChange={(e) => set({ color: e.target.value })} title="Text colour" />
          <input type="color" className="h-[30px] w-9 cursor-pointer border-2 border-ink bg-white p-0" value={h.stroke.color} onChange={(e) => set({ stroke: { ...h.stroke, color: e.target.value } })} title="Stroke colour" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Toggle label="Stroke" accent="cobalt" checked={h.stroke.enabled} onChange={(v) => set({ stroke: { ...h.stroke, enabled: v } })} />
        <Toggle label="Shadow" checked={h.shadow.enabled} onChange={(v) => set({ shadow: { ...h.shadow, enabled: v } })} />
        <Toggle label="Block" accent="tang" checked={h.background.enabled} onChange={(v) => set({ background: { ...h.background, enabled: v } })} />
      </div>
      {h.stroke.enabled && (
        <Slider label="Stroke width" value={h.stroke.width} min={1} max={10} onChange={(v) => set({ stroke: { ...h.stroke, width: v } })} unit="px" />
      )}
    </div>
  )
}

/* ---------------- SUBTITLES ---------------- */

export function SubtitlesPanel({ project, mutate, transcript, setTranscript, reload, jobsBusy }: Common) {
  const toast = useToast()
  const sub = project.settings.subtitles
  const [model, setModel] = useState('tiny')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ segments: any[] }>({ segments: [] })
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJobFollow(
    jobId,
    (j) => {
      setJobId(null)
      reload()
      toast('ok', 'Subtitles ready', j.result?.segments ? `${j.result.segments} segments transcribed` : 'Done')
    },
    (j) => {
      setJobId(null)
      toast('error', 'Transcription failed', j.error?.includes('audio') ? 'No audio track in this video' : j.error || 'unknown')
    },
    (j) => setJobId(j.id),
  )
  const set = (patch: any) => mutate({ subtitles: patch })

  const transcribe = async () => {
    if (!project.source_path) return toast('error', 'No video', 'Upload a source first')
    try {
      const r = await api.post<{ jobId: string | null; alreadyRunning?: boolean }>(`/api/ai/projects/${project.id}/transcribe`, { model })
      if (r.jobId) setJobId(r.jobId)
      if (r.alreadyRunning) toast('info', 'Already running')
    } catch (e: any) {
      toast('error', 'Cannot transcribe', e.message)
    }
  }

  const startEdit = () => {
    if (!transcript) return
    setDraft({ segments: JSON.parse(JSON.stringify(transcript.segments)) })
    setEditing(true)
  }

  const saveEdit = async () => {
    try {
      setTranscript({ ...transcript!, segments: draft.segments })
      setEditing(false)
      await api.put(`/api/ai/projects/${project.id}/transcript`, draft)
      toast('ok', 'Transcript saved')
    } catch (e: any) {
      toast('error', 'Save failed', e.message)
    }
  }

  const segments = editing ? draft.segments : transcript?.segments ?? []
  const sm = (i: number, patch: any) =>
    setDraft((d) => ({ segments: d.segments.map((s, ix) => (ix === i ? { ...s, ...patch } : s)) }))
  const dm = (i: number) => setDraft((d) => ({ segments: d.segments.filter((_, ix) => ix !== i) }))

  return (
    <div className="flex flex-col gap-3">
      <Toggle label="Burn subtitles" checked={sub.enabled} onChange={(v) => set({ enabled: v })} />
      {!transcript && !editing && (
        <div className="border-2 border-dashed border-ink/30 p-3">
          <div className="flex items-center gap-2">
            <Field label="Whisper model">
              <SegButton label="" value={model} onChange={setModel} options={[{ value: 'tiny', label: 'TINY' }, { value: 'base', label: 'BASE' }]} />
            </Field>
            <button className="btn btn-ink mt-[18px] flex-1" disabled={jobsBusy || job?.status === 'running'} onClick={transcribe}>
              <Wand2 size={14} /> TRANSCRIBE
            </button>
          </div>
          <p className="mt-2 font-mono text-[10px] lowercase leading-relaxed text-ink/50">
            downloads whisper.cpp (~15MB) + model once · CPU only · local
          </p>
        </div>
      )}
      {job?.status === 'running' && (
        <div className="border-2 border-ink bg-paper p-2">
          <div className="mb-1 flex justify-between font-mono text-[10px] font-bold uppercase">
            <span>{job.error ? job.error : job.message || 'transcribing'}</span>
            <span>{job.progress}%</span>
          </div>
          <div className="h-3 border-2 border-ink bg-white">
            <div className="h-full bg-lime transition-all" style={{ width: `${job.progress}%` }} />
          </div>
          <button className="btn btn-xs mt-1.5 w-full" onClick={() => api.post(`/api/jobs/${jobId}/cancel`)}>CANCEL</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Caption mode">
          <SegButton
            label=""
            value={sub.mode}
            onChange={(v) => set({ mode: v })}
            options={[{ value: 'phrase', label: 'PHRASE' }, { value: 'word', label: 'WORD' }, { value: 'karaoke', label: 'KARA' }]}
          />
        </Field>
        <Field label="Font">
          <Select value={sub.fontFamily} onChange={(v) => set({ fontFamily: v })} options={FONTS.map((f) => ({ value: f, label: f }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Size" value={sub.size} min={20} max={90} onChange={(v) => set({ size: v })} unit="px" />
        <Slider label="Spacing" value={sub.lineSpacing} min={0} max={8} step={0.1} onChange={(v) => set({ lineSpacing: v })} unit="px" />
        <Slider label="Outline" value={sub.outlineWidth} min={0} max={10} step={0.5} onChange={(v) => set({ outlineWidth: v })} unit="px" />
        <Slider label="Low margin" value={sub.bottomGapPct} min={0} max={20} step={0.2} onChange={(v) => set({ bottomGapPct: v })} unit="%" />
      </div>
      <div className="flex items-end gap-2">
        <input type="color" className="h-[30px] w-9 cursor-pointer border-2 border-ink bg-white p-0" value={sub.color} onChange={(e) => set({ color: e.target.value })} title="Text colour" />
        <input type="color" className="h-[30px] w-9 cursor-pointer border-2 border-ink bg-white p-0" value={sub.outlineColor} onChange={(e) => set({ outlineColor: e.target.value })} title="Outline" />
        <input type="color" className="h-[30px] w-9 cursor-pointer border-2 border-ink bg-white p-0" value={sub.highlightColor} onChange={(e) => set({ highlightColor: e.target.value })} title="Highlight" />
        <div className="flex-1">
          <Field label="Highlight keywords" hint="comma list">
            <input className="field" value={sub.highlightKeywords} placeholder="money, insane" onChange={(e) => set({ highlightKeywords: e.target.value })} />
          </Field>
        </div>
        <Toggle label="CAPS" checked={sub.uppercase} onChange={(v) => set({ uppercase: v })} />
      </div>

      {transcript && (
        <div className="border-2 border-ink">
          <div className="flex items-center justify-between border-b-2 border-ink bg-paper px-2 py-1.5">
            <span className="label">TRACK ({transcript.segments.length})</span>
            {!editing ? (
              <div className="flex gap-1">
                <button className="btn btn-xs" onClick={startEdit}><Plus size={11} /> EDIT</button>
                <button className="btn btn-xs" onClick={transcribe} disabled={jobsBusy}><Wand2 size={11} /> REDO</button>
              </div>
            ) : (
              <div className="flex gap-1">
                <button className="btn btn-xs btn-lime" onClick={saveEdit}>SAVE</button>
                <button className="btn btn-xs" onClick={() => setEditing(false)}><Eraser size={11} /> DISCARD</button>
              </div>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto p-2">
            {editing ? (
              <div className="flex flex-col gap-1.5">
                {segments.map((s, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="mt-1 w-[64px] shrink-0 font-mono text-[10px] text-ink/50">{fmt(s.start)}</span>
                    <input className="field field-mono flex-1 !py-1" value={s.text} onChange={(e) => sm(i, { text: e.target.value })} />
                    <button className="btn btn-xs !p-1.5" title="delete" onClick={() => dm(i)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {segments.length === 0 && <EmptyRow />}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {segments.map((s, i) => (
                  <div key={i} className="flex items-baseline gap-2 px-0.5 py-0.5 hover:bg-paper">
                    <span className="w-[64px] shrink-0 font-mono text-[10px] text-ink/40">{fmt(s.start)}</span>
                    <span className="text-[12.5px] leading-snug">{s.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {transcript.wordsApprox && (
            <div className="border-t border-ink/20 bg-paper px-2 py-1 font-mono text-[9px] lowercase text-ink/40">
              word timing is approximate for some segments (no token alignment)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyRow() {
  return <div className="py-2 text-center font-mono text-[10px] uppercase text-ink/30">no segments left</div>
}

export function LogoPanel({ project, mutate, reload }: Common) {
  const toast = useToast()
  const logo = project.settings.logo
  const set = (patch: any) => mutate({ logo: patch })
  const [busy, setBusy] = useState(false)

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const r = await api.upload<{ path: string; name: string }>('/api/media/upload-image', file)
      set({ path: r.path, enabled: true })
      toast('ok', 'Logo uploaded', r.name)
    } catch (e: any) {
      toast('error', 'Upload failed', e.message)
    } finally {
      setBusy(false)
    }
  }

  const usePath = async () => {
    const p = window.prompt('Path to the image file on this machine:')
    if (!p) return
    try {
      const r = await api.post<{ path: string; name: string }>('/api/media/from-image-path', { path: p })
      set({ path: r.path, enabled: true })
      toast('ok', 'Logo set', r.name)
    } catch (e: any) {
      toast('error', 'Could not load', e.message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle label="Logo" accent="tang" checked={logo.enabled && !!logo.path} onChange={(v) => set({ enabled: v })} />
      <div className="flex items-stretch gap-2">
        <label className={`btn btn-tang flex-1 cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          <Upload size={14} /> {busy ? 'LOADING…' : 'UPLOAD PNG/JPG/WEBP'}
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        <button className="btn" onClick={usePath} title="Use a local path — no copy">
          <Plus size={14} /> PATH
        </button>
      </div>
      {logo.path && (
        <div className="flex items-center gap-2 border-2 border-ink bg-paper p-2">
          <div className="checker grid h-14 w-14 shrink-0 place-items-center overflow-hidden border border-ink">
            <img className="max-h-14 max-w-14 object-contain" src={`/api/media/image?path=${encodeURIComponent(logo.path)}`} alt="logo" />
          </div>
          <div className="min-w-0 flex-1 font-mono text-[10px] lowercase text-ink/70">
            <div className="truncate">{logo.path.split(/[\\/]/).pop()}</div>
            <div className="mt-0.5 flex gap-2">
              <button className="btn btn-xs" onClick={() => set({ path: null })}>REMOVE</button>
            </div>
          </div>
        </div>
      )}
      <p className="font-mono text-[10px] lowercase leading-relaxed text-ink/45">
        no logo? area stays black — the app never invents artwork.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Width" value={logo.widthPct} min={5} max={70} onChange={(v) => set({ widthPct: v })} unit="%" />
        <Slider label="Opacity" value={logo.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
        <Slider label="Offset X" value={logo.offsetX} min={-35} max={35} onChange={(v) => set({ offsetX: v })} unit="%" />
        <Slider label="Offset Y" value={logo.offsetY} min={-12} max={12} step={0.1} onChange={(v) => set({ offsetY: v })} unit="%" />
        <Slider label="Rotation" value={logo.rotation} min={-180} max={180} onChange={(v) => set({ rotation: v })} unit="°" />
      </div>
    </div>
  )
}

/* ---------------- FOOTAGE / AUDIO ---------------- */

export function FootagePanel({ project, mutate, currentTime }: Common) {
  const toast = useToast()
  const f = project.settings.footage
  const a = project.settings.audio
  const set = (patch: any) => mutate({ footage: patch })
  const setA = (patch: any) => mutate({ audio: patch })
  const crop = (k: 'left' | 'right' | 'top' | 'bottom', v: number) => set({ crop: { ...f.crop, [k]: Math.max(0, Math.min(45, v)) } })

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Scale" value={f.scale} min={0.5} max={2.4} step={0.05} onChange={(v) => set({ scale: v })} unit="×" />
        <Slider label="Position X" value={f.offsetX} min={-30} max={30} onChange={(v) => set({ offsetX: v })} unit="%" />
      </div>
      <Slider label="Position Y" value={f.offsetY} min={-12} max={12} step={0.1} onChange={(v) => set({ offsetY: v })} unit="%" />
      <div>
        <div className="label mb-1">Crop — horizontal</div>
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Left" value={f.crop.left} min={0} max={40} onChange={(v) => crop('left', v)} unit="%" />
          <Slider label="Right" value={f.crop.right} min={0} max={40} onChange={(v) => crop('right', v)} unit="%" />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Slider label="Top" value={f.crop.top} min={0} max={40} onChange={(v) => crop('top', v)} unit="%" />
          <Slider label="Bottom" value={f.crop.bottom} min={0} max={40} onChange={(v) => crop('bottom', v)} unit="%" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Brightness" value={f.brightness} min={-0.5} max={0.5} step={0.02} onChange={(v) => set({ brightness: v })} />
        <Slider label="Saturation" value={f.saturation} min={0} max={2} step={0.05} onChange={(v) => set({ saturation: v })} unit="×" />
      </div>
      <div className="border-t-2 border-ink/15 pt-2">
        <div className="label mb-1.5 uppercase">Original audio</div>
        <div className="grid grid-cols-3 gap-3">
          <Slider label="Volume" value={a.volume} min={0} max={2} step={0.05} onChange={(v) => setA({ volume: v })} unit="×" />
          <Slider label="Fade in" value={a.fadeIn} min={0} max={4} step={0.25} onChange={(v) => setA({ fadeIn: v })} unit="s" />
          <Slider label="Fade out" value={a.fadeOut} min={0} max={4} step={0.25} onChange={(v) => setA({ fadeOut: v })} unit="s" />
        </div>
      </div>
    </div>
  )
}

/* ---------------- EXPORT ---------------- */

export function ExportPanel({ project, mutate, reload, jobsBusy }: Common) {
  const toast = useToast()
  const ex = project.settings.export
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJobFollow(
    jobId,
    (j) => {
      setJobId(null)
      reload()
      toast('ok', 'Export finished', String(j.result?.output || ''))
    },
    (j) => {
      setJobId(null)
      toast('error', 'Export failed', j.error || 'ffmpeg error')
    },
    (j) => setJobId(j.id),
  )
  const set = (patch: any) => mutate({ export: patch })

  const start = async () => {
    try {
      const r = await api.post<{ jobId: string }>(`/api/exports/projects/${project.id}`)
      setJobId(r.jobId)
      toast('info', 'Rendering started', 'You can keep editing — the UI stays responsive')
    } catch (e: any) {
      toast('error', 'Cannot start export', e.message)
    }
  }

  const cancel = () => jobId && api.post(`/api/jobs/${jobId}/cancel`)

  const openFolder = async () => {
    try {
      const p = (project.exports?.[0]?.output_path) || project.source_path
      await api.post('/api/exports/open-folder', { path: p })
      toast('ok', 'Opened in Explorer')
    } catch (e: any) {
      toast('error', 'Could not open', e.message)
    }
  }

  const rendering = job?.status === 'running' || jobsBusy

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Resolution">
          <SegButton label="" value={String(ex.width)} onChange={(v) => set({ width: parseInt(v) })} options={[{ value: '1080', label: '1080×1920' }, { value: '720', label: '720×1280' }]} />
        </Field>
        <Slider label="CRF quality" value={ex.crf} min={16} max={32} onChange={(v) => set({ crf: v })} hint="lower = better" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Frame rate">
          <SegButton
            label=""
            value={ex.fps == null ? 'src' : String(ex.fps)}
            onChange={(v) => set({ fps: v === 'src' ? null : parseFloat(v) })}
            options={[{ value: 'src', label: 'SRC' }, { value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]}
          />
        </Field>
        <Field label="H.264 preset">
          <Select value={ex.preset} onChange={(v) => set({ preset: v })} options={['ultrafast', 'veryfast', 'medium'].map((p) => ({ value: p, label: p }))} />
        </Field>
      </div>

      <div className="border-2 border-ink bg-paper p-2">
        <div className="label mb-1">Output</div>
        <div className="font-mono text-[11px] lowercase text-ink/60">exports\{project.id}\*.mp4</div>
        <div className="mt-1 flex gap-1.5">
          <button className="btn btn-xs" onClick={openFolder}>OPEN FOLDER</button>
        </div>
      </div>

      {job?.status === 'running' && (
        <div>
          <div className="mb-1 flex justify-between font-mono text-[10px] font-bold uppercase">
            <span className="truncate">{job.message || 'rendering'}</span>
            <span>{job.progress}%</span>
          </div>
          <div className="h-3.5 border-2 border-ink bg-white">
            <div className="h-full bg-bubble transition-[width] duration-300" style={{ width: `${job.progress}%` }} />
          </div>
          <button className="btn btn-xs btn-tang mt-1.5 w-full" onClick={cancel}>CANCEL RENDER</button>
        </div>
      )}
      {job?.status === 'cancelling' && <div className="font-mono text-[10px] uppercase text-ink/50">stopping ffmpeg…</div>}

      <button className="btn btn-lime !py-2.5 text-[15px]" disabled={rendering} onClick={start}>
        <Sparkles size={16} /> {rendering ? 'RENDERING…' : 'EXPORT MP4'}
      </button>
    </div>
  )
}

const DEFAULT_ADJ = { brightness: 0, contrast: 100, saturation: 100, temperature: 0, tint: 0, sharpen: 0, blur: 0, vignette: 0 }
const DEFAULT_TRANS = { fade_in: 0, fade_out: 0, zoom_in: 0, zoom_out: 0, blur_in: 0, flash_in: 0 }

function Collapsible({ title, accent, children, defaultOpen = false }: { title: string; accent: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-2 border-ink">
      <button onClick={() => setOpen(!open)} className={`flex w-full items-center justify-between px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${accent}`}>
        <span className="flex items-center gap-2">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {title}</span>
      </button>
      {open && <div className="flex flex-col gap-3 border-t-2 border-ink p-3">{children}</div>}
    </div>
  )
}

export function EffectsPanel({ project, mutate, reload, jobsBusy }: any) {
  const toast = useToast()
  const settings = project.settings
  const effects = settings.effects || { version: 1, adjustments: { ...DEFAULT_ADJ }, motion: [], visual_effects: [], transitions: { ...DEFAULT_TRANS } }
  const adj = effects.adjustments || { ...DEFAULT_ADJ }
  const trans = effects.transitions || { ...DEFAULT_TRANS }
  const motion = effects.motion || []
  const vfx = effects.visual_effects || []

  const [mode, setMode] = useState(settings.ai_director?.mode || 'viral')
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJobFollow(jobId, (j: any) => {
    setJobId(null); reload()
    toast('ok', 'AI Director complete', `${j.result?.events || 0} edits generated`)
  }, (j: any) => { setJobId(null); toast('error', 'AI Director failed', j.error || '') })

  const setAdj = (patch: any) => mutate({ effects: { ...effects, adjustments: { ...adj, ...patch } } })
  const setTrans = (patch: any) => mutate({ effects: { ...effects, transitions: { ...trans, ...patch } } })
  const setMotion = (m: any[]) => mutate({ effects: { ...effects, motion: m } })
  const setVfx = (v: any[]) => mutate({ effects: { ...effects, visual_effects: v } })
  const resetAdj = () => { setAdj({ ...DEFAULT_ADJ }); toast('ok', 'Adjustments reset') }
  const resetAll = () => {
    mutate({ effects: { version: 1, adjustments: { ...DEFAULT_ADJ }, motion: [], visual_effects: [], transitions: { ...DEFAULT_TRANS } } })
    toast('ok', 'All effects reset')
  }

  const runDirector = async () => {
    try {
      const r = await api.post<{ jobId: string }>(`/api/ai/projects/${project.id}/director`, { mode })
      setJobId(r.jobId)
      toast('info', 'AI Director running', 'Analysing your video...')
    } catch (e: any) {
      toast('error', 'Cannot start AI Director', e.message)
    }
  }

  const undoDirector = async () => {
    try {
      await api.post(`/api/ai/projects/${project.id}/director/undo`)
      reload()
      toast('ok', 'AI edits undone')
    } catch (e: any) {
      toast('error', 'Undo failed', e.message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* AI Director */}
      <div className="border-2 border-ink bg-lime p-3 shadow-brutal">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} strokeWidth={2.5} />
          <h3 className="font-display text-sm uppercase tracking-tight">RASP AI DIRECTOR</h3>
        </div>
        <p className="font-mono text-[10px] lowercase leading-relaxed text-ink/70 mb-3">
          Let RASP analyse your video and create an intelligent short-form edit.
        </p>
        <div className="mb-2">
          <div className="label mb-1">Editing intensity</div>
          <div className="flex border-2 border-ink bg-white">
            {(['subtle', 'viral', 'aggressive'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide ${mode === m ? 'bg-ink text-lime' : 'hover:bg-paper'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-ink w-full !py-2" disabled={jobsBusy || job?.status === 'running'} onClick={runDirector}>
          <Wand2 size={15} /> {job?.status === 'running' ? 'ANALYSING...' : 'ANALYZE & EDIT'}
        </button>
        {job?.status === 'running' && (
          <div className="mt-2">
            <div className="mb-1 flex justify-between font-mono text-[9px] font-bold uppercase">
              <span className="truncate">{job.message || 'analysing'}</span>
              <span>{job.progress}%</span>
            </div>
            <div className="h-2.5 border-2 border-ink bg-white">
              <div className="h-full bg-cobalt transition-all" style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        )}
        {settings.ai_director?.editing_plan && (
          <div className="mt-3 border-2 border-ink bg-white p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="label">Generated edits ({settings.ai_director.editing_plan.motion_events?.length || 0})</span>
              <button className="btn btn-xs btn-tang" onClick={undoDirector}>UNDO AI</button>
            </div>
            <div className="max-h-[160px] overflow-y-auto flex flex-col gap-1">
              {(settings.ai_director.editing_plan.motion_events || []).map((ev: any, i: number) => (
                <div key={ev.id || i} className="flex items-center justify-between border border-ink/20 px-2 py-1 text-[11px]">
                  <div>
                    <span className="font-mono text-[9px] text-ink/50">{ev.start?.toFixed(1)}s</span>
                    <span className="ml-2 font-bold uppercase">{(ev.effect || '').replace(/_/g, ' ')}</span>
                  </div>
                  <span className="font-mono text-[9px] text-ink/40">{ev.reason || ''}</span>
                </div>
              ))}
              {(settings.ai_director.editing_plan.subtitle_emphasis || []).map((se: any, i: number) => (
                <div key={`se-${i}`} className="flex items-center justify-between border border-ink/20 px-2 py-1 text-[11px]">
                  <div>
                    <span className="font-mono text-[9px] text-ink/50">{se.start?.toFixed(1)}s</span>
                    <span className="ml-2 font-bold uppercase text-cobalt">KEYWORD: {se.keyword}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Adjustments */}
      <Collapsible title="Adjustments" accent="bg-cobalt text-white" defaultOpen={true}>
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Brightness" value={adj.brightness} min={-100} max={100} onChange={(v) => setAdj({ brightness: v })} unit="" />
          <Slider label="Contrast" value={adj.contrast} min={0} max={200} onChange={(v) => setAdj({ contrast: v })} unit="%" />
          <Slider label="Saturation" value={adj.saturation} min={0} max={200} onChange={(v) => setAdj({ saturation: v })} unit="%" />
          <Slider label="Temperature" value={adj.temperature} min={-100} max={100} onChange={(v) => setAdj({ temperature: v })} unit="" />
          <Slider label="Tint" value={adj.tint} min={-100} max={100} onChange={(v) => setAdj({ tint: v })} unit="" />
          <Slider label="Sharpen" value={adj.sharpen} min={0} max={100} onChange={(v) => setAdj({ sharpen: v })} unit="" />
          <Slider label="Blur" value={adj.blur} min={0} max={30} onChange={(v) => setAdj({ blur: v })} unit="px" />
          <Slider label="Vignette" value={adj.vignette} min={0} max={100} onChange={(v) => setAdj({ vignette: v })} unit="" />
        </div>
        <button className="btn btn-xs w-full" onClick={resetAdj}><RotateCcw size={11} /> RESET ADJUSTMENTS</button>
      </Collapsible>

      {/* Motion */}
      <Collapsible title="Motion" accent="bg-tang">
        <p className="font-mono text-[10px] lowercase text-ink/50">
          Motion events are added by AI Director or manually. {motion.length} event(s) active.
        </p>
        {motion.map((m: any, i: number) => (
          <div key={m.id || i} className="border-2 border-ink bg-paper p-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase">{(m.type || '').replace(/_/g, ' ')}</span>
              <button className="btn btn-xs" onClick={() => setMotion(motion.filter((_: any, j: number) => j !== i))}>
                <RotateCcw size={10} /> REMOVE
              </button>
            </div>
            <div className="mt-1 font-mono text-[9px] text-ink/50">
              {m.startTime?.toFixed(1)}s – {m.endTime?.toFixed(1)}s · intensity {m.intensity}%
            </div>
          </div>
        ))}
        {motion.length === 0 && <p className="font-mono text-[10px] uppercase text-ink/30 text-center py-2">no motion events — use AI Director</p>}
      </Collapsible>

      {/* Visual FX */}
      <Collapsible title="Visual FX" accent="bg-bubble">
        <p className="font-mono text-[10px] lowercase text-ink/50">
          {vfx.length} effect(s) active. Use AI Director to add context-aware effects.
        </p>
        {vfx.map((v: any, i: number) => (
          <div key={v.id || i} className="border-2 border-ink bg-paper p-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase">{(v.type || '').replace(/_/g, ' ')}</span>
              <button className="btn btn-xs" onClick={() => setVfx(vfx.filter((_: any, j: number) => j !== i))}>
                <RotateCcw size={10} /> REMOVE
              </button>
            </div>
            <div className="mt-1 font-mono text-[9px] text-ink/50">
              intensity {v.intensity}%{v.startTime ? ` · ${v.startTime.toFixed(1)}s–${v.endTime?.toFixed(1)}s` : ''}
            </div>
          </div>
        ))}
        {vfx.length === 0 && <p className="font-mono text-[10px] uppercase text-ink/30 text-center py-2">no visual effects — use AI Director</p>}
      </Collapsible>

      {/* Transitions */}
      <Collapsible title="Transitions" accent="bg-acid">
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Fade In" value={trans.fade_in} min={0} max={5} step={0.25} onChange={(v) => setTrans({ fade_in: v })} unit="s" />
          <Slider label="Fade Out" value={trans.fade_out} min={0} max={5} step={0.25} onChange={(v) => setTrans({ fade_out: v })} unit="s" />
          <Slider label="Zoom In" value={trans.zoom_in} min={0} max={3} step={0.25} onChange={(v) => setTrans({ zoom_in: v })} unit="s" />
          <Slider label="Zoom Out" value={trans.zoom_out} min={0} max={3} step={0.25} onChange={(v) => setTrans({ zoom_out: v })} unit="s" />
          <Slider label="Blur In" value={trans.blur_in} min={0} max={3} step={0.25} onChange={(v) => setTrans({ blur_in: v })} unit="s" />
          <Slider label="Flash In" value={trans.flash_in} min={0} max={2} step={0.1} onChange={(v) => setTrans({ flash_in: v })} unit="s" />
        </div>
      </Collapsible>

      <button className="btn btn-xs w-full btn-tang" onClick={resetAll}>
        <RotateCcw size={11} /> RESET ALL EFFECTS
      </button>
    </div>
  )
}
