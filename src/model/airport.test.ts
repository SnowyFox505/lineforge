import { describe, expect, it } from 'vitest'
import { airportBoxes, airportLayout, airportToCell } from './airport'
import { createCity } from './factory'

describe('airport layout', () => {
  it('finds the bounds of every airport area', () => {
    const d = createCity('T', 'creative', 64)
    d.zones = [{ id: 1, kind: 'airport', name: 'F' }, { id: 2, kind: 'city', name: 'S' }]
    for (let y = 10; y < 24; y++) for (let x = 20; x < 50; x++) d.zoneGrid![y * 64 + x] = 1
    d.zoneGrid![5 * 64 + 5] = 2
    expect(airportBoxes(d)).toEqual([{ zoneId: 1, name: 'F', x0: 20, y0: 10, x1: 50, y1: 24 }])
  })

  it('ignores single cells left behind after erasing a part of the area', () => {
    const d = createCity('T', 'creative', 64)
    d.zones = [{ id: 1, kind: 'airport', name: 'F' }]
    for (let y = 10; y < 24; y++) for (let x = 20; x < 50; x++) d.zoneGrid![y * 64 + x] = 1
    // the user extended the area to the right, then erased it again but missed two cells
    d.zoneGrid![12 * 64 + 59] = 1
    d.zoneGrid![18 * 64 + 61] = 1
    expect(airportBoxes(d)).toEqual([{ zoneId: 1, name: 'F', x0: 20, y0: 10, x1: 50, y1: 24 }])
  })

  it('lays a big airport out along its long side with everything inside the area', () => {
    const l = airportLayout({ x0: 0, y0: 0, x1: 34, y1: 16 })
    expect(l.horiz).toBe(true)
    expect(l.runways).toHaveLength(2)
    expect(l.terminal).toBeTruthy()
    expect(l.tower).toBeTruthy()
    expect(l.stands.length).toBeGreaterThanOrEqual(2)
    const half = l.short / 2
    const inside = (r: { v0: number; v1: number; u0: number; u1: number }) => {
      expect(r.v0).toBeGreaterThanOrEqual(-half - 1e-6)
      expect(r.v1).toBeLessThanOrEqual(half + 1e-6)
      expect(r.u0).toBeGreaterThanOrEqual(-l.long / 2 - 1e-6)
      expect(r.u1).toBeLessThanOrEqual(l.long / 2 + 1e-6)
    }
    for (const r of [l.apron!, l.terminal!, ...l.piers, ...l.hangars]) inside(r)
    for (const r of l.runways) expect(Math.abs(r.v) + r.w / 2).toBeLessThanOrEqual(half)
    // the terminal stands beyond the apron, the runways on the other side
    expect(l.terminal!.v0).toBeGreaterThanOrEqual(l.apron!.v1 - 1e-6)
    for (const r of l.runways) expect(r.v).toBeLessThan(l.apron!.v0)
  })

  it('keeps the planes on the apron and the apron clear of the runways', () => {
    const l = airportLayout({ x0: 0, y0: 0, x1: 34, y1: 16 })
    for (const s of l.stands) {
      expect(s.u).toBeGreaterThan(l.apron!.u0)
      expect(s.u).toBeLessThan(l.apron!.u1)
      expect(s.v).toBeGreaterThan(l.apron!.v0)
      expect(s.v).toBeLessThan(l.apron!.v1)
    }
    for (const r of l.runways) expect(r.v + r.w / 2).toBeLessThan(l.apron!.v0)
  })

  it('gives a small area just one runway', () => {
    const l = airportLayout({ x0: 0, y0: 0, x1: 12, y1: 6 })
    expect(l.runways).toHaveLength(1)
    expect(l.terminal).toBeNull()
  })

  it('turns the layout when the area is taller than wide', () => {
    const l = airportLayout({ x0: 10, y0: 10, x1: 26, y1: 44 })
    expect(l.horiz).toBe(false)
    const c = airportToCell(l, 5, 2)
    expect(c).toEqual({ x: l.cx - 2, y: l.cy + 5 })
  })

  it('grows with the room: more runways, a longer terminal with more piers, more hangars, a car park', () => {
    const sizes = [{ x1: 22, y1: 14 }, { x1: 34, y1: 16 }, { x1: 60, y1: 30 }, { x1: 110, y1: 54 }]
    const ls = sizes.map((s) => airportLayout({ x0: 0, y0: 0, ...s }))
    const piers = ls.map((l) => l.piers.length)
    const hangars = ls.map((l) => l.hangars.length)
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i].runways.length).toBeGreaterThanOrEqual(ls[i - 1].runways.length)
      expect(piers[i]).toBeGreaterThanOrEqual(piers[i - 1])
      expect(hangars[i]).toBeGreaterThanOrEqual(hangars[i - 1])
    }
    const huge = ls[3]
    expect(huge.runways).toHaveLength(4)
    expect(huge.piers.length).toBeGreaterThanOrEqual(4)
    expect(huge.hangars.length).toBeGreaterThanOrEqual(4)
    expect(huge.parking.length).toBeGreaterThan(0)
    expect(huge.garages.length).toBeGreaterThan(0)
    expect(huge.stands.length).toBeGreaterThan(ls[1].stands.length)
    // the runway does not just stretch with the area
    expect(huge.runwayLength).toBeLessThanOrEqual(34)
  })

  it('keeps everything of a huge airport inside its area and the runways clear of the apron', () => {
    const l = airportLayout({ x0: 0, y0: 0, x1: 110, y1: 54 })
    const half = l.short / 2
    for (const r of [l.apron!, l.terminal!, ...l.piers, ...l.hangars, ...l.parking, ...l.garages]) {
      expect(r.v0).toBeGreaterThanOrEqual(-half - 1e-6)
      expect(r.v1).toBeLessThanOrEqual(half + 1e-6)
      expect(r.u0).toBeGreaterThanOrEqual(-l.long / 2 - 1e-6)
      expect(r.u1).toBeLessThanOrEqual(l.long / 2 + 1e-6)
    }
    for (const r of l.runways) {
      expect(Math.abs(r.v) + r.w / 2).toBeLessThanOrEqual(half)
      expect(r.v + r.w / 2).toBeLessThan(l.apron!.v0)
    }
    for (const s of l.stands) {
      expect(s.u).toBeGreaterThan(l.apron!.u0)
      expect(s.u).toBeLessThan(l.apron!.u1)
    }
    expect(l.taxiV).toBeLessThan(l.apron!.v0)
    expect(l.taxiV).toBeGreaterThan(Math.max(...l.runways.map((r) => r.v + r.w / 2)))
  })
})
