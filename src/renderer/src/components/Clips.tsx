import { useEffect, useMemo, useRef, useState } from 'react'
import { nudgeClip, resizeClip, type ClipKind, type ClipSuggestion } from '@shared/clips'
import { formatTime } from '@shared/layout'
import { drawFrame, prepareScene, type ArtAsset, type Ctx } from '@shared/scene'
import type { ExportProgress, Project } from '@shared/types'
import { api } from '../api'
import { runExport, webCodecsAvailable } from '../export/runExport'
import { loadArtMap, offscreenFactory } from '../sceneAssets'
import { Icon } from './icons'

export type ClipFormat = 'portrait' | 'landscape'

type Clip = ClipSuggestion & { edited?: boolean }

interface Props {
  project: Project
  clips: Clip[]
  /** The clip looping in Program, if any. */
  playingId: string | null
  onPlay: (clip: ClipSuggestion) => void
  /** New start and end for a clip, or null to go back to the suggested ones. */
  onTrim: (id: string, range: { from: number; to: number } | null) => void
  format: ClipFormat
  onFormat: (f: ClipFormat) => void
}

const KIND_LABEL: Record<ClipKind, string> = { transition: 'Transition', drop: 'Drop', peak: 'Peak' }
const THUMB_SHORT = 180
/** Lengths offered on each card, seconds. */
const LENGTHS = [15, 30, 60]

/**
 * The project as a clip renders it: 9:16 at the project's resolution with only the close-up
 * waveform (the full-set one means little in 15 s), or 16:9 as the project is set up.
 */
export function clipProject(project: Project, format: ClipFormat): Project {
  const s = project.settings
  const short = Math.min(s.width, s.height)
  const long = Math.max(s.width, s.height)
  return format === 'portrait'
    ? { ...project, settings: { ...s, width: short, height: long, showSetWave: false } }
    : { ...project, settings: { ...s, width: long, height: short } }
}

