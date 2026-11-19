import { describe, expect, it } from 'vitest'
import { closingProgress, DIAL_R, EMBLEM, emblemBox, hexRgb, HUB, irisRadius, loadProgress } from './splashScene'

describe('splash scene', () => {
  it('draws an octilinear emblem whose lines all run through the hub', () => {
    for (const l of EMBLEM) {
      for (let i = 1; i < l.pts.length; i++) {
        const dx = l.pts[i][0] - l.pts[i - 1][0]
        const dy = l.pts[i][1] - l.pts[i - 1][1]
        expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true)
      }
      // the hub is a vertex or lies on a segment
      const through = l.pts.some((p, i) => {
        if (p[0] === HUB[0] && p[1] === HUB[1]) return true
        if (i === 0) return false
        const a = l.pts[i - 1]
        const cross = (p[0] - a[0]) * (HUB[1] - a[1]) - (p[1] - a[1]) * (HUB[0] - a[0])
        const within = Math.min(a[0], p[0]) <= HUB[0] && HUB[0] <= Math.max(a[0], p[0]) && Math.min(a[1], p[1]) <= HUB[1] && HUB[1] <= Math.max(a[1], p[1])
        return cross === 0 && within
      })
      expect(through).toBe(true)
    }
    expect(DIAL_R).toBeGreaterThan(20)
  })

  it('lets the progress rise but never reach the end by itself', () => {
    let last = -1
    for (let t = 0; t <= 60; t += 0.5) {
      const p = loadProgress(t)
      expect(p).toBeGreaterThanOrEqual(last)
      expect(p).toBeLessThan(0.93)
      last = p
    }
    expect(loadProgress(-3)).toBe(0)
  })

  it('closes the progress to 100 % and opens the iris only after the burst', () => {
    expect(closingProgress(0.6, 0)).toBeCloseTo(0.6)
    expect(closingProgress(0.6, 0.25)).toBeCloseTo(1)
    expect(closingProgress(0.6, 1)).toBeCloseTo(1)
    expect(irisRadius(0.2, 400, 800)).toBe(0)
    expect(irisRadius(1, 400, 800)).toBeGreaterThan(Math.hypot(400, 800) / 2)
  })

  it('fits the emblem on portrait and landscape screens', () => {
    const p = emblemBox(390, 844)
    expect(p.size).toBeLessThanOrEqual(390)
    expect(p.cy + p.size / 2).toBeLessThan(844 * 0.7)
    const l = emblemBox(1000, 500)
    expect(l.size).toBeLessThanOrEqual(500)
  })

  it('reads colours', () => {
    expect(hexRgb('#ff0000')).toEqual([255, 0, 0])
    expect(hexRgb('#0f0')).toEqual([0, 255, 0])
    expect(hexRgb('nonsense')).toEqual([196, 240, 58])
  })
})
