import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { urbanAlpha } from './zoneSoft'

function town(size = 64, x0 = 20, x1 = 44) {
  const d = createCity('T', 'creative', size)
  d.zones = [{ id: 1, kind: 'city', name: 'A' }]
  for (let y = x0; y < x1; y++) for (let x = x0; x < x1; x++) d.zoneGrid![y * size + x] = 1
  return d
}

describe('soft town edge', () => {
  it('is empty without towns', () => {
    expect(Math.max(...urbanAlpha(createCity('T', 'creative', 32)))).toBe(0)
  })

  it('is fully built up inside and grass outside', () => {
    const a = urbanAlpha(town())
    expect(a[32 * 64 + 32]).toBeCloseTo(1, 2)
    expect(a[5 * 64 + 5]).toBe(0)
  })

  it('fades over a few cells instead of a hard cut', () => {
    const a = urbanAlpha(town())
    const row = Array.from({ length: 12 }, (_, i) => a[32 * 64 + 16 + i]) // from the grass into the town (border at x = 20)
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1] - 1e-6) // never gets weaker going inwards
    const steps = row.filter((v) => v > 0.02 && v < 0.98).length
    expect(steps).toBeGreaterThanOrEqual(2) // a real gradient
    expect(steps).toBeLessThanOrEqual(6) // but not a smear
    expect(a[32 * 64 + 19]).toBeLessThan(0.1) // just outside the border: still grass
  })

  it('treats suburbs like towns and leaves airports hard', () => {
    const d = town()
    d.zones = [{ id: 1, kind: 'airport', name: 'F' }]
    expect(Math.max(...urbanAlpha(d))).toBe(0)
    d.zones = [{ id: 1, kind: 'suburb', name: 'V' }]
    expect(urbanAlpha(d)[32 * 64 + 32]).toBeCloseTo(1, 2)
  })
})
