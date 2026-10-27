import { spawn } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

// Inside a packaged app the binaries live next to the asar archive, not in it.
const unpacked = (p: string) => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

export const ffmpegPath = unpacked(process.env.SETVIS_FFMPEG || (ffmpegStatic as unknown as string) || 'ffmpeg')
export const ffprobePath = unpacked(process.env.SETVIS_FFPROBE || ffprobeStatic.path || 'ffprobe')

/** Runs ffmpeg and collects stdout into a Buffer. */
export function runFfmpeg(args: string[], signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], { signal })
    const out: Buffer[] = []
    let err = ''
    p.stdout.on('data', (d: Buffer) => out.push(d))
    p.stderr.on('data', (d: Buffer) => (err += d.toString()))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-800)}`))))
  })
}

export async function probeDuration(file: string): Promise<number> {
  const out = await new Promise<string>((resolve, reject) => {
    const p = spawn(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file])
    let s = ''
    let e = ''
    p.stdout.on('data', (d) => (s += d))
    p.stderr.on('data', (d) => (e += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(s) : reject(new Error(e || `ffprobe exited ${code}`))))
  })
  const d = parseFloat(JSON.parse(out).format?.duration)
  if (!Number.isFinite(d)) throw new Error('Could not read the audio duration')
  return d
}
