import { newId } from './factory'
import { legCurve, lineCurve, nearestOnCurve, nearestStation, pullEnd, smoothLegPoints, smoothStroke, snapToCurves, strokeControlPoints, curveLength } from './geo'
import { rerouteAt, shape, withLine } from './routing'
import { followsStreets, streetFoot, streetViaPoints } from './streetNet'
import { onAirport, stationName, stationTypeAt } from './stationType'
import { LAND } from './types'
import type { CityDoc, Line, Pt, Station, StationType } from './types'

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
const r2 = (v: number) => Math.round(v * 100) / 100

/** Is this cell dry, on the map and free of stations? */
function freeLand(doc: CityDoc, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= doc.size || y >= doc.size) return false
  if (doc.terrain[y * doc.size + x] !== LAND) return false
  return !Object.values(doc.stations).some((s) => s.x === x && s.y === y)
}

/** The free dry cell closest to p (within `reach` cells), or null. */
function nearestFreeLand(doc: CityDoc, p: Pt, reach = 3): Pt | null {
  const cx = Math.round(p.x)
  const cy = Math.round(p.y)
  let best: Pt | null = null
  let bd = Infinity
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (!freeLand(doc, x, y)) continue
      const d = Math.hypot(x - p.x, y - p.y)
      if (d < bd) {
        bd = d
        best = { x, y }
      }
    }
  }
  return best
}

function newStation(doc: CityDoc, at: Pt, wanted: StationType): Station {
  const count = Object.keys(doc.stations).length + 1
  const id = newId()
  const type = stationTypeAt(doc, at.x, at.y, wanted)
  return { id, name: stationName(type, count), x: at.x, y: at.y, type }
}

export interface EditOutcome {
  doc: CityDoc
  /** stations the edit created */
  created: string[]
  /** the stretch of the line that was drawn or changed (index of its first station) */
  leg?: number
}

export interface StrokeOpts {
  /** how close (cells) an end of the stroke has to be to a station to join it */
  snap: number
  stationType?: StationType
}

/**
 * A stroke drawn with the finger becomes part of a line:
 *  - it starts at the last station of the line (or ends there): the line is extended,
 *  - it runs into the first station: the line gets a new beginning,
 *  - it joins two neighbouring stations of the line: the stretch between them is redrawn,
 *  - the line is still empty: the stroke is its first stretch.
 * An end that is not at a station gets a new station (on dry land).
 * Returns null when the stroke does not belong anywhere (not at the line, too short, no land at the end).
 */
