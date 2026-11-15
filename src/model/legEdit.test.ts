import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { legCurve, lineCurve, minRadius, nearestOnCurve } from './geo'
import { addStationOnLines, applyStroke, nearestLegAny, rebuildLeg, removeLeg, smoothLeg, smoothLine } from './lineEdit'
import type { CityDoc, Pt } from './types'

function emptyLine(doc: CityDoc, id: string, operator: 'sbahn' | 'tram' = 'sbahn'): CityDoc {
  return { ...doc, lines: { ...doc.lines, [id]: { id, name: id, operator, color: '#fff', stations: [] } } }
}

const stroke = (f: (t: number) => Pt, n = 60): Pt[] => Array.from({ length: n }, (_, i) => f(i / (n - 1)))

/** a line L with three stations: a wobbly first stretch and a straight second one */
function threeStations(): CityDoc {
  let d = emptyLine(createCity('T', 'creative', 96), 'L')
  d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 40, y: 30 + Math.sin(t * 18) * 1.6 + Math.sin(t * Math.PI) * 6 })), { snap: 1.2 })!.doc
  const last = d.stations[d.lines.L.stations[1]]
  d = applyStroke(d, 'L', stroke((t) => ({ x: last.x + t * 30, y: last.y })), { snap: 1.2 })!.doc
  return d
}

const wobble = (pts: Pt[]) => {
  // total turning along the curve: smaller = smoother
  let sum = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x)
    const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
    let d = Math.abs(b - a)
    if (d > Math.PI) d = Math.PI * 2 - d
    sum += d
  }
  return sum
}

describe('smoothing a stretch', () => {
  it('takes the wobble out of a stretch, keeps its stations and leaves the other stretches alone', () => {
    const d = threeStations()
    const before = legCurve(d, d.lines.L, 0)
    const other = d.lines.L.via![1]
    const out = smoothLeg(d, 'L', 0)!
    expect(out).toBeTruthy()
    const after = legCurve(out, out.lines.L, 0)
    expect(wobble(after)).toBeLessThan(wobble(before))
    expect(out.lines.L.stations).toEqual(d.lines.L.stations)
    expect(out.lines.L.via![1]).toEqual(other)
    // the ends stay on their stations
    const a = out.stations[out.lines.L.stations[0]]
    expect(Math.hypot(after[0].x - a.x, after[0].y - a.y)).toBeLessThan(0.05)
    expect(minRadius(after)).toBeGreaterThan(1.5)
  })

  it('smooths more with every call, and a whole line at once', () => {
    let d = threeStations()
    const w0 = wobble(legCurve(d, d.lines.L, 0))
    d = smoothLeg(d, 'L', 0)!
    const w1 = wobble(legCurve(d, d.lines.L, 0))
    d = smoothLeg(d, 'L', 0, 2)!
    const w2 = wobble(legCurve(d, d.lines.L, 0))
    expect(w1).toBeLessThan(w0)
    expect(w2).toBeLessThanOrEqual(w1)
    expect(smoothLine(threeStations(), 'L')).toBeTruthy()
  })

  it('keeps a straight stretch straight and has nothing to do for an unknown one', () => {
    const d = threeStations()
    const out = smoothLeg(d, 'L', 1)
    if (out) expect(wobble(legCurve(out, out.lines.L, 1))).toBeLessThan(0.4)
    expect(smoothLeg(d, 'L', 7)).toBeNull()
    expect(smoothLeg(d, 'nope', 0)).toBeNull()
  })
})

describe('laying a stretch again', () => {
  it('drops the waypoints and routes it from scratch between the same stations', () => {
    const d = threeStations()
    const out = rebuildLeg(d, 'L', 0)!
    expect(out.lines.L.stations).toEqual(d.lines.L.stations)
    expect(out.lines.L.via![0].length).toBeGreaterThan(0)
    expect(out.lines.L.via![0]).not.toEqual(d.lines.L.via![0])
    const a = out.stations[out.lines.L.stations[0]]
    const b = out.stations[out.lines.L.stations[1]]
    const curve = legCurve(out, out.lines.L, 0)
    expect(Math.hypot(curve[0].x - a.x, curve[0].y - a.y)).toBeLessThan(0.05)
    expect(Math.hypot(curve[curve.length - 1].x - b.x, curve[curve.length - 1].y - b.y)).toBeLessThan(0.05)
  })
})

