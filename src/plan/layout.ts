import { lineCurve, mergeCorridors } from '../model/geo'
import { latticePoints } from '../model/routing'
import type { CityDoc, Line, Pt } from '../model/types'
import { joinPaths, segmentPath } from './octilinear'

/** The route of a line as one polyline of lattice points (without bundling offsets). */
export function linePolyline(doc: CityDoc, line: Line): Pt[] {
  const parts: Pt[][] = []
  for (let i = 0; i < line.stations.length - 1; i++) {
    const seg = line.segs?.[i]
    if (seg && seg.length >= 2) {
      parts.push(seg)
      continue
    }
    // fallback for documents that have not been routed yet
    const a = doc.stations[line.stations[i]]
    const b = doc.stations[line.stations[i + 1]]
    if (a && b) parts.push(segmentPath(a, b))
  }
  return joinPaths(parts)
}

const key = (a: Pt, b: Pt) =>
  a.x < b.x || (a.x === b.x && a.y < b.y) ? `${a.x},${a.y}|${b.x},${b.y}` : `${b.x},${b.y}|${a.x},${a.y}`

/**
 * Compute the polyline of every line in cell coordinates.
 * Lines that share a stretch of track run side by side, `gap` cells apart (bundling),
 * with a stable lane order, mitred at bends. Coordinates are lattice points; callers add 0.5 for the cell centre.
 * With `share` the lines of one kind that run the same stretch stay on ONE lane (the 3D view lets them share their rails);
 * heavy rail and trams still keep apart.
 */
