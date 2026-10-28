import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { appearTime, currentIndex, formatTime, mainTracks, tailTime } from '@shared/layout'
import { buildMotion } from '@shared/motion'
import { planSwaps, swapLength } from '@shared/swapPlan'
import type { Project, Track } from '@shared/types'
import { mediaUrl } from '../api'
import { Icon } from './icons'

export interface TimelineHandle {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
}

interface Props {
  ref?: Ref<TimelineHandle>
  project: Project
  time: number
  playing: boolean
  selectedId: string | null
  onSeek: (t: number) => void
  onSelect: (id: string) => void
  onChangeTrack: (id: string, patch: Partial<Track>, mergeKey?: string) => void
}

const RULER = 24
const LANE_H = 48
const LANE_GAP = 4
const MIN_WAVE = 48
const PLAYHEAD = '#f0a530'

/** Lane positions for a timeline body of the given height; the master waveform takes the slack. */
function lanes(height: number) {
  const WAVE_H = Math.max(MIN_WAVE, Math.min(160, height - RULER - 2 * LANE_H - 3 * LANE_GAP - 14))
  const LANE_A = RULER + WAVE_H + LANE_GAP + 4
  const LANE_B = LANE_A + LANE_H + LANE_GAP
  return { WAVE_H, LANE_A, LANE_B, total: LANE_B + LANE_H + 8 }
}

function TrackHeaders({ geo, theme }: { geo: ReturnType<typeof lanes>; theme?: { accent: string; accentB: string } }) {
  return (
    <div className="track-headers">
      <div className="th-ruler" style={{ height: RULER }} />
      <div className="th" style={{ top: RULER, height: geo.WAVE_H + 2 }}>
        <Icon name="speaker" size={13} />
        <span>Set audio</span>
      </div>
      <div className="th" style={{ top: geo.LANE_A, height: LANE_H }}>
        <span className="th-swatch" style={{ background: theme?.accent }} />
        <span>Deck A</span>
      </div>
      <div className="th" style={{ top: geo.LANE_B, height: LANE_H }}>
        <span className="th-swatch" style={{ background: theme?.accentB }} />
        <span>Deck B</span>
      </div>
    </div>
  )
}

/** Measures the height available to the timeline body. */
function useBodyHeight() {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(220)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.clientHeight))
    ro.observe(el)
    setH(el.clientHeight)
    return () => ro.disconnect()
  }, [])
  return [ref, h] as const
}

/** The timeline before a set is loaded: same headers and lanes, nothing on them. */
export function EmptyTimeline() {
  const [bodyRef, bodyH] = useBodyHeight()
  const geo = lanes(bodyH)
  return (
    <div className="panel timeline">
      <div className="timeline-toolbar">
        <span className="panel-tab on">Timeline</span>
      </div>
      <div className="timeline-body" ref={bodyRef}>
        <TrackHeaders geo={geo} />
        <div className="timeline-scroll empty-lanes">
          <div className="ruler-empty" style={{ height: RULER }} />
          <div className="lane-bg" style={{ top: RULER, height: geo.WAVE_H }} />
          <div className="lane-bg" style={{ top: geo.LANE_A, height: LANE_H }} />
          <div className="lane-bg" style={{ top: geo.LANE_B, height: LANE_H }} />
          <div className="timeline-hint" style={{ top: RULER, height: geo.WAVE_H }}>
            Import a set recording, then its Rekordbox .cue: the tracks land on Deck A and Deck B
          </div>
        </div>
      </div>
    </div>
  )
}

function tickStep(pps: number) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]
  return steps.find((s) => s * pps >= 70) ?? 3600
}

