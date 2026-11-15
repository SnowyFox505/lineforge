import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { CANAL_NAMES, FOREST_NAMES, LAKE_STEMS, MOUNTAIN_NAMES, PLACE_NAMES, RIVER_NAMES, SEA_NAMES } from './nameData'
import { LAKE_NAMES, pickName, poolFor, takeName, tooSimilar } from './names'

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe('name pools', () => {
  it('has about 500 place names, none twice, none starting with the same five letters', () => {
    expect(PLACE_NAMES.length).toBeGreaterThanOrEqual(500)
    for (let i = 0; i < PLACE_NAMES.length; i++) {
      for (let j = i + 1; j < PLACE_NAMES.length; j++) {
        if (PLACE_NAMES[i].toLowerCase().slice(0, 5) === PLACE_NAMES[j].toLowerCase().slice(0, 5)) throw new Error(`${PLACE_NAMES[i]} ~ ${PLACE_NAMES[j]}`)
      }
    }
  })

  it('has names for every kind of water, forest and mountain without doubles', () => {
    for (const pool of [LAKE_NAMES, RIVER_NAMES, CANAL_NAMES, SEA_NAMES, FOREST_NAMES, MOUNTAIN_NAMES, LAKE_STEMS]) {
      expect(pool.length).toBeGreaterThan(10)
      expect(new Set(pool.map((n) => n.toLowerCase())).size).toBe(pool.length)
    }
    expect(LAKE_NAMES.every((n) => n.endsWith('see'))).toBe(true)
  })
})

describe('picking names', () => {
  it('finds alike names', () => {
    expect(tooSimilar('Rotterfeld', 'Rotterhagen')).toBe(true)
    expect(tooSimilar('Westerhorst', 'Osterhorst')).toBe(true) // the same ending
    expect(tooSimilar('Eichenhain', 'Birkenhain')).toBe(false) // only six letters in common at the end
    expect(tooSimilar('Eichenhain', 'Birkenhain')).toBe(false)
    expect(tooSimilar('Rotter-Feld', 'rotterfeld')).toBe(true)
  })

  it('never picks a name that looks like a used one', () => {
    const rand = seeded(7)
    const used: string[] = []
    for (let i = 0; i < 60; i++) {
      const n = pickName(PLACE_NAMES, used, rand)!
      expect(n).toBeTruthy()
      for (const u of used) expect(tooSimilar(n, u)).toBe(false)
      used.push(n)
    }
  })

  it('returns null when the pool is used up', () => {
    expect(pickName(['Eins', 'Zwei'], ['Eins', 'Zwei'])).toBeNull()
  })

  it('uses the wishes of the player first, in order, and keeps the rest', () => {
    const doc = createCity('T', 'creative', 64)
    doc.nameQueues = { district: ['Wittenau', 'Leckenberg', 'Mittenrhein'] }
    const a = takeName(doc, 'district', PLACE_NAMES, 'Bezirk 1', seeded(3))
    expect(a.name).toBe('Wittenau')
    expect(a.queues.district).toEqual(['Leckenberg', 'Mittenrhein'])
    // the other lists are untouched
    expect(a.queues.suburb).toEqual([])
  })

  it('skips a wish that is already a name in the city, then falls back to a random name', () => {
    const doc = createCity('T', 'creative', 64)
    doc.zones = [{ id: 1, kind: 'city', name: 'Wittenau' }]
    doc.nameQueues = { district: ['wittenau'] }
    const t = takeName(doc, 'district', PLACE_NAMES, 'Bezirk 2', seeded(5))
    expect(PLACE_NAMES).toContain(t.name)
    expect(t.queues.district).toEqual([])
  })

  it('picks lake, river, canal and sea names from their own pools', () => {
    expect(poolFor('water', 'lake')).toBe(LAKE_NAMES)
    expect(poolFor('water', 'river')).toBe(RIVER_NAMES)
    expect(poolFor('water', 'canal')).toBe(CANAL_NAMES)
    expect(poolFor('water', 'sea')).toBe(SEA_NAMES)
    expect(poolFor('landscape', 'mountain')).toBe(MOUNTAIN_NAMES)
    expect(poolFor('landscape', 'forest')).toBe(FOREST_NAMES)
  })
})
