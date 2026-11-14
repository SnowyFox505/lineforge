import { describe, expect, it } from 'vitest'
import { distToRect, FADE_MIN, FADE_REACH, fadeOpacity, useDockFade } from './dockFade'

describe('bottom menu fade', () => {
  const r = { left: 100, right: 300, top: 500, bottom: 600 }

  it('measures the distance to the menu', () => {
    expect(distToRect(200, 550, r)).toBe(0)
    expect(distToRect(200, 450, r)).toBe(50)
    expect(distToRect(50, 450, r)).toBeCloseTo(Math.hypot(50, 50))
  })

  it('is fully visible far away and fades smoothly towards the menu', () => {
    expect(fadeOpacity(FADE_REACH + 40)).toBe(1)
    expect(fadeOpacity(0)).toBeCloseTo(FADE_MIN)
    let prev = fadeOpacity(0)
    for (let d = 10; d <= FADE_REACH; d += 10) {
      const o = fadeOpacity(d)
      expect(o).toBeGreaterThanOrEqual(prev)
      prev = o
    }
  })

  it('remembers whether a finger is drawing', () => {
    useDockFade.getState().setDrawing(true)
    expect(useDockFade.getState().drawing).toBe(true)
    useDockFade.getState().setDrawing(false)
    expect(useDockFade.getState().drawing).toBe(false)
  })
})
