import { avenuesOf, DEFAULT_LOOK, frameOf, lookKey, lookOf, streetSegments } from '../editor2d/streets'
import type { StreetFrame } from '../editor2d/streets'
import type { StreetLook, UrbanKind } from '../editor2d/streets'
import { nearestOnCurve, pointsFromRoute } from './geo'
import { Heap } from './heap'
import { WATER } from './types'
import type { CityDoc, Pt } from './types'

/**
 * The street network of a city as a graph, for the trams: they run on the streets the map shows (the main streets of the
 * neighbourhoods, the borders between them, the long avenues and the ring road), not on the lattice of the map.
 * The same generator draws the streets in 2D and places the houses in 3D (editor2d/streets.ts), so a tram that follows
 * this graph follows the streets that are on screen.
 */

interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  /** cost per cell: avenues are cheaper than main streets, side streets and borders dearer */
  w: number
  /** the neighbourhood kind the street belongs to; avenues belong to either */
  kind: UrbanKind | 'any'
  /** the street look the street belongs to (null for avenues) */
  look: string | null
}

export interface StreetGraph {
  nx: Float32Array
  ny: Float32Array
  /** undirected edges: nodes a, b, length, cost per cell */
  ea: Int32Array
  eb: Int32Array
  elen: Float32Array
  ew: Float32Array
  /** outgoing directed edges per node (directed edge 2e leaves a, 2e+1 leaves b) */
  out: number[][]
}

const TOL = 0.12
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

/** Parameters [t0, t1] of the part of the segment p + t*d (t in 0..1) that lies inside a convex polygon, or null. */
function clipToPolygon(px: number, py: number, dx: number, dy: number, poly: [number, number][]): [number, number] | null {
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const sgn = area >= 0 ? 1 : -1
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    // inside = left of the edge for a counter-clockwise polygon
    const f0 = sgn * (ex * (py - a[1]) - ey * (px - a[0]))
    const df = sgn * (ex * dy - ey * dx)
    if (Math.abs(df) < 1e-12) {
      if (f0 < 0) return null
      continue
    }
    const t = -f0 / df
    if (df > 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [t0, t1]
}

function collectSegments(size: number, looks: Map<string, StreetLook>, frame: StreetFrame): Seg[] {
  const segs: Seg[] = []
  const box: [number, number][] = [[0, 0], [size, 0], [size, size], [0, size]]
  const add = (x0: number, y0: number, x1: number, y1: number, w: number, kind: Seg['kind'], look: string | null) => {
    const c = clipToPolygon(x0, y0, x1 - x0, y1 - y0, box)
    if (!c) return
    const ax = x0 + (x1 - x0) * c[0]
    const ay = y0 + (y1 - y0) * c[0]
    const bx = x0 + (x1 - x0) * c[1]
    const by = y0 + (y1 - y0) * c[1]
    if (Math.hypot(bx - ax, by - ay) < 0.05) return
    segs.push({ x0: ax, y0: ay, x1: bx, y1: by, w, kind, look })
  }
  const seenBorder = new Set<string>()
  const key = (p: [number, number]) => `${Math.round(p[0] * 500)},${Math.round(p[1] * 500)}`
  for (const kind of ['city', 'suburb'] as UrbanKind[]) {
    for (const [lk, look] of looks) {
    for (const { patch: p, major, minor } of streetSegments(kind, size, look, frame)) {
      // main and side streets, clipped to the neighbourhood
      const clipped = (list: [number, number, number, number][], w: number) => {
        for (const [x0, y0, x1, y1] of list) {
          const c = clipToPolygon(x0, y0, x1 - x0, y1 - y0, p.cell)
          if (!c) continue
          add(x0 + (x1 - x0) * c[0], y0 + (y1 - y0) * c[0], x0 + (x1 - x0) * c[1], y0 + (y1 - y0) * c[1], w, kind, lk)
        }
      }
      clipped(major, 1)
      clipped(minor, 1.3)
      // the border to the next neighbourhood (every border is shared: add it once)
      for (let i = 0; i < p.cell.length; i++) {
        const a = p.cell[i]
        const b = p.cell[(i + 1) % p.cell.length]
        const k = [key(a), key(b)].sort().join('|') + '|' + kind + '|' + lk
        if (seenBorder.has(k)) continue
        seenBorder.add(k)
        add(a[0], a[1], b[0], b[1], 1.15, kind, lk)
      }
    }
    }
  }
  // long avenues and the ring road
  const av = avenuesOf(size, frame)
  const L = Math.max(frame.gen, size + Math.abs(frame.dx) + Math.abs(frame.dy)) * 1.6
  for (const a of av.angles) add(av.cx - Math.cos(a) * L, av.cy - Math.sin(a) * L, av.cx + Math.cos(a) * L, av.cy + Math.sin(a) * L, 0.85, 'any', null)
  if (av.ring > 0) {
    const N = 72
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2
      const t1 = ((i + 1) / N) * Math.PI * 2
      add(av.cx + Math.cos(t0) * av.ring, av.cy + Math.sin(t0) * av.ring, av.cx + Math.cos(t1) * av.ring, av.cy + Math.sin(t1) * av.ring, 0.85, 'any', null)
    }
  }
  return segs
}

