import { describe, expect, it } from 'vitest'
import { layoutLines } from '../plan/layout'
import { createCity } from './factory'
import { legCurve, lineCurve, mergeCorridors, migrateGeo, minRadius, MIN_RADIUS, nearestOnCurve, smoothStroke, splineThrough } from './geo'
import { applyStroke, moveStationTo, splitLegAt } from './lineEdit'
import { appendStation, withRoutes } from './routing'
import { WATER } from './types'
import type { CityDoc, Pt } from './types'

function city(): CityDoc {
  return createCity('T', 'creative', 96)
}

function addStation(doc: CityDoc, id: string, x: number, y: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x, y, type: 'standard' } } }
}

function emptyLine(doc: CityDoc, id: string): CityDoc {
  return { ...doc, lines: { ...doc.lines, [id]: { id, name: id, operator: 'sbahn', color: '#fff', stations: [] } } }
}

/** a stroke of `n` points along a function, like a finger would draw it */
function stroke(f: (t: number) => Pt, n = 60): Pt[] {
  return Array.from({ length: n }, (_, i) => f(i / (n - 1)))
}

const through = (doc: CityDoc, lineId: string, p: Pt, tol = 0.05) => {
  const line = doc.lines[lineId]
  return nearestOnCurve(lineCurve(doc, line).pts, p).dist < tol
}

describe('geo: curves', () => {
  it('runs a smooth curve through every control point and starts and ends on the stations', () => {
    const ctrl = [{ x: 0, y: 0 }, { x: 10, y: 4 }, { x: 20, y: 0 }, { x: 30, y: -6 }]
    const { pts, at } = splineThrough(ctrl)
    ctrl.forEach((c, i) => expect(Math.hypot(pts[at[i]].x - c.x, pts[at[i]].y - c.y)).toBeLessThan(0.01))
    // even sampling: no gap larger than the step
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeLessThan(0.7)
  })

  it('gives one curve per line with the stations in order', () => {
    let d = city()
    d = addStation(d, 'a', 10, 10)
    d = addStation(d, 'b', 40, 10)
    d = addStation(d, 'c', 60, 30)
    d = emptyLine(d, 'L')
    for (const id of ['a', 'b', 'c']) d = appendStation(d, 'L', id)
    const c = lineCurve(d, d.lines.L)
    expect(c.legStart).toHaveLength(3)
    expect(c.pts[c.legStart[0]]).toEqual({ x: 10, y: 10 })
    expect(c.pts[c.legStart[1]]).toEqual({ x: 40, y: 10 })
    expect(c.pts[c.legStart[2]]).toEqual({ x: 60, y: 30 })
    expect(legCurve(d, d.lines.L, 0)[0]).toEqual({ x: 10, y: 10 })
    expect(legCurve(d, d.lines.L, 1).at(-1)).toEqual({ x: 60, y: 30 })
  })
})

