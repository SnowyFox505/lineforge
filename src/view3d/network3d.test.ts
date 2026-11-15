import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc, OperatorId } from '../model/types'
import { RAIL } from '../model/scale'
import { LAND_Y } from './heights'
import { LEVEL_BASE } from '../model/stationGroups'
import { trainLength, VEHICLES } from '../model/vehicles'
import { posOn, buildNetwork3D, BUFFER_CLEAR, groupFrame, LEVEL_H, TRAM_GAP } from './network3d'

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
    expect(net.stations.a.layout.length).toBeGreaterThanOrEqual(trainLength(VEHICLES.fernverkehr) * RAIL)
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

  it('keeps sidings joined to their track also where several lines share a corridor', () => {
    let d = city()
    d = station(d, 'a', 20, 80)
    d = station(d, 'x', 60, 80, { tracks: 6, platform: 'island' })
    d = station(d, 'e', 100, 60)
    d = station(d, 'c', 100, 100)
    d = line(d, 'G', 'sbahn', ['a', 'x', 'e'])
    d = line(d, 'T', 'sbahn', ['a', 'x', 'c'])
    const net = buildNetwork3D(d)
    for (const ln of net.lines) {
      const near = (x: number, z: number) => {
        let best = Infinity
        for (let i = 0; i < ln.n; i++) best = Math.min(best, Math.hypot(ln.fx[i] - x, ln.fz[i] - z), Math.hypot(ln.bx[i] - x, ln.bz[i] - z))
        return best
      }
      for (const s of ln.sidings) {
        expect(near(s.x[0], s.z[0])).toBeLessThan(1e-6)
        expect(near(s.x[s.x.length - 1], s.z[s.z.length - 1])).toBeLessThan(1e-6)
      }
    }
    expect(net.lines.reduce((n, l) => n + l.sidings.length, 0)).toBeGreaterThan(0)
  })

  it('lets two lines that run the same stretch share their rails', () => {
    let d = city()
    d = station(d, 'a', 60, 130)
    d = station(d, 'b', 60, 60)
    d = station(d, 'c', 100, 30)
    d = station(d, 'e', 20, 30)
    d = line(d, 'G', 'sbahn', ['a', 'b', 'c'])
    d = line(d, 'T', 'sbahn', ['a', 'b', 'e'])
    expect(d.lines.G.segs![0]).toEqual(d.lines.T.segs![0])
    const net = buildNetwork3D(d)
    const [g, t] = net.lines
    // along the shared stretch (well clear of both stations) look across the corridor
    const j0 = Math.floor(g.n * 0.15)
    const j1 = Math.floor(g.n * 0.35)
    for (let j = j0; j <= j1; j += 3) {
      const nx = -g.tz[j]
      const nz = g.tx[j]
      // nearest sample of the other line
      let best = 0
      let bd = Infinity
      for (let k = 0; k < t.n; k++) {
        const dd = Math.hypot(t.cx[k] - g.cx[j], t.cz[k] - g.cz[j])
        if (dd < bd) {
          bd = dd
          best = k
        }
      }
      const lat = (x: number, z: number) => (x - g.cx[j]) * nx + (z - g.cz[j]) * nz
      // both lines run the same way: they use the very same two tracks (one along, one against the direction of travel)
      const bs = [lat(g.bx[j], g.bz[j]), lat(t.bx[best], t.bz[best])]
      const fs = [lat(g.fx[j], g.fz[j]), lat(t.fx[best], t.fz[best])]
      expect(Math.abs(bs[0] - bs[1])).toBeLessThan(0.05)
      expect(Math.abs(fs[0] - fs[1])).toBeLessThan(0.05)
      // and the two tracks are a pair apart, not on top of each other
      expect(Math.min(...fs) - Math.max(...bs)).toBeGreaterThan(0.1)
    }
  })

  it('keeps a line on its own pair of rails along a corridor (no hop to the other pair)', () => {
    // two S-Bahn lines run side by side for a long way; their centre lines wobble against each other by less than a lane,
    // which used to swap their order (and send a train across to the other pair) wherever the wobble changed sign
    let d = city()
    for (const [id, x, y] of [['a', 24, 100], ['b', 92, 35], ['e', 60, 114], ['g', 91, 83]] as [string, number, number][]) d = station(d, id, x, y)
    d = line(d, 'L1', 'sbahn', ['b', 'a', 'g', 'e'])
    d = line(d, 'L2', 'sbahn', ['b', 'g', 'e'])
    const net = buildNetwork3D(d)
    const [A, B] = net.lines
    let prev = 0
    let flips = 0
    for (let j = 0; j < A.n; j++) {
      if (A.free[j] < 0.99) {
        prev = 0
        continue
      }
      let best = -1
      let bd = Infinity
      for (let k = 0; k < B.n; k++) {
        if (B.free[k] < 0.99) continue
        const dd = Math.hypot(B.cx[k] - A.cx[j], B.cz[k] - A.cz[j])
        if (dd < bd) {
          bd = dd
          best = k
        }
      }
      // only where they really run side by side in the same direction
      if (best < 0 || bd > 2.5 || A.tx[j] * B.tx[best] + A.tz[j] * B.tz[best] < 0.995) {
        prev = 0
        continue
      }
      const diff = (A.fx[j] - B.fx[best]) * -A.tz[j] + (A.fz[j] - B.fz[best]) * A.tx[j]
      const sg = Math.abs(diff) < 0.04 ? 0 : diff < 0 ? -1 : 1
      if (sg === 0) continue
      if (prev !== 0 && sg !== prev) flips++
      prev = sg
    }
    expect(flips).toBe(0)
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
  it('does not let stations that stand close together grow into each other', () => {
    let d = city()
    d = station(d, 'a', 40, 60, { length: 'long', tracks: 4, roof: 'hall' })
    d = station(d, 'b', 43, 60, { length: 'long', tracks: 4, roof: 'hall' })
    d = station(d, 'c', 45, 63, { length: 'medium' })
    d = station(d, 'e', 90, 60)
    d = line(d, 'L', 'sbahn', ['a', 'b', 'e'])
    d = line(d, 'M', 'sbahn', ['c', 'e'])
    const net = buildNetwork3D(d)
    const gs = Object.values(net.stations).flatMap((s) => s.groups.map((g) => ({ id: s.st.id, g })))
    const box = (g: (typeof gs)[number]['g']) => ({ ox: g.ox, oz: g.oz, ax: g.ax, az: g.az, halfL: g.layout.length / 2 + 0.8 * RAIL, halfW: g.layout.halfWidth + 0.5 * RAIL })
    // two rectangles (platforms with their roofs) overlap unless some axis separates them
    const overlap = (p: ReturnType<typeof box>, q: ReturnType<typeof box>) =>
      [[p.ax, p.az], [-p.az, p.ax], [q.ax, q.az], [-q.az, q.ax]].every(([ux, uz]) => {
        const reach = (r: ReturnType<typeof box>) => r.halfL * Math.abs(r.ax * ux + r.az * uz) + r.halfW * Math.abs(-r.az * ux + r.ax * uz)
        return reach(p) + reach(q) > Math.abs((q.ox - p.ox) * ux + (q.oz - p.oz) * uz) + 1e-6
      })
    let pairs = 0
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        if (gs[i].id === gs[j].id) continue
        pairs++
        expect(overlap(box(gs[i].g), box(gs[j].g))).toBe(false)
      }
    }
    expect(pairs).toBeGreaterThan(0)
    // a platform is shortened, not dropped
    for (const { g } of gs) expect(g.layout.length).toBeGreaterThanOrEqual(1.5 - 1e-6)
  })

  it('bends a station that stands on a curve, and keeps the tracks on the platform', () => {
    let d = city()
    d = station(d, 'a', 20, 60)
    d = station(d, 'b', 60, 60, { length: 'long' })
    d = station(d, 'c', 85, 85)
    d = line(d, 'L', 'sbahn', ['a', 'b', 'c'])
    d = { ...d, lines: { ...d.lines, L: { ...d.lines.L, curve: 14 } } }
    const net = buildNetwork3D(d)
    const g = net.stations.b.groups[0]
    expect(Math.abs(g.curv)).toBeGreaterThan(0)
    // never sharper than a realistic platform curve
    expect(Math.abs(g.curv * g.layout.length)).toBeLessThanOrEqual(0.55 + 1e-6)
    expect(1 / Math.abs(g.curv)).toBeGreaterThanOrEqual(8 * RAIL - 1e-6)
    const ln = net.lines[0]
    const stop = ln.stops.find((s) => s.stationId === 'b')!
    // along the whole platform both tracks stay at their lateral position on the curved platform axis
    for (let off = -g.layout.length / 2; off <= g.layout.length / 2; off += 0.5) {
      const fr = groupFrame(g, off)
      const f = posOn(ln, 'f', stop.d + off * Math.sign(g.ax * posOn(ln, 'c', stop.d).tx + g.az * posOn(ln, 'c', stop.d).tz || 1))
      const lat = (f.x - fr.x) * fr.nx + (f.z - fr.z) * fr.nz
      expect(Math.abs(lat - stop.zF)).toBeLessThan(0.35)
    }
  })

  it('keeps a loop line that ends where it began in order (it passes the first station twice)', () => {
    let d = city()
    d = station(d, 'h', 98, 24)
    d = station(d, 'f', 92, 77)
    d = station(d, 'x', 63, 24)
    d = line(d, 'S3', 'sbahn', ['h', 'f', 'x', 'h'])
    const net = buildNetwork3D(d)
    const ln = net.lines[0]
    expect(ln.stops).toHaveLength(4)
    // the stops come in route order, spread along the whole line
    for (let k = 1; k < ln.stops.length; k++) expect(ln.stops[k].d).toBeGreaterThan(ln.stops[k - 1].d + 5)
    expect(ln.total).toBeGreaterThan(120)
    // no hairpin on the way
    let worst = 0
    for (let j = 0; j + 4 < ln.n; j++) {
      let t = Math.abs(Math.atan2(ln.tz[j + 4], ln.tx[j + 4]) - Math.atan2(ln.tz[j], ln.tx[j]))
      if (t > Math.PI) t = 2 * Math.PI - t
      worst = Math.max(worst, t)
    }
    expect(worst).toBeLessThan(1.3)
  })

  it('keeps the bends of a busy station smooth (no hairpins, no jumps between neighbouring platforms)', () => {
    let d = city()
    d = station(d, 'w', 30, 58)
    d = station(d, 'h', 66, 60, undefined, 1)
    d = station(d, 'o', 80, 58)
    d = station(d, 'n', 66, 24)
    d = station(d, 's', 66, 96)
    d = station(d, 'e', 104, 60)
    d = line(d, 'S1', 'sbahn', ['w', 'h', 'o', 'e'])
    d = line(d, 'U2', 'ubahn', ['n', 'h', 's'])
    d = line(d, 'RB', 'regional', ['n', 'h', 'o', 'e'])
    const net = buildNetwork3D(d)
    for (const ln of net.lines) {
      let worst = 0
      for (let j = 0; j + 4 < ln.n; j++) {
        let t = Math.abs(Math.atan2(ln.tz[j + 4], ln.tx[j + 4]) - Math.atan2(ln.tz[j], ln.tx[j]))
        if (t > Math.PI) t = 2 * Math.PI - t
        worst = Math.max(worst, t)
        // no sample jumps: neighbours stay about 0.4 apart
        if (j > 0) expect(Math.hypot(ln.cx[j] - ln.cx[j - 1], ln.cz[j] - ln.cz[j - 1])).toBeLessThan(1.2)
      }
      // 1.2 rad over 1.6 units is a radius of about 1.3: tighter than any train could follow
      expect(worst).toBeLessThan(1.2)
    }
  })
})
