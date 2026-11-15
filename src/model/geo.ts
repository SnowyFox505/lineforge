import { resample, roundPolyline } from '../view3d/curves'
import type { CityDoc, Line, Pt } from './types'

/**
 * The geography of the map: lines are free, smooth curves.
 *
 * `line.via[k]` holds the control points of the curve between `stations[k]` and `stations[k+1]` (lattice coordinates,
 * the centre of a cell is +0.5, fractions allowed). The whole line is ONE centripetal Catmull-Rom spline through
 * station, control points, station, control points, ..., so a line passes a station without a kink.
 */

/** Distance between the samples of a curve, in cells */
export const CURVE_STEP = 0.5
/** Tightest bend a drawn curve may have (cells); a stroke that is tighter gets smoothed */
export const MIN_RADIUS = 2.2
/** Default radius when a machine-routed octilinear leg is turned into a curve */
export const ROUTE_ROUNDING = 3

const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

// ---- the curve of a line ---------------------------------------------------------

export interface LineCurve {
  /** samples along the whole line, about CURVE_STEP apart */
  pts: Pt[]
  /** legStart[i] = index in `pts` of stations[i] */
  legStart: number[]
}

function crSegment(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number, out: Pt[]) {
  const t0 = 0
  const t1 = t0 + Math.sqrt(dist(p0, p1)) + 1e-6
  const t2 = t1 + Math.sqrt(dist(p1, p2)) + 1e-6
  const t3 = t2 + Math.sqrt(dist(p2, p3)) + 1e-6
  for (let j = 1; j <= n; j++) {
    const t = t1 + ((t2 - t1) * j) / n
    const L = (a: Pt, b: Pt, ta: number, tb: number, tt: number): Pt => {
      const u = (tt - ta) / (tb - ta)
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
    }
    const a1 = L(p0, p1, t0, t1, t)
    const a2 = L(p1, p2, t1, t2, t)
    const a3 = L(p2, p3, t2, t3, t)
    const b1 = L(a1, a2, t0, t2, t)
    const b2 = L(a2, a3, t1, t3, t)
    out.push(L(b1, b2, t1, t2, t))
  }
}

/** Sample a centripetal Catmull-Rom spline through `ctrl`; index list says where each control point landed. */
export function splineThrough(ctrl: Pt[], closed = false): { pts: Pt[]; at: number[] } {
  const n = ctrl.length
  if (n === 0) return { pts: [], at: [] }
  const pts: Pt[] = [{ x: ctrl[0].x, y: ctrl[0].y }]
  const at = [0]
  if (n === 1) return { pts, at }
  for (let i = 0; i < n - 1; i++) {
    const p1 = ctrl[i]
    const p2 = ctrl[i + 1]
    // a ring is closed: the control point before the first one is the one before the (repeated) last, and so on
    const p0 = i > 0 ? ctrl[i - 1] : closed && n > 3 ? ctrl[n - 2] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y }
    const p3 = i + 2 < n ? ctrl[i + 2] : closed && n > 3 ? ctrl[1] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y }
    const steps = Math.max(1, Math.ceil(dist(p1, p2) / CURVE_STEP))
    crSegment(p0, p1, p2, p3, steps, pts)
    // land exactly on the control point
    pts[pts.length - 1] = { x: p2.x, y: p2.y }
    at.push(pts.length - 1)
  }
  return { pts: pts.map((p) => ({ x: r3(p.x), y: r3(p.y) })), at }
}

const curveCache = new WeakMap<Line, { sig: string; curve: LineCurve }>()

