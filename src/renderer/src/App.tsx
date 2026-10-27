import { useCallback, useEffect, useRef, useState } from 'react'
import { alternateDecks, formatTime, sortTracks } from '@shared/layout'
import { entriesToTracks, newId, placeTakeovers, sameSong } from '@shared/tracklist'
import type { ParsedEntry } from '@shared/tracklist'
import { DEFAULT_SETTINGS, type IdentifyHit, type Project, type RenderSettings, type Track } from '@shared/types'
import { api, errMsg, mediaUrl } from './api'
import { DropZone } from './components/DropZone'
import { ExportDialog } from './components/ExportDialog'
import { IdentifyDialog } from './components/IdentifyDialog'
import { Preview } from './components/Preview'
import { SearchDialog } from './components/SearchDialog'
import { Sidebar } from './components/Sidebar'
import { Timeline } from './components/Timeline'
import { useHistory } from './useHistory'

type Dialog = { kind: 'search'; trackId: string } | { kind: 'identify' } | { kind: 'export' } | null

export function App() {
  const { state: project, set, reset, undo, redo } = useHistory<Project | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000)
  }, [])

  const update = useCallback(
    (fn: (p: Project) => Project, mergeKey?: string, skipHistory = false) => {
      set((p) => (p ? fn(p) : p), { mergeKey, skipHistory })
      setDirty(true)
    },
    [set]
  )

  const changeTrack = useCallback(
    (id: string, patch: Partial<Track>, mergeKey?: string) =>
      update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), mergeKey),
    [update]
  )

  const changeSettings = useCallback(
    (patch: Partial<RenderSettings>, mergeKey?: string) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }), mergeKey),
    [update]
  )

  /** Downloads artwork for tracks in the background without adding undo steps. */
  const fetchArtworkFor = useCallback(
    (items: Array<{ id: string; url: string }>) => {
      for (const it of items) {
        api
          .downloadArt(it.url)
          .then((artwork) => update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === it.id && !t.artwork ? { ...t, artwork } : t)) }), undefined, true))
          .catch(() => {})
      }
    },
    [update]
  )

  // ---- loading ---------------------------------------------------------------------------
  const withTakeovers = (entries: ParsedEntry[], audioPath: string, duration: number, onDetect: () => void) =>
    placeTakeovers(entries, (cues) => {
      onDetect()
      return api.detectTakeovers(audioPath, cues, duration)
    })

  const loadAudio = async (audioPath: string, tracklistPath: string | null) => {
    setError(null)
    setBusy({ label: 'Reading audio and building the waveform…', progress: 0 })
    const off = api.onAudioProgress((p) => setBusy((b) => (b ? { ...b, progress: p } : b)))
    try {
      const { duration, waveform, name } = await api.analyseAudio(audioPath)
      let tracks: Track[] = []
      if (tracklistPath) {
        const entries = await withTakeovers(await api.parseTracklist(tracklistPath), audioPath, duration, () =>
          setBusy({ label: 'Finding where each track takes over…', progress: 1 })
        )
        tracks = entriesToTracks(entries, duration)
      }
      reset({
        version: 1,
        audioPath,
        audioName: name,
        duration,
        waveform,
        tracks,
        settings: { ...DEFAULT_SETTINGS, setTitle: name.replace(/\.[^.]+$/, '') }
      })
      setProjectPath(null)
      setDirty(true)
      setTime(0)
      if (tracklistPath) showToast(`Imported ${tracks.length} tracks from the tracklist`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      off()
      setBusy(null)
    }
  }

  const openProject = async (path?: string) => {
    try {
      const r = await api.openProject(path)
      if (!r) return
      reset({ ...r.project, settings: { ...DEFAULT_SETTINGS, ...r.project.settings } })
      setProjectPath(r.path)
      setDirty(false)
      setTime(0)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const save = useCallback(async () => {
    if (!project) return
    try {
      const p = await api.saveProject(project, projectPath)
      if (p) {
        setProjectPath(p)
        setDirty(false)
        showToast('Project saved')
      }
    } catch (e) {
      showToast(`Couldn't save: ${errMsg(e)}`)
    }
  }, [project, projectPath, showToast])

  const importTracklist = async () => {
    if (!project) return
    const path = await api.openTracklistDialog()
    if (!path) return
    try {
      const entries = await api.parseTracklist(path)
      if (!entries.length) return showToast('No tracks found in that file')
      const placed = await withTakeovers(entries, project.audioPath, project.duration, () => showToast('Finding where each track takes over…'))
      const tracks = entriesToTracks(placed, project.duration)
      update((p) => ({ ...p, tracks }))
      const timed = entries.every((e) => e.start !== undefined)
      showToast(timed ? `Imported ${tracks.length} tracks` : `Imported ${tracks.length} tracks. The file has no times, so they're spread evenly: drag them into place.`)
    } catch (e) {
      showToast(errMsg(e))
    }
  }

  const applyHits = (hits: Array<IdentifyHit & { count: number }>, mode: 'replace' | 'add') => {
    if (!project) return
    const fresh = hits
      .filter((h) => mode === 'replace' || !project.tracks.some((t) => sameSong(t, h)))
      .map((h) => ({ id: newId(), title: h.title, artist: h.artist, start: Math.max(0, Math.round(h.at)), deck: 'A' as const, unverified: true, sourceUrl: h.url, source: 'AudD', art: h.artwork }))
    const tracks = alternateDecks([...(mode === 'replace' ? [] : project.tracks), ...fresh.map(({ art: _a, ...t }) => t)])
    update((p) => ({ ...p, tracks }))
    fetchArtworkFor(fresh.filter((f) => f.art).map((f) => ({ id: f.id, url: f.art! })))
    setDialog(null)
    showToast(`${fresh.length} tracks added. Check the times: each one starts where it was first recognised.`)
  }

  const openPathRef = useRef<(path: string) => void>(() => {})
  openPathRef.current = (path: string) => (path.endsWith('.djvis') ? openProject(path) : loadAudio(path, null))
  useEffect(() => api.onOpenPath((p) => openPathRef.current(p)), [])

  // ---- playback ----------------------------------------------------------------------------
  useEffect(() => {
    if (!audioEl || !playing) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      if (now - last > 66) {
        last = now
        setTime(audioEl.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audioEl, playing])

  const seek = useCallback(
    (t: number) => {
      setTime(t)
      if (audioEl) audioEl.currentTime = t
    },
    [audioEl]
  )

  const togglePlay = useCallback(() => {
    if (!audioEl) return
    if (audioEl.paused) audioEl.play().catch((e) => showToast(`Can't play this file: ${errMsg(e)}`))
    else audioEl.pause()
  }, [audioEl, showToast])

  const jumpTrack = (dir: 1 | -1) => {
    if (!project) return
    const starts = sortTracks(project.tracks).map((t) => t.start)
    const target = dir > 0 ? starts.find((s) => s > time + 0.5) : [...starts].reverse().find((s) => s < time - 2)
    seek(target ?? (dir > 0 ? project.duration : 0))
  }

  const addTrack = () => {
    const id = newId()
    update((p) => ({ ...p, tracks: alternateDecks([...p.tracks, { id, title: '', artist: '', start: time, deck: 'A' }]) }))
    setSelectedId(id)
  }

  const deleteTrack = useCallback(
    (id: string) => {
      update((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== id) }))
      setSelectedId(null)
    },
    [update]
  )

  // ---- keyboard ------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault()
        redo()
      } else if (typing || dialog) {
        return
      } else if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') seek(Math.max(0, time - (e.shiftKey ? 30 : 5)))
      else if (e.key === 'ArrowRight') seek(time + (e.shiftKey ? 30 : 5))
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) deleteTrack(selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, undo, redo, togglePlay, seek, time, dialog, selectedId, deleteTrack])

  useEffect(() => {
    document.title = project ? `${dirty ? '• ' : ''}${project.audioName} — Set Visualizer` : 'Set Visualizer'
  }, [project, dirty])

  if (!project) return <DropZone busy={busy} error={error} onFiles={loadAudio} onOpenProject={openProject} />

  const searchTrack = dialog?.kind === 'search' ? project.tracks.find((t) => t.id === dialog.trackId) : undefined

  return (
    <div className={`app ${api.platform === 'darwin' ? 'mac' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo-mark small" />
          <span>Set Visualizer</span>
        </div>
        <div className="file-name" title={project.audioPath}>
          {project.audioName}
          {dirty && <span className="dot" />}
        </div>
        <div className="grow" />
        <button className="btn ghost" onClick={() => (!dirty || confirm('Discard unsaved changes?')) && reset(null)}>
          New
        </button>
        <button className="btn ghost" onClick={importTracklist}>
          Import tracklist
        </button>
        <button className="btn" onClick={() => setDialog({ kind: 'identify' })}>
          Identify tracks
        </button>
        <button className="btn" onClick={save}>
          Save
        </button>
        <button className="btn primary" onClick={() => setDialog({ kind: 'export' })}>
          Export video
        </button>
      </header>

      <main className="workspace">
        <section className="stage">
          <Preview project={project} audio={audioEl} time={time} />
          <div className="transport">
            <button className="icon-btn" onClick={() => jumpTrack(-1)} title="Previous track">
              ⏮
            </button>
            <button className="play-btn" onClick={togglePlay} title="Play / pause (space)">
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="icon-btn" onClick={() => jumpTrack(1)} title="Next track">
              ⏭
            </button>
            <div className="clock">
              {formatTime(time, project.duration >= 3600)} <span className="muted">/ {formatTime(project.duration)}</span>
            </div>
            <div className="grow" />
            <span className="muted small hint">Space play · ←/→ seek · ⌘/Ctrl+Z undo</span>
          </div>
        </section>
        <Sidebar
          project={project}
          time={time}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          onChangeTrack={changeTrack}
          onDelete={deleteTrack}
          onAdd={addTrack}
          onSearch={(id) => setDialog({ kind: 'search', trackId: id })}
          onAlternateDecks={() => update((p) => ({ ...p, tracks: alternateDecks(p.tracks) }))}
        />
      </main>

      <footer className="timeline-wrap">
        <Timeline project={project} time={time} playing={playing} selectedId={selectedId} onSeek={seek} onSelect={setSelectedId} onChangeTrack={changeTrack} />
      </footer>

      <audio
        ref={setAudioEl}
        src={mediaUrl(project.audioPath)}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onSeeked={(e) => setTime(e.currentTarget.currentTime)}
        onError={() => showToast("Can't play the audio file. Was it moved or renamed?")}
      />

      {searchTrack && <SearchDialog track={searchTrack} onClose={() => setDialog(null)} onApply={(patch) => changeTrack(searchTrack.id, patch)} />}
      {dialog?.kind === 'identify' && <IdentifyDialog project={project} onClose={() => setDialog(null)} onApply={applyHits} />}
      {dialog?.kind === 'export' && <ExportDialog project={project} onClose={() => setDialog(null)} onChangeSettings={changeSettings} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
