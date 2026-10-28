import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readSpectrum, readWaveform, writeSpectrum, writeWaveform } from '../src/main/analysisCache'

describe('analysis cache', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setvis-cache-'))
  const audio = join(dir, 'set.wav')
  await writeFile(audio, 'not really audio')
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('round-trips a waveform at 3 decimals', async () => {
    const wf = { rate: 50, peaks: [0, 0.5, 1], rms: [0.123, 0.456, 0.789], bass: [0.001, 0.999, 0.3], vocal: [0.25, 0.5, 0.75] }
    await writeWaveform(join(dir, 'c'), audio, wf)
    expect(await readWaveform(join(dir, 'c'), audio)).toEqual(wf)
  })

  it('keeps older waveforms without a vocal band', async () => {
    const wf = { rate: 50, peaks: [1], rms: [0.5], bass: [0.2] }
    await writeWaveform(join(dir, 'd'), audio, wf)
    expect(await readWaveform(join(dir, 'd'), audio)).toEqual({ ...wf, vocal: undefined })
  })

  it('round-trips spectral frames', async () => {
    const s = { fps: 4, frames: [Float32Array.of(1, 2), Float32Array.of(3, 4)], power: [Float32Array.of(5, 6, 7), Float32Array.of(8, 9, 10)] }
    await writeSpectrum(join(dir, 'c'), audio, s)
    const r = await readSpectrum(join(dir, 'c'), audio)
    expect(r?.fps).toBe(4)
    expect(r?.frames.map((f) => [...f])).toEqual([[1, 2], [3, 4]])
    expect(r?.power?.map((f) => [...f])).toEqual([[5, 6, 7], [8, 9, 10]])
  })

  it('misses once the recording changes or is gone', async () => {
    await utimes(audio, new Date(), new Date(Date.now() + 5000))
    expect(await readWaveform(join(dir, 'c'), audio)).toBeNull()
    expect(await readWaveform(join(dir, 'c'), join(dir, 'missing.wav'))).toBeNull()
  })
})
