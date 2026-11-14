import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { isUndergroundStation, legProfile, lookOf, STATION_LOOKS, UG_COVER, UG_LIFT } from '../model/profiles'
import { appendStation } from '../model/routing'
import type { CityDoc, OperatorId } from '../model/types'
import { buildNetwork3D } from './network3d'

function city(op: OperatorId, legs?: Record<number, { profile: 'ground' | 'embankment' | 'tunnel' }>): CityDoc {
  let d = createCity('T', 'creative', 200)
  for (const [id, x] of [['a', 20], ['b', 100], ['c', 180]] as [string, number][]) {
    d = { ...d, stations: { ...d.stations, [id]: { id, name: id, x, y: 100, type: 'standard' } } }
  }
  d = { ...d, lines: { L: { id: 'L', name: 'L', operator: op, color: '#fff', stations: [], via: [], segs: [], legs } } }
  for (const s of ['a', 'b', 'c']) d = appendStation(d, 'L', s)
  return d
}

describe('track profiles', () => {
  it('sends the metro underground by default, everything else stays on the ground', () => {
    expect(legProfile(city('ubahn').lines.L, 0)).toBe('tunnel')
    expect(legProfile(city('sbahn').lines.L, 0)).toBe('ground')
    expect(legProfile(city('sbahn', { 0: { profile: 'tunnel' } }).lines.L, 0)).toBe('tunnel')
  })

  it('puts stations that only the metro serves underground, unless told otherwise', () => {
    const d = city('ubahn')
    expect(isUndergroundStation(d, d.stations.b)).toBe(true)
    expect(isUndergroundStation(city('sbahn'), city('sbahn').stations.b)).toBe(false)
    const d2 = { ...d, stations: { ...d.stations, b: { ...d.stations.b, underground: false } } }
    expect(isUndergroundStation(d2, d2.stations.b)).toBe(false)
  })

  it('runs a metro line through a tunnel with its stations below the ground', () => {
    const net = buildNetwork3D(city('ubahn'))
    const ln = net.lines[0]
    expect(Math.min(...ln.cy)).toBeCloseTo(UG_LIFT, 1)
    expect(ln.legs.every((g) => g.profile === 'tunnel')).toBe(true)
    expect(net.stations.b.groups[0].lift).toBeLessThanOrEqual(UG_COVER)
    // far enough from both ends the track is fully underground
    const mid = ln.cum.findIndex((d) => d > ln.total / 2)
    expect(ln.cy[mid]).toBeLessThanOrEqual(UG_COVER)
  })

  it('lifts a leg onto an embankment when the user chooses so', () => {
    const net = buildNetwork3D(city('sbahn', { 0: { profile: 'embankment' } }))
    const ln = net.lines[0]
    expect(Math.max(...ln.cy)).toBeGreaterThan(1)
    const b = ln.stops[1].d
    // the second leg is untouched: flat again near the last station
    expect(ln.cy[ln.cum.findIndex((d) => d > b + 40)]).toBeCloseTo(0, 1)
  })

  it('keeps long ramps in and out of a tunnel: no steep slopes', () => {
    const net = buildNetwork3D(city('sbahn', { 0: { profile: 'tunnel' } }))
    const ln = net.lines[0]
    expect(Math.min(...ln.cy)).toBeLessThan(-1.2)
    for (const s of ln.cs) expect(Math.abs(s)).toBeLessThan(0.45)
  })

  it('lets any kind of train stop in an underground station, and tunnels the legs next to it', () => {
    const base = city('sbahn')
    const d = { ...base, stations: { ...base.stations, b: { ...base.stations.b, underground: true } } }
    expect(isUndergroundStation(d, d.stations.b)).toBe(true)
    expect(legProfile(d.lines.L, 0, d)).toBe('tunnel')
    expect(legProfile(d.lines.L, 1, d)).toBe('tunnel')
    expect(legProfile(base.lines.L, 0, base)).toBe('ground')
    const net = buildNetwork3D(d)
    expect(net.stations.b.groups[0].lift).toBeLessThanOrEqual(UG_COVER)
    // the S-Bahn really dives under the ground there
    const ln = net.lines[0]
    const atStation = ln.cy[ln.cum.findIndex((x) => x >= ln.stops[1].d)]
    expect(atStation).toBeLessThanOrEqual(UG_COVER)
  })

  it('keeps a metro line underground at a station that surface lines serve too', () => {
    // the metro ends at b, where an S-Bahn calls at ground level; a tram stops there as well
    let d = city('sbahn')
    d = { ...d, lines: { ...d.lines, U: { id: 'U', name: 'U', operator: 'ubahn', color: '#00f', stations: [], via: [], segs: [] } } }
    d = appendStation(appendStation(d, 'U', 'a'), 'U', 'b')
    const net = buildNetwork3D(d)
    const lifts = net.stations.b.groups.map((g) => ({ ids: g.lineIds, lift: g.lift }))
    expect(lifts.find((g) => g.ids.includes('L'))!.lift).toBe(0)
    expect(lifts.find((g) => g.ids.includes('U'))!.lift).toBeLessThanOrEqual(UG_COVER)
    // the first group (the station's main one) is the surface one
    expect(net.stations.b.groups[0].lineIds).toContain('L')
    // the metro track stays under the ground right up to the end
    const u = net.lines.find((l) => l.line.id === 'U')!
    expect(Math.max(...u.cy)).toBeLessThanOrEqual(UG_COVER)
    // a station the user set to the surface by hand is left alone
    const hand = { ...d, stations: { ...d.stations, b: { ...d.stations.b, underground: false } } }
    const net2 = buildNetwork3D(hand)
    expect(net2.stations.b.groups.length).toBe(1)
  })

  it('puts airports underground by default', () => {
    const base = city('sbahn')
    const d: CityDoc = { ...base, stations: { ...base.stations, c: { ...base.stations.c, type: 'airport' } } }
    expect(isUndergroundStation(d, d.stations.c)).toBe(true)
    expect(isUndergroundStation(d, d.stations.a)).toBe(false)
    const off = { ...d, stations: { ...d.stations, c: { ...d.stations.c, underground: false } } }
    expect(isUndergroundStation(off, off.stations.c)).toBe(false)
  })

  it('gives every station a look: its own choice or one that fits its type', () => {
    const base = { id: 's', name: 's', x: 0, y: 0 }
    expect(lookOf({ ...base, type: 'hauptbahnhof' })).toBe('halle')
    expect(lookOf({ ...base, type: 'standard' })).toBe('landhalt')
    expect(lookOf({ ...base, type: 'standard', look: 'zelt' })).toBe('zelt')
    expect(new Set(STATION_LOOKS.map((l) => l.id)).size).toBe(STATION_LOOKS.length)
  })
})
