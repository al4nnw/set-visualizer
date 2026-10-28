import type { SwapPlan } from './swapPlan'
import type { RenderSettings, SwapCurve, Track } from './types'

/** How long the incoming track takes to fade in on the right. */
export const APPEAR_DURATION = 0.9

export function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.start - b.start)
}

/** Tracks that take the main spot at some point, in play order (layered ones left out). */
export function mainTracks(tracks: Track[]): Track[] {
  return sortTracks(tracks.filter((t) => !t.layered))
}

/** Time the track shows up on the right, clamped so it never collides with the previous swap. */
export function appearTime(
  tracks: Track[],
  i: number,
  settings: Pick<RenderSettings, 'defaultLead' | 'swapDuration'>,
  swap = settings.swapDuration
): number {
  const t = tracks[i]
  if (i === 0) return Number.NEGATIVE_INFINITY
  const prev = tracks[i - 1]
  const wanted = t.mixIn ?? t.start - settings.defaultLead
  // The previous swap ends at prev.start; this track's swap starts `swapDuration` before its own.
  const earliest = prev.start + 0.25
  return Math.min(t.start - swap, Math.max(wanted, earliest))
}

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

/**
 * Curves for the A/B swap, 0..1 over the swap. All end exactly at 1; some go a little past it on
 * the way (the cards overshoot and settle).
 */
export const SWAP_CURVES: Record<Exclude<SwapCurve, 'auto'>, (x: number) => number> = {
  /** Cubic ease in-out: even acceleration and braking. */
  smooth: easeInOut,
  /** Quintic ease in-out: a slow start, a fast middle and a long brake into the mark. */
  snappy: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  /** Pulls back a touch before moving, then overshoots a little and settles on the mark. */
  anticipate: (x) => {
    const c = 1.2
    const c2 = c * 1.525
    return x < 0.5 ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2 : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2
  },
  /** Leaves quickly and lands with a small damped bounce, finishing exactly on the mark. */
  spring: (x) => (x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(2.5 * Math.PI * x))
}

const fixedEase = (settings: Pick<RenderSettings, 'swapCurve'>) =>
  settings.swapCurve && settings.swapCurve !== 'auto' ? SWAP_CURVES[settings.swapCurve] ?? easeInOut : easeInOut

/** True when the swap curve and length are picked per transition (the default). */
export const isAutoSwap = (settings: Pick<RenderSettings, 'swapCurve'>) => (settings.swapCurve ?? 'auto') === 'auto'

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface CardState {
  track: Track
  index: number
  /** Horizontal slot: 0 = left (main), 1 = right (next). Values < 0 mean leaving to the left. */
  slot: number
  opacity: number
  /** 1 while the track is the main one, 0 while it's on the right (interpolates during the swap). */
  mainness: number
  role: 'incoming' | 'main' | 'leaving' | 'tail'
  /** Audible right now. The right card says "now playing" instead of "up next" while this is true. */
  playing: boolean
}

/**
 * When track i stops being heard, if it keeps playing under the next one after the swap. Clamped so
 * that it's gone before the track after next shows up (two decks, two cards). Undefined when it
 * leaves with the swap.
 */
export function tailTime(sorted: Track[], i: number, settings: Pick<RenderSettings, 'defaultLead' | 'swapDuration'>): number | undefined {
  const tr = sorted[i]
  if (tr.tailEnd === undefined || i + 1 >= sorted.length) return undefined
  const leave = sorted[i + 1].start
  const limit = i + 2 < sorted.length ? appearTime(sorted, i + 2, settings) - APPEAR_DURATION : Number.POSITIVE_INFINITY
  const end = Math.min(tr.tailEnd, limit)
  return end >= leave + 0.5 ? end : undefined
}

/**
 * Where each visible track card is at time `t`. Left is the main track, right is the one being
 * mixed in. When the right track becomes the main one it slides to the left. The old main track
 * either slides out, or, if it keeps playing underneath, swaps over to the right until it's gone.
 * The swap runs over the swap length before the takeover point, so it lands exactly on the mark.
 * With the auto curve, `plans` (from planSwaps) gives each transition its own curve and length.
 */
