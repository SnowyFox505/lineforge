export interface P {
  x: number
  z: number
}

const len = (a: P, b: P) => Math.hypot(b.x - a.x, b.z - a.z)

/** Remove consecutive duplicates and points that lie on a straight line. */
export function cleanPolyline(pts: P[]): P[] {
  const out: P[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && len(last, p) < 1e-6) continue
    out.push(p)
  }
  return out
}

/**
 * Replace every corner of a polyline with a circular arc of radius `radius`
 * (smaller when the neighbouring segments are too short). Straight parts stay exactly where they are.
 */
export function roundPolyline(input: P[], radius: number): P[] {
  const pts = cleanPolyline(input)
  if (pts.length < 3 || radius <= 0.01) return pts
  const out: P[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const v = pts[i]
    const b = pts[i + 1]
    const l1 = len(a, v)
    const l2 = len(v, b)
    const d1 = { x: (v.x - a.x) / l1, z: (v.z - a.z) / l1 }
    const d2 = { x: (b.x - v.x) / l2, z: (b.z - v.z) / l2 }
    const cos = Math.max(-1, Math.min(1, d1.x * d2.x + d1.z * d2.z))
    const theta = Math.acos(cos) // turning angle
    if (theta < 1e-3) {
      out.push(v)
      continue
    }
    // tangent length, limited by half of the neighbouring segments so neighbouring arcs never overlap
    const tFull = radius * Math.tan(theta / 2)
    const t = Math.min(tFull, l1 * 0.5, l2 * 0.5)
    const r = t / Math.tan(theta / 2)
    const A = { x: v.x - d1.x * t, z: v.z - d1.z * t }
    const cross = d1.x * d2.z - d1.z * d2.x
    const side = cross > 0 ? 1 : -1
    // arc centre lies on the inner side of the corner
    const n1 = { x: -d1.z * side, z: d1.x * side }
    const C = { x: A.x + n1.x * r, z: A.z + n1.z * r }
    const a0 = Math.atan2(A.z - C.z, A.x - C.x)
    const steps = Math.max(2, Math.ceil((theta * r) / 0.35))
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + side * theta * (k / steps)
      out.push({ x: C.x + Math.cos(ang) * r, z: C.z + Math.sin(ang) * r })
    }
  }
  out.push(pts[pts.length - 1])
  return cleanPolyline(out)
}

export interface Sampled {
  pts: P[]
  cum: number[]
  total: number
}

/** Resample a polyline at an even spacing (the last point is kept exactly). */
export function resample(input: P[], step: number): Sampled {
  const pts = cleanPolyline(input)
  const cumIn = [0]
  for (let i = 1; i < pts.length; i++) cumIn.push(cumIn[i - 1] + len(pts[i - 1], pts[i]))
  const total = cumIn[cumIn.length - 1]
  if (pts.length < 2 || total < 1e-6) return { pts, cum: pts.map(() => 0), total: 0 }
  const n = Math.max(1, Math.round(total / step))
  const out: P[] = []
  const cum: number[] = []
  let seg = 1
  for (let i = 0; i <= n; i++) {
    const d = (total * i) / n
    while (seg < pts.length - 1 && cumIn[seg] < d) seg++
    const t = (d - cumIn[seg - 1]) / (cumIn[seg] - cumIn[seg - 1] || 1)
    out.push({ x: pts[seg - 1].x + (pts[seg].x - pts[seg - 1].x) * t, z: pts[seg - 1].z + (pts[seg].z - pts[seg - 1].z) * t })
    cum.push(d)
  }
  return { pts: out, cum, total }
}

/** Extend a polyline straight beyond both ends. */
export function extendEnds(pts: P[], by: number): P[] {
  if (pts.length < 2) return pts
  const f = pts[0]
  const f1 = pts[1]
  const fl = len(f, f1) || 1
  const l = pts[pts.length - 1]
  const l1 = pts[pts.length - 2]
  const ll = len(l, l1) || 1
  return [
    { x: f.x + ((f.x - f1.x) / fl) * by, z: f.z + ((f.z - f1.z) / fl) * by },
    ...pts,
    { x: l.x + ((l.x - l1.x) / ll) * by, z: l.z + ((l.z - l1.z) / ll) * by },
  ]
}

export const smooth01 = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
