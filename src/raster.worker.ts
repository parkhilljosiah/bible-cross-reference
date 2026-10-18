/// <reference lib="webworker" />
import { rasterize, type ArcSet, type RasterOptions } from './raster'

interface Request {
  id: number
  set: ArcSet
  opts: RasterOptions
}

// Requests can pile up while a long render runs (dragging the vote slider, pinching). Only the newest
// matters, so each message just replaces the pending one and a zero-delay timer does the work.
let pending: Request | null = null

self.onmessage = (e: MessageEvent<Request>) => {
  if (pending) self.postMessage({ id: pending.id, skipped: true })
  pending = e.data
  setTimeout(() => {
    const job = pending
    pending = null
    if (!job) return
    const result = rasterize(job.set, job.opts)
    self.postMessage({ id: job.id, ...result }, [result.data.buffer])
  }, 0)
}
