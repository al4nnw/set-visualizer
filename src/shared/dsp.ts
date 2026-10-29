/**
 * The filters and resampler the set analysis runs on decoded audio in the browser, built to give
 * what ffmpeg gives the desktop app for the same graph (src/main/audio.ts): its `lowpass` /
 * `highpass` biquads (RBJ cookbook, Q 0.707) and libswresample's default resampler (Kaiser-windowed
 * sinc, filter size 32, cutoff 0.97, beta 9, exact rational phases). No Node or DOM dependencies.
 */
import type { FilterStage } from './analysis'

/** ffmpeg's default width for lowpass/highpass (a Q factor). */
const FFMPEG_Q = 0.707

/** Normalised biquad coefficients (a0 = 1). */
export interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** Coefficients of ffmpeg's 2-pole `lowpass` / `highpass` at `f` Hz for sample rate `fs`. */
export function biquadFor(stage: FilterStage, fs: number, q = FFMPEG_Q): Biquad {
  const w0 = (2 * Math.PI * stage.f) / fs
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  const b0 = stage.type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
  const b1 = stage.type === 'lowpass' ? 1 - cos : -(1 + cos)
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }
}

/**
 * Biquad stages run in order over a stream, keeping their state from one chunk to the next.
 * Computed in float32 in the same order as ffmpeg's float biquad (direct form I), so the filtered
 * stream matches ffmpeg's sample for sample, not just closely.
 */
export class FilterChain {
  private readonly c: Float32Array
  // Direct form I history per stage: x[n-1], x[n-2], y[n-1], y[n-2].
  private readonly s: Float32Array
  private readonly n: number

  constructor(stages: FilterStage[], fs: number) {
    this.n = stages.length
    // b0, b1, b2, -a1, -a2 per stage, rounded to float like ffmpeg's float coefficients.
    this.c = new Float32Array(stages.flatMap((st) => {
      const q = biquadFor(st, fs)
      return [q.b0, q.b1, q.b2, -q.a1, -q.a2]
    }))
    this.s = new Float32Array(stages.length * 4)
  }

  get empty() {
    return this.n === 0
  }

  /** Filters `buf` in place. */
  process(buf: Float32Array) {
    const s = this.s
    const f = Math.fround
    for (let k = 0; k < this.n; k++) {
      const b0 = this.c[k * 5]
      const b1 = this.c[k * 5 + 1]
      const b2 = this.c[k * 5 + 2]
      const a1 = this.c[k * 5 + 3]
      const a2 = this.c[k * 5 + 4]
      let x1 = s[k * 4]
      let x2 = s[k * 4 + 1]
      let y1 = s[k * 4 + 2]
      let y2 = s[k * 4 + 3]
      for (let i = 0; i < buf.length; i++) {
        const x = buf[i]
        // ffmpeg: o = i2 * b2 + i1 * b1 + in * b0 + o2 * a2 + o1 * a1, left to right in float.
        const y = f(f(f(f(f(x2 * b2) + f(x1 * b1)) + f(x * b0)) + f(y2 * a2)) + f(y1 * a1))
        x2 = x1
        x1 = x
        y2 = y1
        y1 = y
        buf[i] = y
      }
      s[k * 4] = x1
      s[k * 4 + 1] = x2
      s[k * 4 + 2] = y1
      s[k * 4 + 3] = y2
    }
  }
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** Modified Bessel function of the first kind, order 0 (for the Kaiser window). */
function besselI0(x: number) {
  let sum = 1
  let term = 1
  const q = (x * x) / 4
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k)
    sum += term
    if (term < sum * 1e-17) break
  }
  return sum
}

export interface ResamplerOptions {
  /** Taps at the lower of the two rates (libswresample's filter_size). */
  filterSize?: number
  /** Passband edge as a fraction of the lower Nyquist frequency. */
  cutoff?: number
  /** Kaiser window beta. */
  beta?: number
}

