import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CloudOff, Loader2 } from 'lucide-react'
import { useProject } from './useProject'
import { useJobs } from '../hooks/useJobs'
import Preview from './Preview'
import SourcePanel from './SourcePanel'
import { ExportPanel, FootagePanel, HeadlinePanel, LogoPanel, SubtitlesPanel } from './panels'
import { Spinner } from '../components/ui'

const TABS = [
  { id: 'headline', label: 'HEADLINE', accent: 'bg-lime' },
  { id: 'subs', label: 'SUBTITLES', accent: 'bg-bubble' },
  { id: 'logo', label: 'LOGO', accent: 'bg-tang' },
  { id: 'video', label: 'VIDEO', accent: 'bg-cobalt' },
  { id: 'export', label: 'EXPORT', accent: 'bg-acid' },
] as const

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const { project, transcript, setTranscript, mutate, reload, error, saving } = useProject(id!)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('headline')
  const [currentTime, setCurrentTime] = useState(0)
  const jobs = useJobs()
  const jobsBusy = jobs.some((j) => j.projectId === id && j.status === 'running')

  const common = useMemo(
    () => ({
      project: project!,
      mutate,
      transcript,
      setTranscript,
      reload,
      currentTime,
      jobsBusy,
    }),
    [project, mutate, transcript, setTranscript, reload, currentTime, jobsBusy],
  )

  if (error) {
    return (
      <div className="p-8">
        <div className="panel max-w-lg p-5">
          <div className="font-display text-3xl">COULD NOT LOAD</div>
          <p className="mt-2 font-mono text-[12px] text-ink/60">{error}</p>
          <Link to="/" className="btn mt-4">← BACK HOME</Link>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="grid h-full place-items-center p-10">
        <Spinner>loading project</Spinner>
      </div>
    )
  }

  const accents: Record<string, string> = { lime: 'bg-lime', bubble: 'bg-bubble', tang: 'bg-tang', cobalt: 'bg-cobalt', acid: 'bg-acid' }

  return (
    <div className="flex min-h-full flex-col">
      {/* editor masthead */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="btn btn-xs" title="Dashboard">
            <ArrowLeft size={13} /> HOME
          </Link>
          <div className="hidden h-6 w-[2px] bg-ink sm:block" />
          <input
            className="min-w-0 border-b-2 border-transparent bg-transparent font-display text-lg uppercase tracking-tight outline-none focus:border-ink"
            defaultValue={project.name}
            key={`${project.id}-${project.updated_at}`}
            onBlur={async (e) => {
              const name = e.target.value.trim()
              if (!name || name === project.name) return
              await fetch(`/api/projects/${project.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
              })
              reload()
            }}
          />
          <span className="hidden chip md:inline-flex">{project.settings.export.width}×{Math.round((project.settings.export.width * 16) / 9)} · H.264</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase text-ink/50">
          {saving ? (
            <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> saving</span>
          ) : (
            <span className="flex items-center gap-1"><CloudOff size={11} /> local only</span>
          )}
          <span className="hidden sm:inline">#{project.id}</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 xl:grid-cols-[300px_minmax(0,1fr)_370px]">
        {/* LEFT */}
        <aside className="order-2 xl:order-1">
          <SourcePanel project={project} meta={project.meta ?? null} mutate={mutate} currentTime={currentTime} reload={reload} />
        </aside>

        {/* CENTER */}
        <main className="order-1 flex min-w-0 flex-col items-center xl:order-2">
          <div className="mb-2 w-full max-w-[480px]">
            <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
              <h2 className="font-display text-xl uppercase leading-none">COMPOSITION</h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">9:16 · PREVIEW</span>
            </div>
            <p className="mt-1 font-mono text-[10px] lowercase leading-snug text-ink/45">
              safe areas shown in orange · preview is a live DOM composite, nothing re-renders until export.
            </p>
          </div>
          <Preview
            settings={project.settings}
            transcript={transcript ?? null}
            videoPath={project.source_path}
            srcW={project.meta?.width || 1920}
            duration={project.meta?.duration || 0}
            onTime={setCurrentTime}
            key={project.id}
          />
        </main>

        {/* RIGHT */}
        <aside className="order-3">
          <div className="panel">
            <div className="grid grid-cols-5 border-b-2 border-ink">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative px-1 py-2 font-mono text-[9.5px] font-bold uppercase tracking-wider transition-colors ${
                    tab === t.id ? 'bg-ink text-white' : 'hover:bg-paper'
                  }`}
                >
                  {t.label}
                  <span className={`absolute inset-x-0 bottom-0 h-[3px] ${t.accent}`} />
                </button>
              ))}
            </div>
            <div className="p-3">
              {tab === 'headline' && <HeadlinePanel {...common} />}
              {tab === 'subs' && <SubtitlesPanel {...common} />}
              {tab === 'logo' && <LogoPanel {...common} />}
              {tab === 'video' && <FootagePanel {...common} />}
              {tab === 'export' && <ExportPanel {...common} />}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}