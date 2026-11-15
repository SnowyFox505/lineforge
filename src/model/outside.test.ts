import { describe, expect, it } from 'vitest'
import { appendStation } from './routing'
import { createCity } from './factory'
import { exportCityJson, importCityJson } from '../persistence/db'
import { farDestination, outsideBlockers, stationLabel } from './outside'
import type { CityDoc } from './types'

function cityWith(op: 'sbahn' | 'regional'): CityDoc {
  const doc = createCity('T', 'creative', 64)
  return {
    ...doc,
    stations: {
      a: { id: 'a', name: 'Alt', x: 10, y: 10, type: 'standard', outside: 'Nordhafen' },
      b: { id: 'b', name: 'Bruck', x: 20, y: 10, type: 'standard' },
    },
    lines: { l: { id: 'l', name: 'X1', operator: op, color: '#fff', stations: ['b'] } },
  }
}

describe('connection to the outside world', () => {
  it('only lets regional and long-distance lines serve it', () => {
    expect(appendStation(cityWith('sbahn'), 'l', 'a').lines.l.stations).toEqual(['b'])
    expect(appendStation(cityWith('regional'), 'l', 'a').lines.l.stations).toEqual(['b', 'a'])
  })

  it('names the lines that must not stop there', () => {
    const doc = cityWith('sbahn')
    const served = { ...doc, lines: { l: { ...doc.lines.l, stations: ['a', 'b'] } } }
    expect(outsideBlockers(served, 'a').map((l) => l.name)).toEqual(['X1'])
    expect(outsideBlockers(served, 'b')).toHaveLength(1)
    expect(outsideBlockers(cityWith('regional'), 'a')).toHaveLength(0)
  })

  it('writes the destination behind the name and picks unused destinations', () => {
    const doc = cityWith('regional')
    expect(stationLabel(doc.stations.a)).toBe('Alt \u2192 Nordhafen')
    expect(stationLabel(doc.stations.b)).toBe('Bruck')
    expect(farDestination(doc, 0)).not.toBe('Nordhafen')
  })

  it('survives saving and loading', () => {
    const back = importCityJson(exportCityJson(cityWith('regional')))
    expect(back.stations.a.outside).toBe('Nordhafen')
  })
})
