import type { Pt, Station } from '../model/types'

export type { Pt }

/**
 * Route from a to b using only horizontal, vertical and 45° segments
 * (Berlin/Munich map style). Straight part first, then the diagonal.
 */
export function octilinearPath(a: Pt, b: Pt): Pt[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx === 0 || ady === 0 || adx === ady) return [a, b]
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const mid: Pt =
    adx > ady ? { x: a.x + sx * (adx - ady), y: a.y } : { x: a.x, y: a.y + sy * (ady - adx) }
  return [a, mid, b]
}

/**
 * Path between two stations. The route is canonical: it is always computed from the
 * station with the smaller id, so two lines sharing a segment get identical geometry.
 */
export function segmentPath(sa: Station, sb: Station): Pt[] {
  if (sa.id <= sb.id) return octilinearPath(sa, sb)
  return octilinearPath(sb, sa).reverse()
}

/** Canonical key of an undirected segment */
export function segmentKey(idA: string, idB: string): string {
  return idA <= idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

/** Offset a polyline sideways by d (positive = to the left of the travel direction). */
export function offsetPolyline(points: Pt[], d: number): Pt[] {
  if (d === 0 || points.length < 2) return points
  const normals: Pt[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const len = Math.hypot(dx, dy) || 1
    normals.push({ x: -dy / len, y: dx / len })
  }
  return points.map((p, i) => {
    const n0 = normals[Math.max(0, i - 1)]
    const n1 = normals[Math.min(normals.length - 1, i)]
    let nx = n0.x + n1.x
    let ny = n0.y + n1.y
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    // Miter: scale so the offset distance stays d perpendicular to both segments
    const cos = nx * n0.x + ny * n0.y
    const scale = d / (cos || 1)
    return { x: p.x + nx * scale, y: p.y + ny * scale }
  })
}

/** Reverse-aware concatenation that drops duplicated joint points. */
export function joinPaths(paths: Pt[][]): Pt[] {
  const out: Pt[] = []
  for (const path of paths) {
    for (const p of path) {
      const last = out[out.length - 1]
      if (!last || last.x !== p.x || last.y !== p.y) out.push(p)
    }
  }
  return out
}
