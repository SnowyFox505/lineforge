import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { keptSquare, shrinkDoc, shrinkImpact } from './shrink'
import type { CityDoc } from './types'

const withStation = (d: CityDoc, id: string, x: number, y: number): CityDoc => ({
  ...d,
  stations: { ...d.stations, [id]: { id, name: id, x, y, type: 'standard' } as CityDoc['stations'][string] },
})

describe('shrink', () => {
  it('keeps the square in the middle', () => {
    expect(keptSquare(128, 64)).toEqual({ x0: 32, y0: 32, x1: 96, y1: 96 })
  })

  it('keeps the town streets where they were', () => {
    const d = shrinkDoc(createCity('T', 'creative', 128), 64)
    expect(d.streetGen).toBe(128)
    expect(d.streetDx).toBe(-32)
    expect(d.streetDy).toBe(-32)
  })

  it('reports and drops what lies outside, and shifts the rest', () => {
    let d = createCity('T', 'creative', 128)
    d = withStation(d, 'in', 64, 64)
    d = withStation(d, 'out', 5, 5)
    const impact = shrinkImpact(d, 64)
    expect(impact.stations).toEqual(['out'])
    const s = shrinkDoc(d, 64)
    expect(s.size).toBe(64)
    expect(s.terrain.length).toBe(64 * 64)
    expect(Object.keys(s.stations)).toEqual(['in'])
    expect(s.stations.in.x).toBe(32)
  })
})
