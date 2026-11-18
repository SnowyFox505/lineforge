import { newId } from './factory'
import { canServeOutside } from './outside'
import { appendStation, shape, withLine } from './routing'
import { stationName } from './stationType'
import { LAND } from './types'
import type { CityDoc, Line, Pt } from './types'

/**
 * A connection to the outside world is where a line leaves the map: a station at the edge of the map can be marked as one (see
 * `Station.outside`). When the map grows, the connections that lay at the old edge can be carried on to the new edge.
 */

/** How close to the edge of the map a station has to be (cells) to count as touching it */
export const EDGE_BAND = 2

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** The edge of the map a point touches (the nearest one, within `band` cells), or null in the middle of the map. */
export function edgeSide(size: number, x: number, y: number, band = EDGE_BAND): Side | null {
  const d: Record<Side, number> = { left: x, right: size - 1 - x, top: y, bottom: size - 1 - y }
  let best: Side | null = null
  let bd = band + 1
  for (const k of ['left', 'right', 'top', 'bottom'] as Side[]) {
    if (d[k] <= band && d[k] < bd) {
      best = k
      bd = d[k]
    }
  }
  return best
}

/** Does this station touch the edge of the map? */
export const atMapEdge = (doc: CityDoc, st: { x: number; y: number }) => edgeSide(doc.size, st.x, st.y) !== null

/** The same line the other way round (stations, control points and routes). */
function reversed(line: Line): Line {
  const l = shape(line)
  const n = l.stations.length
  if (n < 2) return l
  const legs = (l.via ?? []).slice(0, n - 1).map((p) => [...p].reverse()).reverse()
  const segs = (l.segs ?? []).map((s) => (s ? [...s].reverse() : s)).reverse()
  return { ...l, stations: [...l.stations].reverse(), via: [...legs, []], segs }
}

/** Add a station at the start of a line. */
function prependStation(doc: CityDoc, lineId: string, stationId: string): CityDoc {
  const base = doc.lines[lineId]
  if (!base) return doc
  const flipped = appendStation(withLine(doc, reversed(base)), lineId, stationId)
  return withLine(flipped, reversed(flipped.lines[lineId]))
}

/** A free land cell on the edge `side`, as near to `from` as possible (up to `reach` cells along the edge). */
function edgeSpot(doc: CityDoc, side: Side, from: Pt, reach = 8): Pt | null {
  const { size, terrain } = doc
  const along = side === 'left' || side === 'right' ? from.y : from.x
  const taken = new Set(Object.values(doc.stations).map((s) => `${s.x},${s.y}`))
  for (let k = 0; k <= reach; k++) {
    for (const a of k === 0 ? [along] : [along + k, along - k]) {
      if (a < 0 || a >= size) continue
      const p = side === 'left' ? { x: 0, y: a } : side === 'right' ? { x: size - 1, y: a } : side === 'top' ? { x: a, y: 0 } : { x: a, y: size - 1 }
      if (terrain[p.y * size + p.x] === LAND && !taken.has(`${p.x},${p.y}`)) return p
    }
  }
  return null
}

/**
 * Carry a connection to the outside world on to the edge of the (enlarged) map: a new station at the edge takes over the
 * connection and is added to every line that ended at the old one. `side` is the edge the old station lay at. Null when there is
 * nothing to carry on (no line ends there, no free place on the edge).
 */
export function extendOutside(doc: CityDoc, stationId: string, side: Side): { doc: CityDoc; created: string } | null {
  const st = doc.stations[stationId]
  if (!st?.outside) return null
  const spot = edgeSpot(doc, side, st)
  if (!spot) return null
  const ends = Object.values(doc.lines).filter((l) => !l.loop && l.stations.length >= 1 && canServeOutside(l.operator) && (l.stations[0] === stationId || l.stations[l.stations.length - 1] === stationId))
  if (!ends.length) return null
  const id = newId()
  let d: CityDoc = {
    ...doc,
    stations: {
      ...doc.stations,
      [stationId]: (({ outside: _gone, ...rest }) => rest)(st),
      [id]: { id, name: stationName('standard', Object.keys(doc.stations).length + 1), x: spot.x, y: spot.y, type: 'standard', outside: st.outside },
    },
  }
  for (const l of ends) {
    const line = d.lines[l.id]
    if (line.stations[line.stations.length - 1] === stationId) d = appendStation(d, l.id, id)
    else d = prependStation(d, l.id, id)
  }
  return { doc: d, created: id }
}
