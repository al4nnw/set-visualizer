import { formatTime } from '@shared/layout'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportQueue, useExportJobs, type ExportJob } from '../export/queue'
import { lang } from '../i18n'
import { Icon } from './icons'

const active = (j: ExportJob) => j.status === 'queued' || j.status === 'running'

/**
 * The export jobs, in one panel in the corner (like a download list): each job's progress, its
 * place in line, and the finished ones until the panel is closed.
 */
export function ExportJobs() {
  const { t } = useTranslation()
  const jobs = useExportJobs()
  const [collapsed, setCollapsed] = useState(false)
  if (!jobs.length) return null
  const waiting = jobs.filter((j) => j.status === 'queued')
  const busy = jobs.filter(active).length
  const done = jobs.filter((j) => j.status === 'done').length
  const failed = jobs.filter((j) => j.status === 'error').length
  const running = jobs.find((j) => j.status === 'running')

  const title = busy ? t('jobs.titleBusy', { count: busy }) : failed ? t('jobs.titleFailed', { count: failed }) : t('jobs.titleDone', { count: done || jobs.length })
  const close = () => {
    if (busy && !confirm(t('jobs.closeConfirm'))) return
    exportQueue.clear()
  }

  const pctOf = (j: ExportJob) => (j.status === 'done' ? 100 : j.progress ? Math.min(100, (j.progress.frame / Math.max(1, j.progress.totalFrames)) * 100) : 0)
  const line = (j: ExportJob) => {
    const p = j.progress
    if (j.status === 'queued') return t('jobs.waiting', { n: waiting.indexOf(j) + 1 })
    if (j.status === 'done') return t('export.done')
    if (j.status === 'cancelled') return t('jobs.cancelled')
    if (j.status === 'error') return j.error ?? t('jobs.failed')
    if (!p || p.stage === 'preparing') return t('export.preparing')
    if (p.stage === 'finishing') return t('export.finishing')
    return `${Math.floor(pctOf(j))}% · ${t('export.eta', { time: formatTime(p.etaSec) })} · ${t('common.fps', { fps: p.fps.toLocaleString(lang(), { maximumFractionDigits: 0 }) })}`
  }

  return (
    <div className={`export-jobs ${collapsed ? 'collapsed' : ''}`} role="region" aria-label={title}>
      <div className="export-jobs-head">
        <span className="export-jobs-title">{title}</span>
        <button className="icon-btn" title={t(collapsed ? 'jobs.expand' : 'jobs.collapse')} onClick={() => setCollapsed(!collapsed)}>
          <span className={`rot ${collapsed ? 'up' : 'down'}`}>
            <Icon name="chevron" size={14} />
          </span>
        </button>
        <button className="icon-btn" title={t('jobs.close')} onClick={close}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {!collapsed && (
        <>
          {busy > 0 && (
            <div className="export-jobs-sub">
              <span>{running ? line(running) : t('jobs.starting')}</span>
              <button className="btn tiny ghost accent" onClick={() => jobs.filter(active).forEach((j) => exportQueue.cancel(j.id))}>
                {busy > 1 ? t('jobs.cancelAll') : t('common.cancel')}
              </button>
            </div>
          )}
          <div className="export-jobs-list">
            {jobs.map((j) => {
              const i = waiting.indexOf(j)
              return (
                <div key={j.id} className={`export-job ${j.status}`}>
                  <span className="export-job-icon">
                    <Icon name="export" size={13} />
                  </span>
                  <div className="export-job-text">
                    <span className="export-job-name" title={j.label}>
                      {j.label}
                    </span>
                    {j.status !== 'done' && <span className={`export-job-line ${j.status === 'error' ? 'error' : ''}`}>{line(j)}</span>}
                  </div>
                  <div className="export-job-side">
                    {j.status === 'queued' && (
                      <>
                        <button className="icon-btn small" title={t('jobs.moveUp')} disabled={i === 0} onClick={() => exportQueue.move(j.id, -1)}>
                          <span className="rot up">
                            <Icon name="chevron" size={11} />
                          </span>
                        </button>
                        <button className="icon-btn small" title={t('jobs.moveDown')} disabled={i === waiting.length - 1} onClick={() => exportQueue.move(j.id, 1)}>
                          <span className="rot down">
                            <Icon name="chevron" size={11} />
                          </span>
                        </button>
                      </>
                    )}
                    {active(j) ? (
                      <button className="export-job-status cancel" title={t('common.cancel')} onClick={() => exportQueue.cancel(j.id)}>
                        <Ring pct={j.status === 'running' ? pctOf(j) : 0} />
                        <Icon name="close" size={10} />
                      </button>
                    ) : (
                      <span className={`export-job-status ${j.status}`} title={line(j)}>
                        <Icon name={j.status === 'done' ? 'check' : 'close'} size={12} />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** A circle that fills as the job goes, like a download's. */
function Ring({ pct }: { pct: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" viewBox="0 0 22 22" width="22" height="22" aria-hidden>
      <circle cx="11" cy="11" r={r} className="ring-track" />
      <circle cx="11" cy="11" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  )
}
