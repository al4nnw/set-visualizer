/**
 * Draws one frame of the visualizer. The same code runs in the app's live preview (browser
 * canvas) and in the exporter (Skia canvas in Node), so what you see is what gets rendered.
 */
import type { Project, Track, Waveform } from './types'
import { cardStates, currentIndex, formatTime, lerp, mainTracks, type CardState } from './layout'
import { buildMotion, motionAt, type Motion } from './motion'

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
  wave: { x: number; y: number; w: number; h: number; unplayed: CanvasLike; played: CanvasLike }
  /** Low-res scratch canvas for the background (it's all blur and gradients, so it upscales cleanly). */
  bg: CanvasLike
  /** Pre-blurred glow sprite per deck colour; real-time shadowBlur is very slow without a GPU. */
  glow: Map<string, CanvasLike>
  motion: Motion
  scale: number
  /** Scale for text: larger than `scale` in 9:16, where the video is watched on a phone. */
  textScale: number
  font: string
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

function renderWaveLayer(
  prep: Omit<PreparedScene, "wave">,
  factory: CanvasFactory,
  w: number,
  h: number,
  played: boolean
): CanvasLike {
  const c = factory(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
  const ctx = ctxOf(c)
  const { project, sorted } = prep
  const wf = project.waveform
  const n = wf.peaks.length
  const mid = h / 2
  const bar = Math.max(2, Math.round(3 * prep.scale))
  const gap = Math.max(1, Math.round(prep.scale))
  const cols = Math.floor(w / (bar + gap))
  for (let col = 0; col < cols; col++) {
    const a = Math.floor((col / cols) * n)
    const b = Math.max(a + 1, Math.floor(((col + 1) / cols) * n))
    let pk = 0
    let rms = 0
    for (let i = a; i < b && i < n; i++) {
      if (wf.peaks[i] > pk) pk = wf.peaks[i]
      rms += wf.rms[i] ?? 0
    }
    rms /= b - a
    const x = col * (bar + gap)
    const ph = Math.max(1, pk * mid * 0.96)
    const rh = Math.max(1, Math.min(ph, rms * 1.6 * mid))
    if (played) {
      const tr = trackAtTime(sorted, (a / wf.rate + b / wf.rate) / 2)
      const col1 = deckColor(project, tr)
      ctx.fillStyle = hexToRgba(col1, 0.55)
      ctx.fillRect(x, mid - ph, bar, ph * 2)
      ctx.fillStyle = col1
      ctx.fillRect(x, mid - rh, bar, rh * 2)
    } else {
      ctx.fillStyle = project.settings.theme.waveUnplayed
      ctx.fillRect(x, mid - ph, bar, ph * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(x, mid - rh, bar, rh * 2)
    }
  }
  return c
}

export function prepareScene(project: Project, art: Map<string, ArtAsset>, factory: CanvasFactory): PreparedScene {
  const { width: W, height: H } = project.settings
  // Sizes are designed for 1080 on the short side, so a 9:16 video uses the same scale as 16:9.
  const s = Math.min(W, H) / 1080
  const sorted = mainTracks(project.tracks)
  const base = { project, sorted, art, motion: buildMotion(project.waveform), scale: s, textScale: isPortrait(project.settings) ? s * PORTRAIT_TEXT : s, font: FONT, bg: factory(1, 1), glow: new Map<string, CanvasLike>() }
  const x = 60 * s
  const w = W - 120 * s
  const h = 110 * s
  const y = H - 170 * s
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
    wave: {
      x,
      y,
      w,
      h,
      unplayed: renderWaveLayer(base, factory, w, h, false),
      played: renderWaveLayer(base, factory, w, h, true)
    }
  }
}

const BG_W = 384
const CARD_MAIN = 450
const CARD_NEXT = 330
/** Main card size in a 9:16 (phone) video, where the cards stack vertically. */
const CARD_MAIN_PORTRAIT = 500
const PORTRAIT_TEXT = 1.45

export const isPortrait = (settings: { width: number; height: number }) => settings.height > settings.width
const cardMain = (settings: { width: number; height: number }) => (isPortrait(settings) ? CARD_MAIN_PORTRAIT : CARD_MAIN)
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
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let y = 86 * ts
  if (settings.djName) {
    ctx.fillStyle = settings.theme.text
    ctx.font = `800 ${42 * ts}px ${f}`
    ctx.fillText(fitText(ctx, settings.djName.toUpperCase(), W * 0.6), 60 * s, y)
    y += 40 * ts
  }
  if (settings.setTitle) {
    ctx.fillStyle = hexToRgba(settings.theme.text, 0.65)
    ctx.font = `400 ${26 * ts}px ${f}`
    ctx.fillText(fitText(ctx, settings.setTitle, W * 0.6), 60 * s, y)
  }
  if (settings.showTimestamps) {
    ctx.textAlign = 'right'
    ctx.font = `600 ${26 * ts}px ${f}`
    ctx.fillStyle = hexToRgba(settings.theme.text, 0.85)
    const total = prep.project.duration
    const hours = total >= 3600
    ctx.fillText(`${formatTime(t, hours)} / ${formatTime(total, hours)}`, W - 60 * s, 86 * ts)
    ctx.textAlign = 'left'
  }
}

/** Bounce strength of a card that's playing on the right, relative to the main card. */
const LAYERED_BOUNCE = 0.5