/** The control polyline of a line: stations and the control points between them. */
export function controlPolyline(doc: CityDoc, line: Line): { ctrl: Pt[]; stationAt: number[] } {
  const ctrl: Pt[] = []
  const stationAt: number[] = []
  for (let i = 0; i < line.stations.length; i++) {
    const st = doc.stations[line.stations[i]]
    if (!st) continue
    // a control point that sits (almost) on the station is dropped
    while (ctrl.length && stationAt[stationAt.length - 1] !== ctrl.length - 1 && dist(ctrl[ctrl.length - 1], st) < 0.3) ctrl.pop()
    stationAt.push(ctrl.length)
    ctrl.push({ x: st.x, y: st.y })
    if (i < line.stations.length - 1) {
      for (const p of line.via?.[i] ?? []) {
        if (dist(ctrl[ctrl.length - 1], p) < 0.3) continue
        ctrl.push(p)
      }
    }
  }
  return { ctrl, stationAt }
}

/** The whole curve of a line (cached for as long as the line and its stations stay as they are). */
export function lineCurve(doc: CityDoc, line: Line): LineCurve {
  const sig = line.stations.map((id) => (doc.stations[id] ? `${doc.stations[id].x},${doc.stations[id].y}` : '-')).join(';')
  const hit = curveCache.get(line)
  if (hit && hit.sig === sig) return hit.curve
  const { ctrl, stationAt } = controlPolyline(doc, line)
  const { pts, at } = splineThrough(ctrl, !!line.loop && line.stations.length > 3 && line.stations[0] === line.stations[line.stations.length - 1])
  const curve: LineCurve = { pts, legStart: stationAt.map((i) => at[i] ?? 0) }
  curveCache.set(line, { sig, curve })
  return curve
}

/** The curve between stations[k] and stations[k+1]. */
export function legCurve(doc: CityDoc, line: Line, k: number): Pt[] {
  const c = lineCurve(doc, line)
  if (k < 0 || k + 1 >= c.legStart.length) return []
  return c.pts.slice(c.legStart[k], c.legStart[k + 1] + 1)
}

export function curveLength(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

/** Nearest point on a polyline: distance, index of the segment and arc length from the start. */
export function nearestOnCurve(pts: Pt[], p: Pt): { dist: number; index: number; along: number; point: Pt } {
  let best = { dist: Infinity, index: 0, along: 0, point: pts[0] ?? p }
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
    const q = { x: a.x + dx * t, y: a.y + dy * t }
    const d = dist(q, p)
    if (d < best.dist) best = { dist: d, index: i, along: acc + Math.sqrt(len2) * t, point: q }
    acc += Math.sqrt(len2)
  }
  return best
}

// ---- turning routes and strokes into control points ----------------------------------

/**
 * Pick control points from a dense polyline: wherever it has turned by `turnDeg` since the last one, or after
 * `maxGap` cells at the latest. The first and the last point are not included.
 */
export function adaptivePoints(dense: Pt[], turnDeg = 12, maxGap = 6): Pt[] {
  const out: Pt[] = []
  if (dense.length < 3) return out
  const lim = (turnDeg * Math.PI) / 180
  let acc = 0
  let len = 0
  let prevDir = Math.atan2(dense[1].y - dense[0].y, dense[1].x - dense[0].x)
  for (let i = 1; i < dense.length - 1; i++) {
    const dir = Math.atan2(dense[i + 1].y - dense[i].y, dense[i + 1].x - dense[i].x)
    let d = dir - prevDir
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    acc += Math.abs(d)
    len += dist(dense[i - 1], dense[i])
    prevDir = dir
    if (acc >= lim || len >= maxGap) {
      out.push({ x: r2(dense[i].x), y: r2(dense[i].y) })
      acc = 0
      len = 0
    }
  }
  return out
}

/** Make sure a leg has at least one control point (an empty list means "not drawn yet"). */
function withMidpoint(ctrl: Pt[], dense: Pt[]): Pt[] {
  if (ctrl.length || dense.length < 3) return ctrl
  const m = dense[Math.floor(dense.length / 2)]
  return [{ x: r2(m.x), y: r2(m.y) }]
}

