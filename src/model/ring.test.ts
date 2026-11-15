import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { lineCurve } from './geo'
import { applyStroke, closeRing, openRing, removeLeg } from './lineEdit'
import { appendStation, removeStationEverywhere } from './routing'
import type { CityDoc, Pt } from './types'

/** a line S with four stations at the corners of a square */
function square(): CityDoc {
  let d = createCity('T', 'creative', 96)
  const corners: Pt[] = [
    { x: 20, y: 20 },
    { x: 50, y: 20 },
    { x: 50, y: 50 },
    { x: 20, y: 50 },
  ]
  const stations = { ...d.stations }
  corners.forEach((c, i) => {
    stations[`s${i}`] = { id: `s${i}`, name: `S${i}`, x: c.x, y: c.y, type: 'standard' }
  })
  d = { ...d, stations, lines: { ...d.lines, S: { id: 'S', name: 'S1', operator: 'sbahn', color: '#f00', stations: [] } } }
  for (let i = 0; i < 4; i++) d = appendStation(d, 'S', `s${i}`)
  return d
}

describe('ring lines', () => {
  it('closes a line into a ring that returns to its first station', () => {
    const d = closeRing(square(), 'S')!
    const l = d.lines.S
    expect(l.loop).toBe(true)
    expect(l.stations).toHaveLength(5)
    expect(l.stations[4]).toBe(l.stations[0])
    expect(l.via).toHaveLength(5)
    expect(l.via![4]).toEqual([])
    expect(l.via![3].length).toBeGreaterThan(0)
  })

  it('has a closed, smooth curve: the end meets the start without a kink', () => {
    const d = closeRing(square(), 'S')!
    const { pts, legStart } = lineCurve(d, d.lines.S)
    const a = pts[0]
    const b = pts[pts.length - 1]
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01)
    expect(legStart).toHaveLength(5)
    // direction just after the start and just before the end agree
    const t0 = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }
    const t1 = { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y }
    const cos = (t0.x * t1.x + t0.y * t1.y) / (Math.hypot(t0.x, t0.y) * Math.hypot(t1.x, t1.y))
    expect(cos).toBeGreaterThan(0.8)
  })

  it('needs three different stations and is not closed twice', () => {
    let d = createCity('T', 'creative', 96)
    d = { ...d, stations: { a: { id: 'a', name: 'A', x: 10, y: 10, type: 'standard' }, b: { id: 'b', name: 'B', x: 30, y: 10, type: 'standard' } }, lines: { L: { id: 'L', name: 'S1', operator: 'sbahn', color: '#f00', stations: [] } } }
    d = appendStation(appendStation(d, 'L', 'a'), 'L', 'b')
    expect(closeRing(d, 'L')).toBeNull()
    const ring = closeRing(square(), 'S')!
    expect(closeRing(ring, 'S')).toBeNull()
  })

  it('opens again into the original line', () => {
    const open = openRing(closeRing(square(), 'S')!, 'S')!
    expect(open.lines.S.loop).toBeUndefined()
    expect(open.lines.S.stations).toEqual(['s0', 's1', 's2', 's3'])
    expect(open.lines.S.via).toHaveLength(4)
    expect(openRing(open, 'S')).toBeNull()
  })

  it('cannot be extended at its ends', () => {
    const d = closeRing(square(), 'S')!
    expect(appendStation(d, 'S', 's1')).toBe(d)
    const s = d.stations
    const stroke = Array.from({ length: 30 }, (_, i) => ({ x: s.s0.x + i * 0.5, y: s.s0.y - i * 0.5 }))
    expect(applyStroke(d, 'S', stroke, { snap: 1.2 })).toBeNull()
  })

  it('opens when a stretch is removed: the line runs from after the gap around to before it', () => {
    const d = closeRing(square(), 'S')!
    const out = removeLeg(d, 'S', 1)!
    const l = out.doc.lines.S
    expect(l.loop).toBeUndefined()
    // leg 1 was s1 -> s2: the line now starts at s2 and ends at s1
    expect(l.stations).toEqual(['s2', 's3', 's0', 's1'])
    expect(l.via).toHaveLength(4)
    expect(l.via![0]).toEqual(d.lines.S.via![2])
    expect(l.via![2]).toEqual(d.lines.S.via![0])
  })

  it('becomes an ordinary line when a station is removed from a small ring', () => {
    const d = closeRing(square(), 'S')!
    // taking out the first station removes both of its entries
    const noFirst = removeStationEverywhere(d, 's0')
    expect(noFirst.lines.S.loop).toBeUndefined()
    expect(noFirst.lines.S.stations).toEqual(['s1', 's2', 's3'])
    // taking out another one keeps a ring of three
    const noOther = removeStationEverywhere(d, 's2')
    expect(noOther.lines.S.loop).toBe(true)
    expect(noOther.lines.S.stations).toEqual(['s0', 's1', 's3', 's0'])
  })
})
