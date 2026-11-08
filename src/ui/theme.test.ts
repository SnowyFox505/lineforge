import { describe, expect, it } from 'vitest'
import { accentFromHue, ACCENT_INK, contrast, DEFAULT_ACCENT, hexToRgb, hslToHex, hueOf, luminance, PRESETS, rgbToHsl, shades } from './theme'

const BACKGROUND = '#0a0e14'

describe('accent colours', () => {
  it('keeps the original neon lime as the first, default colour', () => {
    expect(PRESETS[0].hex).toBe(DEFAULT_ACCENT)
    expect(DEFAULT_ACCENT).toBe('#c4f03a')
    expect(PRESETS).toHaveLength(4)
  })

  it('has presets that are readable: dark text on them and them as text on the dark background', () => {
    for (const p of PRESETS) {
      expect(contrast(p.hex, ACCENT_INK), p.id).toBeGreaterThanOrEqual(7)
      expect(contrast(p.hex, BACKGROUND), p.id).toBeGreaterThanOrEqual(7)
    }
  })

  it('stays readable for every position of the hue slider', () => {
    for (let h = 0; h < 360; h += 3) {
      const hex = accentFromHue(h)
      expect(contrast(hex, ACCENT_INK), `hue ${h}`).toBeGreaterThanOrEqual(7)
      expect(contrast(hex, BACKGROUND), `hue ${h}`).toBeGreaterThanOrEqual(7)
    }
  })

  it('gives different colours for different hues and finds the hue of a colour again', () => {
    expect(new Set([0, 60, 120, 180, 240, 300].map(accentFromHue)).size).toBe(6)
    for (const h of [10, 90, 200, 280]) expect(Math.abs(hueOf(accentFromHue(h)) - h)).toBeLessThanOrEqual(2)
  })

  it('converts between hex and hsl without drift', () => {
    for (const p of PRESETS) {
      const [h, s, l] = rgbToHsl(hexToRgb(p.hex))
      const back = hexToRgb(hslToHex(h, s, l))
      const orig = hexToRgb(p.hex)
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - orig[i])).toBeLessThanOrEqual(1)
    }
  })

  it('makes a lighter and a darker shade for gradients', () => {
    for (const p of PRESETS) {
      const { hi, lo } = shades(p.hex)
      expect(luminance(hi)).toBeGreaterThan(luminance(lo))
    }
  })
})
