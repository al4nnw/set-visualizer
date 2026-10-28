/**
 * Headless export, handy for testing and the first step toward a server/web version.
 *   npm run render -- <audio> [--tracklist list.cue] [--project set.djvis] [--out set.mp4]
 *                      [--seconds 120] [--width 1280 --height 720] [--fps 30] [--dj "Name"] [--title "Set title"]
 */
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { analyseAudio } from '../src/main/audio'
import { exportVideo } from '../src/node/exporter'
import { entriesToTracks, parseTracklist } from '../src/shared/tracklist'
import { DEFAULT_SETTINGS, type Project } from '../src/shared/types'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const projectPath = arg('project')
  let project: Project
  if (projectPath) {
    project = JSON.parse(await readFile(projectPath, 'utf8'))
  } else {
    const audio = process.argv[2]
    if (!audio || audio.startsWith('--')) throw new Error('usage: render-cli <audio> [--tracklist file] [--out file.mp4]')
    process.stdout.write('Analysing audio… ')
    const { duration, waveform } = await analyseAudio(resolve(audio))
    console.log(`${duration.toFixed(1)}s`)
    const tl = arg('tracklist')
    const tracks = tl ? entriesToTracks(parseTracklist(await readFile(tl)), duration) : []
    project = { version: 1, audioPath: resolve(audio), audioName: basename(audio), duration, waveform, tracks, settings: { ...DEFAULT_SETTINGS } }
  }
  const s = project.settings
  if (arg('width')) s.width = +arg('width')!
  if (arg('height')) s.height = +arg('height')!
  if (arg('fps')) s.fps = +arg('fps')!
  if (arg('dj')) s.djName = arg('dj')!
  if (arg('title')) s.setTitle = arg('title')!
  if (arg('seconds')) project.duration = Math.min(project.duration, +arg('seconds')!)

  const out = resolve(arg('out') ?? 'set.mp4')
  const root = resolve(__dirname, '..')
  let last = 0
  await exportVideo(project, out, {
    workerPath: join(root, 'scripts/render-worker.cjs'),
    fontDir: join(root, 'resources/fonts'),
    parallel: arg('parallel') ? +arg('parallel')! : undefined,
    onProgress: (p) => {
      if (Date.now() - last < 2000 && p.stage === 'rendering') return
      last = Date.now()
      console.log(`${p.stage} ${p.frame}/${p.totalFrames} ${p.fps.toFixed(1)} fps, eta ${Math.round(p.etaSec)}s ${p.message ?? ''}`)
    }
  })
  console.log('Wrote', out)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
