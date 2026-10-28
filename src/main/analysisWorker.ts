/**
 * Worker thread for the heavy audio analysis (decoding envelopes, the FFT and takeover detection),
 * so the main process keeps the window, menus and IPC responsive while a set is analysed.
 * One job per worker: the main process terminates it to cancel.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { detectTakeovers } from '@shared/takeover'
import { analyseAudio, spectralFrames } from './audio'

export type AnalysisJob =
  | { type: 'analyse'; path: string }
  | { type: 'takeovers'; path: string; cues: number[]; duration: number; songs?: Array<{ title: string; artist: string }> }

export type AnalysisMessage = { type: 'progress'; p: number } | { type: 'done'; result: unknown } | { type: 'error'; message: string }

const post = (m: AnalysisMessage) => parentPort!.postMessage(m)

async function run(job: AnalysisJob) {
  if (job.type === 'analyse') return analyseAudio(job.path, (p) => post({ type: 'progress', p }))
  return detectTakeovers(await spectralFrames(job.path), job.cues, job.duration, job.songs)
}

run(workerData as AnalysisJob).then(
  (result) => post({ type: 'done', result }),
  (e: Error) => post({ type: 'error', message: e.message })
)
