import { useEffect, useState } from 'react'
import { formatTime, mainTracks, parseTime, sortTracks } from '@shared/layout'
import type { Project, RenderSettings, SwapCurve, Theme, Track } from '@shared/types'
import { Trans, useTranslation } from 'react-i18next'
import { LOCALE_NAMES, LOCALES, type Locale } from '@shared/i18n'
import { lang } from '../i18n'
import { platform } from '../platform'
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
  const { t } = useTranslation()

  return (
    <>
      <div className="list-toolbar">
        <span className="muted">{t('common.tracks', { count: sorted.length })}</span>
        <div className="grow" />
        <button className="btn tiny ghost" title={t('inspector.alternateTitle')} onClick={p.onAlternateDecks}>
          {t('inspector.alternate')}
        </button>
        <button className="btn tiny" onClick={p.onAdd} title={t('inspector.addTitle')}>
          <Icon name="plus" size={12} /> {t('inspector.add')}
        </button>
      </div>
      <div className="tracklist">
        {sorted.length === 0 && (
          <div className="empty">
            <Trans i18nKey="inspector.noTracks" components={[<a onClick={p.onImportCue} />]} />
          </div>
        )}
        {sorted.map((tr, i) => (
          <div
            key={tr.id}
            className={`track-row ${tr.id === selectedId ? 'selected' : ''} ${tr.id === currentId ? 'current' : ''}`}
            onClick={() => p.onSelect(tr.id)}
            onDoubleClick={() => p.onSeek(tr.start)}
          >
            <div className="tr-deck" style={{ background: tr.deck === 'B' ? theme.accentB : theme.accent }} title={t('inspector.deck', { deck: tr.deck })} />
            <div className="tr-num">{i + 1}</div>
            <div className="tr-art">{tr.artwork ? <img src={platform.mediaUrl(tr.artwork)} alt="" /> : <Icon name="music" size={12} />}</div>
            <div className="tr-text">
              <div className="tr-title">{tr.title || <i>{t('common.untitled')}</i>}</div>
              <div className="tr-artist">
                {tr.artist || <i>{t('common.unknownArtist')}</i>}
                {tr.layered && <span className="layered-tag" title={t('inspector.layeredTitle')}>{t('inspector.layered')}</span>}
              </div>
            </div>
            <div className="tr-time">{formatTime(tr.start, project.duration >= 3600)}</div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="clip-props">
          <Section
            title={t('inspector.track')}
            right={
              <button className="icon-btn small" title={t('inspector.deleteTitle')} onClick={() => p.onDelete(sel.id)}>
                <Icon name="trash" size={14} />
              </button>
            }
          >
            <div className="clip-art">
              {sel.artwork ? <img src={platform.mediaUrl(sel.artwork)} alt="" /> : <div className="art-placeholder">{t('inspector.noArtwork')}</div>}
              <div className="clip-art-actions">
                <button className="btn small" onClick={() => p.onSearch(sel.id)}>
                  <Icon name="search" size={12} /> {t('inspector.findArtwork')}
                </button>
                <button
                  className="btn small"
                  onClick={async () => {
                    const art = await platform.pickImage()
                    if (art) p.onChangeTrack(sel.id, { artwork: art })
                  }}
                >
                  <Icon name="image" size={12} /> {t('inspector.chooseImage')}
                </button>
                {sel.artwork && (
                  <button className="btn small ghost" onClick={() => p.onChangeTrack(sel.id, { artwork: undefined })}>
                    {t('inspector.removeImage')}
                  </button>
                )}
                {sel.sourceUrl && (
                  <a className="source-link" onClick={() => platform.openExternal(sel.sourceUrl!)}>
                    {sel.source ?? t('inspector.source')} ↗
                  </a>
                )}
              </div>
            </div>
            <Prop label={t('inspector.title')}>
              <input value={sel.title} onChange={(e) => p.onChangeTrack(sel.id, { title: e.target.value }, `title-${sel.id}`)} />
            </Prop>
            <Prop label={t('inspector.artist')}>
              <input value={sel.artist} onChange={(e) => p.onChangeTrack(sel.id, { artist: e.target.value }, `artist-${sel.id}`)} />
            </Prop>
            <Prop label={t('inspector.deckLabel')}>
              <div className="seg">
                {(['A', 'B'] as const).map((d) => (
                  <button key={d} className={sel.deck === d ? 'on' : ''} onClick={() => p.onChangeTrack(sel.id, { deck: d })}>
                    {d}
                  </button>
                ))}
              </div>
            </Prop>
          </Section>
          <Section title={t('inspector.timing')} right={<span className="muted small">{t('inspector.timingKeys')}</span>}>
            <Prop label={t('timing.takesOver')} title={t('inspector.takesOverTitle')}>
              <TimeInput value={sel.start} onChange={(v) => v !== undefined && p.onChangeTrack(sel.id, { start: v })} />
              <button className="btn tiny ghost" title={t('inspector.playheadTitle', { key: 'S' })} onClick={() => p.onChangeTrack(sel.id, { start: time })}>
                {t('inspector.playhead')} <kbd>S</kbd>
              </button>
            </Prop>
            <Prop label={t('timing.mixIn')} title={t('inspector.mixInTitle')}>
              <TimeInput value={sel.mixIn} placeholder={t('inspector.mixInAuto', { lead: project.settings.defaultLead })} onChange={(v) => p.onChangeTrack(sel.id, { mixIn: v })} />
              <button className="btn tiny ghost" title={t('inspector.playheadTitle', { key: 'A' })} onClick={() => p.onChangeTrack(sel.id, { mixIn: Math.min(time, sel.start) })}>
                {t('inspector.playhead')} <kbd>A</kbd>
              </button>
            </Prop>
            <Prop label={t('timing.playsUntil')} title={t('inspector.playsUntilTitle')}>
              <TimeInput value={sel.tailEnd} placeholder={t('inspector.playsUntilNone')} onChange={(v) => p.onChangeTrack(sel.id, { tailEnd: v })} />
              <button className="btn tiny ghost" title={t('inspector.playheadTitle', { key: 'D' })} onClick={() => p.onChangeTrack(sel.id, { tailEnd: time })}>
                {t('inspector.playhead')} <kbd>D</kbd>
              </button>
            </Prop>
          </Section>
        </div>
      )}
    </>
  )
}

