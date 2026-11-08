import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Sliders, Sparkles, Wand2 } from 'lucide-react'
import { api } from '../services/api'
import { Field, SegButton, Slider, Toggle } from '../components/ui'
import { useToast } from '../components/Toasts'
import { useJobFollow } from '../hooks/useJobs'
import { Project } from '../types'

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
EOF
echo "effects panel written"