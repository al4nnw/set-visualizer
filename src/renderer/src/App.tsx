import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { suggestClips, type ClipSuggestion } from '@shared/clips'
import { alternateDecks, currentIndex, formatTime, mainTracks, sortTracks } from '@shared/layout'
import { buildMotion } from '@shared/motion'
import { entriesToTracks, newId, placeTakeovers } from '@shared/tracklist'
import type { ParsedEntry } from '@shared/tracklist'
import { DEFAULT_SETTINGS, forDisk, type Preferences, type Project, type RecentProject, type RenderSettings, type Track } from '@shared/types'
import { api, errMsg, mediaUrl } from './api'
import { ExportDialog } from './components/ExportDialog'
import type { ClipFormat } from './components/Clips'
import { Icon } from './components/icons'
import { Inspector, type InspectorTab } from './components/Inspector'
import { flatten, keysLabel, matches, MenuBar, shortcutLabel, type Menu, type MenuItem } from './components/MenuBar'
import { TutorialCard, TUTORIAL_STEPS } from './components/Tutorial'
import { PreferencesDialog } from './components/Preferences'
import { SearchDialog } from './components/SearchDialog'
import { Splitter, useStoredNumber } from './components/Splitter'
import { EmptyTimeline, Timeline, type TimelineHandle } from './components/Timeline'
import { Viewer } from './components/Viewer'
import { useHistory } from './useHistory'

type Dialog = { kind: 'search'; trackId: string } | { kind: 'export' } | { kind: 'prefs' } | { kind: 'shortcuts' } | { kind: 'about' } | { kind: 'noTutorial' } | null
type SaveState = { status: 'saved' | 'saving' | 'edited' | 'error'; message?: string }

const AUDIO = /\.(wav|mp3|flac|aiff?|m4a|aac|ogg|opus)$/i
const CUE = /\.cue$/i
const PROJECT = /\.djvis$/i
const AUTOSAVE_DELAY = 800
const INSPECTOR_W = 360
const TIMELINE_H = 250

