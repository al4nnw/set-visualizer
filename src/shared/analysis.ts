/**
 * The set analysis math (waveform envelopes and spectral frames), with no Node or DOM dependencies,
 * so the browser (its own decode, see src/renderer/src/analysis) and the ffmpeg reference it's
 * checked against (scripts/ffmpeg/audio.ts) run the same code.
 *
 * The caller decodes the set into the mono streams `ANALYSIS_STREAMS` describes and pushes the
 * samples as they arrive; nothing holds the whole set in memory. A set can also be analysed in
 * pieces on several threads: each piece covers whole seconds of the set (`createSegmentAnalyser`)
 * and `mergeSegments` joins them into the same result one pass over the whole set gives.
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

/**
 * One mono float stream cut from the set. Every stream starts from the main one (the set downmixed
 * to mono and resampled to MAIN_RATE): its filter stages run on that, at MAIN_RATE, and then it is
 * resampled to `rate`.
 */
export interface StreamSpec {
  filters: FilterStage[]
  rate: number
}

export type StreamName = 'main' | 'bass' | 'vocal'

export const MAIN_RATE = 11025

export const ANALYSIS_STREAMS: Record<StreamName, StreamSpec> = {
  main: { filters: [], rate: MAIN_RATE },
  bass: { filters: [{ type: 'lowpass', f: 140 }, { type: 'lowpass', f: 140 }], rate: 2000 },
  vocal: { filters: [{ type: 'highpass', f: 250 }, { type: 'highpass', f: 250 }, { type: 'lowpass', f: 3500 }], rate: 8000 }
}

/**
 * Reduces a stream to `rate` buckets per second: absolute peak and RMS per bucket.
 * Samples per bucket can be fractional (11025 / 50 = 220.5), so bucket edges are placed by the
 * running sample count; rounding it per bucket would make the envelope drift away from the audio.
 * `firstBucket` is the bucket the first pushed sample starts (a segment that doesn't start the set).
 */
