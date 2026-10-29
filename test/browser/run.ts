/**
 * Checks the web app's analysis (src/renderer/src/analysis: browser decoders and worker threads)
 * against the desktop app's ffmpeg analysis, in a real browser engine:
 *   npm run test:browser                          a synthetic set in every format the browser decodes
 *   npm run test:browser -- set.wav [--cue set.cue]  your own recordings (a cue checks takeovers too)
 * Options: --browser electron|chromium (Chromium needs Playwright installed), --threads n.
 * Electron is Chromium with the codecs Chrome has (AAC included). On Linux without a display, run
 * it under xvfb-run. Needs ffmpeg (ffmpeg-static, or SETVIS_FFMPEG / SETVIS_FFPROBE).
 */
import { spawn } from 'node:child_process'
import { createReadStream, statSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { build } from 'vite'
import { analyseAudio } from '../../src/main/audio'
import { runFfmpeg } from '../../src/main/ffmpeg'
import { unpackSpectrum } from '../../src/shared/analysis'
import { dropRepeatedLoads, parseTracklist } from '../../src/shared/tracklist'
import { cuesFrom, diffAnalyses, formatDiff, type AnalysisDiff, type Cues } from '../../scripts/analysisDiff'

const root = resolve(__dirname, '../..')
const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const files = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))

/** A synthetic set: three "tracks" with different sounds, crossfaded over 16 s, and its cue sheet. */
async function synthesise(dir: string) {
  const a = '0.7*sin(2*PI*52*t)*exp(-9*mod(t,0.48))+0.25*sin(2*PI*110*t+2*sin(2*PI*0.5*t))*lt(mod(t,0.96),0.5)+0.08*(random(0)-0.5)*exp(-40*mod(t+0.24,0.48))'
  const b = '0.6*sin(2*PI*60*t)*exp(-12*mod(t,0.469))+0.22*sin(2*PI*659*t)*(0.5+0.5*sin(2*PI*0.25*t))+0.18*sin(2*PI*880*t+3*sin(2*PI*5*t))*lt(mod(t,1.876),0.9)+0.06*(random(0)-0.5)'
  const c = '0.65*sin(2*PI*45*t)*exp(-7*mod(t,0.5))*lt(mod(t,2),1.5)+0.2*(sin(2*PI*330*t)+sin(2*PI*415*t)+sin(2*PI*494*t))*exp(-3*mod(t,1))/3+0.1*(random(0)-0.5)*exp(-25*mod(t+0.25,0.5))'
  const wav = join(dir, 'synth.wav')
  await runFfmpeg([
    ...['-f', 'lavfi', '-i', `aevalsrc='${a}|(${a})*0.9':s=44100:d=80`],
    ...['-f', 'lavfi', '-i', `aevalsrc='(${b})*0.95|${b}':s=44100:d=80`],
    ...['-f', 'lavfi', '-i', `aevalsrc='${c}|${c}':s=44100:d=80`],
    ...['-filter_complex', '[0][1]acrossfade=d=16:c1=tri:c2=tri[ab];[ab][2]acrossfade=d=16:c1=tri:c2=tri,volume=0.8[o]', '-map', '[o]', '-c:a', 'pcm_s16le', '-y', wav]
  ])
  const cue = join(dir, 'synth.cue')
  const track = (n: number, title: string, artist: string, at: string) => `\tTRACK 0${n} AUDIO\n\t\tTITLE "${title}"\n\t\tPERFORMER "${artist}"\n\t\tINDEX 01 ${at}\n`
  await writeFile(cue, `REM RECORDED_BY "rekordbox-dj"\nTITLE "Synthetic set"\nFILE "synth.wav" WAVE\n${track(1, 'Kick and bass', 'A', '00:00:00')}${track(2, 'Lead', 'B', '00:01:04')}${track(3, 'Chords', 'C', '00:02:08')}`)
  // The formats a set might come in, from the encoders ffmpeg has.
  const variants: Array<[string, string[]]> = [
    ['synth-48k-24bit.wav', ['-ar', '48000', '-c:a', 'pcm_s24le']],
    ['synth.aiff', ['-c:a', 'pcm_s16be']],
    ['synth.mp3', ['-c:a', 'libmp3lame', '-q:a', '2']],
    ['synth.flac', ['-c:a', 'flac']],
    ['synth.m4a', ['-c:a', 'aac', '-b:a', '256k']],
    ['synth.opus', ['-c:a', 'libopus', '-b:a', '160k']],
    ['synth.ogg', ['-c:a', 'libvorbis', '-q:a', '6']],
    ['synth.webm', ['-c:a', 'libopus', '-b:a', '160k']]
  ]
  const out = [wav]
  for (const [name, args] of variants) {
    await runFfmpeg(['-i', wav, ...args, '-y', join(dir, name)])
    out.push(join(dir, name))
  }
  // A codec browsers don't decode, for the error the user gets.
  const unsupported = join(dir, 'synth-ac3.mka')
  await runFfmpeg(['-i', wav, '-t', '10', '-c:a', 'ac3', '-y', unsupported])
  return { files: out, cue, unsupported }
}

