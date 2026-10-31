/**
 * Draws one frame of the visualizer. The same code runs in the app's live preview (browser
 * canvas) and in the exporter (OffscreenCanvas in a Web Worker), so what you see is what gets rendered.
 */
import type { AppOverlay, Project, RenderSettings, Track, VideoFormat, WavePosition, Waveform } from './types'
import { cardStates, currentIndex, formatTime, lerp, mainTracks, stageShare, type CardState } from './layout'
import { buildMotion, motionAt, type Motion } from './motion'
import { planSwaps, type SwapPlan } from './swapPlan'
import { videoText } from './i18n'

export type Ctx = CanvasRenderingContext2D
export type ImageLike = CanvasImageSource & { width: number; height: number }
export interface CanvasLike {
  width: number
  height: number
  getContext(type: '2d'): unknown
}
export type CanvasFactory = (w: number, h: number) => CanvasLike

export interface ArtAsset {
  image: ImageLike
  /** Small pre-blurred cover of the image, used for the background. */
  blurred: ImageLike
}

export interface PreparedScene {
  project: Project
  sorted: Track[]
  art: Map<string, ArtAsset>
  /** Low-res scratch canvas for the background (it's all blur and gradients, so it upscales cleanly). */
  bg: CanvasLike
  /** Pre-blurred glow sprite per deck colour; real-time shadowBlur is very slow without a GPU. */
  glow: Map<string, CanvasLike>
  motion: Motion
  /** Energy-matched swap per main track, used when the swap curve is auto. */
  swaps: (SwapPlan | undefined)[]
  scale: number
  /** Scale for text: larger than `scale` in 9:16, where the video is watched on a phone. */
  textScale: number
  font: string
  /** The stretch of the set this video covers (a clip, or the whole set): the completion line fills over it. */
  range: { from: number; to: number }
}

export const FONT = 'Inter'

const ctxOf = (c: CanvasLike) => c.getContext('2d') as Ctx

