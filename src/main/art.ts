import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { ffmpegPath, runFfmpeg } from './ffmpeg'

/** Finds black bars (YouTube thumbnails are often 4:3 around a 16:9 frame). Returns an ffmpeg crop filter or null. */
function detectCrop(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loop', '1', '-i', file, '-frames:v', '3', '-vf', 'cropdetect=limit=0.08:round=2', '-f', 'null', '-'])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', () => resolve(null))
    p.on('close', () => {
      const all = [...err.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
      const m = all[all.length - 1]
      resolve(m && +m[1] > 16 && +m[2] > 16 ? `crop=${m[1]}:${m[2]}:${m[3]}:${m[4]}` : null)
    })
  })
}

/** Re-encodes any image as a JPEG of at most 1200px, trimming black bars. */
export async function normaliseImage(data: Buffer): Promise<Buffer> {
  const dir = join(tmpdir(), `setvis-img-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  const src = join(dir, 'src')
  try {
    await writeFile(src, data)
    const crop = await detectCrop(src)
    const vf = [crop, "scale='min(1200,iw)':'min(1200,ih)':force_original_aspect_ratio=decrease"].filter(Boolean).join(',')
    return await runFfmpeg(['-i', src, '-vf', vf, '-frames:v', '1', '-q:v', '2', '-f', 'image2', '-c:v', 'mjpeg', '-'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 SetVisualizer' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const save = async (jpg: Buffer, dir: string) => {
  await mkdir(dir, { recursive: true })
  const file = join(dir, createHash('sha1').update(jpg).digest('hex').slice(0, 16) + '.jpg')
  await writeFile(file, jpg)
  return file
}

export async function downloadArt(url: string, dir: string): Promise<string> {
  let data: Buffer
  try {
    data = await fetchImage(url)
  } catch (e) {
    // Not every YouTube video has a maxres thumbnail.
    if (url.includes('maxresdefault')) data = await fetchImage(url.replace('maxresdefault', 'hqdefault'))
    else throw e
  }
  return save(await normaliseImage(data), dir)
}

export async function importLocalArt(src: string, dir: string): Promise<string> {
  return save(await normaliseImage(await readFile(src)), dir)
}
