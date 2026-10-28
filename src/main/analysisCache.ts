import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpectralFrames } from '@shared/takeover'
import type { Waveform } from '@shared/types'

/**
 * Analysis results kept per audio file in the user data folder, so projects don't carry the
 * waveform and takeover detection doesn't decode the set again. Binary: a 4-byte header length,
 * a JSON header, then float32 data. Keyed by path, size and modification time, so an edited or
 * replaced recording is analysed again.
 */

/** Analysed sets kept; older ones are removed when a new one is written. */
const MAX_SETS = 20

async function keyFor(audioPath: string) {
  const s = await stat(audioPath)
  return createHash('sha1').update(`${audioPath}\0${s.size}\0${s.mtimeMs}`).digest('hex').slice(0, 24)
}

function pack(header: object, arrays: ArrayLike<number>[]): Buffer {
  const head = Buffer.from(JSON.stringify(header))
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const data = new Float32Array(total)
  let o = 0
  for (const a of arrays) {
    data.set(a, o)
    o += a.length
  }
  const len = Buffer.alloc(4)
  len.writeUInt32LE(head.length)
  return Buffer.concat([len, head, Buffer.from(data.buffer)])
}

function unpack<H>(buf: Buffer): { header: H; data: Float32Array } {
  const n = buf.readUInt32LE(0)
  const header = JSON.parse(buf.subarray(4, 4 + n).toString()) as H
  const start = 4 + n
  // Copied out so the floats are 4-byte aligned whatever the header length.
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + buf.length))
  return { header, data }
}

async function write(dir: string, name: string, buf: Buffer) {
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `${name}.${process.pid}.tmp`)
  await writeFile(tmp, buf)
  await rename(tmp, join(dir, name))
  await prune(dir).catch(() => {})
}

async function prune(dir: string) {
  const names = (await readdir(dir)).filter((n) => /\.(wave|spec)$/.test(n))
  const sets = new Map<string, number>()
  for (const n of names) {
    const t = (await stat(join(dir, n))).mtimeMs
    const k = n.replace(/\.\w+$/, '')
    sets.set(k, Math.max(sets.get(k) ?? 0, t))
  }
  const old = [...sets].sort((a, b) => b[1] - a[1]).slice(MAX_SETS)
  for (const [k] of old) for (const ext of ['wave', 'spec']) await unlink(join(dir, `${k}.${ext}`)).catch(() => {})
}

const read = (dir: string, name: string) => readFile(join(dir, name)).catch(() => null)

type WaveKey = 'peaks' | 'rms' | 'bass' | 'vocal'
interface WaveHeader {
  v: 1
  rate: number
  lengths: Partial<Record<WaveKey, number>>
}

export async function writeWaveform(dir: string, audioPath: string, wf: Waveform) {
  const keys = (['peaks', 'rms', 'bass', 'vocal'] as const).filter((k) => wf[k])
  const header: WaveHeader = { v: 1, rate: wf.rate, lengths: Object.fromEntries(keys.map((k) => [k, wf[k]!.length])) }
  await write(dir, `${await keyFor(audioPath)}.wave`, pack(header, keys.map((k) => wf[k]!)))
}

/** The waveform analysed for this file, or null when it hasn't been (or the file changed since). */
export async function readWaveform(dir: string, audioPath: string): Promise<Waveform | null> {
  const buf = await read(dir, `${await keyFor(audioPath).catch(() => '')}.wave`)
  if (!buf) return null
  const { header, data } = unpack<WaveHeader>(buf)
  const out: Partial<Record<WaveKey, number[]>> = {}
  let o = 0
  for (const k of ['peaks', 'rms', 'bass', 'vocal'] as const) {
    const n = header.lengths[k]
    if (n === undefined) continue
    // Back to the 3 decimals the analysis rounds to (float32 can't hold them exactly).
    out[k] = Array.from(data.subarray(o, o + n), (v) => Math.round(v * 1000) / 1000)
    o += n
  }
  if (!out.peaks || !out.rms || !out.bass) return null
  return { rate: header.rate, peaks: out.peaks, rms: out.rms, bass: out.bass, vocal: out.vocal }
}

interface SpecHeader {
  v: 1
  fps: number
  count: number
  bands: number
  powerBands: number
}

export async function writeSpectrum(dir: string, audioPath: string, s: SpectralFrames) {
  const bands = s.frames[0]?.length ?? 0
  const powerBands = s.power?.[0]?.length ?? 0
  const header: SpecHeader = { v: 1, fps: s.fps, count: s.frames.length, bands, powerBands }
  await write(dir, `${await keyFor(audioPath)}.spec`, pack(header, [...s.frames, ...(s.power ?? [])]))
}

export async function readSpectrum(dir: string, audioPath: string): Promise<SpectralFrames | null> {
  const buf = await read(dir, `${await keyFor(audioPath).catch(() => '')}.spec`)
  if (!buf) return null
  const { header: h, data } = unpack<SpecHeader>(buf)
  const frames = Array.from({ length: h.count }, (_, i) => data.subarray(i * h.bands, (i + 1) * h.bands))
  const base = h.count * h.bands
  const power = h.powerBands ? Array.from({ length: h.count }, (_, i) => data.subarray(base + i * h.powerBands, base + (i + 1) * h.powerBands)) : undefined
  return { fps: h.fps, frames, power }
}
