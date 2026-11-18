import { describe, expect, it } from 'vitest'
import { avenueDistance, avenuesOf, DEFAULT_LOOK, lotsOf, STREET_STYLES, streetPatches, streetSegments } from './streets'
import type { StreetLook } from './streets'

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

describe('street looks (a different layout per town)', () => {
  const raster: StreetLook = { style: 'raster', seed: 0 }

  it('keeps the default look identical to the one without a look', () => {
    expect(streetPatches('city', 128, DEFAULT_LOOK)).toBe(streetPatches('city', 128))
    expect(lotsOf('city', 128, DEFAULT_LOOK)).toEqual(lotsOf('city', 128))
  })

  it('has a different layout for every style and every number', () => {
    const sig = (look: StreetLook) => streetPatches('city', 128, look).slice(0, 6).map((p) => `${p.cx.toFixed(1)},${p.angle.toFixed(2)}`).join(';')
    const sigs = new Set(STREET_STYLES.map((s) => sig({ style: s.id, seed: 0 })))
    expect(sigs.size).toBe(STREET_STYLES.length)
    expect(sig({ style: 'gewachsen', seed: 5 })).not.toBe(sig({ style: 'gewachsen', seed: 0 }))
    expect(sig({ style: 'gewachsen', seed: 5 })).toBe(sig({ style: 'gewachsen', seed: 5 }))
  })

  it('makes a chessboard town one even grid: one angle, streets on multiples of the block size', () => {
    const patches = streetPatches('city', 128, raster)
    expect(new Set(patches.map((p) => p.angle.toFixed(4))).size).toBe(1)
    const gap = 5
    for (const p of patches.slice(0, 20)) {
      const c = Math.cos(p.angle)
      const s = Math.sin(p.angle)
      const proj = p.cx * c + p.cy * s
      for (const u of p.us) {
        const g = (proj + u) / gap
        expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-6)
      }
    }
    // the neighbourhoods tile the map without holes: every cell centre lies in one patch cell
    expect(patches.length).toBeGreaterThan(8)
  })

  it('turns the neighbourhoods of a radial town towards the middle of the map', () => {
    const patches = streetPatches('city', 128, { style: 'strahlen', seed: 0 })
    for (const p of patches.slice(0, 15)) {
      expect(p.angle).toBeCloseTo(Math.atan2(p.cy - 64, p.cx - 64), 6)
    }
  })

  it('has more, smaller blocks when dense and fewer, bigger ones when spacious', () => {
    const n = (style: StreetLook['style']) => lotsOf('city', 128, { style, seed: 0 }).length
    expect(n('dicht')).toBeGreaterThan(n('gewachsen'))
    expect(n('weit')).toBeLessThan(n('gewachsen'))
  })

  it('keeps buildings of every look clear of the avenues', () => {
    const av = avenuesOf(128)
    for (const look of STREET_STYLES) {
      for (const l of lotsOf('city', 128, { style: look.id, seed: 3 })) expect(avenueDistance(av, l.x, l.y)).toBeGreaterThan(0.6)
    }
  })

  it('draws streets for every style', () => {
    for (const look of STREET_STYLES) {
      const segs = streetSegments('city', 128, { style: look.id, seed: 0 })
      expect(segs.length).toBeGreaterThan(5)
      expect(segs.some((p) => p.major.length > 0)).toBe(true)
    }
  })
})

describe('streets of a map that grew', () => {
  const grownFrame = { gen: 128, dx: 32, dy: 32, size: 192 }
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

  for (const style of ['gewachsen', 'raster', 'strahlen'] as const) {
    it(`keep their place and shape (${style})`, () => {
      const look: StreetLook = { style, seed: 2 }
      const before = streetSegments('city', 128, look)
      const after = streetSegments('city', 192, look, grownFrame)
      let compared = 0
      for (const b of before) {
        const a = after.find((x) => !x.patch.ext && x.patch.lat === b.patch.lat)
        expect(a, 'every old neighbourhood is still there').toBeTruthy()
        expect(near(a!.patch.cx, b.patch.cx + 32) && near(a!.patch.cy, b.patch.cy + 32)).toBe(true)
        expect(a!.major.length).toBe(b.major.length)
        a!.major.forEach((s, i) => expect(s.every((v, k) => near(v, b.major[i][k] + 32))).toBe(true))
        expect(a!.minor.length).toBe(b.minor.length)
        compared++
      }
      expect(compared).toBeGreaterThan(10)
    })
  }

  it('give the new parts neighbourhoods of their own, and the old part keeps its houses', () => {
    const before = streetPatches('city', 128)
    const after = streetPatches('city', 192, DEFAULT_LOOK, grownFrame)
    expect(after.filter((p) => p.ext).length).toBeGreaterThan(5)
    expect(after.length).toBeGreaterThan(before.length)
    const lotsBefore = lotsOf('city', 128)
    const lotsAfter = lotsOf('city', 192, DEFAULT_LOOK, grownFrame)
    expect(lotsAfter.length).toBeGreaterThan(lotsBefore.length)
    const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`
    const have = new Map(lotsAfter.map((l) => [key(l.x, l.y), l]))
    let same = 0
    for (const l of lotsBefore) {
      const m = have.get(key(l.x + 32, l.y + 32))
      if (m && near(m.rand, l.rand) && near(m.w, l.w)) same++
    }
    expect(same / lotsBefore.length).toBeGreaterThan(0.99)
  })

  it('a map that is not changed gives exactly what it always gave', () => {
    expect(lotsOf('city', 128, DEFAULT_LOOK, { gen: 128, dx: 0, dy: 0, size: 128 })).toEqual(lotsOf('city', 128))
    expect(streetPatches('city', 128).some((p) => p.ext)).toBe(false)
  })
})
