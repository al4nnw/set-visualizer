import { formatTimecode } from '@shared/layout'
import type { Project, RecentProject } from '@shared/types'
import { Icon } from './icons'
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
  onImportAudio: () => void
  onOpenProject: (path?: string) => void
}

function ago(iso?: string) {
  if (!iso) return ''
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 90) return 'just now'
  if (d < 3600) return `${Math.round(d / 60)} min ago`
  if (d < 86400) return `${Math.round(d / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

/** Start panel shown in the viewer before a set is loaded. */
function StartPanel({ busy, error, recent, onImportAudio, onOpenProject }: Pick<Props, 'busy' | 'error' | 'recent' | 'onImportAudio' | 'onOpenProject'>) {
  if (busy)
    return (
      <div className="start-panel">
        <div className="start-busy">
          <div className="spinner" />
          <div>{busy.label}</div>
          <div className="bar">
            <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        </div>
      </div>
    )
  return (
    <div className="start-panel">
      <div className="start-drop" onClick={onImportAudio}>
        <Icon name="music" size={22} />
        <div className="start-title">Drop a set recording here</div>
        <div className="start-sub">WAV, AIFF, FLAC, MP3 or M4A. Drop the Rekordbox .cue with it to place the tracks.</div>
        <div className="row">
          <button className="btn primary small">Import set recording…</button>
          <button
            className="btn small"
            onClick={(e) => {
              e.stopPropagation()
              onOpenProject()
            }}
          >
            Open project…
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {recent.length > 0 && (
        <div className="start-recent">
          <div className="start-recent-head">Recent projects</div>
          {recent.slice(0, 6).map((r) => (
            <button key={r.path} className="recent-row" onClick={() => onOpenProject(r.path)} title={r.path}>
              <Icon name="file" />
              <span className="recent-name">{r.name}</span>
              <span className="recent-meta">{r.tracks ? `${r.tracks} tracks` : r.audioName}</span>
              <span className="recent-meta">{ago(r.savedAt)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="start-keys">
        {shortcutLabel('Mod+I')} import · {shortcutLabel('Mod+O')} open · {shortcutLabel('Mod+,')} settings
      </div>
    </div>
  )
}

/** Program monitor: the live render of the video with transport controls under it. */
export function Viewer(p: Props) {
  const { project, time } = p
  const fps = project?.settings.fps ?? 30
  return (
    <section className="panel viewer">
      <div className="panel-tabs">
        <div className="panel-tab on">Program</div>
        <div className="grow" />
        {project && (
          <span className="panel-meta">
            {project.settings.width}×{project.settings.height} · {project.settings.fps} fps
          </span>
        )}
      </div>
      <div className="viewer-body">{project && !p.busy ? <Preview project={project} audio={p.audio} time={time} /> : <StartPanel {...p} />}</div>
      <div className="transport">
        <div className="timecode current">{formatTimecode(time, fps)}</div>
        <div className="grow" />
        <div className="transport-btns">
          <button className="tbtn" title="Go to start (Home)" disabled={!project} onClick={() => p.onSeek(0)}>
            <Icon name="start" />
          </button>
          <button className="tbtn" title="Previous track (↑)" disabled={!project} onClick={() => p.onJumpTrack(-1)}>
            <Icon name="prev" />
          </button>
          <button className="tbtn play" title="Play / pause (Space)" disabled={!project} onClick={p.onTogglePlay}>
            <Icon name={p.playing ? 'pause' : 'play'} />
          </button>
          <button className="tbtn" title="Next track (↓)" disabled={!project} onClick={() => p.onJumpTrack(1)}>
            <Icon name="next" />
          </button>
          <button className="tbtn" title="Go to end (End)" disabled={!project} onClick={() => project && p.onSeek(project.duration)}>
            <Icon name="end" />
          </button>
        </div>
        <div className="grow" />
        <div className="timecode total">{formatTimecode(project?.duration ?? 0, fps)}</div>
      </div>
    </section>
  )
}
