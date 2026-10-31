import type { SpectralFrames, Transition } from './takeover'

/**
 * Finding the three moments of each transition in the audio: when the incoming track starts being
 * heard (mix in), when it takes over, and when the outgoing one is gone (plays until).
 *
 * A two-deck transition goes through four stages: the outgoing track alone, the incoming one coming
 * in under it, the incoming one on top with the outgoing one under it, and the incoming one alone.
 * For every second after the incoming deck starts, the mix is fitted as a blend of the two tracks'
 * spectra (power adds up when two decks play together), separately for the bass and for the rest,
 * which gives the incoming track's share of the mix. The four stages are then fitted to that share as
 * flat steps, with the steps only allowed on phrase boundaries (where the music changes), because
 * DJs bring a track in, swap the bass and take the old track out on the phrase.
 */

/** Shortest stage, seconds. */
const MIN_STAGE = 4
/** Longest stretch after a cue that is searched, seconds. */
const MAX_WINDOW = 300
/**
 * Cost of saying the incoming track is heard later than its deck started, in squared share-seconds.
 * DJ software starts the deck when it's brought in more often than not, so the cue wins unless the
 * share clearly stays flat for a while after it.
 */
const LATE_MIX_IN_COST = 0.5
/** Smallest rise at the takeover for the fit to be trusted (share, 0..1). */
const MIN_TAKEOVER_RISE = 0.15
/** Spectral templates per track and band group. */
const TEMPLATES = 3

/** How many of the power bands are bass (below about 160 Hz; the bands are log spaced from 40 Hz to 5 kHz). */
export const bassBands = (bands: number) => Math.max(1, Math.round((bands * Math.log(160 / 40)) / Math.log(5000 / 40)))

const frameAt = (s: SpectralFrames, t: number) => Math.round(t * s.fps)

/**
 * Seconds where the music changes the most within [from, to): peaks of how different the spectrum and
 * the bass level of the next few seconds are from the previous few, at least 4 s apart. On a mixed set
 * these fall on phrase boundaries, where DJs make their moves.
 */
export function phraseBoundaries(s: SpectralFrames, from: number, to: number): number[] {
  const power = s.power
  if (!power?.length) return []
  const w = Math.max(1, Math.round(4 * s.fps))
  const a = Math.max(0, frameAt(s, from) - w)
  const z = Math.min(power.length, frameAt(s, to) + w)
  const bands = power[0].length
  const nb = bassBands(bands)
  const n = z - a
  if (n < 2 * w + 1) return []
  // Running sums of the log spectrum and the log bass level.
  const sums = Array.from({ length: n + 1 }, () => new Float64Array(bands + 1))
  for (let i = 0; i < n; i++) {
    const p = power[a + i]
    let bass = 0
    for (let b = 0; b < bands; b++) {
      sums[i + 1][b] = sums[i][b] + Math.log(p[b] + 1e-3)
      if (b < nb) bass += p[b]
    }
    sums[i + 1][bands] = sums[i][bands] + Math.log(bass / nb + 1e-3)
  }
  const spec = new Float64Array(n)
  const bass = new Float64Array(n)
  for (let i = w; i <= n - w; i++) {
    let d = 0
    for (let b = 0; b < bands; b++) d += ((sums[i + w][b] - sums[i][b] - (sums[i][b] - sums[i - w][b])) / w) ** 2
    spec[i] = Math.sqrt(d)
    bass[i] = Math.abs(sums[i + w][bands] - 2 * sums[i][bands] + sums[i - w][bands]) / w
  }
  const median = (v: Float64Array) => {
    const nz = Array.from(v).filter((x) => x > 0).sort((x, y) => x - y)
    return nz[nz.length >> 1] || 1
  }
  const ms = median(spec)
  const mb = median(bass)
  const nov = spec.map((x, i) => x / ms + bass[i] / mb)
  const out: number[] = []
  const half = Math.round(2 * s.fps)
  for (let i = w; i <= n - w; i++) {
    let peak = nov[i] > 0
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half) && peak; j++) if (nov[j] > nov[i] || (nov[j] === nov[i] && j < i)) peak = false
    const t = (a + i) / s.fps
    if (peak && t >= from && t < to) out.push(t)
  }
  return out
}

/**
 * Up to `k` typical spectra (linear power over bands [b0, b1)) of the frames between `from` and `to`,
 * so a track with a breakdown and a drop is described by both. Near-silent frames are left out.
 */
