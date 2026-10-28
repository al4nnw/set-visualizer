import { shortcutLabel } from './MenuBar'

export interface TutorialStep {
  title: string
  text: string
  /** Key combos to show, in MenuBar's notation. */
  keys: string[]
  /** Menu item labels that complete the step when run (by key or from the menu). */
  accepts: string[]
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { title: 'Play the set', text: 'Start and stop playback. The preview shows exactly what the exported video will look like.', keys: ['Space'], accepts: ['Play', 'Pause'] },
  { title: 'Jump between tracks', text: 'Jump to where the next track takes over, or back to the previous one.', keys: ['ArrowDown', 'ArrowUp'], accepts: ['Next Track', 'Previous Track'] },
  {
    title: 'Seek',
    text: 'Move the playhead 5 seconds, or 30 with Shift. Home and End go to the start and end.',
    keys: ['ArrowLeft', 'ArrowRight', 'Shift+ArrowRight'],
    accepts: ['Back 5 Seconds', 'Forward 5 Seconds', 'Back 30 Seconds', 'Forward 30 Seconds']
  },
  { title: 'Pick a track', text: 'Select the previous or next track in the list. Its timing shows in the inspector on the right.', keys: ['[', ']'], accepts: ['Select Previous Track', 'Select Next Track'] },
  {
    title: 'Mix in',
    text: 'Play up to where you start hearing the next track and press I. Its card appears on the right from there. With no track selected, I goes to the next track to take over.',
    keys: ['I'],
    accepts: ['Mix In at Playhead']
  },
  {
    title: 'Takes over',
    text: 'Press T where the new track becomes the main one. Its card slides to the left there.',
    keys: ['T'],
    accepts: ['Takes Over at Playhead']
  },
  {
    title: 'Plays until',
    text: 'If the old track keeps playing underneath, press O where it fades out. It stays on the right as "now playing" until then.',
    keys: ['O'],
    accepts: ['Plays Until at Playhead']
  },
  { title: 'Undo', text: 'Every change can be undone and redone.', keys: ['Mod+Z', 'Mod+Shift+Z'], accepts: ['Undo', 'Redo'] },
  { title: 'Zoom the timeline', text: 'Zoom in and out around the playhead, or fit the whole set.', keys: ['=', '-', '\\'], accepts: ['Zoom In', 'Zoom Out', 'Fit Set to Timeline'] }
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
  const finished = step >= TUTORIAL_STEPS.length
  const st = TUTORIAL_STEPS[Math.min(step, TUTORIAL_STEPS.length - 1)]
  return (
    <div className="tutorial-card" role="dialog" aria-label="Shortcuts tutorial">
      <div className="tutorial-head">
        <span>Shortcuts tutorial</span>
        <div className="grow" />
        <span className="muted small">{finished ? 'Done' : `${step + 1} / ${TUTORIAL_STEPS.length}`}</span>
      </div>
      {finished ? (
        <>
          <div className="tutorial-title">You're set</div>
          <p className="tutorial-text">
            That's the whole workflow: I, T and O at the playhead for each transition. Every shortcut is listed in Help ▸ Keyboard Shortcuts ({shortcutLabel('Mod+/')}) and
            next to each menu item.
          </p>
        </>
      ) : (
        <>
          <div className={`tutorial-title ${done ? 'done' : ''}`}>
            {done ? '✓ ' : ''}
            {st.title}
          </div>
          <p className="tutorial-text">{st.text}</p>
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
          {finished ? 'Close' : 'Exit tutorial'}
        </button>
        <div className="grow" />
        {step > 0 && !finished && (
          <button className="btn tiny" onClick={onBack}>
            Back
          </button>
        )}
        {finished ? (
          <button className="btn tiny primary" onClick={onClose}>
            Finish
          </button>
        ) : (
          <button className="btn tiny" onClick={onNext}>
            {done ? 'Next' : 'Skip'}
          </button>
        )}
      </div>
    </div>
  )
}
