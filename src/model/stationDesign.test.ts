import { describe, expect, it } from 'vitest'
import { buildField, findBridges, makeSampler } from './terrainField'
import { layoutStation, resolveDesign, trackFor, TRACK_OFFSET } from './stationDesign'
import { WATER } from './types'
import type { Station } from './types'

const st = (type: Station['type'], design?: Station['design']): Station => ({ id: 'x', name: 'X', x: 5, y: 5, type, design })

describe('station design', () => {
  it('has sensible defaults per station type and respects overrides', () => {
    expect(resolveDesign(st('standard'), ['sbahn']).tracks).toBe(2)
    expect(resolveDesign(st('hauptbahnhof'), ['sbahn']).roof).toBe('hall')
    const d = resolveDesign(st('standard', { tracks: 5, roof: 'glass' }), ['ubahn'])
    expect(d.tracks).toBe(5)
    expect(d.roof).toBe('glass')
    expect(d.trackOps).toHaveLength(5)
    expect(d.trackOps[0]).toEqual(['ubahn'])
  })

  it('lays out island platforms between track pairs and keeps the layout centred', () => {
    const l = layoutStation(resolveDesign(st('standard', { tracks: 4, platform: 'island' }), ['sbahn']))
    expect(l.tracks).toHaveLength(4)
    expect(l.platforms).toHaveLength(2)
    const zs = l.tracks.map((t) => t.z)
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 5)
    // a platform lies between the two tracks of its pair
    expect(l.platforms[0].z0).toBeGreaterThan(zs[0])
    expect(l.platforms[0].z1).toBeLessThan(zs[1])
  })

  it('puts side platforms outside the outermost tracks', () => {
    const l = layoutStation(resolveDesign(st('standard', { tracks: 2, platform: 'side' }), ['sbahn']))
    expect(l.platforms).toHaveLength(2)
    expect(l.tracks.map((t) => t.z)).toEqual([-TRACK_OFFSET, TRACK_OFFSET])
    expect(l.platforms[0].z1).toBeLessThan(-TRACK_OFFSET)
    expect(l.platforms[1].z0).toBeGreaterThan(TRACK_OFFSET)
  })

  it('sends a train to a track that allows its operator, on its own side', () => {
    const l = layoutStation(resolveDesign(st('standard', { tracks: 4, platform: 'island', trackOps: [['sbahn'], ['ubahn'], ['ubahn'], ['sbahn']] }), ['sbahn', 'ubahn']))
    const fwd = trackFor(l, 'ubahn', 1)
    const back = trackFor(l, 'ubahn', -1)
    expect(fwd).toBeGreaterThan(0)
    expect(back).toBeLessThan(0)
    const tracks = l.tracks
    expect(tracks.find((t) => t.z === fwd)!.ops).toContain('ubahn')
  })
})

describe('bridges', () => {
  it('finds a bridge where a track crosses a river and none on dry land', () => {
    const size = 40
    const t = new Uint8Array(size * size)
    for (let y = 0; y < size; y++) for (let x = 18; x <= 21; x++) t[y * size + x] = WATER
    const sample = makeSampler(buildField(t, size), size)
    const crossing = findBridges([{ x: 5, y: 20 }, { x: 35, y: 20 }], sample)
    expect(crossing).toHaveLength(1)
    expect(crossing[0].length).toBeGreaterThan(3)
    expect(crossing[0].length).toBeLessThan(9)
    expect(findBridges([{ x: 2, y: 20 }, { x: 12, y: 20 }], sample)).toHaveLength(0)
  })
})
