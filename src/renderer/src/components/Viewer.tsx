import { useState } from 'react'
import { nudgeClip, type ClipSuggestion } from '@shared/clips'
import { formatTime, formatTimecode } from '@shared/layout'
import type { Project, RecentProject } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { i18n, lang } from '../i18n'
import { Icon } from './icons'
import { ClipsPanel, clipProject, clipTitle, exportClipVideo, type ClipFormat } from './Clips'
import { useExportJobs } from '../export/queue'
import { webCodecsAvailable } from '../export/runExport'
import { Preview } from './Preview'
import { shortcutLabel } from './MenuBar'

interface Props {
  project: Project | null
  audio: HTMLAudioElement | null
  time: number
  playing: boolean
  busy: { label: string; progress: number } | null
  error: string | null
  recent: RecentProject[]
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onJumpTrack: (dir: 1 | -1) => void
  /** Opens one picker for a set recording (with or without its .cue) or a project. */
  onOpenAny: () => void
  onOpenProject: (path: string) => void
  /** With the error: the recording to pick again before the project can open (the web version). */
  locate?: { fileName: string; run: () => void } | null
  /** Stops the analysis shown in the busy panel. */
  onCancelBusy: () => void
  /** Files are being dragged over the window. */
  dragOver: boolean
  clips: ClipSuggestion[]
  /** The clip looping in Program; Program shows it in the clip format. */
  loop: ClipSuggestion | null
  onPlayClip: (clip: ClipSuggestion) => void
  onStopLoop: () => void
  /** New start and end for a clip, or null to go back to the suggested ones. */
  onTrimClip: (id: string, range: { from: number; to: number } | null) => void
  tab: ViewerTab
  onTab: (tab: ViewerTab) => void
  /** Show the one-time note that points at the Clips tab. */
  clipsHint: boolean
  onDismissClipsHint: () => void
  clipFormat: ClipFormat
  onClipFormat: (f: ClipFormat) => void
  /** Preview loudness, 0 to 1. */
  volume: number
  muted: boolean
  onVolume: (v: number) => void
  onMuted: (m: boolean) => void
  /** The one-time note that the volume does not change exports is still to be shown. */
  volumeHint: boolean
  onDismissVolumeHint: () => void
}

export type ViewerTab = 'program' | 'clips'

function ago(iso?: string) {
  if (!iso) return ''
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 90) return i18n.t('viewer.justNow')
  if (d < 3600) return i18n.t('viewer.minAgo', { n: Math.round(d / 60) })
  if (d < 86400) return i18n.t('viewer.hAgo', { n: Math.round(d / 3600) })
  return new Date(iso).toLocaleDateString(lang())
}

