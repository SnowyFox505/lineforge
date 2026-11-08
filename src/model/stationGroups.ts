import { legCurve } from './geo'
import type { CityDoc, Line } from './types'

export const MAX_LEVELS = 3
/** Height of the lowest level when a station has several (it is sunk into the ground) and the spacing between levels */
export const LEVEL_BASE = -0.7
export const LEVEL_STEP = 1.7

/** Platform height of level `index` when the station really uses `count` levels. */
export function levelHeight(count: number, index: number): number {
  return count <= 1 ? 0 : LEVEL_BASE + LEVEL_STEP * index
}

export interface Dir {
  x: number
  z: number
}

/**
 * Overall direction of a line through a station, from the routed geometry on both sides
 * (the direction of travel; `null` when the line has no geometry there).
 */
export function lineDirectionAtStation(doc: CityDoc, line: Line, stationId: string, steps = 14): Dir | null {
  const k = line.stations.indexOf(stationId)
  if (k < 0) return null
  // the curve of the map (samples half a cell apart)
  const before = k > 0 ? legCurve(doc, line, k - 1) : []
  const after = k < line.stations.length - 1 ? legCurve(doc, line, k) : []
  const n = Math.round(steps * 2)
  const st = doc.stations[stationId]
  if (!st) return null
  const a = before.length >= 2 ? before[Math.max(0, before.length - 1 - n)] : { x: st.x, y: st.y }
  const b = after.length >= 2 ? after[Math.min(after.length - 1, n)] : { x: st.x, y: st.y }
  const dx = b.x - a.x
  const dz = b.y - a.y
  const l = Math.hypot(dx, dz)
  return l < 1e-6 ? null : { x: dx / l, z: dz / l }
}

/**
 * Split directions into at most `n` groups of similar direction (lines count the same in both
 * travel directions). Groups are numbered in order of their first member, so the result is stable.
 * Fewer groups than `n` come out when the lines already run in the same direction.
 */
export function clusterByDirection(dirs: Dir[], n: number): number[] {
  if (!dirs.length) return []
  // direction of a line = axis: map the angle to 2θ so that d and -d coincide
  const v = dirs.map((d) => {
    const a = Math.atan2(d.z, d.x)
    return { x: Math.cos(2 * a), z: Math.sin(2 * a) }
  })
  const k = Math.max(1, Math.min(n, MAX_LEVELS, dirs.length))
  if (k === 1) return dirs.map(() => 0)
  // farthest-point seeding, then a few k-means rounds
  const centres = [v[0]]
  while (centres.length < k) {
    let best = -1
    let bestD = -1
    v.forEach((p, i) => {
      const d = Math.min(...centres.map((c) => (c.x - p.x) ** 2 + (c.z - p.z) ** 2))
      if (d > bestD) {
        bestD = d
        best = i
      }
    })
    if (bestD < 2.0) break // closer than 45 degrees to a centre: not a distinct direction
    centres.push(v[best])
  }
  let label = v.map(() => 0)
  for (let it = 0; it < 10; it++) {
    label = v.map((p) => {
      let bi = 0
      let bd = Infinity
      centres.forEach((c, i) => {
        const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2
        if (d < bd) {
          bd = d
          bi = i
        }
      })
      return bi
    })
    centres.forEach((_, i) => {
      const m = v.filter((_, j) => label[j] === i)
      if (m.length) centres[i] = { x: m.reduce((s, p) => s + p.x, 0) / m.length, z: m.reduce((s, p) => s + p.z, 0) / m.length }
    })
  }
  // renumber by first appearance
  const order = new Map<number, number>()
  return label.map((l) => {
    if (!order.has(l)) order.set(l, order.size)
    return order.get(l)!
  })
}

/** Mean direction of a group (aligned to the first member so opposite travel directions do not cancel). */
export function meanDirection(dirs: Dir[]): Dir {
  const ref = dirs[0]
  let sx = 0
  let sz = 0
  for (const d of dirs) {
    const s = d.x * ref.x + d.z * ref.z >= 0 ? 1 : -1
    sx += d.x * s
    sz += d.z * s
  }
  const l = Math.hypot(sx, sz) || 1
  return { x: sx / l, z: sz / l }
}
