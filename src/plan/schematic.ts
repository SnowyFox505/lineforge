import { withRoutes } from '../model/routing'
import type { CityDoc, Line, Pt, Station } from '../model/types'

/**
 * The network plan: the geography of the map turned into a schematic network (stations on a grid, every
 * connection at 0°/45°/90°, even spacing), as in the Berlin plan.
 *
 * Only the POSITIONS of the stations are searched for here (hill climbing with a cost made of: how far an edge is from
 * the nearest 45° direction, how far its length is from the wanted one, whether it still points the way it does on the
 * map, whether the bends of a line keep their sense, spacing, clearance, crossings, and a weak pull towards the place
 * on the map). The octilinear router that already exists then lays the lines between the stations.
 */

/** Typical length of a connection in the plan (cells); the map is scaled so that its median connection comes out about this long */
const TYPICAL = 7
const MIN_LEN = 3
const MIN_SEP = 3
const CLEAR = 1.9
const Q = Math.PI / 4
const TAU = Math.PI * 2

const W = { angle: 3, length: 0.8, rel: 12, turn: 3, home: 0.04, sep: 20, clear: 10, cross: 15, gap: 20, short: 30 }

const norm = (a: number) => {
  while (a > Math.PI) a -= TAU
  while (a <= -Math.PI) a += TAU
  return a
}

interface Edge {
  a: number
  b: number
  /** wanted length in plan cells */
  target: number
  /** direction on the map */
  geoAng: number
}

interface Graph {
  ids: string[]
  index: Map<string, number>
  geo: Pt[]
  edges: Edge[]
  /** edge indices per node */
  inc: number[][]
  /** triples (a, b, c) of consecutive stations of a line, with the turn they have on the map (in 45° steps) */
  triples: { a: number; b: number; c: number; turn: number }[]
  tripleOf: number[][]
  /** nodes that belong to a line (the rest stays where it is) */
  used: boolean[]
}

function buildGraph(doc: CityDoc): Graph {
  const ids = Object.keys(doc.stations).sort()
  const index = new Map(ids.map((id, i) => [id, i] as const))
  // one scale for the whole map: the median connection becomes TYPICAL plan cells long
  const lens: number[] = []
  for (const line of Object.values(doc.lines)) {
    for (let k = 0; k + 1 < line.stations.length; k++) {
      const a = doc.stations[line.stations[k]]
      const b = doc.stations[line.stations[k + 1]]
      if (a && b && (a.x !== b.x || a.y !== b.y)) lens.push(Math.hypot(b.x - a.x, b.y - a.y))
    }
  }
  lens.sort((x, y) => x - y)
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 1
  const scale = Math.min(0.9, Math.max(0.2, TYPICAL / median))
  const geo = ids.map((id) => ({ x: doc.stations[id].x * scale, y: doc.stations[id].y * scale }))
  const used = ids.map(() => false)
  const edgeAt = new Map<string, number>()
  const edges: Edge[] = []
  const triples: Graph['triples'] = []
  for (const line of Object.values(doc.lines)) {
    const st = line.stations.map((id) => index.get(id)).filter((i): i is number => i !== undefined)
    st.forEach((i) => (used[i] = true))
    for (let k = 0; k + 1 < st.length; k++) {
      const a = st[k]
      const b = st[k + 1]
      if (a === b) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (edgeAt.has(key)) continue
      edgeAt.set(key, edges.length)
      const d = Math.hypot(geo[b].x - geo[a].x, geo[b].y - geo[a].y)
      // the plan shows short distances about true and squeezes long ones
      const target = Math.max(MIN_LEN, d <= TYPICAL * 1.6 ? d : TYPICAL * 1.6 + 3 * Math.log2(d / (TYPICAL * 1.6)))
      edges.push({ a: a < b ? a : b, b: a < b ? b : a, target, geoAng: Math.atan2(geo[b].y - geo[a].y, geo[b].x - geo[a].x) })
    }
    for (let k = 1; k + 1 < st.length; k++) {
      const [a, b, c] = [st[k - 1], st[k], st[k + 1]]
      if (a === b || b === c || a === c) continue
      const turn = norm(Math.atan2(geo[c].y - geo[b].y, geo[c].x - geo[b].x) - Math.atan2(geo[b].y - geo[a].y, geo[b].x - geo[a].x)) / Q
      triples.push({ a, b, c, turn })
    }
  }
  // edge directions point from the lower to the higher index: fix geoAng accordingly
  edges.forEach((e) => {
    e.geoAng = Math.atan2(geo[e.b].y - geo[e.a].y, geo[e.b].x - geo[e.a].x)
  })
  const inc: number[][] = ids.map(() => [])
  edges.forEach((e, i) => {
    inc[e.a].push(i)
    inc[e.b].push(i)
  })
  const tripleOf: number[][] = ids.map(() => [])
  triples.forEach((t, i) => {
    tripleOf[t.a].push(i)
    tripleOf[t.b].push(i)
    tripleOf[t.c].push(i)
  })
  return { ids, index, geo, edges, inc, triples, tripleOf, used }
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
}

