/// <reference lib="webworker" />
import type { spawn as Spawn } from 'node:child_process'
import type { Project } from '@shared/types'
import { startGpuExport } from '../../../main/gpuEncoder'

/**
 * GPU export writer. Render workers send NV12 frames over their own MessagePorts, possibly out of
 * order; this writes them to the NVENC ffmpeg in order and acks each one back to its sender. It
 * runs with Node enabled (nodeIntegrationInWorker) so it can run ffmpeg itself.
 */

interface StartMsg {
  type: 'start'
  bin: string
  project: Project
  outPath: string
  total: number
  ports: MessagePort[]
}

declare const require: (id: string) => { spawn: typeof Spawn }

self.onmessage = (e: MessageEvent) => {
  if (e.data.type !== 'start') return
  const { bin, project, outPath, total, ports } = e.data as StartMsg
  const job = startGpuExport(require('node:child_process').spawn, bin, project, outPath)
  const waiting = new Map<number, { frame: Uint8Array; port: MessagePort }>()
  let next = 0
  let writing = false
  let failed = false
  let sinceReport = 0

  const fail = (err: unknown) => {
    if (failed) return
    failed = true
    job.abort()
    postMessage({ type: 'error', message: (err as Error).message ?? String(err) })
  }

  const pump = async () => {
    if (writing || failed) return
    writing = true
    try {
      for (let item = waiting.get(next); item; item = waiting.get(next)) {
        waiting.delete(next)
        await job.write(item.frame)
        item.port.postMessage('ack')
        next++
        if (++sinceReport >= 15) {
          postMessage({ type: 'progress', frames: sinceReport })
          sinceReport = 0
        }
      }
      if (next === total) {
        await job.finish()
        postMessage({ type: 'progress', frames: sinceReport })
        postMessage({ type: 'done' })
      }
    } catch (err) {
      fail(err)
    } finally {
      writing = false
    }
  }

  for (const port of ports) {
    port.onmessage = (m: MessageEvent) => {
      if (m.data.type === 'frame') {
        waiting.set(m.data.index, { frame: m.data.frame, port })
        void pump()
      } else if (m.data.type === 'error') fail(new Error(m.data.message))
    }
  }
  self.onmessage = (m: MessageEvent) => {
    if (m.data.type === 'cancel') {
      failed = true
      job.abort()
      postMessage({ type: 'cancelled' })
    }
  }
}
