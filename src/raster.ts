export type RGB = [number, number, number]

export interface ArcSet {
  /** Left and right x of each arc in CSS pixels, with the arc's palette index. */
  xa: Float32Array
  xb: Float32Array
  color: Uint8Array
  count: number
}

export interface RasterOptions {
  width: number
  height: number
  dpr: number
  baseY: number
  /** Vertical scale of the semicircles (below 1 squashes them). */
  scaleY: number
  palette: RGB[]
  /** Overall brightness after normalization. */
  gain: number
  /** < 1 lifts faint regions so sparse areas stay visible next to dense ones. */
  gamma: number
  /** Scale channels together so overlapping colors stay colored instead of saturating to white. */
  preserveHue?: boolean
}

export interface RasterResult {
  /** Opaque RGBA pixels, width * height * 4. */
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

/** Above this many arcs, rasterize() switches to its fast, non-anti-aliased path. */
export const FAST_ABOVE = 20000

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
}

/**
 * Draws every arc into a floating-point accumulation buffer (so overlapping arcs add up
 * the way light does), then tone-maps to an opaque RGBA image on a black background.
 * Canvas stroke() can't do this: overlapping segments inside one path only paint once.
 *
 * Each arc is clipped to the visible x-range before stepping, so zooming in far enough that
 * one arc is thousands of pixels wide costs only as much as the part that is on screen.
 */
export function rasterize(set: ArcSet, o: RasterOptions): RasterResult {
  const W = Math.max(1, Math.round(o.width * o.dpr))
  const H = Math.max(1, Math.round(o.height * o.dpr))
  const acc = new Float32Array(W * H * 3)
  const baseY = o.baseY * o.dpr
  const pal = o.palette.map(([r, g, b]) => [r / 255, g / 255, b / 255])
  // Dense pictures are blurry by nature, so trade anti-aliasing for speed there.
  const fast = set.count > FAST_ABOVE

  for (let k = 0; k < set.count; k++) {
    const x0 = set.xa[k] * o.dpr
    const r = (set.xb[k] * o.dpr - x0) / 2
    if (r < 0.4) continue
    const cx = x0 + r
    if (cx + r < 0 || cx - r > W) continue
    const [cr, cg, cb] = pal[set.color[k]]
    const ry = o.scaleY * r
    // x = cx - r*cos(t): keep the t range where 0 <= x <= W.
    const tMin = cx - r >= 0 ? 0 : Math.acos(Math.min(1, cx / r))
    const tMax = cx + r <= W ? Math.PI : Math.acos(Math.max(-1, (cx - W) / r))
    if (tMax <= tMin) continue
    // Step by the longer radius so stretched arcs don't turn into dotted lines.
    const steps = Math.max(2, Math.ceil((tMax - tMin) * Math.max(r, ry)))
    const d = (tMax - tMin) / steps
    const cosD = Math.cos(d)
    const sinD = Math.sin(d)
    // Walk the arc by rotating (cos, sin) a fixed angle each step instead of calling trig.
    let cos = Math.cos(tMin)
    let sin = Math.sin(tMin)
    for (let s = 0; s <= steps; s++) {
      const x = cx - r * cos
      const y = baseY - ry * sin
      const nc = cos * cosD - sin * sinD
      sin = sin * cosD + cos * sinD
      cos = nc
      if (fast) {
        const ix = (x + 0.5) | 0
        const iy = (y + 0.5) | 0
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue
        const i = (iy * W + ix) * 3
        acc[i] += cr
        acc[i + 1] += cg
        acc[i + 2] += cb
        continue
      }
      const ix = Math.floor(x)
      const iy = Math.floor(y)
      if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue
      const fx = x - ix
      const fy = y - iy
      const i = (iy * W + ix) * 3
      const j = i + W * 3
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      acc[i] += cr * w00
      acc[i + 1] += cg * w00
      acc[i + 2] += cb * w00
      acc[i + 3] += cr * w10
      acc[i + 4] += cg * w10
      acc[i + 5] += cb * w10
      acc[j] += cr * w01
      acc[j + 1] += cg * w01
      acc[j + 2] += cb * w01
      acc[j + 3] += cr * w11
      acc[j + 4] += cg * w11
      acc[j + 5] += cb * w11
    }
  }

  // Normalize against the ~99th percentile of lit pixels so the picture is well exposed
  // whether 300,000 arcs are on screen or 40.
  const samples: number[] = []
  for (let p = 0; p < W * H; p += 7) {
    const v = acc[p * 3] + acc[p * 3 + 1] + acc[p * 3 + 2]
    if (v > 0) samples.push(v / 3)
  }
  samples.sort((x, y) => x - y)
  const ref = samples.length ? samples[Math.floor(samples.length * 0.99)] || samples[samples.length - 1] : 1

  // exp/pow per channel is costly; the response curve only depends on acc * inv, so tabulate it.
  const LUT = 1024
  const lut = new Uint8Array(LUT + 1)
  for (let t = 0; t <= LUT; t++) lut[t] = 255 * (1 - Math.exp(-o.gain * Math.pow((t / LUT) * 6, o.gamma)))
  const scale = LUT / (6 * ref)

  const px = new Uint8ClampedArray(W * H * 4)
  for (let p = 0, q = 0; p < W * H; p++, q += 4) {
    const i = p * 3
    if (o.preserveHue) {
      const m = Math.max(acc[i], acc[i + 1], acc[i + 2])
      if (m > 0) {
        const k = lut[Math.min(LUT, (m * scale) | 0)] / m
        px[q] = acc[i] * k
        px[q + 1] = acc[i + 1] * k
        px[q + 2] = acc[i + 2] * k
      }
    } else {
      px[q] = lut[Math.min(LUT, (acc[i] * scale) | 0)]
      px[q + 1] = lut[Math.min(LUT, (acc[i + 1] * scale) | 0)]
      px[q + 2] = lut[Math.min(LUT, (acc[i + 2] * scale) | 0)]
    }
    px[q + 3] = 255
  }
  return { data: px, width: W, height: H }
}
