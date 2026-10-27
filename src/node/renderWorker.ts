import { parentPort, workerData } from 'node:worker_threads'
import { renderSegment, type SegmentJob } from './exporter'

const controller = new AbortController()
parentPort!.on('message', (m: { type: string }) => {
  if (m.type === 'cancel') controller.abort()
})

renderSegment(workerData as SegmentJob, (frames) => parentPort!.postMessage({ type: 'progress', frames }), controller.signal)
  .then(() => parentPort!.postMessage({ type: 'done' }))
  .catch((e: Error) => parentPort!.postMessage({ type: 'error', message: e.message }))
  .finally(() => parentPort!.close())
