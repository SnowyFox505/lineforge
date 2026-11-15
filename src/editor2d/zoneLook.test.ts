import { describe, expect, it } from 'vitest'
import { fillStrength, OUTLINE, zoneLookKey } from './zoneLook'

describe('look of painted areas', () => {
  it('keeps the full colour in the strong look and fades it in the light look', () => {
    for (const kind of Object.keys(OUTLINE) as (keyof typeof OUTLINE)[]) {
      expect(fillStrength(kind, 'strong')).toBe(1)
      expect(fillStrength(kind, 'light')).toBeLessThan(1)
      expect(fillStrength(kind, 'light')).toBeGreaterThan(0.3)
    }
    // towns are faded most, they are the biggest areas
    expect(fillStrength('city', 'light')).toBeLessThan(fillStrength('airport', 'light'))
  })

  it('tells every look apart, so pictures painted with another look are repainted', () => {
    const keys = [
      zoneLookKey({ weight: 'strong', outline: false }),
      zoneLookKey({ weight: 'strong', outline: true }),
      zoneLookKey({ weight: 'light', outline: false }),
      zoneLookKey({ weight: 'light', outline: true }),
    ]
    expect(new Set(keys).size).toBe(4)
  })
})
