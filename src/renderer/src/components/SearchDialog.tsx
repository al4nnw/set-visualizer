import { useEffect, useRef, useState } from 'react'
import { PROVIDER_NAME } from '@shared/artwork'
import { formatTime } from '@shared/layout'
import type { SearchResult, Track } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { youtubeId, youtubeThumbnail, youtubeUrl } from '@shared/youtube'
import { errMsg, platform } from '../platform'

const PROVIDERS: Array<{ id: SearchResult['provider']; label: string }> = [
  { id: 'deezer', label: 'Deezer' },
  { id: 'itunes', label: 'Apple Music' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'soundcloud', label: 'SoundCloud' }
]

// The web version has no SoundCloud, and its YouTube search spends a quota everyone shares (and
// needs a sign-in), so it searches YouTube only when asked. Deezer's covers are the sharpest: it comes first.
const WEB = platform.kind === 'web'
const SHOWN = WEB ? PROVIDERS.filter((p) => p.id !== 'soundcloud') : PROVIDERS
const askFirst = (p: SearchResult['provider']) => WEB && p === 'youtube'


interface Props {
  track: Track
  onClose: () => void
  onApply: (patch: Partial<Track>) => void
}

export function SearchDialog({ track, onClose, onApply }: Props) {
  const { t } = useTranslation()
  const [provider, setProvider] = useState<SearchResult['provider']>(SHOWN[0].id)
  const [query, setQuery] = useState([track.artist, track.title].filter(Boolean).join(' - '))
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [useMeta, setUseMeta] = useState(!track.title)
  const [url, setUrl] = useState('')
  const reqId = useRef(0)
  const [ranFor, setRanFor] = useState<SearchResult['provider'] | null>(null)

  const run = async (prov = provider, q = query) => {
    if (!q.trim()) return
    const id = ++reqId.current
    setRanFor(prov)
    setLoading(true)
    setError(null)
    try {
      const r = await platform.search(prov, q.trim())
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
    if (!askFirst(provider)) return void run()
    reqId.current++
    setResults([])
    setError(null)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  const pick = async (r: SearchResult) => {
    setApplying(r.provider + r.id)
    setError(null)
    try {
      const artwork = await platform.downloadArt(r.image || r.thumbnail)
      onApply({
        artwork,
        sourceUrl: r.url,
        source: PROVIDER_NAME[r.provider],
        // A pasted link without the API's details has no title to give.
        ...(useMeta && r.title ? { title: r.title, artist: r.artist } : {})
      })
      onClose()
    } catch (e) {
      setError(t('search.downloadFailed', { error: errMsg(e) }))
    } finally {
      setApplying(null)
    }
  }

  const fromUrl = async () => {
    if (!url.trim()) return
    setApplying('url')
    setError(null)
    try {
      // A YouTube link means that video's thumbnail.
      const video = youtubeId(url)
      onApply(
        video
          ? { artwork: await platform.downloadArt(youtubeThumbnail(video)), sourceUrl: youtubeUrl(video), source: 'YouTube' }
          : { artwork: await platform.downloadArt(url.trim()) }
      )
      onClose()
    } catch (e) {
      setError(t('search.downloadFailed', { error: errMsg(e) }))
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal search-modal">
        <div className="modal-head">
          <h3>{t('search.title')}</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="seg wide">
          {SHOWN.map((p) => (
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
          <input className="grow" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search.placeholder')} />
          <button className="btn primary" type="submit">
            {t('search.search')}
          </button>
        </form>
        <label className="check">
          <input type="checkbox" checked={useMeta} onChange={(e) => setUseMeta(e.target.checked)} />
          {t('search.useMeta')}
        </label>
        {error && <div className="error">{error}</div>}
        <div className={`results ${loading ? 'loading' : ''}`}>
          {!loading && results.length === 0 && !error && <div className="empty">{askFirst(provider) && ranFor !== provider ? t('web.youtubeHint') : t('search.noResults')}</div>}
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
          <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('search.urlPlaceholder')} />
          <button className="btn" onClick={fromUrl} disabled={!!applying}>
            {t('search.useUrl')}
          </button>
        </div>
      </div>
    </div>
  )
}
