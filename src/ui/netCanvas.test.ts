import { describe, expect, it } from 'vitest'
import { NET_LINES, Track, easeInOut, easeOut, prepareNet } from './netCanvas'

describe('network canvas geometry', () => {
  it('measures and samples a track', () => {
    const t = new Track([[0, 0], [100, 0], [100, 50]])
    expect(t.total).toBe(150)
    expect(t.at(50)).toEqual([50, 0])
    expect(t.at(125)).toEqual([100, 25])
    expect(t.at(-5)).toEqual([0, 0])
    expect(t.at(999)).toEqual([100, 50])
    expect(t.project([100, 20])).toBeCloseTo(120, 5)
  })

  it('places every station of the start screen on its line, in order', () => {
    for (const l of prepareNet()) {
      const ds = l.stationAt.map((s) => s.d)
      expect([...ds].sort((a, b) => a - b)).toEqual(ds)
      for (const s of l.stationAt) {
        const p = l.track.at(s.d)
        expect(Math.hypot(p[0] - s.p[0], p[1] - s.p[1])).toBeLessThan(0.5)
      }
    }
    expect(NET_LINES.length).toBe(5)
  })

  it('has easing curves that run from 0 to 1', () => {
    for (const f of [easeOut, easeInOut]) {
      expect(f(0)).toBe(0)
      expect(f(1)).toBeCloseTo(1, 6)
      expect(f(2)).toBeCloseTo(1, 6)
      expect(f(-1)).toBe(0)
    }
  })
})
