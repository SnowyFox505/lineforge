import { octilinearPath } from '../plan/octilinear'
import { WATER } from './types'
import type { CityDoc, Line, Pt } from './types'

// ---------------------------------------------------------------------------
// Line routing
//
// Every segment between two stations is found with A* on the map grid using the
// 8 octilinear directions. The cost function prefers long straight runs, few and
// shallow bends, dry land, and keeps clear of other lines and stations. The
// route continues in the direction the line arrived with, so a station on a
// straight stretch stays on the straight and bends happen between stations.
// User waypoints (`line.via`) are visited in order.
// ---------------------------------------------------------------------------

const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]
const SQ2 = Math.SQRT2

/** Cost of changing direction by n * 45°. Nothing beyond 90° (no hairpins, a train would have to turn round): a U-turn is made of two 90° bends. */
const TURN = [0, 1.1, 3.6, Infinity, Infinity]
const turnCost = (a: number, b: number) => {
  let d = Math.abs(a - b)
  d = Math.min(d, 8 - d)
  return TURN[d]
}

/** Cost for arriving at a station in a direction that does not point towards the next stop (the next leg could not continue smoothly) */
const HINT = [0, 1.5, 5, 14, 14]
const hintCost = (arrive: number, want: number) => {
  let d = Math.abs(arrive - want)
  d = Math.min(d, 8 - d)
  return HINT[d]
}

export interface RouteCtx {
  size: number
  terrain: Uint8Array
  /** Bitmask per cell of the line axes (1=E-W, 2=SE-NW, 4=N-S, 8=SW-NE) used by other lines */
  occ: Uint8Array
  /** Cells already used by the line being routed */
  own: Uint8Array
  /** 1 where a station sits */
  stations: Uint8Array
  /** cells used by heavy-rail lines / by trams of other lines (trams and heavy rail avoid each other's corridors) */
  occHeavy: Uint8Array
  occTram: Uint8Array
  ownTram: boolean
}

export function dirIndex(dx: number, dy: number): number {
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  for (let i = 0; i < 8; i++) if (DX[i] === sx && DY[i] === sy) return i
  return 0
}

/** The octilinear direction closest to the bearing (dx, dy). */
export function bearingDir(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx)
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
}

/** Expand an octilinear polyline into unit lattice steps. */
export function latticePoints(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    const sx = Math.sign(b.x - a.x)
    const sy = Math.sign(b.y - a.y)
    for (let k = 0; k < n; k++) out.push({ x: a.x + sx * k, y: a.y + sy * k })
  }
  if (pts.length) out.push(pts[pts.length - 1])
  return out
}

function markPolyline(mask: Uint8Array, size: number, pts: Pt[], axisBits: boolean, radius = 0) {
  const lp = latticePoints(pts)
  for (let i = 0; i < lp.length; i++) {
    const p = lp[i]
    if (p.x < 0 || p.y < 0 || p.x >= size || p.y >= size) continue
    let bit = 1
    if (axisBits) {
      const q = lp[i + 1] ?? lp[i - 1]
      if (q) bit = 1 << (dirIndex(q.x - p.x, q.y - p.y) & 3)
    }
    if (radius > 0) {
      // a wider swath: trams and railway keep a street's width apart
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = p.x + dx
          const y = p.y + dy
          if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1
        }
      }
      continue
    }
    mask[p.y * size + p.x] |= bit
    if (axisBits && i > 0) {
      const pr = lp[i - 1]
      mask[p.y * size + p.x] |= 1 << (dirIndex(p.x - pr.x, p.y - pr.y) & 3)
    }
  }
}

