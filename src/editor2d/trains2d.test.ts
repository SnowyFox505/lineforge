import { describe, expect, it } from 'vitest'
import { carsOf, poseAt, stopsAlong, trainsOnLine, TrainSim } from './trains2d'
import type { RunPath } from './trains2d'
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
      const tr = { id: 'a', lineId: 'a', op, color: '#fff', leg: 0, phase: 'dwell' as const, t: 1, duration: 0 }
      const cars = carsOf(tr, run, 30)
      return { n: cars.length, total: cars.reduce((s, c) => s + c.len, 0) }
    }
    expect(len('tram').total).toBeLessThan(len('sbahn').total)
    expect(len('sbahn').total).toBeLessThan(len('fernverkehr').total)
    expect(len('fernverkehr').n).toBeGreaterThan(len('tram').n)
  })

  it('lets a train leave a station, arrive at the next and turn around at the end', () => {
    const sim = new TrainSim()
    sim.setPaths({ a: straight(30) }, new Map([['a', { op: 'sbahn' as const, color: '#f00' }]]))
    expect(sim.trains).toHaveLength(trainsOnLine(30))
    const seen = new Set<number>()
    for (let i = 0; i < 4000; i++) {
      sim.update(0.05)
      seen.add(sim.trains[0].leg)
    }
    // a round trip over 3 stops has 4 legs: all of them get driven
    expect(seen.size).toBe(4)
  })

  it('keeps its trains when the path changes a little', () => {
    const sim = new TrainSim()
    const meta = new Map([['a', { op: 'ubahn' as const, color: '#00f' }]])
    sim.setPaths({ a: straight(40) }, meta)
    for (let i = 0; i < 300; i++) sim.update(0.05)
    const before = sim.trains.map((t) => `${t.id}:${t.leg}`)
    sim.setPaths({ a: straight(41) }, meta)
    expect(sim.trains.map((t) => `${t.id}:${t.leg}`)).toEqual(before)
  })

  it('reads the position on a path', () => {
    const p = poseAt(straight(10), 2.5)
    expect(p.x).toBeCloseTo(2.5)
    expect(p.tx).toBeCloseTo(1)
  })
})