describe('geo: strokes', () => {
  it('evens out tremor and widens bends tighter than the minimum radius', () => {
    const wobbly = stroke((t) => ({ x: 10 + t * 30, y: 20 + Math.sin(t * 60) * 0.4 + (t > 0.5 ? (t - 0.5) * 8 : 0) }), 120)
    const smooth = smoothStroke(wobbly)
    expect(minRadius(smooth)).toBeGreaterThanOrEqual(MIN_RADIUS - 0.05)
    // the ends stay where they were drawn
    expect(Math.hypot(smooth[0].x - wobbly[0].x, smooth[0].y - wobbly[0].y)).toBeLessThan(0.1)
  })

  it('a first stroke makes a line with two new stations that lie exactly on its curve', () => {
    let d = emptyLine(city(), 'L')
    const out = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 40, y: 30 + Math.sin(t * Math.PI) * 8 })), { snap: 1.2 })!
    expect(out).toBeTruthy()
    d = out.doc
    expect(out.created).toHaveLength(2)
    expect(d.lines.L.stations).toHaveLength(2)
    for (const id of d.lines.L.stations) {
      const st = d.stations[id]
      expect(Number.isInteger(st.x) && Number.isInteger(st.y)).toBe(true)
      expect(through(d, 'L', st)).toBe(true)
    }
    // the curve bulges like the stroke did (it is not the straight line between the stations)
    const mid = nearestOnCurve(lineCurve(d, d.lines.L).pts, { x: 30, y: 38 })
    expect(mid.dist).toBeLessThan(1)
    // the machine route for plan and 3D exists as well
    expect(d.lines.L.segs![0].length).toBeGreaterThanOrEqual(2)
  })

  it('a stroke from the last station extends the line, also when it is drawn towards that station', () => {
    let d = emptyLine(city(), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 30, y: 30 })), { snap: 1.2 })!.doc
    const last = d.stations[d.lines.L.stations[1]]
    const forward = applyStroke(d, 'L', stroke((t) => ({ x: last.x + t * 25, y: last.y + t * 10 })), { snap: 1.2 })!
    expect(forward.doc.lines.L.stations).toHaveLength(3)
    expect(forward.doc.lines.L.stations[1]).toBe(last.id)
    const nw = forward.doc.stations[forward.doc.lines.L.stations[2]]
    const back = applyStroke(d, 'L', stroke((t) => ({ x: nw.x - t * 25, y: nw.y - t * 10 })), { snap: 1.2 })!
    expect(back.doc.lines.L.stations).toHaveLength(3)
    expect(back.doc.lines.L.stations[1]).toBe(last.id)
  })

  it('a stroke into the first station gives the line a new beginning', () => {
    let d = emptyLine(city(), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 30 + t * 30, y: 30 })), { snap: 1.2 })!.doc
    const first = d.stations[d.lines.L.stations[0]]
    const out = applyStroke(d, 'L', stroke((t) => ({ x: first.x - 25 + t * 25, y: first.y - 10 + t * 10 })), { snap: 1.2 })!
    expect(out.doc.lines.L.stations).toHaveLength(3)
    expect(out.doc.lines.L.stations[1]).toBe(first.id)
    expect(out.doc.lines.L.via).toHaveLength(3)
  })

  it('a stroke between two neighbouring stations redraws that stretch only', () => {
    let d = emptyLine(city(), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 30, y: 30 })), { snap: 1.2 })!.doc
    const m = d.stations[d.lines.L.stations[1]]
    d = applyStroke(d, 'L', stroke((t) => ({ x: m.x + t * 30, y: m.y })), { snap: 1.2 })!.doc
    const [a, b, c] = d.lines.L.stations.map((id) => d.stations[id])
    const via0 = d.lines.L.via![0]
    const out = applyStroke(d, 'L', stroke((t) => ({ x: b.x + (c.x - b.x) * t, y: b.y + Math.sin(t * Math.PI) * 10 })), { snap: 1.2 })!
    expect(out.created).toHaveLength(0)
    expect(out.doc.lines.L.stations).toEqual(d.lines.L.stations)
    expect(out.doc.lines.L.via![0]).toEqual(via0)
    expect(through(out.doc, 'L', { x: (b.x + c.x) / 2, y: b.y + 10 }, 1.2)).toBe(true)
    void a
  })

  it('does not accept a stroke that touches the line nowhere, or one ending in the sea', () => {
    let d = emptyLine(city(), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 30, y: 30 })), { snap: 1.2 })!.doc
    expect(applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 30, y: 70 })), { snap: 1.2 })).toBeNull()
    const terrain = new Uint8Array(d.terrain)
    for (let y = 0; y < 96; y++) for (let x = 60; x < 96; x++) terrain[y * 96 + x] = WATER
    const sea = { ...d, terrain }
    const last = sea.stations[sea.lines.L.stations[1]]
    expect(applyStroke(sea, 'L', stroke((t) => ({ x: last.x + t * 40, y: last.y })), { snap: 1.2 })).toBeNull()
  })

  it('a stroke along another line takes over its points (shared corridor)', () => {
    let d = emptyLine(emptyLine(city(), 'A'), 'B')
    d = applyStroke(d, 'A', stroke((t) => ({ x: 10 + t * 60, y: 40 + Math.sin(t * 4) * 5 }), 200), { snap: 1.2 })!.doc
    const start = d.stations[d.lines.A.stations[0]]
    // B leaves from A's first station, runs 0.4 cells beside A for a while and then away
    const a = lineCurve(d, d.lines.A).pts
    const raw = [
      { x: start.x, y: start.y },
      ...a.slice(10, 70).map((p) => ({ x: p.x, y: p.y + 0.4 })),
      { x: a[70].x + 8, y: a[70].y - 12 },
    ]
    const out = applyStroke(d, 'B', raw, { snap: 1.2 })!
    expect(out).toBeTruthy()
    const merged = mergeCorridors({ A: lineCurve(out.doc, out.doc.lines.A).pts, B: lineCurve(out.doc, out.doc.lines.B).pts })
    const sameAsA = merged.B.filter((p) => merged.A.some((q) => q.x === p.x && q.y === p.y)).length
    expect(sameAsA).toBeGreaterThan(20)
  })
})

describe('geo: crossings are not shared stretches', () => {
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5)
    return Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }))
  }
  const shared = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => b.filter((p) => a.some((q) => q.x === p.x && q.y === p.y)).length

  it('two lines crossing at 45, 20 or 90 degrees keep their own points', () => {
    const a = line(10, 40, 70, 40)
    for (const deg of [20, 45, 90]) {
      const r = (deg * Math.PI) / 180
      const b = line(40 - 25 * Math.cos(r), 40 - 25 * Math.sin(r), 40 + 25 * Math.cos(r), 40 + 25 * Math.sin(r))
      const merged = mergeCorridors({ A: a, B: b }, 1.0)
      expect(shared(merged.A, merged.B), `${deg} degrees`).toBeLessThanOrEqual(1)
    }
  })

  it('lines that really run side by side and then part still share the stretch', () => {
    const a = line(10, 40, 70, 40)
    const b = [...line(10, 40.4, 40, 40.4), ...line(40.5, 40.7, 60, 55)]
    const merged = mergeCorridors({ A: a, B: b }, 1.0)
    expect(shared(merged.A, merged.B)).toBeGreaterThan(20)
  })
})

