import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { applyClipEdits, suggestClips, type ClipSuggestion } from '@shared/clips'
import { alternateDecks, currentIndex, formatTime, mainTracks, sortTracks } from '@shared/layout'
import { buildMotion } from '@shared/motion'
import { entriesToTracks, newId, placeTakeovers } from '@shared/tracklist'
import type { ParsedEntry } from '@shared/tracklist'
import { BRAND, DEFAULT_SETTINGS, forDisk, type Preferences, type Project, type RecentProject, type RenderSettings, type Track } from '@shared/types'
import { errMsg, needsFile, platform, type NeedsFile } from './platform'
import { ExportDialog } from './components/ExportDialog'
import type { ClipFormat } from './components/Clips'
import type { ViewerTab } from './components/Viewer'
import { Icon } from './components/icons'
import { Inspector, type InspectorTab } from './components/Inspector'
import { flatten, keysLabel, matches, MenuBar, shortcutLabel, type Menu, type MenuItem } from './components/MenuBar'
import { TutorialCard, TUTORIAL_STEPS } from './components/Tutorial'
import { PreferencesDialog } from './components/Preferences'
import { SearchDialog } from './components/SearchDialog'
import { Splitter, useStoredNumber } from './components/Splitter'
import { EmptyTimeline, Timeline, type TimelineHandle } from './components/Timeline'
import { Viewer } from './components/Viewer'
import { useFullscreen } from './useFullscreen'
import { useHistory } from './useHistory'
import { ExportJobs } from './components/ExportJobs'
import { exportQueue, useExportJobs } from './export/queue'
import { setUiLocale, uiLocale } from './i18n'
import { loadAccount } from './account/account'
import { AccountButton, AccountDialogs } from './account/AccountDialogs'
import type { en } from './i18n/en'

type Dialog = { kind: 'search'; trackId: string } | { kind: 'export' } | { kind: 'prefs' } | { kind: 'shortcuts' } | { kind: 'about' } | { kind: 'noTutorial' } | null
type SaveState = { status: 'saved' | 'saving' | 'edited' | 'error'; message?: string }

const AUDIO = /\.(wav|mp3|flac|aiff?|m4a|aac|ogg|opus)$/i
const CUE = /\.cue$/i
const PROJECT = /\.djvis$/i
const AUTOSAVE_DELAY = 800
const INSPECTOR_W = 360
const TIMELINE_H = 250
/** The shortest the timeline gets: its deck lanes and waveform at their smallest. */
const TIMELINE_MIN = 176
const TIMELINE_MAX = 520

/**
 * The timeline's height when the user hasn't dragged it: full size on tall screens, shorter on
 * laptop screens so the preview gets the room (250 px from a 900 px tall window up, TIMELINE_MIN
 * at 700 px and below).
 */
function autoTimelineHeight(windowH: number) {
  const k = Math.max(0, Math.min(1, (windowH - 700) / 200))
  return Math.round(TIMELINE_MIN + k * (TIMELINE_H - TIMELINE_MIN))
}

/** Tracks the window's inner height. */
function useWindowHeight() {
  const [h, setH] = useState(() => window.innerHeight)
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}

type CmdId = keyof typeof en.cmd