export function App() {
  const { state: project, set, reset, undo, redo } = useHistory<Project | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'saved' })
  const [prefs, setPrefsState] = useState<Preferences | null>(null)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<InspectorTab>('tracks')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loop, setLoop] = useState<ClipSuggestion | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const [clipFormat, setClipFormat] = useState<ClipFormat>('portrait')
  // A clip belongs to the set it came from.
  useEffect(() => setLoop(null), [project?.audioPath])
  const [inspectorW, setInspectorW] = useStoredNumber('layout.inspectorWidth', INSPECTOR_W)
  const [timelineH, setTimelineH] = useStoredNumber('layout.timelineHeight', TIMELINE_H)
  const timelineRef = useRef<TimelineHandle>(null)
  const [tutorial, setTutorial] = useState<{ step: number; done: boolean } | null>(null)
  const tutorialRef = useRef(tutorial)
  tutorialRef.current = tutorial

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000)
  }, [])

  const refreshRecent = useCallback(() => {
    api.recentProjects().then(setRecent, () => {})
  }, [])

  useEffect(() => {
    api.getPrefs().then(setPrefsState, () => {})
    refreshRecent()
  }, [refreshRecent])

  const changePrefs = async (patch: Partial<Preferences>) => setPrefsState(await api.setPrefs(patch))

  // ---- saving ----------------------------------------------------------------------------
  // Each edit bumps `rev`; a save only clears `dirty` if nothing changed while it was writing.
  const rev = useRef(0)
  const latest = useRef<{ project: Project | null; path: string | null }>({ project: null, path: null })
  latest.current = { project, path: projectPath }
  const saving = useRef<Promise<void> | null>(null)

  const markDirty = useCallback(() => {
    rev.current++
    setDirty(true)
    setSaveState((s) => (s.status === 'saving' ? s : { status: 'edited' }))
  }, [])

  const update = useCallback(
    (fn: (p: Project) => Project, mergeKey?: string, skipHistory = false) => {
      set((p) => (p ? fn(p) : p), { mergeKey, skipHistory })
      markDirty()
    },
    [set, markDirty]
  )

  /** Writes the current project to its file. Runs one save at a time and re-saves if edits came in meanwhile. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    while (saving.current) await saving.current
    const { project: p, path } = latest.current
    if (!p || !path) return false
    const at = rev.current
    setSaveState({ status: 'saving' })
    let ok = true
    saving.current = api
      .saveProject(forDisk(p), path)
      .then(({ savedAt }) => {
        if (rev.current === at) {
          setDirty(false)
          setSaveState({ status: 'saved' })
        } else setSaveState({ status: 'edited' })
        // Keep savedAt in memory without making it an undo step or another edit.
        set((cur) => (cur ? { ...cur, savedAt } : cur), { skipHistory: true })
      })
      .catch((e) => {
        ok = false
        setSaveState({ status: 'error', message: errMsg(e) })
      })
      .finally(() => (saving.current = null))
    await saving.current
    return ok
  }, [set])

  useEffect(() => {
    if (!dirty || !projectPath || !prefs?.autosave || saveState.status === 'saving') return
    const t = setTimeout(() => void saveNow(), AUTOSAVE_DELAY)
    return () => clearTimeout(t)
  }, [project, dirty, projectPath, prefs?.autosave, saveState.status, saveNow])

  /** Before replacing or closing the project: flush autosave, or ask about unsaved edits. */
  const settle = useCallback(async (): Promise<boolean> => {
    if (!latest.current.project || !dirty || tutorialRef.current) return true
    if (prefs?.autosave && latest.current.path) return (await saveNow()) || confirm('The project could not be saved. Continue anyway?')
    return confirm('This project has unsaved changes. Discard them?')
  }, [dirty, prefs?.autosave, saveNow])

  const saveAs = useCallback(async () => {
    if (!project) return
    try {
      const r = await api.saveProjectAs(forDisk(project), projectPath)
      if (!r) return
      setProjectPath(r.path)
      setDirty(false)
      setSaveState({ status: 'saved' })
      showToast(`Saved as ${r.path.split(/[\\/]/).pop()}`)
      refreshRecent()
    } catch (e) {
      showToast(`Couldn't save: ${errMsg(e)}`)
    }
  }, [project, projectPath, showToast, refreshRecent])

  const save = useCallback(async () => {
    if (!project) return
    if (!projectPath) return saveAs()
    if (await saveNow()) showToast('Project saved')
  }, [project, projectPath, saveAs, saveNow, showToast])

  useEffect(
    () =>
      api.onBeforeClose(async () => {
        if (await settle()) api.closeOk()
      }),
    [settle]
  )

  // ---- tracks ------------------------------------------------------------------------------
  const changeTrack = useCallback(
    (id: string, patch: Partial<Track>, mergeKey?: string) =>
      update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), mergeKey),
    [update]
  )

  const changeSettings = useCallback(
    (patch: Partial<RenderSettings>, mergeKey?: string) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }), mergeKey),
    [update]
  )

  /**
   * Looks each track without artwork up on YouTube and uses the best match's thumbnail (cached on
   * disk per song). Runs in the background, two at a time; any image can still be replaced from the
   * inspector.
   */
  const autoArtwork = useCallback(
    async (tracks: Track[]) => {
      const queue = tracks.filter((t) => !t.artwork && (t.title || t.artist))
      const worker = async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          try {
            const found = await api.autoArtwork(t.artist, t.title)
            if (!found) continue
            const { artwork, url } = found
            const id = t.id
            update(
              (p) => ({
                ...p,
                tracks: p.tracks.map((x) => (x.id === id && !x.artwork ? { ...x, artwork, sourceUrl: x.sourceUrl ?? url, source: x.source ?? 'YouTube' } : x))
              }),
              undefined,
              true
            )
          } catch {
            // No match or offline: leave it for the user.
          }
        }
      }
      await Promise.all([worker(), worker()])
    },
    [update]
  )

  // ---- loading ---------------------------------------------------------------------------
  const withTakeovers = (entries: ParsedEntry[], audioPath: string, duration: number, onDetect: () => void) =>
    placeTakeovers(entries, (cues, songs) => {
      onDetect()
      return api.detectTakeovers(audioPath, cues, duration, songs)
    })

  /** Reads a Rekordbox cue sheet and places its tracks, ready to store in the project. */
  const readCue = async (cuePath: string, audioPath: string, duration: number, onDetect: () => void) => {
    const { entries, text, name } = await api.readCue(cuePath)
    if (!entries.length) throw new Error(`No tracks found in ${name}`)
    const tracks = entriesToTracks(await withTakeovers(entries, audioPath, duration, onDetect), duration)
    return { tracks, cue: { path: cuePath, name, text, importedAt: new Date().toISOString() } }
  }

  // Each load bumps this; a load that finds it changed was replaced by opening something else.
  const loadGen = useRef(0)
  const cancelLoad = () => {
    loadGen.current++
    setBusy(null)
    return api.cancelAnalysis()
  }

  /**
   * Opening a set recording starts a new project, saved straight away into the projects folder.
   * The analysis runs in a worker, so the editor stays usable; opening something else cancels it.
   */
  const loadAudio = async (audioPath: string, cuePath: string | null, opts: { tutorial?: boolean } = {}) => {
    if (!(await settle())) return false
    await cancelLoad()
    const gen = loadGen.current
    const stale = () => gen !== loadGen.current
    setError(null)
    setBusy({ label: 'Reading audio and building the waveform…', progress: 0 })
    const off = api.onAudioProgress((p) => setBusy((b) => (b ? { ...b, progress: p } : b)))
    try {
      const { duration, waveform, name } = await api.analyseAudio(audioPath)
      if (stale()) return false
      const fromCue = cuePath ? await readCue(cuePath, audioPath, duration, () => !stale() && setBusy({ label: 'Finding where each track takes over…', progress: 1 })) : null
      if (stale()) return false
      const p = prefs ?? (await api.getPrefs())
      const fresh: Project = {
        version: 1,
        audioPath,
        audioName: name,
        duration,
        waveform,
        tracks: fromCue?.tracks ?? [],
        cue: fromCue?.cue,
        createdAt: new Date().toISOString(),
        settings: { ...DEFAULT_SETTINGS, width: p.defaultWidth, height: p.defaultHeight, fps: p.defaultFps, setTitle: opts.tutorial ? 'Shortcuts tutorial' : name.replace(/\.[^.]+$/, '') }
      }
      // The tutorial works on a throwaway project: no file, nothing to save.
      const saved = opts.tutorial
        ? null
        : await api.createProject(forDisk(fresh)).catch((e) => {
            showToast(`Couldn't create the project file: ${errMsg(e)}. Use File ▸ Save As.`)
            return null
          })
      reset({ ...fresh, savedAt: saved?.savedAt })
      setProjectPath(saved?.path ?? null)
      setDirty(!saved && !opts.tutorial)
      setSaveState(saved || opts.tutorial ? { status: 'saved' } : { status: 'edited' })
      setTutorial(opts.tutorial ? { step: 0, done: false } : null)
      setSelectedId(null)
      setTime(0)
      refreshRecent()
      if (fromCue) {
        if (!opts.tutorial) showToast(`Imported ${fromCue.tracks.length} tracks from ${fromCue.cue.name}`)
        if (p.autoArtwork) void autoArtwork(fromCue.tracks)
      } else if (saved) showToast(`New project ${saved.path.split(/[\\/]/).pop()}. Import the Rekordbox .cue next.`)
      return true
    } catch (e) {
      if (!stale()) setError(errMsg(e))
      return false
    } finally {
      off()
      if (!stale()) setBusy(null)
    }
  }

  const openProject = async (path?: string) => {
    if (!(await settle())) return
    // Shown only when the set has to be analysed again (no cached waveform on this computer).
    let analysing = false
    const off = api.onAudioProgress((p) => {
      analysing = true
      setBusy({ label: 'Analysing the set recording…', progress: p })
    })
    try {
      const r = await api.openProject(path)
      if (!r) return
      await cancelLoad()
      reset({ ...r.project, settings: { ...DEFAULT_SETTINGS, ...r.project.settings } })
      setTutorial(null)
      // Projects from before the vocal band was analysed: add it in the background so the cards
      // can follow the vocals where there's no bass.
      if (!r.project.waveform.vocal) {
        const path = r.path
        api
          .analyseAudio(r.project.audioPath)
          .then(({ waveform }) => latest.current.path === path && update((p) => ({ ...p, waveform }), undefined, true))
          .catch(() => {})
      }
      setProjectPath(r.path)
      setDirty(false)
      setSaveState({ status: 'saved' })
      setSelectedId(null)
      setTime(0)
      setError(null)
    } catch (e) {
      const msg = errMsg(e)
      if (project) showToast(msg)
      else setError(msg)
    } finally {
      off()
      if (analysing) setBusy(null)
      refreshRecent()
    }
  }

  const newProject = async () => {
    if (!(await settle())) return
    setTutorial(null)
    reset(null)
    setProjectPath(null)
    setDirty(false)
    setSaveState({ status: 'saved' })
    setSelectedId(null)
    setError(null)
    refreshRecent()
  }

  /** One picker for everything that starts work: a recording (optionally with its .cue) or a project. */
  const openAny = async () => {
    const paths = await api.openAnyDialog()
    if (paths.length) openPaths(paths)
  }

  /** Importing a cue sheet replaces the tracklist and records the cue in the project file. */
  const importCue = async (path?: string) => {
    if (!project) return showToast('Open the set recording first, then import its .cue')
    const cuePath = path ?? (await api.openTracklistDialog())
    if (!cuePath) return
    if (project.tracks.length && !confirm('Replace the current tracklist with the tracks from this .cue?')) return
    try {
      const { tracks, cue } = await readCue(cuePath, project.audioPath, project.duration, () => showToast('Finding where each track takes over…'))
      update((p) => ({ ...p, tracks, cue }))
      setSelectedId(null)
      setTab('tracks')
      if (prefs?.autoArtwork !== false) void autoArtwork(tracks)
      showToast(`Imported ${tracks.length} tracks from ${cue.name}`)
    } catch (e) {
      showToast(errMsg(e))
    }
  }

  const openPaths = (paths: string[]) => {
    const proj = paths.find((p) => PROJECT.test(p))
    if (proj) return void openProject(proj)
    const audio = paths.find((p) => AUDIO.test(p))
    const cue = paths.find((p) => CUE.test(p)) ?? null
    if (audio) return void loadAudio(audio, cue)
    if (cue) return void importCue(cue)
    showToast('Drop a set recording, a Rekordbox .cue or a .djvis project')
  }

  const openPathRef = useRef<(path: string) => void>(() => {})
  openPathRef.current = (path: string) => openPaths([path])
  useEffect(() => api.onOpenPath((p) => openPathRef.current(p)), [])

  // ---- playback ----------------------------------------------------------------------------
  useEffect(() => {
    if (!audioEl || !playing) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      // A playing clip loops: back to its start at its end.
      const l = loopRef.current
      if (l && audioEl.currentTime >= l.to) audioEl.currentTime = l.from
      if (now - last > 66) {
        last = now
        setTime(audioEl.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audioEl, playing])

  // Clips are found again whenever the tracklist or the audio changes; it's a few ms, nothing is rendered.
  const clips = useMemo(
    () => (project?.tracks.length ? suggestClips(project.tracks, project.duration, buildMotion(project.waveform)) : []),
    [project?.tracks, project?.duration, project?.waveform]
  )

  const seek = useCallback(
    (t: number) => {
      const c = Math.max(0, Math.min(project?.duration ?? 0, t))
      // Seeking out of a looping clip ends the loop.
      const l = loopRef.current
      if (l && (c < l.from - 0.5 || c > l.to + 0.5)) setLoop(null)
      setTime(c)
      if (audioEl) audioEl.currentTime = c
    },
    [audioEl, project?.duration]
  )

  const togglePlay = useCallback(() => {
    if (!audioEl) return
    if (audioEl.paused) audioEl.play().catch((e) => showToast(`Can't play this file: ${errMsg(e)}`))
    else audioEl.pause()
  }, [audioEl, showToast])

  const playClip = (c: ClipSuggestion) => {
    setLoop(c)
    loopRef.current = c
    seek(c.from)
    audioEl?.play().catch((e) => showToast(`Can't play this file: ${errMsg(e)}`))
  }

  const jumpTrack = (dir: 1 | -1) => {
    if (!project) return
    const starts = mainTracks(project.tracks).map((t) => t.start)
    const target = dir > 0 ? starts.find((s) => s > time + 0.5) : [...starts].reverse().find((s) => s < time - 2)
    seek(target ?? (dir > 0 ? project.duration : 0))
  }

  const addTrack = () => {
    if (!project) return
    const id = newId()
    update((p) => ({ ...p, tracks: alternateDecks([...p.tracks, { id, title: '', artist: '', start: time, deck: 'A' }]) }))
    setSelectedId(id)
    setTab('tracks')
  }

  const deleteTrack = useCallback(
    (id: string) => {
      update((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== id) }))
      setSelectedId(null)
    },
    [update]
  )

  // ---- timing at the playhead ----------------------------------------------------------------
  type TimingField = 'start' | 'mixIn' | 'tailEnd'
  const TIMING_LABEL: Record<TimingField, string> = { start: 'Takes over', mixIn: 'Mix in', tailEnd: 'Plays until' }

  /**
   * The track a timing key applies to: the selected one, or else the one it most likely means at the
   * playhead. Mix in / takes over go to the next track to take over (the closest one for takes over),
   * plays until goes to the track that was just replaced.
   */
  const timingTarget = (field: TimingField): Track | undefined => {
    if (!project) return
    const main = mainTracks(project.tracks)
    const ci = currentIndex(main, time)
    const sel = project.tracks.find((t) => t.id === selectedId)
    // "Plays until" only means something once the next track has taken over, so on the track that is
    // main at the playhead it goes to the one it just replaced.
    if (sel && field === 'tailEnd' && main[ci]?.id === sel.id && ci > 0) return main[ci - 1]
    if (sel) return sel
    if (!main.length) return
    if (field === 'tailEnd') return main[Math.max(0, ci - 1)]
    if (field === 'start') return main.slice(1).reduce((best, t) => (Math.abs(t.start - time) < Math.abs(best.start - time) ? t : best), main[Math.min(1, main.length - 1)])
    return main.find((t) => t.start > time) ?? main[main.length - 1]
  }

  const setTimingAtPlayhead = (field: TimingField, clear = false) => {
    const tr = timingTarget(field)
    if (!tr) return showToast('Import the Rekordbox .cue first')
    const name = tr.title || 'Untitled'
    const at = formatTime(time, project!.duration >= 3600)
    let patch: Partial<Track>
    if (clear) {
      if (field === 'start') return
      patch = { [field]: undefined }
    } else if (field === 'start') {
      patch = { start: time, ...(tr.mixIn !== undefined && tr.mixIn > time ? { mixIn: undefined } : {}) }
    } else if (field === 'mixIn') {
      if (time > tr.start) return showToast(`Mix in has to be before "${name}" takes over (${formatTime(tr.start)})`)
      patch = { mixIn: time }
    } else {
      if (time < tr.start) return showToast(`"${name}" takes over at ${formatTime(tr.start)}, so it can only play until a later point`)
      patch = { tailEnd: time }
    }
    changeTrack(tr.id, patch)
    setSelectedId(tr.id)
    setTab('tracks')
    showToast(clear ? `${TIMING_LABEL[field]} cleared for "${name}"` : `${TIMING_LABEL[field]} for "${name}" set to ${at}`)
  }

  const selectStep = (dir: 1 | -1) => {
    if (!project?.tracks.length) return
    const sorted = sortTracks(project.tracks)
    const i = sorted.findIndex((t) => t.id === selectedId)
    const next = i < 0 ? sorted[Math.max(0, currentIndex(sorted, time))] : sorted[Math.max(0, Math.min(sorted.length - 1, i + dir))]
    setSelectedId(next.id)
    setTab('tracks')
  }

  // ---- tutorial ------------------------------------------------------------------------------
  /** Opens the tutorial clip (a few minutes of a real set with its .cue) as a throwaway project. */
  const startTutorial = async () => {
    const files = await api.tutorialFiles()
    if (!files) return setDialog({ kind: 'noTutorial' })
    if (await loadAudio(files.audio, files.cue, { tutorial: true })) setTab('tracks')
  }

  /** Called whenever a menu command runs; completes the tutorial step that asks for it. */
  const onCommand = useCallback((label: string) => {
    const t = tutorialRef.current
    if (!t || t.done || t.step >= TUTORIAL_STEPS.length || !TUTORIAL_STEPS[t.step].accepts.includes(label)) return
    setTutorial({ step: t.step, done: true })
    setTimeout(() => setTutorial((cur) => (cur && cur.step === t.step ? { step: t.step + 1, done: false } : cur)), 1100)
  }, [])

  const endTutorial = () => {
    setTutorial(null)
    reset(null)
    setProjectPath(null)
    setDirty(false)
    setSelectedId(null)
  }

  // ---- menus -------------------------------------------------------------------------------
  const has = !!project
  const fileName = projectPath?.split(/[\\/]/).pop()?.replace(PROJECT, '')
  const menus: Menu[] = [
    {
      label: 'File',
      onOpen: refreshRecent,
      items: [
        { label: 'New Project', shortcut: 'Mod+N', global: true, run: newProject },
        { label: 'Import Set or Open Project…', shortcut: 'Mod+O', alsoKeys: ['Mod+I'], global: true, run: openAny },
        {
          label: 'Open Recent',
          submenu: recent.length
            ? [
                ...recent.map((r) => ({ label: r.name, hint: r.tracks ? `${r.tracks} tracks` : undefined, run: () => openProject(r.path) })),
                'sep' as const,
                { label: 'Clear Recent', run: () => api.clearRecent().then(refreshRecent) }
              ]
            : [{ label: 'No recent projects', disabled: true }]
        },
        'sep',
        { label: 'Import Rekordbox Cue…', shortcut: 'Mod+Shift+I', global: true, run: () => importCue(), disabled: !has },
        'sep',
        { label: 'Save', shortcut: 'Mod+S', global: true, run: save, disabled: !has },
        { label: 'Save As…', shortcut: 'Mod+Shift+S', global: true, run: saveAs, disabled: !has },
        { label: 'Show Project in Folder', run: () => projectPath && api.reveal(projectPath), disabled: !projectPath },
        'sep',
        { label: 'Export Video…', shortcut: 'Mod+E', global: true, run: () => setDialog({ kind: 'export' }), disabled: !has },
        'sep',
        { label: api.platform === 'darwin' ? 'Close Window' : 'Exit', shortcut: 'Mod+Q', global: true, run: () => api.quit() }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Mod+Z', run: undo, disabled: !has },
        { label: 'Redo', shortcut: 'Mod+Shift+Z', alsoKeys: ['Mod+Y'], run: redo, disabled: !has },
        'sep',
        { label: 'Add Track at Playhead', shortcut: 'M', run: addTrack, disabled: !has },
        { label: 'Delete Track', shortcut: 'Delete', alsoKeys: ['Backspace'], run: () => selectedId && deleteTrack(selectedId), disabled: !selectedId },
        { label: 'Find Artwork…', run: () => selectedId && setDialog({ kind: 'search', trackId: selectedId }), disabled: !selectedId },
        { label: 'Re-alternate Decks A/B', run: () => update((p) => ({ ...p, tracks: alternateDecks(p.tracks) })), disabled: !has },
        'sep',
        { label: 'Settings…', shortcut: 'Mod+,', global: true, run: () => setDialog({ kind: 'prefs' }) }
      ]
    },
    {
      label: 'Timing',
      items: [
        // Left to right is the order of a transition: mix in, takes over, plays until.
        { label: 'Mix In at Playhead', shortcut: 'A', altShortcut: 'ArrowLeft', alsoKeys: ['I'], run: () => setTimingAtPlayhead('mixIn'), disabled: !has },
        { label: 'Takes Over at Playhead', shortcut: 'S', altShortcut: 'ArrowDown', alsoKeys: ['T'], run: () => setTimingAtPlayhead('start'), disabled: !has },
        { label: 'Plays Until at Playhead', shortcut: 'D', altShortcut: 'ArrowRight', alsoKeys: ['O'], run: () => setTimingAtPlayhead('tailEnd'), disabled: !has },
        'sep',
        { label: 'Clear Mix In', shortcut: 'Shift+A', alsoKeys: ['Shift+I'], run: () => setTimingAtPlayhead('mixIn', true), disabled: !has },
        { label: 'Clear Plays Until', shortcut: 'Shift+D', alsoKeys: ['Shift+O'], run: () => setTimingAtPlayhead('tailEnd', true), disabled: !has },
        'sep',
        { label: 'Select Previous Track', shortcut: '[', run: () => selectStep(-1), disabled: !has },
        { label: 'Select Next Track', shortcut: ']', run: () => selectStep(1), disabled: !has },
        { label: 'Deselect Track', shortcut: 'Escape', run: () => setSelectedId(null), disabled: !selectedId },
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: '=', run: () => timelineRef.current?.zoomIn(), disabled: !has },
        { label: 'Zoom Out', shortcut: '-', run: () => timelineRef.current?.zoomOut(), disabled: !has },
        { label: 'Fit Set to Timeline', shortcut: '\\', run: () => timelineRef.current?.fit(), disabled: !has },
        'sep',
        { label: 'Tracks', checked: tab === 'tracks', run: () => setTab('tracks') },
        { label: 'Style', checked: tab === 'style', run: () => setTab('style') },
        { label: 'Project', checked: tab === 'project', run: () => setTab('project') },
        'sep',
        {
          label: 'Reset Panel Layout',
          run: () => {
            setInspectorW(INSPECTOR_W)
            setTimelineH(TIMELINE_H)
          }
        },
        { label: 'Full Screen', shortcut: 'F11', global: true, run: () => api.toggleFullScreen() },
        { label: 'Developer Tools', shortcut: 'F12', global: true, run: () => api.toggleDevTools() }
      ]
    },
    {
      label: 'Playback',
      items: [
        { label: playing ? 'Pause' : 'Play', shortcut: 'Space', run: togglePlay, disabled: !has },
        'sep',
        { label: 'Previous Track', shortcut: 'PageUp', run: () => jumpTrack(-1), disabled: !has },
        { label: 'Next Track', shortcut: 'PageDown', run: () => jumpTrack(1), disabled: !has },
        { label: 'Back 5 Seconds', shortcut: 'J', run: () => seek(time - 5), disabled: !has },
        { label: 'Forward 5 Seconds', shortcut: 'L', run: () => seek(time + 5), disabled: !has },
        { label: 'Back 30 Seconds', shortcut: 'Shift+J', run: () => seek(time - 30), disabled: !has },
        { label: 'Forward 30 Seconds', shortcut: 'Shift+L', run: () => seek(time + 30), disabled: !has },
        'sep',
        { label: 'Go to Start', shortcut: 'Home', run: () => seek(0), disabled: !has },
        { label: 'Go to End', shortcut: 'End', run: () => seek(project?.duration ?? 0), disabled: !has }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: 'Mod+/', global: true, run: () => setDialog({ kind: 'shortcuts' }) },
        { label: 'Shortcuts Tutorial…', run: startTutorial },
        { label: 'About Set Visualizer', run: () => setDialog({ kind: 'about' }) }
      ]
    }
  ]

  // Every command reports to the tutorial, whether it ran from a key or a menu click.
  const withHooks = (items: MenuItem[]): MenuItem[] =>
    items.map((it) =>
      it === 'sep'
        ? it
        : {
            ...it,
            run: it.run && (() => (it.run!(), onCommand(it.label))),
            submenu: it.submenu && withHooks(it.submenu)
          }
    )
  const hooked = menus.map((m) => ({ ...m, items: withHooks(m.items) }))
  const menusRef = useRef(hooked)
  menusRef.current = hooked

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      if (dialog && e.key === 'Escape') return setDialog(null)
      for (const it of flatten(menusRef.current)) {
        const combos = [it.shortcut, it.altShortcut, ...(it.alsoKeys ?? [])].filter(Boolean) as string[]
        if (!combos.some((c) => matches(e, c))) continue
        if ((typing || dialog) && !it.global) return
        e.preventDefault()
        if (!it.disabled) it.run?.()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  // Commands from the native macOS menu.
  useEffect(
    () =>
      api.onMenuCommand((id) => {
        const by: Record<string, () => void> = {
          new: newProject,
          open: openAny,
          importCue: () => importCue(),
          save,
          saveAs,
          export: () => setDialog({ kind: 'export' }),
          preferences: () => setDialog({ kind: 'prefs' })
        }
        by[id]?.()
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, projectPath, save, saveAs]
  )

  useEffect(() => {
    const name = project ? fileName ?? project.audioName : null
    document.title = name ? `${name}${dirty && !prefs?.autosave ? ' *' : ''} — Set Visualizer` : 'Set Visualizer'
  }, [project, fileName, dirty, prefs?.autosave])

  const searchTrack = dialog?.kind === 'search' && project ? project.tracks.find((t) => t.id === dialog.trackId) : undefined

  const status =
    !project ? null : tutorial ? (
      <span className="save-state">Tutorial · nothing is saved</span>
    ) : saveState.status === 'saving' ? (
      <span className="save-state">Saving…</span>
    ) : saveState.status === 'error' ? (
      <span className="save-state error" title={saveState.message}>
        Not saved
      </span>
    ) : dirty || !projectPath ? (
      <span className="save-state edited">{prefs?.autosave && projectPath ? 'Edited' : 'Unsaved changes'}</span>
    ) : (
      <span className="save-state ok">
        <Icon name="check" size={12} /> {prefs?.autosave ? 'Autosaved' : 'Saved'}
      </span>
    )

  return (
    <div
      className={`app ${api.platform === 'darwin' ? 'mac' : ''}`}
      style={{ ['--inspector-w' as string]: `${inspectorW}px`, ['--timeline-h' as string]: `${timelineH}px` }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        openPaths([...e.dataTransfer.files].map((f) => api.pathForFile(f)))
      }}
    >
      <MenuBar
        menus={hooked}
        center={
          project && (
            <>
              <span className="doc-name" title={projectPath ?? undefined}>
                {tutorial ? 'Shortcuts tutorial' : fileName ?? project.audioName.replace(/\.[^.]+$/, '')}
              </span>
              {status}
            </>
          )
        }
        right={
          <>
            <button className="icon-btn small" title={`Settings (${shortcutLabel('Mod+,')})`} onClick={() => setDialog({ kind: 'prefs' })}>
              <Icon name="gear" size={14} />
            </button>
            <button className="btn export-btn" disabled={!project} onClick={() => setDialog({ kind: 'export' })}>
              <Icon name="export" size={13} /> Export
            </button>
          </>
        }
      />

      <main className="workspace">
        <Viewer
          project={project}
          audio={audioEl}
          time={time}
          playing={playing}
          busy={busy}
          error={error}
          recent={recent}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onJumpTrack={jumpTrack}
          onOpenAny={openAny}
          onOpenProject={openProject}
          onCancelBusy={() => void cancelLoad()}
          dragOver={dragOver}
          clips={clips}
          loop={loop}
          onPlayClip={playClip}
          onStopLoop={() => setLoop(null)}
          clipFormat={clipFormat}
          onClipFormat={setClipFormat}
        />
        <Splitter dir="col" value={inspectorW} min={280} max={640} sign={-1} onChange={setInspectorW} onReset={() => setInspectorW(INSPECTOR_W)} />
        <Inspector
          project={project}
          projectPath={projectPath}
          tab={tab}
          onTab={setTab}
          time={time}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          onChangeTrack={changeTrack}
          onChangeSettings={changeSettings}
          onDelete={deleteTrack}
          onAdd={addTrack}
          onSearch={(id) => setDialog({ kind: 'search', trackId: id })}
          onAlternateDecks={() => update((p) => ({ ...p, tracks: alternateDecks(p.tracks) }))}
          onImportCue={() => importCue()}
        />
      </main>

      <Splitter dir="row" value={timelineH} min={170} max={520} sign={-1} onChange={setTimelineH} onReset={() => setTimelineH(TIMELINE_H)} />

      <footer className="timeline-wrap">
        {project ? (
          <Timeline
            ref={timelineRef}
            project={project}
            time={time}
            playing={playing}
            selectedId={selectedId}
            onSeek={seek}
            onSelect={(id) => {
              setSelectedId(id)
              setTab('tracks')
            }}
            onChangeTrack={changeTrack}
          />
        ) : (
          <EmptyTimeline />
        )}
      </footer>

      {project && (
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
      )}

      {searchTrack && <SearchDialog track={searchTrack} onClose={() => setDialog(null)} onApply={(patch) => changeTrack(searchTrack.id, patch)} />}
      {dialog?.kind === 'export' && project && <ExportDialog project={project} onClose={() => setDialog(null)} onChangeSettings={changeSettings} />}
      {dialog?.kind === 'prefs' && prefs && <PreferencesDialog prefs={prefs} onChange={changePrefs} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'shortcuts' && <ShortcutsDialog menus={menus} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'noTutorial' && (
        <SimpleDialog title="Shortcuts tutorial" onClose={() => setDialog(null)}>
          <p className="muted">
            The tutorial clip isn't installed. Create it from one of your recordings with <code>npm run make-tutorial -- set.wav set.cue</code>, then rebuild the app.
          </p>
        </SimpleDialog>
      )}
      {tutorial && (
        <TutorialCard
          step={tutorial.step}
          done={tutorial.done}
          onNext={() => setTutorial((t) => t && { step: t.step + 1, done: false })}
          onBack={() => setTutorial((t) => t && { step: Math.max(0, t.step - 1), done: false })}
          onClose={endTutorial}
        />
      )}
      {dialog?.kind === 'about' && (
        <SimpleDialog title="Set Visualizer" onClose={() => setDialog(null)}>
          <p className="muted">Turns a recorded DJ set and its Rekordbox .cue into a visualizer video for YouTube. Projects are saved as .djvis files.</p>
        </SimpleDialog>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function SimpleDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small-modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ShortcutsDialog({ menus, onClose }: { menus: Menu[]; onClose: () => void }) {
  return (
    <SimpleDialog title="Keyboard shortcuts" onClose={onClose}>
      <div className="shortcut-grid">
        {menus.map((m) => {
          const items = flatten([m]).filter((it) => it.shortcut)
          if (!items.length) return null
          return (
            <div key={m.label}>
              <h4>{m.label}</h4>
              {items.map((it) => (
                <div key={it.label} className="shortcut-row">
                  <span>{it.label}</span>
                  <kbd>{keysLabel(it)}</kbd>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </SimpleDialog>
  )
}
