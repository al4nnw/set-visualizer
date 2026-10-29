import { nudgeClip, type ClipSuggestion } from '@shared/clips'
import { formatTime, formatTimecode } from '@shared/layout'
import type { Project, RecentProject } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { i18n, lang } from '../i18n'
import { Icon } from './icons'
import { ClipsPanel, clipProject, clipTitle, type ClipFormat } from './Clips'
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
          <Preview project={shown!} audio={p.audio} time={time} />
        )}
      </div>
      <div className="transport">
        <div className="timecode current">{formatTimecode(time, fps)}</div>
        {loop && (
          <div className="loop-chip" title={clipTitle(loop)}>
            <span>{t('viewer.looping', { from: formatTime(loop.from, hours), to: formatTime(loop.to, hours), title: clipTitle(loop) })}</span>
            <button className="btn tiny ghost" title={t('viewer.startHereTitle')} onClick={() => p.onTrimClip(loop.id, nudgeClip(loop, 'from', time - loop.from, project?.duration ?? 0))}>
              {t('viewer.startHere')}
            </button>
            <button className="btn tiny ghost" title={t('viewer.endHereTitle')} onClick={() => p.onTrimClip(loop.id, nudgeClip(loop, 'to', time - loop.to, project?.duration ?? 0))}>
              {t('viewer.endHere')}
            </button>
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
        <div className="timecode total">{formatTimecode(project?.duration ?? 0, fps)}</div>
      </div>
    </section>
  )
}