export function hexToRgba(color: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

export function deckColor(project: Project, track: Track | undefined): string {
  const th = project.settings.theme
  return track?.deck === 'B' ? th.accentB : th.accent
}

/** Draws `img` into the rect, cropping it to cover (like CSS object-fit: cover). */
export function drawCover(ctx: Ctx, img: ImageLike, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height
  const r = w / h
  let sw = img.width
  let sh = img.height
  if (ir > r) sw = img.height * r
  else sh = img.width / r
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Builds the blurred background version of an artwork image. */
const cardCache = new WeakMap<object, Map<number, CanvasLike>>()

/**
 * The artwork pre-cropped and scaled to the largest size a card is drawn at, so per-frame draws
 * are close to 1:1 and don't need expensive high-quality resampling.
 */
function cardImage(img: ImageLike, size: number, factory: CanvasFactory): ImageLike {
  let bySize = cardCache.get(img)
  if (!bySize) cardCache.set(img, (bySize = new Map()))
  let c = bySize.get(size)
  if (!c) {
    c = factory(size, size)
    const ctx = ctxOf(c)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    drawCover(ctx, img, 0, 0, size, size)
    bySize.set(size, c)
  }
  return c as unknown as ImageLike
}

export function makeBlurred(img: ImageLike, factory: CanvasFactory): ImageLike {
  const c = factory(240, 135)
  const ctx = ctxOf(c)
  ctx.filter = 'blur(10px)'
  drawCover(ctx, img, -20, -20, 280, 175)
  ctx.filter = 'none'
  return c as unknown as ImageLike
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function fitText(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + '…'
}

/** Linear sample of an envelope at time t. */
export function sampleEnvelope(wf: Waveform, arr: number[], t: number): number {
  if (!arr.length) return 0
  const pos = t * wf.rate
  const i = Math.floor(pos)
  if (i < 0) return arr[0]
  if (i >= arr.length - 1) return arr[arr.length - 1]
  const f = pos - i
  return arr[i] * (1 - f) + arr[i + 1] * f
}

function trackAtTime(sorted: Track[], t: number): Track | undefined {
  const i = currentIndex(sorted, t)
  return i >= 0 ? sorted[i] : undefined
}

export function prepareScene(project: Project, art: Map<string, ArtAsset>, factory: CanvasFactory, range?: { from: number; to: number }): PreparedScene {
  const { width: W, height: H } = project.settings
  // Sizes are designed for 1080 on the short side, so a 9:16 video uses the same scale as 16:9.
  const s = Math.min(W, H) / 1080
  const sorted = mainTracks(project.tracks)
  const motion = buildMotion(project.waveform)
  const base = { project, sorted, art, motion, swaps: planSwaps(sorted, motion), scale: s, textScale: s * textScaleFor(project.settings), font: FONT, bg: factory(1, 1), glow: new Map<string, CanvasLike>() }
  const cardSize = Math.ceil(cardMain(project.settings) * s * 1.06)
  const cards = new Map<string, ArtAsset>()
  for (const [id, a] of art) cards.set(id, { ...a, image: cardImage(a.image, cardSize, factory) })
  base.art = cards
  const glow = new Map<string, CanvasLike>()
  for (const color of [project.settings.theme.accent, project.settings.theme.accentB]) glow.set(color, makeGlow(color, factory))
  return {
    ...base,
    bg: factory(BG_W, Math.round((BG_W * H) / W)),
    glow,
    range: range ?? { from: 0, to: project.duration }
  }
}

const BG_W = 384
const CARD_MAIN = 450
const CARD_NEXT = 330
/** Main card size in a 9:16 (phone) video, where the cards stack vertically. */
const CARD_MAIN_PORTRAIT = 500
const PORTRAIT_TEXT = 1.45
/** Social (TikTok, Reels) cards and text: smaller, so both cards fit between the apps' overlays. */
const CARD_MAIN_SOCIAL = 320
const CARD_NEXT_SOCIAL = 210
const SOCIAL_TEXT = 1.15

/**
 * Where TikTok and Reels draw their own UI over a 1080x1920 video (tabs and search at the top,
 * caption, sound and progress bar at the bottom, like/comment/share down the right). A social
 * video keeps everything inside the rest.
 */
export const SOCIAL_SAFE = { top: 210, bottom: 440, left: 60, right: 150 }

type Size = { width: number; height: number; social?: boolean }
export const isPortrait = (settings: Size) => settings.height > settings.width
export const isSocial = (settings: Size) => isPortrait(settings) && !!settings.social
export const videoFormat = (settings: Size): VideoFormat => (isSocial(settings) ? 'social' : isPortrait(settings) ? 'portrait' : 'landscape')

/** The settings change that switches a video to `format`, keeping its resolution. */
export function formatPatch(settings: Size, format: VideoFormat): Partial<RenderSettings> {
  const portrait = format !== 'landscape'
  const turn = portrait !== isPortrait(settings) ? { width: settings.height, height: settings.width } : {}
  return { ...turn, social: format === 'social' }
}
const cardMain = (settings: Size) => (isSocial(settings) ? CARD_MAIN_SOCIAL : isPortrait(settings) ? CARD_MAIN_PORTRAIT : CARD_MAIN)
const cardNext = (settings: Size) => (isSocial(settings) ? CARD_NEXT_SOCIAL : CARD_NEXT)
const textScaleFor = (settings: Size) => (isSocial(settings) ? SOCIAL_TEXT : isPortrait(settings) ? PORTRAIT_TEXT : 1)

/** Left and right edges of what's drawn, in pixels: inside the apps' buttons in social. */
function sideMargins(settings: Size, s: number): { left: number; right: number } {
  return isSocial(settings) ? { left: SOCIAL_SAFE.left * s, right: settings.width - SOCIAL_SAFE.right * s } : { left: 60 * s, right: settings.width - 60 * s }
}

/** Top of the waveform in each lane of the bottom area, measured up from the bottom edge. */
const WAVE_LANES = { top: 250, middle: 182, bottom: 114 }
const WAVE_H = 64
const PROGRESS_ROOM = 24
/** Social: the waveform starts this far right of the margin when the name sits left of it. */
const SOCIAL_WAVE_AFTER_NAME = 290
const SOCIAL_WAVE_H = 52
/** Social: middle of the REKCUT name's capitals, below the safe top, in text-scaled pixels. */
const SOCIAL_NAME_MID = 71

/** Where the close-up waveform goes: a lane of the bottom area, or under the header in social. */
export function waveRect(settings: Size & { wavePosition?: WavePosition; progressBar?: { show: boolean }; djName?: string }, s: number): { x: number; y: number; w: number; h: number } {
  const { left, right } = sideMargins(settings, s)
  // The lanes move up a little to leave the completion line its own room along the bottom.
  const lift = settings.progressBar?.show ? PROGRESS_ROOM : 0
  if (isSocial(settings)) {
    // On the header's first line: right of the REKCUT name, or all of it on a paid plan (no name).
    const x = settings.djName ? left + SOCIAL_WAVE_AFTER_NAME * s : left
    const h = SOCIAL_WAVE_H * s
    return { x, y: SOCIAL_SAFE.top * s + SOCIAL_NAME_MID * SOCIAL_TEXT * s - h / 2, w: right - x, h }
  }
  const y = settings.height - (WAVE_LANES[settings.wavePosition ?? 'bottom'] + lift) * s
  return { x: left, y, w: right - left, h: WAVE_H * s }
}
const GLOW_BASE = 200
const GLOW_PAD = 80

function makeGlow(color: string, factory: CanvasFactory): CanvasLike {
  const size = GLOW_BASE + GLOW_PAD * 2
  const c = factory(size, size)
  const ctx = ctxOf(c)
  ctx.shadowColor = color
  ctx.shadowBlur = 46
  ctx.fillStyle = color
  roundRectPath(ctx, GLOW_PAD, GLOW_PAD, GLOW_BASE, GLOW_BASE, 12)
  ctx.fill()
  return c
}

function drawBackground(out: Ctx, prep: PreparedScene, cards: CardState[]) {
  const { width: OW, height: OH, theme } = prep.project.settings
  const ctx = ctxOf(prep.bg)
  const W = prep.bg.width
  const H = prep.bg.height
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, W, H)
  for (const c of cards) {
    const a = prep.art.get(c.track.id)
    const alpha = 0.6 * c.mainness * c.opacity
    if (!a || alpha <= 0.001) continue
    ctx.globalAlpha = alpha
    drawCover(ctx, a.blurred, 0, 0, W, H)
  }
  ctx.globalAlpha = 1
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, hexToRgba(theme.background, 0.45))
  g.addColorStop(0.55, hexToRgba(theme.background, 0.55))
  g.addColorStop(1, hexToRgba(theme.background, 0.95))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.45, W * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
  out.imageSmoothingQuality = 'medium'
  out.drawImage(prep.bg as unknown as ImageLike, 0, 0, OW, OH)
  out.imageSmoothingQuality = 'low'
}

function drawHeader(ctx: Ctx, prep: PreparedScene, t: number) {
  const settings = prep.project.settings
  const W = settings.width
  const s = prep.scale
  const ts = prep.textScale
  const f = prep.font
  const { left, right } = sideMargins(settings, s)
  const top = isSocial(settings) ? SOCIAL_SAFE.top * s : 0
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let y = top + 86 * ts
  const social = isSocial(settings)
  if (settings.djName) {
    ctx.fillStyle = settings.theme.text
    ctx.font = `800 ${42 * ts}px ${f}`
    const nameW = social ? (SOCIAL_WAVE_AFTER_NAME - 30) * s : (right - left) * 0.6
    ctx.fillText(fitText(ctx, settings.djName.toLocaleUpperCase(settings.videoLanguage ?? 'en'), nameW), left, y)
    y += 40 * ts
  } else if (social) {
    // The waveform has the whole first line, so the title stays on the second.
    y += 40 * ts
  }
  if (settings.setTitle) {
    ctx.fillStyle = hexToRgba(settings.theme.text, 0.65)
    ctx.font = `400 ${26 * ts}px ${f}`
    ctx.fillText(fitText(ctx, settings.setTitle, (right - left) * 0.6), left, y)
  }
  // Social has the waveform where the clock would be, and the completion line shows what's left.
  if (settings.showTimestamps && !social) {
    ctx.textAlign = 'right'
    ctx.font = `600 ${26 * ts}px ${f}`
    ctx.fillStyle = hexToRgba(settings.theme.text, 0.85)
    const total = prep.project.duration
    const hours = total >= 3600
    ctx.fillText(`${formatTime(t, hours)} / ${formatTime(total, hours)}`, right, top + 86 * ts)
    ctx.textAlign = 'left'
  }
}

/** Bounce strength of a card that's playing on the right, relative to the main card. */
const LAYERED_BOUNCE = 0.5

/** Where a card at `slot` sits along the axis the cards share (x in 16:9, y in 9:16). */
function slotPos(slot: number, share: number, alone: number, main: number, next: number) {
  // A track on its own takes the centre; the main spot moves over while another card is on stage.
  const first = lerp(alone, main, share)
  return slot >= 0 ? lerp(first, next, slot) : first + slot * (next - main)
}

function drawCard(ctx: Ctx, prep: PreparedScene, c: CardState, mo: { beat: number; glow: number; soft: number }, share: number) {
  const settings = prep.project.settings
  const W = settings.width
  const s = prep.scale
  const f = prep.font
  // 16:9: main card on the left, next on the right. 9:16: main card on top, next below it.
  // Social: the same, in the space left between the apps' overlays and under the waveform.
  const portrait = isPortrait(settings)
  const social = isSocial(settings)
  const { left, right } = sideMargins(settings, s)
  const cx = portrait ? (left + right) / 2 : slotPos(c.slot, share, W * 0.5, W * 0.3, W * 0.71)
  const cy = social ? slotPos(c.slot, share, 840 * s, 624 * s, 1125 * s) : portrait ? slotPos(c.slot, share, 880 * s, 520 * s, 1240 * s) : 395 * s
  // How much the card moves with the bass: fully for the main card, less for one playing underneath.
  const energy = c.playing ? Math.max(c.mainness, LAYERED_BOUNCE) : c.mainness
  const pulse = 1 + 0.05 * mo.beat * energy
  const baseSize = lerp(cardNext(settings) * s, cardMain(settings) * s, c.mainness)
  const size = baseSize * pulse
  // The text follows a smoothed bounce, so it floats under the artwork instead of jolting with it.
  const textSize = baseSize * (1 + 0.05 * mo.soft * energy)
  const x = cx - size / 2
  const y = cy - size / 2
  const color = deckColor(prep.project, c.track)
  const radius = 22 * s

  ctx.save()
  ctx.globalAlpha = c.opacity

  // Glow, swelling with the kicks (or the vocals when there's no bass) on the main card
  const glow = prep.glow.get(color)
  if (glow) {
    const k = (size / GLOW_BASE) * (1 + 0.14 * mo.glow * energy)
    const gs = (GLOW_BASE + GLOW_PAD * 2) * k
    ctx.globalAlpha = c.opacity * Math.min(1, 0.45 + 0.55 * mo.glow * energy)
    ctx.drawImage(glow as unknown as ImageLike, cx - gs / 2, cy - gs / 2, gs, gs)
    ctx.globalAlpha = c.opacity
  }

  // Artwork
  ctx.save()
  roundRectPath(ctx, x, y, size, size, radius)
  ctx.clip()
  const a = prep.art.get(c.track.id)
  if (a) {
    drawCover(ctx, a.image, x, y, size, size)
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size)
    g.addColorStop(0, hexToRgba(color, 0.9))
    g.addColorStop(1, hexToRgba(settings.theme.background, 1))
    ctx.fillStyle = g
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `800 ${size * 0.42}px ${f}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', cx, cy)
  }
  // Dim the incoming card slightly
  if (c.mainness < 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - c.mainness)})`
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()

  // Border
  roundRectPath(ctx, x, y, size, size, radius)
  ctx.lineWidth = 2 * s
  ctx.strokeStyle = hexToRgba(color, 0.35 + 0.5 * c.mainness)
  ctx.stroke()

  // Text
  const ts = prep.textScale
  const tx = cx
  let ty = cy + textSize / 2 + (portrait ? 46 : 52) * ts
  const maxW = portrait ? right - left : lerp(520 * s, 620 * s, c.mainness)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const num = String(c.index + 1).padStart(2, '0')
  ctx.font = `700 ${18 * ts}px ${f}`
  ctx.fillStyle = color
  const vt = videoText(settings.videoLanguage)
  const what =
    c.playing && c.role !== 'leaving'
      ? vt.nowPlaying
      : c.role === 'leaving' || c.role === 'tail'
        ? vt.previous
        : c.role === 'incoming' || c.mainness < 0.5
          ? vt.upNext
          : vt.nowPlaying
  const label = `${what}  ·  ${num}`
  ctx.fillText(label, tx, ty)
  ty += 46 * ts
  ctx.fillStyle = settings.theme.text
  ctx.font = `800 ${lerp(30, 40, c.mainness) * ts}px ${f}`
  ctx.fillText(fitText(ctx, c.track.title || vt.unknownTrack, maxW), tx, ty)
  ty += lerp(36, 44, c.mainness) * ts
  ctx.fillStyle = hexToRgba(settings.theme.text, 0.7)
  ctx.font = `500 ${lerp(22, 28, c.mainness) * ts}px ${f}`
  ctx.fillText(fitText(ctx, c.track.artist || vt.unknownArtist, maxW), tx, ty)

  ctx.restore()
}

function drawZoomStrip(ctx: Ctx, prep: PreparedScene, t: number, beat: number) {
  const { project, sorted, scale: s } = prep
  const { theme } = project.settings
  const wf = project.waveform
  const { x: x0, y: y0, w, h } = waveRect(project.settings, s)
  const mid = y0 + h / 2
  const windowSec = 10
  const pxPerSec = w / (windowSec * 2)
  const bar = Math.max(2, Math.round(2 * s))
  const step = bar + Math.max(1, Math.round(s))
  const cx = x0 + w / 2

  // Bars sit on a fixed time grid that scrolls with t, and each shows the loudest bucket in its
  // slice, so kicks don't flicker in and out as the window moves.
  const barSec = step / pxPerSec
  const first = Math.floor((t - windowSec) / barSec)
  for (let k = first; k * barSec <= t + windowSec; k++) {
    const tt = k * barSec
    const x = (tt - t) * pxPerSec + w / 2
    if (x < 0 || x > w || tt < 0 || tt > project.duration) continue
    let pk = 0
    for (let i = Math.floor(tt * wf.rate), end = Math.floor((tt + barSec) * wf.rate); i <= end; i++) pk = Math.max(pk, wf.peaks[i] ?? 0)
    const edge = Math.min(1, Math.min(x, w - x) / (w * 0.18))
    const ph = Math.max(1, pk * (h / 2))
    if (tt <= t) {
      const tr = trackAtTime(sorted, tt)
      ctx.fillStyle = hexToRgba(deckColor(project, tr), 0.9 * edge)
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.45 * edge})`
    }
    ctx.fillRect(x0 + x, mid - ph, bar, ph * 2)
  }
  // Track boundaries inside the window
  for (const tr of sorted) {
    const dx = (tr.start - t) * pxPerSec
    if (Math.abs(dx) > w / 2 || tr.start <= 0) continue
    ctx.fillStyle = hexToRgba(deckColor(project, tr), 0.9)
    ctx.fillRect(cx + dx - 1 * s, y0 - 6 * s, 2 * s, h + 12 * s)
  }
  // Playhead, stretching a little with the beat
  const ph = (h + 16 * s) * (1 + 0.22 * beat)
  ctx.fillStyle = theme.text
  ctx.fillRect(cx - 1.5 * s, mid - ph / 2, 3 * s, ph)
}

export function drawFrame(ctx: Ctx, prep: PreparedScene, t: number) {
  const settings = prep.project.settings
  const cards = cardStates(prep.sorted, t, settings, prep.swaps)
  const mo = motionAt(prep.motion, t)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  drawBackground(ctx, prep, cards)
  drawHeader(ctx, prep, t)
  // Leaving card first, then incoming, then main on top.
  const order = [...cards].sort((a, b) => a.mainness - b.mainness)
  const share = stageShare(cards)
  for (const c of order) drawCard(ctx, prep, c, mo, share)
  // `!== false` so projects saved before this setting existed keep the waveform.
  if (settings.showDeckWave !== false) drawZoomStrip(ctx, prep, t, mo.beat)
  drawProgress(ctx, prep, t, mo.beat)
  ctx.restore()
}

/**
 * The completion line: fills from left to right over the video, so viewers see how much is left
 * (it keeps people watching). Along the bottom edge in every format, social too.
 */
function drawProgress(ctx: Ctx, prep: PreparedScene, t: number, beat: number) {
  const { project, sorted, scale: s, range } = prep
  const settings = project.settings
  const pb = settings.progressBar
  if (!pb?.show) return
  const done = Math.min(1, Math.max(0, (t - range.from) / Math.max(1e-6, range.to - range.from)))
  const color = pb.color === 'deck' ? deckColor(project, trackAtTime(sorted, t)) : pb.color
  const size = pb.size * s * (1 + 0.8 * pb.pulse * beat)
  const bottom = settings.height
  // The apps' buttons stop above the bottom edge, so social uses the plain margins here.
  const { left, right } = pb.style !== 'flat' ? { left: 60 * s, right: settings.width - 60 * s } : { left: 0, right: settings.width }
  const w = right - left
  // Flat sits on the edge; the others keep a sliver of space under them so their ends stay round.
  const cy = pb.style === 'flat' ? bottom - size / 2 : bottom - size / 2 - 10 * s
  const head = left + w * done
  ctx.save()
  if (pb.style === 'flat') {
    ctx.fillStyle = color
    ctx.fillRect(left, cy - size / 2, head - left, size)
  } else {
    ctx.fillStyle = hexToRgba(settings.theme.text, 0.14)
    roundRectPath(ctx, left, cy - size / 2, w, size, size / 2)
    ctx.fill()
    if (pb.style === 'glow') {
      // Wider, fainter copies instead of shadowBlur, which is slow without a GPU.
      for (const [k, a] of [[4, 0.1], [2.4, 0.2]] as const) {
        ctx.fillStyle = hexToRgba(color, a * (0.7 + 0.6 * pb.pulse * beat))
        roundRectPath(ctx, left - (k - 1) * size * 0.5, cy - (size * k) / 2, head - left + (k - 1) * size, size * k, (size * k) / 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = color
    roundRectPath(ctx, left, cy - size / 2, Math.max(size, head - left), size, size / 2)
    ctx.fill()
    if (pb.style === 'glow') {
      ctx.fillStyle = settings.theme.text
      ctx.beginPath()
      ctx.arc(head, cy, size * 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/**
 * Grey stand-ins for the buttons, captions and tabs TikTok or Reels draw over a video, so a social
 * layout can be checked in the preview. Only the preview calls this: it's never in an export.
 */
export function drawAppOverlay(ctx: Ctx, settings: { width: number; height: number }, kind: AppOverlay) {
  if (kind === 'off') return
  const W = settings.width
  const H = settings.height
  const s = Math.min(W, H) / 1080
  const ink = 'rgba(255,255,255,0.78)'
  const faint = 'rgba(255,255,255,0.45)'
  ctx.save()
  ctx.textBaseline = 'middle'
  // Shade where the app draws, so the stand-ins read as UI over the video.
  const top = ctx.createLinearGradient(0, 0, 0, 240 * s)
  top.addColorStop(0, 'rgba(0,0,0,0.45)')
  top.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 240 * s)
  const bot = ctx.createLinearGradient(0, H - 520 * s, 0, H)
  bot.addColorStop(0, 'rgba(0,0,0,0)')
  bot.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = bot
  ctx.fillRect(0, H - 520 * s, W, 520 * s)

  const pill = (x: number, y: number, w: number, h: number, color = faint) => {
    ctx.fillStyle = color
    roundRectPath(ctx, x, y, w, h, h / 2)
    ctx.fill()
  }
  const dot = (x: number, y: number, r: number, color = ink) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const label = (text: string, x: number, y: number, size: number, weight = 600, color = ink, align: CanvasTextAlign = 'left') => {
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.font = `${weight} ${size * s}px ${FONT}`
    ctx.fillText(text, x, y)
  }
  // The right-hand column of round buttons with counts under them.
  const column = (x: number, y0: number, n: number, gap: number, first: 'avatar' | 'button') => {
    for (let i = 0; i < n; i++) {
      const y = y0 + i * gap
      if (i === 0 && first === 'avatar') {
        dot(x, y, 46 * s, faint)
        dot(x, y + 46 * s, 14 * s, 'rgba(255,60,100,0.8)')
      } else {
        dot(x, y, 34 * s)
        label('12.3K', x, y + 58 * s, 24, 600, ink, 'center')
      }
    }
  }

  if (kind === 'tiktok') {
    label('Following', W / 2 - 30 * s, 110 * s, 34, 600, faint, 'right')
    label('For You', W / 2 + 30 * s, 110 * s, 34, 800, ink, 'left')
    pill(W / 2 + 60 * s, 140 * s, 90 * s, 6 * s, ink)
    dot(W - 70 * s, 110 * s, 24 * s, faint)
    column(W - 80 * s, 940 * s, 5, 160 * s, 'avatar')
    dot(W - 80 * s, 1720 * s, 44 * s, faint)
    label('@username', 40 * s, 1610 * s, 34, 800)
    pill(40 * s, 1660 * s, 780 * s, 26 * s)
    pill(40 * s, 1706 * s, 560 * s, 26 * s)
    label('♫  original sound', 40 * s, 1776 * s, 28, 500)
    pill(0, H - 8 * s, W, 4 * s, faint)
  } else {
    label('Reels', 40 * s, 110 * s, 44, 800)
    dot(W - 70 * s, 110 * s, 26 * s, faint)
    column(W - 70 * s, 1160 * s, 4, 150 * s, 'button')
    dot(W - 70 * s, 1760 * s, 20 * s, faint)
    pill(W - 110 * s, 1810 * s, 80 * s, 80 * s, faint)
    dot(80 * s, 1620 * s, 34 * s, faint)
    label('username', 134 * s, 1620 * s, 32, 800)
    ctx.strokeStyle = ink
    ctx.lineWidth = 2 * s
    roundRectPath(ctx, 300 * s, 1596 * s, 130 * s, 48 * s, 12 * s)
    ctx.stroke()
    label('Follow', 365 * s, 1620 * s, 26, 700, ink, 'center')
    pill(46 * s, 1686 * s, 720 * s, 26 * s)
    label('♫  username · Original audio', 46 * s, 1760 * s, 28, 500)
  }
  ctx.restore()
}
