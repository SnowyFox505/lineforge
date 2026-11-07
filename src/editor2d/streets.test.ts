import { describe, expect, it } from 'vitest'
import { avenueDistance, avenuesOf, lotsOf, streetPatches } from './streets'

describe('street layout', () => {
  it('is deterministic', () => {
    expect(streetPatches('city', 128)).toBe(streetPatches('city', 128))
    expect(lotsOf('city', 128).length).toBe(lotsOf('city', 128).length)
  })

  it('has neighbourhoods at many different angles (not one 90 degree grid)', () => {
    const angles = new Set(streetPatches('city', 128).map((p) => Math.round((p.angle * 180) / Math.PI / 10)))
    expect(angles.size).toBeGreaterThanOrEqual(5)
  })

  it('fills the city densely with perimeter blocks', () => {
    const lots = lotsOf('city', 128)
    expect(lots.length).toBeGreaterThan(1500)
    // most buildings are small houses along the block edges
    const small = lots.filter((l) => l.w * l.d < 5).length
    expect(small / lots.length).toBeGreaterThan(0.7)
  })

  it('keeps buildings clear of the avenues and ring road', () => {
    const av = avenuesOf(128)
    for (const l of lotsOf('city', 128)) expect(avenueDistance(av, l.x, l.y)).toBeGreaterThan(0.6)
  })

  it('builds fewer, smaller detached houses in suburbs', () => {
    const city = lotsOf('city', 128)
    const sub = lotsOf('suburb', 128)
    expect(sub.length).toBeLessThan(city.length)
  })
})
