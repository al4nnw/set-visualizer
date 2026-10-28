import { sameSong } from './tracklist'

/**
 * Finding where the incoming track actually takes over.
 *
 * DJ software (Rekordbox, Serato...) writes a cue when a deck starts playing, which is often while
 * it's still faded down or EQ'd out. To place the A/B swap where it's heard, each moment after the
 * cue is compared with a spectral profile of the outgoing track (before the cue) and of the incoming
 * one (later on, before the next cue). The swap goes where the mix flips from sounding like one to
 * the other.
 */

export interface SpectralFrames {
  /** Frames per second. */
  fps: number
  /** One row per frame: log band energies with the frame's mean removed (so loudness doesn't matter). */
  frames: Float32Array[]
  /** One row per frame: linear band power, each band divided by its average over the set. */
  power?: Float32Array[]
}

/** How far after the cue to look for the takeover. */
export const TAKEOVER_WINDOW = 180
/** Used when the audio doesn't show a clear change. */
export const FALLBACK_TAKEOVER = 32
/** Minimum jump in "sounds like the new track" for a detection to be trusted (0..1 scale). */
const MIN_CONTRAST = 0.15
/** Cost of switching tracks in the whole-set pass, in per-second spectral distance units. */
const SWITCH_PENALTY = 30

function meanProfile(s: SpectralFrames, from: number, to: number): Float64Array | null {
  const a = Math.max(0, Math.round(from * s.fps))
  const z = Math.min(s.frames.length, Math.round(to * s.fps))
  if (z <= a) return null
  const bands = s.frames[0].length
  const out = new Float64Array(bands)
  for (let i = a; i < z; i++) for (let b = 0; b < bands; b++) out[b] += s.frames[i][b]
  for (let b = 0; b < bands; b++) out[b] /= z - a
  return out
}

function dist(p: Float64Array, q: Float64Array): number {
  let d = 0
  for (let i = 0; i < p.length; i++) d += (p[i] - q[i]) ** 2
  return Math.sqrt(d)
}

/**
 * Best single step in `v` (least squares), requiring it to go up and leave `margin` samples on each
 * side. Returns the index of the first sample after the step and how much the mean rises.
 */
export function stepUp(v: number[], margin: number): { at: number; contrast: number; low: number; high: number } | null {
  const n = v.length
  const prefix = [0]
  const prefixSq = [0]
  for (const x of v) {
    prefix.push(prefix[prefix.length - 1] + x)
    prefixSq.push(prefixSq[prefixSq.length - 1] + x * x)
  }
  let best: { at: number; contrast: number; low: number; high: number; err: number } | null = null
  for (let i = margin; i <= n - margin; i++) {
    const sa = prefix[i]
    const sz = prefix[n] - sa
    const ma = sa / i
    const mz = sz / (n - i)
    if (mz <= ma) continue
    const err = prefixSq[i] - sa * ma + (prefixSq[n] - prefixSq[i]) - sz * mz
    if (!best || err < best.err) best = { at: i, contrast: mz - ma, low: ma, high: mz, err }
  }
  return best && { at: best.at, contrast: best.contrast, low: best.low, high: best.high }
}

/**
 * DJs often crossfade over a while, and the step lands in the middle of it. The outgoing track only
 * drops to the background once the mix is almost all the new track, so the swap goes at the first
 * second from which the next few seconds average at least 85% of the way from the low level to the
 * upper quartile of what follows the step.
 */
export function settledAt(like: number[], step: { at: number; low: number }, hold = 6): number {
  const after = like.slice(step.at).sort((a, b) => a - b)
  const high = after[Math.floor(after.length * 0.75)] ?? step.low
  const target = step.low + 0.85 * (high - step.low)
  for (let i = step.at; i + hold <= like.length; i++) {
    let sum = 0
    for (let j = i; j < i + hold; j++) sum += like[j]
    if (sum / hold >= target) return i
  }
  return step.at
}

/** Seconds the outgoing track is assumed to keep playing under the new one when it can't be measured. */
export const FALLBACK_TAIL = 16

export interface Transition {
  /** When the incoming track takes over. */
  start: number
  /** When it starts being heard (it appears on the right from here). */
  audibleAt: number
  /** When the outgoing track stops being heard. */
  tailEnd: number
}

const quantile = (v: number[], p: number) => {
  const sorted = [...v].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}

function meanPower(s: SpectralFrames, from: number, to: number): Float64Array | null {
  const power = s.power
  if (!power?.length) return null
  const a = Math.max(0, Math.round(from * s.fps))
  const z = Math.min(power.length, Math.round(to * s.fps))
  if (z <= a) return null
  const out = new Float64Array(power[0].length)
  for (let i = a; i < z; i++) for (let b = 0; b < out.length; b++) out[b] += power[i][b]
  for (let b = 0; b < out.length; b++) out[b] /= z - a
  return out
}

