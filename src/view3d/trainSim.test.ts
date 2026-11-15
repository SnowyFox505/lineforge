import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc, OperatorId } from '../model/types'
import { RAIL, railOf } from '../model/scale'
import { buildNetwork3D, BUFFER_CLEAR, posOn, STEP } from './network3d'
import { carPoses, Sim } from './trainSim'

function city(): CityDoc {
  return createCity('T', 'creative', 160)
}
function station(doc: CityDoc, id: string, x: number, y: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x, y, type: 'standard' } } }
}
function line(doc: CityDoc, id: string, op: OperatorId, ids: string[]): CityDoc {
  let d: CityDoc = { ...doc, lines: { ...doc.lines, [id]: { id, name: id, operator: op, color: '#fff', stations: [], via: [], segs: [] } } }
  for (const s of ids) d = appendStation(d, id, s)
  return d
}

/** Two crossing lines that share the station X, plus a long ICE line. */
function scenario() {
  let d = city()
  for (const [id, x, y] of [['a', 20, 20], ['x', 80, 80], ['e', 140, 140], ['b', 140, 20], ['c', 20, 140], ['f', 30, 100], ['g', 130, 100]] as [string, number, number][]) d = station(d, id, x, y)
  d = line(d, 'L1', 'sbahn', ['a', 'x', 'e'])
  d = line(d, 'L2', 'ubahn', ['b', 'x', 'c'])
  d = line(d, 'L3', 'fernverkehr', ['f', 'x', 'g'])
  return d
}

function segDist(p: { x: number; z: number }, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2))
  return Math.hypot(ax + dx * t - p.x, az + dz * t - p.z)
}

describe('train operation', () => {
  it('keeps the cars of a train joined in the curves', () => {
    const net = buildNetwork3D(scenario())
    const sim = new Sim(net)
    let worst = 0
    for (let t = 0; t < 300; t += 0.25) {
      sim.update(0.25)
      for (const tr of sim.trains) {
        const poses = carPoses(tr)
        for (let i = 0; i + 1 < poses.length; i++) {
          const a = poses[i]
          const b = poses[i + 1]
          const la = (tr.spec.lens[i] * RAIL) / 2
          const lb = (tr.spec.lens[i + 1] * RAIL) / 2
          // the rear end of one car and the front end of the next one meet at the coupling
          const gap = Math.hypot(a.x - a.tx * la - (b.x + b.tx * lb), a.z - a.tz * la - (b.z + b.tz * lb))
          worst = Math.max(worst, gap)
        }
      }
    }
    expect(worst).toBeLessThan(0.3)
  })


  it('keeps every car on the rails, in front of the buffer stops, for ten minutes of traffic', () => {
    const net = buildNetwork3D(scenario())
    const sim = new Sim(net)
    expect(sim.trains.length).toBeGreaterThanOrEqual(3)
    let t = 0
    while (t < 600) {
      sim.update(0.25)
      t += 0.25
      for (const tr of sim.trains) {
        for (const p of carPoses(tr)) {
          // distance to the nearest rail segment of either track or of a crossover behind a terminal
          let best = Infinity
          for (const co of tr.net.crossovers) for (let i = 0; i < co.x.length - 1; i++) best = Math.min(best, segDist(p, co.x[i], co.z[i], co.x[i + 1], co.z[i + 1]))
          for (let i = 0; i < tr.net.n - 1; i++) {
            best = Math.min(best, segDist(p, tr.net.fx[i], tr.net.fz[i], tr.net.fx[i + 1], tr.net.fz[i + 1]), segDist(p, tr.net.bx[i], tr.net.bz[i], tr.net.bx[i + 1], tr.net.bz[i + 1]))
          }
          // a train that changes ends at a terminal uses the crossover rails: it is never between the tracks
          // a car rests on two bogies on the rails: in a curve its middle sits a little inside
          expect(best).toBeLessThan(0.2)
        }
        // the train never reaches a buffer: the planned clearance behind the platform is BUFFER_CLEAR, but the run-out
        // is cut at a sample of the curve (STEP apart), so it may be up to a step shorter
        const half = ((tr.spec.lens.reduce((a, b) => a + b, 0) + tr.spec.gap * (tr.spec.lens.length - 1)) * railOf(tr.net.line.operator)) / 2
        expect(tr.s - half).toBeGreaterThan(BUFFER_CLEAR - STEP)
        expect(tr.net.total - (tr.s + half)).toBeGreaterThan(BUFFER_CLEAR - STEP)
      }
    }
  })

  it('never lets two trains hold the same station track and never deadlocks', () => {
    const net = buildNetwork3D(scenario())
    const sim = new Sim(net)
    for (let t = 0; t < 1200; t += 0.25) {
      sim.update(0.25)
      const seen = new Map<string, string>()
      for (const tr of sim.trains) {
        if (tr.phase !== 'dwell' || !tr.at) continue
        const other = seen.get(tr.at)
        expect(other === undefined || other === tr.id).toBe(true)
        seen.set(tr.at, tr.id)
      }
    }
    expect(sim.forced).toBe(0)
  })

  it('gives every train a stop clear of the buffer and calls at all stations', () => {
    const net = buildNetwork3D(scenario())
    for (const ln of net.lines) {
      expect(ln.stops[0].d).toBeCloseTo(ln.stops[0].half + BUFFER_CLEAR, 0)
      const p0 = posOn(ln, 'f', 0)
      expect(Number.isFinite(p0.x)).toBe(true)
    }
    const sim = new Sim(net)
    const visited = new Map<string, Set<number>>()
    for (let t = 0; t < 900; t += 0.25) {
      sim.update(0.25)
      for (const tr of sim.trains) {
        if (tr.phase === 'dwell') {
          const set = visited.get(tr.id) ?? new Set()
          set.add(tr.legs[tr.leg].from)
          visited.set(tr.id, set)
        }
      }
    }
    for (const tr of sim.trains) expect(visited.get(tr.id)!.size).toBeGreaterThanOrEqual(3)
  })
})
