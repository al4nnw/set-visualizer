import type { RenderSettings, Track } from './types'

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
export function appearTime(tracks: Track[], i: number, settings: Pick<RenderSettings, 'defaultLead' | 'swapDuration'>): number {
  const t = tracks[i]
  if (i === 0) return Number.NEGATIVE_INFINITY
  const prev = tracks[i - 1]
  const wanted = t.mixIn ?? t.start - settings.defaultLead
  const earliest = prev.start + settings.swapDuration + 0.25
  return Math.min(t.start, Math.max(wanted, earliest))
}

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface CardState {
  track: Track
  index: number
  /** Horizontal slot: 0 = left (main), 1 = right (next). Values < 0 mean leaving to the left. */
  slot: number
  opacity: number
  /** 1 while the track is the main one, 0 while it's the incoming one (interpolates during the swap). */
  mainness: number
  role: 'incoming' | 'main' | 'leaving'
}

/**
 * Where each visible track card is at time `t`. Left is the main track, right is the one being
 * mixed in. When the right track becomes the main one it slides to the left while the old main
 * track slides out.
 */
export function cardStates(sorted: Track[], t: number, settings: Pick<RenderSettings, 'defaultLead' | 'swapDuration'>): CardState[] {
  const out: CardState[] = []
  const swap = Math.max(0.05, settings.swapDuration)
  for (let i = 0; i < sorted.length; i++) {
    const tr = sorted[i]
    const appear = appearTime(sorted, i, settings)
    const start = i === 0 ? Math.min(tr.start, 0) : tr.start
    const leave = i + 1 < sorted.length ? sorted[i + 1].start : Number.POSITIVE_INFINITY

    if (t < appear) continue
    if (t >= leave + swap) continue

    if (t < start) {
      // Incoming on the right.
      const p = easeOut(clamp01((t - appear) / APPEAR_DURATION))
      out.push({ track: tr, index: i, slot: lerp(1.25, 1, p), opacity: p, mainness: 0, role: 'incoming' })
    } else if (t < start + swap && i > 0) {
      const p = easeInOut(clamp01((t - start) / swap))
      out.push({ track: tr, index: i, slot: lerp(1, 0, p), opacity: 1, mainness: p, role: 'main' })
    } else if (t < leave) {
      out.push({ track: tr, index: i, slot: 0, opacity: 1, mainness: 1, role: 'main' })
    } else {
      const p = easeInOut(clamp01((t - leave) / swap))
      out.push({ track: tr, index: i, slot: lerp(0, -0.7, p), opacity: 1 - p, mainness: 1 - p, role: 'leaving' })
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
