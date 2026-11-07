import { WATER } from './types'
import type { Pt } from './types'

/** Field value at which the coastline is drawn. */
export const WATER_THRESHOLD = 0.42

/** Field value from which a track needs a bridge (starts a little before the water so banks are spanned). */
export const BRIDGE_THRESHOLD = 0.13

/**
 * Smooth water field on the cell *corners* ((size+1)² values in 0..1).
 * The 0/1 cell mask is blurred twice with a [1 2 1] kernel (a gaussian with sigma ≈ 1 cell),
 * so painted strokes become round, flowing shores instead of pixel staircases.
 * A river painted three cells wide keeps a clear core; a one-cell trickle fades out on purpose.
 * Shared by the 2D contour renderer, the 3D terrain mesh and bridge detection.
 */
export function buildField(terrain: Uint8Array, size: number): Float32Array {
  let a = new Float32Array(size * size)
  for (let i = 0; i < a.length; i++) a[i] = terrain[i] === WATER ? 1 : 0
  let b = new Float32Array(size * size)
  const at = (arr: Float32Array, x: number, y: number) => arr[(y < 0 ? 0 : y >= size ? size - 1 : y) * size + (x < 0 ? 0 : x >= size ? size - 1 : x)]
  for (let pass = 0; pass < 2; pass++) {
    // horizontal
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) b[y * size + x] = (at(a, x - 1, y) + 2 * a[y * size + x] + at(a, x + 1, y)) * 0.25
    // vertical
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) a[y * size + x] = (at(b, x, y - 1) + 2 * b[y * size + x] + at(b, x, y + 1)) * 0.25
  }
  b = new Float32Array(0)
  const n = size + 1
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[y * n + x] = (at(a, x - 1, y - 1) + at(a, x, y - 1) + at(a, x - 1, y) + at(a, x, y)) * 0.25
    }
  }
  return out
}

/** Bilinear sample of the corner field at a position in cell units (cell k spans [k, k+1]). */
export function makeSampler(field: Float32Array, size: number) {
  const n = size + 1
  return (u: number, v: number): number => {
    const x = Math.min(size - 1e-6, Math.max(0, u))
    const y = Math.min(size - 1e-6, Math.max(0, v))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = x - x0
    const ty = y - y0
    const a = field[y0 * n + x0]
    const b = field[y0 * n + x0 + 1]
    const c = field[(y0 + 1) * n + x0]
    const d = field[(y0 + 1) * n + x0 + 1]
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
  }
}

export interface BridgeRun {
  /** Sub-polyline in lattice coordinates (add 0.5 for the cell centre) */
  pts: Pt[]
  length: number
}

function pointAt(pts: Pt[], cum: number[], d: number): Pt {
  let i = 1
  while (i < cum.length - 1 && cum[i] < d) i++
  const seg = cum[i] - cum[i - 1] || 1
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg))
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
}

/**
 * Find the stretches of a track polyline that cross water and therefore need a bridge.
 * The runs run from bank to bank (a little beyond for the abutments).
 */
export function findBridges(pts: Pt[], sample: (u: number, v: number) => number, threshold = BRIDGE_THRESHOLD): BridgeRun[] {
  if (pts.length < 2) return []
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = cum[cum.length - 1]
  const step = 0.25
  const runs: [number, number][] = []
  let start = -1
  for (let d = 0; d <= total + 1e-9; d += step) {
    const p = pointAt(pts, cum, Math.min(d, total))
    const wet = sample(p.x + 0.5, p.y + 0.5) >= threshold
    if (wet && start < 0) start = d
    if (!wet && start >= 0) {
      runs.push([start, d])
      start = -1
    }
  }
  if (start >= 0) runs.push([start, total])
  // merge runs separated by very short dry bits, drop tiny puddles
  const merged: [number, number][] = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    if (last && r[0] - last[1] < 1.5) last[1] = r[1]
    else merged.push([r[0], r[1]])
  }
  const ext = 0.7
  return merged
    .filter(([a, b]) => b - a >= 1)
    .map(([a, b]) => {
      const d0 = Math.max(0, a - ext)
      const d1 = Math.min(total, b + ext)
      const out: Pt[] = [pointAt(pts, cum, d0)]
      for (let i = 1; i < pts.length - 1; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i])
      out.push(pointAt(pts, cum, d1))
      return { pts: out, length: d1 - d0 }
    })
}