/** Build the graph for a map: only the stretches that lie inside a city or suburb zone, on land. */
export function buildStreetGraph(doc: CityDoc): StreetGraph | null {
  const { size, zoneGrid, zones } = doc
  if (!zoneGrid || !zones?.length) return null
  const kindOf = new Map(zones.map((z) => [z.id, z.kind]))
  const zoneById = new Map(zones.map((z) => [z.id, z]))
  // every street look in use: the streets of each are only kept inside the areas that have that look
  const looks = new Map<string, StreetLook>()
  for (const z of zones) if (z.kind === 'city' || z.kind === 'suburb') looks.set(lookKey(lookOf(z)), lookOf(z))
  if (!looks.size) looks.set(lookKey(DEFAULT_LOOK), DEFAULT_LOOK)
  const cellKind = (x: number, y: number): UrbanKind | null => {
    const cx = Math.floor(x)
    const cy = Math.floor(y)
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return null
    if (doc.terrain[cy * size + cx] === WATER) return null
    const k = kindOf.get(zoneGrid[cy * size + cx])
    return k === 'city' || k === 'suburb' ? k : null
  }
  const lookAtCell = (x: number, y: number): string => lookKey(lookOf(zoneById.get(zoneGrid[Math.floor(y) * size + Math.floor(x)])))
  const allowed = (s: Seg, x: number, y: number) => {
    const k = cellKind(x, y)
    return k !== null && (s.kind === 'any' || s.kind === k) && (s.look === null || s.look === lookAtCell(x, y))
  }

  // 1. cut every street into the pieces that lie inside its own kind of area
  const pieces: Seg[] = []
  for (const s of collectSegments(size, looks, frameOf(doc))) {
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    const n = Math.max(1, Math.ceil(len / 0.5))
    let from = -1
    for (let i = 0; i <= n; i++) {
      // sample at the middle of each step
      const t = i < n ? (i + 0.5) / n : 1
      const ok = i < n && allowed(s, s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t)
      if (ok && from < 0) from = i
      if (!ok && from >= 0) {
        const a = from / n
        const b = i / n
        pieces.push({ ...s, x0: s.x0 + (s.x1 - s.x0) * a, y0: s.y0 + (s.y1 - s.y0) * a, x1: s.x0 + (s.x1 - s.x0) * b, y1: s.y0 + (s.y1 - s.y0) * b })
        from = -1
      }
    }
  }
  if (!pieces.length) return null

  // 2. find where pieces cross or touch (T junctions at the borders count): split points per piece
  const splits: number[][] = pieces.map(() => [0, 1])
  const CELL = 8
  const bucket = new Map<number, number[]>()
  const bk = (i: number, j: number) => i * 4096 + j
  pieces.forEach((s, idx) => {
    const i0 = Math.floor((Math.min(s.x0, s.x1) - TOL) / CELL)
    const i1 = Math.floor((Math.max(s.x0, s.x1) + TOL) / CELL)
    const j0 = Math.floor((Math.min(s.y0, s.y1) - TOL) / CELL)
    const j1 = Math.floor((Math.max(s.y0, s.y1) + TOL) / CELL)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = bk(i, j)
        const l = bucket.get(k)
        if (l) l.push(idx)
        else bucket.set(k, [idx])
      }
    }
  })
  const tested = new Set<number>()
  for (const list of bucket.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const i = Math.min(list[a], list[b])
        const j = Math.max(list[a], list[b])
        const pk = i * 65536 + j
        if (tested.has(pk)) continue
        tested.add(pk)
        const A = pieces[i]
        const B = pieces[j]
        const rx = A.x1 - A.x0
        const ry = A.y1 - A.y0
        const sx = B.x1 - B.x0
        const sy = B.y1 - B.y0
        const den = rx * sy - ry * sx
        if (Math.abs(den) < 1e-9) continue
        const qx = B.x0 - A.x0
        const qy = B.y0 - A.y0
        const t = (qx * sy - qy * sx) / den
        const u = (qx * ry - qy * rx) / den
        const la = Math.hypot(rx, ry)
        const lb = Math.hypot(sx, sy)
        if (t < -TOL / la || t > 1 + TOL / la || u < -TOL / lb || u > 1 + TOL / lb) continue
        splits[i].push(Math.max(0, Math.min(1, t)))
        splits[j].push(Math.max(0, Math.min(1, u)))
      }
    }
  }

  // 3. nodes at the split points (merged when closer than TOL), edges between neighbouring split points
  const nodes: Pt[] = []
  const nodeAt = new Map<string, number[]>()
  const node = (x: number, y: number): number => {
    const gi = Math.floor(x / TOL)
    const gj = Math.floor(y / TOL)
    for (let i = gi - 1; i <= gi + 1; i++) {
      for (let j = gj - 1; j <= gj + 1; j++) {
        for (const n of nodeAt.get(`${i},${j}`) ?? []) if (Math.hypot(nodes[n].x - x, nodes[n].y - y) < TOL) return n
      }
    }
    nodes.push({ x, y })
    const k = `${gi},${gj}`
    const l = nodeAt.get(k)
    if (l) l.push(nodes.length - 1)
    else nodeAt.set(k, [nodes.length - 1])
    return nodes.length - 1
  }
  const edgeSeen = new Set<number>()
  const ea: number[] = []
  const eb: number[] = []
  const elen: number[] = []
  const ew: number[] = []
  pieces.forEach((s, idx) => {
    const ts = [...new Set(splits[idx].map((t) => Math.round(t * 1e6) / 1e6))].sort((p, q) => p - q)
    let prev = -1
    for (const t of ts) {
      const cur = node(s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t)
      if (prev >= 0 && cur !== prev) {
        const lo = Math.min(prev, cur)
        const hi = Math.max(prev, cur)
        const ek = lo * 1048576 + hi
        if (!edgeSeen.has(ek)) {
          edgeSeen.add(ek)
          ea.push(prev)
          eb.push(cur)
          elen.push(dist(nodes[prev], nodes[cur]))
          ew.push(s.w)
        }
      }
      prev = cur
    }
  })
  if (!ea.length) return null
  const out: number[][] = nodes.map(() => [])
  ea.forEach((a, e) => {
    out[a].push(2 * e)
    out[eb[e]].push(2 * e + 1)
  })
  return {
    nx: Float32Array.from(nodes, (p) => p.x),
    ny: Float32Array.from(nodes, (p) => p.y),
    ea: Int32Array.from(ea),
    eb: Int32Array.from(eb),
    elen: Float32Array.from(elen),
    ew: Float32Array.from(ew),
    out,
  }
}

