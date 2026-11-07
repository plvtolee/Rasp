import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { Job } from '../types'

/* Polls the backend job registry while anything is running. */
export function useJobs(intervalMs = 1200) {
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const data = await api.get<{ jobs: Job[] }>('/api/jobs')
        if (!alive) return
        setJobs(data.jobs)
        timer = setTimeout(tick, data.jobs.some((j) => j.status === 'running' || j.status === 'cancelling') ? intervalMs : 4000)
      } catch {
        if (!alive) return
        timer = setTimeout(tick, 4000)
      }
    }
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [intervalMs])

  return jobs
}

export function useJobFollow(jobId: string | null, onDone?: (job: Job) => void, onFail?: (job: Job) => void, onTick?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null)
  const doneRef = useRef<string | null>(null)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }
    let alive = true
    doneRef.current = null
    const tick = async () => {
      try {
        const j = await api.get<Job>(`/api/jobs/${jobId}`)
        if (!alive) return
        setJob(j)
        onTick?.(j)
        if (j.status === 'running' || j.status === 'cancelling') {
          setTimeout(tick, 900)
        } else if (doneRef.current !== j.id) {
          doneRef.current = j.id
          if (j.status === 'done') onDone?.(j)
          if (j.status === 'failed') onFail?.(j)
        }
      } catch {
        if (alive) setTimeout(tick, 1500)
      }
    }
    tick()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return job
}
