import { useEffect, useMemo, useRef, useState } from 'react'
import { nudgeClip, resizeClip, type ClipKind, type ClipSuggestion } from '@shared/clips'
import { formatTime } from '@shared/layout'
import { drawFrame, prepareScene, type ArtAsset, type Ctx } from '@shared/scene'
import type { Project } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { i18n, tMsg } from '../i18n'
import { platform } from '../platform'
import { webCodecsAvailable } from '../export/runExport'
import { exportQueue, useExportJobs } from '../export/queue'
import { loadArtMap, offscreenFactory } from '../sceneAssets'
import { Icon } from './icons'
import { beforeExport, claimExport, settleExport } from '../account/account'

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

const THUMB_SHORT = 180
/** Lengths offered on each card, seconds. */
const LENGTHS = [15, 30, 60]

/**
 * The project as a clip renders it: 9:16 at the project's resolution, or 16:9 as the project is
 * set up.
 */
export function clipProject(project: Project, format: ClipFormat): Project {
  const s = project.settings
  const short = Math.min(s.width, s.height)
  const long = Math.max(s.width, s.height)
  return format === 'portrait'
    ? { ...project, settings: { ...s, width: short, height: long } }
    : { ...project, settings: { ...s, width: long, height: short } }
}

/** A clip's title in the UI language; untitled tracks get the "Untitled" word. */
export function clipTitle(c: ClipSuggestion): string {
  const untitled = i18n.t('common.untitled')
  const values = Object.fromEntries(Object.entries(c.title.values ?? {}).map(([k, v]) => [k, v === '' ? untitled : v]))
  return tMsg('clipText', { key: c.title.key, values })
}