/** Control points for a machine-routed octilinear leg: its bends rounded off like the 3D tracks used to be. */
export function pointsFromRoute(route: Pt[], radius = ROUTE_ROUNDING): Pt[] {
  if (route.length < 2) return []
  // a straight leg needs just one point (a few more on a long one would only add handles)
  if (route.length === 2) {
    const a = route[0]
    const b = route[1]
    return [{ x: r2((a.x + b.x) / 2), y: r2((a.y + b.y) / 2) }]
  }
  const rounded = roundPolyline(
    route.map((p) => ({ x: p.x, z: p.y })),
    radius,
  )
  const dense = resample(rounded, CURVE_STEP).pts.map((p) => ({ x: p.x, y: p.z }))
  return withMidpoint(adaptivePoints(dense, 12, 6), dense)
}

/** Route hints for the octilinear machine router: lattice points along a curve, about every `gap` cells. */
export function routeHints(curve: Pt[], gap = 8): Pt[] {
  if (curve.length < 3) return []
  // a leg that stays near the straight line between its stations needs no hints: the router finds its own way
  const A = curve[0]
  const B = curve[curve.length - 1]
  const chord = dist(A, B) || 1
  let off = 0
  for (const p of curve) off = Math.max(off, Math.abs((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x)) / chord)
  if (off < 2.5) return []
  const total = curveLength(curve)
  const n = Math.floor(total / gap)
  const out: Pt[] = []
  const first = curve[0]
  const last = curve[curve.length - 1]
  let acc = 0
  let next = total / (n + 1)
  let k = 1
  for (let i = 1; i < curve.length && k <= n; i++) {
    acc += dist(curve[i - 1], curve[i])
    if (acc >= next) {
      const p = { x: Math.round(curve[i].x), y: Math.round(curve[i].y) }
      const prev = out[out.length - 1] ?? first
      if (dist(p, prev) >= 2 && dist(p, last) >= 2) out.push(p)
      k++
      next = (total * k) / (n + 1)
    }
  }
  return out
}

// ---- strokes -------------------------------------------------------------------------

/** Smallest bend radius of a dense polyline (cells), measured over three samples either side. */
export function minRadius(dense: Pt[], span = 3): number {
  let best = Infinity
  for (let i = span; i < dense.length - span; i++) {
    const a = dense[i - span]
    const b = dense[i]
    const c = dense[i + span]
    const ab = dist(a, b)
    const bc = dist(b, c)
    const ca = dist(c, a)
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    if (area2 < 1e-9) continue
    best = Math.min(best, (ab * bc * ca) / (2 * area2))
  }
  return best
}

function smoothPass(pts: Pt[], half: number): Pt[] {
  const out = pts.map((p) => ({ ...p }))
  for (let i = 1; i < pts.length - 1; i++) {
    const h = Math.min(half, i, pts.length - 1 - i)
    let sx = 0
    let sy = 0
    for (let d = -h; d <= h; d++) {
      sx += pts[i + d].x
      sy += pts[i + d].y
    }
    out[i] = { x: sx / (2 * h + 1), y: sy / (2 * h + 1) }
  }
  return out
}

/** A hand-drawn stroke as an even, smooth polyline: tremor is evened out and bends tighter than MIN_RADIUS are widened. */
export function smoothStroke(raw: Pt[]): Pt[] {
  const clean: Pt[] = []
  for (const p of raw) if (!clean.length || dist(clean[clean.length - 1], p) > 0.05) clean.push(p)
  if (clean.length < 2) return clean
  let dense = resample(
    clean.map((p) => ({ x: p.x, z: p.y })),
    CURVE_STEP,
  ).pts.map((p) => ({ x: p.x, y: p.z }))
  dense = smoothPass(smoothPass(dense, 2), 2)
  for (let pass = 0; pass < 14 && minRadius(dense) < MIN_RADIUS; pass++) dense = smoothPass(dense, 3)
  return dense
}

/** The nearest station within `r` cells of p. */
export function nearestStation(doc: CityDoc, p: Pt, r: number, only?: (id: string) => boolean): string | null {
  let best: string | null = null
  let bd = r
  for (const st of Object.values(doc.stations)) {
    if (only && !only(st.id)) continue
    const d = dist(st, p)
    if (d <= bd) {
      bd = d
      best = st.id
    }
  }
  return best
}

