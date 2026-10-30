import { useState } from 'react'
import { formatTime, mainTracks } from '@shared/layout'
import type { Project, Quality, RenderSettings } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { lang } from '../i18n'
import { platform } from '../platform'
import { webCodecsAvailable } from '../export/runExport'
import { exportQueue } from '../export/queue'
import { Icon } from './icons'
import { beforeExport, claimExport, settleExport, useAccount } from '../account/account'
import { usePlanLine } from '../account/AccountDialogs'

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
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const chapters = youtubeChapters(project)
  const account = useAccount()
  const planLine = usePlanLine()

  const start = async () => {
    const name = (s.setTitle || project.audioName.replace(/\.[^.]+$/, '')).replace(/[\\/:*?"<>|]+/g, '-') + '.mp4'
    setError(null)
    try {
      // Exports need an account (the first few are free): see account.ts.
      if (!(await beforeExport())) return
      const out = await platform.chooseVideoPath(name)
      if (!out) return
      const claim = await claimExport('set')
      if (!claim) return
      // It runs in the background (see ExportJobs), with the project as it is now.
      exportQueue.add({ label: name.replace(/\.mp4$/, ''), project, out, onEnd: (ok) => settleExport(claim, ok) })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal export-modal">
        <div className="modal-head">
          <h3>{t('export.title')}</h3>
          <button className="icon-btn" onClick={onClose}>
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
                  <button key={r.label} className={Math.min(s.width, s.height) === r.h ? 'on' : ''} onClick={() => onChangeSettings(sizeFor(r, s.height > s.width))}>
                    {r.label}
                  </button>
                ))}
              </div>
            </label>
            <label>
              {t('export.frameRate')}
              <div className="seg">
                {[24, 30, 60].map((f) => (
                  <button key={f} className={s.fps === f ? 'on' : ''} onClick={() => onChangeSettings({ fps: f })}>
                    {t('common.fps', { fps: f })}
                  </button>
                ))}
              </div>
            </label>
            <label>
              {t('export.quality')}
              <div className="seg">
                {(['standard', 'high', 'max'] as Quality[]).map((q) => (
                  <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => onChangeSettings({ quality: q })}>
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

        {error && <div className="error">{error}</div>}

        <div className="modal-foot">
          <span className="muted small">
            {formatTime(project.duration)} · {s.width}×{s.height} · {t('common.fps', { fps: s.fps })} · {t('export.frames', { count: Math.ceil(project.duration * s.fps).toLocaleString(lang()) })}
          </span>
          <div className="grow" />
          <span className="muted small export-plan">{account.user ? account.entitlement && !account.entitlement.unlimited && planLine(account.entitlement) : account.ready && t('account.exportNeedsSignIn')}</span>
          <button className="btn primary" onClick={start} disabled={!webCodecsAvailable()}>
            {t('export.render')}
          </button>
        </div>
      </div>
    </div>
  )
}