function drawCard(ctx: Ctx, prep: PreparedScene, c: CardState, mo: { beat: number; glow: number }) {
  const settings = prep.project.settings
  const W = settings.width
  const s = prep.scale
  const f = prep.font
  // 16:9: main card on the left, next on the right. 9:16: main card on top, next below it.
  const portrait = isPortrait(settings)
  const cx = portrait ? W / 2 : lerp(W * 0.3, W * 0.71, c.slot)
  const cy = portrait ? lerp(540 * s, 1270 * s, c.slot) : 395 * s
  // How much the card moves with the bass: fully for the main card, less for one playing underneath.
  const energy = c.playing ? Math.max(c.mainness, LAYERED_BOUNCE) : c.mainness
  const pulse = 1 + 0.05 * mo.beat * energy
  const size = lerp(CARD_NEXT * s, cardMain(settings) * s, c.mainness) * pulse
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
  let ty = y + size + (portrait ? 46 : 52) * ts
  const maxW = portrait ? W - 120 * s : lerp(520 * s, 620 * s, c.mainness)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const num = String(c.index + 1).padStart(2, '0')
  ctx.font = `700 ${18 * ts}px ${f}`
  ctx.fillStyle = color
  const label =
    c.playing && c.role !== 'leaving'
      ? `NOW PLAYING  ·  ${num}`
      : c.role === 'leaving' || c.role === 'tail'
        ? `PREVIOUS  ·  ${num}`
        : c.role === 'incoming' || c.mainness < 0.5
          ? `UP NEXT  ·  ${num}`
          : `NOW PLAYING  ·  ${num}`
  ctx.fillText(label, tx, ty)
  ty += 46 * ts
  ctx.fillStyle = settings.theme.text
  ctx.font = `800 ${lerp(30, 40, c.mainness) * ts}px ${f}`
  ctx.fillText(fitText(ctx, c.track.title || 'Unknown track', maxW), tx, ty)
  ty += lerp(36, 44, c.mainness) * ts
  ctx.fillStyle = hexToRgba(settings.theme.text, 0.7)
  ctx.font = `500 ${lerp(22, 28, c.mainness) * ts}px ${f}`
  ctx.fillText(fitText(ctx, c.track.artist || 'Unknown artist', maxW), tx, ty)

  ctx.restore()
}

function drawZoomStrip(ctx: Ctx, prep: PreparedScene, t: number) {
  const { project, sorted, scale: s } = prep
  const { width: W, theme } = project.settings
  const wf = project.waveform
  const x0 = 60 * s
  const w = W - 120 * s
  const h = 64 * s
  const y0 = prep.wave.y - h - 26 * s
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
  ctx.fillStyle = theme.text
  ctx.fillRect(cx - 1.5 * s, y0 - 8 * s, 3 * s, h + 16 * s)
}

function drawWaveform(ctx: Ctx, prep: PreparedScene, t: number) {
  const { project, sorted, wave, scale: s, font: f } = prep
  const { theme } = project.settings
  const dur = Math.max(1e-6, project.duration)
  const px = (sec: number) => wave.x + (sec / dur) * wave.w
  const head = px(Math.min(t, dur))

  // Highlight current segment
  const ci = currentIndex(sorted, t)
  if (ci >= 0) {
    const a = px(ci === 0 ? 0 : sorted[ci].start)
    const b = ci + 1 < sorted.length ? px(sorted[ci + 1].start) : wave.x + wave.w
    ctx.fillStyle = hexToRgba(deckColor(project, sorted[ci]), 0.09)
    ctx.fillRect(a, wave.y - 4 * s, b - a, wave.h + 8 * s)
  }

  ctx.drawImage(wave.unplayed as unknown as ImageLike, wave.x, wave.y, wave.w, wave.h)
  ctx.save()
  ctx.beginPath()
  ctx.rect(wave.x, wave.y - 2, head - wave.x, wave.h + 4)
  ctx.clip()
  ctx.drawImage(wave.played as unknown as ImageLike, wave.x, wave.y, wave.w, wave.h)
  ctx.restore()

  // Track markers + numbers
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${14 * s}px ${f}`
  sorted.forEach((tr, i) => {
    const x = px(i === 0 ? 0 : tr.start)
    const color = deckColor(project, tr)
    ctx.fillStyle = hexToRgba(color, i === ci ? 1 : 0.55)
    if (i > 0) ctx.fillRect(x - 1 * s, wave.y - 6 * s, 2 * s, wave.h + 12 * s)
    const label = String(i + 1)
    const bw = Math.max(22 * s, ctx.measureText(label).width + 10 * s)
    ctx.fillRect(x, wave.y + wave.h + 10 * s, bw, 20 * s)
    ctx.fillStyle = '#0b0b10'
    ctx.fillText(label, x + bw / 2, wave.y + wave.h + 20.5 * s)
  })

  // Playhead
  ctx.fillStyle = hexToRgba(theme.text, 0.18)
  ctx.fillRect(head - 6 * s, wave.y - 10 * s, 12 * s, wave.h + 20 * s)
  ctx.fillStyle = theme.text
  ctx.fillRect(head - 1.5 * s, wave.y - 10 * s, 3 * s, wave.h + 20 * s)
}

export function drawFrame(ctx: Ctx, prep: PreparedScene, t: number) {
  const settings = prep.project.settings
  const cards = cardStates(prep.sorted, t, settings)
  const mo = motionAt(prep.motion, t)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  drawBackground(ctx, prep, cards)
  drawHeader(ctx, prep, t)
  // Leaving card first, then incoming, then main on top.
  const order = [...cards].sort((a, b) => a.mainness - b.mainness)
  for (const c of order) drawCard(ctx, prep, c, mo)
  // `!== false` so projects saved before these settings existed keep both.
  if (settings.showDeckWave !== false) drawZoomStrip(ctx, prep, t)
  if (settings.showSetWave !== false) drawWaveform(ctx, prep, t)
  ctx.restore()
}