/**
 * Smooth the control points of one leg: the curve is evened out like a hand-drawn stroke and then rounded off
 * `rounds` more times (every round takes out more of the wobble and widens the bends). The ends stay where they are.
 * Returns the new control points (without the end stations).
 */
export function smoothLegPoints(curve: Pt[], rounds = 1): Pt[] {
  if (curve.length < 4) return []
  let dense = smoothStroke(curve)
  for (let i = 0; i < rounds; i++) dense = smoothPass(smoothPass(dense, 4 + i), 6 + 2 * i)
  const a = curve[0]
  const b = curve[curve.length - 1]
  dense = pullEnd(pullEnd(dense, true, a), false, b)
  return strokeControlPoints(dense)
}

/** Move one end of a dense polyline onto `target`; the nearest `reach` samples follow with a fading shift. */
export function pullEnd(dense: Pt[], atStart: boolean, target: Pt, reach = 8): Pt[] {
  const out = dense.map((p) => ({ ...p }))
  const n = out.length
  const end = atStart ? 0 : n - 1
  const dx = target.x - out[end].x
  const dy = target.y - out[end].y
  for (let j = 0; j < Math.min(reach, n); j++) {
    const i = atStart ? j : n - 1 - j
    const w = 1 - j / reach
    out[i] = { x: out[i].x + dx * w, y: out[i].y + dy * w }
  }
  out[end] = { x: target.x, y: target.y }
  return out
}

/**
 * Let a stroke run along existing lines: where it stays within `r` cells of another curve for at least `minRun`
 * samples it takes the points of that curve (a branch or a shared corridor). Entry and exit are blended in.
 */
export function snapToCurves(dense: Pt[], curves: Pt[][], r = 0.9, minRun = 4): Pt[] {
  if (!curves.length || dense.length < minRun) return dense
  const cell = r
  const grid = new Map<string, Pt[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
  for (const c of curves) {
    for (const p of c) {
      const k = key(p.x, p.y)
      const list = grid.get(k)
      if (list) list.push(p)
      else grid.set(k, [p])
    }
  }
  const near = (p: Pt): Pt | null => {
    const cx = Math.floor(p.x / cell)
    const cy = Math.floor(p.y / cell)
    let best: Pt | null = null
    let bd = r
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = dist(p, q)
          if (d <= bd) {
            bd = d
            best = q
          }
        }
      }
    }
    return best
  }
  const hit = dense.map(near)
  const out = dense.map((p) => ({ ...p }))
  let i = 0
  while (i < dense.length) {
    if (!hit[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < dense.length && hit[j + 1]) j++
    if (j - i + 1 >= minRun) {
      for (let k = i; k <= j; k++) out[k] = { ...(hit[k] as Pt) }
      // blend the jump at both ends into the neighbouring samples
      const reach = 6
      for (const [from, dir] of [[i, -1], [j, 1]] as const) {
        const d = { x: (hit[from] as Pt).x - dense[from].x, y: (hit[from] as Pt).y - dense[from].y }
        for (let s = 1; s <= reach; s++) {
          const idx = from + dir * s
          if (idx < 0 || idx >= dense.length || hit[idx]) break
          const w = 1 - s / (reach + 1)
          out[idx] = { x: dense[idx].x + d.x * w, y: dense[idx].y + d.y * w }
        }
      }
    }
    i = j + 1
  }
  return out
}

/** Stroke ready to store: control points between the two end stations (the ends themselves are not part of it). */
export function strokeControlPoints(dense: Pt[]): Pt[] {
  const cleaned: Pt[] = []
  for (const p of dense) if (!cleaned.length || dist(cleaned[cleaned.length - 1], p) > 1e-3) cleaned.push(p)
  return withMidpoint(adaptivePoints(cleaned, 10, 5), cleaned)
}