/** Suggested clips of the set: the best transitions, drops and peaks, ready to play or export. */
export function ClipsPanel({ project, clips, playingId, onPlay, onTrim, format, onFormat }: Props) {
  const [kind, setKind] = useState<ClipKind | 'all'>('all')
  const [order, setOrder] = useState<'best' | 'time'>('best')
  const [art, setArt] = useState<Map<string, ArtAsset>>(new Map())
  const [fontsReady, setFontsReady] = useState(false)
  const [jobs, setJobs] = useState<Record<string, { progress?: ExportProgress; error?: string }>>({})
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true))
  }, [])
  const artKey = project.tracks.map((t) => `${t.id}:${t.artwork ?? ''}`).join('|')
  useEffect(() => {
    let alive = true
    loadArtMap(project).then((m) => alive && setArt(m))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artKey])

  // One scene at thumbnail size, shared by every card.
  const thumbProject = useMemo(() => {
    const p = clipProject(project, format)
    const k = THUMB_SHORT / Math.min(p.settings.width, p.settings.height)
    return { ...p, settings: { ...p.settings, width: Math.round(p.settings.width * k), height: Math.round(p.settings.height * k) } }
  }, [project, format])
  const prep = useMemo(
    () => prepareScene(thumbProject, art, offscreenFactory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbProject, art, fontsReady]
  )

  const shown = useMemo(() => {
    const list = clips.filter((c) => kind === 'all' || c.kind === kind)
    return order === 'time' ? [...list].sort((a, b) => a.from - b.from) : list
  }, [clips, kind, order])
  const best = clips[0]?.id
  const running = Object.values(jobs).some((j) => j.progress && ['preparing', 'rendering', 'finishing'].includes(j.progress.stage))
  const hours = project.duration >= 3600

  const exportClip = async (c: ClipSuggestion) => {
    const base = (project.settings.setTitle || project.audioName.replace(/\.[^.]+$/, '')) + ` - ${c.title} ${formatTime(c.from, hours).replace(/:/g, '.')}`
    const out = await api.chooseVideoPath(base.replace(/[\\/:*?"<>|]+/g, '-') + '.mp4')
    if (!out) return
    abort.current = new AbortController()
    const set = (v: { progress?: ExportProgress; error?: string }) => setJobs((j) => ({ ...j, [c.id]: v }))
    try {
      await runExport(clipProject(project, format), out, (progress) => set({ progress }), abort.current.signal, { from: c.from, to: c.to })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  }

  if (!project.tracks.length)
    return (
      <div className="clips-empty">
        <Icon name="cue" size={22} />
        <div>Import the Rekordbox .cue and the clips of the best moments of the set show up here.</div>
      </div>
    )

  return (
    <div className="clips-panel">
      <div className="clips-toolbar">
        <div className="seg">
          {(['all', 'transition', 'drop', 'peak'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? `All ${clips.length}` : `${KIND_LABEL[k]}s ${clips.filter((c) => c.kind === k).length}`}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={order === 'best' ? 'on' : ''} onClick={() => setOrder('best')}>
            Best first
          </button>
          <button className={order === 'time' ? 'on' : ''} onClick={() => setOrder('time')}>
            In set order
          </button>
        </div>
        <div className="grow" />
        <div className="seg" title="Format the clips play and export in">
          <button className={format === 'portrait' ? 'on' : ''} onClick={() => onFormat('portrait')} disabled={running}>
            9:16
          </button>
          <button className={format === 'landscape' ? 'on' : ''} onClick={() => onFormat('landscape')} disabled={running}>
            16:9
          </button>
        </div>
      </div>
      <div className={`clips-grid ${format}`}>
        {shown.map((c) => {
          const job = jobs[c.id]
          const st = job?.progress?.stage
          const busy = st === 'preparing' || st === 'rendering' || st === 'finishing'
          const pct = job?.progress ? Math.min(100, (job.progress.frame / Math.max(1, job.progress.totalFrames)) * 100) : 0
          return (
            <div key={c.id} className={`clips-card ${playingId === c.id ? 'on' : ''}`}>
              <Thumb prep={prep} t={c.focus + 1.5} w={thumbProject.settings.width} h={thumbProject.settings.height} onClick={() => onPlay(c)} />
              <div className="clips-info">
                <div className="clips-tags">
                  <span className={`clips-kind ${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                  {c.id === best && <span className="clips-best">Best</span>}
                  <span className="grow" />
                  <span className="clips-score" title="How well it should work as a clip">
                    {Math.round(c.score * 100)}
                  </span>
                </div>
                <div className="clips-title" title={c.title}>
                  {c.title}
                </div>
                <Trim clip={c} duration={project.duration} hours={hours} disabled={busy} onTrim={(r) => onTrim(c.id, r)} />
                <div className="clips-reason">{c.reason}</div>
                {busy || st === 'done' ? (
                  <div className="bar">
                    <div style={{ width: `${st === 'done' ? 100 : pct}%` }} />
                  </div>
                ) : null}
                {job?.error && <div className="error small">{job.error}</div>}
                <div className="clips-actions">
                  <button className="btn small" onClick={() => onPlay(c)}>
                    <Icon name="play" size={12} /> {playingId === c.id ? 'Looping' : 'Play'}
                  </button>
                  {busy ? (
                    <button className="btn small" onClick={() => abort.current?.abort()}>
                      Cancel
                    </button>
                  ) : st === 'done' && job?.progress?.outputPath ? (
                    <button className="btn small" onClick={() => api.reveal(job.progress!.outputPath!)}>
                      Show file
                    </button>
                  ) : (
                    <button className="btn small" onClick={() => exportClip(c)} disabled={running || !webCodecsAvailable()}>
                      <Icon name="export" size={12} /> Export
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Start and end of a clip with buttons to move each one (1 s, or 5 s with Shift), and quick
 * lengths that keep the key moment where it is.
 */
function Trim({ clip: c, duration, hours, disabled, onTrim }: { clip: Clip; duration: number; hours: boolean; disabled: boolean; onTrim: (r: { from: number; to: number } | null) => void }) {
  const len = c.to - c.from
  const step = (e: React.MouseEvent) => (e.shiftKey ? 5 : 1)
  const nudge = (edge: 'from' | 'to', dir: 1 | -1) => (e: React.MouseEvent) => onTrim(nudgeClip(c, edge, dir * step(e), duration))
  return (
    <div className="clips-trim">
      <div className="clips-range">
        <span className="clips-edge">
          <button className="trim-btn" title="Start earlier (Shift: 5 s)" onClick={nudge('from', -1)} disabled={disabled}>
            ‹
          </button>
          <span className="mono">{formatTime(c.from, hours)}</span>
          <button className="trim-btn" title="Start later (Shift: 5 s)" onClick={nudge('from', 1)} disabled={disabled}>
            ›
          </button>
        </span>
        <span className="clips-len mono">{Math.round(len)} s</span>
        <span className="clips-edge">
          <button className="trim-btn" title="End earlier (Shift: 5 s)" onClick={nudge('to', -1)} disabled={disabled}>
            ‹
          </button>
          <span className="mono">{formatTime(c.to, hours)}</span>
          <button className="trim-btn" title="End later (Shift: 5 s)" onClick={nudge('to', 1)} disabled={disabled}>
            ›
          </button>
        </span>
      </div>
      <div className="clips-lengths">
        {LENGTHS.map((l) => (
          <button key={l} className={Math.abs(len - l) < 0.5 ? 'on' : ''} onClick={() => onTrim(resizeClip(c, l, duration))} disabled={disabled} title={`Make it ${l} s around the key moment`}>
            {l} s
          </button>
        ))}
        {c.edited && (
          <button className="reset" onClick={() => onTrim(null)} disabled={disabled} title="Back to the suggested start and end">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

/** A still of the clip drawn with the video's own scene code. */
function Thumb({ prep, t, w, h, onClick }: { prep: ReturnType<typeof prepareScene>; t: number; w: number; h: number; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d') as Ctx | null
    if (ctx) drawFrame(ctx, prep, t)
  }, [prep, t])
  return (
    <button className="clips-thumb" onClick={onClick} title="Play this clip in Program">
      <canvas ref={ref} width={w} height={h} />
    </button>
  )
}