/** Start panel shown in the viewer before a set is loaded. */
function StartPanel({ busy, error, locate, recent, onOpenAny, onOpenProject, onCancelBusy }: Pick<Props, 'busy' | 'error' | 'locate' | 'recent' | 'onOpenAny' | 'onOpenProject' | 'onCancelBusy'>) {
  const { t } = useTranslation()
  if (busy)
    return (
      <div className="start-panel">
        <div className="start-busy">
          <div className="spinner" />
          <div>{busy.label}</div>
          <div className="bar">
            <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
          <div className="muted small">{t('viewer.busyNote')}</div>
          <button className="btn small" onClick={onCancelBusy}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  return (
    <div className="start-panel">
      <Icon name="music" size={22} />
      <div className="start-title">{t('viewer.dropTitle')}</div>
      <div className="start-sub">{t('viewer.dropSub')}</div>
      <button className="btn primary" onClick={onOpenAny}>
        {t('viewer.importOrOpen')}
      </button>
      {error && <div className="error">{error}</div>}
      {error && locate && (
        <button className="btn" onClick={locate.run}>
          {t('web.locate', { name: locate.fileName })}
        </button>
      )}
      {recent.length > 0 && (
        <div className="start-recent">
          <div className="start-recent-head">{t('viewer.recent')}</div>
          {recent.slice(0, 6).map((r) => (
            <button key={r.path} className="recent-row" onClick={() => onOpenProject(r.path)} title={r.path}>
              <Icon name="file" />
              <span className="recent-name">{r.name}</span>
              <span className="recent-meta">{r.tracks ? t('common.tracks', { count: r.tracks }) : r.audioName}</span>
              <span className="recent-meta">{ago(r.savedAt)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="start-keys">
        {t('viewer.startKeys', { open: shortcutLabel('Mod+O'), settings: shortcutLabel('Mod+,') })}
      </div>
    </div>
  )
}

/**
 * Program monitor (the live render of the video) and the Clips tab with suggested clips of the set,
 * with transport controls under both.
 */
export function Viewer(p: Props) {
  const { t } = useTranslation()
  const { project, time, loop, tab, onTab: setTab } = p
  const fps = project?.settings.fps ?? 30
  const shown = project && loop ? clipProject(project, p.clipFormat) : project
  const hours = (project?.duration ?? 0) >= 3600
  return (
    <section className="panel viewer">
      <div className="panel-tabs">
        <button className={`panel-tab ${tab === 'program' ? 'on' : ''}`} onClick={() => setTab('program')}>
          {t('viewer.program')}
        </button>
        <button className={`panel-tab ${tab === 'clips' ? 'on' : ''}`} onClick={() => setTab('clips')} disabled={!project}>
          {t('viewer.clips')}
          {project && p.clips.length ? <span className="tab-count">{p.clips.length}</span> : null}
        </button>
        {p.clipsHint && project && tab !== 'clips' && (
          <div className="clips-hint" role="status">
            <div className="clips-hint-title">{t('viewer.hintTitle')}</div>
            <div className="clips-hint-text">{t('viewer.hintText', { count: p.clips.length })}</div>
            <div className="row">
              <button className="btn tiny ghost" onClick={p.onDismissClipsHint}>
                {t('viewer.gotIt')}
              </button>
              <div className="grow" />
              <button
                className="btn tiny primary"
                onClick={() => {
                  setTab('clips')
                  p.onDismissClipsHint()
                }}
              >
                {t('viewer.showClips')}
              </button>
            </div>
          </div>
        )}
        <div className="grow" />
        {shown && (
          <span className="panel-meta">
            {shown.settings.width}×{shown.settings.height} · {shown.settings.fps} fps
          </span>
        )}
      </div>
      <div className={`viewer-body ${p.dragOver ? 'drop-target' : ''}`}>
        {!project || p.busy ? (
          <StartPanel {...p} />
        ) : tab === 'clips' ? (
          <ClipsPanel
            project={project}
            clips={p.clips}
            playingId={loop?.id ?? null}
            onPlay={(c) => {
              p.onPlayClip(c)
              setTab('program')
            }}
            onTrim={p.onTrimClip}
            format={p.clipFormat}
            onFormat={p.onClipFormat}
          />
        ) : (
          <Preview project={shown!} audio={p.audio} time={time} range={loop ? { from: loop.from, to: loop.to } : undefined} />
        )}
        {loop && project && !p.busy && tab === 'program' && <LoopEdit clip={loop} time={time} duration={project.duration} hours={hours} onTrim={(r) => p.onTrimClip(loop.id, r)} onExport={() => exportClipVideo(project, loop, p.clipFormat)} />}
      </div>
      <div className="transport">
        <div className="timecode current">{formatTimecode(time, fps)}</div>
        {loop && (
          <div className="loop-chip" title={clipTitle(loop)}>
            <span>{t('viewer.looping', { from: formatTime(loop.from, hours), to: formatTime(loop.to, hours), title: clipTitle(loop) })}</span>
            <button className="icon-btn small" title={t('viewer.stopLoop')} onClick={p.onStopLoop}>
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
        <div className="grow" />
        <div className="transport-btns">
          <button className="tbtn" title={t('viewer.goToStart')} disabled={!project} onClick={() => p.onSeek(0)}>
            <Icon name="start" />
          </button>
          <button className="tbtn" title={t('viewer.previousTrack')} disabled={!project} onClick={() => p.onJumpTrack(-1)}>
            <Icon name="prev" />
          </button>
          <button className="tbtn play" title={t('viewer.playPause')} disabled={!project} onClick={p.onTogglePlay}>
            <Icon name={p.playing ? 'pause' : 'play'} />
          </button>
          <button className="tbtn" title={t('viewer.nextTrack')} disabled={!project} onClick={() => p.onJumpTrack(1)}>
            <Icon name="next" />
          </button>
          <button className="tbtn" title={t('viewer.goToEnd')} disabled={!project} onClick={() => project && p.onSeek(project.duration)}>
            <Icon name="end" />
          </button>
        </div>
        <div className="grow" />
        <VolumeControl {...p} disabled={!project} />
        <div className="timecode total">{formatTimecode(project?.duration ?? 0, fps)}</div>
      </div>
    </section>
  )
}

/**
 * Mute button and slider for the preview. The first time it is touched, a note says that it only
 * changes what is heard here, not the exported videos.
 */
function VolumeControl(p: Pick<Props, 'volume' | 'muted' | 'onVolume' | 'onMuted' | 'volumeHint' | 'onDismissVolumeHint'> & { disabled: boolean }) {
  const { t } = useTranslation()
  const [hintOpen, setHintOpen] = useState(false)
  const touched = () => {
    if (p.volumeHint && !p.disabled) setHintOpen(true)
  }
  const level = p.muted ? 0 : p.volume
  return (
    <div className="volume" onPointerDown={touched} onKeyDown={touched}>
      <button className="tbtn" title={p.muted ? t('viewer.unmute') : t('viewer.mute')} aria-pressed={p.muted} disabled={p.disabled} onClick={() => p.onMuted(!p.muted)}>
        <Icon name={level === 0 ? 'speakerOff' : level < 0.5 ? 'speakerLow' : 'speaker'} />
      </button>
      <input
        type="range"
        className="volume-slider"
        min={0}
        max={1}
        step={0.01}
        value={level}
        disabled={p.disabled}
        title={`${t('viewer.volume')} · ${Math.round(level * 100)}%`}
        aria-label={t('viewer.volume')}
        style={{ '--fill': `${level * 100}%` } as React.CSSProperties}
        onChange={(e) => p.onVolume(+e.currentTarget.value)}
        // Hand the keys back to the editor (Space, timing keys) after a drag.
        onPointerUp={(e) => e.currentTarget.blur()}
      />
      {hintOpen && p.volumeHint && (
        <div className="volume-hint" role="status">
          <div className="clips-hint-title">{t('viewer.volumeHintTitle')}</div>
          <div className="clips-hint-text">{t('viewer.volumeHintText')}</div>
          <div className="row">
            <div className="grow" />
            <button
              className="btn tiny primary"
              onClick={() => {
                setHintOpen(false)
                p.onDismissVolumeHint()
              }}
            >
              {t('viewer.gotIt')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Floats at the right of the looping clip: moves its start or end to the playhead, or a second
 * either way (5 s with Shift), and exports it.
 */
function LoopEdit(p: { clip: ClipSuggestion; time: number; duration: number; hours: boolean; onTrim: (r: { from: number; to: number }) => void; onExport: () => void }) {
  const { clip, time, duration, hours, onTrim } = p
  const { t } = useTranslation()
  const job = useExportJobs().find((j) => j.clipId === clip.id && (j.status === 'queued' || j.status === 'running'))
  const pct = job?.progress ? Math.round(Math.min(100, (job.progress.frame / Math.max(1, job.progress.totalFrames)) * 100)) : 0
  const step = (e: React.MouseEvent) => (e.shiftKey ? 5 : 1)
  const edge = (side: 'from' | 'to') => (
    <div className="loop-edit-edge">
      <div className="loop-edit-label">
        {t(side === 'from' ? 'viewer.clipStart' : 'viewer.clipEnd')} <span className="mono">{formatTime(clip[side], hours)}</span>
      </div>
      <div className="loop-edit-row">
        <button className="loop-edit-btn" title={t(side === 'from' ? 'clips.startEarlier' : 'clips.endEarlier')} onClick={(e) => onTrim(nudgeClip(clip, side, -step(e), duration))}>
          ‹
        </button>
        <button
          className="loop-edit-btn here"
          title={t(side === 'from' ? 'viewer.startHereTitle' : 'viewer.endHereTitle')}
          onClick={() => onTrim(nudgeClip(clip, side, time - clip[side], duration))}
        >
          {t(side === 'from' ? 'viewer.startHere' : 'viewer.endHere')}
        </button>
        <button className="loop-edit-btn" title={t(side === 'from' ? 'clips.startLater' : 'clips.endLater')} onClick={(e) => onTrim(nudgeClip(clip, side, step(e), duration))}>
          ›
        </button>
      </div>
    </div>
  )
  return (
    <div className="loop-edit" role="group" aria-label={t('viewer.clipEdges')}>
      {edge('from')}
      <div className="loop-edit-len mono">{t('common.seconds', { n: Math.round(clip.to - clip.from) })}</div>
      {edge('to')}
      <button className="btn small primary loop-edit-export" onClick={p.onExport} disabled={!!job || !webCodecsAvailable()}>
        <Icon name="export" size={12} /> {job?.status === 'running' ? t('viewer.exportingClip', { pct }) : job ? t('viewer.clipQueued') : t('viewer.exportClip')}
      </button>
    </div>
  )
}