describe('geo: editing', () => {
  it('a station set on the curve splits the stretch and keeps the shape', () => {
    let d = emptyLine(city(), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 50, y: 40 + Math.sin(t * Math.PI) * 10 })), { snap: 1.2 })!.doc
    const before = lineCurve(d, d.lines.L).pts
    const p = before[Math.floor(before.length / 2)]
    const out = splitLegAt(d, 'L', p, 1)!
    expect(out).toBeTruthy()
    expect(out.doc.lines.L.stations).toHaveLength(3)
    expect(out.doc.lines.L.via!.slice(0, 2).every((v) => v.length >= 1)).toBe(true)
    const st = out.doc.stations[out.created[0]]
    expect(out.doc.lines.L.stations[1]).toBe(st.id)
    // still the same shape: every old sample is near the new curve
    const after = lineCurve(out.doc, out.doc.lines.L).pts
    for (let i = 0; i < before.length; i += 10) expect(nearestOnCurve(after, before[i]).dist).toBeLessThan(1)
    // no station next to an end of the stretch
    expect(splitLegAt(d, 'L', before[1], 1)).toBeNull()
  })

  it('moves a station and the curves around it follow, the rest stays', () => {
    let d = emptyLine(city(), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 60, y: 40 })), { snap: 1.2 })!.doc
    d = splitLegAt(d, 'L', { x: 40, y: 40 }, 1)!.doc
    const mid = d.stations[d.lines.L.stations[1]]
    const far = d.stations[d.lines.L.stations[2]]
    const moved = moveStationTo(d, mid.id, mid.x, mid.y + 6)
    expect(moved.stations[mid.id].y).toBe(mid.y + 6)
    expect(moved.stations[far.id]).toEqual(far)
    expect(through(moved, 'L', { x: mid.x, y: mid.y + 6 })).toBe(true)
    // onto another station: refused
    expect(moveStationTo(d, mid.id, far.x, far.y)).toBe(d)
  })
})

describe('geo: old documents', () => {
  it('takes over the shape of octilinear routes once and then leaves the document alone', () => {
    let d = city()
    d = { ...d, geoV: undefined }
    d = addStation(d, 'a', 10, 10)
    d = addStation(d, 'b', 50, 10)
    d = addStation(d, 'c', 70, 40)
    d = { ...d, lines: { L: { id: 'L', name: 'L', operator: 'sbahn', color: '#fff', stations: ['a', 'b', 'c'] } } }
    d = withRoutes(d)
    const m = migrateGeo({ ...d, geoV: undefined })
    expect(m.geoV).toBe(1)
    expect(m.lines.L.stations).toEqual(['a', 'b', 'c'])
    expect(m.lines.L.via!.slice(0, 2).every((v) => v.length >= 1)).toBe(true)
    // the curve stays close to the old route (rounded bends)
    const curve = lineCurve(m, m.lines.L).pts
    for (const seg of d.lines.L.segs!) for (const p of seg) expect(nearestOnCurve(curve, p).dist).toBeLessThan(2.2)
    expect(migrateGeo(m)).toBe(m)
  })
})

describe('geo: bundles', () => {
  it('lines on the same corridor run side by side, a lone line stays in the middle', () => {
    let d = emptyLine(emptyLine(city(), 'A'), 'B')
    d = applyStroke(d, 'A', stroke((t) => ({ x: 10 + t * 70, y: 40 + Math.sin(t * 3) * 6 }), 200), { snap: 1.2 })!.doc
    const a = lineCurve(d, d.lines.A).pts
    const first = d.stations[d.lines.A.stations[0]]
    // B follows A exactly for a stretch
    const raw = [{ x: first.x, y: first.y }, ...a.slice(2, 120).map((p) => ({ x: p.x, y: p.y })), { x: a[120].x + 10, y: a[120].y + 14 }]
    d = applyStroke(d, 'B', raw, { snap: 1.2 })!.doc
    const lay = layoutLines(d, 0.8, { source: 'geo' })
    expect(lay.A.length).toBeGreaterThan(10)
    expect(lay.B.length).toBeGreaterThan(10)
    // somewhere along the shared stretch the two are about a lane width apart
    let apart = 0
    for (const p of lay.A.slice(40, 140)) apart = Math.max(apart, 0) || nearestOnCurve(lay.B, p).dist
    const gaps = lay.A.slice(40, 100).map((p) => nearestOnCurve(lay.B, p).dist)
    expect(Math.min(...gaps)).toBeGreaterThan(0.6)
    expect(Math.max(...gaps)).toBeLessThan(1.2)
    void apart
  })
})