/** The polyphase filter for one rate pair: `phases` rows of `taps` coefficients. */
export interface PolyphaseFilter {
  /** Output samples per `down` input samples, in lowest terms. */
  up: number
  down: number
  taps: number
  /** Tap index of the input sample at (or just before) the output's position. */
  center: number
  phases: number
  table: Float32Array
}

/** Most phases computed exactly; above this a rate pair falls back to the nearest of this many. */
const MAX_PHASES = 1024

/** Designs the anti-alias/interpolation filter libswresample uses for inRate → outRate. */
export function designResampler(inRate: number, outRate: number, opts: ResamplerOptions = {}): PolyphaseFilter {
  const filterSize = opts.filterSize ?? 32
  const cutoff = opts.cutoff ?? 0.97
  const beta = opts.beta ?? 9
  const g = gcd(inRate, outRate)
  const up = outRate / g
  const down = inRate / g
  const factor = Math.min((outRate * cutoff) / inRate, 1)
  let taps = Math.max(Math.ceil(filterSize / factor), 1)
  if (taps > 1) taps += taps % 2
  const center = Math.floor((taps - 1) / 2)
  const phases = Math.min(up, MAX_PHASES)
  const table = new Float32Array(phases * taps)
  let norm = 0
  const row = new Float64Array(taps)
  for (let ph = 0; ph < phases; ph++) {
    for (let i = 0; i < taps; i++) {
      const d = i - center - ph / phases
      const x = Math.PI * d * factor
      let y = x === 0 ? 1 : Math.sin(x) / x
      const w = (2 * d) / taps
      y *= besselI0(beta * Math.sqrt(Math.max(1 - w * w, 0)))
      row[i] = y
      if (ph === 0) norm += y
    }
    for (let i = 0; i < taps; i++) table[ph * taps + i] = row[i] / norm
  }
  return { up, down, taps, center, phases, table }
}

/**
 * Computes `count` outputs into `out` (from `outOffset`): output j uses the input window starting
 * at x[start_j] with filter phase p_j, starting from (`start`, `phase`) and stepping `down` input
 * positions per output in units of 1/`up`. Returns the window start and phase after the last one.
 * This is the hot loop of the browser analysis (it can be swapped for a faster kernel).
 */
export type ResampleKernel = (
  f: PolyphaseFilter,
  x: Float32Array,
  start: number,
  phase: number,
  count: number,
  out: Float32Array,
  outOffset: number
) => void

export const jsKernel: ResampleKernel = (f, x, start, phase, count, out, outOffset) => {
  const { taps, table, up, down, phases } = f
  const exact = phases === up
  const stepInt = Math.floor(down / up)
  const stepFrac = down % up
  for (let j = 0; j < count; j++) {
    const row = (exact ? phase : Math.floor((phase * phases) / up)) * taps
    let acc0 = 0
    let acc1 = 0
    let acc2 = 0
    let acc3 = 0
    let i = 0
    for (; i + 3 < taps; i += 4) {
      acc0 += table[row + i] * x[start + i]
      acc1 += table[row + i + 1] * x[start + i + 1]
      acc2 += table[row + i + 2] * x[start + i + 2]
      acc3 += table[row + i + 3] * x[start + i + 3]
    }
    for (; i < taps; i++) acc0 += table[row + i] * x[start + i]
    out[outOffset + j] = acc0 + acc1 + acc2 + acc3
    start += stepInt
    phase += stepFrac
    if (phase >= up) {
      phase -= up
      start++
    }
  }
}

/**
 * Streaming resampler. Output n sits at input position n * inRate / outRate (the filter is
 * centred on it), so a stream resampled in pieces lines up sample for sample with one resampled
 * whole. Like libswresample, the input is mirrored past both ends of the file (x[-k] = x[k] before
 * the first sample, x[N+k] = x[N-1-k] after the last), which gives its output sample for sample.
 */
export class Resampler {
  readonly f: PolyphaseFilter
  private buf: Float32Array
  private len = 0
  /** Absolute input index of buf[0]. */
  private bufStart: number
  /** Next output to compute. */
  private n: number
  private kernel: ResampleKernel
  /** Samples of mirrored lead-in still to fill once enough of the file has arrived. */
  private mirrorPad = 0

