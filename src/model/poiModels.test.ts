import { describe, expect, it } from 'vitest'
import { poiModel, POI_FOOTPRINT, POI_MODELS } from './poi'

describe('point of interest models', () => {
  it('gives every model a footprint', () => {
    for (const list of Object.values(POI_MODELS)) for (const m of list) expect(POI_FOOTPRINT[m.id]).toBeGreaterThan(0)
  })

  it('offers the town landmarks as wahrzeichen', () => {
    const ids = POI_MODELS.landmark.map((m) => m.id)
    for (const id of ['cathedral', 'church', 'townhall', 'cemetery', 'castle'] as const) expect(ids).toContain(id)
    expect(poiModel({ id: 'p', kind: 'landmark', x: 1, y: 1, name: 'Dom', model: 'cathedral' })).toBe('cathedral')
    // a model of another kind is ignored
    expect(poiModel({ id: 'p', kind: 'stadium', x: 1, y: 1, name: 'S', model: 'castle' })).toBe('football')
  })
})
