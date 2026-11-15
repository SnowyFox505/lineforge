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

const DIGITS = '1234567890'

/** The name of the next branch of a line: its name plus a digit, e.g. S3 -> S31, S32 ... */
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
 * Take the other part of the parent as the branch's way (the far end of the other side). Only possible while the branch is
 * bare, i.e. nothing was drawn beyond the branching station yet. Null otherwise.
 */
export function flipBranch(doc: CityDoc, lineId: string): CityDoc | null {
  const line = doc.lines[lineId]
  const b = line?.branch
  const parentBase = b ? doc.lines[b.parent] : undefined
  if (!line || !b || !parentBase) return null
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
  const idx = branchIndex(shape(parentBase), b.at)
  return idx >= 0 && line.stations.length === partSize(parentBase, idx, b.towards)
}