export function spectralTemplates(s: SpectralFrames, from: number, to: number, b0: number, b1: number, k = TEMPLATES): Float64Array[] {
  const power = s.power
  if (!power?.length) return []
  const a = Math.max(0, frameAt(s, from))
  const z = Math.min(power.length, frameAt(s, to))
  const rows: Float64Array[] = []
  for (let i = a; i < z; i++) rows.push(Float64Array.from(power[i].subarray(b0, b1)))
  if (!rows.length) return []
  const energy = rows.map((r) => r.reduce((x, v) => x + v, 0))
  const cut = [...energy].sort((x, y) => x - y)[Math.floor(energy.length * 0.3)]
  const kept = rows.filter((_, i) => energy[i] >= cut)
  const logs = kept.map((r) => r.map((v) => Math.log(v + 1e-4)))
  // k-means on the log spectra, started from frames spread over the loudness range.
  const order = kept.map((_, i) => i).sort((x, y) => energy[x] - energy[y])
  let centres = Array.from({ length: Math.min(k, kept.length) }, (_, c) => Float64Array.from(logs[order[Math.floor(((c + 0.5) * kept.length) / k)]]))
  let label = new Int32Array(kept.length)
  for (let iter = 0; iter < 12; iter++) {
    label = new Int32Array(logs.map((l) => {
      let best = 0
      let bestD = Infinity
      centres.forEach((c, ci) => {
        let d = 0
        for (let b = 0; b < l.length; b++) d += (l[b] - c[b]) ** 2
        if (d < bestD) {
          bestD = d
          best = ci
        }
      })
      return best
    }))
    centres = centres.map((c, ci) => {
      const out = new Float64Array(c.length)
      let n = 0
      logs.forEach((l, i) => {
        if (label[i] !== ci) return
        n++
        for (let b = 0; b < l.length; b++) out[b] += l[b]
      })
      return n ? out.map((v) => v / n) : c
    })
  }
  const out: Float64Array[] = []
  centres.forEach((_, ci) => {
    const mean = new Float64Array(b1 - b0)
    let n = 0
    kept.forEach((r, i) => {
      if (label[i] !== ci) return
      n++
      for (let b = 0; b < r.length; b++) mean[b] += r[b]
    })
    if (n >= 5) out.push(mean.map((v) => v / n))
  })
  return out
}

/** Non-negative least squares for a few components (coordinate descent): weights w ≥ 0 minimising |Σ w_j m_j − x|. */
export function nnls(m: Float64Array[], x: ArrayLike<number>, iterations = 40): Float64Array {
  const k = m.length
  const gram = m.map((p) => m.map((q) => p.reduce((s, v, i) => s + v * q[i], 0)))
  const mx = m.map((p) => p.reduce((s, v, i) => s + v * x[i], 0))
  const w = new Float64Array(k)
  for (let it = 0; it < iterations; it++) {
    for (let j = 0; j < k; j++) {
      if (gram[j][j] <= 0) continue
      let g = mx[j]
      for (let i = 0; i < k; i++) g -= gram[j][i] * w[i]
      w[j] = Math.max(0, w[j] + g / gram[j][j])
    }
  }
  return w
}

/**
 * The incoming track's share of the mix for each second from `from` to `to`, over bands [b0, b1):
 * every frame is fitted as a non-negative blend of both tracks' templates, and the loudness each
 * track gets is added up over the second, so quiet frames between kicks count for little.
 */
export function deckShare(s: SpectralFrames, outgoing: Float64Array[], incoming: Float64Array[], from: number, to: number, b0: number, b1: number): number[] {
  const power = s.power!
  const comps = [...outgoing, ...incoming]
  const loud = comps.map((c) => c.reduce((x, v) => x + v, 0))
  const out: number[] = []
  for (let t = from; t < to; t++) {
    let la = 0
    let lb = 0
    for (let i = Math.max(0, frameAt(s, t)); i < Math.min(power.length, frameAt(s, t + 1)); i++) {
      const w = nnls(comps, power[i].subarray(b0, b1))
      w.forEach((v, j) => {
        if (j < outgoing.length) la += v * loud[j]
        else lb += v * loud[j]
      })
    }
    out.push(la + lb > 0 ? lb / (la + lb) : 0.5)
  }
  return out
}

export interface Stages {
  /** Seconds from the start of `share`: incoming heard, takes over, outgoing gone. */
  mixIn: number
  start: number
  tailEnd: number
  /** How much the incoming track's share rises at the takeover. */
  rise: number
}

/**
 * Fits the four stages of a transition to the incoming track's share (one value per second): flat
 * levels that never go down, with the takeover as the biggest rise, the steps on the given candidate
 * seconds (0 and share.length are always allowed), and a cost for a mix-in later than 0.
 */
