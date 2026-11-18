import type { CityDoc, Line } from './types'

type P = { x: number; y: number }

/** The colour a line is shown in: a branch (Auslaeufer) always wears the colour of its main line, so it reads as a variant of it. */
export function shownColor(doc: Pick<CityDoc, 'lines'>, line: Line): string {
  const parent = line.branch ? doc.lines[line.branch.parent] : undefined
  return parent ? parent.color : line.color
}

function distToPolyline(p: P, poly: P[]): number {
  let best = Infinity
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i]
    const b = poly[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
    if (d < best) best = d
  }
  return best
}

const cache = new WeakMap<P[], { parent: P[]; eps: number; runs: P[][] }>()

/**
 * The parts of a branch's path where it has left its main line (further than `eps` from it). On the stretch the two share,
 * nothing is returned: there the branch is simply the main line. Every run starts and ends one point inside the shared part
 * so the stripe joins the line without a gap.
 */
export function ownRuns(pts: P[], parentPts: P[], eps: number): P[][] {
  const hit = cache.get(pts)
  if (hit && hit.parent === parentPts && hit.eps === eps) return hit.runs
  const runs: P[][] = []
  if (pts.length >= 2 && parentPts.length >= 2) {
    let cur: P[] | null = null
    for (let i = 0; i < pts.length; i++) {
      const away = distToPolyline(pts[i], parentPts) > eps
      if (away) {
        if (!cur) cur = i > 0 ? [pts[i - 1]] : []
        cur.push(pts[i])
      } else if (cur) {
        cur.push(pts[i])
        if (cur.length >= 2) runs.push(cur)
        cur = null
      }
    }
    if (cur && cur.length >= 2) runs.push(cur)
  }
  cache.set(pts, { parent: parentPts, eps, runs })
  return runs
}
