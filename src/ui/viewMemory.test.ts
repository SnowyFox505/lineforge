import { beforeEach, describe, expect, it } from 'vitest'
import { loadView, saveCamView, saveMapView } from './viewMemory'

beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
})

describe('view memory', () => {
  it('gives back the map view and the 3D camera of a city separately', () => {
    saveMapView('a', { s: 12, cx: 30, cy: 40 })
    saveCamView('a', { p: [1, 2, 3], t: [0, 0, 0] })
    saveMapView('b', { s: 5, cx: 1, cy: 2 })
    expect(loadView('a')).toEqual({ map: { s: 12, cx: 30, cy: 40 }, cam: { p: [1, 2, 3], t: [0, 0, 0] } })
    expect(loadView('b').cam).toBeUndefined()
    expect(loadView('unknown')).toEqual({ map: undefined, cam: undefined })
  })

  it('ignores damaged entries and forgets the oldest cities', () => {
    localStorage.setItem('lineforge-views', JSON.stringify({ x: { map: { s: NaN, cx: 1, cy: 1 }, cam: { p: [1, 'a', 3], t: [0, 0, 0] } } }))
    expect(loadView('x')).toEqual({ map: undefined, cam: undefined })
    for (let i = 0; i < 45; i++) saveMapView(`c${i}`, { s: 1, cx: 1, cy: 1 })
    expect(loadView('c0').map).toBeUndefined()
    expect(loadView('c44').map).toBeTruthy()
  })
})
