import { rasterize, type ArcSet, type RasterOptions, type RasterResult } from './raster'

type Reply = ({ id: number; skipped: true } | ({ id: number; skipped?: undefined } & RasterResult))

/**
 * Runs rasterize() in a Web Worker so a 300k-arc redraw never blocks scrolling or touch.
 * render() resolves with null when a newer request replaced this one.
 * One client per layer lets the base picture and the hover overlay render in parallel.
 */
export class RasterClient {
  private worker: Worker | null
  private seq = 0
  private waiting = new Map<number, (r: RasterResult | null) => void>()

  constructor() {
    try {
      this.worker = new Worker(new URL('./raster.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<Reply>) => {
        const done = this.waiting.get(e.data.id)
        this.waiting.delete(e.data.id)
        if (!done) return
        done(e.data.skipped ? null : { data: e.data.data, width: e.data.width, height: e.data.height })
      }
    } catch {
      this.worker = null
    }
  }

  render(set: ArcSet, opts: RasterOptions): Promise<RasterResult | null> {
    if (!this.worker) {
      // No worker support: fall back to the main thread.
      return new Promise((resolve) => setTimeout(() => resolve(rasterize(set, opts)), 0))
    }
    const id = ++this.seq
    return new Promise((resolve) => {
      this.waiting.set(id, resolve)
      this.worker!.postMessage({ id, set, opts }, [set.xa.buffer, set.xb.buffer, set.color.buffer])
    })
  }

  dispose() {
    this.worker?.terminate()
    this.waiting.forEach((done) => done(null))
    this.waiting.clear()
  }
}
