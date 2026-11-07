import { useEffect, useState } from 'react'
import React from 'react'
import { Download, HardDrive, KeyRound, Save, Sparkles, type LucideIcon } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toasts'
import { useJobFollow } from '../hooks/useJobs'
import { Field, Select, Slider, Spinner, Toggle } from '../components/ui'

interface AppSettings {
  defaultExportDir: string
  resolution: number
  crf: number
  transcriptionModel: string
  subtitleStyle: any
  headlineStyle: any
  logoPath: string | null
}

interface WhisperStatus {
  cliReady: boolean
  cliPath: string | null
  models: Record<string, { ready: boolean; sizeMB: number }>
}

interface System {
  ffmpeg: boolean
  ffprobe: boolean
  whisper: WhisperStatus
  openRouter: boolean
  exportDir: string
  defaults: any
}

export default function SettingsPage() {
  const toast = useToast()
  const [cfg, setCfg] = useState<AppSettings | null>(null)
  const [sys, setSys] = useState<System | null>(null)
  const [saving, setSaving] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJobFollow(
    jobId,
    () => {
      setJobId(null)
      load()
      toast('ok', 'whisper.cpp engine ready')
    },
    (j) => {
      setJobId(null)
      toast('error', 'Download failed', j.error || '')
    },
  )

  const load = () => {
    api.get<AppSettings>('/api/settings').then(setCfg).catch(() => {})
    api.get<System>('/api/system').then(setSys).catch(() => {})
  }
  useEffect(load, [])

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      await api.put('/api/settings', cfg)
      toast('ok', 'Preferences saved', 'applies to new projects')
    } catch (e: any) {
      toast('error', 'Save failed', e.message)
    } finally {
      setSaving(false)
    }
  }

  const download = async () => {
    try {
      const r = await api.post<{ jobId: string | null; alreadyInstalled: boolean }>('/api/ai/download-engine', { model: cfg?.transcriptionModel || 'tiny' })
      if (r.alreadyInstalled) toast('info', 'Already installed')
      else if (r.jobId) setJobId(r.jobId)
    } catch (e: any) {
      toast('error', 'Could not start download', e.message)
    }
  }

  if (!cfg) return <div className="p-10"><Spinner>loading settings</Spinner></div>

  const models = sys?.whisper?.models || {}
  const installed = sys?.whisper?.cliReady

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-4 border-ink pb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">CONFIG</div>
          <h1 className="font-display text-[clamp(40px,7vw,78px)] uppercase leading-[0.85] tracking-tightest">SETTINGS.</h1>
        </div>
        <button className="btn btn-lime" onClick={save} disabled={saving}>
          <Save size={14} /> {saving ? 'SAVING…' : 'SAVE PREFERENCES'}
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* engine */}
        <Card icon={HardDrive} title="ENGINE" accent="bg-cobalt text-white">
          <div className="flex flex-col gap-2">
            <Row k="FFMPEG" v={sys?.ffmpeg ? 'FOUND' : 'MISSING'} ok={sys?.ffmpeg} />
            <Row k="FFPROBE" v={sys?.ffprobe ? 'FOUND' : 'MISSING'} ok={sys?.ffprobe} />
            <Row k="WHISPER.CPP" v={installed ? 'INSTALLED' : 'NOT INSTALLED'} ok={installed} />
            {Object.entries(models).map(([m, st]) => (
              <Row key={m} k={`MODEL ${m.toUpperCase()}`} v={st.ready ? 'READY' : `NOT DOWNLOADED (${st.sizeMB}MB)`} ok={st.ready} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-[140px]">
              <Field label="Default model">
                <Select
                  value={cfg.transcriptionModel}
                  onChange={(v) => setCfg({ ...cfg, transcriptionModel: v })}
                  options={[
                    { value: 'tiny', label: 'Tiny (~78MB)' },
                    { value: 'base', label: 'Base (~145MB)' },
                  ]}
                />
              </Field>
            </div>
            <button className="btn btn-ink" onClick={download}>
              <Download size={14} /> INSTALL / REPAIR
            </button>
          </div>
          {job && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between font-mono text-[9.5px] uppercase">
                <span className="truncate">{job.message || 'downloading'}</span>
                <span>{job.progress}%</span>
              </div>
              <div className="h-2.5 border-2 border-ink bg-white">
                <div className="h-full bg-lime" style={{ width: `${job.progress}%` }} />
              </div>
            </div>
          )}
          <p className="mt-2 font-mono text-[9.5px] lowercase leading-relaxed text-ink/45">
            cpu-only inference. first install downloads the official whisper.cpp windows build + model.
          </p>
        </Card>

        {/* output */}
        <Card icon={Sparkles} title="OUTPUT" accent="bg-lime">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default resolution">
              <Select
                value={String(cfg.resolution)}
                onChange={(v) => setCfg({ ...cfg, resolution: parseInt(v) })}
                options={[
                  { value: '1080', label: '1080×1920' },
                  { value: '720', label: '720×1280' },
                ]}
              />
            </Field>
            <Slider label="Default CRF" value={cfg.crf} min={16} max={32} onChange={(v) => setCfg({ ...cfg, crf: v })} hint="lower = better" />
          </div>
          <div className="mt-3">
            <Field label="Output directory">
              <input className="field field-mono" value={cfg.defaultExportDir} onChange={(e) => setCfg({ ...cfg, defaultExportDir: e.target.value })} />
            </Field>
          </div>
          <p className="mt-2 font-mono text-[9.5px] lowercase text-ink/45">
            exports\{'{project-id}'}\ in this folder. change path to any absolute directory.
          </p>
        </Card>

        {/* headline defaults */}
        <Card icon={Sparkles} title="HEADLINE DEFAULTS" accent="bg-bubble">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font">
              <Select
                value={cfg.headlineStyle.fontFamily}
                onChange={(v) => setCfg({ ...cfg, headlineStyle: { ...cfg.headlineStyle, fontFamily: v } })}
                options={['Archivo Black', 'Space Grotesk', 'IBM Plex Mono'].map((f) => ({ value: f, label: f }))}
              />
            </Field>
            <Slider label="Size" value={cfg.headlineStyle.size} min={20} max={140} onChange={(v) => setCfg({ ...cfg, headlineStyle: { ...cfg.headlineStyle, size: v } })} unit="px" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input type="color" className="h-8 w-10 cursor-pointer border-2 border-ink bg-white p-0" value={cfg.headlineStyle.color} onChange={(e) => setCfg({ ...cfg, headlineStyle: { ...cfg.headlineStyle, color: e.target.value } })} />
            <span className="font-mono text-[11px] uppercase text-ink/50">TEXT COLOUR</span>
          </div>
        </Card>

        {/* subtitle defaults */}
        <Card icon={Sparkles} title="SUBTITLE DEFAULTS" accent="bg-tang">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font">
              <Select
                value={cfg.subtitleStyle.fontFamily}
                onChange={(v) => setCfg({ ...cfg, subtitleStyle: { ...cfg.subtitleStyle, fontFamily: v } })}
                options={['Space Grotesk', 'Archivo Black', 'IBM Plex Mono'].map((f) => ({ value: f, label: f }))}
              />
            </Field>
            <Slider label="Size" value={cfg.subtitleStyle.size} min={20} max={90} onChange={(v) => setCfg({ ...cfg, subtitleStyle: { ...cfg.subtitleStyle, size: v } })} unit="px" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input type="color" className="h-8 w-10 cursor-pointer border-2 border-ink bg-white p-0" value={cfg.subtitleStyle.color} onChange={(e) => setCfg({ ...cfg, subtitleStyle: { ...cfg.subtitleStyle, color: e.target.value } })} />
            <span className="font-mono text-[11px] uppercase text-ink/50">TEXT</span>
            <input type="color" className="h-8 w-10 cursor-pointer border-2 border-ink bg-white p-0" value={cfg.subtitleStyle.highlightColor} onChange={(e) => setCfg({ ...cfg, subtitleStyle: { ...cfg.subtitleStyle, highlightColor: e.target.value } })} />
            <span className="font-mono text-[11px] uppercase text-ink/50">HIGHLIGHT</span>
          </div>
          <div className="mt-3">
            <Toggle label="Uppercase captions" checked={!!cfg.subtitleStyle.uppercase} onChange={(v) => setCfg({ ...cfg, subtitleStyle: { ...cfg.subtitleStyle, uppercase: v } })} />
          </div>
        </Card>

        {/* openrouter */}
        <Card icon={KeyRound} title="OPENROUTER (OPTIONAL)" accent="bg-ink text-lime" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${sys?.openRouter ? 'bg-lime' : 'bg-acid'}`}>{sys?.openRouter ? 'KEY DETECTED' : 'NO API KEY'}</span>
            <span className="font-mono text-[10px] lowercase text-ink/50">
              set OPENROUTER_API_KEY in the backend environment (.env) to enable AI headline suggestions.
            </span>
          </div>
          <p className="mt-2 font-mono text-[9.5px] lowercase leading-relaxed text-ink/45">
            without a key, headlines and range suggestions fall back to local heuristics. the app never requires it.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  accent,
  children,
  className = '',
}: {
  icon: LucideIcon
  title: string
  accent: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`border-2 border-ink bg-white shadow-brutal ${className}`}>
      <header className={`flex items-center gap-2 border-b-2 border-ink px-3 py-2 ${accent}`}>
        <Icon size={15} strokeWidth={2.5} />
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">{title}</h2>
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/10 pb-1 font-mono text-[10px] uppercase last:border-0 last:pb-0">
      <span className="text-ink/50">{k}</span>
      <span className={`font-bold ${ok ? 'text-ink' : 'text-tang'}`}>{v}</span>
    </div>
  )
}