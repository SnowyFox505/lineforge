import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { atMapEdge, edgeSide, extendOutside } from './outsideEdge'
import { appendStation } from './routing'
import { WATER } from './types'
import type { CityDoc, Line } from './types'

/** a regional line from an inner station to a station at the left edge of a 64 map that is marked as a connection to the outside */
function edgeCity(): CityDoc {
  let d = createCity('T', 'creative', 64)
  d = {
    ...d,
    stations: {
      a: { id: 'a', name: 'Innen', x: 30, y: 30, type: 'standard' },
      e: { id: 'e', name: 'Rand', x: 1, y: 30, type: 'standard', outside: 'Nordhafen' },
    },
    lines: { R: { id: 'R', name: 'RE1', operator: 'regional', color: '#c00', stations: [] } as unknown as Line },
  }
  return appendStation(appendStation(d, 'R', 'a'), 'R', 'e')
}

/** the same map after it grew to 128: everything moved 32 cells in */
function grown(d: CityDoc): CityDoc {
  const size = 128
  const terrain = new Uint8Array(size * size)
  const stations = Object.fromEntries(Object.entries(d.stations).map(([id, s]) => [id, { ...s, x: s.x + 32, y: s.y + 32 }]))
  const lines = Object.fromEntries(
    Object.entries(d.lines).map(([id, l]) => [id, { ...l, via: l.via?.map((v) => v.map((p) => ({ x: p.x + 32, y: p.y + 32 }))), segs: l.segs?.map((s) => s?.map((p) => ({ x: p.x + 32, y: p.y + 32 }))) }]),
  )
  return { ...d, size, terrain, stations, lines } as CityDoc
}

describe('edge of the map', () => {
  it('knows which edge a point touches', () => {
    expect(edgeSide(64, 0, 30)).toBe('left')
    expect(edgeSide(64, 62, 30)).toBe('right')
    expect(edgeSide(64, 30, 1)).toBe('top')
    expect(edgeSide(64, 30, 63)).toBe('bottom')
    expect(edgeSide(64, 30, 30)).toBeNull()
    expect(edgeSide(64, 4, 30)).toBeNull()
    // a corner: the nearer edge
    expect(edgeSide(64, 0, 2)).toBe('left')
    expect(atMapEdge(edgeCity(), { x: 1, y: 30 })).toBe(true)
  })
})

describe('carrying a connection to the outside world on to a bigger map', () => {
  it('puts a new station at the new edge, takes over the connection and ends the line there', () => {
    const d = grown(edgeCity())
    const out = extendOutside(d, 'e', 'left')!
    expect(out).toBeTruthy()
    const n = out.doc.stations[out.created]
    expect(n.x).toBe(0)
    expect(n.y).toBe(62)
    expect(n.outside).toBe('Nordhafen')
    expect(out.doc.stations.e.outside).toBeUndefined()
    expect(out.doc.lines.R.stations).toEqual(['a', 'e', out.created])
  })

  it('works for a line that starts at the old edge, too', () => {
    let d = edgeCity()
    d = { ...d, lines: { R: { ...d.lines.R, stations: [], via: [], segs: [] } } }
    d = appendStation(appendStation(d, 'R', 'e'), 'R', 'a')
    const out = extendOutside(grown(d), 'e', 'left')!
    expect(out.doc.lines.R.stations).toEqual([out.created, 'e', 'a'])
    expect(out.doc.lines.R.via).toHaveLength(3)
    expect(out.doc.lines.R.segs).toHaveLength(2)
    expect(out.doc.lines.R.segs!.every((s) => s && s.length >= 2)).toBe(true)
  })

  it('does nothing for a station that is no connection, or when the edge is water', () => {
    const d = grown(edgeCity())
    expect(extendOutside(d, 'a', 'left')).toBeNull()
    const sea = new Uint8Array(d.terrain)
    for (let y = 0; y < 128; y++) sea[y * 128] = WATER
    expect(extendOutside({ ...d, terrain: sea }, 'e', 'left')).toBeNull()
  })
})
