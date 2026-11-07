import { useEffect, useState } from 'react'
import { FolderOpen, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { ExportRecord } from '../types'
import { Empty, Spinner } from '../components/ui'
import { useToast } from '../components/Toasts'

export default function ExportsPage() {
  const [exports, setExports] = useState<ExportRecord[] | null>(null)
  const toast = useToast()

  const load = () => api.get<{ exports: ExportRecord[] }>('/api/exports').then((d) => setExports(d.exports)).catch(() => setExports([]))
  useEffect(() => {
    load()
  }, [])

  const open = async (path: string) => {
    try {
      await api.post('/api/exports/open-folder', { path })
    } catch (e: any) {
      toast('error', 'Could not open folder', e.message)
    }
  }

  const del = async (e: ExportRecord) => {
    if (!window.confirm(`Delete ${e.output_path}?`)) return
    await api.post('/api/exports/delete-file', { path: e.output_path })
    toast('ok', 'File deleted')
    load()
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-4 border-ink pb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">ARCHIVE</div>
          <h1 className="font-display text-[clamp(40px,7vw,78px)] uppercase leading-[0.85] tracking-tightest">EXPORTS.</h1>
        </div>
        <span className="chip">{exports?.length ?? 0} FILES</span>
      </div>

      {exports === null ? (
        <div className="py-10"><Spinner>loading exports</Spinner></div>
      ) : exports.length === 0 ? (
        <div className="mt-5"><Empty text="no exports yet — finish a project first" /></div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {exports.map((e, i) => (
            <div key={e.id} className="flex flex-col gap-2 border-2 border-ink bg-card p-3 shadow-brutal-sm sm:flex-row sm:items-center">
              <div className={`grid h-9 w-9 shrink-0 place-items-center border-2 border-ink font-mono text-[11px] font-bold ${['bg-lime', 'bg-bubble', 'bg-tang', 'bg-acid'][i % 4]}`}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold uppercase">{e.project_name}</div>
                <div className="truncate font-mono text-[10px] lowercase text-ink/45">{e.output_path}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase text-ink/50">
                <span className="chip">{e.width}×{e.height}</span>
                <span>{e.duration?.toFixed(1)}s</span>
                <span className="hidden sm:inline">{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button className="btn btn-xs" onClick={() => open(e.output_path)}><FolderOpen size={12} /> FOLDER</button>
                <button className="btn btn-xs btn-tang" onClick={() => del(e)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}