export function layoutLines(doc: CityDoc, gap: number, opts: { smooth?: number; source?: 'grid' | 'geo'; share?: boolean } = {}): Record<string, Pt[]> {
  const lines = Object.values(doc.lines)
  const lattices: Record<string, Pt[]> = {}
  // 'geo': the free curves of the map (lines on the same corridor get identical points); 'grid': the octilinear routes
  const geoPts: Record<string, Pt[]> = {}
  if (opts.source === 'geo') {
    const raw: Record<string, Pt[]> = {}
    for (const line of lines) raw[line.id] = line.stations.length >= 2 ? lineCurve(doc, line).pts : []
    Object.assign(geoPts, mergeCorridors(raw, 1.0))
  }
  // heavy rail and trams are bundled separately: a tram runs on the street beside the railway, not on its tracks
  const lanes = new Map<string, { h: string[]; t: string[] }>()

  for (const line of lines) {
    const lp = opts.source === 'geo' ? geoPts[line.id] : latticePoints(linePolyline(doc, line))
    lattices[line.id] = lp
    const tram = line.operator === 'tram'
    for (let i = 0; i < lp.length - 1; i++) {
      const k = key(lp[i], lp[i + 1])
      let e = lanes.get(k)
      if (!e) {
        e = { h: [], t: [] }
        lanes.set(k, e)
      }
      const list = tram ? e.t : e.h
      if (!list.includes(line.id)) list.push(line.id)
    }
  }
  // Lane order: the lines of a shared stretch are ordered by where they leave it, so the one that turns left sits on the
  // left and none has to cross another (a plain id order put them on arbitrary sides in front of every junction).
  const edgeIdx = new Map<string, Map<string, number>>()
  for (const line of lines) {
    const lp = lattices[line.id]
    const m = new Map<string, number>()
    for (let i = 0; i < lp.length - 1; i++) {
      const k = key(lp[i], lp[i + 1])
      if (!m.has(k)) m.set(k, i)
    }
    edgeIdx.set(line.id, m)
  }
  const look = opts.source === 'geo' ? 8 : 0
  const isCanon = (a: Pt, b: Pt) => a.x < b.x || (a.x === b.x && a.y < b.y)
  const pairMemo = new Map<string, number>()
  /** <0: `a` takes the lower lane (-normal side) of edge `k`, >0 the higher one */
  const compare = (a: string, b: string, k: string): number => {
    const mk = `${a}|${b}|${k}`
    const hit = pairMemo.get(mk)
    if (hit !== undefined) return hit
    const la = lattices[a]
    const lb = lattices[b]
    const ia = edgeIdx.get(a)!.get(k)
    const ib = edgeIdx.get(b)!.get(k)
    if (ia === undefined || ib === undefined) return a < b ? -1 : 1
    const oa = isCanon(la[ia], la[ia + 1]) ? 1 : -1
    const ob = isCanon(lb[ib], lb[ib + 1]) ? 1 : -1
    // walk along the common stretch in canonical direction (sgn = 1) and against it (sgn = -1) until the two part
    const walk = (sgn: number) => {
      let ja = ia
      let jb = ib
      const visited: string[] = []
      for (let guard = 0; guard < 4000; guard++) {
        visited.push(key(la[ja], la[ja + 1]))
        const fa = sgn * oa > 0 ? 1 : 0
        const fb = sgn * ob > 0 ? 1 : 0
        const na = ja + fa // node where the walk leaves the current edge
        const nb = jb + fb
        const pa = na + (fa ? 1 : -1) // the point beyond it
        const pb = nb + (fb ? 1 : -1)
        if (pa < 0 || pa >= la.length || pb < 0 || pb >= lb.length) return { visited, cross: 0, dist: Infinity }
        if (key(la[na], la[pa]) === key(lb[nb], lb[pb])) {
          ja = fa ? ja + 1 : ja - 1
          jb = fb ? jb + 1 : jb - 1
          continue
        }
        // they part here: to which side does each one leave? (v = the way we walk)
        const v = { x: (la[ja + 1].x - la[ja].x) * oa * sgn, y: (la[ja + 1].y - la[ja].y) * oa * sgn }
        // on a curve the first piece after the parting can be a sideways jump: look a few cells ahead
        const qa = Math.max(0, Math.min(la.length - 1, pa + (fa ? 1 : -1) * look))
        const qb = Math.max(0, Math.min(lb.length - 1, pb + (fb ? 1 : -1) * look))
        const wa = { x: la[qa].x - la[na].x, y: la[qa].y - la[na].y }
        const wb = { x: lb[qb].x - lb[nb].x, y: lb[qb].y - lb[nb].y }
        const cr = (w: Pt) => (v.x * w.y - v.y * w.x) / (Math.hypot(w.x, w.y) || 1)
        // walking against the canonical direction mirrors left and right
        return { visited, cross: (cr(wa) - cr(wb)) * sgn, dist: visited.length }
      }
      return { visited, cross: 0, dist: Infinity }
    }
    const fw = walk(1)
    const bw = walk(-1)
    const pick = Math.abs(fw.cross) > 1e-9 && (Math.abs(bw.cross) <= 1e-9 || fw.dist <= bw.dist) ? fw : Math.abs(bw.cross) > 1e-9 ? bw : null
    // the whole common stretch keeps the same order
    const out = pick ? (pick.cross < 0 ? -1 : 1) : a < b ? -1 : 1
    for (const w of [fw, bw]) {
      for (const vk of w.visited) {
        pairMemo.set(`${a}|${b}|${vk}`, out)
        pairMemo.set(`${b}|${a}|${vk}`, -out)
      }
    }
    return out
  }
  for (const [k, e] of lanes) {
    if (e.h.length > 1) e.h.sort((a, b) => compare(a, b, k))
    if (e.t.length > 1) e.t.sort((a, b) => compare(a, b, k))
  }
  /** Lateral lane position of a line on an edge, in the edge's canonical direction. */
  const laneOffset = (k: string, id: string, tram: boolean) => {
    const e = lanes.get(k)!
    const mine = tram ? e.t : e.h
    const wH = opts.share ? 0 : Math.max(0, e.h.length - 1) * gap
    const wT = opts.share ? 0 : Math.max(0, e.t.length - 1) * gap
    const sep = e.h.length && e.t.length ? gap * 2.4 : 0
    const total = wH + sep + wT
    const centre = tram ? total / 2 - wT / 2 : -total / 2 + wH / 2
    return centre + (opts.share ? 0 : (mine.indexOf(id) - (mine.length - 1) / 2) * gap)
  }

  const result: Record<string, Pt[]> = {}
  for (const line of lines) {
    const lp = lattices[line.id]
    if (lp.length < 2) {
      result[line.id] = lp
      continue
    }
    const tram = line.operator === 'tram'
    const m = lp.length - 1
    const dir: Pt[] = []
    const off: number[] = []
    for (let i = 0; i < m; i++) {
      const a = lp[i]
      const b = lp[i + 1]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      dir.push({ x: (b.x - a.x) / len, y: (b.y - a.y) / len })
      const lane = laneOffset(key(a, b), line.id, tram)
      // the lane order is defined in the canonical direction of the edge; flip it when we travel the other way
      const canonical = a.x < b.x || (a.x === b.x && a.y < b.y)
      off.push(canonical ? lane : -lane)
    }
    // 3D: a lane change is spread over several cells, not a sideways jump (trains cannot follow a jog)
    const k = Math.round(opts.smooth ?? 0)
    if (k > 0 && m > 1) {
      const src = off.slice()
      for (let i = 0; i < m; i++) {
        let sum = 0
        let wsum = 0
        for (let d = -k; d <= k; d++) {
          const j = i + d
          if (j < 0 || j >= m) continue
          const w = k + 1 - Math.abs(d)
          sum += src[j] * w
          wsum += w
        }
        off[i] = sum / wsum
      }
    }
    if (opts.source === 'geo') {
      // a smooth curve of many short pieces: every point moves along its own normal (no corners to mitre)
      const res: Pt[] = []
      for (let i = 0; i <= m; i++) {
        const a = lp[Math.max(0, i - 1)]
        const b = lp[Math.min(m, i + 1)]
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const o = i === 0 ? off[0] : i === m ? off[m - 1] : (off[i - 1] + off[i]) / 2
        res.push({ x: lp[i].x - ((b.y - a.y) / l) * o, y: lp[i].y + ((b.x - a.x) / l) * o })
      }
      result[line.id] = res
      continue
    }
    const nrm = (i: number): Pt => ({ x: -dir[i].y, y: dir[i].x })
    const out: Pt[] = []
    const push = (p: Pt) => {
      const last = out[out.length - 1]
      if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push(p)
    }
    push({ x: lp[0].x + nrm(0).x * off[0], y: lp[0].y + nrm(0).y * off[0] })
    for (let i = 0; i < m - 1; i++) {
      const P = lp[i + 1]
      const d1 = dir[i]
      const d2 = dir[i + 1]
      const n1 = nrm(i)
      const n2 = nrm(i + 1)
      const same = Math.abs(d1.x - d2.x) < 1e-9 && Math.abs(d1.y - d2.y) < 1e-9
      const A1 = { x: P.x + n1.x * off[i], y: P.y + n1.y * off[i] }
      const A2 = { x: P.x + n2.x * off[i + 1], y: P.y + n2.y * off[i + 1] }
      if (same) {
        if (Math.abs(off[i] - off[i + 1]) > 1e-9) {
          push(A1)
          push(A2)
        }
        continue
      }
      const cross = d1.x * d2.y - d1.y * d2.x
      if (Math.abs(cross) < 1e-6) {
        push(A1)
        push(A2)
        continue
      }
      const t = ((A2.x - A1.x) * d2.y - (A2.y - A1.y) * d2.x) / cross
      if (Math.abs(t) > 3) {
        push(A1)
        push(A2)
      } else {
        push({ x: A1.x + d1.x * t, y: A1.y + d1.y * t })
      }
    }
    const lastN = nrm(m - 1)
    push({ x: lp[m].x + lastN.x * off[m - 1], y: lp[m].y + lastN.y * off[m - 1] })
    result[line.id] = out
  }
  return result
}
