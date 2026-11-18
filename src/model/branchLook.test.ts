import { describe, expect, it } from 'vitest'
import { ownRuns, shownColor } from './branchLook'
import type { Line } from './types'

const line = (o: Partial<Line>): Line => ({ id: 'x', name: 'x', operator: 'sbahn', color: '#111111', stations: [], via: [], segs: [], ...o }) as Line

describe('branch look', () => {
  it('wears the colour of the main line', () => {
    const main = line({ id: 'a', color: '#e00000' })
    const br = line({ id: 'b', color: '#00e000', branch: { parent: 'a', at: 's', towards: 'end' } })
    expect(shownColor({ lines: { a: main, b: br } }, br)).toBe('#e00000')
    expect(shownColor({ lines: { a: main, b: br } }, main)).toBe('#e00000')
  })

  it('finds only the part where the branch has left the main line', () => {
    const main = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    const br = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 8, y: 0 }, { x: 10, y: 3 }, { x: 10, y: 6 }]
    const runs = ownRuns(br, main, 0.25)
    expect(runs).toHaveLength(1)
    expect(runs[0][0]).toEqual({ x: 8, y: 0 })
    expect(runs[0].at(-1)).toEqual({ x: 10, y: 6 })
  })

  it('shows nothing while the branch runs on the main line', () => {
    const main = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    expect(ownRuns([{ x: 1, y: 0 }, { x: 9, y: 0 }], main, 0.25)).toEqual([])
  })
})
