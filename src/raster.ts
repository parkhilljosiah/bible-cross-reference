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

/**
 * Only the band of rows that any arc touched is returned, which keeps short, local highlights cheap to compute,
 * transfer and paint. Rows are in raster pixels; the full image is `width` x `fullHeight`.
 */
export interface RasterResult {
  /** Opaque RGBA pixels for rows top .. top + height - 1: width * height * 4 bytes. */
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
  top: number
  fullHeight: number
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
// The accumulation buffer is tens of megabytes at phone resolution; allocating and zeroing a fresh one for every render
// was a large part of the cost, so keep one around and clear it in place.
let accBuffer = new Float32Array(0)
const SAMPLE_BUDGET = 20000

export function rasterize(set: ArcSet, o: RasterOptions): RasterResult {
  const W = Math.max(1, Math.round(o.width * o.dpr))
  const H = Math.max(1, Math.round(o.height * o.dpr))
  const need = W * H * 3
  if (accBuffer.length < need) accBuffer = new Float32Array(need)
  else accBuffer.fill(0, 0, need)
  const acc = accBuffer
  const baseY = o.baseY * o.dpr
  const pal = o.palette.map(([r, g, b]) => [r / 255, g / 255, b / 255])
  // Dense pictures are blurry by nature, so trade anti-aliasing for speed there.
  const fast = set.count > FAST_ABOVE
  let minY = H
  let maxY = -1

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
        if (iy < minY) minY = iy
        if (iy > maxY) maxY = iy
        const i = (iy * W + ix) * 3
        acc[i] += cr
        acc[i + 1] += cg
        acc[i + 2] += cb
        continue
      }
      const ix = Math.floor(x)
      const iy = Math.floor(y)
      if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue
      if (iy < minY) minY = iy
      if (iy + 1 > maxY) maxY = iy + 1
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

  // Nothing landed on screen.
  if (maxY < minY) return { data: new Uint8ClampedArray(0), width: W, height: 0, top: 0, fullHeight: H }

  const top = minY
  const bandH = maxY - minY + 1
  const from = top * W
  const to = (top + bandH) * W

  // Normalize against the ~99th percentile of lit pixels so the picture is well exposed whether 300,000 arcs are on
  // screen or 40. A fixed sample budget keeps the sort cheap however large the image is.
  const stride = Math.max(1, Math.floor((to - from) / SAMPLE_BUDGET))
  const samples = new Float32Array(Math.ceil((to - from) / stride))
  let n = 0
  for (let p = from; p < to; p += stride) {
    const v = acc[p * 3] + acc[p * 3 + 1] + acc[p * 3 + 2]
    if (v > 0) samples[n++] = v / 3
  }
  const sorted = samples.subarray(0, n).sort()
  const ref = n ? sorted[Math.floor(n * 0.99)] || sorted[n - 1] : 1

  // exp/pow per channel is costly; the response curve only depends on acc * inv, so tabulate it.
  const LUT = 1024
  const lut = new Uint8Array(LUT + 1)
  for (let t = 0; t <= LUT; t++) lut[t] = 255 * (1 - Math.exp(-o.gain * Math.pow((t / LUT) * 6, o.gamma)))
  const scale = LUT / (6 * ref)

  const px = new Uint8ClampedArray(W * bandH * 4)
  for (let p = from, q = 0; p < to; p++, q += 4) {
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
  return { data: px, width: W, height: bandH, top, fullHeight: H }
}
