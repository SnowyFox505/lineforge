import { describe, expect, it } from 'vitest'
import { avenueDistance, avenuesOf, streetPatches } from '../editor2d/streets'
import { createCity } from './factory'
import { legCurve } from './geo'
import { applyStroke } from './lineEdit'
import { appendStation } from './routing'
import { followsStreets, routeOnStreets, streetFoot, streetGraphOf, streetViaPoints } from './streetNet'
import type { CityDoc, Pt } from './types'

const SIZE = 128

/** A map whose middle is one big city zone. */
function town(): CityDoc {
  const d = createCity('T', 'creative', SIZE)
  const zoneGrid = new Uint16Array(SIZE * SIZE)
  for (let y = 10; y < SIZE - 10; y++) for (let x = 10; x < SIZE - 10; x++) zoneGrid[y * SIZE + x] = 1
  d.terrain.fill(0)
  return { ...d, zones: [{ id: 1, kind: 'city', name: 'Mitte' }], zoneGrid }
}

/** Distance of a point to the closest street of the city (main streets, borders, avenues). */
function toStreet(doc: CityDoc, q: Pt): number {
  // lines are drawn half a cell off the corner the streets are measured from
  const p = { x: q.x + 0.5, y: q.y + 0.5 }
  const g = streetGraphOf(doc)!
  let best = Infinity
  for (let e = 0; e < g.ea.length; e++) {
    const ax = g.nx[g.ea[e]]
    const ay = g.ny[g.ea[e]]
    const bx = g.nx[g.eb[e]]
    const by = g.ny[g.eb[e]]
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2))
    best = Math.min(best, Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y))
  }
  return best
}

describe('street network', () => {
  it('has no graph without a zone map', () => {
    const d = createCity('T', 'creative', SIZE)
    expect(streetGraphOf(d)).toBeNull()
    expect(streetViaPoints(d, { x: 20, y: 20 }, { x: 60, y: 60 })).toBeNull()
  })

  it('only holds streets inside the zone', () => {
    const d = town()
    const g = streetGraphOf(d)!
    expect(g.ea.length).toBeGreaterThan(100)
    for (let i = 0; i < g.nx.length; i++) {
      expect(g.nx[i]).toBeGreaterThanOrEqual(9.4)
      expect(g.nx[i]).toBeLessThanOrEqual(SIZE - 9.4)
    }
  })

  it('is cached per document', () => {
    const d = town()
    expect(streetGraphOf(d)).toBe(streetGraphOf({ ...d }))
  })

  it('routes between two points along connected streets', () => {
    const d = town()
    const g = streetGraphOf(d)!
    const route = routeOnStreets(g, { x: 30, y: 30 }, { x: 90, y: 80 })
    expect(route).not.toBeNull()
    for (let i = 1; i < route!.length; i++) {
      // every stretch lies on a street (the nodes are on streets, edges are straight pieces of them)
      const mid = { x: (route![i].x + route![i - 1].x) / 2 - 0.5, y: (route![i].y + route![i - 1].y) / 2 - 0.5 }
      expect(toStreet(d, mid)).toBeLessThan(0.3)
    }
  })

  it('makes the control points of a tram leg lie on the streets', () => {
    const d = town()
    const a = { x: 30, y: 30 }
    const b = { x: 100, y: 90 }
    const via = streetViaPoints(d, a, b)
    expect(via).not.toBeNull()
    // the curve may cut corners (a tram cannot turn on the spot), but it stays within a street's width of the streets
    const near = via!.filter((p) => toStreet(d, p) < 1.6)
    expect(near.length / via!.length).toBeGreaterThan(0.8)
  })

  it('a tram line follows the streets, a metro line does not', () => {
    let d = town()
    const st = (id: string, x: number, y: number) => ({ id, name: id, x, y, type: 'standard' as const })
    d = { ...d, stations: { a: st('a', 30, 30), b: st('b', 100, 90) } }
    const mk = (id: string, operator: 'tram' | 'ubahn'): CityDoc => {
      const base = { ...d, lines: { [id]: { id, name: id, operator, color: '#fff', stations: [], via: [], segs: [] } } }
      return appendStation(appendStation(base, id, 'a'), id, 'b')
    }
    const tram = mk('t', 'tram')
    const metro = mk('m', 'ubahn')
    const onStreets = (doc: CityDoc, id: string) => {
      const curve = legCurve(doc, doc.lines[id], 0)
      return curve.filter((p) => toStreet(doc, p) < 1.2).length / curve.length
    }
    expect(onStreets(tram, 't')).toBeGreaterThan(0.75)
    expect(onStreets(tram, 't')).toBeGreaterThan(onStreets(metro, 'm'))
  })

  it('leaves a leg outside the towns to the grid router', () => {
    const d = town()
    expect(streetViaPoints(d, { x: 2, y: 2 }, { x: 5, y: 120 })).toBeNull()
  })

  it('knows its own generator', () => {
    // sanity check of the test helper: the avenues are part of the streets
    const av = avenuesOf(SIZE)
    expect(avenueDistance(av, av.cx, av.cy)).toBeLessThan(0.01)
    expect(streetPatches('city', SIZE).length).toBeGreaterThan(5)
  })
})