function envelope(sampleRate: number, rate: number, firstBucket = 0) {
  const per = sampleRate / rate
  let total = Math.round(firstBucket * per)
  let edge = Math.round((firstBucket + 1) * per)
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
          edge = Math.round((firstBucket + peaks.length + 2) * per)
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

/** Seconds of the set a segment covers: [from, to), `to` null for the rest of the set. */
export interface SegmentRange {
  from: number
  to: number | null
}

/**
 * One piece of the analysis, before the set-wide normalisation. Spectral rows are packed (frame i
 * is `frames.subarray(i * SPECTRUM_BANDS, ...)`) so the result moves between threads in a few
 * transferable buffers.
 */
export interface SegmentAnalysis {
  from: number
  peaks: number[]
  rms: number[]
  bass: number[]
  vocal: number[]
  spectrum?: { count: number; frames: Float32Array; power: Float32Array; totals: Float64Array }
}

/**
 * Analyses the seconds [from, to) of a set. Push each stream's samples starting at `from` (so the
 * main stream's first sample is sample `from * 11025` of the set). The main stream may run up to
 * a spectral frame past `to` (`SEGMENT_TAIL` seconds): those samples only complete the last frames
 * that start inside the segment; everything else past `to` is ignored.
 */
export function createSegmentAnalyser(range: SegmentRange, opts: { spectrum?: boolean } = {}) {
  if (!Number.isInteger(range.from) || (range.to !== null && !Number.isInteger(range.to))) throw new Error('Segments cover whole seconds')
  const firstBucket = range.from * WAVEFORM_RATE
  const main = envelope(ANALYSIS_STREAMS.main.rate, WAVEFORM_RATE, firstBucket)
  const bass = envelope(ANALYSIS_STREAMS.bass.rate, WAVEFORM_RATE, firstBucket)
  const vocal = envelope(ANALYSIS_STREAMS.vocal.rate, WAVEFORM_RATE, firstBucket)
  const spectrum = opts.spectrum ? spectralAccumulator(range.from * SPECTRUM_RATE, range.to === null ? Infinity : range.to * SPECTRUM_RATE) : null
  // Samples each envelope still takes (the stream's rate times the segment's length).
  const left = (s: StreamName) => (range.to === null ? Infinity : (range.to - range.from) * ANALYSIS_STREAMS[s].rate)
  const room: Record<StreamName, number> = { main: left('main'), bass: left('bass'), vocal: left('vocal') }
  const take = (s: StreamName, samples: Float32Array) => {
    const n = Math.min(samples.length, room[s])
    room[s] -= n
    return n === samples.length ? samples : samples.subarray(0, n)
  }
  return {
    push(stream: StreamName, samples: Float32Array) {
      if (stream === 'bass') return bass.push(take('bass', samples))
      if (stream === 'vocal') return vocal.push(take('vocal', samples))
      main.push(take('main', samples))
      spectrum?.push(samples)
    },
    /** Seconds of the main stream analysed so far, from the segment's start. */
    seconds: () => main.peaks.length / WAVEFORM_RATE,
    finish(): SegmentAnalysis {
      const m = main.finish()
      return { from: range.from, peaks: m.peaks, rms: m.rms, bass: bass.finish().rms, vocal: vocal.finish().rms, spectrum: spectrum?.finish() }
    }
  }
}

/** Seconds of the main stream a segment needs past its end, to finish its last spectral frames. */
export const SEGMENT_TAIL = 0.25

/**
 * Joins segments (in any order; together they must cover the set) into the set's waveform and
 * spectral frames: concatenated, then normalised over the whole set.
 */
export function mergeSegments(parts: SegmentAnalysis[]): { waveform: Waveform; spectrum?: SpectralFrames } {
  const sorted = [...parts].sort((a, b) => a.from - b.from)
  const cat = (k: 'peaks' | 'rms' | 'bass' | 'vocal') => (sorted.length === 1 ? sorted[0][k] : sorted.flatMap((p) => p[k]))
  const peaks = cat('peaks')
  const rms = cat('rms')
  // Peaks and RMS share one scale so the RMS stays a fraction of the peak.
  let max = 0
  for (const v of peaks) if (v > max) max = v
  const k = max > 0 ? 1 / max : 1
  const round = (v: number) => Math.round(v * k * 1000) / 1000
  const waveform: Waveform = { rate: WAVEFORM_RATE, peaks: peaks.map(round), rms: rms.map(round), bass: normalise(cat('bass')), vocal: normalise(cat('vocal')) }
  if (!sorted.every((p) => p.spectrum)) return { waveform }

  const frames: Float32Array[] = []
  const power: Float32Array[] = []
  const totals = new Float64Array(POWER_BANDS)
  for (const p of sorted) {
    const s = p.spectrum!
    for (let i = 0; i < s.count; i++) {
      frames.push(s.frames.subarray(i * BANDS, (i + 1) * BANDS))
      power.push(s.power.subarray(i * POWER_BANDS, (i + 1) * POWER_BANDS))
    }
    for (let b = 0; b < POWER_BANDS; b++) totals[b] += s.totals[b]
  }
  // Every band on the same footing, so the kick doesn't decide everything.
  for (const pw of power) for (let b = 0; b < POWER_BANDS; b++) pw[b] /= totals[b] / power.length || 1
  return { waveform, spectrum: { fps: SPECTRUM_RATE / HOP, frames, power } }
}

/**
 * Builds the waveform (full signal, bass and vocal band envelopes) and, with `spectrum`, the spectral
 * frames for takeover detection, from the decoded streams of one set in one pass.
 */
export function createSetAnalyser(opts: { spectrum?: boolean } = {}) {
  const seg = createSegmentAnalyser({ from: 0, to: null }, opts)
  return {
    push: seg.push,
    /** Seconds of the main stream analysed so far. */
    seconds: seg.seconds,
    finish: () => mergeSegments([seg.finish()])
  }
}

export const SPECTRUM_RATE = MAIN_RATE
const FFT_SIZE = 2048
const HOP = 2756 // ~4 frames per second
const BANDS = 32
const POWER_BANDS = 48
export const SPECTRUM_BANDS = BANDS
export const SPECTRUM_POWER_BANDS = POWER_BANDS

/** cos/sin of -2πk/len for every butterfly of a 2048-point FFT, computed once. */
const twiddles = (() => {
  const out: Array<{ c: Float64Array; s: Float64Array }> = []
  for (let len = 2; len <= FFT_SIZE; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const half = len / 2
    const c = new Float64Array(half)
    const s = new Float64Array(half)
    for (let k = 0; k < half; k++) {
      c[k] = Math.cos(ang * k)
      s[k] = Math.sin(ang * k)
    }
    out.push({ c, s })
  }
  return out
})()

/** In-place radix-2 FFT of FFT_SIZE points. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const r = re[i]
      re[i] = re[j]
      re[j] = r
      const m = im[i]
      im[i] = im[j]
      im[j] = m
    }
  }
  for (let len = 2, stage = 0; len <= n; len <<= 1, stage++) {
    const { c: cs, s: sn } = twiddles[stage]
    const half = len / 2
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = cs[k]
        const s = sn[k]
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
 * removed, used to tell tracks apart, and linear power in 48 bands over the same range (normalised
 * per band over the whole set by `mergeSegments`), used to measure how much of each track is in the mix.
 * Fed the mono 11,025 Hz samples as they're decoded, so the set is never held in memory whole.
 * `first` is the set's sample index of the first sample pushed; frames start every HOP samples of
 * the set, and only those starting before `end` are made.
 */
export function spectralAccumulator(first = 0, end = Infinity) {
  const bandEdges = (n: number) => Array.from({ length: n + 1 }, (_, b) => Math.round((40 * Math.pow(5000 / 40, b / n) * FFT_SIZE) / SPECTRUM_RATE))
  const edges = bandEdges(BANDS)
  const powerEdges = bandEdges(POWER_BANDS)
  const totals = new Float64Array(POWER_BANDS)
  const win = new Float64Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE))
  const re = new Float64Array(FFT_SIZE)
  const im = new Float64Array(FFT_SIZE)
  // Packed rows, grown as frames come in.
  let frames = new Float32Array(BANDS * 1024)
  let power = new Float32Array(POWER_BANDS * 1024)
  let count = 0
  // Samples not yet used by a frame; `pos` is where the next frame starts within them, `at` is the
  // set's sample index of x[0].
  let x = new Float32Array(FFT_SIZE * 8)
  let len = 0
  let at = first
  let pos = Math.ceil(first / HOP) * HOP - first

  const frame = (o: number) => {
    if (count * BANDS === frames.length) {
      const f2 = new Float32Array(frames.length * 2)
      f2.set(frames)
      frames = f2
      const p2 = new Float32Array(power.length * 2)
      p2.set(power)
      power = p2
    }
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = x[o + i] * win[i]
      im[i] = 0
    }
    fft(re, im)
    const f = frames.subarray(count * BANDS, (count + 1) * BANDS)
    let mean = 0
    for (let b = 0; b < BANDS; b++) {
      let e = 0
      for (let k = edges[b]; k < Math.max(edges[b + 1], edges[b] + 1); k++) e += re[k] * re[k] + im[k] * im[k]
      f[b] = Math.log(1e-6 + e)
      mean += f[b]
    }
    mean /= BANDS
    for (let b = 0; b < BANDS; b++) f[b] -= mean
    const pw = power.subarray(count * POWER_BANDS, (count + 1) * POWER_BANDS)
    for (let b = 0; b < POWER_BANDS; b++) {
      let e = 0
      for (let k = powerEdges[b]; k < Math.max(powerEdges[b + 1], powerEdges[b] + 1); k++) e += re[k] * re[k] + im[k] * im[k]
      pw[b] = e
      totals[b] += e
    }
    count++
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
        at += start
      }
      x.set(samples, len)
      len += samples.length
      for (; pos + FFT_SIZE <= len && at + pos < end; pos += HOP) frame(pos)
    },
    finish() {
      return { count, frames: frames.slice(0, count * BANDS), power: power.slice(0, count * POWER_BANDS), totals }
    }
  }
}

/** Spectral frames in two flat arrays (frame i at i * bands), to move between threads or store whole. */
export interface PackedSpectrum {
  fps: number
  count: number
  frames: Float32Array
  power: Float32Array
}

export function packSpectrum(s: SpectralFrames): PackedSpectrum {
  const count = s.frames.length
  const frames = new Float32Array(count * BANDS)
  const power = new Float32Array(s.power ? count * POWER_BANDS : 0)
  for (let i = 0; i < count; i++) {
    frames.set(s.frames[i], i * BANDS)
    if (s.power) power.set(s.power[i], i * POWER_BANDS)
  }
  return { fps: s.fps, count, frames, power }
}

/** Rows as views into the packed arrays (nothing is copied). */
export function unpackSpectrum(p: PackedSpectrum): SpectralFrames {
  const rows = (a: Float32Array, n: number) => Array.from({ length: p.count }, (_, i) => a.subarray(i * n, (i + 1) * n))
  return { fps: p.fps, frames: rows(p.frames, BANDS), power: p.power.length ? rows(p.power, POWER_BANDS) : undefined }
}