/** Serves the harness build and the recordings (by index) to the browser. */
function serve(dir: string, media: string[]) {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript' }
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const m = /^\/media\/(\d+)\//.exec(path)
    const file = m ? media[Number(m[1])] : join(dir, path)
    if (!file || (!m && !file.startsWith(dir))) return res.writeHead(404).end()
    try {
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'content-length': statSync(file).size })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise<{ url: string; close: () => void }>((ok) =>
    server.listen(0, '127.0.0.1', () => ok({ url: `http://localhost:${(server.address() as AddressInfo).port}`, close: () => server.close() }))
  )
}

interface Browser {
  name: string
  evaluate<T>(expr: string): Promise<T>
  close(): Promise<void>
}

async function electron(url: string): Promise<Browser> {
  const bin = (await import('electron')).default as unknown as string
  const args = [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), join(__dirname, 'electron.cjs'), url]
  const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  // Chromium's own log lines ("[pid:date:ERROR:dbus/bus.cc...]") are noise here.
  createInterface({ input: p.stderr! }).on('line', (line) => /^\[\d+:\d+\//.test(line) || console.error(line))
  const waiting = new Map<number, (m: { value?: unknown; error?: string }) => void>()
  let name = 'Electron'
  const ready = new Promise<void>((ok, fail) => {
    p.on('exit', (code) => fail(new Error(`Electron exited (${code})`)))
    createInterface({ input: p.stdout! }).on('line', (line) => {
      let m: { ready?: boolean; id?: number; versions?: { electron: string; chrome: string } }
      try {
        m = JSON.parse(line)
      } catch {
        return
      }
      if (m.ready) {
        name = `Electron ${m.versions!.electron} (Chromium ${m.versions!.chrome})`
        ok()
      } else if (m.id !== undefined) waiting.get(m.id)?.(m)
    })
  })
  await ready
  let next = 0
  return {
    name,
    evaluate: <T>(expr: string) =>
      new Promise<T>((ok, fail) => {
        const id = next++
        waiting.set(id, (m) => (m.error ? fail(new Error(m.error)) : ok(m.value as T)))
        p.stdin!.write(JSON.stringify({ id, expr }) + '\n')
      }),
    close: async () => {
      p.stdin!.end()
      await new Promise((ok) => p.once('exit', ok))
    }
  }
}

async function chromium(url: string): Promise<Browser> {
  const pw = 'playwright'
  const { chromium } = (await import(pw)) as typeof import('playwright')
  const b = await chromium.launch()
  const page = await b.newPage()
  page.on('pageerror', (e) => console.error('[page]', e.message))
  await page.goto(url)
  return { name: `Chromium ${b.version()}`, evaluate: (expr) => page.evaluate(expr), close: () => b.close() }
}

interface BrowserResult {
  duration: number
  codec: string
  ms: number
  waveform: { rate: number; peaks: string; rms: string; bass: string; vocal: string }
  spectrum: { fps: number; count: number; frames: string; power: string }
}

const floats = (b64: string) => {
  const buf = Buffer.from(b64, 'base64')
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
}
// Back to the 3 decimals the analysis rounds to (they went through float32).
const decimals = (b64: string) => Array.from(floats(b64), (v) => Math.round(v * 1000) / 1000)

/** Whether a synthetic-set result is close enough to the desktop's. */
function verdict(d: AnalysisDiff): string[] {
  const bad: string[] = []
  for (const [k, v] of Object.entries(d.waveform)) {
    if (Math.abs(v.lengths[0] - v.lengths[1]) > 1) bad.push(`${k} length ${v.lengths.join(' vs ')}`)
    if (v.over > v.lengths[0] * 0.002) bad.push(`${k}: ${v.over} values off by more than 0.001`)
  }
  if (Math.abs(d.spectrum.frames[0] - d.spectrum.frames[1]) > 1) bad.push(`spectral frames ${d.spectrum.frames.join(' vs ')}`)
  // Browsers decode Opus with libopus and ffmpeg with its own decoder, which differ a little more.
  if (d.spectrum.maxPower > 1e-2) bad.push(`spectral power differs by ${d.spectrum.maxPower.toExponential(1)}`)
  if (d.takeovers && d.takeovers.same < d.takeovers.total) bad.push(`${d.takeovers.total - d.takeovers.same} takeovers differ`)
  return bad
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), 'setvis-browser-'))
  const synthetic = !files.length
  try {
    process.stdout.write('Building the harness… ')
    await build({ configFile: join(__dirname, 'vite.config.ts') })
    console.log('done')
    let inputs = files.map((f) => resolve(f))
    let cuePath = arg('cue')
    let unsupported: string | null = null
    if (synthetic) {
      process.stdout.write('Making the synthetic set… ')
      const s = await synthesise(tmp)
      inputs = s.files
      cuePath = s.cue
      unsupported = s.unsupported
      console.log('done')
    }
    const cues: Cues | undefined = cuePath ? cuesFrom(dropRepeatedLoads(parseTracklist(await readFile(cuePath)))) : undefined
    const media = unsupported ? [...inputs, unsupported] : inputs
    const url = (file: string) => `/media/${media.indexOf(file)}/${basename(file)}`
    const server = await serve(join(root, 'out/browser-test'), media)
    const page = `${server.url}/harness.html`
    const browser = arg('browser') === 'chromium' ? await chromium(page) : await electron(page)
    console.log(`Browser: ${browser.name}\n`)
    const threads = arg('threads') ? Number(arg('threads')) : undefined
    const failures: string[] = []
    try {
      await browser.evaluate('new Promise((ok) => { const t = () => (window.harness ? ok(true) : setTimeout(t, 50)); t() })')
      for (const file of inputs) {
        console.log(`== ${basename(file)} (${(statSync(file).size / 1e6).toFixed(1)} MB)`)
        let t = performance.now()
        const desktop = await analyseAudio(file, undefined, { spectrum: true })
        const desktopS = (performance.now() - t) / 1000
        t = performance.now()
        let r: BrowserResult
        try {
          r = await browser.evaluate<BrowserResult>(`harness.analyse(${JSON.stringify(url(file))}, ${JSON.stringify({ threads })})`)
        } catch (e) {
          console.log(`  browser analysis failed: ${(e as Error).message}\n`)
          failures.push(`${basename(file)}: ${(e as Error).message}`)
          continue
        }
        const b = {
          duration: r.duration,
          waveform: { rate: r.waveform.rate, peaks: decimals(r.waveform.peaks), rms: decimals(r.waveform.rms), bass: decimals(r.waveform.bass), vocal: decimals(r.waveform.vocal) },
          spectrum: unpackSpectrum({ fps: r.spectrum.fps, count: r.spectrum.count, frames: floats(r.spectrum.frames), power: floats(r.spectrum.power) })
        }
        console.log(
          `  ${desktop.duration.toFixed(2)} s; ffmpeg ${desktopS.toFixed(2)} s, browser (${r.codec}) ${(r.ms / 1000).toFixed(2)} s = ${(r.duration / (r.ms / 1000)).toFixed(0)}x realtime` +
            (Math.abs(r.duration - desktop.duration) > 0.001 ? `; duration ${r.duration.toFixed(3)} vs ${desktop.duration.toFixed(3)}` : '')
        )
        const d = diffAnalyses({ ...desktop, spectrum: desktop.spectrum! }, b, cues)
        console.log(formatDiff(d).replace(/^/gm, '  '))
        const bad = verdict(d)
        if (bad.length) failures.push(`${basename(file)}: ${bad.join('; ')}`)
        console.log(bad.length ? `  ✗ ${bad.join('; ')}\n` : '  ✓ matches\n')
      }
      if (unsupported) {
        console.log('== Cancelling, and files that can\'t be analysed')
        const mp3 = inputs.find((f) => f.endsWith('.mp3'))!
        const got = await browser.evaluate<Record<string, unknown>>(`harness.failures(${JSON.stringify({ pcm: url(inputs[0]), compressed: url(mp3), unsupported: url(unsupported) })})`)
        const expected: Record<string, unknown> = {
          cancelPcm: ['cancelled', 'finished'],
          cancelCompressed: ['cancelled', 'finished'],
          notAudio: 'format',
          unsupported: 'codec:ac3'
        }
        for (const [k, want] of Object.entries(expected)) {
          const ok = JSON.stringify(got[k]) === JSON.stringify(want)
          console.log(`  ${ok ? '✓' : '✗'} ${k}: ${JSON.stringify(got[k])}`)
          if (!ok) failures.push(`${k}: ${JSON.stringify(got[k])}, expected ${JSON.stringify(want)}`)
        }
        console.log()
      }
    } finally {
      await browser.close()
      server.close()
    }
    if (failures.length) {
      console.log(`${failures.length} failed:\n  ${failures.join('\n  ')}`)
      if (synthetic) process.exitCode = 1
    } else console.log(`All ${inputs.length} match the desktop analysis${unsupported ? ', and failures are reported right' : ''}.`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