function StyleTab({ project, onChangeSettings }: Props & { project: Project }) {
  const { t } = useTranslation()
  const s = project.settings
  const setTheme = (patch: Partial<Theme>) => onChangeSettings({ theme: { ...s.theme, ...patch } }, 'theme')
  return (
    <div className="scroll">
      <Section title={t('inspector.format')}>
        <Prop label={t('inspector.aspect')} title={t('inspector.aspectTitle')}>
          <div className="seg">
            <button className={s.height <= s.width ? 'on' : ''} onClick={() => s.height > s.width && onChangeSettings({ width: s.height, height: s.width })}>
              {t('inspector.landscape')}
            </button>
            <button className={s.height > s.width ? 'on' : ''} onClick={() => s.height <= s.width && onChangeSettings({ width: s.height, height: s.width })}>
              {t('inspector.portrait')}
            </button>
          </div>
        </Prop>
      </Section>
      <Section title={t('inspector.text')}>
        <Prop label={t('inspector.djName')}>
          <input value={s.djName} onChange={(e) => onChangeSettings({ djName: e.target.value }, 'dj')} placeholder={t('inspector.djNamePlaceholder')} />
        </Prop>
        <Prop label={t('inspector.setTitle')}>
          <input value={s.setTitle} onChange={(e) => onChangeSettings({ setTitle: e.target.value }, 'title')} placeholder={t('inspector.setTitlePlaceholder')} />
        </Prop>
        <Prop label={t('inspector.videoLanguage')} title={t('inspector.videoLanguageTitle')}>
          <select value={s.videoLanguage ?? 'en'} onChange={(e) => onChangeSettings({ videoLanguage: e.target.value as Locale })}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </Prop>
        <Prop label={t('inspector.clock')}>
          <label className="check">
            <input type="checkbox" checked={s.showTimestamps} onChange={(e) => onChangeSettings({ showTimestamps: e.target.checked })} />
            {t('inspector.showTime')}
          </label>
        </Prop>
      </Section>
      <Section title={t('inspector.waveforms')}>
        <Prop label={t('inspector.top')} title={t('inspector.topTitle')}>
          <div className="seg">
            <button className={s.showDeckWave ? 'on' : ''} onClick={() => onChangeSettings({ showDeckWave: true })}>
              {t('inspector.show')}
            </button>
            <button className={!s.showDeckWave ? 'on' : ''} onClick={() => onChangeSettings({ showDeckWave: false })}>
              {t('inspector.hide')}
            </button>
          </div>
          <span className="muted small">{t('inspector.topNote')}</span>
        </Prop>
        <Prop label={t('inspector.bottom')} title={t('inspector.bottomTitle')}>
          <div className="seg">
            <button className={s.showSetWave ? 'on' : ''} onClick={() => onChangeSettings({ showSetWave: true })}>
              {t('inspector.show')}
            </button>
            <button className={!s.showSetWave ? 'on' : ''} onClick={() => onChangeSettings({ showSetWave: false })}>
              {t('inspector.hide')}
            </button>
          </div>
          <span className="muted small">{t('inspector.bottomNote')}</span>
        </Prop>
      </Section>
      <Section title={t('inspector.colors')}>
        <Prop label={t('timeline.deckA')}>
          <input type="color" value={s.theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} />
          <span className="mono muted">{s.theme.accent}</span>
        </Prop>
        <Prop label={t('timeline.deckB')}>
          <input type="color" value={s.theme.accentB} onChange={(e) => setTheme({ accentB: e.target.value })} />
          <span className="mono muted">{s.theme.accentB}</span>
        </Prop>
        <Prop label={t('inspector.background')}>
          <input type="color" value={s.theme.background} onChange={(e) => setTheme({ background: e.target.value })} />
          <span className="mono muted">{s.theme.background}</span>
        </Prop>
      </Section>
      <Section title={t('inspector.transitions')}>
        <Prop label={t('inspector.lead')} title={t('inspector.leadTitle')}>
          <input type="range" min={0} max={120} step={5} value={s.defaultLead} onChange={(e) => onChangeSettings({ defaultLead: +e.target.value }, 'lead')} />
          <span className="mono val">{s.defaultLead}s</span>
        </Prop>
        <Prop label={t('inspector.curve')} title={t('inspector.curveTitle')}>
          <select value={s.swapCurve ?? 'auto'} onChange={(e) => onChangeSettings({ swapCurve: e.target.value as SwapCurve }, 'curve')}>
            {(['auto', 'smooth', 'snappy', 'anticipate', 'spring'] as const).map((c) => (
              <option key={c} value={c}>
                {t(`inspector.curves.${c}`)}
              </option>
            ))}
          </select>
        </Prop>
        {(s.swapCurve ?? 'auto') !== 'auto' && (
          <Prop label={t('inspector.swapTime')} title={t('inspector.swapTimeTitle')}>
            <input type="range" min={0.4} max={4} step={0.1} value={s.swapDuration} onChange={(e) => onChangeSettings({ swapDuration: +e.target.value }, 'swap')} />
            <span className="mono val">{s.swapDuration.toFixed(1)}s</span>
          </Prop>
        )}
      </Section>
    </div>
  )
}