export function buildCtx(doc: CityDoc, ownLineId: string | null, skipSeg = -1): RouteCtx {
  const size = doc.size
  const occ = new Uint8Array(size * size)
  const own = new Uint8Array(size * size)
  const stations = new Uint8Array(size * size)
  const occHeavy = new Uint8Array(size * size)
  const occTram = new Uint8Array(size * size)
  for (const st of Object.values(doc.stations)) stations[st.y * size + st.x] = 1
  for (const line of Object.values(doc.lines)) {
    (line.segs ?? []).forEach((seg, k) => {
      if (!seg) return
      if (line.id === ownLineId) {
        if (k !== skipSeg) markPolyline(own, size, seg, false)
      } else {
        markPolyline(occ, size, seg, true)
        markPolyline(line.operator === 'tram' ? occTram : occHeavy, size, seg, false, 2)
      }
    })
  }
  return { size, terrain: doc.terrain, occ, own, stations, occHeavy, occTram, ownTram: ownLineId ? doc.lines[ownLineId]?.operator === 'tram' : false }
}

// ---- binary heap ----------------------------------------------------------
class Heap {
  private f: number[] = []
  private id: number[] = []
  get size() {
    return this.f.length
  }
  push(f: number, id: number) {
    const F = this.f
    const I = this.id
    let i = F.length
    F.push(f)
    I.push(id)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (F[p] <= f) break
      F[i] = F[p]
      I[i] = I[p]
      i = p
    }
    F[i] = f
    I[i] = id
  }
  pop(): number {
    const F = this.f
    const I = this.id
    const top = I[0]
    const lf = F.pop()!
    const li = I.pop()!
    const n = F.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && F[c + 1] < F[c]) c++
        if (F[c] >= lf) break
        F[i] = F[c]
        I[i] = I[c]
        i = c
      }
      F[i] = lf
      I[i] = li
    }
    return top
  }
}

export interface LegResult {
  pts: Pt[]
  endDir: number
}

