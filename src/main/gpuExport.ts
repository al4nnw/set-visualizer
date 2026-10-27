import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { ffmpegPath } from './ffmpeg'

/**
 * Finds an ffmpeg for GPU export (see gpuEncoder.ts). ffmpeg-static has no NVENC, so this looks for
 * another one: $SETVIS_FFMPEG_GPU, the build shipped with the app (scripts/fetch-ffmpeg.mjs),
 * then the system's `ffmpeg`.
 */

/** The NVENC ffmpeg shipped in resources/ffmpeg (extraResources when packaged). */
function bundledNvencFfmpeg(): string | undefined {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const file = app.isPackaged
    ? join(process.resourcesPath, 'ffmpeg', exe)
    : join(app.getAppPath(), 'resources', 'ffmpeg', `${process.platform}-${process.arch}`, exe)
  return existsSync(file) ? file : undefined
}

let probed: Promise<string | null> | null = null

function tryNvenc(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    // A tiny real encode: ffmpeg can list h264_nvenc even when the driver can't run it.
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'])
    const timer = setTimeout(() => p.kill(), 10_000)
    p.on('error', () => resolve(false))
    p.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

/** Path of an ffmpeg that can encode with NVENC on this machine, or null. Checked once per run. */
export function findNvencFfmpeg(): Promise<string | null> {
  probed ??= (async () => {
    const candidates = [process.env.SETVIS_FFMPEG_GPU, bundledNvencFfmpeg(), 'ffmpeg', ffmpegPath].filter((c): c is string => !!c)
    for (const bin of [...new Set(candidates)]) if (await tryNvenc(bin)) return bin
    return null
  })()
  return probed
}
