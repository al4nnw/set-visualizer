import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { QUALITY_BPP, type Project } from '@shared/types'

/**
 * Pipes raw NV12 frames into an ffmpeg with NVIDIA's encoder (h264_nvenc), which encodes them and
 * muxes the audio in one go. Runs in the preload, inside the renderer process, so the frames don't
 * have to be copied over IPC to the main process (a 4K frame is 12 MB).
 */
export interface GpuExport {
  /** Writes one NV12 frame; resolves when ffmpeg is ready for more. */
  write(frame: Uint8Array): Promise<void>
  finish(): Promise<void>
  abort(): void
}

export function startGpuExport(bin: string, project: Project, outPath: string): GpuExport {
  const { width: W, height: H, fps, quality } = project.settings
  const bitrate = Math.round(W * H * fps * (QUALITY_BPP[quality] ?? 0.13))
  const p: ChildProcessWithoutNullStreams = spawn(bin, [
    '-hide_banner', '-loglevel', 'error', '-y',
    // NV12, converted from the canvas on the GPU by the render worker (see nv12.ts).
    '-f', 'rawvideo', '-pix_fmt', 'nv12', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-i', project.audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr',
    '-b:v', String(bitrate), '-maxrate', String(Math.round(bitrate * 1.5)), '-bufsize', String(bitrate * 2),
    '-profile:v', 'high', '-g', String(fps * 2), '-bf', '2',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
    '-t', String(project.duration), '-movflags', '+faststart', outPath
  ])
  let err = ''
  let failed: Error | null = null
  const closed = new Promise<void>((resolve, reject) => {
    p.on('error', (e) => {
      failed = e
      reject(e)
    })
    p.on('close', (code) => {
      if (code === 0) return resolve()
      failed = new Error(`GPU encoder (ffmpeg h264_nvenc) failed: ${err.slice(-800)}`)
      reject(failed)
    })
  })
  closed.catch(() => {})
  p.stderr.on('data', (d) => (err += d))
  p.stdin.on('error', () => {}) // reported through `closed`

  return {
    write(frame) {
      if (failed) return Promise.reject(failed)
      return new Promise((resolve, reject) => {
        const ok = p.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength))
        if (ok) return resolve()
        const onDrain = () => {
          p.removeListener('close', onClose)
          resolve()
        }
        const onClose = () => {
          p.stdin.removeListener('drain', onDrain)
          reject(failed ?? new Error('GPU encoder stopped'))
        }
        p.stdin.once('drain', onDrain)
        p.once('close', onClose)
      })
    },
    async finish() {
      p.stdin.end()
      await closed
    },
    abort() {
      p.kill('SIGKILL')
    }
  }
}
