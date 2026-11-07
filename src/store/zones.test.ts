import { beforeEach, describe, expect, it } from 'vitest'
import { exportCityJson, importCityJson } from '../persistence/db'
import { useEditor } from './editorStore'

const S = () => useEditor.getState()
const painted = () => [...(S().doc.zoneGrid ?? [])].filter((v) => v).length

describe('areas (city, suburb, airport, districts)', () => {
  beforeEach(() => S().newCity('Gebiete', 'creative', 128))

  it('starts without any zones', () => {
    expect(S().doc.zones).toEqual([])
    expect(painted()).toBe(0)
  })

  it('paints a city zone and creates it on demand', () => {
    S().setTool('city')
    const id = S().beginZonePaint()
    expect(id).toBeGreaterThan(0)
    S().paintZone(40, 40, id)
    expect(painted()).toBeGreaterThan(0)
    expect(S().doc.zones).toHaveLength(1)
    expect(S().doc.zones![0].kind).toBe('city')
    expect(S().doc.zoneGrid![40 * 128 + 40]).toBe(id)
  })

  it('splits the city into named districts', () => {
    S().setTool('city')
    const a = S().beginZonePaint()
    S().paintZone(30, 30, a)
    const b = S().addZone('city') // a second district becomes the active one
    expect(b).not.toBe(a)
    S().paintZone(60, 60, b)
    S().renameZone(b, 'Altstadt')
    const zones = S().doc.zones!
    expect(zones.filter((z) => z.kind === 'city')).toHaveLength(2)
    expect(zones.find((z) => z.id === b)!.name).toBe('Altstadt')
    expect(S().doc.zoneGrid![30 * 128 + 30]).toBe(a)
    expect(S().doc.zoneGrid![60 * 128 + 60]).toBe(b)
  })

  it('uses a separate kind for suburb and airport', () => {
    S().setTool('suburb')
    const s = S().beginZonePaint()
    S().setTool('airport')
    const a = S().beginZonePaint()
    const kinds = Object.fromEntries(S().doc.zones!.map((z) => [z.id, z.kind]))
    expect(kinds[s]).toBe('suburb')
    expect(kinds[a]).toBe('airport')
    expect(S().doc.zones!.find((z) => z.id === a)!.name).toBe('Flughafen')
  })

  it('erases painted cells with the zone eraser', () => {
    S().setTool('city')
    const id = S().beginZonePaint()
    S().paintZone(40, 40, id)
    const n = painted()
    S().setTool('zoneErase')
    expect(S().beginZonePaint()).toBe(0)
    S().paintZone(40, 40, 0)
    expect(painted()).toBeLessThan(n)
  })

  it('removes a zone together with its cells and undoes it', () => {
    S().setTool('city')
    const id = S().beginZonePaint()
    S().paintZone(40, 40, id)
    S().removeZone(id)
    expect(S().doc.zones).toHaveLength(0)
    expect(painted()).toBe(0)
    S().undo()
    expect(S().doc.zones).toHaveLength(1)
    expect(painted()).toBeGreaterThan(0)
  })

  it('shifts areas and landmarks with the map when it grows', () => {
    S().setTool('city')
    const id = S().beginZonePaint()
    S().paintZone(10, 20, id)
    S().setPoiKind('landmark')
    const poi = S().addPoi(10, 20)!
    S().resizeMap(256)
    expect(S().doc.zoneGrid!.length).toBe(256 * 256)
    expect(S().doc.zoneGrid![(20 + 64) * 256 + 10 + 64]).toBe(id)
    const p = S().doc.pois!.find((q) => q.id === poi)!
    expect([p.x, p.y]).toEqual([74, 84])
  })

  it('survives an export/import round trip', () => {
    S().setTool('suburb')
    const id = S().beginZonePaint()
    S().paintZone(50, 50, id)
    S().renameZone(id, 'Waldheim')
    S().setPoiKind('stadium')
    S().addPoi(20, 30)
    const back = importCityJson(exportCityJson(S().doc))
    expect(back.zones).toEqual(S().doc.zones)
    expect(back.zoneGrid).toBeInstanceOf(Uint16Array)
    expect([...back.zoneGrid!]).toEqual([...S().doc.zoneGrid!])
    expect(back.pois).toEqual(S().doc.pois)
  })
})

describe('points of interest', () => {
  beforeEach(() => S().newCity('POI', 'creative', 128))

  it('places, edits and removes a landmark', () => {
    S().setPoiKind('stadium')
    const id = S().addPoi(30, 40)!
    expect(S().doc.pois).toHaveLength(1)
    expect(S().doc.pois![0].kind).toBe('stadium')
    expect(S().selectedPoiId).toBe(id)
    S().updatePoi(id, { name: 'Olympiastadion', kind: 'landmark' })
    expect(S().doc.pois![0]).toMatchObject({ name: 'Olympiastadion', kind: 'landmark', x: 30, y: 40 })
    S().removePoi(id)
    expect(S().doc.pois).toHaveLength(0)
    expect(S().selectedPoiId).toBeNull()
  })

  it('rejects markers outside the map', () => {
    expect(S().addPoi(-1, 5)).toBeNull()
    expect(S().addPoi(5, 128)).toBeNull()
    expect(S().doc.pois).toHaveLength(0)
  })

  it('numbers default names per kind', () => {
    S().setPoiKind('attraction')
    S().addPoi(1, 1)
    S().addPoi(2, 2)
    expect(S().doc.pois!.map((p) => p.name)).toEqual(['Attraktion 1', 'Attraktion 2'])
  })
})
