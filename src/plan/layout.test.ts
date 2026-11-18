import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { makeBranchBetween } from '../model/lineKinds'
import { appendStation } from '../model/routing'
import { layoutLines } from './layout'
import type { CityDoc, Line, Station } from '../model/types'

function station(id: string, x: number, y: number): Station {
  return { id, name: id, x, y, type: 'standard' } as Station
}

function straight(id: string, operator: Line['operator'], a: string, b: string, y: number): Line {
  return {
    id,
    name: id,
    operator,
    color: '#fff',
    stations: [a, b],
    segs: [[{ x: 10, y }, { x: 30, y }]],
  } as unknown as Line
}

describe('layoutLines', () => {
  it('keeps a tram apart from heavy rail on a shared corridor', () => {
    const doc: CityDoc = createCity('T', 'creative', 64)
    doc.stations = { a: station('a', 10, 20), b: station('b', 30, 20) }
    doc.lines = {
      s: straight('s', 'sbahn', 'a', 'b', 20),
      t: straight('t', 'tram', 'a', 'b', 20),
    }
    const out = layoutLines(doc, 0.2)
    const ys = (id: string) => out[id].map((p) => p.y)
    // heavy rail and tram no longer share the same lane
    expect(Math.abs(ys('t')[0] - ys('s')[0])).toBeGreaterThan(0.2 * 2)
  })

  it('still bundles several heavy-rail lines side by side', () => {
    const doc: CityDoc = createCity('T', 'creative', 64)
    doc.stations = { a: station('a', 10, 20), b: station('b', 30, 20) }
    doc.lines = {
      s1: straight('s1', 'sbahn', 'a', 'b', 20),
      u1: straight('u1', 'ubahn', 'a', 'b', 20),
    }
    const out = layoutLines(doc, 0.2)
    expect(Math.abs(out.s1[0].y - out.u1[0].y)).toBeCloseTo(0.2, 5)
  })

  it('lets lines of one kind share a lane when asked to (3D: same rails), but not a tram and a train', () => {
    const doc: CityDoc = createCity('T', 'creative', 64)
    doc.stations = { a: station('a', 10, 20), b: station('b', 30, 20) }
    doc.lines = {
      s1: straight('s1', 'sbahn', 'a', 'b', 20),
      u1: straight('u1', 'ubahn', 'a', 'b', 20),
      t1: straight('t1', 'tram', 'a', 'b', 20),
      t2: straight('t2', 'tram', 'a', 'b', 20),
    }
    const out = layoutLines(doc, 0.2, { share: true })
    expect(out.s1[0].y).toBeCloseTo(out.u1[0].y, 6)
    expect(out.t1[0].y).toBeCloseTo(out.t2[0].y, 6)
    expect(Math.abs(out.t1[0].y - out.s1[0].y)).toBeGreaterThan(0.2)
  })

  it('moves lines side by side without jumps when the lanes change (no corners)', () => {
    const doc: CityDoc = createCity('T', 'creative', 64)
    doc.stations = { a: station('a', 10, 20), b: station('b', 30, 20), c: station('c', 50, 20) }
    // two lines share the first stretch, one goes on alone
    doc.lines = {
      s1: { ...straight('s1', 'sbahn', 'a', 'b', 20), stations: ['a', 'c'], segs: [[{ x: 10, y: 20 }, { x: 50, y: 20 }]] } as Line,
      s2: { ...straight('s2', 'ubahn', 'a', 'b', 20), segs: [[{ x: 10, y: 20 }, { x: 30, y: 20 }]] } as Line,
    }
    const out = layoutLines(doc, 0.8, { smooth: 10 })
    // the change of lane is spread out: no step of the offset is larger than a small part of the gap
    const ys = out.s1.map((p) => p.y)
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i] - ys[i - 1])).toBeLessThan(0.45)
  })
})

describe('layoutLines: a branch shares its stretch with its parent', () => {
  const build = (branch: boolean): CityDoc => {
    let d: CityDoc = createCity('T', 'creative', 96)
    const xs = [10, 24, 38, 52, 66, 80]
    const stations: CityDoc['stations'] = {}
    xs.forEach((x, i) => (stations[`s${i}`] = station(`s${i}`, x, 40)))
    d = { ...d, stations, lines: { P: { id: 'P', name: 'S7', operator: 'sbahn', color: '#a0a', stations: [] } as unknown as Line } }
    for (let i = 0; i < xs.length; i++) d = appendStation(d, 'P', `s${i}`)
    if (!branch) {
      // an unrelated line over the same stations
      d = { ...d, lines: { ...d.lines, Q: { id: 'Q', name: 'S9', operator: 'sbahn', color: '#0a0', stations: [] } as unknown as Line } }
      for (const id of ['s1', 's2', 's3']) d = appendStation(d, 'Q', id)
      return d
    }
    return makeBranchBetween(d, 'P', 's1', 's3')!.doc
  }

  for (const source of ['geo', 'grid'] as const) {
    it(`runs the same curve as the parent (${source})`, () => {
      const d = build(true)
      const b = Object.values(d.lines).find((l) => l.branch)!
      const out = layoutLines(d, 0.8, { source })
      const parent = out.P
      // every point of the branch lies on the parent's line (distance to the polyline)
      const toLine = (p: { x: number; y: number }) =>
        Math.min(
          ...parent.slice(1).map((q, i) => {
            const a = parent[i]
            const dx = q.x - a.x
            const dy = q.y - a.y
            const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
            return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
          }),
        )
      for (const p of out[b.id]) expect(toLine(p)).toBeLessThan(1e-6)
    })

    it(`still puts an unrelated line beside the parent (${source})`, () => {
      const d = build(false)
      const out = layoutLines(d, 0.8, { source })
      const gap = Math.max(...out.Q.map((p) => Math.min(...out.P.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))))
      expect(gap).toBeGreaterThan(0.3)
    })
  }
})
