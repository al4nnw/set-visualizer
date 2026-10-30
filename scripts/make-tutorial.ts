/**
 * Cuts the clip the shortcuts tutorial plays (Help ▸ Shortcuts Tutorial) out of a recorded set.
 *   npm run make-tutorial -- <set.wav> <set.cue> [--track 3] [--from 0:41:00] [--minutes 8]
 * By default the clip starts 20 s before the cue of track 3 and runs 8 minutes, so it holds a couple
 * of transitions. Writes resources/tutorial/tutorial.mp3 and tutorial.cue (times shifted to the clip).
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseTime } from '../src/shared/layout'
import { dropRepeatedLoads, parseTracklist } from '../src/shared/tracklist'
import { ffmpegPath } from './ffmpeg/ffmpeg'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const hms = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

async function main() {
  const [audio, cuePath] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
  if (!audio || !cuePath) throw new Error('usage: make-tutorial <set.wav> <set.cue> [--track 3] [--from h:mm:ss] [--minutes 8]')
  // Rekordbox logs a song again when its deck goes back on air; the app drops those repeats on import too.
  const entries = dropRepeatedLoads(parseTracklist(await readFile(cuePath)).filter((e) => e.start !== undefined))
  if (entries.length < 3) throw new Error('The cue sheet needs at least 3 timed tracks')
  const track = Math.max(2, Math.min(entries.length, Number(arg('track') ?? 3)))
  const from = arg('from') ? parseTime(arg('from')!) : Math.max(0, entries[track - 1].start! - 20)
  const length = Number(arg('minutes') ?? 8) * 60
  if (Number.isNaN(from)) throw new Error('Bad --from time')

  // The track already playing when the clip starts begins at 0, then every cue inside the clip.
  const before = entries.filter((e) => e.start! <= from)
  const inside = entries.filter((e) => e.start! > from && e.start! < from + length)
  const kept = [...before.slice(-1).map((e) => ({ ...e, start: from })), ...inside]

  const outDir = resolve(__dirname, '..', 'resources', 'tutorial')
  await mkdir(outDir, { recursive: true })
  const outAudio = join(outDir, 'tutorial.mp3')
  await new Promise<void>((ok, fail) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(from), '-t', String(length), '-i', resolve(audio), '-c:a', 'libmp3lame', '-b:a', '256k', outAudio], { stdio: 'inherit' })
    p.on('error', fail)
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`))))
  })

  const q = (s: string) => s.replace(/"/g, "'")
  const lines = ['REM RECORDED_BY "rekordbox-dj"', 'TITLE "Shortcuts tutorial"', 'FILE "tutorial.mp3" MP3']
  kept.forEach((e, i) => {
    lines.push(`\tTRACK ${String(i + 1).padStart(2, '0')} AUDIO`, `\t\tTITLE "${q(e.title)}"`, `\t\tPERFORMER "${q(e.artist)}"`, `\t\tINDEX 01 ${hms(e.start! - from)}`)
  })
  await writeFile(join(outDir, 'tutorial.cue'), lines.join('\n') + '\n')
  console.log(`Wrote ${outAudio} (${length / 60} min from ${hms(from)}, ${kept.length} tracks) and tutorial.cue`)
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
