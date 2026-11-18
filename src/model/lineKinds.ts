import { newId } from './factory'
import { curveLength, lineCurve } from './geo'
import { shape, withLine, withRoutes } from './routing'
import { stopsAt } from './stops'
import type { CityDoc, Line, Pt } from './types'

/** How much faster an express train is than a stopping one */
export const EXPRESS_SPEED = 1.4

// ---- express lines --------------------------------------------------------------------------

/**
 * The stations an express line keeps calling at: both ends, every station where another line calls too (so you can
 * change trains), the main station and the airport.
 */
export function expressStops(doc: CityDoc, line: Line): Set<string> {
  const keep = new Set<string>()
  const n = line.stations.length
  if (n) {
    keep.add(line.stations[0])
    keep.add(line.stations[n - 1])
  }
  for (const id of line.stations) {
    const st = doc.stations[id]
    if (!st) continue
    if (st.type === 'hauptbahnhof' || st.type === 'airport') keep.add(id)
    if (Object.values(doc.lines).some((o) => o.id !== line.id && stopsAt(o, id))) keep.add(id)
  }
  return keep
}

/**
 * Make a line an express line: it runs through every station that is not important (see `expressStops`) and is faster.
 * Null when there would be nothing to skip (every station is important), or the line is too short.
 */
export function makeExpress(doc: CityDoc, lineId: string): CityDoc | null {
  const line = doc.lines[lineId]
  if (!line || line.stations.length < 3) return null
  const keep = expressStops(doc, line)
  const passes = [...new Set(line.stations.filter((id) => !keep.has(id)))]
  if (!passes.length) return null
  return withLine(doc, { ...line, express: true, passes })
}

/** An express line calls at every station again and is a normal line. */
export function endExpress(doc: CityDoc, lineId: string): CityDoc | null {
  const line = doc.lines[lineId]
  if (!line?.express) return null
  const { express: _gone, passes: _p, ...rest } = line
  void _gone
  void _p
  return withLine(doc, rest)
}

// ---- Auslaeufer (branches) -----------------------------------------------------------------------

const DIGITS = '0123456789'

/** The name of the next branch of a line: its name plus a digit, e.g. S3 -> S30, S31, S32 ... S39 */
export function branchName(doc: CityDoc, parent: Line): string | null {
  const taken = new Set(Object.values(doc.lines).map((l) => l.name))
  for (const d of DIGITS) if (!taken.has(`${parent.name}${d}`)) return `${parent.name}${d}`
  return null
}

/** Which part of the parent a branch at station index `idx` follows by default: the longer one. */
export function longerPart(doc: CityDoc, parent: Line, idx: number): 'start' | 'end' {
  const c = lineCurve(doc, parent)
  const at = c.legStart[idx] ?? 0
  const before = curveLength(c.pts.slice(0, at + 1))
  const after = curveLength(c.pts.slice(at))
  return before >= after ? 'start' : 'end'
}

/** Number of stations a branch of `parent` at index `idx` has before the player draws anything. */
function partSize(parent: Line, idx: number, towards: 'start' | 'end'): number {
  return towards === 'start' ? idx + 1 : parent.stations.length - idx
}

/** Index of the branching station on the parent, or -1 when it is not an inner station the line calls at. */
function branchIndex(parent: Line, stationId: string): number {
  const n = parent.stations.length
  const idx = parent.stations.indexOf(stationId)
  if (idx <= 0 || idx >= n - 1 || !stopsAt(parent, stationId)) return -1
  return idx
}

/**
 * A branch (Ausläufer) at an inner station of a line: a new line in the colour of the parent that runs along the chosen part
 * of the parent up to the branching station and from there on to wherever the player draws it. It is called like the parent
 * plus a digit (S3 -> S31). `towards` says which part of the parent it follows; by default the longer one.
 * Pass `reuse` to rebuild an existing branch (the other side). Null when no branch can start there.
 */
export function makeBranch(doc: CityDoc, parentId: string, stationId: string, towards?: 'start' | 'end', reuse?: { id: string; name: string }): { doc: CityDoc; lineId: string } | null {
  const base = doc.lines[parentId]
  if (!base || base.loop || base.branch) return null
  const parent = shape(base)
  const idx = branchIndex(parent, stationId)
  if (idx < 0) return null
  const side = towards ?? longerPart(doc, parent, idx)
  const name = reuse?.name ?? branchName(doc, parent)
  if (!name) return null
  const via = parent.via ?? []
  let stations: string[]
  let v: Pt[][]
  if (side === 'start') {
    stations = parent.stations.slice(0, idx + 1)
    v = via.slice(0, idx + 1).map((p) => p.map((q) => ({ ...q })))
    v[idx] = []
  } else {
    // the branch runs from the far end of the parent to the branching station: the part is turned around
    stations = parent.stations.slice(idx).reverse()
    const legs = via.slice(idx, parent.stations.length - 1).map((p) => p.map((q) => ({ ...q })).reverse())
    v = [...legs.reverse(), []]
  }
  const line: Line = {
    id: reuse?.id ?? newId(),
    name,
    operator: parent.operator,
    color: parent.color,
    stations,
    via: v,
    segs: Array.from({ length: stations.length - 1 }, () => undefined as unknown as Pt[]),
    curve: parent.curve,
    passes: parent.passes?.filter((id) => stations.includes(id)),
    branch: { parent: parent.id, at: stationId, towards: side },
  }
  return { doc: withRoutes(withLine(doc, line)), lineId: line.id }
}

