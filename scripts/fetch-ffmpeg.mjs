// Downloads a static ffmpeg with NVIDIA's encoder (h264_nvenc) into resources/ffmpeg/<platform>-<arch>/,
// which electron-builder ships next to the app. The ffmpeg-static package is built without NVENC.
// Builds: https://github.com/BtbN/FFmpeg-Builds (GPL). Usage: node scripts/fetch-ffmpeg.mjs [--force]
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const VERSION = 'n8.1'
const BUILDS = {
  'linux-x64': { file: `ffmpeg-${VERSION}-latest-linux64-gpl-8.1.tar.xz`, exe: 'ffmpeg' },
  'win32-x64': { file: `ffmpeg-${VERSION}-latest-win64-gpl-8.1.zip`, exe: 'ffmpeg.exe' }
}

const key = `${process.platform}-${process.arch}`
const build = BUILDS[key]
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'resources', 'ffmpeg', key)
const target = join(dest, build?.exe ?? 'ffmpeg')

if (!build) {
  console.log(`No NVENC ffmpeg build for ${key}; the app will use the bundled ffmpeg-static.`)
} else if (existsSync(target) && !process.argv.includes('--force')) {
  console.log(`NVENC ffmpeg already at ${target}`)
} else {
  const url = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${build.file}`
  const work = mkdtempSync(join(tmpdir(), 'setvis-ffmpeg-'))
  try {
    const archive = join(work, build.file)
    console.log(`Downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))
    const out = join(work, 'x')
    mkdirSync(out)
    execFileSync('tar', ['-xf', archive, '-C', out], { stdio: 'inherit' })
    const top = join(out, readdirSync(out)[0], 'bin', build.exe)
    mkdirSync(dest, { recursive: true })
    renameSync(top, target)
    if (process.platform !== 'win32') chmodSync(target, 0o755)
    console.log(`NVENC ffmpeg ready at ${target}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
