import { useEffect, useState } from 'react'
import { formatTime, mainTracks, parseTime, sortTracks } from '@shared/layout'
import type { Project, RenderSettings, Theme, Track } from '@shared/types'
import { api, mediaUrl } from '../api'
import { Icon } from './icons'

export type InspectorTab = 'tracks' | 'style' | 'project'

interface Props {
  project: Project | null
  projectPath: string | null
  tab: InspectorTab
  onTab: (t: InspectorTab) => void
  time: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onSeek: (t: number) => void
  onChangeTrack: (id: string, patch: Partial<Track>, mergeKey?: string) => void
  onChangeSettings: (patch: Partial<RenderSettings>, mergeKey?: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
  onSearch: (id: string) => void
  onAlternateDecks: () => void
  onImportCue: () => void
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

/** A labelled row in a property grid: label on the left, control on the right. */
function Prop({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="prop" title={title}>
      <div className="prop-label">{label}</div>
      <div className="prop-value">{children}</div>
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <span>{title}</span>
        <div className="grow" />
        {right}
      </div>
      <div className="section-body">{children}</div>
    </div>
  )
}

function TracksTab(p: Props & { project: Project }) {
  const { project, selectedId, time } = p
  const sorted = sortTracks(project.tracks)
  const sel = sorted.find((t) => t.id === selectedId) ?? null
  const main = mainTracks(project.tracks)
  const currentId = main.reduce<string | undefined>((acc, t) => (t.start <= time ? t.id : acc), main[0]?.id)
  const { theme } = project.settings

  return (
    <>
      <div className="list-toolbar">
        <span className="muted">{sorted.length} tracks</span>
        <div className="grow" />
        <button className="btn tiny ghost" title="Re-assign decks A, B, A, B… in play order" onClick={p.onAlternateDecks}>
          Re-alternate A/B
        </button>
        <button className="btn tiny" onClick={p.onAdd} title="Add a track at the playhead (M)">
          <Icon name="plus" size={12} /> Add at playhead
        </button>
      </div>
      <div className="tracklist">
        {sorted.length === 0 && (
          <div className="empty">
            No tracks yet. <a onClick={p.onImportCue}>Import the Rekordbox .cue</a> from this recording, or add tracks by hand at the playhead.
          </div>
        )}
        {sorted.map((t, i) => (
          <div
            key={t.id}
            className={`track-row ${t.id === selectedId ? 'selected' : ''} ${t.id === currentId ? 'current' : ''}`}
            onClick={() => p.onSelect(t.id)}
            onDoubleClick={() => p.onSeek(t.start)}
          >
            <div className="tr-deck" style={{ background: t.deck === 'B' ? theme.accentB : theme.accent }} title={`Deck ${t.deck}`} />
            <div className="tr-num">{i + 1}</div>
            <div className="tr-art">{t.artwork ? <img src={mediaUrl(t.artwork)} alt="" /> : <Icon name="music" size={12} />}</div>
            <div className="tr-text">
              <div className="tr-title">{t.title || <i>Untitled</i>}</div>
              <div className="tr-artist">
                {t.artist || <i>Unknown artist</i>}
                {t.layered && <span className="layered-tag" title="Mixed in under another track, never takes over">layered</span>}
              </div>
            </div>
            <div className="tr-time">{formatTime(t.start, project.duration >= 3600)}</div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="clip-props">
          <Section
            title="Track"
            right={
              <button className="icon-btn small" title="Delete track (Del)" onClick={() => p.onDelete(sel.id)}>
                <Icon name="trash" size={14} />
              </button>
            }
          >
            <div className="clip-art">
              {sel.artwork ? <img src={mediaUrl(sel.artwork)} alt="" /> : <div className="art-placeholder">No artwork</div>}
              <div className="clip-art-actions">
                <button className="btn small" onClick={() => p.onSearch(sel.id)}>
                  <Icon name="search" size={12} /> Find artwork…
                </button>
                <button
                  className="btn small"
                  onClick={async () => {
                    const art = await api.pickImage()
                    if (art) p.onChangeTrack(sel.id, { artwork: art })
                  }}
                >
                  <Icon name="image" size={12} /> Choose image…
                </button>
                {sel.artwork && (
                  <button className="btn small ghost" onClick={() => p.onChangeTrack(sel.id, { artwork: undefined })}>
                    Remove image
                  </button>
                )}
                {sel.sourceUrl && (
                  <a className="source-link" onClick={() => api.openExternal(sel.sourceUrl!)}>
                    {sel.source ?? 'Source'} ↗
                  </a>
                )}
              </div>
            </div>
            <Prop label="Title">
              <input value={sel.title} onChange={(e) => p.onChangeTrack(sel.id, { title: e.target.value }, `title-${sel.id}`)} />
            </Prop>
            <Prop label="Artist">
              <input value={sel.artist} onChange={(e) => p.onChangeTrack(sel.id, { artist: e.target.value }, `artist-${sel.id}`)} />
            </Prop>
            <Prop label="Deck">
              <div className="seg">
                {(['A', 'B'] as const).map((d) => (
                  <button key={d} className={sel.deck === d ? 'on' : ''} onClick={() => p.onChangeTrack(sel.id, { deck: d })}>
                    {d}
                  </button>
                ))}
              </div>
            </Prop>
          </Section>
          <Section title="Timing" right={<span className="muted small">I · T · O at the playhead</span>}>
            <Prop label="Takes over" title="Where this track becomes the main track (moves to the left).">
              <TimeInput value={sel.start} onChange={(v) => v !== undefined && p.onChangeTrack(sel.id, { start: v })} />
              <button className="btn tiny ghost" title="Set to the playhead (T)" onClick={() => p.onChangeTrack(sel.id, { start: time })}>
                Playhead <kbd>T</kbd>
              </button>
            </Prop>
            <Prop label="Mix in" title="When it starts being heard. It appears on the right as 'now playing' from here.">
              <TimeInput value={sel.mixIn} placeholder={`auto (−${project.settings.defaultLead}s)`} onChange={(v) => p.onChangeTrack(sel.id, { mixIn: v })} />
              <button className="btn tiny ghost" title="Set to the playhead (I)" onClick={() => p.onChangeTrack(sel.id, { mixIn: Math.min(time, sel.start) })}>
                Playhead <kbd>I</kbd>
              </button>
            </Prop>
            <Prop label="Plays until" title="When it stops being heard, if it keeps playing under the next track after the swap.">
              <TimeInput value={sel.tailEnd} placeholder="leaves at the swap" onChange={(v) => p.onChangeTrack(sel.id, { tailEnd: v })} />
              <button className="btn tiny ghost" title="Set to the playhead (O)" onClick={() => p.onChangeTrack(sel.id, { tailEnd: time })}>
                Playhead <kbd>O</kbd>
              </button>
            </Prop>
          </Section>
        </div>
      )}
    </>
  )
}

function StyleTab({ project, onChangeSettings }: Props & { project: Project }) {
  const s = project.settings
  const setTheme = (patch: Partial<Theme>) => onChangeSettings({ theme: { ...s.theme, ...patch } }, 'theme')
  return (
    <div className="scroll">
      <Section title="Format">
        <Prop label="Aspect" title="16:9 for YouTube, 9:16 for phones (Shorts, Reels, TikTok)">
          <div className="seg">
            <button className={s.height <= s.width ? 'on' : ''} onClick={() => s.height > s.width && onChangeSettings({ width: s.height, height: s.width })}>
              16:9 YouTube
            </button>
            <button className={s.height > s.width ? 'on' : ''} onClick={() => s.height <= s.width && onChangeSettings({ width: s.height, height: s.width })}>
              9:16 Phone
            </button>
          </div>
        </Prop>
      </Section>
      <Section title="Text">
        <Prop label="DJ name">
          <input value={s.djName} onChange={(e) => onChangeSettings({ djName: e.target.value }, 'dj')} placeholder="shown top-left" />
        </Prop>
        <Prop label="Set title">
          <input value={s.setTitle} onChange={(e) => onChangeSettings({ setTitle: e.target.value }, 'title')} placeholder="Live from the studio" />
        </Prop>
        <Prop label="Clock">
          <label className="check">
            <input type="checkbox" checked={s.showTimestamps} onChange={(e) => onChangeSettings({ showTimestamps: e.target.checked })} />
            Show elapsed / total time
          </label>
        </Prop>
      </Section>
      <Section title="Waveforms">
        <Prop label="Top" title="The close-up waveform that scrolls past the playhead">
          <div className="seg">
            <button className={s.showDeckWave ? 'on' : ''} onClick={() => onChangeSettings({ showDeckWave: true })}>
              Show
            </button>
            <button className={!s.showDeckWave ? 'on' : ''} onClick={() => onChangeSettings({ showDeckWave: false })}>
              Hide
            </button>
          </div>
          <span className="muted small">close-up, scrolls</span>
        </Prop>
        <Prop label="Bottom" title="The whole set's waveform with the track numbers under it">
          <div className="seg">
            <button className={s.showSetWave ? 'on' : ''} onClick={() => onChangeSettings({ showSetWave: true })}>
              Show
            </button>
            <button className={!s.showSetWave ? 'on' : ''} onClick={() => onChangeSettings({ showSetWave: false })}>
              Hide
            </button>
          </div>
          <span className="muted small">whole set, track numbers</span>
        </Prop>
      </Section>
      <Section title="Colors">
        <Prop label="Deck A">
          <input type="color" value={s.theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} />
          <span className="mono muted">{s.theme.accent}</span>
        </Prop>
        <Prop label="Deck B">
          <input type="color" value={s.theme.accentB} onChange={(e) => setTheme({ accentB: e.target.value })} />
          <span className="mono muted">{s.theme.accentB}</span>
        </Prop>
        <Prop label="Background">
          <input type="color" value={s.theme.background} onChange={(e) => setTheme({ background: e.target.value })} />
          <span className="mono muted">{s.theme.background}</span>
        </Prop>
      </Section>
      <Section title="Transitions">
        <Prop label="Up next lead" title="How long before it takes over a track without a mix-in time appears on the right">
          <input type="range" min={0} max={120} step={5} value={s.defaultLead} onChange={(e) => onChangeSettings({ defaultLead: +e.target.value }, 'lead')} />
          <span className="mono val">{s.defaultLead}s</span>
        </Prop>
        <Prop label="Swap time" title="How long the A/B swap animation takes">
          <input type="range" min={0.4} max={4} step={0.1} value={s.swapDuration} onChange={(e) => onChangeSettings({ swapDuration: +e.target.value }, 'swap')} />
          <span className="mono val">{s.swapDuration.toFixed(1)}s</span>
        </Prop>
      </Section>
    </div>
  )
}

function ProjectTab({ project, projectPath, onImportCue }: Props & { project: Project }) {
  return (
    <div className="scroll">
      <Section title="Project file">
        <Prop label="File">
          <span className="path" title={projectPath ?? ''}>
            {projectPath ? projectPath.split(/[\\/]/).pop() : 'Not saved yet'}
          </span>
          {projectPath && (
            <button className="btn tiny ghost" onClick={() => api.reveal(projectPath)}>
              Show
            </button>
          )}
        </Prop>
        <Prop label="Location">
          <span className="path" title={projectPath ?? ''}>
            {projectPath?.replace(/[\\/][^\\/]*$/, '') ?? '—'}
          </span>
        </Prop>
        <Prop label="Last saved">
          <span>{project.savedAt ? new Date(project.savedAt).toLocaleString() : '—'}</span>
        </Prop>
      </Section>
      <Section title="Set recording">
        <Prop label="Audio">
          <span className="path" title={project.audioPath}>
            {project.audioName}
          </span>
          <button className="btn tiny ghost" onClick={() => api.reveal(project.audioPath)}>
            Show
          </button>
        </Prop>
        <Prop label="Length">
          <span className="mono">{formatTime(project.duration, true)}</span>
        </Prop>
      </Section>
      <Section title="Rekordbox cue">
        {project.cue ? (
          <>
            <Prop label="File">
              <span className="path" title={project.cue.path}>
                {project.cue.name}
              </span>
            </Prop>
            <Prop label="Imported">
              <span>{new Date(project.cue.importedAt).toLocaleString()}</span>
            </Prop>
          </>
        ) : (
          <div className="muted small pad">No cue sheet imported yet.</div>
        )}
        <div className="pad">
          <button className="btn small" onClick={onImportCue}>
            <Icon name="cue" size={12} /> {project.cue ? 'Re-import .cue…' : 'Import .cue…'}
          </button>
        </div>
      </Section>
    </div>
  )
}

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'tracks', label: 'Tracks' },
  { id: 'style', label: 'Style' },
  { id: 'project', label: 'Project' }
]

/** Right-hand panel: the tracklist and selected track, the video's look, and project details. */
export function Inspector(p: Props) {
  const { project } = p
  return (
    <aside className="panel inspector">
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`panel-tab ${p.tab === t.id ? 'on' : ''}`} onClick={() => p.onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {!project ? (
          <div className="empty">Open a set recording to edit its tracks and look.</div>
        ) : p.tab === 'tracks' ? (
          <TracksTab {...p} project={project} />
        ) : p.tab === 'style' ? (
          <StyleTab {...p} project={project} />
        ) : (
          <ProjectTab {...p} project={project} />
        )}
      </div>
    </aside>
  )
}
