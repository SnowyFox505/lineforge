import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { isUndergroundStation, legProfile, UG_COVER, UG_LIFT } from '../model/profiles'
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
})
