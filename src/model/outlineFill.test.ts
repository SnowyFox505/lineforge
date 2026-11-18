import { describe, expect, it } from 'vitest'
import { cellsInPolygon } from './outlineFill'

const at = (cells: number[], size: number) => new Set(cells.map((i) => `${i % size},${Math.floor(i / size)}`))

describe('cellsInPolygon', () => {
  it('fills a square exactly (cells whose centre is inside)', () => {
    const cells = cellsInPolygon([{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }], 10)
    expect(cells).toHaveLength(4 * 3)
    const s = at(cells, 10)
    expect(s.has('2,2') && s.has('5,4')).toBe(true)
    expect(s.has('6,3') || s.has('1,3') || s.has('3,5') || s.has('3,1')).toBe(false)
  })

  it('follows a triangle', () => {
    const cells = at(cellsInPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], 12), 12)
    expect(cells.has('1,1')).toBe(true)
    expect(cells.has('7,1')).toBe(true)
    expect(cells.has('8,8')).toBe(false)
    expect(cells.has('9,5')).toBe(false)
  })

  it('does not care in which direction the outline was drawn, and closes it by itself', () => {
    const a = cellsInPolygon([{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }, { x: 1, y: 5 }], 8)
    const b = cellsInPolygon([{ x: 1, y: 1 }, { x: 1, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 1 }], 8)
    expect(a.sort((x, y) => x - y)).toEqual(b.sort((x, y) => x - y))
  })

  it('stays inside the map and ignores strokes that enclose nothing', () => {
    const cells = cellsInPolygon([{ x: -5, y: -5 }, { x: 20, y: -5 }, { x: 20, y: 20 }, { x: -5, y: 20 }], 8)
    expect(cells).toHaveLength(64)
    expect(cellsInPolygon([{ x: 1, y: 1 }, { x: 4, y: 4 }], 8)).toEqual([])
    expect(cellsInPolygon([{ x: 1, y: 1 }, { x: 4, y: 4 }, { x: 7, y: 7 }], 8)).toEqual([])
  })

  it('leaves a hole where the outline crosses itself (even-odd)', () => {
    // a bow tie: two triangles that meet in the middle
    const cells = at(cellsInPolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }], 12), 12)
    expect(cells.has('8,5')).toBe(true)
    expect(cells.has('1,5')).toBe(true)
    expect(cells.has('5,1')).toBe(false)
  })
})
