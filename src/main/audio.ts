import { spawn } from 'node:child_process'
import type { Waveform } from '@shared/types'
import type { SpectralFrames } from '@shared/takeover'
import { ffmpegPath, probeDuration, runFfmpeg } from './ffmpeg'

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

const SPECTRUM_RATE = 11025
const FFT_SIZE = 2048
const HOP = 2756 // ~4 frames per second
const BANDS = 32
const POWER_BANDS = 48

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const half = len / 2
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = Math.cos(ang * k)
        const s = Math.sin(ang * k)
        const xr = re[i + k + half] * c - im[i + k + half] * s
        const xi = re[i + k + half] * s + im[i + k + half] * c
        re[i + k + half] = re[i + k] - xr
        im[i + k + half] = im[i + k] - xi
        re[i + k] += xr
        im[i + k] += xi
      }
    }
  }
}

/**
 * About 4 times a second: log energy in 32 bands (40 Hz to 5 kHz, log spaced) with each frame's mean
 * removed, used to tell tracks apart, and linear power in 48 bands over the same range, normalised
 * per band over the whole set, used to measure how much of each track is in the mix.
 */
export async function spectralFrames(file: string): Promise<SpectralFrames> {
  const raw = await runFfmpeg(['-i', file, '-vn', '-ac', '1', '-ar', String(SPECTRUM_RATE), '-f', 'f32le', '-'])
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4))
  const edges: number[] = []
  const bandEdges = (n: number) => Array.from({ length: n + 1 }, (_, b) => Math.round((40 * Math.pow(5000 / 40, b / n) * FFT_SIZE) / SPECTRUM_RATE))
  edges.push(...bandEdges(BANDS))
  const powerEdges = bandEdges(POWER_BANDS)
  const power: Float32Array[] = []
  const totals = new Float64Array(POWER_BANDS)
  const win = new Float64Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE))
  const re = new Float64Array(FFT_SIZE)
  const im = new Float64Array(FFT_SIZE)
  const frames: Float32Array[] = []
  for (let o = 0; o + FFT_SIZE <= x.length; o += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = x[o + i] * win[i]
      im[i] = 0
    }
    fft(re, im)
    const f = new Float32Array(BANDS)
    let mean = 0
    for (let b = 0; b < BANDS; b++) {
      let e = 0
      for (let k = edges[b]; k < Math.max(edges[b + 1], edges[b] + 1); k++) e += re[k] * re[k] + im[k] * im[k]
      f[b] = Math.log(1e-6 + e)
      mean += f[b]
    }
    mean /= BANDS
    for (let b = 0; b < BANDS; b++) f[b] -= mean
    frames.push(f)
    const pw = new Float32Array(POWER_BANDS)
    for (let b = 0; b < POWER_BANDS; b++) {
      let e = 0
      for (let k = powerEdges[b]; k < Math.max(powerEdges[b + 1], powerEdges[b] + 1); k++) e += re[k] * re[k] + im[k] * im[k]
      pw[b] = e
      totals[b] += e
    }
    power.push(pw)
  }
  // Every band on the same footing, so the kick doesn't decide everything.
  for (const pw of power) for (let b = 0; b < POWER_BANDS; b++) pw[b] /= totals[b] / power.length || 1
  return { fps: SPECTRUM_RATE / HOP, frames, power }
}
