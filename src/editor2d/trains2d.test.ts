import { describe, expect, it } from 'vitest'
import { carsOf, poseAt, stopsAlong } from './trains2d'
import type { RunPath, TrainView } from './trains2d'
import type { OperatorId } from '../model/types'

function straight(n: number): RunPath {
  const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: i, y: 0 }))
  const cum = pts.map((_, i) => i)
  return { pts, cum, total: n, stops: [0, n / 2, n] }
}

describe('trains on the 2D map', () => {
  it('finds the stops along a path in driving order, also on a loop', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 0 },
    ]
    const cum = [0, 5, 10, 15, 20]
    const st = stopsAlong(pts, cum, [pts[0], pts[1], pts[2], pts[4]])
    expect(st).toEqual([0, 5, 10, 20])
  })

  it('gives longer trains more cars and a longer body', () => {
    const run = straight(40)
    const len = (op: OperatorId) => {
      const tr: TrainView = { id: 'a', lineId: 'a', op, color: '#fff', from: 1, to: 2, u: 0, dir: 1 }
      const cars = carsOf(tr, run, 30)
      return { n: cars.length, total: cars.reduce((s, c) => s + c.len, 0) }
    }
    expect(len('tram').total).toBeLessThan(len('sbahn').total)
    expect(len('sbahn').total).toBeLessThan(len('fernverkehr').total)
    expect(len('fernverkehr').n).toBeGreaterThan(len('tram').n)
  })

  it('reads the position on a path', () => {
    const p = poseAt(straight(10), 2.5)
    expect(p.x).toBeCloseTo(2.5)
    expect(p.tx).toBeCloseTo(1)
  })
})
