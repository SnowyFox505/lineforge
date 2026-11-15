import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { moveStationTo } from './lineEdit'
import { BUILD_TYPES, mainStationId, onAirport, stationName, stationTypeAt } from './stationType'
import type { CityDoc } from './types'

/** A small city with an airport area on the cells 10..19 x 10..19. */
function cityWithAirport(): CityDoc {
  const doc = createCity('T', 'creative', 64)
  doc.zones = [{ id: 1, kind: 'airport', name: 'Flughafen' }]
  doc.zoneGrid = new Uint16Array(doc.size * doc.size)
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) doc.zoneGrid[y * doc.size + x] = 1
  return doc
}

describe('station types', () => {
  it('offers only a rail stop and a tram stop when building', () => {
    expect(BUILD_TYPES).toEqual(['standard', 'tramstop'])
  })

  it('makes a rail stop on the airport grounds the airport station, and not elsewhere', () => {
    const doc = cityWithAirport()
    expect(onAirport(doc, 12, 12)).toBe(true)
    expect(onAirport(doc, 30, 30)).toBe(false)
    expect(stationTypeAt(doc, 12, 12, 'standard')).toBe('airport')
    expect(stationTypeAt(doc, 30, 30, 'standard')).toBe('standard')
    // a tram stop and the main station keep their type
    expect(stationTypeAt(doc, 12, 12, 'tramstop')).toBe('tramstop')
    expect(stationTypeAt(doc, 12, 12, 'hauptbahnhof')).toBe('hauptbahnhof')
    // an airport station that is not on the grounds is a plain stop
    expect(stationTypeAt(doc, 30, 30, 'airport')).toBe('standard')
  })

  it('names new stations after their type', () => {
    expect(stationName('airport', 3)).toBe('Flughafen 3')
    expect(stationName('hauptbahnhof', 3)).toBe('Hauptbahnhof 3')
    expect(stationName('standard', 3)).toBe('Station 3')
  })

  it('turns a stop into the airport station when it is moved onto the grounds, and back', () => {
    const doc = cityWithAirport()
    doc.stations.a = { id: 'a', name: 'A', x: 30, y: 30, type: 'standard' }
    const on = moveStationTo(doc, 'a', 12, 12)
    expect(on.stations.a.type).toBe('airport')
    const off = moveStationTo(on, 'a', 40, 40)
    expect(off.stations.a.type).toBe('standard')
  })

  it('does not change a tram stop or the main station when they are moved', () => {
    const doc = cityWithAirport()
    doc.stations.t = { id: 't', name: 'T', x: 30, y: 30, type: 'tramstop' }
    doc.stations.h = { id: 'h', name: 'H', x: 32, y: 32, type: 'hauptbahnhof' }
    const moved = moveStationTo(moveStationTo(doc, 't', 12, 12), 'h', 14, 14)
    expect(moved.stations.t.type).toBe('tramstop')
    expect(moved.stations.h.type).toBe('hauptbahnhof')
  })

  it('finds the main station', () => {
    const doc = cityWithAirport()
    doc.stations.a = { id: 'a', name: 'A', x: 30, y: 30, type: 'standard' }
    expect(mainStationId(doc)).toBeNull()
    doc.stations.b = { id: 'b', name: 'B', x: 32, y: 30, type: 'hauptbahnhof' }
    expect(mainStationId(doc)).toBe('b')
  })
})