/** A* between two lattice points. `startDir` (0..7) is the direction the line arrives with, or null. */
export function routeLeg(ctx: RouteCtx, from: Pt, to: Pt, startDir: number | null, exitHint: number | null = null): LegResult {
  if (from.x === to.x && from.y === to.y) return { pts: [from], endDir: startDir ?? 0 }
  const { size, terrain, occ, own, stations, occHeavy, occTram, ownTram } = ctx
  const foreign = ownTram ? occHeavy : occTram
  const dist = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y))
  const M = Math.max(14, Math.round(dist * 0.4))
  const x0 = Math.max(0, Math.min(from.x, to.x) - M)
  const y0 = Math.max(0, Math.min(from.y, to.y) - M)
  const x1 = Math.min(size - 1, Math.max(from.x, to.x) + M)
  const y1 = Math.min(size - 1, Math.max(from.y, to.y) + M)
  const W = x1 - x0 + 1
  const H = y1 - y0 + 1
  // State = cell, heading and how far the line has gone in that heading (0..2 cells): turning again right after a short
  // stub costs extra, so hooks and 1-cell jogs give way to a wide, flat bend (a train cannot follow a 1-cell hook)
  const RUN = 3
  const N = W * H * 8
  const g = new Float32Array(N * RUN).fill(Infinity)
  const parent = new Int32Array(N * RUN).fill(-1)
  const closed = new Uint8Array(N * RUN)
  const heap = new Heap()

  const h = (x: number, y: number) => {
    const dx = Math.abs(x - to.x)
    const dy = Math.abs(y - to.y)
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy)
  }
  const sid = (x: number, y: number, d: number) => ((y - y0) * W + (x - x0)) * 8 + d

  for (let d = 0; d < 8; d++) {
    const c = startDir === null ? 0 : turnCost(startDir, d)
    if (!isFinite(c)) continue
    const id = sid(from.x, from.y, d) * RUN + (RUN - 1)
    g[id] = c
    heap.push(c + h(from.x, from.y), id)
  }

  let goal = -1
  while (heap.size) {
    const id = heap.pop()
    if (closed[id]) continue
    closed[id] = 1
    const run = id % RUN
    const sidx = (id / RUN) | 0
    const d = sidx & 7
    const cell = sidx >> 3
    const x = (cell % W) + x0
    const y = ((cell / W) | 0) + y0
    if (x === to.x && y === to.y) {
      goal = id
      break
    }
    const gc = g[id]
    for (let nd = 0; nd < 8; nd++) {
      const t = turnCost(d, nd)
      if (!isFinite(t)) continue
      const nx = x + DX[nd]
      const ny = y + DY[nd]
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue
      const len = nd & 1 ? SQ2 : 1
      const ci = ny * size + nx
      let c = len + t
      // a bend right after a short stub (hook): dearer the sharper it is
      if (nd !== d && run < RUN - 1) c += 1.2 + t * 0.5
      if (terrain[ci] === WATER) c += 2.4 * len
      const o = occ[ci]
      // running along another line's axis is free: lines bundle into one corridor (the lane layout spreads them side by
      // side); a detour around it would cost far more than the shared stretch. Crossing it at an angle stays dearer.
      if (o && !(o & (1 << (nd & 3)))) c += 2.6
      if (own[ci]) c += 6
      // trams run on streets, heavy rail on its own track bed: keep out of each other's corridors
      if (foreign[ci]) c += 3 * len
      if (stations[ci] && !(nx === to.x && ny === to.y)) c += 8
      if (exitHint !== null && nx === to.x && ny === to.y) {
        // arrive pointing the way the line goes on, and also come from that side a few cells before (no hook at the station)
        c += hintCost(nd, exitHint)
        let back = id
        for (let q = 0; q < 3 && parent[back] >= 0; q++) back = parent[back]
        const bc = ((back / RUN) | 0) >> 3
        const bx = (bc % W) + x0
        const by = ((bc / W) | 0) + y0
        if (bx !== nx || by !== ny) c += 0.8 * hintCost(bearingDir(nx - bx, ny - by), exitHint)
      }
      const nr = nd === d ? Math.min(RUN - 1, run + 1) : 1
      const nid = sid(nx, ny, nd) * RUN + nr
      if (closed[nid]) continue
      const ng = gc + c
      if (ng < g[nid]) {
        g[nid] = ng
        parent[nid] = id
        heap.push(ng + h(nx, ny), nid)
      }
    }
  }

  if (goal < 0) {
    // Should not happen (water is passable); fall back to a plain octilinear route.
    return { pts: octilinearPath(from, to), endDir: dirIndex(to.x - from.x, to.y - from.y) }
  }

  const states: number[] = []
  for (let s = goal; s >= 0; s = parent[s]) states.push((s / RUN) | 0)
  states.reverse()
  const pts: Pt[] = []
  states.forEach((s, i) => {
    const d = s & 7
    const cell = s >> 3
    const p = { x: (cell % W) + x0, y: ((cell / W) | 0) + y0 }
    const next = states[i + 1]
    const nextDir = next === undefined ? -2 : next & 7
    // keep the first point, the last point and every point where the direction changes
    if (i === 0 || next === undefined || nextDir !== d) pts.push(p)
  })
  return { pts: simplify(pts), endDir: ((goal / RUN) | 0) & 7 }
}

