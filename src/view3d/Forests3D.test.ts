import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { WATER } from '../model/types'
import { buildTrees } from './Forests3D'

function forestCity() {
  const doc = createCity('T', 'creative', 64)
  doc.zones = [
    { id: 1, kind: 'forest', name: 'Eichenforst' },
    { id: 2, kind: 'city', name: 'Stadt' },
  ]
  doc.zoneGrid = new Uint16Array(64 * 64)
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) doc.zoneGrid[y * 64 + x] = 1
  for (let y = 30; y < 40; y++) for (let x = 30; x < 40; x++) doc.zoneGrid[y * 64 + x] = 2
  return doc
}
const open = { groundAt: () => 0.5, railClearance: () => 1 }

describe('forest trees', () => {
  it('plants trees in forest areas only', () => {
    const t = buildTrees(forestCity(), open)
    expect(t.trunks.length).toBe(10 * 10 * 2)
    expect(t.crowns[0].length + t.crowns[1].length).toBe(t.trunks.length)
    for (const m of t.trunks) {
      const x = m.elements[12] + 32
      const z = m.elements[14] + 32
      expect(x).toBeGreaterThanOrEqual(10)
      expect(x).toBeLessThan(20)
      expect(z).toBeGreaterThanOrEqual(10)
      expect(z).toBeLessThan(20)
    }
  })

  it('has no trees on water and none near rails', () => {
    const doc = forestCity()
    for (let y = 10; y < 15; y++) for (let x = 10; x < 20; x++) doc.terrain[y * 64 + x] = WATER
    expect(buildTrees(doc, open).trunks.length).toBe(5 * 10 * 2)
    const noRoom = buildTrees(doc, { groundAt: () => 0.5, railClearance: () => 0 })
    expect(noRoom.trunks.length).toBe(0)
  })

  it('plants nothing without a forest', () => {
    expect(buildTrees(createCity('T', 'creative', 64), open).trunks.length).toBe(0)
  })
})