export function applyStroke(doc: CityDoc, lineId: string, raw: Pt[], opts: StrokeOpts): EditOutcome | null {
  const base = doc.lines[lineId]
  if (!base) return null
  let dense = smoothStroke(raw)
  if (dense.length < 4) return null
  const line = shape(base)
  const n = line.stations.length
  const startId = nearestStation(doc, dense[0], opts.snap)
  const endId = nearestStation(doc, dense[dense.length - 1], opts.snap)

  type Plan = { mode: 'create' | 'append' | 'prepend' | 'replace'; reverse: boolean; k: number }
  let plan: Plan | null = null
  if (n === 0) plan = { mode: 'create', reverse: false, k: 0 }
  else {
    const first = line.stations[0]
    const last = line.stations[n - 1]
    for (let i = 0; i < n - 1 && !plan; i++) {
      if (startId && endId && startId === line.stations[i] && endId === line.stations[i + 1]) plan = { mode: 'replace', reverse: false, k: i }
      else if (startId && endId && startId === line.stations[i + 1] && endId === line.stations[i]) plan = { mode: 'replace', reverse: true, k: i }
    }
    if (!plan) {
      if (startId === last) plan = { mode: 'append', reverse: false, k: n - 1 }
      else if (endId === last) plan = { mode: 'append', reverse: true, k: n - 1 }
      else if (endId === first) plan = { mode: 'prepend', reverse: false, k: 0 }
      else if (startId === first) plan = { mode: 'prepend', reverse: true, k: 0 }
    }
  }
  if (!plan) return null

  // let the stroke follow other lines where it runs along them
  const others = Object.values(doc.lines)
    .filter((l) => l.id !== lineId && l.stations.length >= 2)
    .map((l) => lineCurve(doc, l).pts)
  dense = snapToCurves(dense, others)

  // the two ends: an existing station, or a new one on dry land
  const stationsOut = { ...doc.stations }
  const created: string[] = []
  // a tram stroke along streets: new stops sit on the street, not beside it
  const onStreets = line.operator === 'tram' && followsStreets(doc, dense)
  const place = (existing: string | null, at: Pt): Station | null => {
    if (existing) return stationsOut[existing]
    const foot = onStreets ? streetFoot(doc, at, 3) : null
    const cell = nearestFreeLand({ ...doc, stations: stationsOut }, foot ?? at)
    if (!cell) return null
    const st = newStation({ ...doc, stations: stationsOut }, cell, opts.stationType ?? 'standard')
    stationsOut[st.id] = st
    created.push(st.id)
    return st
  }
  const a = place(startId, dense[0])
  const b = place(endId, dense[dense.length - 1])
  if (!a || !b || a.id === b.id) return null
  dense = pullEnd(dense, true, { x: a.x, y: a.y })
  dense = pullEnd(dense, false, { x: b.x, y: b.y })

  // the stroke in the order of the line (a drawn-towards-the-line stroke is turned around)
  const path = plan.reverse ? [...dense].reverse() : dense
  // a tram stroke that runs along streets follows them; one that leaves the streets (or lies outside the towns) stays as drawn
  const ctrl = (onStreets ? streetViaPoints(doc, plan.reverse ? b : a, plan.reverse ? a : b, { guide: path }) : null) ?? strokeControlPoints(path)

  let next: Line
  switch (plan.mode) {
    case 'create':
      next = { ...line, stations: [a.id, b.id], via: [ctrl, []], segs: [undefined as unknown as Pt[]] }
      break
    case 'append': {
      // a stroke that starts at the last station: `to` is the new end. Reversed: it was drawn towards the last station.
      const end = plan.reverse ? a : b
      const via = [...(line.via ?? [])]
      via[n - 1] = ctrl
      next = { ...line, stations: [...line.stations, end.id], via: [...via, []], segs: [...(line.segs ?? []), undefined as unknown as Pt[]] }
      break
    }
    case 'prepend': {
      const begin = plan.reverse ? b : a
      next = { ...line, stations: [begin.id, ...line.stations], via: [ctrl, ...(line.via ?? [])], segs: [undefined as unknown as Pt[], ...(line.segs ?? [])] }
      break
    }
    default: {
      const via = [...(line.via ?? [])]
      via[plan.k] = ctrl
      const segs = [...(line.segs ?? [])]
      segs[plan.k] = undefined as unknown as Pt[]
      next = { ...line, via, segs }
    }
  }
  let d: CityDoc = withLine({ ...doc, stations: stationsOut }, next)
  d = rerouteAt(d, lineId, plan.k)
  // after a prepend the new stretch is the first one
  return { doc: d, created, leg: plan.mode === 'prepend' ? 0 : plan.k }
}

/** The point at arc length `along` on a polyline. */
function pointAlong(pts: Pt[], along: number): Pt {
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i], pts[i + 1])
    if (acc + l >= along && l > 0) {
      const t = (along - acc) / l
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }
    }
    acc += l
  }
  return pts[pts.length - 1]
}

/** Which leg of a line is closest to p, and where. */
export function nearestLeg(doc: CityDoc, line: Line, p: Pt): { k: number; dist: number; along: number; point: Pt; length: number } | null {
  let best: { k: number; dist: number; along: number; point: Pt; length: number } | null = null
  for (let k = 0; k < line.stations.length - 1; k++) {
    const curve = legCurve(doc, line, k)
    if (curve.length < 2) continue
    const near = nearestOnCurve(curve, p)
    if (!best || near.dist < best.dist) best = { k, dist: near.dist, along: near.along, point: near.point, length: curveLength(curve) }
  }
  return best
}