/** Suggested clips of the set: the best transitions, drops and peaks, ready to play or export. */
export function ClipsPanel({ project, clips, playingId, onPlay, onTrim, format, onFormat }: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ClipKind | 'all'>('all')
  const [order, setOrder] = useState<'best' | 'time'>('best')
  const [art, setArt] = useState<Map<string, ArtAsset>>(new Map())
  const [fontsReady, setFontsReady] = useState(false)
  // The latest export of each clip (they run in the background, see ExportJobs).
  const allJobs = useExportJobs()
  const jobs = useMemo(() => Object.fromEntries(allJobs.filter((j) => j.clipId).map((j) => [j.clipId!, j])), [allJobs])

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true))
  }, [])
  const artKey = project.tracks.map((t) => `${t.id}:${t.artwork ?? ''}`).join('|')
  useEffect(() => {
    let alive = true
    loadArtMap(project, platform.mediaUrl).then((m) => alive && setArt(m))
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
  const hours = project.duration >= 3600

  const exportClip = (c: ClipSuggestion) => exportClipVideo(project, c, format)

  if (!project.tracks.length)
    return (
      <div className="clips-empty">
        <Icon name="cue" size={22} />
        <div>{t('clips.empty')}</div>
      </div>
    )

  return (
    <div className="clips-panel">
      <div className="clips-toolbar">
        <div className="seg">
          {(['all', 'transition', 'drop', 'peak'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? `${t('clips.all')} ${clips.length}` : `${t(`clips.kindPlural.${k}`)} ${clips.filter((c) => c.kind === k).length}`}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={order === 'best' ? 'on' : ''} onClick={() => setOrder('best')}>
            {t('clips.bestFirst')}
          </button>
          <button className={order === 'time' ? 'on' : ''} onClick={() => setOrder('time')}>
            {t('clips.inSetOrder')}
          </button>
        </div>
        <div className="grow" />
        <div className="seg" title={t('clips.formatTitle')}>
          <button className={format === 'portrait' ? 'on' : ''} onClick={() => onFormat('portrait')}>
            9:16
          </button>
          <button className={format === 'landscape' ? 'on' : ''} onClick={() => onFormat('landscape')}>
            16:9
          </button>
        </div>
      </div>
      <div className={`clips-grid ${format}`}>
        {shown.map((c) => {
          const job = jobs[c.id]
          const busy = job?.status === 'running' || job?.status === 'queued'
          const st = job?.status === 'done' ? 'done' : job?.progress?.stage
          const pct = job?.progress ? Math.min(100, (job.progress.frame / Math.max(1, job.progress.totalFrames)) * 100) : 0
          return (
            <div key={c.id} className={`clips-card ${playingId === c.id ? 'on' : ''}`}>
              <Thumb prep={prep} t={c.focus + 1.5} w={thumbProject.settings.width} h={thumbProject.settings.height} onClick={() => onPlay(c)} />
              <div className="clips-info">
                <div className="clips-tags">
                  <span className={`clips-kind ${c.kind}`}>{t(`clips.kind.${c.kind}`)}</span>
                  {c.id === best && <span className="clips-best">{t('clips.best')}</span>}
                  <span className="grow" />
                  <span className="clips-score" title={t('clips.scoreTitle')}>
                    {Math.round(c.score * 100)}
                  </span>
                </div>
                <div className="clips-title" title={clipTitle(c)}>
                  {clipTitle(c)}
                </div>
                <Trim clip={c} duration={project.duration} hours={hours} disabled={busy} onTrim={(r) => onTrim(c.id, r)} />
                <div className="clips-reason">{tMsg('clipReason', c.reason)}</div>
                {job?.status === 'running' || job?.status === 'done' ? (
                  <div className="bar">
                    <div style={{ width: `${st === 'done' ? 100 : pct}%` }} />
                  </div>
                ) : null}
                {job?.error && <div className="error small">{job.error}</div>}
                <div className="clips-actions">
                  <button className="btn small" onClick={() => onPlay(c)}>
                    <Icon name="play" size={12} /> {playingId === c.id ? t('clips.looping') : t('common.play')}
                  </button>
                  {busy ? (
                    <button className="btn small" onClick={() => exportQueue.cancel(job!.id)}>
                      {t('common.cancel')}
                    </button>
                  ) : (
                    <button className="btn small" onClick={() => exportClip(c)} disabled={!webCodecsAvailable()}>
                      <Icon name="export" size={12} /> {t('common.export')}
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

/** Asks where to save a clip's video, then adds it to the exports (once the account allows it). */
export async function exportClipVideo(project: Project, c: ClipSuggestion, format: ClipFormat) {
  const hours = project.duration >= 3600
  const base = (project.settings.setTitle || project.audioName.replace(/\.[^.]+$/, '')) + ` - ${clipTitle(c)} ${formatTime(c.from, hours).replace(/:/g, '.')}`
  const name = base.replace(/[\\/:*?"<>|]+/g, '-')
  if (!(await beforeExport())) return
  const out = await platform.chooseVideoPath(name + '.mp4')
  if (!out) return
  const claim = await claimExport('clip')
  if (claim) exportQueue.add({ label: name, clipId: c.id, project: clipProject(project, format), out, range: { from: c.from, to: c.to }, ticket: claim.ticket, onEnd: (ok) => settleExport(claim.id, ok) })
}

/**
 * Start and end of a clip with buttons to move each one (1 s, or 5 s with Shift), and quick
 * lengths that keep the key moment where it is.
 */
function Trim({ clip: c, duration, hours, disabled, onTrim }: { clip: Clip; duration: number; hours: boolean; disabled: boolean; onTrim: (r: { from: number; to: number } | null) => void }) {
  const { t } = useTranslation()
  const len = c.to - c.from
  const step = (e: React.MouseEvent) => (e.shiftKey ? 5 : 1)
  const nudge = (edge: 'from' | 'to', dir: 1 | -1) => (e: React.MouseEvent) => onTrim(nudgeClip(c, edge, dir * step(e), duration))
  return (
    <div className="clips-trim">
      <div className="clips-range">
        <span className="clips-edge">
          <button className="trim-btn" title={t('clips.startEarlier')} onClick={nudge('from', -1)} disabled={disabled}>
            ‹
          </button>
          <span className="mono">{formatTime(c.from, hours)}</span>
          <button className="trim-btn" title={t('clips.startLater')} onClick={nudge('from', 1)} disabled={disabled}>
            ›
          </button>
        </span>
        <span className="clips-len mono">{t('common.seconds', { n: Math.round(len) })}</span>
        <span className="clips-edge">
          <button className="trim-btn" title={t('clips.endEarlier')} onClick={nudge('to', -1)} disabled={disabled}>
            ‹
          </button>
          <span className="mono">{formatTime(c.to, hours)}</span>
          <button className="trim-btn" title={t('clips.endLater')} onClick={nudge('to', 1)} disabled={disabled}>
            ›
          </button>
        </span>
      </div>
      <div className="clips-lengths">
        {LENGTHS.map((l) => (
          <button key={l} className={Math.abs(len - l) < 0.5 ? 'on' : ''} onClick={() => onTrim(resizeClip(c, l, duration))} disabled={disabled} title={t('clips.makeLength', { n: l })}>
            {t('common.seconds', { n: l })}
          </button>
        ))}
        {c.edited && (
          <button className="reset" onClick={() => onTrim(null)} disabled={disabled} title={t('clips.resetTitle')}>
            {t('common.reset')}
          </button>
        )}
      </div>
    </div>
  )
}

/** A still of the clip drawn with the video's own scene code. */
function Thumb({ prep, t, w, h, onClick }: { prep: ReturnType<typeof prepareScene>; t: number; w: number; h: number; onClick: () => void }) {
  const { t: tr } = useTranslation()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d') as Ctx | null
    if (ctx) drawFrame(ctx, prep, t)
  }, [prep, t])
  return (
    <button className="clips-thumb" onClick={onClick} title={tr('clips.playInProgram')}>
      <canvas ref={ref} width={w} height={h} />
    </button>
  )
}
