import { spawn } from 'node:child_process'
import type { Waveform } from '@shared/types'
import { ffmpegPath, probeDuration } from './ffmpeg'

export const WAVEFORM_RATE = 50

/**
 * Streams the decoded audio through ffmpeg and reduces it to `rate` buckets per second:
 * absolute peak and RMS of the full signal, plus RMS of a low-passed copy for the bass pulse.
 */
function envelope(
  file: string,
  sampleRate: number,
  filter: string | null,
  rate: number,
  duration: number,
  onProgress?: (p: number) => void
): Promise<{ peaks: number[]; rms: number[] }> {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1']
    if (filter) args.push('-af', filter)
    args.push('-ar', String(sampleRate), '-f', 'f32le', '-')
    const p = spawn(ffmpegPath, args)
    const per = sampleRate / rate
    const peaks: number[] = []
    const rms: number[] = []
    let n = 0
    let pk = 0
    let sq = 0
    let leftover: Buffer = Buffer.alloc(0)
    let err = ''
    let lastReport = 0
    p.stdout.on('data', (chunk: Buffer) => {
      const buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk
      const usable = buf.length - (buf.length % 4)
      for (let o = 0; o < usable; o += 4) {
        const v = buf.readFloatLE(o)
        const a = v < 0 ? -v : v
        if (a > pk) pk = a
        sq += v * v
        if (++n >= per) {
          peaks.push(pk)
          rms.push(Math.sqrt(sq / n))
          n = 0
          pk = 0
          sq = 0
        }
      }
      leftover = buf.subarray(usable)
      const progress = peaks.length / rate / Math.max(1, duration)
      if (onProgress && progress - lastReport > 0.01) {
        lastReport = progress
        onProgress(Math.min(1, progress))
      }
    })
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Could not decode audio: ${err.slice(-500)}`))
      if (n > 0) {
        peaks.push(pk)
        rms.push(Math.sqrt(sq / n))
      }
      resolve({ peaks, rms })
    })
  })
}

const normalise = (arr: number[]) => {
  let max = 0
  for (const v of arr) if (v > max) max = v
  if (max <= 0) return arr
  return arr.map((v) => Math.round((v / max) * 1000) / 1000)
}

export async function analyseAudio(file: string, onProgress?: (p: number) => void): Promise<{ duration: number; waveform: Waveform }> {
  const duration = await probeDuration(file)
  let full = 0
  let low = 0
  const report = () => onProgress?.(full * 0.7 + low * 0.3)
  const [main, bass] = await Promise.all([
    envelope(file, 11025, null, WAVEFORM_RATE, duration, (p) => ((full = p), report())),
    envelope(file, 2000, 'lowpass=f=140,lowpass=f=140', WAVEFORM_RATE, duration, (p) => ((low = p), report()))
  ])
  // Peaks and RMS share one scale so the RMS stays a fraction of the peak.
  let max = 0
  for (const v of main.peaks) if (v > max) max = v
  const k = max > 0 ? 1 / max : 1
  const round = (v: number) => Math.round(v * k * 1000) / 1000
  return {
    duration,
    waveform: { rate: WAVEFORM_RATE, peaks: main.peaks.map(round), rms: main.rms.map(round), bass: normalise(bass.rms) }
  }
}