/**
 * A new station on the curve of a line (tap on the line): the stretch is split at the nearest dry cell.
 * Returns null when the tap is not close enough, too near an end of the stretch or on water.
 */
export function splitLegAt(doc: CityDoc, lineId: string, p: Pt, maxDist: number, type: StationType = 'standard'): EditOutcome | null {
  const base = doc.lines[lineId]
  if (!base) return null
  const line = shape(base)
  const hit = nearestLeg(doc, line, p)
  if (!hit || hit.dist > maxDist) return null
  if (hit.along < 1 || hit.length - hit.along < 1) return null
  const cell = { x: Math.round(hit.point.x), y: Math.round(hit.point.y) }
  if (!freeLand(doc, cell.x, cell.y)) return null
  const st = newStation(doc, cell, type)
  const d = insertStationOnLeg({ ...doc, stations: { ...doc.stations, [st.id]: st } }, lineId, hit.k, hit.along, hit.length, st.id)
  return { doc: d, created: [st.id] }
}

/**
 * Put a station that already exists (in `doc.stations`) into stretch k of a line, `along` cells from the stretch's start.
 * The control points of the stretch are shared out between the two new stretches.
 */
function insertStationOnLeg(doc: CityDoc, lineId: string, k: number, along: number, length: number, stationId: string): CityDoc {
  const line = shape(doc.lines[lineId])
  const curve = legCurve(doc, line, k)
  const ctrl = line.via?.[k] ?? []
  const first: Pt[] = []
  const second: Pt[] = []
  for (const q of ctrl) (nearestOnCurve(curve, q).along < along ? first : second).push(q)
  // every stretch keeps at least one control point (an empty one would be routed by the machine)
  if (!first.length) first.push(roundPt(pointAlong(curve, along / 2)))
  if (!second.length) second.push(roundPt(pointAlong(curve, (along + length) / 2)))
  const stations = [...line.stations]
  stations.splice(k + 1, 0, stationId)
  const via = [...(line.via ?? [])]
  via.splice(k, 1, first, second)
  const segs = [...(line.segs ?? [])]
  segs.splice(k, 1, undefined as unknown as Pt[], undefined as unknown as Pt[])
  // the settings of later stretches move one place on; the new stretch takes over those of the one it was cut from
  let legs = line.legs
  if (legs) {
    const moved: NonNullable<Line['legs']> = {}
    for (const [key, v] of Object.entries(legs)) {
      const i = Number(key)
      if (i < k) moved[i] = v
      else if (i === k) {
        moved[i] = v
        moved[i + 1] = v
      } else moved[i + 1] = v
    }
    legs = moved
  }
  const d = withLine(doc, { ...line, stations, via, segs, legs })
  return rerouteAt(d, lineId, k)
}

/**
 * A new station where the player taps on a line (or on the spot where lines cross): the station joins every line of
 * the same kind (trams with trams) that runs through this spot and splits their stretches there.
 * Null when no line is close, the spot is too near a station or on water.
 */