function cross2(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const d1 = cross2(a, b, c)
  const d2 = cross2(a, b, d)
  const d3 = cross2(c, d, a)
  const d4 = cross2(c, d, b)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

class Solver {
  readonly pos: Pt[]
  readonly g: Graph
  readonly fixed: boolean[]
  constructor(g: Graph, start: Pt[], fixed: boolean[]) {
    this.g = g
    this.fixed = fixed
    this.pos = start.map((p) => ({ ...p }))
  }

  private edgeCost(e: Edge) {
    const { pos } = this
    const a = pos[e.a]
    const b = pos[e.b]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) return 1e4
    const ang = Math.atan2(dy, dx)
    const dev = Math.abs(ang - Math.round(ang / Q) * Q)
    const off = len * Math.sin(dev)
    let c = W.angle * off * off
    c += (W.length * (len - e.target) ** 2) / e.target
    if (len < MIN_LEN) c += W.short * (MIN_LEN - len) ** 2
    // pointing about the way it does on the map is free (a direction between two 45 degree steps may go either way)
    const dr = Math.max(0, Math.abs(norm(ang - e.geoAng)) / Q - 0.75)
    return c + W.rel * dr * dr
  }

  private gapCost(n: number) {
    const inc = this.g.inc[n]
    if (inc.length < 2) return 0
    const angs = inc.map((ei) => {
      const e = this.g.edges[ei]
      const o = this.pos[e.a === n ? e.b : e.a]
      return Math.atan2(o.y - this.pos[n].y, o.x - this.pos[n].x)
    })
    angs.sort((x, y) => x - y)
    let min = Infinity
    for (let i = 0; i < angs.length; i++) {
      const next = i + 1 < angs.length ? angs[i + 1] : angs[0] + TAU
      min = Math.min(min, next - angs[i])
    }
    const short = Math.max(0, 1 - min / Q)
    return W.gap * short * short
  }

  private tripleCost(ti: number) {
    const t = this.g.triples[ti]
    const { pos } = this
    const a1 = Math.atan2(pos[t.b].y - pos[t.a].y, pos[t.b].x - pos[t.a].x)
    const a2 = Math.atan2(pos[t.c].y - pos[t.b].y, pos[t.c].x - pos[t.b].x)
    const turn = norm(a2 - a1) / Q
    const d = norm((turn - t.turn) * Q) / Q
    return W.turn * d * d
  }

  /** every term that depends on the position of node n, each counted once */
  cost(n: number): number {
    const { g, pos } = this
    let c = W.home * ((pos[n].x - g.geo[n].x) ** 2 + (pos[n].y - g.geo[n].y) ** 2)
    const mine = g.inc[n]
    for (const ei of mine) {
      c += this.edgeCost(g.edges[ei])
      const e = g.edges[ei]
      c += this.gapCost(e.a === n ? e.b : e.a)
    }
    c += this.gapCost(n)
    for (const ti of g.tripleOf[n]) c += this.tripleCost(ti)
    const mineSet = new Set(mine)
    for (let k = 0; k < pos.length; k++) {
      if (k === n || !g.used[k]) continue
      const d = Math.hypot(pos[k].x - pos[n].x, pos[k].y - pos[n].y)
      if (d < MIN_SEP) c += W.sep * (MIN_SEP - d) ** 2
      // other nodes close to my edges
      for (const ei of mine) {
        const e = g.edges[ei]
        if (e.a === k || e.b === k) continue
        const dd = segDist(pos[k], pos[e.a], pos[e.b])
        if (dd < CLEAR) c += W.clear * (CLEAR - dd) ** 2
      }
    }
    // my node close to other edges, and crossings
    for (let ei = 0; ei < g.edges.length; ei++) {
      const e = g.edges[ei]
      const mineEdge = mineSet.has(ei)
      if (!mineEdge && e.a !== n && e.b !== n) {
        const dd = segDist(pos[n], pos[e.a], pos[e.b])
        if (dd < CLEAR) c += W.clear * (CLEAR - dd) ** 2
      }
      if (!mineEdge) continue
      for (let fj = 0; fj < g.edges.length; fj++) {
        if (fj === ei || (mineSet.has(fj) && fj < ei)) continue
        const f = g.edges[fj]
        if (f.a === e.a || f.a === e.b || f.b === e.a || f.b === e.b) continue
        if (segsCross(pos[e.a], pos[e.b], pos[f.a], pos[f.b])) c += W.cross
      }
    }
    return c
  }

  candidates(n: number, step: number): Pt[] {
    const { g, pos } = this
    const p = pos[n]
    const out: Pt[] = []
    for (let k = 0; k < 8; k++) {
      const ang = k * Q
      const dx = Math.round(Math.cos(ang))
      const dy = Math.round(Math.sin(ang))
      out.push({ x: p.x + dx * step, y: p.y + dy * step })
    }
    // positions that make an edge exactly octilinear (at about its wanted length)
    for (const ei of g.inc[n]) {
      const e = g.edges[ei]
      const o = pos[e.a === n ? e.b : e.a]
      const L = Math.round(e.target)
      for (const len of [L - 1, L, L + 1]) {
        if (len < MIN_LEN - 0.5) continue
        for (let k = 0; k < 8; k++) {
          const dx = Math.round(Math.cos(k * Q))
          const dy = Math.round(Math.sin(k * Q))
          out.push({ x: o.x + dx * len, y: o.y + dy * len })
        }
      }
    }
    out.push({ x: Math.round(g.geo[n].x), y: Math.round(g.geo[n].y) })
    return out
  }

  run(budgetMs: number) {
    const t0 = Date.now()
    const { g } = this
    const order = g.ids.map((_, i) => i).filter((i) => g.used[i] && !this.fixed[i])
    for (const step of [3, 2, 1, 1]) {
      for (let round = 0; round < 25; round++) {
        let moved = 0
        for (const n of order) {
          const base = this.pos[n]
          let best = base
          let bestCost = this.cost(n)
          for (const cand of this.candidates(n, step)) {
            if (cand.x === base.x && cand.y === base.y) continue
            this.pos[n] = cand
            const c = this.cost(n)
            if (c < bestCost - 1e-9) {
              bestCost = c
              best = cand
            }
          }
          this.pos[n] = best
          if (best !== base) moved++
        }
        if (!moved || Date.now() - t0 > budgetMs) break
      }
      if (Date.now() - t0 > budgetMs) break
    }
  }
}

