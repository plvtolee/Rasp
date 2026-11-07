import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { Project, Settings, Transcript } from '../types'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/* Central editor state: local-first editing, debounced persistence. */
export function useProject(pid: string) {
  const [project, setProject] = useState<Project | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<Settings | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await api.get<{ project: Project }>(`/api/projects/${pid}`)
      setProject(data.project)
      setTranscript((data.project.transcript ?? null) as Transcript | null)
      latest.current = data.project.settings
    } catch (e: any) {
      setError(String(e.message || e))
    }
  }, [pid])

  useEffect(() => {
    reload()
  }, [reload])

  const mutate = useCallback(
    (patch: DeepPartial<Settings>) => {
      setProject((p) => {
        if (!p) return p
        const merged = mergeDeep(p.settings, patch as any)
        latest.current = merged
        return { ...p, settings: merged }
      })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setSaving(true)
        api
          .patch(`/api/projects/${pid}`, { settings: latest.current })
          .finally(() => setSaving(false))
      }, 500)
    },
    [pid],
  )

  return { project, transcript, setTranscript, mutate, reload, error, saving }
}

function mergeDeep(base: any, patch: any): any {
  if (typeof base !== 'object' || base === null) return patch
  const out = { ...base }
  for (const k of Object.keys(patch)) {
    const v = (patch as any)[k]
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) out[k] = mergeDeep(out[k] ?? {}, v)
    else out[k] = v
  }
  return out
}