export function addStationOnLines(doc: CityDoc, p: Pt, reach: number): EditOutcome | null {
  const hits: { lineId: string; k: number; dist: number; along: number; length: number; point: Pt }[] = []
  for (const l of Object.values(doc.lines)) {
    if (l.stations.length < 2) continue
    const h = nearestLeg(doc, shape(l), p)
    if (h && h.dist <= reach && h.along >= 1 && h.length - h.along >= 1) hits.push({ lineId: l.id, ...h })
  }
  if (!hits.length) return null
  hits.sort((a, b) => a.dist - b.dist)
  const best = hits[0]
  const tram = doc.lines[best.lineId].operator === 'tram'
  const cell = nearestFreeLand(doc, best.point, 1)
  if (!cell) return null
  const st = newStation(doc, cell, tram ? 'tramstop' : 'standard')
  let d: CityDoc = { ...doc, stations: { ...doc.stations, [st.id]: st } }
  let joined = 0
  for (const h of hits) {
    const line = doc.lines[h.lineId]
    if ((line.operator === 'tram') !== tram) continue
    // a line that passes the spot at a distance does not stop here
    const near = nearestLeg(doc, shape(line), cell)
    if (!near || near.dist > 1.3 || near.along < 1 || near.length - near.along < 1) continue
    d = insertStationOnLeg(d, h.lineId, near.k, near.along, near.length, st.id)
    joined++
  }
  return joined ? { doc: d, created: [st.id] } : null
}

/** The leg (of any line) closest to p within `maxDist` cells. */
export function nearestLegAny(doc: CityDoc, p: Pt, maxDist: number): { lineId: string; k: number; dist: number } | null {
  let best: { lineId: string; k: number; dist: number } | null = null
  for (const l of Object.values(doc.lines)) {
    if (l.stations.length < 2) continue
    const h = nearestLeg(doc, shape(l), p)
    if (h && h.dist <= maxDist && (!best || h.dist < best.dist)) best = { lineId: l.id, k: h.k, dist: h.dist }
  }
  return best
}

/**
 * Smooth one stretch of a line (between stations[k] and stations[k + 1]). Every call rounds it off a little more.
 * Null when there is nothing to smooth (a straight stretch).
 */
export function smoothLeg(doc: CityDoc, lineId: string, k: number, rounds = 1): CityDoc | null {
  const base = doc.lines[lineId]
  if (!base) return null
  const line = shape(base)
  if (k < 0 || k >= line.stations.length - 1) return null
  const ctrl = smoothLegPoints(legCurve(doc, line, k), rounds)
  if (!ctrl.length) return null
  const via = [...(line.via ?? [])]
  via[k] = ctrl.map(roundPt)
  return rerouteAt(withLine(doc, { ...line, via }), lineId, k)
}

/** Smooth every stretch of a line. */
export function smoothLine(doc: CityDoc, lineId: string, rounds = 1): CityDoc | null {
  const n = doc.lines[lineId]?.stations.length ?? 0
  let d: CityDoc | null = null
  for (let k = 0; k < n - 1; k++) d = smoothLeg(d ?? doc, lineId, k, rounds) ?? d
  return d
}

/** Throw away the waypoints of a stretch and lay it again (the way another line of its kind takes, or a fresh route). */
export function rebuildLeg(doc: CityDoc, lineId: string, k: number): CityDoc | null {
  const base = doc.lines[lineId]
  if (!base) return null
  const line = shape(base)
  if (k < 0 || k >= line.stations.length - 1) return null
  const via = [...(line.via ?? [])]
  via[k] = []
  const segs = [...(line.segs ?? [])]
  segs[k] = undefined as unknown as Pt[]
  return rerouteAt(withLine(doc, { ...line, via, segs }), lineId, k)
}

