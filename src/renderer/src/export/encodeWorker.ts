/// <reference lib="webworker" />
import { drawFrame, prepareScene, type Ctx, type PreparedScene } from '@shared/scene'
import { QUALITY_BPP, type Project } from '@shared/types'
import { loadArtMap, loadSceneFonts, offscreenFactory } from '../sceneAssets'

/**
 * One of the export's render workers (see runExport.ts). It draws frames with the same scene code
 * as the preview and encodes them with WebCodecs H.264. An export runs several of these at once,
 * each taking the next stretch of frames (a "part") when it's free, so every core draws and
 * encodes; the page puts the parts back in order. A part starts on a keyframe, so the parts join
 * into one stream.
 */

interface StartMsg {
  type: 'start'
  project: Project
  fonts: Array<{ weight: string; url: string }>
  /** Frames [firstFrame, endFrame) of the set: the whole export, for the completion line. */
  firstFrame: number
  endFrame: number
}

interface PartMsg {
  type: 'part'
  index: number
  /** Frames [from, to) of the set. */
  from: number
  to: number
}

let cancelled = false

const CODECS = ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.640028', 'avc1.4d0034', 'avc1.42e034', 'avc1.42e028']

async function pickConfig(width: number, height: number, fps: number, bpp: number): Promise<VideoEncoderConfig> {
  // 'high' (0.13 bpp) is ~8 Mbps at 1080p30, YouTube's recommended upload bitrate.
  const bitrate = Math.round(width * height * fps * bpp)
  for (const codec of CODECS) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration,
        latencyMode: 'quality',
        avc: { format: 'annexb' }
      }
      try {
        const s = await VideoEncoder.isConfigSupported(config)
        if (s.supported) return config
      } catch {
        // try the next one
      }
    }
  }
  throw new Error('This computer cannot encode H.264 with WebCodecs. Try a lower resolution.')
}

let job: {
  prep: PreparedScene
  canvas: OffscreenCanvas
  ctx: Ctx
  encoder: VideoEncoder
  fps: number
  firstFrame: number
  /** The part whose frames the encoder is giving back now (-1: the test frame). */
  part: number
  /** The first decoder config the encoder gave, sent with the start of every part. */
  decoderConfig?: VideoDecoderConfig
  sentConfig: boolean
  error: Error | null
} | null = null

async function start(msg: StartMsg) {
  const { project } = msg
  const { width: W, height: H, fps } = project.settings
  await loadSceneFonts(msg.fonts)
  const prep = prepareScene(project, await loadArtMap(project), offscreenFactory, { from: msg.firstFrame / fps, to: msg.endFrame / fps })
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { alpha: false }) as unknown as Ctx
  const config = await pickConfig(W, H, fps, QUALITY_BPP[project.settings.quality] ?? 0.13)
  const frameDur = 1e6 / fps
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const buf = new Uint8Array(chunk.byteLength)
      chunk.copyTo(buf)
      // Timing and the decoder config, for the page to put the MP4 together.
      const c = meta?.decoderConfig
      const j = job!
      if (c && !j.decoderConfig) j.decoderConfig = { codec: c.codec, codedWidth: c.codedWidth, codedHeight: c.codedHeight }
      if (j.part < 0) return
      // Whichever part ends up first in the file has to carry it.
      const decoderConfig = j.sentConfig ? undefined : j.decoderConfig
      j.sentConfig = true
      postMessage({ type: 'chunk', part: j.part, data: buf, timestamp: chunk.timestamp, duration: chunk.duration ?? Math.round(frameDur), key: chunk.type === 'key', decoderConfig }, [buf.buffer])
    },
    error: (e) => {
      if (job) job.error = e as Error
    }
  })
  job = { prep, canvas, ctx, encoder, fps, firstFrame: msg.firstFrame, part: -1, error: null, sentConfig: false }
  encoder.configure(config)
  // One test frame, so an encoder that can't run here (a hardware encoder can have only a few
  // sessions at once) fails now, while the page can still go on with fewer workers.
  const test = new VideoFrame(canvas, { timestamp: 0, duration: Math.round(frameDur) })
  encoder.encode(test, { keyFrame: true })
  test.close()
  await encoder.flush()
  if (job.error) throw job.error
  postMessage({ type: 'ready', codec: config.codec, hardware: config.hardwareAcceleration })
}

async function renderPart(msg: PartMsg) {
  const j = job!
  const { fps, encoder } = j
  const frameDur = 1e6 / fps
  j.part = msg.index
  j.sentConfig = false
  let pending = 0
  for (let f = msg.from; f < msg.to; f++) {
    if (cancelled) return
    if (j.error) throw j.error
    // Timestamps count from the start of the export, so the parts line up end to end.
    const n = f - j.firstFrame
    drawFrame(j.ctx, j.prep, f / fps)
    const frame = new VideoFrame(j.canvas, { timestamp: Math.round(n * frameDur), duration: Math.round(frameDur) })
    // Every part starts on a keyframe; inside one, a keyframe every 2 s as before.
    encoder.encode(frame, { keyFrame: f === msg.from || n % (fps * 2) === 0 })
    frame.close()
    if (++pending >= 15) {
      postMessage({ type: 'progress', frames: pending })
      pending = 0
    }
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1))
  }
  // Everything of this part out before the next one starts.
  await encoder.flush()
  if (j.error) throw j.error
  postMessage({ type: 'progress', frames: pending })
  postMessage({ type: 'partDone', index: msg.index })
}

const fail = (err: Error) => postMessage({ type: 'error', message: err.message })

self.onmessage = (e: MessageEvent) => {
  const m = e.data
  if (m.type === 'cancel') cancelled = true
  if (m.type === 'start') start(m as StartMsg).catch((err: Error) => postMessage({ type: 'startFailed', message: err.message }))
  if (m.type === 'part') renderPart(m as PartMsg).catch(fail)
}
