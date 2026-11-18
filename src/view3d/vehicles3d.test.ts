import { describe, expect, it } from 'vitest'
import { VEHICLE_MODELS, VEHICLES } from '../model/vehicles'
import { carGeometry } from './vehicles3d'

describe('vehicle geometry', () => {
  const all = [...Object.values(VEHICLES), ...Object.values(VEHICLE_MODELS).flat()]
  for (const spec of new Set(all)) {
    it(`builds every car of the ${spec.kind} ${spec.model ?? ''}`, () => {
      spec.lens.forEach((_, i) => {
        const n = spec.lens.length
        const role = i === 0 ? 'head' : i === n - 1 ? 'tail' : 'mid'
        const g = carGeometry(spec, i, role, '#ff3366')
        expect(g, `${spec.kind} car ${i} (${role})`).toBeTruthy()
        expect(g.attributes.position.count).toBeGreaterThan(100)
        const p = g.attributes.position.array as Float32Array
        expect(p.every((v) => Number.isFinite(v))).toBe(true)
      })
    })
  }
})