export function App() {
  const { t } = useTranslation()
  const { state: project, set, reset, undo, redo } = useHistory<Project | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'saved' })
  const [prefs, setPrefsState] = useState<Preferences | null>(null)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The project that opens once the user picks its recording again (with `error` saying so). */
  const [locate, setLocate] = useState<NeedsFile | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<InspectorTab>('tracks')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // The clip looping in Program, by id so that trimming it changes the loop too.
  const [loopId, setLoopId] = useState<string | null>(null)
  const loopRef = useRef<ClipSuggestion | null>(null)
  const [clipFormat, setClipFormat] = useState<ClipFormat>('portrait')
  // A clip belongs to the set it came from.
  useEffect(() => setLoopId(null), [project?.audioPath])
  const [inspectorW, setInspectorW] = useStoredNumber('layout.inspectorWidth', INSPECTOR_W)
  // 0 means the user hasn't dragged the timeline, so its height follows the window.
  const [storedTimelineH, setTimelineH] = useStoredNumber('layout.timelineHeight', 0)
  const windowH = useWindowHeight()
  // A height dragged on a big monitor never leaves less than about half the window to the editor.
  const timelineH = storedTimelineH
    ? Math.max(TIMELINE_MIN, Math.min(storedTimelineH, Math.round(windowH * 0.45)))
    : autoTimelineHeight(windowH)
  // Preview loudness only; exports always carry the set's own audio.
  const [volume, setVolume] = useStoredNumber('preview.volume', 1)
  const [muted, setMuted] = useStoredNumber('preview.muted', 0)
  const timelineRef = useRef<TimelineHandle>(null)
  const [tutorial, setTutorial] = useState<{ step: number; done: boolean } | null>(null)
  const tutorialRef = useRef(tutorial)
  tutorialRef.current = tutorial

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000)
  }, [])

  const refreshRecent = useCallback(() => {
    platform.recentProjects().then(setRecent, () => {})
  }, [])

  useEffect(() => {
    platform.getPrefs().then(setPrefsState, () => {})
    refreshRecent()
  }, [refreshRecent])

  useEffect(() => setUiLocale(prefs?.language), [prefs?.language])

  // Who is signed in, loaded after the editor is up (exports need an account).
  useEffect(() => {
    const id = setTimeout(loadAccount, 300)
    return () => clearTimeout(id)
  }, [])

  const changePrefs = async (patch: Partial<Preferences>) => setPrefsState(await platform.setPrefs(patch))

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

  // While a video exports the project can't be edited (the clips can still be trimmed and
  // exported, and the export settings changed for the next export).
  const exportJobs = useExportJobs()
  const exporting = exportJobs.some((j) => j.status === 'queued' || j.status === 'running')
  const locked = useRef(false)
  locked.current = exporting
  const lockedNote = useRef(-Infinity)
  const blocked = useCallback(() => {
    if (!locked.current) return false
    if (performance.now() - lockedNote.current > 4000) {
      lockedNote.current = performance.now()
      showToast(t('jobs.locked'))
    }
    return true
  }, [showToast, t])

  /** An edit. `allowWhileExporting`: one the export lock lets through (see above). */
  const update = useCallback(
    (fn: (p: Project) => Project, mergeKey?: string, skipHistory = false, allowWhileExporting = false) => {
      if (!skipHistory && !allowWhileExporting && blocked()) return
      set((p) => (p ? fn(p) : p), { mergeKey, skipHistory })
      markDirty()
    },
    [set, markDirty, blocked]
  )

  /** Writes the current project to its file. Runs one save at a time and re-saves if edits came in meanwhile. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    while (saving.current) await saving.current
    const { project: p, path } = latest.current
    if (!p || !path) return false
    const at = rev.current
    setSaveState({ status: 'saving' })
    let ok = true
    saving.current = platform
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
    if (prefs?.autosave && latest.current.path) return (await saveNow()) || confirm(t('app.saveFailedContinue'))
    return confirm(t('app.discardChanges'))
  }, [dirty, prefs?.autosave, saveNow, t])

  const saveAs = useCallback(async () => {
    if (!project) return
    try {
      const r = await platform.saveProjectAs(forDisk(project), projectPath)
      if (!r) return
      setProjectPath(r.path)
      setDirty(false)
      setSaveState({ status: 'saved' })
      showToast(t('app.savedAs', { name: r.path.split(/[\\/]/).pop() }))
      refreshRecent()
    } catch (e) {
      showToast(t('app.couldNotSave', { error: errMsg(e) }))
    }
  }, [project, projectPath, showToast, refreshRecent, t])

  const save = useCallback(async () => {
    if (!project) return
    if (!projectPath) return saveAs()
    if (await saveNow()) showToast(t('app.projectSaved'))
  }, [project, projectPath, saveAs, saveNow, showToast, t])

  // The web asks before leaving while there's something to lose: unsaved edits, or a running export.
  useEffect(() => platform.setUnsaved?.((dirty && !tutorial) || exporting), [dirty, tutorial, exporting])

  useEffect(() => platform.onBeforeClose(() => void settle()), [settle])

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
   * Looks each track without artwork up (Deezer, else Apple Music, else YouTube) and uses the best
   * match's image (the first result unless another is the same song). Runs in the background, two at a time; any image can still be replaced from the
   * inspector.
   */
  const autoArtwork = useCallback(
    async (tracks: Track[]) => {
      const queue = tracks.filter((t) => !t.artwork && (t.title || t.artist))
      const worker = async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          try {
            const found = await platform.autoArtwork(t.artist, t.title)
            if (!found) continue
            const { artwork, url, source } = found
            const id = t.id
            update(
              (p) => ({
                ...p,
                tracks: p.tracks.map((x) => (x.id === id && !x.artwork ? { ...x, artwork, sourceUrl: x.sourceUrl ?? url, source: x.source ?? source } : x))
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
      return platform.detectTakeovers(audioPath, cues, duration, songs)
    })

  /** Reads a Rekordbox cue sheet and places its tracks, ready to store in the project. */
  const readCue = async (cuePath: string, audioPath: string, duration: number, onDetect: () => void) => {
    const { entries, text, name } = await platform.readCue(cuePath)
    if (!entries.length) throw new Error(t('app.noTracksInCue', { name }))
    const tracks = entriesToTracks(await withTakeovers(entries, audioPath, duration, onDetect), duration)
    return { tracks, cue: { path: cuePath, name, text, importedAt: new Date().toISOString() } }
  }

  // Each load bumps this; a load that finds it changed was replaced by opening something else.
  const loadGen = useRef(0)
  const cancelLoad = () => {
    loadGen.current++
    setBusy(null)
    return platform.cancelAnalysis()
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
    setLocate(null)
    setBusy({ label: t('app.readingAudio'), progress: 0 })
    const off = platform.onAudioProgress((p) => setBusy((b) => (b ? { ...b, progress: p } : b)))
    try {
      const { duration, waveform, name } = await platform.analyseAudio(audioPath)
      if (stale()) return false
      const fromCue = cuePath ? await readCue(cuePath, audioPath, duration, () => !stale() && setBusy({ label: t('app.findingTakeovers'), progress: 1 })) : null
      if (stale()) return false
      const p = prefs ?? (await platform.getPrefs())
      const fresh: Project = {
        version: 1,
        audioPath,
        audioName: name,
        duration,
        waveform,
        tracks: fromCue?.tracks ?? [],
        cue: fromCue?.cue,
        createdAt: new Date().toISOString(),
        settings: { ...DEFAULT_SETTINGS, width: p.defaultWidth, height: p.defaultHeight, fps: p.defaultFps, videoLanguage: uiLocale(p.language), setTitle: opts.tutorial ? t('app.tutorialTitle') : name.replace(/\.[^.]+$/, '') }
      }
      // The tutorial works on a throwaway project: no file, nothing to save.
      const saved = opts.tutorial
        ? null
          : await platform.createProject(forDisk(fresh)).catch((e) => {
              showToast(t('app.couldNotCreate', { error: errMsg(e) }))
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
        if (!opts.tutorial) showToast(t('app.imported', { count: fromCue.tracks.length, name: fromCue.cue.name }))
        if (p.autoArtwork) void autoArtwork(fromCue.tracks)
      } else if (saved) showToast(t('app.newProject', { name: saved.path.split(/[\\/]/).pop() }))
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
    setLocate(null)
    // Shown only when the set has to be analysed again (no cached waveform on this computer).
    let analysing = false
    const off = platform.onAudioProgress((p) => {
      analysing = true
      setBusy({ label: t('app.analysing'), progress: p })
    })
    try {
      const r = await platform.openProject(path)
      if (!r) return
      await cancelLoad()
      reset({ ...r.project, settings: { ...DEFAULT_SETTINGS, ...r.project.settings, djName: BRAND } })
      setTutorial(null)
      // Projects from before the vocal band was analysed: add it in the background so the cards
      // can follow the vocals where there's no bass.
      if (!r.project.waveform.vocal) {
        const path = r.path
        platform
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
      if (needsFile(e) && platform.locateFile) {
        // Back to the start panel (the open project is saved), where its button picks the file.
        await cancelLoad()
        reset(null)
        setProjectPath(null)
        setDirty(false)
        setError(msg)
        setLocate(e)
      } else if (project) showToast(msg)
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
    setLocate(null)
    refreshRecent()
  }

  /** One picker for everything that starts work: a recording (optionally with its .cue) or a project. */
  const openAny = async () => {
    const paths = await platform.openAnyDialog()
    if (paths.length) openPaths(paths)
  }

  /** Importing a cue sheet replaces the tracklist and records the cue in the project file. */
  const importCue = async (path?: string) => {
    if (!project) return showToast(t('app.openRecordingFirst'))
    const cuePath = path ?? (await platform.openTracklistDialog())
    if (!cuePath) return
    if (project.tracks.length && !confirm(t('app.replaceTracklist'))) return
    try {
      const { tracks, cue } = await readCue(cuePath, project.audioPath, project.duration, () => showToast(t('app.findingTakeovers')))
      update((p) => ({ ...p, tracks, cue }))
      setSelectedId(null)
      setTab('tracks')
      if (prefs?.autoArtwork !== false) void autoArtwork(tracks)
      showToast(t('app.imported', { count: tracks.length, name: cue.name }))
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
    showToast(t('app.dropHint'))
  }

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

  useEffect(() => {
    if (!audioEl) return
    audioEl.volume = Math.min(1, Math.max(0, volume))
    audioEl.muted = !!muted
  }, [audioEl, volume, muted])

  // Clips are found again whenever the tracklist or the audio changes; it's a few ms, nothing is rendered.
  const suggested = useMemo(
    () => (project?.tracks.length ? suggestClips(project.tracks, project.duration, buildMotion(project.waveform)) : []),
    [project?.tracks, project?.duration, project?.waveform]
  )
  const clips = useMemo(() => applyClipEdits(suggested, project?.clipEdits), [suggested, project?.clipEdits])
  const loop = clips.find((c) => c.id === loopId) ?? null
  const [viewerTab, setViewerTab] = useState<ViewerTab>('program')
  const fullscreen = useFullscreen<HTMLElement>()
  const toggleFullscreen = () => {
    // Full screen is for watching the video, so it always shows Program.
    if (!fullscreen.on) setViewerTab('program')
    fullscreen.toggle()
  }
  const clipsHint = !!prefs && !prefs.clipsHintSeen && clips.length > 0 && !tutorial && !busy
  loopRef.current = loop

  /** Sets a clip's start and end, or back to the suggested ones with null. Nudges merge into one undo step. */
  const trimClip = (id: string, range: { from: number; to: number } | null) =>
    update((p) => {
      const edits = { ...p.clipEdits }
      if (range) edits[id] = range
      else delete edits[id]
      return { ...p, clipEdits: Object.keys(edits).length ? edits : undefined }
    }, `clip-${id}`, false, true)

  const seek = useCallback(
    (t: number) => {
      const c = Math.max(0, Math.min(project?.duration ?? 0, t))
      // Seeking out of a looping clip ends the loop.
      const l = loopRef.current
      if (l && (c < l.from - 0.5 || c > l.to + 0.5)) setLoopId(null)
      setTime(c)
      if (audioEl) audioEl.currentTime = c
    },
    [audioEl, project?.duration]
  )

  const togglePlay = useCallback(() => {
    if (!audioEl) return
    if (audioEl.paused) audioEl.play().catch((e) => showToast(t('app.cantPlay', { error: errMsg(e) })))
    else audioEl.pause()
  }, [audioEl, showToast, t])

  const playClip = (c: ClipSuggestion) => {
    setLoopId(c.id)
    loopRef.current = c
    seek(c.from)
    audioEl?.play().catch((e) => showToast(t('app.cantPlay', { error: errMsg(e) })))
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
  const TIMING_LABEL: Record<TimingField, string> = { start: t('timing.takesOver'), mixIn: t('timing.mixIn'), tailEnd: t('timing.playsUntil') }

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
    if (!tr) return showToast(t('app.importCueFirst'))
    const name = tr.title || t('common.untitled')
    const at = formatTime(time, project!.duration >= 3600)
    let patch: Partial<Track>
    if (clear) {
      if (field === 'start') return
      patch = { [field]: undefined }
    } else if (field === 'start') {
      patch = { start: time, ...(tr.mixIn !== undefined && tr.mixIn > time ? { mixIn: undefined } : {}) }
    } else if (field === 'mixIn') {
      if (time > tr.start) return showToast(t('app.mixInBeforeTakeover', { name, at: formatTime(tr.start) }))
      patch = { mixIn: time }
    } else {
      if (time < tr.start) return showToast(t('app.playsUntilAfterTakeover', { name, at: formatTime(tr.start) }))
      patch = { tailEnd: time }
    }
    changeTrack(tr.id, patch)
    setSelectedId(tr.id)
    setTab('tracks')
    showToast(clear ? t('app.timingCleared', { field: TIMING_LABEL[field], name }) : t('app.timingSet', { field: TIMING_LABEL[field], name, at }))
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
    const files = await platform.tutorialFiles()
    if (!files) return setDialog({ kind: 'noTutorial' })
    if (await loadAudio(files.audio, files.cue, { tutorial: true })) setTab('tracks')
  }

  /** Called whenever a menu command runs; completes the tutorial step that asks for it. */
  const onCommand = useCallback((id: string) => {
    const t = tutorialRef.current
    if (!t || t.done || t.step >= TUTORIAL_STEPS.length || !TUTORIAL_STEPS[t.step].accepts.includes(id)) return
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
  /** A menu command: its id (what the tutorial listens for) and its label in the UI language. */
  const cmd = (id: CmdId) => ({ id, label: t(`cmd.${id}`) })
  const menus: Menu[] = [
    {
      label: t('menu.file'),
      onOpen: refreshRecent,
      items: [
        { ...cmd('newProject'), shortcut: 'Mod+N', global: true, run: newProject },
        { ...cmd('openAny'), shortcut: 'Mod+O', alsoKeys: ['Mod+I'], global: true, run: openAny },
        {
          ...cmd('openRecent'),
          submenu: recent.length
            ? [
                ...recent.map((r) => ({ label: r.name, hint: r.tracks ? t('common.tracks', { count: r.tracks }) : undefined, run: () => openProject(r.path) })),
                'sep' as const,
                { ...cmd('clearRecent'), run: () => platform.clearRecent().then(refreshRecent) }
              ]
            : [{ ...cmd('noRecent'), disabled: true }]
        },
        'sep',
        { ...cmd('importCue'), shortcut: 'Mod+Shift+I', global: true, run: () => importCue(), disabled: !has },
        'sep',
        { ...cmd('save'), shortcut: 'Mod+S', global: true, run: save, disabled: !has },
        { ...cmd('saveAs'), shortcut: 'Mod+Shift+S', global: true, run: saveAs, disabled: !has },
        'sep',
        { ...cmd('exportVideo'), shortcut: 'Mod+E', global: true, run: () => setDialog({ kind: 'export' }), disabled: !has }
      ]
    },
    {
      label: t('menu.edit'),
      items: [
        { ...cmd('undo'), shortcut: 'Mod+Z', run: () => blocked() || undo(), disabled: !has },
        { ...cmd('redo'), shortcut: 'Mod+Shift+Z', alsoKeys: ['Mod+Y'], run: () => blocked() || redo(), disabled: !has },
        'sep',
        { ...cmd('addTrack'), shortcut: 'M', run: addTrack, disabled: !has },
        { ...cmd('deleteTrack'), shortcut: 'Delete', alsoKeys: ['Backspace'], run: () => selectedId && deleteTrack(selectedId), disabled: !selectedId },
        { ...cmd('findArtwork'), run: () => selectedId && setDialog({ kind: 'search', trackId: selectedId }), disabled: !selectedId },
        { ...cmd('alternateDecks'), run: () => update((p) => ({ ...p, tracks: alternateDecks(p.tracks) })), disabled: !has },
        'sep',
        { ...cmd('settings'), shortcut: 'Mod+,', global: true, run: () => setDialog({ kind: 'prefs' }) }
      ]
    },
    {
      label: t('menu.timing'),
      items: [
        // A, S, D: left to right is the order of a transition (mix in, takes over, plays until).
        { ...cmd('mixInAtPlayhead'), shortcut: 'A', run: () => setTimingAtPlayhead('mixIn'), disabled: !has },
        { ...cmd('takesOverAtPlayhead'), shortcut: 'S', run: () => setTimingAtPlayhead('start'), disabled: !has },
        { ...cmd('playsUntilAtPlayhead'), shortcut: 'D', run: () => setTimingAtPlayhead('tailEnd'), disabled: !has },
        'sep',
        { ...cmd('clearMixIn'), shortcut: 'Shift+A', run: () => setTimingAtPlayhead('mixIn', true), disabled: !has },
        { ...cmd('clearPlaysUntil'), shortcut: 'Shift+D', run: () => setTimingAtPlayhead('tailEnd', true), disabled: !has },
        'sep',
        { ...cmd('selectPrevious'), shortcut: '[', run: () => selectStep(-1), disabled: !has },
        { ...cmd('selectNext'), shortcut: ']', run: () => selectStep(1), disabled: !has },
        { ...cmd('deselect'), shortcut: 'Escape', run: () => setSelectedId(null), disabled: !selectedId },
      ]
    },
    {
      label: t('menu.view'),
      items: [
        { ...cmd('zoomIn'), shortcut: '=', run: () => timelineRef.current?.zoomIn(), disabled: !has },
        { ...cmd('zoomOut'), shortcut: '-', run: () => timelineRef.current?.zoomOut(), disabled: !has },
        { ...cmd('fit'), shortcut: '\\', run: () => timelineRef.current?.fit(), disabled: !has },
        { ...cmd('fullscreen'), shortcut: 'F', checked: fullscreen.on, run: toggleFullscreen, disabled: !has || !fullscreen.available },
        'sep',
        { ...cmd('tabTracks'), checked: tab === 'tracks', run: () => setTab('tracks') },
        { ...cmd('tabStyle'), checked: tab === 'style', run: () => setTab('style') },
        { ...cmd('tabProject'), checked: tab === 'project', run: () => setTab('project') },
        'sep',
        {
          ...cmd('resetLayout'),
          run: () => {
            setInspectorW(INSPECTOR_W)
            setTimelineH(0)
          }
        }
      ]
    },
    {
      label: t('menu.playback'),
      items: [
        { ...cmd(playing ? 'pause' : 'play'), shortcut: 'Space', run: togglePlay, disabled: !has },
        'sep',
        { ...cmd('previousTrack'), shortcut: 'ArrowUp', alsoKeys: ['PageUp'], run: () => jumpTrack(-1), disabled: !has },
        { ...cmd('nextTrack'), shortcut: 'ArrowDown', alsoKeys: ['PageDown'], run: () => jumpTrack(1), disabled: !has },
        { ...cmd('back5'), shortcut: 'ArrowLeft', alsoKeys: ['J'], run: () => seek(time - 5), disabled: !has },
        { ...cmd('forward5'), shortcut: 'ArrowRight', alsoKeys: ['L'], run: () => seek(time + 5), disabled: !has },
        { ...cmd('back30'), shortcut: 'Shift+ArrowLeft', alsoKeys: ['Shift+J'], run: () => seek(time - 30), disabled: !has },
        { ...cmd('forward30'), shortcut: 'Shift+ArrowRight', alsoKeys: ['Shift+L'], run: () => seek(time + 30), disabled: !has },
        'sep',
        { ...cmd('goToStart'), shortcut: 'Home', run: () => seek(0), disabled: !has },
        { ...cmd('goToEnd'), shortcut: 'End', run: () => seek(project?.duration ?? 0), disabled: !has }
      ]
    },
    {
      label: t('menu.help'),
      items: [
        { ...cmd('shortcuts'), shortcut: 'Mod+/', global: true, run: () => setDialog({ kind: 'shortcuts' }) },
        { ...cmd('tutorial'), run: startTutorial },
        { ...cmd('about'), run: () => setDialog({ kind: 'about' }) }
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
            run: it.run && (() => (it.run!(), onCommand(it.id ?? it.label))),
            submenu: it.submenu && withHooks(it.submenu)
          }
    )
  const hooked = menus.map((m) => ({ ...m, items: withHooks(m.items) }))
  const menusRef = useRef(hooked)
  menusRef.current = hooked

  // Dialogs open outside the viewer, where full screen would hide them.
  const exitFullscreen = fullscreen.exit
  useEffect(() => {
    if (dialog) exitFullscreen()
  }, [dialog, exitFullscreen])

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

  useEffect(() => {
    const name = project ? fileName ?? project.audioName : null
    document.title = name ? `${name}${dirty && !prefs?.autosave ? ' *' : ''} — REKCUT` : 'REKCUT'
  }, [project, fileName, dirty, prefs?.autosave])

  const searchTrack = dialog?.kind === 'search' && project ? project.tracks.find((t) => t.id === dialog.trackId) : undefined

  const status =
    !project ? null : exporting ? (
      <span className="save-state edited">
        <Icon name="lock" size={12} /> {t('jobs.lockedStatus')}
      </span>
    ) : tutorial ? (
      <span className="save-state">{t('app.status.tutorial')}</span>
    ) : saveState.status === 'saving' ? (
      <span className="save-state">{t('app.status.saving')}</span>
    ) : saveState.status === 'error' ? (
      <span className="save-state error" title={saveState.message}>
        {t('app.status.notSaved')}
      </span>
    ) : dirty || !projectPath ? (
      <span className="save-state edited">{prefs?.autosave && projectPath ? t('app.status.edited') : t('app.status.unsaved')}</span>
    ) : (
      <span className="save-state ok">
        <Icon name="check" size={12} /> {prefs?.autosave ? t('app.status.autosaved') : t('app.status.saved')}
      </span>
    )

  return (
    <div
      className={`app ${platform.os === 'darwin' ? 'mac' : ''}`}
      style={{ ['--inspector-w' as string]: `${inspectorW}px`, ['--timeline-h' as string]: `${timelineH}px` }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (platform.refsForDrop) void platform.refsForDrop(e.dataTransfer).then(openPaths)
        else openPaths([...e.dataTransfer.files].map((f) => platform.refForFile(f)))
      }}
    >
      <MenuBar
        menus={hooked}
        center={
          project && (
            <>
              <span className="doc-name" title={projectPath ?? undefined}>
                {tutorial ? t('app.tutorialTitle') : fileName ?? project.audioName.replace(/\.[^.]+$/, '')}
              </span>
              {status}
            </>
          )
        }
        right={
          <>
            <AccountButton />
            <button className="icon-btn small" title={t('app.settingsButton', { keys: shortcutLabel('Mod+,') })} onClick={() => setDialog({ kind: 'prefs' })}>
              <Icon name="gear" size={14} />
            </button>
            <button className="btn export-btn" disabled={!project} onClick={() => setDialog({ kind: 'export' })}>
              <Icon name="export" size={13} /> {t('common.export')}
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
          locate={
            locate && {
              fileName: locate.fileName,
              run: async () => {
                try {
                  if (await platform.locateFile!(locate.project)) void openProject(locate.project)
                } catch (e) {
                  setError(errMsg(e))
                }
              }
            }
          }
          onCancelBusy={() => void cancelLoad()}
          dragOver={dragOver}
          clips={clips}
          loop={loop}
          onPlayClip={playClip}
          onStopLoop={() => setLoopId(null)}
          onTrimClip={trimClip}
          tab={viewerTab}
          onTab={setViewerTab}
          clipsHint={clipsHint}
          onDismissClipsHint={() => void changePrefs({ clipsHintSeen: true })}
          clipFormat={clipFormat}
          onClipFormat={setClipFormat}
          sectionRef={fullscreen.ref}
          fullscreen={fullscreen.on}
          onToggleFullscreen={toggleFullscreen}
          volume={volume}
          muted={!!muted}
          onVolume={(v) => {
            setVolume(v)
            if (v > 0 && muted) setMuted(0)
          }}
          onMuted={(m) => setMuted(m ? 1 : 0)}
          volumeHint={!!prefs && !prefs.volumeHintSeen}
          onDismissVolumeHint={() => void changePrefs({ volumeHintSeen: true })}
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

      <Splitter dir="row" value={timelineH} min={TIMELINE_MIN} max={TIMELINE_MAX} sign={-1} onChange={setTimelineH} onReset={() => setTimelineH(0)} />

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
          src={platform.mediaUrl(project.audioPath)}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onError={() => showToast(t('app.cantPlayMoved'))}
        />
      )}

      {searchTrack && <SearchDialog track={searchTrack} onClose={() => setDialog(null)} onApply={(patch) => changeTrack(searchTrack.id, patch)} />}
      {dialog?.kind === 'export' && project && (
        <ExportDialog
          project={project}
          onClose={() => setDialog(null)}
          onChangeSettings={(patch, mergeKey) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }), mergeKey, false, true)}
        />
      )}
      {dialog?.kind === 'prefs' && prefs && <PreferencesDialog prefs={prefs} onChange={changePrefs} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'shortcuts' && <ShortcutsDialog menus={menus} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'noTutorial' && (
        <SimpleDialog title={t('app.tutorialTitle')} onClose={() => setDialog(null)}>
          <p className="muted">
            <Trans i18nKey="app.noTutorial" components={[<code />]} />
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
        <SimpleDialog title={t('common.appName')} onClose={() => setDialog(null)}>
          <p className="muted">{t('app.about')}</p>
        </SimpleDialog>
      )}
      {toast && <div className="toast">{toast}</div>}
      <ExportJobs />
      <AccountDialogs />
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
  const { t } = useTranslation()
  return (
    <SimpleDialog title={t('app.shortcutsTitle')} onClose={onClose}>
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
