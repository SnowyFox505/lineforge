import { describe, expect, it } from 'vitest'
import { createCity } from '../model/factory'
import { appendStation } from '../model/routing'
import type { CityDoc, OperatorId } from '../model/types'
import { buildNetwork3D } from './network3d'
import { deckPiers } from './Tracks3D'

function station(doc: CityDoc, id: string, x: number, y: number, levels?: number): CityDoc {
  return { ...doc, stations: { ...doc.stations, [id]: { id, name: id, x, y, type: 'standard', levels } } }
}
function line(doc: CityDoc, id: string, op: OperatorId, ids: string[]): CityDoc {
  let d: CityDoc = { ...doc, lines: { ...doc.lines, [id]: { id, name: id, operator: op, color: '#fff', stations: [], via: [], segs: [] } } }
  for (const s of ids) d = appendStation(d, id, s)
  return d
}

describe('pillars', () => {
  it('never stand on or next to tracks that run underneath (crossings outside stations)', () => {
    let d = createCity('T', 'creative', 160)
    for (const [id, x, y] of [['a', 20, 80], ['b', 140, 80], ['c', 80, 20], ['e', 80, 140]] as [string, number, number][]) d = station(d, id, x, y)
    d = line(d, 'H', 'sbahn', ['a', 'b'])
    d = line(d, 'V', 'regional', ['c', 'e'])
    const net = buildNetwork3D(d)
    let piers = 0
    for (const ln of net.lines) {
      const up = Math.max(...ln.cy) > 1
      if (!up) continue
      for (const br of [{ d0: 0, d1: ln.total }]) {
        for (const p of deckPiers(net, ln, br.d0, br.d1)) {
          piers++
          for (const other of net.lines) {
            if (other === ln) continue
            for (let j = 0; j < other.n; j++) {
              for (const [x, z] of [[other.fx[j], other.fz[j]], [other.bx[j], other.bz[j]]]) {
                expect(Math.hypot(x - p.x, z - p.z)).toBeGreaterThan(0.9)
              }
            }
          }
        }
      }
    }
    expect(piers).toBeGreaterThan(2)
  })

  it('keeps the supports of a raised station level off the tracks of the lower level', () => {
    let d = createCity('T', 'creative', 160)
    for (const [id, x, y] of [['a', 20, 80], ['x', 80, 80], ['b', 140, 80], ['c', 80, 20], ['e', 80, 140]] as [string, number, number][]) d = station(d, id, x, y, id === 'x' ? 2 : undefined)
    d = line(d, 'H', 'sbahn', ['a', 'x', 'b'])
    d = line(d, 'V', 'regional', ['c', 'x', 'e'])
    const net = buildNetwork3D(d)
    const g = net.stations.x.groups.find((gr) => gr.lift > 0.5)!
    expect(g).toBeTruthy()
    // sample the footprint: every spot that is blocked by a lower track must be reported as such
    let blocked = 0
    for (let lx = -g.layout.length / 2; lx <= g.layout.length / 2; lx += 0.5) {
      for (const lz of [-g.layout.halfWidth - 0.55, g.layout.halfWidth + 0.55]) {
        const wx = g.ox + g.ax * lx - g.az * lz
        const wz = g.oz + g.az * lx + g.ax * lz
        const hit = net.trackBelow(wx, wz, g.lift)
        if (hit) blocked++
      }
    }
    expect(blocked).toBeGreaterThan(0)
  })
})