// ---- old documents --------------------------------------------------------------------

/**
 * Documents from before the free curves hold octilinear routes. Their control points are made from those routes
 * once (rounded bends), so the lines keep the shape they had. Returns the same document when there is nothing to do.
 */
export const GEO_VERSION = 1

export function migrateGeo(doc: CityDoc): CityDoc {
  if ((doc.geoV ?? 0) >= GEO_VERSION) return doc
  const lines: Record<string, Line> = {}
  for (const [id, line] of Object.entries(doc.lines)) {
    const n = line.stations.length
    const via: Pt[][] = Array.from({ length: n }, (_, k) => {
      const seg = line.segs?.[k]
      if (k < n - 1 && seg && seg.length >= 2) return pointsFromRoute(seg, line.curve ?? ROUTE_ROUNDING)
      return line.via?.[k] ?? []
    })
    lines[id] = { ...line, via }
  }
  return { ...doc, lines, geoV: GEO_VERSION }
}

// ---- shared corridors -----------------------------------------------------------------

/**
 * Lines that run side by side on the same stretch are recognised by closeness: where a curve stays within `eps` cells of
 * an earlier curve (running the same way, for at least `minRun` samples) it takes over the samples of that curve.
 * The stretch then has identical points on every line, which is what the bundling (lane order, side-by-side offsets) needs.
 */
export function mergeCorridors(curves: Record<string, Pt[]>, eps = 0.35, minRun = 6): Record<string, Pt[]> {
  const ids = Object.keys(curves).sort()
  const out: Record<string, Pt[]> = {}
  const cell = eps * 2
  const grid = new Map<string, { r: string; j: number }[]>()
  const cellOf = (v: number) => Math.floor(v / cell)
  const dirAt = (c: Pt[], i: number) => {
    const a = c[Math.max(0, i - 1)]
    const b = c[Math.min(c.length - 1, i + 1)]
    const l = dist(a, b) || 1
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  }
  for (const id of ids) {
    const c = curves[id]
    const m = c.map((p, i) => {
      const cx = cellOf(p.x)
      const cy = cellOf(p.y)
      const d0 = dirAt(c, i)
      let best: { r: string; j: number } | null = null
      let bd = eps
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const h of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            const q = out[h.r][h.j]
            const d = dist(p, q)
            if (d >= bd) continue
            const d1 = dirAt(out[h.r], h.j)
            if (Math.abs(d0.x * d1.x + d0.y * d1.y) < 0.7) continue
            bd = d
            best = h
          }
        }
      }
      return best
    })
    const res: Pt[] = []
    let i = 0
    while (i < c.length) {
      const first = m[i]
      if (!first) {
        res.push(c[i])
        i++
        continue
      }
      let j = i
      let sign = 0
      while (j + 1 < c.length) {
        const cur = m[j] as { r: string; j: number }
        const nx = m[j + 1]
        if (!nx || nx.r !== first.r) break
        const dj = nx.j - cur.j
        if (Math.abs(dj) > 3) break
        const sg = Math.sign(dj)
        if (sign && sg && sg !== sign) break
        if (sg) sign = sg
        j++
      }
      if (j - i + 1 >= minRun && sign !== 0) {
        const ref = out[first.r]
        const a = first.j
        const b = (m[j] as { r: string; j: number }).j
        for (let k = a; sign > 0 ? k <= b : k >= b; k += sign) res.push(ref[k])
      } else {
        for (let k = i; k <= j; k++) res.push(c[k])
      }
      i = j + 1
    }
    const clean: Pt[] = []
    for (const p of res) if (!clean.length || dist(clean[clean.length - 1], p) > 1e-4) clean.push(p)
    out[id] = clean
    clean.forEach((p, j) => {
      const k = `${cellOf(p.x)},${cellOf(p.y)}`
      const list = grid.get(k)
      if (list) list.push({ r: id, j })
      else grid.set(k, [{ r: id, j }])
    })
  }
  return out
}
