import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc, Line } from '../model/types'
import { layoutLines } from '../plan/layout'
import { lineEnds, placeBadges } from './terminalBadges'
import type { BadgeIn, Rect } from './terminalBadges'

function city(): CityDoc {
  let d = createCity('T', 'creative', 96)
  const xs = [10, 30, 50, 70]
  const stations: CityDoc['stations'] = {}
  xs.forEach((x, i) => (stations[`s${i}`] = { id: `s${i}`, name: `St${i}`, x, y: 40, type: 'standard' } as CityDoc['stations'][string]))
  d = { ...d, stations, lines: { A: { id: 'A', name: 'S1', operator: 'sbahn', color: '#a00', stations: [] } as unknown as Line, B: { id: 'B', name: 'S2', operator: 'sbahn', color: '#0a0', stations: [] } as unknown as Line } }
  for (const id of ['s0', 's1', 's2', 's3']) d = appendStation(d, 'A', id)
  for (const id of ['s1', 's2', 's3']) d = appendStation(d, 'B', id)
  return d
}

describe('line ends', () => {
  it('finds both ends of every line with the direction away from the line', () => {
    const d = city()
    const ends = lineEnds(d, layoutLines(d, 0.8, { source: 'geo' }))
    expect(ends).toHaveLength(4)
    const a0 = ends.find((e) => e.line === 'A' && e.station === 's0')!
    const a3 = ends.find((e) => e.line === 'A' && e.station === 's3')!
    expect(a0.dx).toBeLessThan(-0.9)
    expect(a3.dx).toBeGreaterThan(0.9)
    // two lines end at the same station
    expect(ends.filter((e) => e.station === 's3').map((e) => e.line).sort()).toEqual(['A', 'B'])
  })

  it('a ring has no ends', () => {
    const d = city()
    const ring = { ...d, lines: { ...d.lines, A: { ...d.lines.A, loop: true } } }
    expect(lineEnds(ring, layoutLines(ring, 0.8, { source: 'geo' })).every((e) => e.line !== 'A')).toBe(true)
  })
})

describe('badge places', () => {
  const item = (key: string, station: string, dx: number, dy: number): BadgeIn => ({ key, station, px: 200, py: 100, dx, dy, w: 30 })
  const rect = (b: { cx: number; cy: number; w: number; h: number }): Rect => ({ x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h })
  const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

  it('puts a badge beyond the end of the line', () => {
    const [p] = placeBadges([item('a', 's', 1, 0)], 8, [])
    expect(p.cx).toBeGreaterThan(200 + 8)
    expect(Math.abs(p.cy - 100)).toBeLessThan(1)
  })

  it('stacks several lines that end at one station without overlap', () => {
    const placed = placeBadges([item('a', 's', 1, 0), item('b', 's', 1, 0), item('c', 's', 1, 0)], 8, [])
    expect(placed).toHaveLength(3)
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlap(rect(placed[i]), rect(placed[j]))).toBe(false)
    const up = placeBadges([item('a', 's', 0, -1), item('b', 's', 0, -1)], 8, [])
    expect(overlap(rect(up[0]), rect(up[1]))).toBe(false)
    expect(up[0].cy).toBeLessThan(100)
  })

  it('steps aside for the name of a station', () => {
    const name: Rect = { x: 214, y: 90, w: 80, h: 20 }
    const [p] = placeBadges([item('a', 's', 1, 0)], 8, [name])
    expect(overlap(rect(p), name)).toBe(false)
  })
})
