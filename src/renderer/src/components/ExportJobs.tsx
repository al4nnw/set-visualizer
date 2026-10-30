import { formatTime } from '@shared/layout'
import { useTranslation } from 'react-i18next'
import { exportQueue, useExportJobs, type ExportJob } from '../export/queue'
import { lang } from '../i18n'
import { platform } from '../platform'
import { Icon } from './icons'

/** The export jobs, as a stack of toasts in the corner: progress, cancel, order, and the result. */
export function ExportJobs() {
  const { t } = useTranslation()
  const jobs = useExportJobs()
  if (!jobs.length) return null
  const waiting = jobs.filter((j) => j.status === 'queued')

  const line = (j: ExportJob) => {
    const p = j.progress
    if (j.status === 'queued') return t('jobs.waiting', { n: waiting.indexOf(j) + 1 })
    if (j.status === 'done') return t('export.done')
    if (j.status === 'cancelled') return t('jobs.cancelled')
    if (j.status === 'error') return j.error ?? t('jobs.failed')
    if (!p || p.stage === 'preparing') return t('export.preparing')
    if (p.stage === 'finishing') return t('export.finishing')
    return `${Math.floor((p.frame / Math.max(1, p.totalFrames)) * 100)}% · ${t('export.eta', { time: formatTime(p.etaSec) })} · ${t('common.fps', { fps: p.fps.toLocaleString(lang(), { maximumFractionDigits: 0 }) })}`
  }

  return (
    <div className="export-jobs">
      {jobs.map((j) => {
        const pct = j.status === 'done' ? 100 : j.progress ? Math.min(100, (j.progress.frame / Math.max(1, j.progress.totalFrames)) * 100) : 0
        const finished = j.status === 'done' || j.status === 'error' || j.status === 'cancelled'
        const i = waiting.indexOf(j)
        return (
          <div key={j.id} className={`export-job ${j.status}`}>
            <div className="export-job-head">
              <Icon name={j.status === 'done' ? 'check' : 'export'} size={12} />
              <span className="export-job-name" title={j.label}>
                {j.label}
              </span>
              {j.status === 'queued' && (
                <>
                  <button className="icon-btn small" title={t('jobs.moveUp')} disabled={i === 0} onClick={() => exportQueue.move(j.id, -1)}>
                    <span className="rot up"><Icon name="chevron" size={11} /></span>
                  </button>
                  <button className="icon-btn small" title={t('jobs.moveDown')} disabled={i === waiting.length - 1} onClick={() => exportQueue.move(j.id, 1)}>
                    <span className="rot down"><Icon name="chevron" size={11} /></span>
                  </button>
                </>
              )}
              {finished ? (
                <button className="icon-btn small" title={t('jobs.dismiss')} onClick={() => exportQueue.dismiss(j.id)}>
                  <Icon name="close" size={11} />
                </button>
              ) : (
                <button className="btn tiny ghost" onClick={() => exportQueue.cancel(j.id)}>
                  {t('common.cancel')}
                </button>
              )}
            </div>
            <div className={`export-job-line ${j.status === 'error' ? 'error' : ''}`}>{line(j)}</div>
            {(j.status === 'running' || j.status === 'done') && (
              <div className="bar">
                <div style={{ width: `${pct}%` }} />
              </div>
            )}
            {j.status === 'done' && j.progress?.outputPath && platform.features.reveal && (
              <button className="btn tiny" onClick={() => platform.reveal(j.progress!.outputPath!)}>
                <Icon name="folder" size={11} /> {t('export.showInFolder')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
