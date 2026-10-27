import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@shared/layout'
import { mergeHits } from '@shared/tracklist'
import type { IdentifyHit, Project } from '@shared/types'
import { api, errMsg } from '../api'

interface Props {
  project: Project
  onClose: () => void
  onApply: (hits: Array<IdentifyHit & { count: number }>, mode: 'replace' | 'add') => void
}

export function IdentifyDialog({ project, onClose, onApply }: Props) {
  const [token, setToken] = useState('')
  const [savedToken, setSavedToken] = useState('')
  const [interval, setSampleEvery] = useState(45)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [hits, setHits] = useState<IdentifyHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const offs = useRef<Array<() => void>>([])

  useEffect(() => {
    api.getSettings().then((s) => {
      setToken(s.auddToken ?? '')
      setSavedToken(s.auddToken ?? '')
    })
    return () => offs.current.forEach((f) => f())
  }, [])

  const requests = Math.max(1, Math.floor((project.duration - 10) / interval))
  const merged = mergeHits(hits)

  const start = async () => {
    setError(null)
    setHits([])
    setFinished(false)
    if (token !== savedToken) {
      await api.setSettings({ auddToken: token.trim() })
      setSavedToken(token.trim())
    }
    setRunning(true)
    offs.current.forEach((f) => f())
    offs.current = [api.onIdentifyHit((h) => setHits((prev) => [...prev, h])), api.onIdentifyProgress(setProgress)]
    try {
      const all = await api.identify({ audioPath: project.audioPath, duration: project.duration, interval })
      setHits(all)
      setFinished(true)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="modal identify-modal">
        <div className="modal-head">
          <h3>Identify tracks</h3>
          <button className="icon-btn" onClick={onClose} disabled={running}>
            ✕
          </button>
        </div>
        <p className="muted">
          Listens to a 12-second sample of the set every few seconds and recognises it with{' '}
          <a onClick={() => api.openExternal('https://audd.io/')}>AudD</a> (needs an API token; you can get one at dashboard.audd.io). Unreleased
          tracks and IDs won't be found, so you can fix or add those by hand afterwards.
        </p>
        <div className="row">
          <label className="grow">
            AudD API token
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste your token" disabled={running} />
          </label>
          <label>
            Sample every
            <select value={interval} onChange={(e) => setSampleEvery(+e.target.value)} disabled={running}>
              {[20, 30, 45, 60, 90].map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="muted small">
          About {requests} requests for this {formatTime(project.duration)} set.
        </div>

        {(running || progress.total > 0) && (
          <div className="bar big">
            <div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <div className="hits">
          {merged.map((h, i) => (
            <div key={i} className="hit">
              <span className="tr-time">{formatTime(h.at)}</span>
              {h.artwork && <img src={h.artwork} alt="" />}
              <div className="grow">
                <div className="tr-title">{h.title}</div>
                <div className="tr-artist">{h.artist}</div>
              </div>
              <span className="muted small">×{h.count}</span>
            </div>
          ))}
          {!running && !merged.length && finished && <div className="empty">Nothing recognised.</div>}
        </div>

        <div className="modal-foot">
          {running ? (
            <button className="btn" onClick={() => api.cancelIdentify()}>
              Stop
            </button>
          ) : (
            <button className="btn primary" onClick={start} disabled={!token.trim()}>
              {finished ? 'Run again' : 'Start'}
            </button>
          )}
          <div className="grow" />
          {merged.length > 0 && !running && (
            <>
              <button className="btn" onClick={() => onApply(merged, 'add')} disabled={!project.tracks.length}>
                Add missing to tracklist
              </button>
              <button className="btn primary" onClick={() => onApply(merged, 'replace')}>
                Use as tracklist
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