export function Timeline({ ref, project, time, playing, selectedId, onSeek, onSelect, onChangeTrack }: Props) {
  const [bodyRef, bodyH] = useBodyHeight()
  const { WAVE_H, LANE_A, LANE_B, total: TIMELINE_HEIGHT } = lanes(bodyH - 12)
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewW, setViewW] = useState(800)
  const [zoom, setZoomState] = useState(1) // 1 = whole set fits
  /** Time and screen offset to keep fixed when the zoom changes. */
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null)
  /** When the user last scrolled by hand; following the playhead pauses for a while after that. */
  const userScrolledAt = useRef(0)
  const autoScrolling = useRef(false)
  const dur = Math.max(1, project.duration)
  const fitPps = viewW / dur
  const pps = fitPps * zoom
  const innerW = Math.max(viewW, dur * pps)
  const sorted = mainTracks(project.tracks)
  const swaps = planSwaps(sorted, project.settings, buildMotion(project.waveform))
  const layered = project.tracks.filter((t) => t.layered)
  const { theme } = project.settings

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    setViewW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Ruler + waveform for the visible window only. Drawn straight from the scroll handler too, with
  // the live scroll position, so the sticky canvas never lags a frame behind the lanes.
  const draw = useRef<() => void>(() => {})
  draw.current = () => {
    const c = canvasRef.current
    if (!c) return
    const scrollX = scrollRef.current?.scrollLeft ?? 0
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(viewW * dpr)
    c.height = Math.round((RULER + WAVE_H) * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, viewW, RULER + WAVE_H)
    const t0 = scrollX / pps
    const t1 = (scrollX + viewW) / pps

    ctx.fillStyle = '#18181b'
    ctx.fillRect(0, RULER, viewW, WAVE_H)
    // segments tint
    sorted.forEach((tr, i) => {
      const a = (i === 0 ? 0 : tr.start) * pps - scrollX
      const b = (i + 1 < sorted.length ? sorted[i + 1].start : dur) * pps - scrollX
      ctx.fillStyle = (tr.deck === 'B' ? theme.accentB : theme.accent) + '14'
      ctx.fillRect(a, RULER, b - a, WAVE_H)
    })

    const wf = project.waveform
    const mid = RULER + WAVE_H / 2
    for (let x = 0; x < viewW; x += 2) {
      const ta = (scrollX + x) / pps
      const tb = (scrollX + x + 2) / pps
      if (ta > dur) break
      const ia = Math.floor(ta * wf.rate)
      const ib = Math.max(ia + 1, Math.floor(tb * wf.rate))
      let pk = 0
      let rms = 0
      for (let i = ia; i < ib && i < wf.peaks.length; i++) {
        if (wf.peaks[i] > pk) pk = wf.peaks[i]
        if (wf.rms[i] > rms) rms = wf.rms[i]
      }
      const played = ta <= time
      ctx.fillStyle = played ? 'rgba(120,200,170,0.55)' : 'rgba(120,200,170,0.3)'
      const h = pk * (WAVE_H / 2 - 2)
      ctx.fillRect(x, mid - h, 1.5, h * 2)
      ctx.fillStyle = played ? 'rgba(170,235,210,0.95)' : 'rgba(150,215,190,0.55)'
      const r = Math.min(h, rms * 1.4 * (WAVE_H / 2 - 2))
      ctx.fillRect(x, mid - r, 1.5, r * 2)
    }

    // ruler: labelled major ticks with four minor ticks between them
    const step = tickStep(pps)
    ctx.fillStyle = '#1b1b1e'
    ctx.fillRect(0, 0, viewW, RULER)
    ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    ctx.textBaseline = 'middle'
    for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
      const x = Math.round(t * pps - scrollX) + 0.5
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.fillRect(x, RULER - 10, 1, 10)
      for (let k = 1; k < 5; k++) ctx.fillRect(x + (k * step * pps) / 5, RULER - 4, 1, 4)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillText(formatTime(t, dur >= 3600), x + 4, 8)
    }
    // a cue marker where each track takes over
    for (const tr of sorted) {
      const x = tr.start * pps - scrollX
      if (x < -6 || x > viewW + 6) continue
      ctx.fillStyle = tr.deck === 'B' ? theme.accentB : theme.accent
      ctx.beginPath()
      ctx.moveTo(x - 4, RULER - 7)
      ctx.lineTo(x + 4, RULER - 7)
      ctx.lineTo(x, RULER - 1)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#0e0e10'
    ctx.fillRect(0, RULER - 1, viewW, 1)
  }
  useLayoutEffect(() => draw.current(), [project.waveform, sorted.map((t) => t.start + t.deck).join(), viewW, pps, time, dur, theme, WAVE_H])

  const setZoom = (next: number | ((z: number) => number), anchorClientX?: number) => {
    const el = scrollRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const x = anchorClientX !== undefined ? anchorClientX - rect.left : viewW / 2
      zoomAnchor.current = { t: (el.scrollLeft + x) / pps, x }
      userScrolledAt.current = Date.now()
    }
    setZoomState(next)
  }

  // Apply the zoom anchor before paint so the view doesn't jump for a frame.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const a = zoomAnchor.current
    if (!el || !a) return
    zoomAnchor.current = null
    autoScrolling.current = true
    el.scrollLeft = Math.max(0, a.t * pps - a.x)
    draw.current()
  }, [pps])

  // Keep the playhead in view while playing, unless the user just scrolled or zoomed.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing || Date.now() - userScrolledAt.current < 4000) return
    const x = time * pps
    if (x < el.scrollLeft || x > el.scrollLeft + viewW - 40) {
      autoScrolling.current = true
      el.scrollLeft = Math.max(0, x - viewW * 0.25)
    }
  }, [time, playing, pps, viewW])

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const rect = scrollRef.current!.getBoundingClientRect()
      onSeek(Math.max(0, Math.min(dur, (clientX - rect.left + scrollRef.current!.scrollLeft) / pps)))
    },
    [onSeek, pps, dur]
  )

  const startScrub = (e: React.PointerEvent) => {
    seekFromEvent(e.clientX)
    const move = (ev: PointerEvent) => seekFromEvent(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startDrag = (e: React.PointerEvent, tr: Track, what: 'move' | 'mixin') => {
    e.stopPropagation()
    onSelect(tr.id)
    const x0 = e.clientX
    const start0 = tr.start
    const idx = sorted.findIndex((t) => t.id === tr.id)
    const mix0 = what === 'mixin' ? appearTime(sorted, idx, project.settings, swapLength(swaps, project.settings, idx)) : tr.mixIn
    let moved = false
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps
      if (!moved && Math.abs(ev.clientX - x0) < 3) return
      moved = true
      if (what === 'move') {
        const start = Math.max(0, Math.min(dur, start0 + dt))
        onChangeTrack(tr.id, { start, mixIn: mix0 !== undefined ? Math.max(0, mix0 + (start - start0)) : undefined }, `drag-${tr.id}`)
      } else {
        onChangeTrack(tr.id, { mixIn: Math.max(0, Math.min(tr.start, (mix0 ?? tr.start) + dt)) }, `mix-${tr.id}`)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return
    setZoom((z) => Math.max(1, Math.min(400, z * Math.exp(-e.deltaY * 0.002))), e.clientX)
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => setZoom((z) => Math.min(400, z * 1.6)),
    zoomOut: () => setZoom((z) => Math.max(1, z / 1.6)),
    fit: () => setZoom(1)
  }))

  return (
    <div className="panel timeline">
      <div className="timeline-toolbar">
        <span className="panel-tab on">Timeline</span>
        <span className="panel-meta">
          {sorted.length} tracks{layered.length ? ` · ${layered.length} layered` : ''}
        </span>
        <div className="grow" />
        <span className="panel-meta">Ctrl/Alt + wheel to zoom</span>
        <button className="icon-btn small" title="Zoom out (−)" onClick={() => setZoom((z) => Math.max(1, z / 1.6))}>
          <Icon name="minus" size={13} />
        </button>
        <input className="zoom-slider" type="range" min={0} max={6} step={0.01} value={Math.log(zoom)} onChange={(e) => setZoom(Math.exp(+e.target.value))} />
        <button className="icon-btn small" title="Zoom in (=)" onClick={() => setZoom((z) => Math.min(400, z * 1.6))}>
          <Icon name="plus" size={13} />
        </button>
        <button className="icon-btn small" title="Fit the whole set (\)" onClick={() => setZoom(1)}>
          <Icon name="fit" size={13} />
        </button>
      </div>
      <div className="timeline-body" ref={bodyRef}>
        <TrackHeaders geo={{ WAVE_H, LANE_A, LANE_B, total: TIMELINE_HEIGHT }} theme={theme} />
        <div
          className="timeline-scroll"
          ref={scrollRef}
          onScroll={() => {
            draw.current()
            if (!autoScrolling.current) userScrolledAt.current = Date.now()
            autoScrolling.current = false
          }}
          onWheel={onWheel}
        >
          <div className="timeline-inner" style={{ width: innerW, height: TIMELINE_HEIGHT }}>
            <canvas ref={canvasRef} className="timeline-canvas" style={{ width: viewW, height: RULER + WAVE_H }} onPointerDown={startScrub} />
            <div className="lane-bg" style={{ top: LANE_A, height: LANE_H }} onPointerDown={startScrub} />
            <div className="lane-bg" style={{ top: LANE_B, height: LANE_H }} onPointerDown={startScrub} />
            {sorted.map((tr, i) => {
              const start = i === 0 ? Math.min(tr.start, 0) : tr.start
              const end = i + 1 < sorted.length ? sorted[i + 1].start : dur
              const appear = appearTime(sorted, i, project.settings, swapLength(swaps, project.settings, i))
              const plan = (project.settings.swapCurve ?? 'auto') === 'auto' ? swaps[i] : undefined
              const top = tr.deck === 'B' ? LANE_B : LANE_A
              const color = tr.deck === 'B' ? theme.accentB : theme.accent
              const left = start * pps
              const width = Math.max(4, (end - start) * pps)
              const tail = tailTime(sorted, i, project.settings)
              return (
                <div key={tr.id}>
                  {tail !== undefined && (
                    <div
                      className="mix-tail"
                      title="Still playing under the next track until here (shown on the right as 'now playing')"
                      style={{ left: end * pps, width: (tail - end) * pps, top: top + 6, height: LANE_H - 12, ['--c' as string]: color }}
                    />
                  )}
                  {i > 0 && tr.start - appear > 0.5 && (
                    <div
                      className="mix-lead"
                      title="Mix-in: when this track appears on the right. Drag the edge to change it."
                      style={{ left: appear * pps, width: (tr.start - appear) * pps, top: top + 6, height: LANE_H - 12, ['--c' as string]: color }}
                    >
                      <div className="mix-handle" onPointerDown={(e) => startDrag(e, tr, 'mixin')} />
                    </div>
                  )}
                  <div
                    className={`track-block ${selectedId === tr.id ? 'selected' : ''}`}
                    style={{ left, width, top, height: LANE_H, ['--c' as string]: color }}
                    onPointerDown={(e) => startDrag(e, tr, 'move')}
                    onDoubleClick={() => onSeek(tr.start)}
                    title={`${tr.artist} – ${tr.title}${plan ? `\nSwap: ${plan.curve}, ${plan.duration.toFixed(1)} s (${plan.reason})` : ''}\nDrag to move · double-click to jump here`}
                  >
                    {tr.artwork && width > 60 && <img src={mediaUrl(tr.artwork)} alt="" draggable={false} />}
                    {width > 90 && (
                      <div className="tb-text">
                        <div className="tb-title">
                          <b>{i + 1}</b> {tr.title || 'Untitled'}
                        </div>
                        <div className="tb-artist">{tr.artist}</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {layered.map((tr) => {
              // Shown under the main lanes' blocks, from its cue to when the next main track takes over.
              const next = sorted[currentIndex(sorted, tr.start) + 1]
              const end = next && next.start > tr.start ? next.start : Math.min(dur, tr.start + 30)
              const color = tr.deck === 'B' ? theme.accentB : theme.accent
              const width = Math.max(4, (end - tr.start) * pps)
              return (
                <div
                  key={tr.id}
                  className={`track-block layered ${selectedId === tr.id ? 'selected' : ''}`}
                  style={{ left: tr.start * pps, width, top: (tr.deck === 'B' ? LANE_B : LANE_A) + LANE_H - 18, height: 16, ['--c' as string]: color }}
                  onPointerDown={(e) => startDrag(e, tr, 'move')}
                  onDoubleClick={() => onSeek(tr.start)}
                  title={`${tr.artist} – ${tr.title}\nLayered: mixed in under another track, never takes over`}
                >
                  {width > 60 && <div className="tb-title">{tr.title || 'Untitled'}</div>}
                </div>
              )
            })}
            <div className="playhead" style={{ left: time * pps, height: TIMELINE_HEIGHT, ['--c' as string]: PLAYHEAD }} />
          </div>
        </div>
      </div>
    </div>
  )
}
