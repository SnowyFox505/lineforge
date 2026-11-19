import { describe, expect, it } from 'vitest'
import { GLYPH_H, GLYPH_W, hasGlyph, textDots } from './dotFont'

describe('dot-matrix font', () => {
  it('has a glyph for every letter of the LED texts', () => {
    for (const t of ['SUCHE NACH UPDATES', 'SPEICHER LEEREN', 'STÄDTE SICHERN', 'NEUSTART', 'BITTE ZURÜCKTRETEN']) {
      for (const ch of t) expect(hasGlyph(ch)).toBe(true)
    }
  })

  it('lays the glyphs out in a grid of 5 x 7 with one empty column between letters', () => {
    const { cols, rows, dots } = textDots('HI')
    expect(cols).toBe(2 * GLYPH_W + 1)
    expect(rows).toBe(GLYPH_H)
    for (const [x, y] of dots) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(cols)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(rows)
    }
    expect(dots.length).toBeGreaterThan(10)
  })

  it('keeps two rows free for the dots of an umlaut', () => {
    const plain = textDots('U')
    const umlaut = textDots('Ü')
    expect(umlaut.rows).toBe(plain.rows + 2)
    expect(umlaut.dots.filter(([, y]) => y === 0).length).toBe(2)
  })
})