const graphCache = new WeakMap<object, { terrain: Uint8Array; zones: CityDoc['zones']; graph: StreetGraph | null }>()

/** The street graph of a document (cached for as long as its zone map, the zones and the terrain stay the same objects). */
export function streetGraphOf(doc: CityDoc): StreetGraph | null {
  if (!doc.zoneGrid) return null
  const hit = graphCache.get(doc.zoneGrid)
  if (hit && hit.terrain === doc.terrain && hit.zones === doc.zones) return hit.graph
  const graph = buildStreetGraph(doc)
  graphCache.set(doc.zoneGrid, { terrain: doc.terrain, zones: doc.zones, graph })
  return graph
}

/** How far (cells) a station may be from a street and still be linked to it */
export const STREET_REACH = 4

interface Foot {
  edge: number
  /** position along the edge from node a, 0..len */
  s: number
  pt: Pt
  d: number
}

function nearestEdge(g: StreetGraph, p: Pt): Foot | null {
  let best: Foot | null = null
  for (let e = 0; e < g.ea.length; e++) {
    const ax = g.nx[g.ea[e]]
    const ay = g.ny[g.ea[e]]
    const bx = g.nx[g.eb[e]]
    const by = g.ny[g.eb[e]]
    // quick reject
    if (p.x < Math.min(ax, bx) - STREET_REACH || p.x > Math.max(ax, bx) + STREET_REACH || p.y < Math.min(ay, by) - STREET_REACH || p.y > Math.max(ay, by) + STREET_REACH) continue
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0
    const q = { x: ax + dx * t, y: ay + dy * t }
    const d = dist(q, p)
    if (d < STREET_REACH && (!best || d < best.d)) best = { edge: e, s: t * g.elen[e], pt: q, d }
  }
  return best
}

