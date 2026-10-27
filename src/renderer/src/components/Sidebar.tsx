import { useEffect, useState } from 'react'
import { formatTime, parseTime, sortTracks } from '@shared/layout'
import type { Project, Track } from '@shared/types'
import { api, mediaUrl } from '../api'

interface Props {
  project: Project
  time: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onSeek: (t: number) => void
  onChangeTrack: (id: string, patch: Partial<Track>, mergeKey?: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
  onSearch: (id: string) => void
  onAlternateDecks: () => void
}

function TimeInput({ value, onChange, placeholder }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? '' : formatTime(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : formatTime(value))
  }, [value, focused])
  const commit = () => {
    if (!text.trim()) return onChange(undefined)
    const t = parseTime(text)
    if (!Number.isNaN(t)) onChange(t)
    else setText(value === undefined ? '' : formatTime(value))
  }
  return (
    <input
      className="time-input"
      value={text}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function Sidebar(p: Props) {
  const { project, selectedId, time } = p
  const sorted = sortTracks(project.tracks)
  const sel = sorted.find((t) => t.id === selectedId) ?? null
  const currentIdx = sorted.reduce((acc, t, i) => (t.start <= time ? i : acc), 0)
  const { theme } = project.settings

  return (
    <aside className="sidebar">
      <div className="panel-head">
        <h3>Tracklist</h3>
        <span className="muted">{sorted.length} tracks</span>
        <div className="grow" />
        <button className="btn tiny ghost" title="Re-assign decks A, B, A, B… in play order" onClick={p.onAlternateDecks}>
          A/B
        </button>
        <button className="btn tiny" onClick={p.onAdd} title="Add a track at the playhead">
          + Add at {formatTime(time)}
        </button>
      </div>
      <div className="tracklist">
        {sorted.length === 0 && (
          <div className="empty">
            No tracks yet. Import a tracklist, run <b>Identify tracks</b>, or add them by hand at the playhead.
          </div>
        )}
        {sorted.map((t, i) => (
          <div
            key={t.id}
            className={`track-row ${t.id === selectedId ? 'selected' : ''} ${i === currentIdx ? 'current' : ''}`}
            onClick={() => p.onSelect(t.id)}
            onDoubleClick={() => p.onSeek(t.start)}
          >
            <div className="tr-num">{i + 1}</div>
            <div className="tr-art">{t.artwork ? <img src={mediaUrl(t.artwork)} alt="" /> : <span>♪</span>}</div>
            <div className="tr-text">
              <div className="tr-title">{t.title || <i>Untitled</i>}</div>
              <div className="tr-artist">{t.artist || <i>Unknown artist</i>}</div>
            </div>
            <div className="tr-meta">
              <span className="deck-pill" style={{ background: t.deck === 'B' ? theme.accentB : theme.accent }}>
                {t.deck}
              </span>
              <span className="tr-time">{formatTime(t.start)}</span>
              {t.unverified && <span className="warn-dot" title="Found by fingerprinting — please check" />}
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="editor">
          <div className="editor-art">
            {sel.artwork ? <img src={mediaUrl(sel.artwork)} alt="" /> : <div className="art-placeholder">No artwork</div>}
            <div className="editor-art-actions">
              <button className="btn primary small" onClick={() => p.onSearch(sel.id)}>
                Find on YouTube / SoundCloud
              </button>
              <div className="row">
                <button
                  className="btn small"
                  onClick={async () => {
                    const art = await api.pickImage()
                    if (art) p.onChangeTrack(sel.id, { artwork: art })
                  }}
                >
                  Choose image…
                </button>
                {sel.artwork && (
                  <button className="btn small ghost" onClick={() => p.onChangeTrack(sel.id, { artwork: undefined })}>
                    Remove
                  </button>
                )}
              </div>
              {sel.sourceUrl && (
                <a className="source-link" onClick={() => api.openExternal(sel.sourceUrl!)}>
                  {sel.source ?? 'Source'} ↗
                </a>
              )}
            </div>
          </div>
          <label>
            Title
            <input value={sel.title} onChange={(e) => p.onChangeTrack(sel.id, { title: e.target.value, unverified: false }, `title-${sel.id}`)} />
          </label>
          <label>
            Artist
            <input value={sel.artist} onChange={(e) => p.onChangeTrack(sel.id, { artist: e.target.value, unverified: false }, `artist-${sel.id}`)} />
          </label>
          <div className="row">
            <label className="grow">
              Becomes main at
              <div className="row">
                <TimeInput value={sel.start} onChange={(v) => v !== undefined && p.onChangeTrack(sel.id, { start: v })} />
                <button className="btn small ghost" title="Set to playhead" onClick={() => p.onChangeTrack(sel.id, { start: time })}>
                  ⇤ now
                </button>
              </div>
            </label>
            <label className="grow">
              Mix-in (appears right)
              <div className="row">
                <TimeInput value={sel.mixIn} placeholder={`auto (−${project.settings.defaultLead}s)`} onChange={(v) => p.onChangeTrack(sel.id, { mixIn: v })} />
                <button className="btn small ghost" title="Set to playhead" onClick={() => p.onChangeTrack(sel.id, { mixIn: Math.min(time, sel.start) })}>
                  ⇤ now
                </button>
              </div>
            </label>
          </div>
          <div className="row">
            <div className="seg">
              {(['A', 'B'] as const).map((d) => (
                <button key={d} className={sel.deck === d ? 'on' : ''} onClick={() => p.onChangeTrack(sel.id, { deck: d })}>
                  Deck {d}
                </button>
              ))}
            </div>
            <div className="grow" />
            {sel.unverified && (
              <button className="btn small" onClick={() => p.onChangeTrack(sel.id, { unverified: false })}>
                ✓ Looks right
              </button>
            )}
            <button className="btn small danger" onClick={() => p.onDelete(sel.id)}>
              Delete
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
