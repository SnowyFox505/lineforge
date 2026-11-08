import type { CityDoc } from '../model/types'

/** From how far inside the border an urban area is fully there, and where it fades out (blurred mask values). */
const FADE_FROM = 0.3
const FADE_TO = 0.85
/** Blur radius in cells: how wide the soft edge towards the grass is */
const RADIUS = 2

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function boxBlur(src: Float32Array, size: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const w = 2 * r + 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0
      for (let k = -r; k <= r; k++) s += src[y * size + Math.min(size - 1, Math.max(0, x + k))]
      tmp[y * size + x] = s / w
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0
      for (let k = -r; k <= r; k++) s += tmp[Math.min(size - 1, Math.max(0, y + k)) * size + x]
      out[y * size + x] = s / w
    }
  }
  return out
}

/**
 * How much of the town is "there" in every cell (0 = grass, 1 = fully built up). Towns and suburbs fade out
 * over a few cells at their border instead of ending in a hard cut. The 2D map, the 3D ground texture and the
 * 3D buildings all use it, so streets, colour and houses thin out together.
 */
export function urbanAlpha(doc: CityDoc): Float32Array {
  const { size, zoneGrid, zones } = doc
  const out = new Float32Array(size * size)
  if (!zoneGrid || !zones?.length) return out
  const urban = new Set(zones.filter((z) => z.kind === 'city' || z.kind === 'suburb').map((z) => z.id))
  const mask = new Float32Array(size * size)
  let any = false
  for (let i = 0; i < mask.length; i++) {
    if (urban.has(zoneGrid[i])) {
      mask[i] = 1
      any = true
    }
  }
  if (!any) return out
  const blurred = boxBlur(boxBlur(mask, size, RADIUS), size, RADIUS)
  for (let i = 0; i < out.length; i++) out[i] = smooth(FADE_FROM, FADE_TO, blurred[i])
  return out
}
