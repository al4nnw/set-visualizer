import { useRef, useState } from 'react'
import { formatTime, mainTracks } from '@shared/layout'
import type { ExportProgress, Project, Quality, RenderSettings, Theme } from '@shared/types'
import { api } from '../api'
import { runExport, webCodecsAvailable } from '../export/runExport'

interface Props {
  project: Project
  onClose: () => void
  onChangeSettings: (patch: Partial<RenderSettings>, mergeKey?: string) => void
}

const RESOLUTIONS = [
  { label: '720p', w: 1280, h: 720 },
  { label: '1080p', w: 1920, h: 1080 },
  { label: '1440p', w: 2560, h: 1440 },
  { label: '4K', w: 3840, h: 2160 }
]

/** YouTube turns "0:00 Title" lines in the description into chapters (first must be 0:00). */
export function youtubeChapters(project: Project): string {
  const tracks = mainTracks(project.tracks)
  const hours = project.duration >= 3600
  return tracks
    .map((t, i) => `${formatTime(i === 0 ? 0 : t.start, hours)} ${[t.artist, t.title].filter(Boolean).join(' - ')}`)
    .join('\n')
}

export function ExportDialog({ project, onClose, onChangeSettings }: Props) {
  const s = project.settings
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const running = progress !== null && ['preparing', 'rendering', 'finishing'].includes(progress.stage)
  const chapters = youtubeChapters(project)
  const setTheme = (patch: Partial<Theme>) => onChangeSettings({ theme: { ...s.theme, ...patch } }, 'theme')

  const start = async () => {
    const name = (s.setTitle || project.audioName.replace(/\.[^.]+$/, '')).replace(/[\\/:*?"<>|]+/g, '-') + '.mp4'
    const out = await api.chooseVideoPath(name)
    if (!out) return
    setError(null)
    abortRef.current = new AbortController()
    try {
      await runExport(project, out, setProgress, abortRef.current.signal)
    } catch (e) {
      setError((e as Error).message)
      setProgress(null)
    }
  }

  const pct = progress ? Math.min(100, (progress.frame / Math.max(1, progress.totalFrames)) * 100) : 0

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="modal export-modal">
        <div className="modal-head">
          <h3>Export video</h3>
          <button className="icon-btn" onClick={onClose} disabled={running}>
            ✕
          </button>
        </div>

        <div className="export-grid">
          <div className="col">
            <h4>Video</h4>
            <label>
              Resolution
              <div className="seg">
                {RESOLUTIONS.map((r) => (
                  <button key={r.label} className={s.width === r.w && s.height === r.h ? 'on' : ''} onClick={() => onChangeSettings({ width: r.w, height: r.h })} disabled={running}>
                    {r.label}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Frame rate
              <div className="seg">
                {[24, 30, 60].map((f) => (
                  <button key={f} className={s.fps === f ? 'on' : ''} onClick={() => onChangeSettings({ fps: f })} disabled={running}>
                    {f} fps
                  </button>
                ))}
              </div>
            </label>
            <label>
              Quality
              <div className="seg">
                {(['standard', 'high', 'max'] as Quality[]).map((q) => (
                  <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => onChangeSettings({ quality: q })} disabled={running}>
                    {q[0].toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </label>
            <h4>Text</h4>
            <label>
              DJ name
              <input value={s.djName} onChange={(e) => onChangeSettings({ djName: e.target.value }, 'dj')} placeholder="shown top-left" />
            </label>
            <label>
              Set title
              <input value={s.setTitle} onChange={(e) => onChangeSettings({ setTitle: e.target.value }, 'title')} placeholder="e.g. Live from the studio — October 2026" />
            </label>
            <label className="check">
              <input type="checkbox" checked={s.showTimestamps} onChange={(e) => onChangeSettings({ showTimestamps: e.target.checked })} />
              Show elapsed / total time
            </label>
            <label className="check">
              <input type="checkbox" checked={s.showDeckBadges} onChange={(e) => onChangeSettings({ showDeckBadges: e.target.checked })} />
              Show A / B deck badges
            </label>
          </div>
          <div className="col">
            <h4>Look</h4>
            <div className="row">
              <label className="color">
                Deck A
                <input type="color" value={s.theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} />
              </label>
              <label className="color">
                Deck B
                <input type="color" value={s.theme.accentB} onChange={(e) => setTheme({ accentB: e.target.value })} />
              </label>
              <label className="color">
                Background
                <input type="color" value={s.theme.background} onChange={(e) => setTheme({ background: e.target.value })} />
              </label>
            </div>
            <label>
              Next track appears {s.defaultLead}s before it takes over
              <input type="range" min={0} max={120} step={5} value={s.defaultLead} onChange={(e) => onChangeSettings({ defaultLead: +e.target.value }, 'lead')} />
            </label>
            <label>
              Swap animation: {s.swapDuration.toFixed(1)}s
              <input type="range" min={0.4} max={4} step={0.1} value={s.swapDuration} onChange={(e) => onChangeSettings({ swapDuration: +e.target.value }, 'swap')} />
            </label>
            <h4>YouTube chapters</h4>
            <textarea readOnly value={chapters} rows={6} />
            <button
              className="btn small"
              onClick={() => {
                navigator.clipboard.writeText(chapters)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied ✓' : 'Copy for the video description'}
            </button>
          </div>
        </div>

        {progress && (
          <div className="export-progress">
            <div className="bar big">
              <div style={{ width: `${pct}%` }} />
            </div>
            <div className="row small muted">
              <span>
                {progress.stage === 'preparing' && 'Preparing…'}
                {progress.stage === 'rendering' && `Rendering frame ${progress.frame.toLocaleString()} of ${progress.totalFrames.toLocaleString()} · ${progress.fps.toFixed(0)} fps`}
                {progress.stage === 'finishing' && 'Adding audio…'}
                {progress.stage === 'done' && 'Done!'}
              </span>
              <div className="grow" />
              {progress.stage === 'rendering' && <span>about {formatTime(progress.etaSec)} left</span>}
            </div>
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <div className="modal-foot">
          <span className="muted small">
            {formatTime(project.duration)} · {s.width}×{s.height} · {s.fps} fps · {Math.ceil(project.duration * s.fps).toLocaleString()} frames
          </span>
          <div className="grow" />
          {running ? (
            <button className="btn" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          ) : progress?.stage === 'done' && progress.outputPath ? (
            <button className="btn primary" onClick={() => api.reveal(progress.outputPath!)}>
              Show in folder
            </button>
          ) : (
            <button className="btn primary" onClick={start} disabled={!webCodecsAvailable()}>
              Render video…
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
