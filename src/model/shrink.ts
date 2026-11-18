import { dropLinks } from './links'
import { removeStationEverywhere, withRoutes } from './routing'
import { WATER } from './types'
import type { CityDoc, Line, Pt } from './types'

/** The part of a map that stays when it is cut down to `newSize`: a square in the middle (the same one `resizeMap` grows around). */
export function keptSquare(oldSize: number, newSize: number) {
  const off = Math.floor((oldSize - newSize) / 2)
  return { x0: off, y0: off, x1: off + newSize, y1: off + newSize }
}

/** What would be lost by shrinking, for the warning. */
export interface ShrinkImpact {
  stations: string[]
  pois: string[]
  /** lines that lose a station or a stretch of their route */
  lines: string[]
  /** painted area cells and water cells outside the square */
  painted: number
  water: number
}

const outside = (k: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number) => x < k.x0 || y < k.y0 || x >= k.x1 || y >= k.y1

export function shrinkImpact(doc: CityDoc, newSize: number): ShrinkImpact {
  const k = keptSquare(doc.size, newSize)
  const lostStations = Object.values(doc.stations).filter((s) => outside(k, s.x, s.y))
  const lost = new Set(lostStations.map((s) => s.id))
  const pois = (doc.pois ?? []).filter((p) => outside(k, p.x, p.y)).map((p) => p.name)
  const lines = Object.values(doc.lines)
    .filter((l) => l.stations.some((id) => lost.has(id)) || routeLeaves(l, k))
    .map((l) => l.name)
  let painted = 0
  let water = 0
  const n = doc.size
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!outside(k, x, y)) continue
      const i = y * n + x
      if (doc.zoneGrid?.[i]) painted++
      if (doc.terrain[i] === WATER) water++
    }
  }
  return { stations: lostStations.map((s) => s.name), pois, lines, painted, water }
}

const routeLeaves = (l: Line, k: { x0: number; y0: number; x1: number; y1: number }) =>
  [...(l.via ?? []), ...(l.segs ?? [])].some((pts) => (pts ?? []).some((p) => p.x < k.x0 || p.y < k.y0 || p.x > k.x1 || p.y > k.y1))

function crop<T extends Uint8Array | Uint16Array>(src: T, old: number, k: { x0: number; y0: number }, size: number, make: (n: number) => T): T {
  const out = make(size * size)
  for (let y = 0; y < size; y++) out.set(src.subarray((y + k.y0) * old + k.x0, (y + k.y0) * old + k.x0 + size), y * size)
  return out
}

/**
 * Cut the map down to the square in the middle: everything outside is gone (stations with their share of the lines, points
 * of interest, named waters, painted areas). Stretches of line that left the square are laid again.
 */
export function shrinkDoc(doc: CityDoc, newSize: number): CityDoc {
  const old = doc.size
  if (newSize >= old) return doc
  const k = keptSquare(old, newSize)
  let d = doc
  for (const s of Object.values(doc.stations)) if (outside(k, s.x, s.y)) d = dropLinks(removeStationEverywhere(d, s.id), s.id)

  const shift = (p: Pt): Pt => ({ x: p.x - k.x0, y: p.y - k.y0 })
  const stays = (pts: Pt[] | undefined) => (pts ?? []).every((p) => p.x >= k.x0 && p.y >= k.y0 && p.x <= k.x1 && p.y <= k.y1)
  const lines: CityDoc['lines'] = {}
  for (const [id, l] of Object.entries(d.lines)) {
    const via = (l.via ?? []).map((v) => (stays(v) ? v.map(shift) : []))
    // a stretch that left the square is laid again (an empty route is routed by `withRoutes`)
    const segs = (l.segs ?? []).map((s, i) => (s && stays(s) && stays(l.via?.[i]) ? s.map(shift) : (undefined as unknown as Pt[])))
    lines[id] = { ...l, via, segs }
  }

  const grid = (g: Uint8Array | Uint16Array | undefined, make: (n: number) => Uint8Array | Uint16Array) => (g ? crop(g, old, k, newSize, make) : undefined)
  const zoneGrid = grid(d.zoneGrid, (n) => new Uint16Array(n)) as Uint16Array | undefined
  const countyGrid = grid(d.countyGrid, (n) => new Uint8Array(n)) as Uint8Array | undefined
  const used = (g: Uint8Array | Uint16Array | undefined) => {
    const set = new Set<number>()
    if (g) for (let i = 0; i < g.length; i++) if (g[i]) set.add(g[i])
    return set
  }
  const zoneIds = used(zoneGrid)
  const countyIds = used(countyGrid)

  const next: CityDoc = {
    ...d,
    size: newSize,
    // the town streets stay where they were: the map now starts `k.x0` cells further in
    streetGen: d.streetGen ?? old,
    streetDx: (d.streetDx ?? 0) - k.x0,
    streetDy: (d.streetDy ?? 0) - k.y0,
    terrain: crop(d.terrain, old, k, newSize, (n) => new Uint8Array(n)),
    stations: Object.fromEntries(Object.entries(d.stations).map(([id, s]) => [id, { ...s, x: s.x - k.x0, y: s.y - k.y0 }])),
    lines,
    zoneGrid,
    zones: d.zones?.filter((z) => zoneIds.has(z.id)),
    countyGrid: countyIds.size ? countyGrid : undefined,
    counties: countyIds.size ? d.counties?.filter((c) => countyIds.has(c.id)) : undefined,
    pois: (d.pois ?? []).filter((p) => !outside(k, p.x, p.y)).map((p) => ({ ...p, x: p.x - k.x0, y: p.y - k.y0, ...(p.stations ? { stations: p.stations.filter((id) => d.stations[id]) } : {}) })),
    waters: d.waters?.filter((w) => !outside(k, w.x, w.y)).map((w) => ({ ...w, x: w.x - k.x0, y: w.y - k.y0 })),
  }
  return withRoutes(next)
}
