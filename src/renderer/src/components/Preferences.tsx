import { useState } from 'react'
import type { Preferences as Prefs } from '@shared/types'
import { api } from '../api'
import { RESOLUTIONS } from './ExportDialog'
import { Icon } from './icons'

interface Props {
  prefs: Prefs
  onChange: (patch: Partial<Prefs>) => void
  onClose: () => void
}

type Page = 'general' | 'video'

/** Settings dialog (Edit ▸ Settings…): app-wide options that aren't part of a project. */
export function PreferencesDialog({ prefs, onChange, onClose }: Props) {
  const [page, setPage] = useState<Page>('general')
  const [cleared, setCleared] = useState(false)
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal prefs-modal">
        <div className="modal-head">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="prefs">
          <nav className="prefs-nav">
            <button className={page === 'general' ? 'on' : ''} onClick={() => setPage('general')}>
              General
            </button>
            <button className={page === 'video' ? 'on' : ''} onClick={() => setPage('video')}>
              New projects
            </button>
          </nav>
          <div className="prefs-page">
            {page === 'general' ? (
              <>
                <h4>Saving</h4>
                <label className="check">
                  <input type="checkbox" checked={prefs.autosave} onChange={(e) => onChange({ autosave: e.target.checked })} />
                  Autosave: save the project after every change
                </label>
                <p className="muted small">
                  Opening a set recording creates its project file right away, and importing its Rekordbox .cue is saved into it. With autosave off, use File ▸ Save
                  ({api.platform === 'darwin' ? '⌘' : 'Ctrl+'}S).
                </p>
                <label>
                  Projects folder
                  <div className="row">
                    <input className="grow" readOnly value={prefs.projectsDir} title={prefs.projectsDir} />
                    <button
                      className="btn small"
                      onClick={async () => {
                        const dir = await api.chooseFolder(prefs.projectsDir)
                        if (dir) onChange({ projectsDir: dir })
                      }}
                    >
                      Change…
                    </button>
                  </div>
                </label>
                <div className="row">
                  <button className="btn small" onClick={() => api.reveal(prefs.projectsDir)}>
                    <Icon name="folder" size={12} /> Show folder
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={async () => {
                      await api.clearRecent()
                      setCleared(true)
                    }}
                  >
                    {cleared ? 'Recent list cleared' : 'Clear recent projects'}
                  </button>
                </div>
                <h4>Artwork</h4>
                <label className="check">
                  <input type="checkbox" checked={prefs.autoArtwork} onChange={(e) => onChange({ autoArtwork: e.target.checked })} />
                  Look up YouTube thumbnails for tracks imported from a .cue
                </label>
              </>
            ) : (
              <>
                <h4>Video settings for new projects</h4>
                <label>
                  Resolution
                  <div className="seg">
                    {RESOLUTIONS.map((r) => (
                      <button key={r.label} className={prefs.defaultWidth === r.w && prefs.defaultHeight === r.h ? 'on' : ''} onClick={() => onChange({ defaultWidth: r.w, defaultHeight: r.h })}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  Frame rate
                  <div className="seg">
                    {[24, 30, 60].map((f) => (
                      <button key={f} className={prefs.defaultFps === f ? 'on' : ''} onClick={() => onChange({ defaultFps: f })}>
                        {f} fps
                      </button>
                    ))}
                  </div>
                </label>
                <p className="muted small">Each project keeps its own settings; change them for the open project in File ▸ Export Video.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
