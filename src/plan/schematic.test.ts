import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc, Pt } from '../model/types'
import { schematize } from './schematic'

function city(): CityDoc {
  return createCity('T', 'creative', 120)
}

function station(doc: CityDoc, id: string, x: number, y: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x: Math.round(x), y: Math.round(y), type: 'standard' } } }
}

function line(doc: CityDoc, id: string, ids: string[]): CityDoc {
  let d: CityDoc = { ...doc, lines: { ...doc.lines, [id]: { id, name: id, operator: 'sbahn', color: '#fff', stations: [] } } }
  for (const s of ids) d = appendStation(d, id, s)
  return d
}

/** a ring of 12 stations with 6 radial lines of 3 stations each, like a small Berlin */
function berlinish(): CityDoc {
  let d = city()
  const ring: string[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    d = station(d, `r${i}`, 60 + Math.cos(a) * 22, 60 + Math.sin(a) * 18)
    ring.push(`r${i}`)
  }
  d = line(d, 'ring', [...ring, 'r0'])
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.2
    const ids = [`r${(k * 2) % 12}`]
    for (let j = 1; j <= 3; j++) {
      const id = `s${k}_${j}`
      d = station(d, id, 60 + Math.cos(a) * (22 + j * 12), 60 + Math.sin(a) * (18 + j * 10))
      ids.push(id)
    }
    d = line(d, `L${k}`, ids)
  }
  return d
}

const edgesOf = (d: CityDoc) => {
  const seen = new Set<string>()
  const out: [string, string][] = []
  for (const l of Object.values(d.lines)) {
    for (let i = 0; i + 1 < l.stations.length; i++) {
      const [a, b] = [l.stations[i], l.stations[i + 1]]
      const k = [a, b].sort().join('|')
      if (a === b || seen.has(k)) continue
      seen.add(k)
      out.push([a, b])
    }
  }
  return out
}

const octilinear = (a: Pt, b: Pt) => {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  return dx === 0 || dy === 0 || dx === dy
}

describe('network plan', () => {
  it('draws almost every connection at 0/45/90 degrees and keeps the stations apart', () => {
    const d = berlinish()
    const sch = schematize(d)
    const edges = edgesOf(d)
    const ok = edges.filter(([a, b]) => octilinear(sch.pos[a], sch.pos[b])).length
    expect(ok / edges.length).toBeGreaterThan(0.8)
    const ids = Object.keys(sch.pos)
    let minSep = Infinity
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) minSep = Math.min(minSep, Math.hypot(sch.pos[ids[i]].x - sch.pos[ids[j]].x, sch.pos[ids[i]].y - sch.pos[ids[j]].y))
    expect(minSep).toBeGreaterThanOrEqual(2)
    // every route of the plan document is octilinear and joins its stations
    for (const l of Object.values(sch.doc.lines)) {
      for (const seg of l.segs ?? []) for (let i = 0; i + 1 < seg.length; i++) expect(octilinear(seg[i], seg[i + 1])).toBe(true)
    }
  })

  it('keeps the connections pointing the way they do on the map', () => {
    const d = berlinish()
    const sch = schematize(d)
    let bad = 0
    const edges = edgesOf(d)
    for (const [a, b] of edges) {
      const g = Math.atan2(d.stations[b].y - d.stations[a].y, d.stations[b].x - d.stations[a].x)
      const p = Math.atan2(sch.pos[b].y - sch.pos[a].y, sch.pos[b].x - sch.pos[a].x)
      let diff = Math.abs(g - p)
      if (diff > Math.PI) diff = Math.PI * 2 - diff
      if (diff > (Math.PI / 4) * 1.5) bad++
    }
    expect(bad / edges.length).toBeLessThan(0.1)
  })

  it('gives the same plan every time and does not take long', () => {
    const d = berlinish()
    const t0 = Date.now()
    const a = schematize(d)
    const ms = Date.now() - t0
    const b = schematize(d)
    expect(b.pos).toEqual(a.pos)
    expect(ms).toBeLessThan(1500)
  })

  it('leaves a pinned station where it was put and arranges the others around it', () => {
    const d = berlinish()
    const free = schematize(d)
    const pin = { x: free.pos.r3.x + 6, y: free.pos.r3.y - 5 }
    const pinned = { ...d, stations: { ...d.stations, r3: { ...d.stations.r3, planPin: pin } } }
    const sch = schematize(pinned)
    expect(sch.pos.r3).toEqual(pin)
    expect(Object.keys(sch.pos)).toHaveLength(Object.keys(free.pos).length)
  })

  it('handles empty and tiny networks', () => {
    expect(() => schematize(city())).not.toThrow()
    let d = station(station(city(), 'a', 10, 10), 'b', 40, 25)
    d = line(d, 'L', ['a', 'b'])
    const sch = schematize(d)
    expect(Object.keys(sch.doc.stations)).toHaveLength(2)
    expect(sch.doc.lines.L.segs![0].length).toBeGreaterThanOrEqual(2)
  })
})
