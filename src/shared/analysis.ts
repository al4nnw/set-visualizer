/**
 * The set analysis math (waveform envelopes and spectral frames), with no Node or DOM dependencies,
 * so the desktop app (ffmpeg decode in a worker thread) and a browser worker run the same code.
 * The caller decodes the set into the mono streams `ANALYSIS_STREAMS` describes and pushes the
 * samples as they arrive; nothing holds the whole set in memory.
 */
import type { Waveform } from './types'
import type { SpectralFrames } from './takeover'

export const WAVEFORM_RATE = 50

/** One filter stage applied to a stream before it's resampled (same meaning as ffmpeg's lowpass/highpass). */
export interface FilterStage {
  type: 'lowpass' | 'highpass'
  /** Cutoff in Hz. */
  f: number
}

/** One mono float stream cut from the set: the filter stages, in order, then resampled to `rate`. */
export interface StreamSpec {
  filters: FilterStage[]
  rate: number
}

export type StreamName = 'main' | 'bass' | 'vocal'

const MAIN_RATE = 11025

export const ANALYSIS_STREAMS: Record<StreamName, StreamSpec> = {
  main: { filters: [], rate: MAIN_RATE },
  bass: { filters: [{ type: 'lowpass', f: 140 }, { type: 'lowpass', f: 140 }], rate: 2000 },
  vocal: { filters: [{ type: 'highpass', f: 250 }, { type: 'highpass', f: 250 }, { type: 'lowpass', f: 3500 }], rate: 8000 }
}

/**
 * Reduces a stream to `rate` buckets per second: absolute peak and RMS per bucket.
 * Samples per bucket can be fractional (11025 / 50 = 220.5), so bucket edges are placed by the
 * running sample count; rounding it per bucket would make the envelope drift away from the audio.
 */
function envelope(sampleRate: number, rate: number) {
  const per = sampleRate / rate
  let total = 0
  let edge = Math.round(per)
  const peaks: number[] = []
  const rms: number[] = []
  let n = 0
  let pk = 0
  let sq = 0
  return {
    peaks,
    push(samples: Float32Array) {
      for (let j = 0; j < samples.length; j++) {
        const v = samples[j]
        const a = v < 0 ? -v : v
        if (a > pk) pk = a
        sq += v * v
        n++
        if (++total >= edge) {
          edge = Math.round((peaks.length + 2) * per)
          peaks.push(pk)
          rms.push(Math.sqrt(sq / n))
          n = 0
          pk = 0
          sq = 0
        }
      }
    },
    finish() {
      if (n > 0) {
        peaks.push(pk)
        rms.push(Math.sqrt(sq / n))
      }
      return { peaks, rms }
    }
  }
}

const normalise = (arr: number[]) => {
  let max = 0
  for (const v of arr) if (v > max) max = v
  if (max <= 0) return arr
  return arr.map((v) => Math.round((v / max) * 1000) / 1000)
}

/**
 * Builds the waveform (full signal, bass and vocal band envelopes) and, with `spectrum`, the spectral
 * frames for takeover detection, from the decoded streams of one set.
 */
export function createSetAnalyser(opts: { spectrum?: boolean } = {}) {
  const main = envelope(ANALYSIS_STREAMS.main.rate, WAVEFORM_RATE)
  const bass = envelope(ANALYSIS_STREAMS.bass.rate, WAVEFORM_RATE)
  const vocal = envelope(ANALYSIS_STREAMS.vocal.rate, WAVEFORM_RATE)
  const spectrum = opts.spectrum ? spectralAccumulator() : null
  return {
    push(stream: StreamName, samples: Float32Array) {
      if (stream === 'bass') return bass.push(samples)
      if (stream === 'vocal') return vocal.push(samples)
      main.push(samples)
      spectrum?.push(samples)
    },
    /** Seconds of the main stream analysed so far. */
    seconds: () => main.peaks.length / WAVEFORM_RATE,
    finish(): { waveform: Waveform; spectrum?: SpectralFrames } {
      const full = main.finish()
      // Peaks and RMS share one scale so the RMS stays a fraction of the peak.
      let max = 0
      for (const v of full.peaks) if (v > max) max = v
      const k = max > 0 ? 1 / max : 1
      const round = (v: number) => Math.round(v * k * 1000) / 1000
      return {
        waveform: { rate: WAVEFORM_RATE, peaks: full.peaks.map(round), rms: full.rms.map(round), bass: normalise(bass.finish().rms), vocal: normalise(vocal.finish().rms) },
        spectrum: spectrum?.finish()
      }
    }
  }
}

export const SPECTRUM_RATE = MAIN_RATE
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
 * Fed the mono 11,025 Hz samples as they're decoded, so the set is never held in memory whole.
 */
export function spectralAccumulator() {
  const bandEdges = (n: number) => Array.from({ length: n + 1 }, (_, b) => Math.round((40 * Math.pow(5000 / 40, b / n) * FFT_SIZE) / SPECTRUM_RATE))
  const edges = bandEdges(BANDS)
  const powerEdges = bandEdges(POWER_BANDS)
  const power: Float32Array[] = []
  const totals = new Float64Array(POWER_BANDS)
  const win = new Float64Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE))
  const re = new Float64Array(FFT_SIZE)
  const im = new Float64Array(FFT_SIZE)
  const frames: Float32Array[] = []
  // Samples not yet used by a frame; `pos` is where the next frame starts within them.
  let x = new Float32Array(FFT_SIZE * 8)
  let len = 0
  let pos = 0

  const frame = (o: number) => {
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

  return {
    push(samples: Float32Array) {
      if (len + samples.length > x.length) {
        // Drop what's been used, and grow only if a chunk is bigger than the room left. The next
        // frame can start past the samples held so far (the hop is longer than a frame).
        const start = Math.min(pos, len)
        const keep = x.subarray(start, len)
        const next = keep.length + samples.length > x.length ? new Float32Array((keep.length + samples.length) * 2) : x
        next.set(keep)
        x = next
        len = keep.length
        pos -= start
      }
      x.set(samples, len)
      len += samples.length
      for (; pos + FFT_SIZE <= len; pos += HOP) frame(pos)
    },
    finish(): SpectralFrames {
      // Every band on the same footing, so the kick doesn't decide everything.
      for (const pw of power) for (let b = 0; b < POWER_BANDS; b++) pw[b] /= totals[b] / power.length || 1
      return { fps: SPECTRUM_RATE / HOP, frames, power }
    }
  }
}