/** Extra cost of turning at a junction: nothing straight on, a little for a corner, U-turns are not allowed */
function turnCost(g: StreetGraph, din: number, dout: number): number {
  const vec = (de: number) => {
    const e = de >> 1
    const a = de & 1 ? g.eb[e] : g.ea[e]
    const b = de & 1 ? g.ea[e] : g.eb[e]
    const x = g.nx[b] - g.nx[a]
    const y = g.ny[b] - g.ny[a]
    const l = Math.hypot(x, y) || 1
    return [x / l, y / l]
  }
  const [ax, ay] = vec(din)
  const [bx, by] = vec(dout)
  const cos = ax * bx + ay * by
  if (cos < -0.8) return Infinity
  return 2.4 * (1 - cos)
}

export interface StreetRouteOpts {
  /** the way the user drew (or the curve of the line): streets close to it are preferred */
  guide?: Pt[]
}

/**
 * The way along the streets between two points: the points where it passes the streets, from the foot of `from` to the
 * foot of `to` (both ends included). Null when a point is too far from any street or no connection exists.
 */
export function routeOnStreets(g: StreetGraph, from: Pt, to: Pt, opts: StreetRouteOpts = {}): Pt[] | null {
  const fa = nearestEdge(g, from)
  const fb = nearestEdge(g, to)
  if (!fa || !fb) return null
  const nodeOf = (de: number) => (de & 1 ? g.ea[de >> 1] : g.eb[de >> 1])
  const guideCost = new Map<number, number>()
  const mult = (e: number) => {
    let m = g.ew[e]
    if (opts.guide && opts.guide.length > 1) {
      let c = guideCost.get(e)
      if (c === undefined) {
        const mid = { x: (g.nx[g.ea[e]] + g.nx[g.eb[e]]) / 2, y: (g.ny[g.ea[e]] + g.ny[g.eb[e]]) / 2 }
        c = 1 + 1.0 * Math.min(8, nearestOnCurve(opts.guide, mid).dist)
        guideCost.set(e, c)
      }
      m *= c
    }
    return m
  }
  const D = g.ea.length * 2
  const cost = new Float32Array(D).fill(Infinity)
  const parent = new Int32Array(D).fill(-1)
  const done = new Uint8Array(D)
  const heap = new Heap()
  const LINK = 2.5 // a link from a station to a street costs more than the same distance along one
  const seed = (de: number, c: number) => {
    if (c < cost[de]) {
      cost[de] = c
      heap.push(c, de)
    }
  }
  // the station's foot lies on an edge: the line can leave it towards either end of that edge
  seed(2 * fa.edge + 1, fa.d * LINK + fa.s * mult(fa.edge)) // runs towards node a (state: arrived at a)
  seed(2 * fa.edge, fa.d * LINK + (g.elen[fa.edge] - fa.s) * mult(fa.edge)) // towards node b
  let best = Infinity
  let bestState = -1
  let direct = false
  if (fa.edge === fb.edge) {
    best = fa.d * LINK + Math.abs(fa.s - fb.s) * mult(fa.edge) + fb.d * LINK
    direct = true
  }
  while (heap.size) {
    const top = heap.peek()
    if (top >= best) break
    const de = heap.pop()
    if (done[de]) continue
    done[de] = 1
    const c = cost[de]
    const at = nodeOf(de)
    // arrived at `at` after a full edge: the end foot hangs on one of the edges of this node
    if (at === g.ea[fb.edge] || at === g.eb[fb.edge]) {
      const end = at === g.ea[fb.edge] ? fb.s : g.elen[fb.edge] - fb.s
      const total = c + end * mult(fb.edge) + fb.d * LINK
      if (total < best) {
        best = total
        bestState = de
        direct = false
      }
    }
    for (const nd of g.out[at]) {
      if (nd === (de ^ 1)) continue
      const t = turnCost(g, de, nd)
      if (!isFinite(t)) continue
      const nc = c + t + g.elen[nd >> 1] * mult(nd >> 1)
      if (nc < cost[nd]) {
        cost[nd] = nc
        parent[nd] = de
        heap.push(nc, nd)
      }
    }
  }
  if (!isFinite(best)) return null
  const pt = (n: number): Pt => ({ x: g.nx[n], y: g.ny[n] })
  if (direct) return [fa.pt, fb.pt]
  // walk back through the directed edges
  const nodesPath: number[] = []
  let s = bestState
  while (s >= 0) {
    nodesPath.push(nodeOf(s))
    s = parent[s]
  }
  nodesPath.reverse()
  return [fa.pt, ...nodesPath.map(pt), fb.pt]
}

