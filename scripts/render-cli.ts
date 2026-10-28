/**
 * Headless export, handy for testing and the first step toward a server/web version.
 *   npm run render -- <audio> [--tracklist list.cue] [--project set.djvis] [--out set.mp4]
 *                      [--seconds 120] [--width 1280 --height 720] [--fps 30] [--dj "Name"] [--title "Set title"]
 *                      [--from 0:41:30] [--portrait] [--no-set-wave] [--no-deck-wave]
 *                      [--curve auto|smooth|snappy|anticipate|spring] [--swap 1.4]
 * --from renders `--seconds` (default 15) starting there, for a quick preview clip.
 * --plans prints the swap curve and length auto picks for each transition.
 * --portrait makes a 9:16 phone video at the project's resolution (1920x1080 becomes 1080x1920).
 */
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { analyseAudio } from '../src/main/audio'
import { exportVideo } from '../src/node/exporter'
import { formatTime, mainTracks, parseTime, SWAP_CURVES } from '../src/shared/layout'
import { buildMotion } from '../src/shared/motion'
import { planSwaps } from '../src/shared/swapPlan'
import { entriesToTracks, parseTracklist } from '../src/shared/tracklist'
import { DEFAULT_SETTINGS, type Project, type SwapCurve } from '../src/shared/types'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const projectPath = arg('project')
  let project: Project
  if (projectPath) {
    project = JSON.parse(await readFile(projectPath, 'utf8'))
    project.settings = { ...DEFAULT_SETTINGS, ...project.settings }
    if (!project.waveform.vocal) {
      process.stdout.write('Analysing the vocal band (project is from an older version)… ')
      project.waveform = (await analyseAudio(project.audioPath)).waveform
      console.log('done')
    }
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
  const flag = (name: string) => process.argv.includes(`--${name}`)
  if (flag('portrait') && s.width > s.height) [s.width, s.height] = [s.height, s.width]
  if (flag('no-set-wave')) s.showSetWave = false
  if (flag('no-deck-wave')) s.showDeckWave = false
  const curve = arg('curve')
  if (curve) {
    if (curve !== 'auto' && !(curve in SWAP_CURVES)) throw new Error(`--curve must be auto or one of ${Object.keys(SWAP_CURVES).join(', ')}`)
    s.swapCurve = curve as SwapCurve
  }
  if (arg('swap')) s.swapDuration = +arg('swap')!
  if (flag('plans') && (s.swapCurve ?? 'auto') === 'auto') {
    const sorted = mainTracks(project.tracks)
    planSwaps(sorted, s, buildMotion(project.waveform)).forEach((p, i) => {
      if (p) console.log(`swap ${i + 1} ${formatTime(sorted[i].start)} ${sorted[i].title}: ${p.curve} ${p.duration.toFixed(2)} s (${p.reason})`)
    })
  }
  const fromArg = arg('from')
  const from = fromArg !== undefined ? parseTime(fromArg) : undefined
  if (from !== undefined && Number.isNaN(from)) throw new Error('Bad --from time')
  const range = from !== undefined ? { from, to: from + Number(arg('seconds') ?? 15) } : undefined
  if (!range && arg('seconds')) project.duration = Math.min(project.duration, +arg('seconds')!)

  const out = resolve(arg('out') ?? 'set.mp4')
  const root = resolve(__dirname, '..')
  let last = 0
  await exportVideo(project, out, {
    workerPath: join(root, 'scripts/render-worker.cjs'),
    fontDir: join(root, 'resources/fonts'),
    parallel: arg('parallel') ? +arg('parallel')! : undefined,
    range,
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
