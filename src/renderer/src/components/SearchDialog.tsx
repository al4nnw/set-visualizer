import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@shared/layout'
import type { SearchResult, Track } from '@shared/types'
import { api, errMsg } from '../api'

const PROVIDERS: Array<{ id: SearchResult['provider']; label: string }> = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'soundcloud', label: 'SoundCloud' },
  { id: 'itunes', label: 'Apple Music' },
  { id: 'deezer', label: 'Deezer' }
]

const PROVIDER_NAME: Record<SearchResult['provider'], string> = { youtube: 'YouTube', soundcloud: 'SoundCloud', itunes: 'Apple Music', deezer: 'Deezer' }

interface Props {
  track: Track
  onClose: () => void
  onApply: (patch: Partial<Track>) => void
}

export function SearchDialog({ track, onClose, onApply }: Props) {
  const [provider, setProvider] = useState<SearchResult['provider']>('youtube')
  const [query, setQuery] = useState([track.artist, track.title].filter(Boolean).join(' - '))
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [useMeta, setUseMeta] = useState(!track.title)
  const [url, setUrl] = useState('')
  const reqId = useRef(0)

  const run = async (prov = provider, q = query) => {
    if (!q.trim()) return
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const r = await api.search(prov, q.trim())
      if (id === reqId.current) setResults(r)
    } catch (e) {
      if (id === reqId.current) {
        setResults([])
        setError(errMsg(e))
      }
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  const pick = async (r: SearchResult) => {
    setApplying(r.provider + r.id)
    setError(null)
    try {
      const artwork = await api.downloadArt(r.image || r.thumbnail)
      onApply({
        artwork,
        sourceUrl: r.url,
        source: PROVIDER_NAME[r.provider],
        unverified: false,
        ...(useMeta ? { title: r.title, artist: r.artist } : {})
      })
      onClose()
    } catch (e) {
      setError(`Couldn't download that image: ${errMsg(e)}`)
    } finally {
      setApplying(null)
    }
  }

  const fromUrl = async () => {
    if (!url.trim()) return
    setApplying('url')
    setError(null)
    try {
      onApply({ artwork: await api.downloadArt(url.trim()) })
      onClose()
    } catch (e) {
      setError(`Couldn't download that image: ${errMsg(e)}`)
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal search-modal">
        <div className="modal-head">
          <h3>Find artwork & track info</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="seg wide">
          {PROVIDERS.map((p) => (
            <button key={p.id} className={provider === p.id ? 'on' : ''} onClick={() => setProvider(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
        >
          <input className="grow" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Artist - Title" />
          <button className="btn primary" type="submit">
            Search
          </button>
        </form>
        <label className="check">
          <input type="checkbox" checked={useMeta} onChange={(e) => setUseMeta(e.target.checked)} />
          Also use the result's title and artist
        </label>
        {error && <div className="error">{error}</div>}
        <div className={`results ${loading ? 'loading' : ''}`}>
          {!loading && results.length === 0 && !error && <div className="empty">No results.</div>}
          {results.map((r) => (
            <button key={r.provider + r.id} className="result" onClick={() => pick(r)} disabled={!!applying}>
              <div className={`result-img ${r.provider === 'youtube' ? 'wide' : ''}`}>
                <img src={r.thumbnail} alt="" loading="lazy" />
                {applying === r.provider + r.id && <div className="spinner small" />}
              </div>
              <div className="result-text">
                <div className="result-title">{r.title}</div>
                <div className="result-artist">
                  {r.artist}
                  {r.durationSec ? ` · ${formatTime(r.durationSec)}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="row url-row">
          <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste an image URL" />
          <button className="btn" onClick={fromUrl} disabled={!!applying}>
            Use URL
          </button>
        </div>
      </div>
    </div>
  )
}
