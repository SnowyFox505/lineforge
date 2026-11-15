import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { buildMountains, mountainHeightAt, MOUNTAIN_MAX } from './mountains'
import type { CityDoc } from './types'

function withMountain(): CityDoc {
  const doc = createCity('T', 'creative', 64)
  doc.zones = [{ id: 1, kind: 'mountain', name: 'Nebelgebirge' }]
  doc.zoneGrid = new Uint16Array(64 * 64)
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) doc.zoneGrid[y * 64 + x] = 1
  return doc
}

describe('mountains', () => {
  it('has no mountains on a map without a mountain area', () => {
    expect(buildMountains(createCity('T', 'creative', 64))).toBeNull()
    const city = createCity('T', 'creative', 64)
    city.zones = [{ id: 1, kind: 'city', name: 'Stadt' }]
    city.zoneGrid = new Uint16Array(64 * 64).fill(1)
    expect(buildMountains(city)).toBeNull()
  })

  it('stays flat outside the area and rises towards its middle', () => {
    const f = buildMountains(withMountain())!
    expect(mountainHeightAt(f, 5, 5)).toBe(0)
    expect(mountainHeightAt(f, 20, 30)).toBeLessThan(0.3) // the edge of the area
    const near = mountainHeightAt(f, 23, 30)
    const inside = mountainHeightAt(f, 30, 30)
    expect(inside).toBeGreaterThan(near)
    expect(inside).toBeGreaterThan(1.5)
  })

  it('never gets higher than the highest peak (with its bumps)', () => {
    const f = buildMountains(withMountain())!
    let top = 0
    for (let v = 0; v <= 64; v += 0.5) for (let u = 0; u <= 64; u += 0.5) top = Math.max(top, mountainHeightAt(f, u, v))
    expect(top).toBeLessThanOrEqual(MOUNTAIN_MAX * 1.46)
    expect(top).toBeGreaterThan(MOUNTAIN_MAX * 0.5)
  })
})
