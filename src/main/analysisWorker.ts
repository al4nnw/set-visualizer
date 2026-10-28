/**
 * Worker thread for the heavy audio analysis (decoding, envelopes, the FFT and takeover detection),
 * so the main process keeps the window, menus and IPC responsive while a set is analysed.
 * One job per worker: the main process terminates it to cancel. Results go into the analysis cache
 * (`cacheDir`), so takeover detection reuses the spectrum from the analysis instead of decoding again.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { detectTakeovers } from '@shared/takeover'
import { analyseAudio, spectralFrames } from './audio'
import { readSpectrum, writeSpectrum, writeWaveform } from './analysisCache'

export type AnalysisJob =
  | { type: 'analyse'; path: string; cacheDir: string }
  | { type: 'takeovers'; path: string; cacheDir: string; cues: number[]; duration: number; songs?: Array<{ title: string; artist: string }> }

export type AnalysisMessage = { type: 'progress'; p: number } | { type: 'done'; result: unknown } | { type: 'error'; message: string }

const post = (m: AnalysisMessage) => parentPort!.postMessage(m)

async function run(job: AnalysisJob) {
  if (job.type === 'analyse') {
    const { duration, waveform, spectrum } = await analyseAudio(job.path, (p) => post({ type: 'progress', p }), { spectrum: true })
    // A cache that can't be written only costs a later re-analysis.
    await Promise.all([writeWaveform(job.cacheDir, job.path, waveform), writeSpectrum(job.cacheDir, job.path, spectrum!)]).catch(() => {})
    return { duration, waveform }
  }
  let spectrum = await readSpectrum(job.cacheDir, job.path).catch(() => null)
  if (!spectrum) {
    spectrum = await spectralFrames(job.path)
    await writeSpectrum(job.cacheDir, job.path, spectrum).catch(() => {})
  }
  return detectTakeovers(spectrum, job.cues, job.duration, job.songs)
}

run(workerData as AnalysisJob).then(
  (result) => post({ type: 'done', result }),
  (e: Error) => post({ type: 'error', message: e.message })
)
