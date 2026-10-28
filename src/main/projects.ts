import { app } from 'electron'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Preferences, Project, RecentProject } from '@shared/types'

export const PROJECT_EXT = 'djvis'
const MAX_RECENT = 12

interface Stored {
  prefs?: Partial<Preferences>
  recent?: RecentProject[]
}

const storeFile = () => join(app.getPath('userData'), 'settings.json')

export const defaultPrefs = (): Preferences => ({
  autosave: true,
  projectsDir: join(app.getPath('documents'), 'Set Visualizer'),
  autoArtwork: true,
  defaultWidth: 1920,
  defaultHeight: 1080,
  defaultFps: 30
})

async function readStore(): Promise<Stored> {
  try {
    return JSON.parse(await readFile(storeFile(), 'utf8'))
  } catch {
    return {}
  }
}

let storeQueue: Promise<unknown> = Promise.resolve()

/** Read-modify-write of the settings file, one at a time so concurrent saves don't drop updates. */
function updateStore(fn: (s: Stored) => Partial<Stored>): Promise<Stored> {
  const run = storeQueue.then(async () => {
    const cur = await readStore()
    const next = { ...cur, ...fn(cur) }
    await writeAtomic(storeFile(), JSON.stringify(next, null, 2))
    return next
  })
  storeQueue = run.catch(() => {})
  return run
}

export async function getPrefs(): Promise<Preferences> {
  return { ...defaultPrefs(), ...(await readStore()).prefs }
}

export async function setPrefs(patch: Partial<Preferences>): Promise<Preferences> {
  const s = await updateStore((cur) => ({ prefs: { ...cur.prefs, ...patch } }))
  return { ...defaultPrefs(), ...s.prefs }
}

const exists = (p: string) => access(p).then(() => true, () => false)

/** Recent projects, newest first, leaving out files that have been moved or deleted. */
export async function listRecent(): Promise<RecentProject[]> {
  const recent = ((await readStore()).recent ?? []).filter((r) => typeof r?.path === 'string')
  const present = await Promise.all(recent.map((r) => exists(r.path)))
  return recent.filter((_, i) => present[i])
}

export async function clearRecent() {
  await updateStore(() => ({ recent: [] }))
}

async function remember(path: string, project: Project) {
  const entry: RecentProject = {
    path,
    name: basename(path).replace(/\.djvis$/i, ''),
    audioName: project.audioName,
    savedAt: project.savedAt,
    tracks: project.tracks.length
  }
  await updateStore((cur) => ({
    recent: [entry, ...(cur.recent ?? []).filter((r) => typeof r?.path === 'string' && r.path !== path)].slice(0, MAX_RECENT)
  }))
}

/** Writes next to the target and renames, so a crash mid-save never leaves half a file. */
async function writeAtomic(path: string, data: string) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export async function writeProject(path: string, project: Project) {
  const stamped = { ...project, savedAt: new Date().toISOString() }
  await writeAtomic(path, JSON.stringify(stamped))
  await remember(path, stamped)
  return stamped.savedAt
}

export async function readProject(path: string): Promise<Project> {
  const project = JSON.parse(await readFile(path, 'utf8')) as Project
  if (!project || !project.audioPath || !Array.isArray(project.tracks)) throw new Error(`${basename(path)} isn't a Set Visualizer project`)
  await remember(path, project)
  return project
}

/** A free file name for a new project in the projects folder: "My Set.djvis", "My Set 2.djvis", ... */
export async function newProjectPath(audioName: string): Promise<string> {
  const { projectsDir } = await getPrefs()
  const base = audioName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled set'
  for (let n = 1; ; n++) {
    const p = join(projectsDir, `${base}${n > 1 ? ` ${n}` : ''}.${PROJECT_EXT}`)
    if (!(await exists(p))) return p
  }
}
