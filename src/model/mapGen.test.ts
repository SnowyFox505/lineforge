import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { applyMap, generateMap, MAP_PRESETS, waterShare } from './mapGen'
import { LAND, WATER } from './types'

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

describe('map generator', () => {
  it('gives the same map for the same seed and another for another seed', () => {
    for (const p of MAP_PRESETS.filter((m) => m.id !== 'leer')) {
      const a = generateMap(p.id, 128, 11)
      const b = generateMap(p.id, 128, 11)
      const c = generateMap(p.id, 128, 12)
      expect(same(a.terrain, b.terrain)).toBe(true)
      expect(same(a.forest, b.forest)).toBe(true)
      expect(same(a.terrain, c.terrain) && same(a.forest, c.forest)).toBe(false)
    }
  })

  it('leaves the empty map empty', () => {
    const g = generateMap('leer', 128, 5)
    expect(waterShare(g.terrain)).toBe(0)
    expect(g.forest.some((v) => v)).toBe(false)
  })

  it('has a sensible amount of water and land for every landscape and many seeds', () => {
    for (const p of MAP_PRESETS.filter((m) => m.id !== 'leer')) {
      for (let seed = 1; seed <= 12; seed++) {
        const w = waterShare(generateMap(p.id, 128, seed).terrain)
        expect(w, `${p.id} ${seed}`).toBeGreaterThan(0.02)
        expect(w, `${p.id} ${seed}`).toBeLessThan(p.id === 'inseln' ? 0.75 : 0.62)
      }
    }
  })

  it('keeps room for a city: the middle of the map is land, except on a lake map', () => {
    for (const id of ['fluss', 'kueste', 'inseln', 'berge'] as const) {
      let landMiddle = 0
      for (let seed = 1; seed <= 12; seed++) {
        const g = generateMap(id, 128, seed)
        let land = 0
        let n = 0
        for (let y = 44; y < 84; y++) for (let x = 44; x < 84; x++) {
          n++
          if (g.terrain[y * 128 + x] === LAND) land++
        }
        if (land / n > 0.5) landMiddle++
      }
      expect(landMiddle, id).toBeGreaterThanOrEqual(9)
    }
  })

  it('looks the same on every map size (shapes are shares of the map)', () => {
    const small = generateMap('seen', 64, 3)
    const big = generateMap('seen', 128, 3)
    // sample the big map at the small cells
    let agree = 0
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (small.terrain[y * 64 + x] === big.terrain[(y * 2 + 1) * 128 + x * 2 + 1]) agree++
    expect(agree / (64 * 64)).toBeGreaterThan(0.95)
  })

  it('turns forests and mountains into named areas on a city', () => {
    const doc = createCity('T', 'creative', 128)
    const out = applyMap(doc, 'berge', 4)
    expect(out.terrain.some((c) => c === WATER)).toBe(true)
    const zones = out.zones ?? []
    expect(zones.length).toBeGreaterThan(1)
    expect(zones.every((z) => z.kind === 'forest' || z.kind === 'mountain')).toBe(true)
    expect(new Set(zones.map((z) => z.name)).size).toBe(zones.length)
    expect(zones.filter((z) => z.kind === 'forest').length).toBeLessThanOrEqual(10)
    // every painted cell belongs to an existing area, and an area lies on dry land
    for (let i = 0; i < out.zoneGrid!.length; i++) {
      const id = out.zoneGrid![i]
      if (!id) continue
      expect(zones.some((z) => z.id === id)).toBe(true)
      expect(out.terrain[i]).toBe(LAND)
    }
    expect(applyMap(doc, 'leer', 4)).toBe(doc)
  })

  it('uses the names the player wished for', () => {
    const doc = { ...createCity('T', 'creative', 128), nameQueues: { district: [], suburb: [], water: [], landscape: ['Schwarzwäldle'] } }
    const out = applyMap(doc, 'seen', 2)
    expect((out.zones ?? []).some((z) => z.name === 'Schwarzwäldle')).toBe(true)
  })
})
