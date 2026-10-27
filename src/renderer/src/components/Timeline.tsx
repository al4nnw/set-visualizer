import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { appearTime, currentIndex, formatTime, mainTracks, tailTime } from '@shared/layout'
import type { Project, Track } from '@shared/types'
import { mediaUrl } from '../api'

interface Props {
  project: Project
  time: number
  playing: boolean
  selectedId: string | null
  onSeek: (t: number) => void
  onSelect: (id: string) => void
  onChangeTrack: (id: string, patch: Partial<Track>, mergeKey?: string) => void
}

const RULER = 22
const WAVE_H = 70
const LANE_H = 46
const LANE_GAP = 6
const LANE_A = RULER + WAVE_H + 10
const LANE_B = LANE_A + LANE_H + LANE_GAP
export const TIMELINE_HEIGHT = LANE_B + LANE_H + 12

function tickStep(pps: number) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]
  return steps.find((s) => s * pps >= 70) ?? 3600
}

export function Timeline({ project, time, playing, selectedId, onSeek, onSelect, onChangeTrack }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewW, setViewW] = useState(800)
  const [scrollX, setScrollX] = useState(0)
  const [zoom, setZoom] = useState(1) // 1 = whole set fits
  const dur = Math.max(1, project.duration)
  const fitPps = viewW / dur
  const pps = fitPps * zoom
  const innerW = Math.max(viewW, dur * pps)
  const sorted = mainTracks(project.tracks)
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

  // Ruler + waveform for the visible window only.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(viewW * dpr)
    c.height = Math.round((RULER + WAVE_H) * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, viewW, RULER + WAVE_H)
    const t0 = scrollX / pps
    const t1 = (scrollX + viewW) / pps

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
      ctx.fillStyle = played ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)'
      const h = pk * (WAVE_H / 2 - 2)
      ctx.fillRect(x, mid - h, 1.5, h * 2)
      ctx.fillStyle = played ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
      const r = Math.min(h, rms * 1.4 * (WAVE_H / 2 - 2))
      ctx.fillRect(x, mid - r, 1.5, r * 2)
    }

    // ruler
    const step = tickStep(pps)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '500 10px Inter'
    ctx.textBaseline = 'middle'
    for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
      const x = t * pps - scrollX
      ctx.fillRect(x, RULER - 7, 1, 7)
      ctx.fillText(formatTime(t), x + 4, RULER / 2 - 1)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, RULER - 1, viewW, 1)
  }, [project.waveform, sorted.map((t) => t.start + t.deck).join(), viewW, scrollX, pps, time, dur, theme])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = time * pps
    if (x < el.scrollLeft || x > el.scrollLeft + viewW - 40) el.scrollLeft = Math.max(0, x - viewW * 0.25)
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
    const mix0 = what === 'mixin' ? appearTime(sorted, idx, project.settings) : tr.mixIn
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
    if (!(e.ctrlKey || e.metaKey)) return
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    const cursorT = (e.clientX - rect.left + el.scrollLeft) / pps
    const nz = Math.max(1, Math.min(400, zoom * Math.exp(-e.deltaY * 0.002)))
    setZoom(nz)
    requestAnimationFrame(() => (el.scrollLeft = cursorT * fitPps * nz - (e.clientX - rect.left)))
  }

  return (
    <div className="timeline">
      <div className="timeline-head">
        <div className="lane-labels" style={{ height: TIMELINE_HEIGHT }}>
          <span style={{ top: RULER + WAVE_H / 2 - 8 }}>SET</span>
          <span style={{ top: LANE_A + LANE_H / 2 - 8, color: theme.accent }}>A</span>
          <span style={{ top: LANE_B + LANE_H / 2 - 8, color: theme.accentB }}>B</span>
        </div>
      </div>
      <div
        className="timeline-scroll"
        ref={scrollRef}
        onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
        onWheel={onWheel}
        style={{ height: TIMELINE_HEIGHT + 12 }}
      >
        <div className="timeline-inner" style={{ width: innerW, height: TIMELINE_HEIGHT }}>
          <canvas ref={canvasRef} className="timeline-canvas" style={{ width: viewW, height: RULER + WAVE_H }} onPointerDown={startScrub} />
          <div className="lane-bg" style={{ top: LANE_A, height: LANE_H }} onPointerDown={startScrub} />
          <div className="lane-bg" style={{ top: LANE_B, height: LANE_H }} onPointerDown={startScrub} />
          {sorted.map((tr, i) => {
            const start = i === 0 ? Math.min(tr.start, 0) : tr.start
            const end = i + 1 < sorted.length ? sorted[i + 1].start : dur
            const appear = appearTime(sorted, i, project.settings)
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
                  className={`track-block ${selectedId === tr.id ? 'selected' : ''} ${tr.unverified ? 'unverified' : ''}`}
                  style={{ left, width, top, height: LANE_H, ['--c' as string]: color }}
                  onPointerDown={(e) => startDrag(e, tr, 'move')}
                  onDoubleClick={() => onSeek(tr.start)}
                  title={`${tr.artist} – ${tr.title}\nDrag to move · double-click to jump here`}
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
          <div className="playhead" style={{ left: time * pps, height: TIMELINE_HEIGHT }} />
        </div>
      </div>
      <div className="timeline-zoom">
        <button className="icon-btn" title="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.6))}>
          −
        </button>
        <input type="range" min={0} max={6} step={0.01} value={Math.log(zoom)} onChange={(e) => setZoom(Math.exp(+e.target.value))} />
        <button className="icon-btn" title="Zoom in" onClick={() => setZoom((z) => Math.min(400, z * 1.6))}>
          +
        </button>
        <button className="btn tiny ghost" onClick={() => setZoom(1)}>
          Fit
        </button>
      </div>
    </div>
  )
}
