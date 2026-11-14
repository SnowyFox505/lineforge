import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import { stopIds, stopsAt } from '../model/stops'
import type { CityDoc, OperatorId } from '../model/types'
import { buildNetwork3D } from './network3d'
import { Sim } from './trainSim'

function city(passes?: string[]): CityDoc {
  let d = createCity('T', 'creative', 200)
  for (const [id, x] of [['a', 20], ['b', 100], ['c', 180]] as [string, number][]) {
    d = { ...d, stations: { ...d.stations, [id]: { id, name: id, x, y: 100, type: 'standard' } } }
  }
  const mk = (id: string, op: OperatorId, pass?: string[]) => {
    d = { ...d, lines: { ...d.lines, [id]: { id, name: id, operator: op, color: '#fff', stations: [], via: [], segs: [], passes: pass } } }
    for (const s of ['a', 'b', 'c']) d = appendStation(d, id, s)
  }
  mk('S', 'sbahn')
  mk('R', 'regional', passes)
  return d
}

describe('lines that run through a station', () => {
  it('knows where a line stops', () => {
    const d = city(['b'])
    expect(stopsAt(d.lines.R, 'b')).toBe(false)
    expect(stopsAt(d.lines.R, 'a')).toBe(true)
    expect(stopsAt(d.lines.S, 'b')).toBe(true)
    expect(stopIds(d.lines.R)).toEqual(['a', 'c'])
  })

  it('does not stop at the station but passes it on a bypass track without a platform', () => {
    const net = buildNetwork3D(city(['b']))
    const r = net.lines.find((l) => l.line.id === 'R')!
    const s = net.lines.find((l) => l.line.id === 'S')!
    expect(r.stops.map((x) => x.stationId)).toEqual(['a', 'c'])
    expect(r.through.map((x) => x.stationId)).toEqual(['b'])
    expect(s.stops.map((x) => x.stationId)).toEqual(['a', 'b', 'c'])
    const g = net.stations.b.groups.find((gr) => gr.passIds.includes('R'))!
    expect(g.lineIds).toEqual(['S'])
    const bypass = g.layout.tracks.filter((t) => t.bypass)
    expect(bypass).toHaveLength(2)
    // the bypass tracks lie outside the platforms
    for (const t of bypass) for (const p of g.layout.platforms) expect(t.z < p.z0 || t.z > p.z1).toBe(true)
    // the passing line really runs on one of them
    const th = r.through[0]
    expect([th.zF, th.zB].every((z) => bypass.some((t) => Math.abs(t.z - z) < 1e-6))).toBe(true)
    // the stopping line never uses them
    const st = s.stops[1]
    expect(bypass.some((t) => Math.abs(t.z - st.zF) < 1e-6 || Math.abs(t.z - st.zB) < 1e-6)).toBe(false)
  })

  it('lets the train drive through without a halt', () => {
    let d = city(['b'])
    const wide = { tracks: 4, platform: 'side' as const, length: 'long' as const, roof: 'open' as const, ubahn: false }
    d = { ...d, stations: Object.fromEntries(Object.entries(d.stations).map(([id, s]) => [id, { ...s, design: wide }])) }
    const net = buildNetwork3D(d)
    const sim = new Sim(net)
    const fern = sim.trains.filter((t) => t.net.line.id === 'R')
    expect(fern.length).toBeGreaterThan(0)
    const halts = new Set<string>()
    for (let i = 0; i < 4000; i++) {
      sim.update(0.1)
      for (const t of fern) if (t.phase === 'dwell' && t.at) halts.add(t.at.split('|')[0])
    }
    // it called at the stations it stops at, never at the one it runs through
    expect([...halts].sort()).toEqual(['a', 'c'])
    // and it did move on past the middle of the line
    expect(fern.some((t) => t.leg > 0 || t.s > 0)).toBe(true)
  })

  it('builds no bypass where every line stops', () => {
    const net = buildNetwork3D(city())
    expect(net.stations.b.groups.every((g) => g.layout.tracks.every((t) => !t.bypass))).toBe(true)
  })
})