/**
 * A branch (Auslaeufer) that runs along a stretch of its parent: it starts at station `fromId`, follows the parent up to
 * station `atId` and from there on to wherever the player draws it (or ends there). Both stations have to be stations the
 * parent calls at; they can lie anywhere on it, in either order (the stretch is turned around when `fromId` comes later).
 * The branch takes over the control points of the stretch, so on the shared stretch both lines run on exactly the same
 * curve (the map and the network plan then draw them as one line, see `layoutLines`). Null when that is not possible.
 */
export function makeBranchBetween(doc: CityDoc, parentId: string, fromId: string, atId: string): { doc: CityDoc; lineId: string } | null {
  const base = doc.lines[parentId]
  if (!base || base.loop || base.branch || fromId === atId) return null
  const parent = shape(base)
  const ia = parent.stations.indexOf(fromId)
  const ib = parent.stations.indexOf(atId)
  if (ia < 0 || ib < 0 || !stopsAt(parent, fromId) || !stopsAt(parent, atId)) return null
  const name = branchName(doc, parent)
  if (!name) return null
  const via = parent.via ?? []
  const lo = Math.min(ia, ib)
  const hi = Math.max(ia, ib)
  let stations = parent.stations.slice(lo, hi + 1)
  // the legs of the stretch (leg k lies between station k and k + 1)
  let legs = via.slice(lo, hi).map((p) => p.map((q) => ({ ...q })))
  if (ia > ib) {
    stations = stations.slice().reverse()
    legs = legs.reverse().map((p) => p.reverse())
  }
  const line: Line = {
    id: newId(),
    name,
    operator: parent.operator,
    color: parent.color,
    stations,
    via: [...legs, []],
    segs: Array.from({ length: stations.length - 1 }, () => undefined as unknown as Pt[]),
    curve: parent.curve,
    passes: parent.passes?.filter((id) => stations.includes(id)),
    branch: { parent: parent.id, at: atId, from: fromId, towards: ia > ib ? 'start' : 'end' },
  }
  return { doc: withRoutes(withLine(doc, line)), lineId: line.id }
}

/**
 * Take the other part of the parent as the branch's way (the far end of the other side). Only possible while the branch is
 * bare, i.e. nothing was drawn beyond the branching station yet. Null otherwise.
 */
export function flipBranch(doc: CityDoc, lineId: string): CityDoc | null {
  const line = doc.lines[lineId]
  const b = line?.branch
  const parentBase = b ? doc.lines[b.parent] : undefined
  // a branch that was made between two stations has no other side
  if (!line || !b || !parentBase || b.from) return null
  const parent = shape(parentBase)
  const idx = branchIndex(parent, b.at)
  if (idx < 0 || line.stations.length !== partSize(parent, idx, b.towards)) return null
  const other = b.towards === 'start' ? 'end' : 'start'
  const rest = { ...doc, lines: { ...doc.lines } }
  delete rest.lines[lineId]
  const out = makeBranch(rest, b.parent, b.at, other, { id: lineId, name: line.name })
  if (!out) return null
  // keep the colour the player chose for the branch
  const made = out.doc.lines[lineId]
  return withLine(out.doc, { ...made, color: line.color })
}

/** Is this branch still bare (nothing drawn beyond the branching station)? */
export function branchIsBare(doc: CityDoc, line: Line): boolean {
  const b = line.branch
  const parentBase = b ? doc.lines[b.parent] : undefined
  if (!b || !parentBase) return false
  if (b.from) {
    // made between two stations: bare while it still is only that stretch
    const stations = shape(parentBase).stations
    const span = Math.abs(stations.indexOf(b.from) - stations.indexOf(b.at)) + 1
    return line.stations.length === span && line.stations[0] === b.from && line.stations[line.stations.length - 1] === b.at
  }
  const idx = branchIndex(shape(parentBase), b.at)
  return idx >= 0 && line.stations.length === partSize(parentBase, idx, b.towards)
}