export interface Schematic {
  /** a copy of the city with the stations at their plan positions and octilinear routes */
  doc: CityDoc
  /** plan position (absolute plan coordinates, before the offset) of every station */
  pos: Record<string, Pt>
  /** the plan document's coordinates are the absolute ones plus this offset */
  offset: Pt
}

/**
 * Turn the map into a plan. Stations with `planPin` stay where the user put them; the rest arranges itself around them.
 */
export function schematize(doc: CityDoc, opts: { budgetMs?: number } = {}): Schematic {
  const g = buildGraph(doc)
  const fixed = g.ids.map((id) => !!doc.stations[id].planPin)
  const start = g.ids.map((id, i) => {
    const pin = doc.stations[id].planPin
    return pin ? { x: pin.x, y: pin.y } : { x: Math.round(g.geo[i].x), y: Math.round(g.geo[i].y) }
  })
  const solver = new Solver(g, start, fixed)
  solver.run(opts.budgetMs ?? 220)

  // two stations on one point (only possible by pins or leftovers): nudge the movable one
  const seen = new Set<string>()
  g.ids.forEach((_, i) => {
    const p = solver.pos[i]
    let k = 0
    while (seen.has(`${p.x},${p.y}`) && k < 40) {
      const ang = (k % 8) * Q
      p.x += Math.round(Math.cos(ang))
      p.y += Math.round(Math.sin(ang))
      k++
    }
    seen.add(`${p.x},${p.y}`)
  })

  const MARGIN = 6
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of solver.pos) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!solver.pos.length) {
    minX = minY = 0
    maxX = maxY = 0
  }
  const offset = { x: MARGIN - minX, y: MARGIN - minY }
  const size = Math.max(maxX - minX, maxY - minY) + MARGIN * 2 + 1

  const pos: Record<string, Pt> = {}
  const stations: Record<string, Station> = {}
  g.ids.forEach((id, i) => {
    pos[id] = { x: solver.pos[i].x, y: solver.pos[i].y }
    stations[id] = { ...doc.stations[id], x: solver.pos[i].x + offset.x, y: solver.pos[i].y + offset.y }
  })
  const lines: Record<string, Line> = {}
  for (const [id, line] of Object.entries(doc.lines)) {
    lines[id] = { ...line, via: undefined, segs: undefined }
  }
  const plan: CityDoc = { ...doc, size, terrain: new Uint8Array(size * size), zoneGrid: undefined, zones: [], pois: [], stations, lines, geoV: 1 }
  return { doc: withRoutes(plan), pos, offset }
}
