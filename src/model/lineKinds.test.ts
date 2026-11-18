import { describe, expect, it } from 'vitest'
import { createCity } from './factory'
import { lineCurve } from './geo'
import { branchIsBare, endExpress, expressStops, flipBranch, makeBranch, makeBranchBetween, makeExpress } from './lineKinds'
import { appendStation } from './routing'
import { stopIds } from './stops'
import type { CityDoc } from './types'

/** a straight line S with six stations; the first two are close together, so the longer part lies beyond the third station */
function straight(): CityDoc {
  let d = createCity('T', 'creative', 96)
  const xs = [10, 14, 30, 50, 70, 85]
  const stations = { ...d.stations }
  xs.forEach((x, i) => {
    stations[`s${i}`] = { id: `s${i}`, name: `St${i}`, x, y: 40, type: 'standard' }
  })
  d = { ...d, stations, lines: { ...d.lines, S: { id: 'S', name: 'S3', operator: 'sbahn', color: '#0a0', stations: [] } } }
  for (let i = 0; i < xs.length; i++) d = appendStation(d, 'S', `s${i}`)
  return d
}

describe('express lines', () => {
  it('runs through the unimportant stations and stops at the ends and where another line calls', () => {
    let d = straight()
    // a second line calls at s3 (an interchange)
    d = { ...d, lines: { ...d.lines, M: { id: 'M', name: 'S4', operator: 'sbahn', color: '#00f', stations: [] } } }
    d = appendStation(appendStation(d, 'M', 's3'), 'M', 's4')
    expect([...expressStops(d, d.lines.S)].sort()).toEqual(['s0', 's3', 's4', 's5'])
    const ex = makeExpress(d, 'S')!
    expect(ex.lines.S.express).toBe(true)
    expect([...ex.lines.S.passes!].sort()).toEqual(['s1', 's2'])
    expect(stopIds(ex.lines.S)).toEqual(['s0', 's3', 's4', 's5'])
    const back = endExpress(ex, 'S')!
    expect(back.lines.S.express).toBeUndefined()
    expect(back.lines.S.passes).toBeUndefined()
  })

  it('keeps the main station and the airport', () => {
    let d = straight()
    d = { ...d, stations: { ...d.stations, s2: { ...d.stations.s2, type: 'hauptbahnhof' } } }
    expect(expressStops(d, d.lines.S).has('s2')).toBe(true)
  })

  it('does nothing for a line without anything to skip', () => {
    let d = createCity('T', 'creative', 96)
    d = { ...d, stations: { a: { id: 'a', name: 'A', x: 10, y: 10, type: 'standard' }, b: { id: 'b', name: 'B', x: 30, y: 10, type: 'standard' } }, lines: { L: { id: 'L', name: 'S1', operator: 'sbahn', color: '#f00', stations: [] } } }
    d = appendStation(appendStation(d, 'L', 'a'), 'L', 'b')
    expect(makeExpress(d, 'L')).toBeNull()
  })
})