export function cardStates(
  sorted: Track[],
  t: number,
  settings: Pick<RenderSettings, 'defaultLead' | 'swapDuration' | 'swapCurve'>,
  plans?: (SwapPlan | undefined)[]
): CardState[] {
  const out: CardState[] = []
  const auto = isAutoSwap(settings) && plans
  const fixed = fixedEase(settings)
  /** Curve and length of the swap where track j takes over. */
  const swapOf = (j: number) => {
    const plan = auto ? plans[j] : undefined
    return plan
      ? { swap: Math.max(0.05, plan.duration), ease: SWAP_CURVES[plan.curve] }
      : { swap: Math.max(0.05, settings.swapDuration), ease: fixed }
  }
  for (let i = 0; i < sorted.length; i++) {
    const tr = sorted[i]
    const into = swapOf(i)
    const out_ = swapOf(i + 1)
    const appear = appearTime(sorted, i, settings, into.swap)
    const start = i === 0 ? Math.min(tr.start, 0) : tr.start
    const leave = i + 1 < sorted.length ? sorted[i + 1].start : Number.POSITIVE_INFINITY
    const tail = tailTime(sorted, i, settings)
    const gone = tail !== undefined ? tail + APPEAR_DURATION : leave
    // The swap in (and out) starts this long before the takeover point.
    const swapIn = i === 0 ? start : start - into.swap
    const swapOut = leave - out_.swap

    if (t < appear) continue
    if (t >= gone) continue

    if (t < swapIn) {
      // Incoming on the right.
      const p = easeOut(clamp01((t - appear) / APPEAR_DURATION))
      const playing = tr.mixIn !== undefined
      out.push({ track: tr, index: i, slot: lerp(1.25, 1, p), opacity: p, mainness: 0, role: 'incoming', playing })
    } else if (t < start && i > 0) {
      const p = into.ease(clamp01((t - swapIn) / into.swap))
      out.push({ track: tr, index: i, slot: lerp(1, 0, p), opacity: 1, mainness: p, role: 'main', playing: true })
    } else if (t < swapOut) {
      out.push({ track: tr, index: i, slot: 0, opacity: 1, mainness: 1, role: 'main', playing: true })
    } else if (tail !== undefined) {
      // Still playing under the new main track: over to the right, then fade out when it's gone.
      const p = out_.ease(clamp01((t - swapOut) / out_.swap))
      const q = t < tail ? 0 : easeOut(clamp01((t - tail) / APPEAR_DURATION))
      out.push({ track: tr, index: i, slot: lerp(0, 1, p) + 0.25 * q, opacity: 1 - q, mainness: 1 - p, role: 'tail', playing: t < tail })
    } else {
      const p = out_.ease(clamp01((t - swapOut) / out_.swap))
      // Opacity follows the plain progress, so an overshooting curve can't push it past 0..1.
      const fade = clamp01((t - swapOut) / out_.swap)
      out.push({ track: tr, index: i, slot: lerp(0, -0.7, p), opacity: 1 - fade, mainness: Math.max(0, 1 - p), role: 'leaving', playing: false })
    }
  }
  return out
}

/** Index of the main track at time t (-1 before the first one). */
export function currentIndex(sorted: Track[], t: number): number {
  let idx = -1
  for (let i = 0; i < sorted.length; i++) if (sorted[i].start <= t) idx = i
  if (idx === -1 && sorted.length) return 0
  return idx
}

/**
 * Deck letters alternating A, B, A, B... in play order. A layered track gets the other deck from the
 * main track playing when it comes in.
 */
export function alternateDecks(tracks: Track[]): Track[] {
  const main = mainTracks(tracks).map((t, i): Track => ({ ...t, deck: i % 2 === 0 ? 'A' : 'B' }))
  const layered = tracks
    .filter((t) => t.layered)
    .map((t): Track => {
      const under = main[Math.max(0, currentIndex(main, t.start))]
      return { ...t, deck: under?.deck === 'A' ? 'B' : 'A' }
    })
  return sortTracks([...main, ...layered])
}

export function formatTime(sec: number, forceHours = false): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const mm = h > 0 || forceHours ? String(m).padStart(2, '0') : String(m)
  return (h > 0 || forceHours ? `${h}:` : '') + `${mm}:${String(ss).padStart(2, '0')}`
}

/** Parses "1:02:03", "62:03", "3723" or "3723.5" into seconds. Returns NaN when it can't. */
export function parseTime(text: string): number {
  const s = text.trim()
  if (!s) return NaN
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const parts = s.split(':').map((p) => p.trim())
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0)
}

/** Editor-style timecode, "01:02:03:12" (hours:minutes:seconds:frames). */
export function formatTimecode(sec: number, fps: number): string {
  const total = Math.max(0, Math.floor(sec * fps + 1e-6))
  const f = total % fps
  const s = Math.floor(total / fps)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}:${p(f)}`
}