/** Lines and stations are drawn half a cell off the cell corner (the centre of cell x is x + 0.5); the streets are not */
const SHIFT = 0.5
const toStreets = (p: Pt): Pt => ({ x: p.x + SHIFT, y: p.y + SHIFT })
const fromStreets = (p: Pt): Pt => ({ x: p.x - SHIFT, y: p.y - SHIFT })

/** The closest point on a street (in line coordinates) within `reach` cells, or null. */
export function streetFoot(doc: CityDoc, p: Pt, reach = STREET_REACH): Pt | null {
  const g = streetGraphOf(doc)
  if (!g) return null
  const f = nearestEdge(g, toStreets(p))
  return f && f.d <= reach ? fromStreets(f.pt) : null
}

/**
 * Does a drawn stroke run along streets? Most of it has to lie within `tol` cells of one. A stroke that clearly leaves
 * the streets is meant to; it stays as it was drawn.
 */
export function followsStreets(doc: CityDoc, stroke: Pt[], tol = 1.6): boolean {
  const g = streetGraphOf(doc)
  if (!g || stroke.length < 2) return false
  let near = 0
  let n = 0
  for (let i = 0; i < stroke.length; i += 2) {
    n++
    const f = nearestEdge(g, toStreets(stroke[i]))
    if (f && f.d <= tol) near++
  }
  return near / n >= 0.7
}

/**
 * Control points for a tram leg that follows the streets, or null when the leg has no streets to follow (a station
 * outside the towns, water in between): then the grid router decides. Stations stay where they are.
 */
export function streetViaPoints(doc: CityDoc, a: Pt, b: Pt, opts: StreetRouteOpts = {}): Pt[] | null {
  const g = streetGraphOf(doc)
  if (!g) return null
  const route = routeOnStreets(g, toStreets(a), toStreets(b), { guide: opts.guide?.map(toStreets) })
  if (!route) return null
  let way = route.map(fromStreets)
  // a stop that already stands on the street needs no link to it (it would only make a hook at the corner of the street)
  if (way.length > 2 && dist(way[0], a) < 0.8) way = way.slice(1)
  if (way.length > 2 && dist(way[way.length - 1], b) < 0.8) way = way.slice(0, -1)
  // the street is no detour: a route much longer than the straight line is not worth following
  let len = 0
  for (let i = 1; i < way.length; i++) len += dist(way[i - 1], way[i])
  if (len > dist(a, b) * 2.6 + 12) return null
  const full = [a, ...way, b].filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 0.05)
  const pts = pointsFromRoute(full, 1.6)
  return pts.length ? pts : null
}