describe('Auslaeufer (branches)', () => {
  it('follows the longer part of the parent up to the station and is named parent + digit', () => {
    const d = straight()
    const out = makeBranch(d, 'S', 's2')!
    const b = out.doc.lines[out.lineId]
    expect(b.name).toBe('S30')
    expect(b.color).toBe('#0a0')
    expect(b.operator).toBe('sbahn')
    // s2 lies at x = 30: the part towards the end (x up to 85) is the longer one, so the branch comes from there
    expect(b.branch).toEqual({ parent: 'S', at: 's2', towards: 'end' })
    expect(b.stations).toEqual(['s5', 's4', 's3', 's2'])
    expect(b.via).toHaveLength(4)
    expect(b.via![3]).toEqual([])
    // the curve starts at the far end and ends at the branching station
    const c = lineCurve(out.doc, b).pts
    expect(c[0].x).toBeGreaterThan(80)
    expect(Math.abs(c[c.length - 1].x - 30)).toBeLessThan(0.1)
    // the parent is untouched
    expect(out.doc.lines.S.stations).toEqual(d.lines.S.stations)
  })

  it('counts up the digits and runs out after ten branches', () => {
    let d = straight()
    const names: string[] = []
    for (let i = 0; i < 10; i++) {
      const out = makeBranch(d, 'S', 's2')!
      d = out.doc
      names.push(d.lines[out.lineId].name)
    }
    expect(names).toEqual(['S30', 'S31', 'S32', 'S33', 'S34', 'S35', 'S36', 'S37', 'S38', 'S39'])
    expect(makeBranch(d, 'S', 's2')).toBeNull()
  })

  it('needs an inner station that the line calls at, and no branch of a branch', () => {
    const d = straight()
    expect(makeBranch(d, 'S', 's0')).toBeNull()
    expect(makeBranch(d, 'S', 's5')).toBeNull()
    const passing = { ...d, lines: { ...d.lines, S: { ...d.lines.S, passes: ['s2'] } } }
    expect(makeBranch(passing, 'S', 's2')).toBeNull()
    const out = makeBranch(d, 'S', 's2')!
    expect(makeBranch(out.doc, out.lineId, 's4')).toBeNull()
  })

  it('can take the other side while it is bare', () => {
    const d = straight()
    const out = makeBranch(d, 'S', 's2')!
    expect(branchIsBare(out.doc, out.doc.lines[out.lineId])).toBe(true)
    const flipped = flipBranch(out.doc, out.lineId)!
    const b = flipped.lines[out.lineId]
    expect(b.stations).toEqual(['s0', 's1', 's2'])
    expect(b.branch!.towards).toBe('start')
    expect(b.name).toBe('S30')
    // and back again
    const again = flipBranch(flipped, out.lineId)!
    expect(again.lines[out.lineId].stations).toEqual(['s5', 's4', 's3', 's2'])
    // once something is added, it can no longer be turned
    const longer = { ...out.doc, lines: { ...out.doc.lines, [out.lineId]: { ...out.doc.lines[out.lineId], stations: [...out.doc.lines[out.lineId].stations, 's1'] } } }
    expect(branchIsBare(longer, longer.lines[out.lineId])).toBe(false)
    expect(flipBranch(longer, out.lineId)).toBeNull()
  })
})

describe('Auslaeufer between two stations', () => {
  it('runs the stretch of its parent between the two stations and ends at the second one', () => {
    const d = straight()
    const out = makeBranchBetween(d, 'S', 's1', 's4')!
    const b = out.doc.lines[out.lineId]
    expect(b.name).toBe('S30')
    expect(b.color).toBe('#0a0')
    expect(b.stations).toEqual(['s1', 's2', 's3', 's4'])
    expect(b.branch).toEqual({ parent: 'S', at: 's4', from: 's1', towards: 'end' })
    expect(b.via).toHaveLength(4)
    // on that stretch both lines have the same control points, so they run on one curve
    expect(b.via!.slice(0, 3)).toEqual(d.lines.S.via!.slice(1, 4))
    expect(out.doc.lines.S.stations).toEqual(d.lines.S.stations)
    expect(branchIsBare(out.doc, b)).toBe(true)
  })

  it('turns the stretch around when the first station lies later on the parent', () => {
    const d = straight()
    const out = makeBranchBetween(d, 'S', 's4', 's1')!
    const b = out.doc.lines[out.lineId]
    expect(b.stations).toEqual(['s4', 's3', 's2', 's1'])
    const c = lineCurve(out.doc, b).pts
    expect(Math.abs(c[0].x - 70)).toBeLessThan(0.1)
    expect(Math.abs(c[c.length - 1].x - 14)).toBeLessThan(0.1)
  })

  it('may start or end at an end of the parent, but needs two different stations the parent calls at', () => {
    const d = straight()
    expect(makeBranchBetween(d, 'S', 's0', 's3')).toBeTruthy()
    expect(makeBranchBetween(d, 'S', 's2', 's5')).toBeTruthy()
    expect(makeBranchBetween(d, 'S', 's2', 's2')).toBeNull()
    expect(makeBranchBetween(d, 'S', 's2', 'nowhere')).toBeNull()
    const passing = { ...d, lines: { ...d.lines, S: { ...d.lines.S, passes: ['s2'] } } }
    expect(makeBranchBetween(passing, 'S', 's2', 's4')).toBeNull()
    const out = makeBranchBetween(d, 'S', 's1', 's3')!
    expect(makeBranchBetween(out.doc, out.lineId, 's1', 's2')).toBeNull()
  })

  it('has no other side to flip to', () => {
    const out = makeBranchBetween(straight(), 'S', 's1', 's4')!
    expect(flipBranch(out.doc, out.lineId)).toBeNull()
  })
})