/** Remove points that lie on a straight line between their neighbours. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    out.push(p)
    while (out.length >= 3) {
      const a = out[out.length - 3]
      const b = out[out.length - 2]
      const c = out[out.length - 1]
      const d1 = dirIndex(b.x - a.x, b.y - a.y)
      const d2 = dirIndex(c.x - b.x, c.y - b.y)
      if (d1 === d2 && sameAxisMove(a, b) && sameAxisMove(b, c)) out.splice(out.length - 2, 1)
      else break
    }
  }
  return out
}

const sameAxisMove = (a: Pt, b: Pt) => {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  return dx === 0 || dy === 0 || dx === dy
}

// ---- segment routing ------------------------------------------------------

function exitDir(pts: Pt[] | undefined): number | null {
  if (!pts || pts.length < 2) return null
  const a = pts[pts.length - 2]
  const b = pts[pts.length - 1]
  return dirIndex(b.x - a.x, b.y - a.y)
}

/** Route segment k of a line (between stations[k] and stations[k+1]) through its waypoints. */
export function routeSegment(doc: CityDoc, line: Line, k: number): Pt[] {
  const A = doc.stations[line.stations[k]]
  const B = doc.stations[line.stations[k + 1]]
  if (!A || !B) return []
  const via = line.via?.[k] ?? []
  const nodes: Pt[] = [{ x: A.x, y: A.y }, ...via, { x: B.x, y: B.y }]
  const ctx = buildCtx(doc, line.id, k)
  let dir = exitDir(line.segs?.[k - 1])
  // where the line goes on after station B: the last leg should arrive pointing that way
  const C = doc.stations[line.stations[k + 2]]
  const hint = C && !(C.x === B.x && C.y === B.y) ? bearingDir(C.x - B.x, C.y - B.y) : null
  let result: Pt[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const leg = routeLeg(ctx, nodes[i], nodes[i + 1], dir, i === nodes.length - 2 ? hint : null)
    dir = leg.endDir
    result = result.length ? simplify([...result, ...leg.pts.slice(1)]) : leg.pts
    // later legs of this segment should avoid what we just laid down
    markPolyline(ctx.own, ctx.size, leg.pts, false)
  }
  return result
}

// ---- immutable line edits -------------------------------------------------

function withLine(doc: CityDoc, line: Line): CityDoc {
  return { ...doc, lines: { ...doc.lines, [line.id]: line } }
}

/** Make sure via/segs arrays have the right shape. */
function shape(line: Line): Line {
  const n = line.stations.length
  const via = Array.from({ length: n }, (_, i) => line.via?.[i] ?? [])
  const segs = Array.from({ length: Math.max(0, n - 1) }, (_, i) => line.segs?.[i] as Pt[])
  return { ...line, via, segs }
}

/** Recompute segment k, the one before it (it now knows where the line goes on) and the one after it (direction continuity). */
function rerouteAt(doc: CityDoc, lineId: string, k: number): CityDoc {
  let d = doc
  for (const i of [k - 1, k, k + 1]) {
    const line = d.lines[lineId]
    if (!line || i < 0 || i >= line.stations.length - 1) continue
    const segs = [...(line.segs ?? [])]
    segs[i] = routeSegment(d, line, i)
    d = withLine(d, { ...line, segs })
  }
  return d
}

/** Fill in every missing segment (old saves, imports). Returns the same doc when nothing is missing. */
export function withRoutes(doc: CityDoc): CityDoc {
  let d = doc
  for (const id of Object.keys(doc.lines)) {
    const orig = d.lines[id]
    const needs =
      !orig.via ||
      orig.via.length !== orig.stations.length ||
      !orig.segs ||
      orig.segs.length !== Math.max(0, orig.stations.length - 1) ||
      orig.segs.some((s) => !s)
    if (!needs) continue
    d = withLine(d, shape(orig))
    const n = d.lines[id].stations.length
    for (let k = 0; k < n - 1; k++) {
      const line = d.lines[id]
      if (line.segs?.[k]) continue
      const segs = [...(line.segs ?? [])]
      segs[k] = routeSegment(d, line, k)
      d = withLine(d, { ...line, segs })
    }
  }
  return d
}

// ---- healing old routes -------------------------------------------------------

const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
const turnSteps = (a: number, b: number) => {
  const d = Math.abs(a - b)
  return Math.min(d, 8 - d)
}