/**
 * Share of the incoming track in the mix at each second from `from` to `to`, smoothed over a few
 * seconds. Each second's spectrum is fitted as a non-negative blend of the two tracks' spectra
 * (power adds up when two decks play together), and the share is the incoming part's loudness.
 */
export function incomingShare(s: SpectralFrames, a: Float64Array, b: Float64Array, from: number, to: number): number[] {
  const dot = (p: ArrayLike<number>, q: ArrayLike<number>) => {
    let d = 0
    for (let i = 0; i < p.length; i++) d += p[i] * q[i]
    return d
  }
  const sumA = a.reduce((x, v) => x + v, 0)
  const sumB = b.reduce((x, v) => x + v, 0)
  const aa = dot(a, a)
  const bb = dot(b, b)
  const ab = dot(a, b)
  const det = aa * bb - ab * ab
  const raw: number[] = []
  for (let t = from; t < to; t++) {
    const x = meanPower(s, t - 1, t + 1)
    if (!x || det <= 0) {
      raw.push(0.5)
      continue
    }
    const xa = dot(x, a)
    const xb = dot(x, b)
    let wa = (xa * bb - xb * ab) / det
    let wb = (xb * aa - xa * ab) / det
    if (wa < 0) [wa, wb] = [0, Math.max(0, xb / bb)]
    if (wb < 0) [wa, wb] = [Math.max(0, xa / aa), 0]
    const la = wa * sumA
    const lb = wb * sumB
    raw.push(la + lb > 0 ? lb / (la + lb) : 0.5)
  }
  return raw.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - 3); j <= Math.min(raw.length - 1, i + 3); j++) {
      sum += raw[j]
      n++
    }
    return sum / n
  })
}

/**
 * When the incoming track starts being heard and when the outgoing one is gone, around a takeover.
 * Each track's spectrum comes from where it plays alone: the outgoing one just before the incoming
 * deck starts (`cue`), the incoming one in the minute before the next deck starts. How much of the
 * incoming track shows up while the outgoing one is alone sets the noise floor for "heard", and how
 * much of the outgoing one shows up while the incoming one is alone sets it for "gone". When the two
 * tracks sound too alike to tell apart, the cue and a fixed tail are used instead.
 */
export function measureBlend(
  s: SpectralFrames,
  o: { cue: number; start: number; next: number; outgoingFrom: number }
): { audible: number; gone: number } {
  const { cue, start, next } = o
  const fallback = { audible: cue, gone: Math.min(next, start + FALLBACK_TAIL) }
  const soloFrom = Math.min(Math.max(o.outgoingFrom + 5, cue - 90), cue - 20)
  const tailFrom = Math.max(start + 20, next - 60)
  const a = meanPower(s, soloFrom, cue)
  const b = meanPower(s, tailFrom, next)
  if (!a || !b || next - tailFrom < 10) return fallback
  const t0 = Math.floor(soloFrom)
  const share = incomingShare(s, a, b, t0, Math.ceil(next))
  const at = (t: number) => Math.max(0, Math.min(share.length - 1, Math.round(t) - t0))

  let audible = cue
  const heardFloor = Math.max(0.15, quantile(share.slice(0, at(cue)), 0.9))
  if (heardFloor < 0.6) {
    for (let i = at(start); i >= at(cue); i--) {
      if (share[i] <= heardFloor) {
        audible = t0 + i + 1
        break
      }
    }
  }

  let gone = fallback.gone
  const goneFloor = Math.min(0.85, quantile(share.slice(at(tailFrom)), 0.05) - 0.05)
  if (goneFloor >= 0.3) {
    gone = start
    // Last stretch where the outgoing track is still clearly in the mix.
    for (let i = at(start); i + 6 <= at(tailFrom); i++) {
      let below = 0
      for (let j = i; j < i + 6; j++) if (share[j] < goneFloor) below++
      if (below >= 5) gone = t0 + i + 3
    }
  }
  return { audible: Math.max(cue, Math.min(audible, start)), gone: Math.max(start, Math.min(gone, next)) }
}

/** Where the track cued at `cue` takes over from the one before, or null when the audio shows no clear change. */
function takeoverAt(s: SpectralFrames, cue: number, prev: number, end: number): number | null {
  // Outgoing track: up to 90s before the cue. Incoming: the last minute before the next one comes in.
  const a = meanProfile(s, Math.max(prev + 5, cue - 90), cue)
  const b = meanProfile(s, Math.max(cue + 5, end - 60), end)
  if (!a || !b || end - cue < 20) return null
  // 0 = sounds like the outgoing track, 1 = sounds like the incoming one. One value per second.
  const like: number[] = []
  for (let t = cue; t < end; t++) {
    const p = meanProfile(s, t - 3, t + 3)
    if (!p) break
    const da = dist(p, a)
    const db = dist(p, b)
    like.push(da + db > 0 ? da / (da + db) : 0.5)
  }
  const step = stepUp(like, 8)
  if (!step || step.contrast < MIN_CONTRAST) return null
  return cue + settledAt(like, step)
}

