import { ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, EncodedPacket, EncodedVideoPacketSource, getFirstEncodableAudioCodec, Input, Mp4OutputFormat, Output, StreamTarget, type StreamTargetChunk } from 'mediabunny'
import type { ExportRange, ProjectFile } from '@shared/types'
import { leadIn } from '../analysis/decode'
import { i18n } from '../i18n'

/**
 * The MP4 of a web export, put together in the browser: the H.264 the export worker encodes (see
 * ../export/runExport.ts), and the set's own audio for the same stretch, decoded and encoded again
 * as AAC (Opus where the browser has no AAC encoder), as the desktop app does with ffmpeg. It's
 * written as it goes to a file the user picked (Chrome, Edge). Other browsers download it: written
 * first to the page's private storage on disk (a long set's video doesn't fit in memory), or into
 * memory where there's none.
 */

export type VideoTarget = { kind: 'file'; handle: FileSystemFileHandle & { createWritable(): Promise<WritableStream<StreamTargetChunk>> }; name: string } | { kind: 'download'; name: string }

/** Info the export worker sends with each encoded frame. */
export interface ChunkInfo {
  timestamp: number
  duration: number
  key: boolean
  decoderConfig?: VideoDecoderConfig
}

const SCRATCH = 'export-'

/**
 * A file in the page's private storage (OPFS) for a video to download, or null where there's none.
 * Earlier ones are deleted first: they're kept until then so their downloads can finish.
 */
async function scratchFile() {
  try {
    const dir = await navigator.storage.getDirectory()
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) if (name.startsWith(SCRATCH)) await dir.removeEntry(name).catch(() => {})
    return (await dir.getFileHandle(`${SCRATCH}${Date.now()}.mp4`, { create: true })) as FileSystemFileHandle & { createWritable(): Promise<WritableStream<StreamTargetChunk>> }
  } catch {
    return null
  }
}

/** Seconds of audio the muxer is let run ahead of the video, so neither waits in memory for long. */
const AHEAD = 4

export async function startExport(audio: File, p: ProjectFile, target: VideoTarget, range?: ExportRange) {
  const { fps } = p.settings
  // The video starts on a frame boundary, so the audio does too (as on the desktop).
  const firstFrame = Math.floor(Math.max(0, range?.from ?? 0) * fps)
  const endFrame = Math.max(firstFrame + 1, Math.ceil(Math.min(p.duration, range?.to ?? p.duration) * fps))
  const from = firstFrame / fps
  const length = (endFrame - firstFrame) / fps

  const input = new Input({ source: new BlobSource(audio), formats: ALL_FORMATS })
  const track = await input.getPrimaryAudioTrack()
  if (!track) throw new Error(i18n.t('web.noAudio', { name: audio.name }))
  const channels = Math.min(2, track.numberOfChannels)
  const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: channels, sampleRate: track.sampleRate, bitrate: 320_000 })
  if (!codec) throw new Error(i18n.t('web.noAudioEncoder'))
  const offset = (await leadIn(audio)) / track.sampleRate

  const scratch = target.kind === 'download' ? await scratchFile() : null
  const writable = target.kind === 'file' ? await target.handle.createWritable() : scratch ? await scratch.createWritable() : null
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: writable ? false : 'in-memory' }),
    target: writable ? new StreamTarget(writable, { chunked: true }) : new BufferTarget()
  })
  const video = new EncodedVideoPacketSource('avc')
  const sound = new AudioSampleSource({ codec, bitrate: 320_000 })
  output.addVideoTrack(video, { frameRate: fps })
  output.addAudioTrack(sound)
  await output.start()

  // How far the video has got, for the audio to keep pace with.
  let videoAt = 0
  let videoDone = false
  let wake: (() => void) | null = null
  const moved = () => {
    wake?.()
    wake = null
  }
  let stopped = false
  let failed: unknown = null
  const audioDone = (async () => {
    const sink = new AudioSampleSink(track)
    for await (const s of sink.samples(from + offset, from + offset + length)) {
      try {
        if (stopped) break
        // Its part of [from, from + length), in the set's time.
        const t = s.timestamp - offset - from
        const n = s.numberOfFrames
        const a = Math.max(0, Math.round(-t * s.sampleRate))
        const b = Math.min(n, Math.round((length - t) * s.sampleRate))
        if (b <= a) continue
        while (!videoDone && !stopped && t > videoAt + AHEAD) await new Promise<void>((r) => (wake = r))
        const k = b - a
        const data = new Float32Array(k * channels)
        for (let c = 0; c < channels; c++) s.copyTo(data.subarray(c * k, (c + 1) * k), { planeIndex: Math.min(c, s.numberOfChannels - 1), format: 'f32-planar', frameOffset: a, frameCount: k })
        const part = new AudioSample({ data, format: 'f32-planar', numberOfChannels: channels, sampleRate: s.sampleRate, timestamp: Math.max(0, t) })
        await sound.add(part)
        part.close()
      } finally {
        s.close()
      }
    }
  })().catch((e) => {
    failed ??= e
  })

  let queue = Promise.resolve()
  return {
    /** The next encoded frame, in order. */
    chunk(data: Uint8Array, info: ChunkInfo) {
      queue = queue.then(async () => {
        if (failed || stopped) return
        try {
          await video.add(new EncodedPacket(data, info.key ? 'key' : 'delta', info.timestamp / 1e6, info.duration / 1e6), info.decoderConfig ? { decoderConfig: info.decoderConfig } : undefined)
          videoAt = (info.timestamp + info.duration) / 1e6
          moved()
        } catch (e) {
          failed ??= e
        }
      })
    },
    async finish(): Promise<string> {
      await queue
      videoDone = true
      moved()
      if (failed) throw failed
      await audioDone
      if (failed) throw failed
      video.close()
      sound.close()
      await output.finalize()
      input.dispose()
      if (target.kind === 'download') {
        const blob = scratch ? await scratch.getFile() : new Blob([(output.target as BufferTarget).buffer!], { type: 'video/mp4' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = target.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
      }
      return target.name
    },
    async abort() {
      stopped = true
      moved()
      await output.cancel().catch(() => {})
      input.dispose()
    }
  }
}