describe('removing a stretch', () => {
  it('shortens the line at an end and keeps the station on the map', () => {
    const d = threeStations()
    const [a, , c] = d.lines.L.stations
    const first = removeLeg(d, 'L', 0)!
    expect(first.doc.lines.L.stations).toEqual(d.lines.L.stations.slice(1))
    expect(first.doc.stations[a]).toBeTruthy()
    expect(first.doc.lines.L.via).toHaveLength(2)
    expect(first.doc.lines.L.via![0]).toEqual(d.lines.L.via![1])
    const last = removeLeg(d, 'L', 1)!
    expect(last.doc.lines.L.stations).toEqual(d.lines.L.stations.slice(0, 2))
    expect(last.doc.lines.L.via![1]).toEqual([])
    expect(last.doc.stations[c]).toBeTruthy()
  })

  it('cuts a line in two when the stretch is in the middle', () => {
    let d = threeStations()
    const last = d.stations[d.lines.L.stations[2]]
    d = applyStroke(d, 'L', stroke((t) => ({ x: last.x, y: last.y + t * 25 })), { snap: 1.2 })!.doc
    expect(d.lines.L.stations).toHaveLength(4)
    const out = removeLeg(d, 'L', 1)!
    expect(out.other).toBeTruthy()
    const second = out.doc.lines[out.other!]
    expect(out.doc.lines.L.stations).toEqual(d.lines.L.stations.slice(0, 2))
    expect(second.stations).toEqual(d.lines.L.stations.slice(2))
    expect(second.color).toBe(d.lines.L.color)
    expect(second.name).not.toBe('L')
    expect(second.via).toHaveLength(2)
    expect(second.via![0]).toEqual(d.lines.L.via![2])
    // both lines still have a curve
    expect(lineCurve(out.doc, out.doc.lines.L).pts.length).toBeGreaterThan(2)
    expect(lineCurve(out.doc, second).pts.length).toBeGreaterThan(2)
  })

  it('refuses when the line has only that stretch', () => {
    let d = emptyLine(createCity('T', 'creative', 96), 'L')
    d = applyStroke(d, 'L', stroke((t) => ({ x: 10 + t * 30, y: 30 })), { snap: 1.2 })!.doc
    expect(removeLeg(d, 'L', 0)).toBeNull()
  })
})

describe('a station by tapping on a line', () => {
  it('puts a station on the line that splits the stretch', () => {
    const d = threeStations()
    const on = nearestOnCurve(legCurve(d, d.lines.L, 0), { x: 30, y: 36 }).point
    const out = addStationOnLines(d, on, 1)!
    expect(out.created).toHaveLength(1)
    expect(out.doc.lines.L.stations).toHaveLength(4)
    expect(out.doc.lines.L.stations[1]).toBe(out.created[0])
    expect(out.doc.lines.L.via).toHaveLength(4)
    const st = out.doc.stations[out.created[0]]
    expect(nearestOnCurve(lineCurve(out.doc, out.doc.lines.L).pts, st).dist).toBeLessThan(0.6)
  })

  it('also joins a second line that crosses there', () => {
    let d = threeStations()
    // a second line straight through the middle of the first stretch
    const mid = nearestOnCurve(legCurve(d, d.lines.L, 0), { x: 30, y: 36 }).point
    d = emptyLine(d, 'M')
    d = applyStroke(d, 'M', stroke((t) => ({ x: Math.round(mid.x), y: Math.round(mid.y) - 14 + t * 28 })), { snap: 1.2 })!.doc
    const out = addStationOnLines(d, mid, 1.2)!
    expect(out.doc.lines.L.stations).toContain(out.created[0])
    expect(out.doc.lines.M.stations).toContain(out.created[0])
  })

  it('does not put a tram stop on a railway line and does nothing away from lines', () => {
    const d = threeStations()
    expect(addStationOnLines(d, { x: 30, y: 80 }, 1)).toBeNull()
    expect(nearestLegAny(d, { x: 30, y: 80 }, 1)).toBeNull()
    const near = nearestLegAny(d, nearestOnCurve(legCurve(d, d.lines.L, 1), { x: 65, y: 31 }).point, 1)!
    expect(near.lineId).toBe('L')
    expect(near.k).toBe(1)
  })
})