/** The settings of the stretches `from` .. `from + count - 1`, renumbered from 0 */
function sliceLegs(legs: Line['legs'], from: number, count: number): Line['legs'] {
  if (!legs) return undefined
  const out: NonNullable<Line['legs']> = {}
  for (const [key, v] of Object.entries(legs)) {
    const i = Number(key) - from
    if (i >= 0 && i < count) out[i] = v
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Remove a stretch with its waypoints. At an end of the line the line gets shorter (the station stays on the map);
 * in the middle the line is cut in two, the second part is a new line with the same colour and the name plus a letter.
 * Null when the line has only this one stretch (delete the line instead).
 */
export function removeLeg(doc: CityDoc, lineId: string, k: number): { doc: CityDoc; other?: string } | null {
  const base = doc.lines[lineId]
  if (!base) return null
  const line = shape(base)
  const n = line.stations.length
  if (k < 0 || k >= n - 1 || n < 3) return null
  const via = line.via ?? []
  const segs = line.segs ?? []
  const keep = (ids: string[]) => line.passes?.filter((id) => ids.includes(id))
  if (k === 0) {
    const stations = line.stations.slice(1)
    return { doc: withLine(doc, { ...line, stations, via: via.slice(1), segs: segs.slice(1), legs: sliceLegs(line.legs, 1, n - 2), passes: keep(stations) }) }
  }
  if (k === n - 2) {
    const stations = line.stations.slice(0, n - 1)
    const v = via.slice(0, n - 1)
    v[n - 2] = []
    return { doc: withLine(doc, { ...line, stations, via: v, segs: segs.slice(0, n - 2), legs: sliceLegs(line.legs, 0, n - 2), passes: keep(stations) }) }
  }
  const firstStations = line.stations.slice(0, k + 1)
  const secondStations = line.stations.slice(k + 1)
  const v1 = via.slice(0, k + 1)
  v1[k] = []
  const taken = new Set(Object.values(doc.lines).map((l) => l.name))
  let name = `${line.name}b`
  for (let c = 99; taken.has(name) && c < 123; c++) name = `${line.name}${String.fromCharCode(c)}`
  const other: Line = {
    ...line,
    id: newId(),
    name,
    stations: secondStations,
    via: via.slice(k + 1),
    segs: segs.slice(k + 1),
    legs: sliceLegs(line.legs, k + 1, n - k - 2),
    passes: keep(secondStations),
  }
  const first: Line = { ...line, stations: firstStations, via: v1, segs: segs.slice(0, k), legs: sliceLegs(line.legs, 0, k), passes: keep(firstStations) }
  return { doc: withLine(withLine(doc, first), other), other: other.id }
}

const roundPt = (p: Pt): Pt => ({ x: r2(p.x), y: r2(p.y) })

/**
 * Move a station. The curves of the lines that stop there follow like a rubber band: control points within `reach`
 * cells move along, fading with the distance. Returns the same document when the cell is not free dry land.
 */
export function moveStationTo(doc: CityDoc, id: string, x: number, y: number, reach = 8): CityDoc {
  const st = doc.stations[id]
  if (!st || (st.x === x && st.y === y)) return doc
  if (!freeLand(doc, x, y)) return doc
  const dx = x - st.x
  const dy = y - st.y
  const shift = (p: Pt): Pt => {
    const d = dist(p, st)
    if (d >= reach) return p
    const w = (1 - d / reach) ** 2
    return roundPt({ x: p.x + dx * w, y: p.y + dy * w })
  }
  // a rail stop that is moved onto the airport grounds becomes the airport station, and back
  // (an airport station placed by hand outside the grounds, as older cities have, stays one)
  const type = st.type === 'standard' || (st.type === 'airport' && onAirport(doc, st.x, st.y)) ? stationTypeAt(doc, x, y, st.type) : st.type
  let d: CityDoc = { ...doc, stations: { ...doc.stations, [id]: { ...st, x, y, type } } }
  for (const lineId of Object.keys(doc.lines)) {
    const line = doc.lines[lineId]
    if (!line.stations.includes(id)) continue
    const via = [...(line.via ?? [])]
    line.stations.forEach((sid, i) => {
      if (sid !== id) return
      for (const k of [i - 1, i]) if (via[k]) via[k] = via[k].map(shift)
    })
    d = withLine(d, { ...line, via })
  }
  for (const lineId of Object.keys(doc.lines)) {
    const line = d.lines[lineId]
    line.stations.forEach((sid, i) => {
      if (sid !== id) return
      for (const k of [i - 1, i]) if (k >= 0 && k < line.stations.length - 1) d = rerouteAt(d, lineId, k)
    })
  }
  return d
}
