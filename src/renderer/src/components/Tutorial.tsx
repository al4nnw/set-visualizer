import { useTranslation } from 'react-i18next'
import { shortcutLabel } from './MenuBar'

export interface TutorialStep {
  /** Key under tutorial.steps in the catalogs (title and text). */
  id: 'play' | 'jump' | 'seek' | 'pick' | 'mixIn' | 'takesOver' | 'playsUntil' | 'undo' | 'zoom'
  /** Key combos to show, in MenuBar's notation. */
  keys: string[]
  /** Menu command ids that complete the step when run (by key or from the menu). */
  accepts: string[]
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'play', keys: ['Space'], accepts: ['play', 'pause'] },
  { id: 'jump', keys: ['ArrowDown', 'ArrowUp'], accepts: ['nextTrack', 'previousTrack'] },
  { id: 'seek', keys: ['ArrowLeft', 'ArrowRight', 'Shift+ArrowRight'], accepts: ['back5', 'forward5', 'back30', 'forward30'] },
  { id: 'pick', keys: ['[', ']'], accepts: ['selectPrevious', 'selectNext'] },
  { id: 'mixIn', keys: ['A'], accepts: ['mixInAtPlayhead'] },
  { id: 'takesOver', keys: ['S'], accepts: ['takesOverAtPlayhead'] },
  { id: 'playsUntil', keys: ['D'], accepts: ['playsUntilAtPlayhead'] },
  { id: 'undo', keys: ['Mod+Z', 'Mod+Shift+Z'], accepts: ['undo', 'redo'] },
  { id: 'zoom', keys: ['=', '-', '\\'], accepts: ['zoomIn', 'zoomOut', 'fit'] }
]

interface Props {
  step: number
  done: boolean
  onNext: () => void
  onBack: () => void
  onClose: () => void
}

/** Floating coach card for the shortcuts tutorial. A step completes when its shortcut is used. */
export function TutorialCard({ step, done, onNext, onBack, onClose }: Props) {
  const { t } = useTranslation()
  const finished = step >= TUTORIAL_STEPS.length
  const st = TUTORIAL_STEPS[Math.min(step, TUTORIAL_STEPS.length - 1)]
  return (
    <div className="tutorial-card" role="dialog" aria-label={t('tutorial.title')}>
      <div className="tutorial-head">
        <span>{t('tutorial.title')}</span>
        <div className="grow" />
        <span className="muted small">{finished ? t('tutorial.done') : `${step + 1} / ${TUTORIAL_STEPS.length}`}</span>
      </div>
      {finished ? (
        <>
          <div className="tutorial-title">{t('tutorial.finishedTitle')}</div>
          <p className="tutorial-text">{t('tutorial.finishedText', { keys: shortcutLabel('Mod+/') })}</p>
        </>
      ) : (
        <>
          <div className={`tutorial-title ${done ? 'done' : ''}`}>
            {done ? '✓ ' : ''}
            {t(`tutorial.steps.${st.id}.title`)}
          </div>
          <p className="tutorial-text">{t(`tutorial.steps.${st.id}.text`)}</p>
          <div className="tutorial-keys">
            {st.keys.map((k) => (
              <kbd key={k}>{shortcutLabel(k)}</kbd>
            ))}
          </div>
        </>
      )}
      <div className="tutorial-dots">
        {TUTORIAL_STEPS.map((_, i) => (
          <span key={i} className={i < step ? 'past' : i === step ? 'now' : ''} />
        ))}
      </div>
      <div className="row">
        <button className="btn tiny ghost" onClick={onClose}>
          {finished ? t('tutorial.close') : t('tutorial.exit')}
        </button>
        <div className="grow" />
        {step > 0 && !finished && (
          <button className="btn tiny" onClick={onBack}>
            {t('tutorial.back')}
          </button>
        )}
        {finished ? (
          <button className="btn tiny primary" onClick={onClose}>
            {t('tutorial.finish')}
          </button>
        ) : (
          <button className="btn tiny" onClick={onNext}>
            {done ? t('tutorial.next') : t('tutorial.skip')}
          </button>
        )}
      </div>
    </div>
  )
}
