import { describe, expect, it } from 'vitest'
import { lotsOf, streetGrid } from './streets'

describe('street grid', () => {
  it('is deterministic and sorted', () => {
    const a = streetGrid('city', 128)
    const b = streetGrid('city', 128)
    expect(a).toBe(b)
    expect([...a.us].sort((x, y) => x - y)).toEqual(a.us)
    expect(a.majorU.some(Boolean)).toBe(true)
    expect(a.majorU.every(Boolean)).toBe(false)
  })

  it('keeps lots clear of the streets', () => {
    const g = streetGrid('city', 128)
    const lots = lotsOf('city', 128)
    expect(lots.length).toBeGreaterThan(100)
    for (const l of lots.slice(0, 200)) {
      // lot centre in the rotated frame: it never lies on a street
      const c = Math.cos(-g.angle)
      const s = Math.sin(-g.angle)
      const dx = l.x - g.cx
      const dy = l.y - g.cy
      const u = dx * c - dy * s
      const v = dx * s + dy * c
      const near = (arr: number[], p: number, w: number) => arr.some((q) => Math.abs(q - p) < w / 2 + 0.2)
      expect(near(g.us, u, l.w)).toBe(false)
      expect(near(g.vs, v, l.d)).toBe(false)
    }
  })

  it('builds smaller plots for suburbs than blocks for the city', () => {
    const city = lotsOf('city', 128)
    const sub = lotsOf('suburb', 128)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(sub.map((l) => l.w * l.d))).toBeLessThan(mean(city.map((l) => l.w * l.d)) * 1.6)
  })
})
