import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { freePoiSpot, poiOnStation, separatePois, POI_STATION_CLEAR } from './poi'
import type { CityDoc } from './types'

function city(): CityDoc {
  const d = createCity('T', 'creative', 64)
  return {
    ...d,
    stations: { s: { id: 's', name: 'S', x: 30, y: 30, type: 'standard' } },
    pois: [
      { id: 'on', kind: 'landmark', name: 'Dom', x: 30, y: 30 },
      { id: 'far', kind: 'attraction', name: 'Zoo', x: 10, y: 10 },
    ],
  }
}

describe('points of interest next to stations', () => {
  it('knows a point that stands on a station', () => {
    const d = city()
    expect(poiOnStation(d, d.pois![0])).toBe(true)
    expect(poiOnStation(d, d.pois![1])).toBe(false)
    expect(poiOnStation(d, { x: 30 + POI_STATION_CLEAR + 0.5, y: 30 })).toBe(false)
  })

  it('finds a free spot close by, on land and clear of the station', () => {
    const d = city()
    const spot = freePoiSpot(d, 30, 30)!
    expect(spot).toBeTruthy()
    expect(Math.hypot(spot.x - 30, spot.y - 30)).toBeGreaterThanOrEqual(4.5)
    expect(Math.hypot(spot.x - 30, spot.y - 30)).toBeLessThan(8)
  })

  it('moves only the points that stand on a station and leaves the document alone otherwise', () => {
    const d = city()
    const out = separatePois(d)
    expect(out.pois![0]).not.toMatchObject({ x: 30, y: 30 })
    expect(poiOnStation(out, out.pois![0])).toBe(false)
    expect(out.pois![1]).toEqual(d.pois![1])
    expect(separatePois(out)).toBe(out)
  })
})
