import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Clapperboard, Download, FolderOpen, Play, Plus, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { ExportRecord, Job, Project } from '../types'
import { useJobs } from '../hooks/useJobs'
import { Empty, Spinner } from '../components/ui'
import { useToast } from '../components/Toasts'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [exports, setExports] = useState<ExportRecord[] | null>(null)
  const jobs = useJobs()
  const navigate = useNavigate()
  const toast = useToast()

  const load = () => {
    api.get<{ projects: Project[] }>('/api/projects').then((d) => setProjects(d.projects)).catch(() => setProjects([]))
    api.get<{ exports: ExportRecord[] }>('/api/exports').then((d) => setExports(d.exports)).catch(() => setExports([]))
  }
  useEffect(load, [])

  const remove = async (p: Project) => {
    if (!window.confirm(`Delete project "${p.name}"? Media files stay on disk.`)) return
    await api.del(`/api/projects/${p.id}`)
    toast('ok', 'Project deleted')
    load()
  }

  const openFolder = async (path: string) => {
    try {
      await api.post('/api/exports/open-folder', { path })
    } catch (e: any) {
      toast('error', 'Could not open folder', e.message)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 sm:py-7">
      {/* masthead */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-4 border-ink pb-3">
        <div>
          <div className="flex items-start gap-2">
            <h1 className="font-display text-[clamp(52px,9vw,104px)] uppercase leading-[0.82] tracking-tightest">
              RASP<span className="align-top font-mono text-[18px] text-cobalt">®</span>
            </h1>
            <span className="mt-2 hidden -rotate-3 border-2 border-ink bg-acid px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest sm:block">
              VOL.01
            </span>
          </div>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/60">
            vertical shorts formatter — local · cpu · no cloud
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">FFMPEG READY</span>
          <span className="chip">WHISPER.CPP</span>
          <Link to="/new" className="btn btn-lime !px-4 !py-2">
            <Plus size={15} /> NEW PROJECT
          </Link>
        </div>
      </div>

      {/* hero */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="relative flex min-h-[300px] flex-col justify-between overflow-hidden border-2 border-ink bg-cobalt p-5 text-white shadow-brutal-lg sm:p-7">
          <div className="absolute -right-10 -top-14 font-display text-[220px] leading-none text-white/10 select-none">9:16</div>
          <div className="relative">
            <span className="inline-block border-2 border-white bg-lime px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-ink">
              one composition — done properly
            </span>
            <h2 className="mt-4 font-display text-[clamp(34px,5vw,64px)] uppercase leading-[0.9] tracking-tight">
              MAKE SHORTS.
              <br />
              NOT TIMELINES.
            </h2>
            <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-white/80">
              Drop a landscape clip. Whisper writes the captions, RASP lays it onto a 1080×1920 black canvas with a
              headline above and your logo below. Export real H.264.
            </p>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            <Link to="/new" className="btn btn-lime !px-4">
              <Clapperboard size={15} /> START A PROJECT
            </Link>
            <Link to="/settings" className="btn !bg-white/10 !text-white hover:!bg-white/20">
              SETUP ENGINE
            </Link>
          </div>
        </section>

        <section className="grid grid-rows-2 gap-4">
          <div className="border-2 border-ink bg-white p-4 shadow-brutal">
            <div className="flex items-center justify-between">
              <h3 className="sec-label">
                <span className="sec-dot bg-tang" /> PROCESSING
              </h3>
              <span className="font-mono text-[10px] text-ink/40">{jobs.filter((j) => j.status === 'running').length} RUNNING</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {jobs.length === 0 && <div className="font-mono text-[10px] uppercase text-ink/30">queue is empty</div>}
              {jobs.slice(0, 3).map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          </div>
          <div className="border-2 border-ink bg-lime p-4 shadow-brutal">
            <h3 className="sec-label">
              <span className="sec-dot bg-ink" /> OUTPUT
            </h3>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="font-display text-4xl leading-none">{(exports || []).length}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest">exported mp4s</div>
              </div>
              <Link to="/exports" className="btn btn-xs">
                VIEW ALL <ArrowUpRight size={11} />
              </Link>
            </div>
            <p className="mt-2 font-mono text-[9.5px] lowercase leading-snug text-ink/60">
              1080×1920 · h.264 · faststart · burned subs
            </p>
          </div>
        </section>
      </div>

      {/* recent projects */}
      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
            <h3 className="font-display text-xl uppercase">RECENT PROJECTS</h3>
            <span className="font-mono text-[10px] uppercase text-ink/40">{projects?.length ?? 0} TOTAL</span>
          </div>
          {projects === null ? (
            <div className="py-8"><Spinner>loading projects</Spinner></div>
          ) : projects.length === 0 ? (
            <div className="mt-3 panel flex flex-col items-start gap-3 p-5">
              <Empty text="no projects yet" />
              <Link to="/new" className="btn btn-ink">UPLOAD YOUR FIRST CLIP</Link>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {projects.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/editor/${p.id}`)}
                  className="group flex items-stretch border-2 border-ink bg-white text-left shadow-brutal-sm transition-transform hover:-translate-y-0.5 hover:shadow-brutal"
                >
                  <div className={`grid w-12 shrink-0 place-items-center border-r-2 border-ink font-mono text-[13px] font-bold ${['bg-lime', 'bg-bubble', 'bg-tang', 'bg-acid', 'bg-cobalt text-white'][i % 5]}`}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0 flex-1 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-bold uppercase leading-tight">{p.name}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {(!p.exports || p.exports.length === 0) && (
                          <span className="chip bg-acid !py-0 text-[8px]">DRAFT</span>
                        )}
                        <span className="font-mono text-[9px] uppercase text-ink/40">
                          {new Date(p.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] lowercase text-ink/45">
                      {p.source_path?.split(/[\\/]/).pop() || 'no source'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 border-l-2 border-ink px-2">
                    <span className="btn btn-ghost btn-xs hidden sm:inline-flex">OPEN <ArrowUpRight size={11} /></span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="btn btn-xs !p-1.5 hover:!bg-tang"
                      title="Delete project"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(p)
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Trash2 size={12} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* last exports */}
        <section>
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
            <h3 className="font-display text-xl uppercase">LAST EXPORTS</h3>
            <Download size={15} />
          </div>
          {exports === null ? (
            <div className="py-8"><Spinner>loading</Spinner></div>
          ) : exports.length === 0 ? (
            <div className="mt-2"><Empty text="nothing exported yet" /></div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {exports.slice(0, 5).map((e) => (
                <div key={e.id} className="border-2 border-ink bg-white px-2.5 py-2 shadow-brutal-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-bold uppercase">{e.project_name}</span>
                    <button className="btn btn-xs !p-1.5" title="Open folder" onClick={() => openFolder(e.output_path)}>
                      <FolderOpen size={12} />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[9.5px] uppercase text-ink/45">
                    <span>
                      {e.width}×{e.height} · {e.duration?.toFixed(1)}s
                    </span>
                    <span>{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="mt-8 border-t-2 border-ink/15 pt-2 font-mono text-[9px] uppercase tracking-widest text-ink/35">
        rasp® — local-first · files stay on this machine · no template marketplace, no timeline bloat
      </p>
    </div>
  )
}

function JobRow({ job }: { job: Job }) {
  const label = job.kind === 'export' ? 'RENDER' : job.kind === 'transcribe' ? 'SUBS' : 'SETUP'
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase">
        <span className="truncate">{label} · {job.label}</span>
        <span>{job.status === 'running' ? `${job.progress}%` : job.status}</span>
      </div>
      <div className="mt-1 h-2 border border-ink bg-paper">
        <div
          className={`h-full ${job.status === 'failed' ? 'bg-tang' : job.status === 'done' ? 'bg-lime' : 'bg-bubble'}`}
          style={{ width: `${job.status === 'running' ? job.progress : 100}%` }}
        />
      </div>
    </div>
  )
}