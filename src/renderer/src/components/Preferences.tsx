import { useState } from 'react'
import type { Preferences as Prefs } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { LOCALE_NAMES, LOCALES, type Locale } from '@shared/i18n'
import { platform } from '../platform'
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
  const { t } = useTranslation()
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal prefs-modal">
        <div className="modal-head">
          <h3>{t('prefs.title')}</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="prefs">
          <nav className="prefs-nav">
            <button className={page === 'general' ? 'on' : ''} onClick={() => setPage('general')}>
              {t('prefs.general')}
            </button>
            <button className={page === 'video' ? 'on' : ''} onClick={() => setPage('video')}>
              {t('prefs.newProjects')}
            </button>
          </nav>
          <div className="prefs-page">
            {page === 'general' ? (
              <>
                <h4>{t('prefs.language')}</h4>
                <select value={prefs.language ?? 'system'} onChange={(e) => onChange({ language: e.target.value as Locale | 'system' })}>
                  <option value="system">{t('prefs.languageSystem')}</option>
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_NAMES[l]}
                    </option>
                  ))}
                </select>
                <h4>{t('prefs.saving')}</h4>
                <label className="check">
                  <input type="checkbox" checked={prefs.autosave} onChange={(e) => onChange({ autosave: e.target.checked })} />
                  {t('prefs.autosave')}
                </label>
                <p className="muted small">{t('prefs.savingNoteWeb', { keys: platform.os === 'darwin' ? '⌘S' : 'Ctrl+S' })}</p>
                <div className="row">
                  <button
                    className="btn small ghost"
                    onClick={async () => {
                      // In the browser the recent list is where projects are kept.
                      if (!confirm(t('prefs.clearBrowserConfirm'))) return
                      await platform.clearRecent()
                      setCleared(true)
                    }}
                  >
                    {t(cleared ? 'prefs.browserCleared' : 'prefs.clearBrowser')}
                  </button>
                </div>
                <h4>{t('prefs.artwork')}</h4>
                <label className="check">
                  <input type="checkbox" checked={prefs.autoArtwork} onChange={(e) => onChange({ autoArtwork: e.target.checked })} />
                  {t('prefs.autoArtwork')}
                </label>
              </>
            ) : (
              <>
                <h4>{t('prefs.videoDefaults')}</h4>
                <label>
                  {t('export.resolution')}
                  <div className="seg">
                    {RESOLUTIONS.map((r) => (
                      <button key={r.label} className={prefs.defaultWidth === r.w && prefs.defaultHeight === r.h ? 'on' : ''} onClick={() => onChange({ defaultWidth: r.w, defaultHeight: r.h })}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  {t('export.frameRate')}
                  <div className="seg">
                    {[24, 30, 60].map((f) => (
                      <button key={f} className={prefs.defaultFps === f ? 'on' : ''} onClick={() => onChange({ defaultFps: f })}>
                        {t('common.fps', { fps: f })}
                      </button>
                    ))}
                  </div>
                </label>
                <p className="muted small">{t('prefs.videoDefaultsNote')}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
