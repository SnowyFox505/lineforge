import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc } from '../model/types'
import { viewsOf, buildRunPaths } from '../editor2d/trains2d'
import { layoutLines } from '../plan/layout'
import { bindNet, netFor, tickWorld, world } from './world'

function station(doc: CityDoc, id: string, x: number, y: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x, y, type: 'standard' } } }
}

function city(): CityDoc {
  let d = createCity('T', 'creative', 96)
  d = station(d, 'a', 20, 40)
  d = station(d, 'b', 50, 40)
  d = station(d, 'c', 80, 40)
  d = { ...d, lines: { L: { id: 'L', name: 'S1', operator: 'sbahn', color: '#0af', stations: [], via: [], segs: [] } } }
  for (const s of ['a', 'b', 'c']) d = appendStation(d, 'L', s)
  return d
}

describe('world simulation', () => {
  it('carries its trains over when the network is rebuilt', () => {
    const doc = city()
    bindNet(netFor(doc), doc.id)
    for (let i = 0; i < 400; i++) tickWorld(0.05)
    const before = world.sim!.trains.map((t) => ({ id: t.id, leg: t.leg, phase: t.phase }))
    // a changed document (same stations and lines) gives a new network object
    const doc2 = { ...doc }
    bindNet(netFor(doc2), doc2.id)
    const after = world.sim!.trains.map((t) => ({ id: t.id, leg: t.leg, phase: t.phase }))
    expect(world.sim!.net).toBe(netFor(doc2))
    expect(after).toEqual(before)
  })

  it('shows 2D and 3D the same state: every train of the sim appears on the map', () => {
    const doc = city()
    bindNet(netFor(doc), doc.id)
    for (let i = 0; i < 200; i++) tickWorld(0.05)
    const runs = buildRunPaths(doc, layoutLines(doc, 0.82, { source: 'geo' }))
    const views = viewsOf(world.sim!, runs)
    expect(views.length).toBe(world.sim!.trains.length)
    for (const v of views) {
      const tr = world.sim!.trains.find((t) => t.id === v.id)!
      expect(v.dir).toBe(tr.dir)
      expect(v.u).toBeGreaterThanOrEqual(0)
      expect(v.u).toBeLessThanOrEqual(1)
    }
  })
})