/**
 * For each cue (seconds, sorted), the crossfade that brings that track in. The first track keeps its
 * cue. `duration` is the length of the set.
 */
export function stepTakeovers(s: SpectralFrames, cues: number[], duration: number): Transition[] {
  const out: Transition[] = []
  cues.forEach((cue, k) => {
    if (k === 0) {
      out.push({ start: cue, audibleAt: cue, tailEnd: cue })
      return
    }
    const next = k + 1 < cues.length ? cues[k + 1] : duration
    const end = Math.min(next, cue + TAKEOVER_WINDOW)
    const start = takeoverAt(s, cue, cues[k - 1], end) ?? Math.min(cue + FALLBACK_TAKEOVER, (cue + end) / 2)
    const before = out[k - 1]
    const blend = measureBlend(s, { cue, start, next, outgoingFrom: Math.max(before.start, before.tailEnd) })
    out.push({ start, audibleAt: blend.audible, tailEnd: blend.gone })
  })
  return out
}

/**
 * Which tracks are ever the dominant one. Each track gets a spectral profile from the middle of its
 * stretch as placed by `takeovers` (pooled with other plays of the same song), then every second of
 * the set is assigned to one track, in play order, with tracks allowed to be skipped. A skipped track
 * was only ever layered under another one.
 */
export function dominantTracks(
  s: SpectralFrames,
  cues: number[],
  takeovers: number[],
  duration: number,
  songs?: Array<{ title: string; artist: string }>
): boolean[] {
  const K = cues.length
  const T = Math.floor(duration)
  if (K < 3 || !s.frames.length) return cues.map(() => true)
  const same = (a: number, b: number) => a === b || (!!songs && sameSong(songs[a], songs[b]))
  const profiles = cues.map((_, k) => {
    const parts: Float64Array[] = []
    for (let j = 0; j < K; j++) {
      if (!same(j, k)) continue
      const a = takeovers[j]
      const z = j + 1 < K ? takeovers[j + 1] : duration
      const pad = Math.min(15, (z - a) / 4)
      const p = meanProfile(s, a + pad, z - pad)
      if (p) parts.push(p)
    }
    if (!parts.length) return null
    const out = new Float64Array(parts[0].length)
    for (const p of parts) for (let b = 0; b < out.length; b++) out[b] += p[b] / parts.length
    return out
  })

  // Viterbi over seconds: state k may only follow states < k and only once its deck has started.
  let cost = new Float64Array(K).fill(Infinity)
  cost[0] = 0
  const back: Int16Array[] = []
  for (let t = 0; t < T; t++) {
    const p = meanProfile(s, t - 2, t + 2)
    const next = new Float64Array(K).fill(Infinity)
    const from = new Int16Array(K)
    let bestPrev = Infinity
    let bestIdx = -1
    for (let k = 0; k < K; k++) {
      let c = cost[k]
      let f = k
      if (bestIdx >= 0 && bestPrev + SWITCH_PENALTY < c) {
        c = bestPrev + SWITCH_PENALTY
        f = bestIdx
      }
      const prof = profiles[k]
      if (cues[k] <= t && c < Infinity && prof) {
        next[k] = c + (p ? dist(p, prof) : 0)
        from[k] = f
      }
      if (cost[k] < bestPrev) {
        bestPrev = cost[k]
        bestIdx = k
      }
    }
    back.push(from)
    cost = next
  }
  const seen = cues.map(() => false)
  // The last track is the one playing at the end; walk back from it.
  let k = K - 1
  if (cost[k] === Infinity) return cues.map(() => true)
  for (let t = T - 1; t >= 0; t--) {
    seen[k] = true
    k = back[t][k]
  }
  seen[0] = true
  return seen
}

/**
 * For each cue (seconds, sorted), the crossfade that brings that track in, or null when it never
 * takes over (it was only layered under another track). The first track keeps its cue.
 */
export function detectTakeovers(
  s: SpectralFrames,
  cues: number[],
  duration: number,
  songs?: Array<{ title: string; artist: string }>
): Array<Transition | null> {
  const transitions = stepTakeovers(s, cues, duration)
  const dominant = dominantTracks(s, cues, transitions.map((t) => t.start), duration, songs)
  return transitions.map((t, k) => (dominant[k] ? t : null))
}
