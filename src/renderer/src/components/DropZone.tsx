import { useState } from 'react'
import { api } from '../api'

const AUDIO = /\.(wav|mp3|flac|aiff?|m4a|aac|ogg|opus)$/i
const LIST = /\.(cue|txt|m3u8?|csv)$/i

interface Props {
  busy: { label: string; progress: number } | null
  error: string | null
  onFiles: (audio: string, tracklist: string | null) => void
  onOpenProject: (path?: string) => void
}

export function DropZone({ busy, error, onFiles, onOpenProject }: Props) {
  const [over, setOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f))
    const project = paths.find((p) => p.endsWith('.djvis'))
    if (project) return onOpenProject(project)
    const audio = paths.find((p) => AUDIO.test(p))
    if (audio) onFiles(audio, paths.find((p) => LIST.test(p)) ?? null)
  }

  const browse = async () => {
    const audio = await api.openAudioDialog()
    if (audio) onFiles(audio, null)
  }

  return (
    <div className="landing">
      <div className="landing-brand">
        <div className="logo-mark" />
        <h1>Set Visualizer</h1>
        <p>Turn a recorded DJ set into a video for YouTube: full-set waveform, track art, and smooth A/B transitions.</p>
      </div>
      <div
        className={`dropzone ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => !busy && browse()}
      >
        {busy ? (
          <div className="drop-busy">
            <div className="spinner" />
            <div>{busy.label}</div>
            <div className="bar">
              <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <div className="drop-icon">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0" />
              </svg>
            </div>
            <h2>Drop your set recording here</h2>
            <p>WAV, AIFF, FLAC, MP3 or M4A from Rekordbox. Drop a .cue / Rekordbox .txt / .m3u8 tracklist with it to place tracks automatically.</p>
            <button className="btn primary">Choose audio file</button>
          </>
        )}
      </div>
      {error && <div className="landing-error">{error}</div>}
      <button className="btn ghost" onClick={() => onOpenProject()}>
        Open a saved project (.djvis)
      </button>
    </div>
  )
}
