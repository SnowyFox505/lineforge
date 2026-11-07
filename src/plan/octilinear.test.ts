import { describe, expect, it } from 'vitest'
import type { Station } from '../model/types'
import { joinPaths, octilinearPath, offsetPolyline, segmentKey, segmentPath } from './octilinear'

const st = (id: string, x: number, y: number): Station => ({ id, name: id, x, y, type: 'standard' })

function onlyOctilinear(path: { x: number; y: number }[]) {
  for (let i = 0; i < path.length - 1; i++) {
    const dx = Math.abs(path[i + 1].x - path[i].x)
    const dy = Math.abs(path[i + 1].y - path[i].y)
    const eps = 1e-9
    expect(dx < eps || dy < eps || Math.abs(dx - dy) < eps).toBe(true)
  }
}

describe('octilinearPath', () => {
  it('returns a straight segment for horizontal, vertical and diagonal moves', () => {
    expect(octilinearPath({ x: 0, y: 0 }, { x: 5, y: 0 })).toHaveLength(2)
    expect(octilinearPath({ x: 0, y: 0 }, { x: 0, y: 5 })).toHaveLength(2)
    expect(octilinearPath({ x: 0, y: 0 }, { x: 4, y: 4 })).toHaveLength(2)
  })

  it('adds one bend for other offsets and uses only 0/45/90 degree segments', () => {
    for (const [x, y] of [[7, 2], [2, 7], [-6, 3], [3, -9]]) {
      const path = octilinearPath({ x: 0, y: 0 }, { x, y })
      expect(path).toHaveLength(3)
      expect(path[2]).toEqual({ x, y })
      onlyOctilinear(path)
    }
  })
})

describe('segmentPath', () => {
  it('is identical in both directions (reversed)', () => {
    const a = st('a', 0, 0)
    const b = st('b', 7, 2)
    expect(segmentPath(a, b)).toEqual(segmentPath(b, a).slice().reverse())
    expect(segmentKey('a', 'b')).toBe(segmentKey('b', 'a'))
  })
})

describe('offsetPolyline', () => {
  it('shifts a straight line sideways by the given distance', () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2)
    expect(out[0].y).toBeCloseTo(2)
    expect(out[1].y).toBeCloseTo(2)
  })

  it('keeps perpendicular distance at a 45° bend', () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 5 }], 1)
    expect(out).toHaveLength(3)
    onlyOctilinear(out)
  })
})

describe('joinPaths', () => {
  it('drops duplicated joints', () => {
    const out = joinPaths([
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    ])
    expect(out).toHaveLength(3)
  })
})
