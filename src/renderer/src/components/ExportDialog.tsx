import { useRef, useState } from 'react'
import { formatTime, mainTracks } from '@shared/layout'
import type { ExportProgress, Project, Quality, RenderSettings } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { lang } from '../i18n'
import { platform } from '../platform'
import { runExport, webCodecsAvailable } from '../export/runExport'
import { Icon } from './icons'

interface Props {
  project: Project
  onClose: () => void
  onChangeSettings: (patch: Partial<RenderSettings>, mergeKey?: string) => void
}

export const RESOLUTIONS = [
  { label: '720p', w: 1280, h: 720 },
  { label: '1080p', w: 1920, h: 1080 },
  { label: '1440p', w: 2560, h: 1440 },
  { label: '4K', w: 3840, h: 2160 }
]

/** A preset's size in landscape (16:9) or phone (9:16) orientation. */
export const sizeFor = (r: { w: number; h: number }, portrait: boolean) => (portrait ? { width: r.h, height: r.w } : { width: r.w, height: r.h })

/** YouTube turns "0:00 Title" lines in the description into chapters (first must be 0:00). */
export function youtubeChapters(project: Project): string {
  const tracks = mainTracks(project.tracks)
  const hours = project.duration >= 3600
  return tracks
    .map((t, i) => `${formatTime(i === 0 ? 0 : t.start, hours)} ${[t.artist, t.title].filter(Boolean).join(' - ')}`)
    .join('\n')
}

export function ExportDialog({ project, onClose, onChangeSettings }: Props) {
  const { t } = useTranslation()
  const s = project.settings
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const running = progress !== null && ['preparing', 'rendering', 'finishing'].includes(progress.stage)
  const chapters = youtubeChapters(project)

  const start = async () => {
    const name = (s.setTitle || project.audioName.replace(/\.[^.]+$/, '')).replace(/[\\/:*?"<>|]+/g, '-') + '.mp4'
    const out = await platform.chooseVideoPath(name)
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
          <h3>{t('export.title')}</h3>
          <button className="icon-btn" onClick={onClose} disabled={running}>
            <Icon name="close" />
          </button>
        </div>

        <div className="export-grid">
          <div className="col">
            <h4>{t('export.video')}</h4>
            <label>
              {t('export.resolution')}
              <div className="seg">
                {RESOLUTIONS.map((r) => (
                  <button key={r.label} className={Math.min(s.width, s.height) === r.h ? 'on' : ''} onClick={() => onChangeSettings(sizeFor(r, s.height > s.width))} disabled={running}>
                    {r.label}
                  </button>
                ))}
              </div>
            </label>
            <label>
              {t('export.frameRate')}
              <div className="seg">
                {[24, 30, 60].map((f) => (
                  <button key={f} className={s.fps === f ? 'on' : ''} onClick={() => onChangeSettings({ fps: f })} disabled={running}>
                    {t('common.fps', { fps: f })}
                  </button>
                ))}
              </div>
            </label>
            <label>
              {t('export.quality')}
              <div className="seg">
                {(['standard', 'high', 'max'] as Quality[]).map((q) => (
                  <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => onChangeSettings({ quality: q })} disabled={running}>
                    {t(`export.qualities.${q}`)}
                  </button>
                ))}
              </div>
            </label>
            <p className="muted small">
              {s.height > s.width ? t('export.phoneFormat') : '16:9'} · {s.width}×{s.height}. {t('export.formatNote')}
            </p>
          </div>
          <div className="col">
            <h4>{t('export.chapters')}</h4>
            <textarea readOnly value={chapters} rows={12} />
            <button
              className="btn small"
              onClick={() => {
                navigator.clipboard.writeText(chapters)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? t('export.copied') : t('export.copy')}
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
                {progress.stage === 'preparing' && t('export.preparing')}
                {progress.stage === 'rendering' &&
                  t('export.rendering', { frame: progress.frame.toLocaleString(lang()), total: progress.totalFrames.toLocaleString(lang()), fps: progress.fps.toFixed(0) })}
                {progress.stage === 'finishing' && t('export.finishing')}
                {progress.stage === 'done' && t('export.done')}
              </span>
              <div className="grow" />
              {progress.stage === 'rendering' && <span>{t('export.eta', { time: formatTime(progress.etaSec) })}</span>}
            </div>
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <div className="modal-foot">
          <span className="muted small">
            {formatTime(project.duration)} · {s.width}×{s.height} · {t('common.fps', { fps: s.fps })} · {t('export.frames', { count: Math.ceil(project.duration * s.fps).toLocaleString(lang()) })}
          </span>
          <div className="grow" />
          {running ? (
            <button className="btn" onClick={() => abortRef.current?.abort()}>
              {t('common.cancel')}
            </button>
          ) : progress?.stage === 'done' && progress.outputPath && platform.features.reveal ? (
            <button className="btn primary" onClick={() => platform.reveal(progress.outputPath!)}>
              {t('export.showInFolder')}
            </button>
          ) : (
            <button className="btn primary" onClick={start} disabled={!webCodecsAvailable()}>
              {t('export.render')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