/** Direction of the first non-empty piece of a route (null when there is none). */
function entryDir(pts: Pt[] | undefined): number | null {
  if (!pts) return null
  for (let i = 0; i + 1 < pts.length; i++) if (cheb(pts[i], pts[i + 1]) > 0) return dirIndex(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  return null
}

/**
 * A hook: a piece of at most one cell between two bends that together turn the line by 135� or more (the way a route
 * from before the bend-penalty doubled back at a station). A train cannot follow it, the 3D tracks wind up into a tight loop.
 */
function hasHook(before: number | null, seg: Pt[], after: number | null): boolean {
  for (let i = 0; i + 1 < seg.length; i++) {
    if (cheb(seg[i], seg[i + 1]) > 1) continue
    const d = dirIndex(seg[i + 1].x - seg[i].x, seg[i + 1].y - seg[i].y)
    const b = i > 0 ? dirIndex(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y) : before
    const a = i + 2 < seg.length ? dirIndex(seg[i + 2].x - seg[i + 1].x, seg[i + 2].y - seg[i + 1].y) : after
    if (b !== null && a !== null && turnSteps(b, a) >= 3 && turnSteps(b, d) >= 1 && turnSteps(a, d) >= 1) return true
  }
  return false
}

/**
 * Routes saved with an older version may contain such hooks. Route those legs again (legs with waypoints of the user
 * stay as they are). Returns the same document when nothing needs healing.
 */
export function healHooks(doc: CityDoc): CityDoc {
  let d = doc
  for (const id of Object.keys(doc.lines)) {
    const n = doc.lines[id].segs?.length ?? 0
    for (let k = 0; k < n; k++) {
      const cur = d.lines[id]
      const seg = cur.segs?.[k]
      if (!seg || seg.length < 2 || (cur.via?.[k] ?? []).length) continue
      const prev = cur.segs?.[k - 1]
      const before = prev && prev.length >= 2 ? exitDir(prev) : null
      if (!hasHook(before, seg, entryDir(cur.segs?.[k + 1]))) continue
      for (const i of [k - 1, k, k + 1]) {
        const line = d.lines[id]
        if (i < 0 || i >= line.stations.length - 1 || (line.via?.[i] ?? []).length) continue
        const segs = [...(line.segs ?? [])]
        segs[i] = routeSegment(d, line, i)
        d = withLine(d, { ...line, segs })
      }
    }
  }
  return d
}

export function appendStation(doc: CityDoc, lineId: string, stationId: string): CityDoc {
  const base = doc.lines[lineId]
  if (!base || !doc.stations[stationId]) return doc
  if (base.stations[base.stations.length - 1] === stationId) return doc
  const line = shape(base)
  const n = line.stations.length
  const next: Line = {
    ...line,
    stations: [...line.stations, stationId],
    via: [...(line.via ?? []), []],
    segs: n > 0 ? [...(line.segs ?? []), undefined as unknown as Pt[]] : [],
  }
  return n > 0 ? rerouteAt(withLine(doc, next), lineId, n - 1) : withLine(doc, next)
}

export function popStation(doc: CityDoc, lineId: string): CityDoc {
  const base = doc.lines[lineId]
  if (!base || !base.stations.length) return doc
  const line = shape(base)
  return withLine(doc, {
    ...line,
    stations: line.stations.slice(0, -1),
    via: (line.via ?? []).slice(0, -1),
    segs: (line.segs ?? []).slice(0, -1),
  })
}

/** Remove a station from the document and heal every line that stopped there. */
export function removeStationEverywhere(doc: CityDoc, id: string): CityDoc {
  const stations = { ...doc.stations }
  delete stations[id]
  let d: CityDoc = { ...doc, stations }
  for (const lineId of Object.keys(d.lines)) {
    let line = shape(d.lines[lineId])
    if (!line.stations.includes(id)) {
      d = withLine(d, line)
      continue
    }
    const redo: number[] = []
    for (let k = line.stations.length - 1; k >= 0; k--) {
      if (line.stations[k] !== id) continue
      const n = line.stations.length
      const st = [...line.stations]
      const via = [...(line.via ?? [])]
      const segs = [...(line.segs ?? [])]
      if (k === n - 1) {
        st.pop()
        via.pop()
        segs.pop()
      } else if (k === 0) {
        st.shift()
        via.shift()
        segs.shift()
      } else {
        via[k - 1] = [...via[k - 1], ...via[k]]
        via.splice(k, 1)
        st.splice(k, 1)
        segs.splice(k - 1, 2, undefined as unknown as Pt[])
        redo.push(k - 1)
      }
      line = { ...line, stations: st, via, segs }
    }
    // an adjacent duplicate can appear (A, X, A -> A, A): drop it
    const keep = line.stations.map((s, i, arr) => s !== arr[i - 1])
    if (keep.some((k) => !k)) {
      const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0)
      line = shape({ ...line, stations: idx.map((i) => line.stations[i]), via: idx.map((i) => line.via![i]), segs: [] })
      d = withLine(d, line)
      d = withRoutes(d)
      continue
    }
    d = withLine(d, line)
    for (const k of redo.sort((a, b) => a - b)) d = rerouteAt(d, lineId, k)
  }
  return d
}