export function fitStages(share: number[], candidates: number[], lateMixIn = LATE_MIX_IN_COST): Stages | null {
  const T = share.length
  const cs = [0]
  const cs2 = [0]
  for (const v of share) {
    cs.push(cs[cs.length - 1] + v)
    cs2.push(cs2[cs2.length - 1] + v * v)
  }
  const seg = (a: number, b: number): [number, number] => {
    if (b <= a) return [0, NaN]
    const s = cs[b] - cs[a]
    return [cs2[b] - cs2[a] - (s * s) / (b - a), s / (b - a)]
  }
  const c = [...new Set([0, ...candidates.map(Math.round).filter((x) => x > 0 && x < T), T])].sort((x, y) => x - y)
  let best: (Stages & { cost: number }) | null = null
  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const [e0, m0] = seg(0, a)
    for (let j = i + 1; j < c.length; j++) {
      const b = c[j]
      if (b - a < MIN_STAGE) continue
      const [e1, m1] = seg(a, b)
      if (a > 0 && m1 < m0 - 0.02) continue
      for (let l = j + 1; l < c.length; l++) {
        const d = c[l]
        if (d - b < MIN_STAGE) continue
        const [e2, m2] = seg(b, d)
        const [e3, m3] = seg(d, T)
        if (m2 < m1 - 0.02 || (d < T && m3 < m2 - 0.05)) continue
        // The takeover is where the incoming track gets louder than the outgoing one, and the biggest change.
        if (m1 > 0.5 || m2 < 0.5) continue
        if ((a > 0 && m2 - m1 < m1 - m0) || (d < T && m2 - m1 < m3 - m2)) continue
        const cost = e0 + e1 + e2 + e3 + (a > 0 ? lateMixIn : 0)
        if (!best || cost < best.cost) best = { mixIn: a, start: b, tailEnd: d, rise: m2 - m1, cost }
      }
    }
  }
  return best && { mixIn: best.mixIn, start: best.start, tailEnd: best.tailEnd, rise: best.rise }
}

/**
 * The transition that brings in the track cued at `cue`, or null when the audio can't tell the two
 * tracks apart. `outgoingFrom` is when the outgoing track was last known to play alone, `next` the
 * next cue (with two decks, the outgoing track has to be gone by then, since its deck is reloaded).
 */
export function stagedTransition(s: SpectralFrames, cue: number, next: number, outgoingFrom: number): Transition | null {
  const power = s.power
  if (!power?.length) return null
  const end = Math.floor(Math.min(next, cue + MAX_WINDOW))
  if (end - cue < 3 * MIN_STAGE) return null
  const bands = power[0].length
  const nb = bassBands(bands)
  const groups: Array<[number, number]> = nb < bands ? [[0, nb], [nb, bands]] : [[0, bands]]
  const t0 = Math.floor(cue)
  const candidates = phraseBoundaries(s, t0, end).map((t) => t - t0)
  // The outgoing track alone: before the cue, after the previous transition. The incoming one alone:
  // just before the next cue. The second pass takes both from where the first one placed them.
  let aFrom = Math.min(cue - 20, Math.max(cue - 90, outgoingFrom + 5))
  let aTo = cue
  let bFrom = Math.max(end - 60, cue + 20)
  let fit: Stages | null = null
  for (let pass = 0; pass < 2; pass++) {
    const shares = groups.map(([b0, b1]) => {
      const a = spectralTemplates(s, aFrom, aTo, b0, b1)
      const b = spectralTemplates(s, bFrom, end, b0, b1)
      return a.length && b.length ? deckShare(s, a, b, t0, end, b0, b1) : null
    })
    if (shares.some((x) => !x)) return null
    const share = shares[0]!.map((_, i) => shares.reduce((x, v) => x + v![i], 0) / shares.length)
    const f = fitStages(share, candidates)
    if (!f) return fit && toTransition(fit)
    fit = f
    // DJs swap the bass at the takeover, so whether the outgoing track is still there after it is
    // heard in the rest of the spectrum.
    const upper = shares[shares.length - 1]!
    const tail = bestRise(upper, f.start, upper.length, candidates)
    if (tail !== null) fit = { ...fit, tailEnd: tail }
    if (end - (t0 + fit.tailEnd) >= 15) bFrom = Math.max(end - 90, t0 + fit.tailEnd)
    if (fit.mixIn >= 10) aTo = t0 + fit.mixIn
  }
  return fit && toTransition(fit)

  function toTransition(f: Stages): Transition | null {
    if (f.rise < MIN_TAKEOVER_RISE) return null
    return { audibleAt: Math.max(cue, t0 + f.mixIn), start: t0 + f.start, tailEnd: Math.min(next, t0 + f.tailEnd) }
  }
}

/**
 * Where `y` (one value per second) steps up within [from, to): the candidate second that best splits
 * it into a lower then a higher flat level, at least MIN_STAGE from either end. Null when nothing
 * steps up.
 */
export function bestRise(y: number[], from: number, to: number, candidates: number[]): number | null {
  const cs = [0]
  const cs2 = [0]
  for (let i = from; i < to; i++) {
    cs.push(cs[cs.length - 1] + y[i])
    cs2.push(cs2[cs2.length - 1] + y[i] * y[i])
  }
  const n = to - from
  const sse = (a: number, b: number) => (b > a ? cs2[b] - cs2[a] - (cs[b] - cs[a]) ** 2 / (b - a) : 0)
  let best: number | null = null
  let bestCost = Infinity
  for (const c of candidates) {
    const d = Math.round(c) - from
    if (d < MIN_STAGE || d > n - MIN_STAGE) continue
    if ((cs[n] - cs[d]) / (n - d) <= (cs[d] - cs[0]) / d) continue
    const cost = sse(0, d) + sse(d, n)
    if (cost < bestCost) {
      bestCost = cost
      best = from + d
    }
  }
  return best
}
