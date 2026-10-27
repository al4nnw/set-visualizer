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
export function stepUp(v: number[], margin: number): { at: number; contrast: number } | null {
  const n = v.length
  const prefix = [0]
  const prefixSq = [0]
  for (const x of v) {
    prefix.push(prefix[prefix.length - 1] + x)
    prefixSq.push(prefixSq[prefixSq.length - 1] + x * x)
  }
  let best: { at: number; contrast: number; err: number } | null = null
  for (let i = margin; i <= n - margin; i++) {
    const sa = prefix[i]
    const sz = prefix[n] - sa
    const ma = sa / i
    const mz = sz / (n - i)
    if (mz <= ma) continue
    const err = prefixSq[i] - sa * ma + (prefixSq[n] - prefixSq[i]) - sz * mz
    if (!best || err < best.err) best = { at: i, contrast: mz - ma, err }
  }
  return best && { at: best.at, contrast: best.contrast }
}

/**
 * For each cue (seconds, sorted), where that track takes over. The first track keeps its cue.
 * `duration` is the length of the set.
 */
export function detectTakeovers(s: SpectralFrames, cues: number[], duration: number): number[] {
  return cues.map((cue, k) => {
    if (k === 0) return cue
    const prev = cues[k - 1]
    const next = k + 1 < cues.length ? cues[k + 1] : duration
    const end = Math.min(next, cue + TAKEOVER_WINDOW)
    const fallback = Math.min(cue + FALLBACK_TAKEOVER, (cue + end) / 2)
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
    return cue + step.at
  })
}
