import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileVideo, FolderSearch, Loader2, UploadCloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { MediaMeta } from '../types'
import { useToast } from '../components/Toasts'
import { Spinner } from '../components/ui'

interface MediaResult {
  path: string
  name: string
  meta: MediaMeta
}

export default function NewProject() {
  const navigate = useNavigate()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [picked, setPicked] = useState<MediaResult | null>(null)
  const [localPath, setLocalPath] = useState('')
  const [name, setName] = useState('')

  const ingestFile = async (file: File) => {
    setBusy(true)
    setBusyLabel('COPYING & PROBING VIDEO')
    try {
      const media = await api.upload<MediaResult>('/api/media/upload', file)
      setPicked(media)
      setName(stripExt(file.name))
      toast('ok', 'Video loaded', `${media.meta.width}×${media.meta.height} · ${media.meta.duration.toFixed(1)}s`)
    } catch (e: any) {
      toast('error', 'Upload failed', e.message)
    } finally {
      setBusy(false)
    }
  }

  const ingestPath = async () => {
    if (!localPath.trim()) return
    setBusy(true)
    setBusyLabel('READING LOCAL FILE')
    try {
      const media = await api.post<MediaResult>('/api/media/from-path', { path: localPath })
      setPicked(media)
      setName(stripExt(media.name))
      toast('ok', 'Video linked', 'No copy — renders read straight from this file')
    } catch (e: any) {
      toast('error', 'Cannot open file', e.message)
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!picked) return
    setBusy(true)
    setBusyLabel('CREATING PROJECT')
    try {
      const r = await api.post<{ project: { id: string } }>('/api/projects', {
        name: name.trim() || stripExt(picked.name),
        sourcePath: picked.path,
      })
      navigate(`/editor/${r.project.id}`)
    } catch (e: any) {
      toast('error', 'Could not create project', e.message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between border-b-4 border-ink pb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">NEW / PROJECT</div>
          <h1 className="font-display text-[clamp(40px,7vw,66px)] leading-[0.85] tracking-tightest">LANDSCAPE IN.<br />VERTICAL OUT.</h1>
        </div>
        <Link to="/" className="btn btn-xs self-start"><ArrowLeft size={12} /> BACK</Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* drop zone */}
        <section
          className={`relative flex min-h-[300px] flex-col items-center justify-center border-2 border-dashed border-ink p-6 text-center transition-colors ${
            dragging ? 'bg-lime' : 'bg-white'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) ingestFile(f)
          }}
        >
          <span className="absolute left-3 top-3 chip">UPLOAD</span>
          {busy && busyLabel.includes('COPYING') ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner>{busyLabel.toLowerCase()}</Spinner>
              <p className="font-mono text-[10px] lowercase text-ink/40">copying to projects/media — large files take a moment</p>
            </div>
          ) : (
            <>
              <div className="grid h-16 w-16 place-items-center border-2 border-ink bg-lime shadow-brutal">
                <UploadCloud size={28} strokeWidth={2.2} />
              </div>
              <h2 className="mt-4 font-display text-2xl uppercase">DROP A CLIP HERE</h2>
              <p className="mt-1 max-w-[300px] font-mono text-[10.5px] lowercase leading-relaxed text-ink/50">
                mp4 · mov · mkv · webm — landscape footage with or without speech.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button className="btn btn-ink" onClick={() => inputRef.current?.click()}>
                  <FileVideo size={15} /> BROWSE FILES
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".mp4,.mov,.mkv,.webm,video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0])}
                />
              </div>
            </>
          )}
        </section>

        {/* local path */}
        <section className="border-2 border-ink bg-paper p-4 shadow-brutal">
          <div className="flex items-center gap-2">
            <FolderSearch size={16} />
            <h2 className="font-display text-lg uppercase">USE A LOCAL PATH</h2>
          </div>
          <p className="mt-1 font-mono text-[10px] lowercase leading-relaxed text-ink/50">
            zero-copy. ideal on slow disks / big recordings.
          </p>
          <textarea
            className="field field-mono mt-3 h-[64px] resize-none"
            placeholder="C:\Videos\interview.mp4"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
          <button className="btn btn-cobalt mt-2 w-full" onClick={ingestPath} disabled={busy}>
            {busy && busyLabel.includes('LOCAL') ? <Loader2 size={14} className="animate-spin" /> : <FolderSearch size={14} />} LINK FILE
          </button>
          <div className="mt-4 border-t-2 border-ink/10 pt-2 font-mono text-[9.5px] lowercase leading-relaxed text-ink/40">
            no YouTube downloading, no streams. local files only.
          </div>
        </section>
      </div>

      {/* picked summary */}
      {picked && (
        <div className="mt-4 panel">
          <header className="flex items-center justify-between border-b-2 border-ink bg-lime px-3 py-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">READY TO FORMAT</span>
            <span className="chip bg-white">SOURCE OK</span>
          </header>
          <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
            <div className="min-w-0">
              <div className="label">Project name</div>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="mt-1.5 truncate font-mono text-[10px] lowercase text-ink/50">
                {picked.path}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] uppercase">
              <div className="border border-ink bg-paper px-1.5 py-1">{picked.meta.width}×{picked.meta.height}</div>
              <div className="border border-ink bg-paper px-1.5 py-1">{picked.meta.fps ?? '?'} FPS</div>
              <div className="border border-ink bg-paper px-1.5 py-1">{picked.meta.duration.toFixed(1)} S</div>
              <div className="border border-ink bg-paper px-1.5 py-1">{picked.meta.hasAudio ? 'AUDIO' : 'NO AUDIO'}</div>
            </div>
            <button className="btn btn-lime !py-2.5" disabled={busy} onClick={create}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileVideo size={15} />} OPEN EDITOR
            </button>
          </div>
          {!picked.meta.hasAudio && (
            <div className="border-t-2 border-ink bg-acid px-3 py-1.5 font-mono text-[10px] lowercase">
              no audio stream — you can still compose & export; subtitles auto-disabled.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function stripExt(n: string) {
  return n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 42) || 'My Short'
}