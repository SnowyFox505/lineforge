import { describe, expect, it } from 'vitest'
import { exportCityJson, importCityJson } from '../persistence/db'
import { createCity } from './factory'
import { migrateLandmarks } from './migrate'
import { poiRadius, poiStations, poisServedBy, POI_RADIUS, stationsInReach } from './poi'
import type { CityDoc, Station } from './types'

function doc(): CityDoc {
  let d = createCity('T', 'creative', 64)
  for (const [id, x] of [['a', 10], ['b', 20], ['c', 40]] as [string, number][]) {
    d = { ...d, stations: { ...d.stations, [id]: { id, name: id, x, y: 10, type: 'standard' } } }
  }
  return { ...d, pois: [{ id: 'p', kind: 'attraction', name: 'Zoo', x: 12, y: 10 }] }
}

describe('points of interest with a radius', () => {
  it('has a default radius per kind and clamps a custom one', () => {
    const d = doc()
    expect(poiRadius(d.pois![0])).toBe(POI_RADIUS.attraction)
    expect(poiRadius({ ...d.pois![0], radius: 1 })).toBe(2)
    expect(poiRadius({ ...d.pois![0], radius: 99 })).toBe(30)
  })

  it('finds the stations inside the circle and the places a station lies near', () => {
    const d = doc()
    expect(stationsInReach(d, d.pois![0]).map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(stationsInReach(d, { ...d.pois![0], radius: 3 }).map((s) => s.id)).toEqual(['a'])
  })

  it('serves a place by the stations that were chosen, by default only the nearest', () => {
    const d = doc()
    const zoo = d.pois![0]
    // both a and b lie in reach, but only the nearer one (b is at distance 8, a at 2: a) serves it
    expect(poiStations(d, zoo).map((s) => s.id)).toEqual(['a'])
    expect(poisServedBy(d, d.stations.a).map((p) => p.name)).toEqual(['Zoo'])
    expect(poisServedBy(d, d.stations.b)).toEqual([])
    expect(poisServedBy(d, d.stations.c)).toEqual([])
    const picked = { ...d, pois: [{ ...zoo, stations: ['b'] }] }
    expect(poiStations(picked, picked.pois[0]).map((s) => s.id)).toEqual(['b'])
    expect(poisServedBy(picked, picked.stations.a)).toEqual([])
    // a station outside the circle cannot be chosen
    const far = { ...d, pois: [{ ...zoo, stations: ['c'] }] }
    expect(poiStations(far, far.pois[0])).toEqual([])
  })

  it('turns an old landmark station into a plain stop plus a landmark with its label', () => {
    const d = doc()
    const old = { ...d, stations: { ...d.stations, a: { ...d.stations.a, type: 'landmark', landmarkLabel: 'Bundestag' } as unknown as Station } }
    const out = migrateLandmarks(old)
    expect(out.stations.a.type).toBe('standard')
    expect('landmarkLabel' in out.stations.a).toBe(false)
    const lm = out.pois!.find((p) => p.kind === 'landmark')!
    expect(lm).toMatchObject({ name: 'Bundestag', x: 10, y: 10 })
    // nothing to do: the very same document
    expect(migrateLandmarks(out)).toBe(out)
  })

  it('keeps links, passes and radii through export and import', () => {
    let d = doc()
    d = { ...d, links: [['a', 'b']], pois: [{ ...d.pois![0], radius: 14 }], lines: { L: { id: 'L', name: 'L', operator: 'sbahn', color: '#fff', stations: ['a', 'b', 'c'], passes: ['b'] } } }
    const back = importCityJson(exportCityJson(d), true)
    expect(back.links).toEqual([['a', 'b']])
    expect(back.pois![0].radius).toBe(14)
    expect(back.lines.L.passes).toEqual(['b'])
  })
})
