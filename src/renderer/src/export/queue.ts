import { useSyncExternalStore } from 'react'
import type { ExportProgress, ExportRange, Project } from '@shared/types'
import { runExport } from './runExport'

/**
 * The exports the user started, run one at a time in the background (encoding is what takes the
 * time, and two at once would each take twice as long; the desktop also muxes one at a time), so
 * the app stays usable meanwhile. Each job keeps the project as it was when it was added. Jobs still
 * waiting can be moved up or down the list.
 */

export interface ExportJob {
  id: number
  /** What the job list shows: the set's or the clip's title. */
  label: string
  /** A clip export: the clip it came from. */
  clipId?: string
  project: Project
  out: string
  range?: ExportRange
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  progress?: ExportProgress
  error?: string
}

let jobs: ExportJob[] = []
let nextId = 1
let running: { id: number; abort: AbortController } | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())
const patch = (id: number, p: Partial<ExportJob>) => {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j))
  emit()
}

async function pump() {
  if (running) return
  const job = jobs.find((j) => j.status === 'queued')
  if (!job) return
  const abort = new AbortController()
  running = { id: job.id, abort }
  patch(job.id, { status: 'running' })
  try {
    await runExport(job.project, job.out, (progress) => patch(job.id, { progress }), abort.signal, job.range)
    patch(job.id, { status: 'done' })
  } catch (e) {
    patch(job.id, abort.signal.aborted ? { status: 'cancelled' } : { status: 'error', error: (e as Error).message })
  } finally {
    running = null
    void pump()
  }
}

export const exportQueue = {
  add(job: Pick<ExportJob, 'label' | 'clipId' | 'project' | 'out' | 'range'>) {
    jobs = [...jobs, { ...job, id: nextId++, status: 'queued' }]
    emit()
    void pump()
  },
  /** Stops a running job, or takes a waiting one off the list. */
  cancel(id: number) {
    if (running?.id === id) running.abort.abort()
    else if (jobs.some((j) => j.id === id && j.status === 'queued')) patch(id, { status: 'cancelled' })
  },
  /** Clears a finished job from the list. */
  dismiss(id: number) {
    jobs = jobs.filter((j) => j.id !== id || j.status === 'queued' || j.status === 'running')
    emit()
  },
  /** Moves a waiting job earlier (-1) or later (+1) among the waiting ones. */
  move(id: number, dir: -1 | 1) {
    const waiting = jobs.filter((j) => j.status === 'queued')
    const i = waiting.findIndex((j) => j.id === id)
    const other = waiting[i + dir]
    if (i < 0 || !other) return
    const a = jobs.indexOf(waiting[i])
    const b = jobs.indexOf(other)
    const next = [...jobs]
    ;[next[a], next[b]] = [next[b], next[a]]
    jobs = next
    emit()
  },
  /** Whether an export is running or waiting. */
  busy: () => jobs.some((j) => j.status === 'queued' || j.status === 'running'),
  subscribe(l: () => void) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  snapshot: () => jobs
}

export const useExportJobs = () => useSyncExternalStore(exportQueue.subscribe, exportQueue.snapshot)