function ProjectTab({ project, projectPath, onImportCue }: Props & { project: Project }) {
  const { t } = useTranslation()
  return (
    <div className="scroll">
      <Section title={t('inspector.projectFile')}>
        <Prop label={t('inspector.file')}>
          <span className="path" title={projectPath ?? ''}>
            {projectPath ? projectPath.split(/[\\/]/).pop() : t('inspector.notSavedYet')}
          </span>
          {projectPath && platform.features.reveal && (
            <button className="btn tiny ghost" onClick={() => platform.reveal(projectPath)}>
              {t('common.show')}
            </button>
          )}
        </Prop>
        <Prop label={t('inspector.location')}>
          <span className="path" title={projectPath ?? ''}>
            {projectPath?.replace(/[\\/][^\\/]*$/, '') ?? '—'}
          </span>
        </Prop>
        <Prop label={t('inspector.lastSaved')}>
          <span>{project.savedAt ? new Date(project.savedAt).toLocaleString(lang()) : '—'}</span>
        </Prop>
      </Section>
      <Section title={t('inspector.setRecording')}>
        <Prop label={t('inspector.audio')}>
          <span className="path" title={project.audioPath}>
            {project.audioName}
          </span>
          {platform.features.reveal && (
            <button className="btn tiny ghost" onClick={() => platform.reveal(project.audioPath)}>
              {t('common.show')}
            </button>
          )}
        </Prop>
        <Prop label={t('inspector.length')}>
          <span className="mono">{formatTime(project.duration, true)}</span>
        </Prop>
      </Section>
      <Section title={t('inspector.cue')}>
        {project.cue ? (
          <>
            <Prop label={t('inspector.file')}>
              <span className="path" title={project.cue.path}>
                {project.cue.name}
              </span>
            </Prop>
            <Prop label={t('inspector.imported')}>
              <span>{new Date(project.cue.importedAt).toLocaleString(lang())}</span>
            </Prop>
          </>
        ) : (
          <div className="muted small pad">{t('inspector.noCue')}</div>
        )}
        <div className="pad">
          <button className="btn small" onClick={onImportCue}>
            <Icon name="cue" size={12} /> {project.cue ? t('inspector.reimportCue') : t('inspector.importCue')}
          </button>
        </div>
      </Section>
    </div>
  )
}

const TABS: InspectorTab[] = ['tracks', 'style', 'project']

/** Right-hand panel: the tracklist and selected track, the video's look, and project details. */
export function Inspector(p: Props) {
  const { project } = p
  const { t } = useTranslation()
  return (
    <aside className="panel inspector">
      <div className="panel-tabs">
        {TABS.map((id) => (
          <button key={id} className={`panel-tab ${p.tab === id ? 'on' : ''}`} onClick={() => p.onTab(id)}>
            {t(`inspector.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {!project ? (
          <div className="empty">{t('inspector.empty')}</div>
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
