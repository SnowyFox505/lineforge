import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { addWaypoint, appendStation, dirIndex, latticePoints, moveWaypoint, removeStationEverywhere, removeWaypoint, withRoutes } from './routing'
import { WATER } from './types'
import type { CityDoc, Pt } from './types'

function city(): CityDoc {
  return createCity('T', 'creative', 96)
}

function addStation(doc: CityDoc, id: string, x: number, y: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x, y, type: 'standard' } } }
}

function withLineOf(doc: CityDoc, lineId: string, ids: string[]): CityDoc {
  let d: CityDoc = { ...doc, lines: { ...doc.lines, [lineId]: { id: lineId, name: lineId, operator: 'sbahn', color: '#fff', stations: [], via: [], segs: [] } } }
  for (const id of ids) d = appendStation(d, lineId, id)
  return d
}

const turn = (a: number, b: number) => {
  const d = Math.abs(a - b)
  return Math.min(d, 8 - d)
}

/** Largest direction change (in 45° steps) along a polyline. */
function maxTurn(pts: Pt[]) {
  let m = 0
  for (let i = 1; i < pts.length - 1; i++) {
    m = Math.max(m, turn(dirIndex(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y), dirIndex(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)))
  }
  return m
}

const all = (doc: CityDoc, id: string) => doc.lines[id].segs!.flat()

