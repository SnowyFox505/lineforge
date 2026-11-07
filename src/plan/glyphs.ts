import type { CityDoc, StationType } from '../model/types'

/** Airplane silhouette in a -1..1 box, nose pointing up. Shared by canvas and SVG renderers. */
export const PLANE_POINTS: [number, number][] = [
  [0, -1],
  [0.14, -0.55],
  [0.14, -0.2],
  [0.95, 0.25],
  [0.95, 0.45],
  [0.14, 0.2],
  [0.12, 0.65],
  [0.4, 0.82],
  [0.4, 0.95],
  [0, 0.85],
  [-0.4, 0.95],
  [-0.4, 0.82],
  [-0.12, 0.65],
  [-0.14, 0.2],
  [-0.95, 0.45],
  [-0.95, 0.25],
  [-0.14, -0.2],
  [-0.14, -0.55],
]

export function planePath(cx: number, cy: number, r: number, rotDeg = 45): string {
  const a = (rotDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return (
    PLANE_POINTS.map(([x, y], i) => {
      const rx = x * cos - y * sin
      const ry = x * sin + y * cos
      return `${i ? 'L' : 'M'}${(cx + rx * r).toFixed(2)} ${(cy + ry * r).toFixed(2)}`
    }).join(' ') + 'Z'
  )
}

/** A plain stop that several lines share is shown as an interchange automatically. */
export function effectiveTypes(doc: CityDoc): Record<string, StationType> {
  const count: Record<string, number> = {}
  for (const l of Object.values(doc.lines)) {
    for (const id of new Set(l.stations)) count[id] = (count[id] ?? 0) + 1
  }
  const out: Record<string, StationType> = {}
  for (const st of Object.values(doc.stations)) {
    out[st.id] = st.type === 'standard' && (count[st.id] ?? 0) >= 2 ? 'interchange' : st.type
  }
  return out
}
