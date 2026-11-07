import { beforeEach, describe, expect, it } from 'vitest'
import { LINE_COLORS } from '../model/constants'
import { buildField, WATER_THRESHOLD } from '../model/terrainField'
import { WATER } from '../model/types'
import { effectiveTypes } from '../plan/glyphs'
import { useEditor } from './editorStore'

const S = () => useEditor.getState()

describe('editor store', () => {
  beforeEach(() => S().newCity('Test', 'creative', 128))

  it('gives every new line its own palette colour, independent of the operator', () => {
    const a = S().addLine('sbahn')
    const b = S().addLine('sbahn')
    const c = S().addLine('ubahn')
    const colors = [a, b, c].map((id) => S().doc.lines[id].color)
    expect(new Set(colors).size).toBe(3)
    colors.forEach((col) => expect(LINE_COLORS).toContain(col))
  })

  it('lets a line colour be changed freely', () => {
    const id = S().addLine('tram')
    S().updateLine(id, { color: '#123456' })
    expect(S().doc.lines[id].color).toBe('#123456')
  })

  it('keeps stations in place (shifted to the centre) when the map grows', () => {
    S().setStationType('standard')
    const id = S().addStation(10, 20)!
    S().resizeMap(256)
    const st = S().doc.stations[id]
    expect(S().doc.size).toBe(256)
    expect(S().doc.terrain.length).toBe(256 * 256)
    expect(st.x).toBe(10 + 64)
    expect(st.y).toBe(20 + 64)
    S().undo()
    expect(S().doc.size).toBe(128)
  })

  it('refuses to place stations on water', () => {
    S().setBrush(3)
    S().checkpoint()
    S().paint(30, 30, WATER)
    expect(S().addStation(30, 30)).toBeNull()
  })

  it('shows a plain stop shared by two lines as an interchange', () => {
    S().setStationType('standard')
    const a = S().addStation(5, 5)!
    const b = S().addStation(9, 5)!
    const c = S().addStation(9, 9)!
    const l1 = S().addLine('sbahn')
    const l2 = S().addLine('ubahn')
    ;[a, b].forEach((s) => S().appendToLine(l1, s))
    ;[b, c].forEach((s) => S().appendToLine(l2, s))
    const types = effectiveTypes(S().doc)
    expect(types[b]).toBe('interchange')
    expect(types[a]).toBe('standard')
  })
})

describe('terrain field', () => {
  it('is smooth: water cells exceed the coast threshold, land stays below it', () => {
    const size = 16
    const t = new Uint8Array(size * size)
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) t[y * size + x] = WATER
    const f = buildField(t, size)
    const n = size + 1
    expect(f[8 * n + 8]).toBeGreaterThan(WATER_THRESHOLD)
    expect(f[1 * n + 1]).toBeLessThan(WATER_THRESHOLD)
  })

  it('keeps a three-cell-wide river clearly above the threshold', () => {
    const size = 16
    const t = new Uint8Array(size * size)
    for (let x = 0; x < size; x++) for (let y = 7; y <= 9; y++) t[y * size + x] = WATER
    const f = buildField(t, size)
    const n = size + 1
    expect(f[8 * n + 8]).toBeGreaterThan(WATER_THRESHOLD + 0.2)
  })
})
