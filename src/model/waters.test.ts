import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { allowedKinds, namedWaters, nameAt, nameWaterAt, removeWaterName, renameWater, rerollWaterName, setWaterKind, suggestKind, waterAt, waterBodies } from './waters'
import { RIVER_NAMES } from './nameData'
import { LAKE_NAMES } from './names'
import { WATER } from './types'
import type { CityDoc } from './types'

function withWater(size: number, cells: [number, number][]): CityDoc {
  const doc = createCity('T', 'creative', size)
  doc.terrain = new Uint8Array(size * size)
  for (const [x, y] of cells) doc.terrain[y * size + x] = WATER
  return doc
}
const rect = (x0: number, y0: number, x1: number, y1: number) => {
  const out: [number, number][] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y])
  return out
}

describe('bodies of water', () => {
  it('separates a lake from the river that flows into it', () => {
    // a lake of 9x9 in the middle, a river 2 cells wide running left from it to x = 20
    const doc = withWater(64, [...rect(30, 30, 38, 38), ...rect(20, 33, 29, 34)])
    const lake = waterAt(doc, 34, 34)!
    const river = waterAt(doc, 22, 33)!
    expect(lake).not.toBe(river)
    expect(lake.shape).toBe('blob')
    expect(river.shape).toBe('strip')
    expect(suggestKind(doc, lake)).toBe('lake')
    expect(suggestKind(doc, river)).toBe('river')
    expect(allowedKinds(doc, lake)).toEqual(['lake'])
    expect(allowedKinds(doc, river)).toEqual(['river', 'canal'])
    expect(waterAt(doc, 5, 5)).toBeNull()
  })

  it('takes a big water at the edge of the map for a sea, which may also be a lake or a river but not a canal', () => {
    const doc = withWater(64, rect(0, 20, 12, 44))
    const sea = waterAt(doc, 3, 30)!
    expect(suggestKind(doc, sea)).toBe('sea')
    expect(allowedKinds(doc, sea)).toEqual(['sea', 'lake', 'river'])
  })

  it('does not call a small pond at the edge a sea', () => {
    const doc = withWater(64, rect(0, 10, 5, 15))
    expect(suggestKind(doc, waterAt(doc, 2, 12)!)).toBe('lake')
  })

  it('computes again only when the terrain changes', () => {
    const doc = withWater(64, rect(10, 10, 16, 16))
    expect(waterBodies(doc)).toBe(waterBodies(doc))
    const painted = { ...doc, terrain: new Uint8Array(doc.terrain) }
    painted.terrain[40 * 64 + 40] = WATER
    expect(waterBodies(painted).list.length).toBe(2)
  })
})

describe('naming water', () => {
  it('names a water with the kind it suggests and a name that fits', () => {
    const doc = withWater(64, [...rect(30, 30, 38, 38), ...rect(20, 33, 29, 34)])
    const lake = nameWaterAt(doc, 34, 34)!
    const w = lake.doc.waters![0]
    expect(w.kind).toBe('lake')
    expect(LAKE_NAMES).toContain(w.name)
    const river = nameWaterAt(lake.doc, 22, 33)!
    expect(river.doc.waters!.length).toBe(2)
    expect(RIVER_NAMES).toContain(river.doc.waters![1].name)
    // tapping a named water again changes nothing
    expect(nameWaterAt(river.doc, 35, 35)!.doc).toBe(river.doc)
    expect(nameAt(river.doc, 35, 35)!.water.id).toBe(lake.id)
    expect(nameWaterAt(doc, 5, 5)).toBeNull()
  })

  it('uses the wishes of the player first', () => {
    const doc = withWater(64, rect(30, 30, 38, 38))
    doc.nameQueues = { water: ['Bömmelweiher'] }
    const out = nameWaterAt(doc, 34, 34)!
    expect(out.doc.waters![0].name).toBe('Bömmelweiher')
    expect(out.doc.nameQueues!.water).toEqual([])
  })

  it('gives a made-up name a new one when the kind changes, but keeps a name the player typed', () => {
    const doc = withWater(64, rect(20, 33, 40, 34))
    const named = nameWaterAt(doc, 30, 33)!
    const id = named.id
    const canal = setWaterKind(named.doc, id, 'canal')
    expect(canal.waters![0].kind).toBe('canal')
    expect(canal.waters![0].name).not.toBe(named.doc.waters![0].name)
    const typed = renameWater(canal, id, 'Alter Graben')
    expect(setWaterKind(typed, id, 'river').waters![0].name).toBe('Alter Graben')
    expect(rerollWaterName(typed, id).waters![0].name).not.toBe('Alter Graben')
  })

  it('forgets a name when its water is gone, and removes names on request', () => {
    const doc = withWater(64, rect(30, 30, 38, 38))
    const named = nameWaterAt(doc, 34, 34)!
    expect(namedWaters(named.doc).length).toBe(1)
    const dry = { ...named.doc, terrain: new Uint8Array(64 * 64) }
    expect(namedWaters(dry).length).toBe(0)
    expect(removeWaterName(named.doc, named.id).waters).toEqual([])
  })
})
