import type { Pt } from './types'

/**
 * The cells inside a drawn outline: a cell belongs to the area when its centre lies inside the polygon (even-odd rule, so a
 * crossing stroke leaves a hole). Points are in cell coordinates (cell x spans x .. x + 1), the polygon is closed from the last
 * point back to the first. Returns the indices into a size x size grid, row by row.
 */
export function cellsInPolygon(pts: Pt[], size: number): number[] {
  const n = pts.length
  if (n < 3) return []
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const out: number[] = []
  const y0 = Math.max(0, Math.floor(minY - 0.5))
  const y1 = Math.min(size - 1, Math.ceil(maxY - 0.5))
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      if (a.y <= sy !== b.y <= sy) xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5))
      const to = Math.min(size - 1, Math.ceil(xs[k + 1] - 0.5) - 1)
      for (let x = from; x <= to; x++) out.push(y * size + x)
    }
  }
  return out
}