  /**
   * `inputStart`: absolute index of the first input sample pushed. `outputStart`: first output
   * wanted (outputs before it are skipped); its window must be covered by the input, or start at 0.
   */
  constructor(inRate: number, outRate: number, opts: ResamplerOptions & { inputStart?: number; outputStart?: number; kernel?: ResampleKernel } = {}) {
    this.f = designResampler(inRate, outRate, opts)
    this.kernel = opts.kernel ?? jsKernel
    this.n = opts.outputStart ?? 0
    const inputStart = opts.inputStart ?? 0
    const first = this.windowStart(this.n)
    if (first < inputStart && inputStart > 0) throw new Error('Resampler input starts after the first output needs it')
    // Before the start of the file: mirrored, filled in when the first samples arrive.
    const pad = Math.max(0, inputStart - first)
    this.bufStart = inputStart - pad
    this.buf = new Float32Array(Math.max(4096, this.f.taps * 4))
    this.len = pad
    this.mirrorPad = pad
  }

  /** Absolute input index where output n's window starts. */
  private windowStart(n: number) {
    return Math.floor((n * this.f.down) / this.f.up) - this.f.center
  }

  /** Outputs that the samples pushed so far complete. */
  push(samples: Float32Array): Float32Array {
    this.append(samples)
    return this.run(false)
  }

  /** The remaining outputs at the end of the stream (the file's end, mirrored). */
  flush(): Float32Array {
    this.fillMirror(true)
    return this.run(true)
  }

  private fillMirror(force: boolean) {
    const pad = this.mirrorPad
    if (!pad) return
    const have = this.len - pad
    if (have < pad + 1 && !force) return
    for (let k = 1; k <= pad; k++) this.buf[pad - k] = have > 0 ? this.buf[pad + Math.min(k, have - 1)] : 0
    this.mirrorPad = 0
  }

  private append(samples: Float32Array) {
    // Input before the next output's window isn't needed any more (a segment's warm-up only runs
    // the filters, so its start can be ahead of everything held so far).
    const drop = this.mirrorPad ? 0 : this.windowStart(this.n) - this.bufStart
    if (drop >= this.len && drop > 0) {
      const skip = Math.min(samples.length, drop - this.len)
      this.bufStart += this.len + skip
      this.len = 0
      samples = samples.subarray(skip)
    } else if (drop > 0 && this.len + samples.length > this.buf.length) {
      this.buf.copyWithin(0, drop, this.len)
      this.len -= drop
      this.bufStart += drop
    }
    if (this.len + samples.length > this.buf.length) {
      const next = new Float32Array(Math.max(this.buf.length * 2, this.len + samples.length))
      next.set(this.buf.subarray(0, this.len))
      this.buf = next
    }
    this.buf.set(samples, this.len)
    this.len += samples.length
    this.fillMirror(false)
  }

  private run(end: boolean): Float32Array {
    const { taps, up, down } = this.f
    const inputEnd = this.bufStart + this.len
    // Last output whose window fits in what we have; at the end, every output whose position is
    // before the end of the input (its window padded with silence).
    let last: number
    if (end) {
      last = Math.ceil((inputEnd * up) / down) - 1
      const need = this.windowStart(last) + taps - inputEnd
      if (need > 0) {
        const tail = new Float32Array(need)
        for (let k = 0; k < need; k++) tail[k] = this.buf[Math.max(0, this.len - 1 - k)]
        this.append(tail)
      }
    } else {
      // windowStart(n) + taps <= inputEnd  <=>  floor(n * down / up) <= inputEnd - taps + center
      last = Math.floor(((inputEnd - taps + this.f.center + 1) * up - 1) / down)
    }
    const count = Math.max(0, last - this.n + 1)
    const out = new Float32Array(count)
    if (count) {
      const start = this.windowStart(this.n) - this.bufStart
      const phase = (this.n * down) % up
      this.kernel(this.f, this.buf, start, phase, count, out, 0)
      this.n += count
    }
    return out
  }
}
