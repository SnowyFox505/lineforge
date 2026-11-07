import { carOffsets } from '../model/vehicles'
import type { VehicleSpec } from '../model/vehicles'
import { VEHICLES } from '../model/vehicles'
import type { OperatorId } from '../model/types'
import { smooth01 } from './curves'
import { posOn } from './network3d'
import type { LineNet, Network3D, Stop } from './network3d'

// ---------------------------------------------------------------------------
// Train operation
//
// Every train shuttles between the two terminals of its line and calls at every station.
//  * Trains only ever run on the rails: their position is a point on the line's forward /
//    return track at an arc length, exactly the geometry the rails are built from.
//  * A station track is held by one train at a time. A train only leaves for the next
//    station when the track it needs there is free, otherwise it waits where it stands.
//  * At a terminal the train stops well in front of the buffer stop, changes ends and
//    leaves again on the same track, merging onto the opposite track after the platform.
// ---------------------------------------------------------------------------

export interface Leg {
  from: number
  to: number
  dir: 1 | -1
}

export interface SimTrain {
  id: string
  net: LineNet
  op: OperatorId
  spec: VehicleSpec
  color: string
  legs: Leg[]
  leg: number
  phase: 'dwell' | 'move'
  /** dwell time left, or progress 0..1 of the current leg */
  t: number
  duration: number
  /** arc length of the train centre along the line axis */
  s: number
  dir: 1 | -1
  waited: number
  at: string | null
  to: string | null
  /** set while the train leaves a terminal: it merges from the arrival track onto the other one */
  rev: { d: number; half: number; taper: number; oldDir: 1 | -1 } | null
}

export const DWELL = 2.2
export const DWELL_TERMINAL = 3.8
export const MAX_WAIT = 40
const ease = (u: number) => u * u * (3 - 2 * u)

const keyOf = (stop: Stop, dir: 1 | -1) => `${stop.stationId}|${(dir > 0 ? stop.zF : stop.zB).toFixed(2)}`

export function buildLegs(stopCount: number): Leg[] {
  const legs: Leg[] = []
  for (let i = 0; i < stopCount - 1; i++) legs.push({ from: i, to: i + 1, dir: 1 })
  for (let i = stopCount - 1; i > 0; i--) legs.push({ from: i, to: i - 1, dir: -1 })
  return legs
}

export class Sim {
  trains: SimTrain[] = []
  occ = new Map<string, string>()
  /** how often a train had to enter an occupied track after waiting too long (should stay at zero) */
  forced = 0

  constructor(net: Network3D, maxPerLine = 2) {
    let order = 0
    for (const ln of net.lines) {
      if (ln.stops.length < 2) continue
      const spec = VEHICLES[ln.line.operator]
      const legs = buildLegs(ln.stops.length)
      const count = Math.min(maxPerLine, Math.max(1, Math.floor(ln.total / 70) + 1))
      for (let i = 0; i < count; i++) {
        const tr: SimTrain = {
          id: `${ln.line.id}#${i}`,
          net: ln,
          op: ln.line.operator,
          spec,
          color: ln.line.color,
          legs,
          leg: Math.floor((i * legs.length) / count),
          phase: 'dwell',
          t: 1 + order++ * 4.5, // trains start one after another so shared tracks are never fought over
          duration: 0,
          s: 0,
          dir: 1,
          waited: 0,
          at: null,
          to: null,
          rev: null,
        }
        // start on a free station track
        for (let tries = 0; tries < legs.length; tries++) {
          const leg = legs[tr.leg % legs.length]
          const prev = legs[(tr.leg - 1 + legs.length) % legs.length]
          const stop = ln.stops[leg.from]
          const key = keyOf(stop, prev.dir)
          if (!this.occ.has(key)) {
            this.occ.set(key, tr.id)
            tr.at = key
            tr.dir = prev.dir
            tr.s = stop.d
            break
          }
          tr.leg = (tr.leg + 1) % legs.length
        }
        // no free station track left on this line: this train is simply not in service
        if (tr.at) this.trains.push(tr)
      }
    }
  }

  update(dt: number) {
    // sub-steps keep fast-forward stable
    let left = dt
    while (left > 1e-6) {
      const h = Math.min(0.1, left)
      left -= h
      for (const tr of this.trains) this.step(tr, h)
    }
  }

  private step(tr: SimTrain, dt: number) {
    const legs = tr.legs
    const leg = legs[tr.leg % legs.length]
    const stops = tr.net.stops
    if (tr.phase === 'dwell') {
      tr.t -= dt
      if (tr.t > 0) return
      const target = stops[leg.to]
      const key = keyOf(target, leg.dir)
      const owner = this.occ.get(key)
      if (owner && owner !== tr.id && tr.waited < MAX_WAIT) {
        tr.waited += dt
        return
      }
      // depart: free the track we stand on, claim the one we are heading for
      if (owner && owner !== tr.id) this.forced++
      if (tr.at && this.occ.get(tr.at) === tr.id) this.occ.delete(tr.at)
      this.occ.set(key, tr.id)
      tr.to = key
      tr.waited = 0
      const from = stops[leg.from]
      tr.rev = tr.dir !== leg.dir ? { d: from.d, half: from.half, taper: from.taper, oldDir: tr.dir } : null
      tr.dir = leg.dir
      tr.duration = Math.max(2.6, Math.abs(target.d - from.d) / tr.spec.speed + 1.8)
      tr.phase = 'move'
      tr.t = 0
      return
    }
    tr.t += dt / tr.duration
    const from = stops[leg.from]
    const to = stops[leg.to]
    if (tr.t >= 1) {
      tr.s = to.d
      tr.phase = 'dwell'
      tr.leg = (tr.leg + 1) % legs.length
      tr.at = tr.to
      tr.to = null
      tr.rev = null
      const next = legs[tr.leg]
      tr.t = next.dir !== tr.dir ? DWELL_TERMINAL : DWELL
      return
    }
    tr.s = from.d + (to.d - from.d) * ease(tr.t)
  }
}

export interface CarPose {
  x: number
  y: number
  z: number
  tx: number
  tz: number
  /** nose up (+) / down (-) in radians */
  pitch: number
}

/** World pose of every car of a train, head first. */
export function carPoses(tr: SimTrain): CarPose[] {
  const offs = carOffsets(tr.spec)
  const own = tr.dir > 0 ? 'f' : 'b'
  return offs.map((o) => {
    const d = tr.s + tr.dir * o
    const p = posOn(tr.net, own, d)
    let x = p.x
    let z = p.z
    const y = p.y
    if (tr.rev) {
      // still on the arrival track near the terminal platform, merging onto the return track further out
      const q = posOn(tr.net, tr.rev.oldDir > 0 ? 'f' : 'b', d)
      const b = smooth01((Math.abs(d - tr.rev.d) - tr.rev.half) / tr.rev.taper)
      x = q.x + (p.x - q.x) * b
      z = q.z + (p.z - q.z) * b
    }
    const sgn = tr.dir
    return { x, y, z, tx: p.tx * sgn, tz: p.tz * sgn, pitch: Math.atan(p.slope * sgn) }
  })
}
