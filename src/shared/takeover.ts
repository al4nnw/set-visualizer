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

const avgAt = (v: number[], i: number, hold: number) => {
  let sum = 0
  for (let j = i; j < i + hold; j++) sum += v[j]
  return sum / hold
}

/**
 * The whole crossfade around a step, in samples: when the incoming track starts to be heard (the mix
 * leaves the outgoing track's level), when it takes over (see `settledAt`) and when the outgoing one
 * is gone (the mix reaches the incoming track's upper level, at most a minute after the takeover).
 */
export function crossfade(like: number[], step: { at: number; low: number }, hold = 6): { audible: number; settled: number; gone: number } {
  const after = like.slice(step.at).sort((a, b) => a - b)
  const high = after[Math.floor(after.length * 0.75)] ?? step.low
  const settled = settledAt(like, step, hold)
  let audible = 0
  for (let i = Math.min(step.at, like.length - hold); i >= 0; i--) {
    if (avgAt(like, i, hold) <= step.low + 0.25 * (high - step.low)) {
      audible = i + hold
      break
    }
  }
  let gone = Math.min(like.length, settled + 60)
  for (let i = settled; i + hold <= Math.min(like.length, settled + 60); i++) {
    if (avgAt(like, i, hold) >= high) {
      gone = i + hold
      break
    }
  }
  return { audible: Math.min(audible, settled), settled, gone: Math.max(gone, settled) }
}

export interface Transition {
  /** When the incoming track takes over. */
  start: number
  /** When it starts being heard, if that could be measured. */
  audibleAt?: number
  /** When the outgoing track stops being heard. */
  tailEnd: number
}

/**
 * For each cue (seconds, sorted), the crossfade that brings that track in. The first track keeps its
 * cue. `duration` is the length of the set.
 */
export function stepTakeovers(s: SpectralFrames, cues: number[], duration: number): Transition[] {
  return cues.map((cue, k): Transition => {
    if (k === 0) return { start: cue, tailEnd: cue }
    const prev = cues[k - 1]
    const next = k + 1 < cues.length ? cues[k + 1] : duration
    const end = Math.min(next, cue + TAKEOVER_WINDOW)
    const at = Math.min(cue + FALLBACK_TAKEOVER, (cue + end) / 2)
    const fallback = { start: at, tailEnd: Math.min(end, at + FALLBACK_TAIL) }
    // Outgoing track: up to 90s before the cue. Incoming: the last minute before the next one comes in.
    const a = meanProfile(s, Math.max(prev + 5, cue - 90), cue)
    const b = meanProfile(s, Math.max(cue + 5, end - 60), end)
    if (!a || !b || end - cue < 20) return fallback
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
    if (!step || step.contrast < MIN_CONTRAST) return fallback
    const x = crossfade(like, step)
    return { start: cue + x.settled, audibleAt: cue + x.audible, tailEnd: cue + x.gone }
  })
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
