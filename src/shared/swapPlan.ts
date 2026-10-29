import type { Msg } from './i18n'
import type { Motion } from './motion'
import type { RenderSettings, SwapCurve, Track } from './types'

/** How one A/B swap moves: the curve and how long it runs before the takeover point. */
export interface SwapPlan {
  curve: Exclude<SwapCurve, 'auto'>
  duration: number
  /** Why this plan was picked, for the CLI and the timeline (keys under swapReason in the UI catalogs). */
  reason: Msg
}

function mean(a: Float32Array, rate: number, from: number, to: number): number {
  const i0 = Math.max(0, Math.floor(from * rate))
  const i1 = Math.min(a.length, Math.ceil(to * rate))
  if (i1 <= i0) return 0
  let s = 0
  for (let i = i0; i < i1; i++) s += a[i]
  return s / (i1 - i0)
}

/**
 * Energy-matched swap for each main track (index-aligned with `sorted`; the first has none).
 * Reads the mix: how long the incoming track was heard before the takeover (mix-in to takes over),
 * how long the outgoing one keeps playing after it (plays until), and the bass around the takeover.
 *  - a drop (bass comes in at the takeover): short and punchy, landing on the drop (snappy);
 *  - a quick cut (short blend, no tail): short with a small bounce (spring);
 *  - a long blend or a long tail: long and even (smooth), longer the longer the overlap;
 *  - a takeover without bass (breakdown, vocals): a slow, even swap (smooth);
 *  - anything else: a normal smooth swap.
 * The swap always ends on the takeover; only its curve and length change.
 */
export function planSwaps(sorted: Track[], motion?: Motion): (SwapPlan | undefined)[] {
  return sorted.map((tr, i) => {
    if (i === 0) return undefined
    const prev = sorted[i - 1]
    // Without a mix-in the blend length is unknown, so only the drop, tail and bass rules apply.
    const blend = tr.mixIn !== undefined ? Math.max(0, tr.start - tr.mixIn) : undefined
    const tail = prev.tailEnd !== undefined ? Math.max(0, prev.tailEnd - tr.start) : 0

    let bassBefore = 0.5
    let bassAfter = 0.5
    let kickJump = 0
    if (motion) {
      bassBefore = mean(motion.bassy, motion.rate, tr.start - 4, tr.start - 0.5)
      bassAfter = mean(motion.bassy, motion.rate, tr.start, tr.start + 3)
      kickJump = mean(motion.kick, motion.rate, tr.start, tr.start + 3) - mean(motion.kick, motion.rate, tr.start - 4, tr.start - 0.5)
    }

    let curve: SwapPlan['curve']
    let duration: number
    let reason: Msg
    if (bassAfter - bassBefore > 0.35 && bassAfter > 0.55 && kickJump > 0.1) {
      curve = 'snappy'
      duration = 1.1
      reason = { key: 'drop' }
    } else if (blend !== undefined && blend < 8 && tail < 4) {
      curve = 'spring'
      duration = 1.0
      reason = { key: 'quickCut', values: { blend: Math.round(blend) } }
    } else if ((blend ?? 0) > 30 || tail > 30) {
      curve = 'smooth'
      // 2.4 s for a 30 s overlap, up to 3 s for the longest blends.
      duration = 2.4 + 0.6 * Math.min(1, (Math.max(blend ?? 0, tail) - 30) / 90)
      reason = { key: 'longBlend', values: { blend: Math.round(blend ?? 0), tail: Math.round(tail) } }
    } else if (bassAfter < 0.3) {
      curve = 'smooth'
      duration = 2.2
      reason = { key: 'noBass' }
    } else {
      curve = 'smooth'
      duration = 1.8
      reason = blend === undefined ? { key: 'noMixIn' } : { key: 'normal', values: { blend: Math.round(blend) } }
    }
    // Never start the swap before the previous one has finished.
    duration = Math.max(0.3, Math.min(duration, tr.start - prev.start - 0.25))
    return { curve, duration: Math.round(duration * 100) / 100, reason }
  })
}

/** Length of the swap where track i takes over: its plan's with the auto curve, else the setting. */
export function swapLength(plans: (SwapPlan | undefined)[] | undefined, settings: Pick<RenderSettings, 'swapDuration' | 'swapCurve'>, i: number): number {
  const plan = (settings.swapCurve ?? 'auto') === 'auto' ? plans?.[i] : undefined
  return plan ? plan.duration : settings.swapDuration
}
