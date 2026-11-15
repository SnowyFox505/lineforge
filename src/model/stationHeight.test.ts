import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { ELEV_LIFT, legProfile, LOWER_LIFT, stationHeight, stationLift, UG_LIFT } from './profiles'
import type { CityDoc, OperatorId } from './types'

function city(op: OperatorId, a: Partial<CityDoc['stations'][string]> = {}, b: Partial<CityDoc['stations'][string]> = {}): CityDoc {
  const doc = createCity('T', 'creative', 64)
  return {
    ...doc,
    stations: {
      a: { id: 'a', name: 'A', x: 10, y: 10, type: 'standard', ...a },
      b: { id: 'b', name: 'B', x: 30, y: 10, type: 'standard', ...b },
    },
    lines: { l: { id: 'l', name: 'X', operator: op, color: '#fff', stations: ['a', 'b'] } },
  }
}

describe('station height', () => {
  it('knows ground, elevated, lowered and underground stations', () => {
    const doc = city('regional', { height: 'elevated' }, { height: 'lowered' })
    expect(stationHeight(doc, doc.stations.a)).toBe('elevated')
    expect(stationHeight(doc, doc.stations.b)).toBe('lowered')
    expect(stationLift(doc, doc.stations.a, 1, 0)).toBe(ELEV_LIFT)
    expect(stationLift(doc, doc.stations.b, 1, 0)).toBe(LOWER_LIFT)
    const plain = city('regional')
    expect(stationHeight(plain, plain.stations.a)).toBe('ground')
    expect(stationLift(plain, plain.stations.a, 1, 0)).toBe(0)
    const ug = city('regional', { underground: true })
    expect(stationLift(ug, ug.stations.a, 1, 0)).toBe(UG_LIFT)
  })

  it('keeps metro stations underground by default and lets a raised one stay up', () => {
    const doc = city('ubahn')
    expect(stationHeight(doc, doc.stations.a)).toBe('underground')
    const up = city('ubahn', { height: 'elevated' })
    expect(stationHeight(up, up.stations.a)).toBe('elevated')
  })

  it('uses the level heights when a station has several levels', () => {
    const doc = city('regional', { height: 'elevated' })
    expect(stationLift(doc, doc.stations.a, 2, 1)).not.toBe(ELEV_LIFT)
  })

  it('puts the track next to an elevated station on an embankment', () => {
    const doc = city('regional', { height: 'elevated' })
    expect(legProfile(doc.lines.l, 0, doc)).toBe('embankment')
    const low = city('regional', { height: 'lowered' })
    expect(legProfile(low.lines.l, 0, low)).toBe('ground')
    // the player's own choice for the leg still wins
    const own = { ...doc, lines: { l: { ...doc.lines.l, legs: { 0: { profile: 'ground' as const } } } } }
    expect(legProfile(own.lines.l, 0, own)).toBe('ground')
  })
})