describe('trams stay on the streets', () => {
  const st = (id: string, x: number, y: number) => ({ id, name: id, x, y, type: 'standard' as const })
  const tramDoc = (): CityDoc => {
    const d = town()
    return { ...d, lines: { t: { id: 't', name: 't', operator: 'tram', color: '#fff', stations: [], via: [], segs: [] } } }
  }
  const dev = (doc: CityDoc, pts: Pt[]) => pts.map((p) => toStreet(doc, p))

  it('the whole curve of a leg lies on streets, not half a cell beside them', () => {
    let d = tramDoc()
    d = { ...d, stations: { a: st('a', 30, 30), b: st('b', 70, 60), c: st('c', 95, 100) } }
    for (const id of ['a', 'b', 'c']) d = appendStation(d, 't', id)
    // the stops joined the tram line: they moved onto a street
    for (const id of ['a', 'b', 'c']) expect(toStreet(d, d.stations[id])).toBeLessThan(0.7)
    for (let k = 0; k < 2; k++) {
      const ds = dev(d, legCurve(d, d.lines.t, k))
      expect(ds.filter((v) => v <= 0.3).length / ds.length).toBeGreaterThan(0.85)
      expect(Math.max(...ds)).toBeLessThan(1.2)
    }
  })

  it('a stop that another line already uses is left where it is', () => {
    let d = tramDoc()
    d = { ...d, stations: { a: st('a', 30, 30), b: st('b', 70, 60) }, lines: { ...d.lines, m: { id: 'm', name: 'm', operator: 'ubahn', color: '#0f0', stations: ['a'], via: [[]], segs: [] } } }
    d = appendStation(d, 't', 'a')
    expect(d.stations.a).toMatchObject({ x: 30, y: 30 })
  })

  it('a stroke along a street follows it, new stops sit on it', () => {
    const d = tramDoc()
    // the stroke walks along a real street piece
    const g = streetGraphOf(d)!
    let e = 0
    for (let i = 0; i < g.ea.length; i++) if (g.elen[i] > g.elen[e]) e = i
    const a = { x: g.nx[g.ea[e]] - 0.5, y: g.ny[g.ea[e]] - 0.5 }
    const b = { x: g.nx[g.eb[e]] - 0.5, y: g.ny[g.eb[e]] - 0.5 }
    const raw = Array.from({ length: 30 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / 29 + 0.3, y: a.y + ((b.y - a.y) * i) / 29 - 0.3 }))
    expect(followsStreets(d, raw)).toBe(true)
    const out = applyStroke(d, 't', raw, { snap: 2 })
    expect(out).not.toBeNull()
    for (const id of out!.created) expect(toStreet(out!.doc, out!.doc.stations[id])).toBeLessThan(0.7)
  })

  it('a stroke across the blocks stays as drawn', () => {
    const d = tramDoc()
    // diagonal over a block interior: find a spot far from every street
    let spot: Pt | null = null
    for (let y = 20; y < 100 && !spot; y += 1) for (let x = 20; x < 100 && !spot; x += 1) if (toStreet(d, { x, y }) > 2.2) spot = { x, y }
    expect(spot).not.toBeNull()
    const raw = Array.from({ length: 12 }, (_, i) => ({ x: spot!.x + i * 0.05, y: spot!.y + i * 0.05 }))
    expect(followsStreets(d, raw)).toBe(false)
    expect(streetFoot(d, { x: 1, y: 1 })).toBeNull()
  })
})
