import { poolFor, takeName } from './names'
import { LAND } from './types'
import type { CityDoc, County } from './types'

/** Soft colours for the counties, used in turn */
export const COUNTY_COLORS = ['#e07a5f', '#4c8fd6', '#6fb58b', '#e0b84f', '#9b72cf', '#d8689c', '#4fb8cf', '#a8b04a']

/** A county that a player has not painted yet in the next free colour. */
export function nextCountyColor(doc: CityDoc): string {
  const used = new Set((doc.counties ?? []).map((c) => c.color))
  return COUNTY_COLORS.find((c) => !used.has(c)) ?? COUNTY_COLORS[(doc.counties ?? []).length % COUNTY_COLORS.length]
}

/** The county at a cell (or undefined) */
export function countyAt(doc: CityDoc, x: number, y: number): County | undefined {
  if (!doc.countyGrid || x < 0 || y < 0 || x >= doc.size || y >= doc.size) return undefined
  const id = doc.countyGrid[y * doc.size + x]
  return id ? doc.counties?.find((c) => c.id === id) : undefined
}

/** The next free id (counties are numbered from 1, the grid holds them as bytes) */
export function nextCountyId(doc: CityDoc): number {
  const used = new Set((doc.counties ?? []).map((c) => c.id))
  for (let id = 1; id <= 255; id++) if (!used.has(id)) return id
  return 0
}

/** A new, still empty county with the next wished-for or a made-up name. Null when all 255 ids are in use. */
export function addCounty(doc: CityDoc): { doc: CityDoc; id: number } | null {
  const id = nextCountyId(doc)
  if (!id) return null
  const n = (doc.counties ?? []).length + 1
  const taken = takeName(doc, 'county', poolFor('county'), `Landkreis ${n}`)
  const county: County = { id, name: taken.name, color: nextCountyColor(doc) }
  return { doc: { ...doc, counties: [...(doc.counties ?? []), county], nameQueues: taken.queues }, id }
}

/** Small deterministic random numbers (mulberry32) */
function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Cut the land of the map into `n` counties of similar size: centres spread as far apart as possible, every dry cell
 * belongs to the nearest one. Existing counties are replaced. Water stays outside every county.
 */
export function divideIntoCounties(doc: CityDoc, n: number, seed: number): CityDoc {
  const { size, terrain } = doc
  const land: number[] = []
  for (let i = 0; i < terrain.length; i++) if (terrain[i] === LAND) land.push(i)
  const count = Math.max(1, Math.min(n, 12, land.length))
  if (!land.length) return { ...doc, counties: [], countyGrid: new Uint8Array(size * size) }
  const r = rand(seed * 7919 + size)
  const centres: { x: number; y: number }[] = []
  const at = (i: number) => ({ x: i % size, y: Math.floor(i / size) })
  centres.push(at(land[Math.floor(r() * land.length)]))
  // farthest-point sampling over a sample of the land (keeps big maps fast)
  const sample = Array.from({ length: Math.min(land.length, 2500) }, () => land[Math.floor(r() * land.length)])
  while (centres.length < count) {
    let best = -1
    let bd = -1
    for (const i of sample) {
      const p = at(i)
      let d = Infinity
      for (const c of centres) d = Math.min(d, (p.x - c.x) ** 2 + (p.y - c.y) ** 2)
      if (d > bd) {
        bd = d
        best = i
      }
    }
    centres.push(at(best))
  }
  let d: CityDoc = { ...doc, counties: [] }
  const ids: number[] = []
  for (let k = 0; k < count; k++) {
    const made = addCounty(d)!
    d = made.doc
    ids.push(made.id)
  }
  const grid = new Uint8Array(size * size)
  for (const i of land) {
    const p = at(i)
    let bestK = 0
    let bd = Infinity
    for (let k = 0; k < centres.length; k++) {
      const dd = (p.x - centres[k].x) ** 2 + (p.y - centres[k].y) ** 2
      if (dd < bd) {
        bd = dd
        bestK = k
      }
    }
    grid[i] = ids[bestK]
  }
  return { ...d, countyGrid: grid }
}
