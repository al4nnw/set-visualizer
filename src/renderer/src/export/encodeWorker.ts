/// <reference lib="webworker" />
import { drawFrame, prepareScene, type Ctx } from '@shared/scene'
import { QUALITY_BPP, type Project } from '@shared/types'
import { loadArtMap, loadSceneFonts, offscreenFactory } from '../sceneAssets'

interface StartMsg {
  type: 'start'
  project: Project
  fonts: Array<{ weight: string; url: string }>
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
  throw new Error('This computer cannot encode H.264 with WebCodecs. Try a lower resolution, or render with the command-line exporter (npm run render).')
}

async function run(msg: StartMsg) {
  const { project } = msg
  const { width: W, height: H, fps } = project.settings
  await loadSceneFonts(msg.fonts)
  const prep = prepareScene(project, await loadArtMap(project), offscreenFactory)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { alpha: false }) as unknown as Ctx
  const config = await pickConfig(W, H, fps, QUALITY_BPP[project.settings.quality] ?? 0.13)

  let encodeError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const buf = new Uint8Array(chunk.byteLength)
      chunk.copyTo(buf)
      postMessage({ type: 'chunk', data: buf }, [buf.buffer])
    },
    error: (e) => (encodeError = e as Error)
  })
  encoder.configure(config)
  postMessage({ type: 'info', codec: config.codec, hardware: config.hardwareAcceleration })

  const total = Math.ceil(project.duration * fps)
  const frameDur = 1e6 / fps
  let pending = 0
  for (let f = 0; f < total; f++) {
    if (cancelled) {
      encoder.close()
      postMessage({ type: 'cancelled' })
      return
    }
    if (encodeError) throw encodeError
    drawFrame(ctx, prep, f / fps)
    const frame = new VideoFrame(canvas, { timestamp: Math.round(f * frameDur), duration: Math.round(frameDur) })
    encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 })
    frame.close()
    if (++pending >= 15) {
      postMessage({ type: 'progress', frames: pending })
      pending = 0
    }
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1))
  }
  await encoder.flush()
  encoder.close()
  if (encodeError) throw encodeError
  postMessage({ type: 'progress', frames: pending })
  postMessage({ type: 'done' })
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'cancel') cancelled = true
  if (e.data.type === 'start') run(e.data as StartMsg).catch((err: Error) => postMessage({ type: 'error', message: err.message }))
}