// ---- waypoints --------------------------------------------------------------

export function polyLength(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return s
}

/** Nearest point on a polyline: distance to it and arc length along it. */
export function nearestOnPolyline(pts: Pt[], p: Pt): { dist: number; along: number } {
  let best = { dist: Infinity, along: 0 }
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
    if (d < best.dist) best = { dist: d, along: acc + Math.sqrt(len2) * t }
    acc += Math.sqrt(len2)
  }
  return best
}

/**
 * Add a waypoint to a line. It joins the nearest existing segment when the tap is close to one,
 * otherwise it is collected for the segment that the next station will start.
 */
export function addWaypoint(doc: CityDoc, lineId: string, p: Pt): CityDoc {
  const base = doc.lines[lineId]
  if (!base || !base.stations.length) return doc
  const line = shape(base)
  const n = line.stations.length
  let bestK = -1
  let bestD = Infinity
  ;(line.segs ?? []).forEach((seg, k) => {
    if (!seg || seg.length < 2) return
    const d = nearestOnPolyline(seg, p).dist
    if (d < bestD) {
      bestD = d
      bestK = k
    }
  })
  if (bestK >= 0 && bestD <= 3.5) {
    const seg = line.segs![bestK]
    const list = [...(line.via![bestK] ?? []), p]
    list.sort((a, b) => nearestOnPolyline(seg, a).along - nearestOnPolyline(seg, b).along)
    const via = [...line.via!]
    via[bestK] = list
    return rerouteAt(withLine(doc, { ...line, via }), lineId, bestK)
  }
  const via = [...line.via!]
  via[n - 1] = [...via[n - 1], p]
  return withLine(doc, { ...line, via })
}

export function moveWaypoint(doc: CityDoc, lineId: string, k: number, j: number, p: Pt): CityDoc {
  const line = doc.lines[lineId] && shape(doc.lines[lineId])
  if (!line || !line.via?.[k]?.[j]) return doc
  const via = [...line.via]
  via[k] = via[k].map((q, i) => (i === j ? p : q))
  return rerouteAt(withLine(doc, { ...line, via }), lineId, k)
}

export function removeWaypoint(doc: CityDoc, lineId: string, k: number, j: number): CityDoc {
  const line = doc.lines[lineId] && shape(doc.lines[lineId])
  if (!line || !line.via?.[k]?.[j]) return doc
  const via = [...line.via]
  via[k] = via[k].filter((_, i) => i !== j)
  return rerouteAt(withLine(doc, { ...line, via }), lineId, k)
}

/** Drop all waypoints of a line and route it again from scratch. */
export function resetRoute(doc: CityDoc, lineId: string): CityDoc {
  const base = doc.lines[lineId]
  if (!base) return doc
  const n = base.stations.length
  let d = withLine(doc, { ...base, via: Array.from({ length: n }, () => []), segs: Array.from({ length: Math.max(0, n - 1) }, () => undefined as unknown as Pt[]) })
  d = withRoutes(d)
  return d
}