describe('routing', () => {
  it('keeps stations on a straight stretch straight', () => {
    let d = city()
    d = addStation(d, 'a', 10, 10)
    d = addStation(d, 'b', 30, 10)
    d = addStation(d, 'c', 50, 10)
    d = withLineOf(d, 'L', ['a', 'b', 'c'])
    expect(d.lines.L.segs!.every((s) => s.length === 2)).toBe(true)
    expect(all(d, 'L').every((p) => p.y === 10)).toBe(true)
  })

  it('does not force a corner at every station (never turns sharper than 45° there)', () => {
    let d = city()
    d = addStation(d, 'a', 10, 10)
    d = addStation(d, 'b', 30, 17)
    d = addStation(d, 'c', 52, 24)
    d = addStation(d, 'd', 70, 31)
    d = withLineOf(d, 'L', ['a', 'b', 'c', 'd'])
    // whole line, joined: bends between stations are fine, but nothing sharper than 45°
    const joined: Pt[] = []
    for (const s of d.lines.L.segs!) for (const p of s) if (!joined.length || joined[joined.length - 1].x !== p.x || joined[joined.length - 1].y !== p.y) joined.push(p)
    expect(maxTurn(joined)).toBeLessThanOrEqual(1)
  })

  it('produces only octilinear segments', () => {
    let d = city()
    d = addStation(d, 'a', 5, 5)
    d = addStation(d, 'b', 41, 17)
    d = withLineOf(d, 'L', ['a', 'b'])
    const s = d.lines.L.segs![0]
    for (let i = 0; i < s.length - 1; i++) {
      const dx = Math.abs(s[i + 1].x - s[i].x)
      const dy = Math.abs(s[i + 1].y - s[i].y)
      expect(dx === 0 || dy === 0 || dx === dy).toBe(true)
    }
    expect(s[0]).toEqual({ x: 5, y: 5 })
    expect(s[s.length - 1]).toEqual({ x: 41, y: 17 })
  })

  it('crosses a river straight across instead of following it', () => {
    let d = city()
    const terrain = new Uint8Array(d.terrain)
    for (let y = 0; y < 96; y++) for (let x = 40; x <= 43; x++) terrain[y * 96 + x] = WATER
    d = { ...d, terrain }
    d = addStation(d, 'a', 20, 30)
    d = addStation(d, 'b', 60, 50)
    d = withLineOf(d, 'L', ['a', 'b'])
    const wet = latticePoints(d.lines.L.segs![0]).filter((p) => terrain[p.y * 96 + p.x] === WATER)
    expect(wet.length).toBeLessThanOrEqual(5)
  })

  it('follows user waypoints', () => {
    let d = city()
    d = addStation(d, 'a', 10, 40)
    d = addStation(d, 'b', 60, 40)
    d = withLineOf(d, 'L', ['a'])
    d = addWaypoint(d, 'L', { x: 35, y: 15 }) // pending: collected for the next segment
    d = appendStation(d, 'L', 'b')
    const lp = latticePoints(d.lines.L.segs![0])
    expect(lp.some((p) => p.x === 35 && p.y === 15)).toBe(true)
    // move and remove it again
    d = moveWaypoint(d, 'L', 0, 0, { x: 35, y: 60 })
    expect(latticePoints(d.lines.L.segs![0]).some((p) => p.x === 35 && p.y === 60)).toBe(true)
    d = removeWaypoint(d, 'L', 0, 0)
    expect(d.lines.L.segs![0].length).toBe(2)
  })

  it('inserts a waypoint into the nearest existing segment', () => {
    let d = city()
    d = addStation(d, 'a', 10, 40)
    d = addStation(d, 'b', 60, 40)
    d = withLineOf(d, 'L', ['a', 'b'])
    d = addWaypoint(d, 'L', { x: 35, y: 38 })
    expect(d.lines.L.via![0]).toHaveLength(1)
    expect(latticePoints(d.lines.L.segs![0]).some((p) => p.x === 35 && p.y === 38)).toBe(true)
  })

  it('heals a line when a middle station is removed', () => {
    let d = city()
    d = addStation(d, 'a', 10, 10)
    d = addStation(d, 'b', 30, 10)
    d = addStation(d, 'c', 50, 10)
    d = withLineOf(d, 'L', ['a', 'b', 'c'])
    d = removeStationEverywhere(d, 'b')
    expect(d.lines.L.stations).toEqual(['a', 'c'])
    expect(d.lines.L.segs).toHaveLength(1)
    expect(d.lines.L.segs![0][0]).toEqual({ x: 10, y: 10 })
    expect(d.lines.L.segs![0].at(-1)).toEqual({ x: 50, y: 10 })
  })

  it('routes old documents that have no geometry yet', () => {
    let d = city()
    d = addStation(d, 'a', 10, 10)
    d = addStation(d, 'b', 30, 25)
    d = { ...d, lines: { L: { id: 'L', name: 'L', operator: 'ubahn', color: '#fff', stations: ['a', 'b'] } } }
    const fixed = withRoutes(d)
    expect(fixed.lines.L.segs).toHaveLength(1)
    expect(fixed.lines.L.via).toHaveLength(2)
  })
  it('never turns by more than 90° in one bend, also when the line has to double back at a station', () => {
    let d = city()
    // the line comes from the north, the next stop lies east, slightly north of the middle station
    d = addStation(d, 'a', 40, 20)
    d = addStation(d, 'b', 40, 60)
    d = addStation(d, 'c', 70, 58)
    d = addStation(d, 'e', 40, 100)
    d = { ...d, lines: { L: { id: 'L', name: 'L', operator: 'regional', color: '#fff', stations: [], via: [], segs: [] } } }
    for (const id of ['a', 'b', 'c', 'e']) d = appendStation(d, 'L', id)
    const full = d.lines.L.segs!.reduce<Pt[]>((acc, seg) => (acc.length ? [...acc, ...seg.slice(1)] : [...seg]), [])
    const lat = latticePoints(full)
    let worst = 0
    for (let i = 1; i < lat.length - 1; i++) {
      const a = dirIndex(lat[i].x - lat[i - 1].x, lat[i].y - lat[i - 1].y)
      const b = dirIndex(lat[i + 1].x - lat[i].x, lat[i + 1].y - lat[i].y)
      let t = Math.abs(a - b)
      t = Math.min(t, 8 - t)
      worst = Math.max(worst, t)
    }
    expect(worst).toBeLessThanOrEqual(2)
  })
})
