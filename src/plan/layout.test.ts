import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
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
})
