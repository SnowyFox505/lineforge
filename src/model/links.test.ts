import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { areLinked, dropLinks, labelHolder, linkedIds, renameLinked, toggleLink } from './links'
import type { CityDoc } from './types'

function doc(): CityDoc {
  let d = createCity('T', 'creative', 64)
  for (const [id, name, x] of [['a', 'Baumallee', 10], ['b', 'Haltestelle 2', 12], ['c', 'Markt', 30]] as [string, string, number][]) {
    d = { ...d, stations: { ...d.stations, [id]: { id, name, x, y: 10, type: 'standard' } } }
  }
  return d
}

describe('station links', () => {
  it('links two stations, which then share the name of the first', () => {
    const d = toggleLink(doc(), 'a', 'b')
    expect(areLinked(d, 'a', 'b')).toBe(true)
    expect(d.stations.b.name).toBe('Baumallee')
    expect(d.stations.c.name).toBe('Markt')
    // still two stations
    expect(Object.keys(d.stations)).toHaveLength(3)
  })

  it('finds a whole group and one station that holds the label', () => {
    let d = toggleLink(doc(), 'a', 'b')
    d = toggleLink(d, 'b', 'c')
    expect(linkedIds(d, 'c')).toEqual(['a', 'b', 'c'])
    expect(labelHolder(d, 'c')).toBe('a')
    expect(labelHolder(doc(), 'c')).toBe('c')
  })

  it('renames the whole group and unlinks on a second toggle', () => {
    let d = toggleLink(doc(), 'a', 'b')
    d = renameLinked(d, 'b', 'Rathaus')
    expect(d.stations.a.name).toBe('Rathaus')
    d = toggleLink(d, 'b', 'a')
    expect(areLinked(d, 'a', 'b')).toBe(false)
    expect(d.links).toEqual([])
  })

  it('forgets the links of a removed station and ignores nonsense', () => {
    const d = toggleLink(doc(), 'a', 'b')
    expect(dropLinks(d, 'a').links).toEqual([])
    const base = doc()
    expect(toggleLink(base, 'a', 'a')).toBe(base)
    expect(toggleLink(base, 'a', 'zzz')).toBe(base)
  })
})
