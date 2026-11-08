import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc, OperatorId } from '../model/types'
import { LAND_Y } from './heights'
import { LEVEL_BASE } from '../model/stationGroups'
import { trainLength, VEHICLES } from '../model/vehicles'
import { posOn, buildNetwork3D, BUFFER_CLEAR, LEVEL_H, TRAM_GAP } from './network3d'

function city(): CityDoc {
  return createCity('T', 'creative', 128)
}
function station(doc: CityDoc, id: string, x: number, y: number, design?: CityDoc['stations'][string]['design'], levels?: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x, y, type: 'standard', design, levels } } }
}
function line(doc: CityDoc, id: string, op: OperatorId, ids: string[]): CityDoc {
  let d: CityDoc = { ...doc, lines: { ...doc.lines, [id]: { id, name: id, operator: op, color: '#fff', stations: [], via: [], segs: [] } } }
  for (const s of ids) d = appendStation(d, id, s)
  return d
}

describe('3D network geometry', () => {
  it('runs the axis exactly through every station and puts each track on its station track', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'b', 50, 60)
    d = station(d, 'c', 80, 70)
    d = line(d, 'L', 'sbahn', ['a', 'b', 'c'])
    const net = buildNetwork3D(d)
    const ln = net.lines[0]
    for (const stop of ln.stops) {
      const sn = net.stations[stop.stationId]
      const c = posOn(ln, 'c', stop.d)
      expect(c.x).toBeCloseTo(sn.x, 1)
      expect(c.z).toBeCloseTo(sn.z, 1)
      // forward track = station axis normal * zF
      const f = posOn(ln, 'f', stop.d)
      const nax = -sn.az
      const naz = sn.ax
      expect(f.x).toBeCloseTo(sn.x + nax * stop.zF, 1)
      expect(f.z).toBeCloseTo(sn.z + naz * stop.zF, 1)
    }
  })

  it('ends the tracks just behind the terminal platforms (buffer stops)', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'b', 60, 60)
    d = line(d, 'L', 'sbahn', ['a', 'b'])
    const net = buildNetwork3D(d)
    const ln = net.lines[0]
    const first = ln.stops[0]
    const last = ln.stops[1]
    expect(first.d).toBeCloseTo(first.half + BUFFER_CLEAR, 0)
    expect(ln.total - last.d).toBeCloseTo(last.half + BUFFER_CLEAR, 0)
  })

  it('grows platforms for long trains', () => {
    let d = city()
    d = station(d, 'a', 20, 60, { length: 'short' })
    d = station(d, 'b', 70, 60)
    d = line(d, 'L', 'fernverkehr', ['a', 'b'])
    const net = buildNetwork3D(d)
    // a 'short' platform is shorter than the train: it grows to fit it
    expect(net.stations.a.layout.length).toBeGreaterThanOrEqual(trainLength(VEHICLES.fernverkehr))
  })

  it('keeps curves smooth and lets every line run straight along the axis of its own platform group', () => {
    let d = city()
    d = station(d, 'a', 20, 20)
    d = station(d, 'x', 60, 60, undefined, 2)
    d = station(d, 'b', 100, 20)
    d = station(d, 'c', 20, 100)
    d = station(d, 'e', 100, 100)
    d = line(d, 'L1', 'sbahn', ['a', 'x', 'e'])
    d = line(d, 'L2', 'regional', ['b', 'x', 'c'])
    const net = buildNetwork3D(d)
    const sn = net.stations.x
    for (const ln of net.lines) {
      const stop = ln.stops.find((s) => s.stationId === 'x')!
      const g = sn.groups[stop.group]
      const c = posOn(ln, 'c', stop.d)
      expect(c.x).toBeCloseTo(g.ox, 1)
      expect(Math.abs(c.tx * g.ax + c.tz * g.az)).toBeGreaterThan(0.98)
      for (let i = 1; i < ln.n; i++) expect(ln.tx[i] * ln.tx[i - 1] + ln.tz[i] * ln.tz[i - 1]).toBeGreaterThan(0.9)
    }
  })

  it('spreads the lines over exactly the number of levels the user chose', () => {
    const build = (levels: number) => {
      let d = city()
      d = station(d, 'a', 20, 20)
      d = station(d, 'x', 60, 60, undefined, levels)
      d = station(d, 'b', 100, 20)
      d = station(d, 'c', 20, 100)
      d = station(d, 'e', 100, 100)
      d = line(d, 'L1', 'sbahn', ['a', 'x', 'e'])
      d = line(d, 'L2', 'regional', ['b', 'x', 'c'])
      return buildNetwork3D(d)
    }
    // one level: everything shares one platform complex at ground height
    const one = build(1).stations.x.groups
    expect(one).toHaveLength(1)
    expect(one[0].lift).toBe(0)
    // two levels: the lower one is sunk into the ground, the upper one is raised
    const net = build(2)
    const groups = net.stations.x.groups
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.lift)).toEqual([LEVEL_BASE, LEVEL_BASE + LEVEL_H])
    const lower = net.lines.find((l) => l.line.id === groups[0].lineIds[0])!
    const upper = net.lines.find((l) => l.line.id === groups[1].lineIds[0])!
    const stopL = lower.stops.find((s) => s.stationId === 'x')!
    const stopU = upper.stops.find((s) => s.stationId === 'x')!
    expect(posOn(lower, 'c', stopL.d).y).toBeCloseTo(LEVEL_BASE, 1)
    expect(posOn(upper, 'c', stopU.d).y).toBeCloseTo(LEVEL_BASE + LEVEL_H, 1)
    // both are back on the ground far from the station and the run-ups are long and gentle
    for (const ln of [lower, upper]) {
      expect(Math.abs(ln.cy[0])).toBeLessThan(0.05)
      expect(Math.abs(ln.cy[ln.n - 1])).toBeLessThan(0.05)
      for (const sl of ln.cs) expect(Math.abs(sl)).toBeLessThan(0.2)
    }
    // the sunken level is cut into the terrain, the rest of the map is untouched
    const g0 = groups[0]
    const flat = net.groundAt(g0.ox + 80, g0.oz + 80)
    expect(net.groundAt(g0.ox, g0.oz)).toBeLessThan(LAND_Y + LEVEL_BASE + 0.05)
    expect(flat).toBeCloseTo(LAND_Y, 1)
    // three levels at most
    expect(build(3).stations.x.groups.length).toBeLessThanOrEqual(2)
  })

  it('does not force several levels when the lines run in the same direction', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'x', 60, 60, undefined, 3)
    d = station(d, 'e', 100, 66)
    d = station(d, 'f', 100, 54)
    d = line(d, 'M1', 'sbahn', ['a', 'x', 'e'])
    d = line(d, 'M2', 'regional', ['a', 'x', 'f'])
    expect(buildNetwork3D(d).stations.x.groups).toHaveLength(1)
  })

  it('puts the tram stop beside the main station instead of into its track field', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'x', 60, 60)
    d = station(d, 'e', 100, 60)
    d = line(d, 'S1', 'sbahn', ['a', 'x', 'e'])
    d = line(d, 'T1', 'tram', ['a', 'x', 'e'])
    const net = buildNetwork3D(d)
    const sn = net.stations.x
    const main = sn.groups.find((g) => g.kind === 'main')!
    const tram = sn.groups.find((g) => g.kind === 'tram')!
    expect(main.lineIds).toEqual(['S1'])
    expect(tram.lineIds).toEqual(['T1'])
    expect(Math.hypot(tram.ox - sn.x, tram.oz - sn.z)).toBeGreaterThanOrEqual(main.layout.halfWidth + TRAM_GAP + tram.layout.halfWidth - 0.01)
    // the tram's track really runs through its own stop, not through the main station
    const t1 = net.lines.find((l) => l.line.id === 'T1')!
    const stop = t1.stops.find((s) => s.stationId === 'x')!
    const p = posOn(t1, 'c', stop.d)
    expect(p.x).toBeCloseTo(tram.ox, 1)
    expect(p.z).toBeCloseTo(tram.oz, 1)
  })

  it('joins every siding exactly onto the line track at both ends (no dangling rails)', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'x', 60, 60, { tracks: 5, platform: 'island' })
    d = station(d, 'e', 100, 60)
    d = line(d, 'S1', 'sbahn', ['a', 'x', 'e'])
    const net = buildNetwork3D(d)
    const ln = net.lines[0]
    expect(ln.sidings.length).toBeGreaterThanOrEqual(2)
    const near = (x: number, z: number) => {
      let best = Infinity
      for (let i = 0; i < ln.n; i++) best = Math.min(best, Math.hypot(ln.fx[i] - x, ln.fz[i] - z), Math.hypot(ln.bx[i] - x, ln.bz[i] - z))
      return best
    }
    for (const s of ln.sidings) {
      expect(near(s.x[0], s.z[0])).toBeLessThan(1e-6)
      expect(near(s.x[s.x.length - 1], s.z[s.z.length - 1])).toBeLessThan(1e-6)
    }
  })

  it('lifts one of two crossing lines over the other outside of stations', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'b', 100, 60)
    d = station(d, 'c', 60, 20)
    d = station(d, 'e', 60, 100)
    d = line(d, 'H', 'sbahn', ['a', 'b'])
    d = line(d, 'V', 'regional', ['c', 'e'])
    const net = buildNetwork3D(d)
    const [h, v] = net.lines
    const maxH = Math.max(...h.cy)
    const maxV = Math.max(...v.cy)
    // exactly one of them goes over, by one level
    expect(Math.max(maxH, maxV)).toBeCloseTo(LEVEL_H, 1)
    expect(Math.min(maxH, maxV)).toBeCloseTo(0, 1)
    const up = maxV > maxH ? v : h
    for (const s of up.cs) expect(Math.abs(s)).toBeLessThan(0.45)
    // and it is back on the ground at both ends
    expect(up.cy[0]).toBeCloseTo(0, 1)
    expect(up.cy[up.n - 1]).toBeCloseTo(0, 1)
  })

  it('keeps trams on their own street, away from the railway tracks', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'x', 60, 60)
    d = station(d, 'e', 100, 60)
    d = line(d, 'S1', 'sbahn', ['a', 'x', 'e'])
    d = line(d, 'T1', 'tram', ['a', 'x', 'e'])
    const net = buildNetwork3D(d)
    const s1 = net.lines.find((l) => l.line.id === 'S1')!
    const t1 = net.lines.find((l) => l.line.id === 'T1')!
    // midway between two stations the tram axis is a street's width away from the railway
    const mid = s1.cum[Math.floor(s1.n * 0.25)]
    const p = posOn(s1, 'c', mid)
    let best = Infinity
    for (let j = 0; j < t1.n; j++) best = Math.min(best, Math.hypot(t1.cx[j] - p.x, t1.cz[j] - p.z))
    expect(best).toBeGreaterThan(2.9)
    // trams sit flush with the street, a little below a railway bed
    expect(t1.cy[Math.floor(t1.n / 4)]).toBeLessThan(s1.cy[Math.floor(s1.n / 4)])
  })
})
