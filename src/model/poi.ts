import { lineCurve } from './geo'
import { LAND } from './types'
import type { CityDoc, Poi, PoiKind, Station } from './types'

/** Catchment radius (cells) of a point of interest when the user has not set one */
export const POI_RADIUS: Record<PoiKind, number> = { stadium: 6, landmark: 8, attraction: 10 }
export const POI_RADIUS_MIN = 2
export const POI_RADIUS_MAX = 30

export function poiRadius(p: Poi): number {
  return Math.min(POI_RADIUS_MAX, Math.max(POI_RADIUS_MIN, p.radius ?? POI_RADIUS[p.kind]))
}

/** The stations inside the catchment of a point of interest: people travel to the place from there. */
export function stationsInReach(doc: CityDoc, poi: Poi): Station[] {
  const r = poiRadius(poi)
  return Object.values(doc.stations).filter((s) => Math.hypot(s.x - poi.x, s.y - poi.y) <= r)
}

/**
 * The stations people use to get to a point of interest: the ones the user picked among those in reach, and without a
 * choice only the nearest one (visitors want to go to the town hall, not to the zoo next to it, so being in reach is not enough).
 */
export function poiStations(doc: CityDoc, poi: Poi): Station[] {
  const inReach = stationsInReach(doc, poi)
  if (poi.stations) return inReach.filter((s) => poi.stations!.includes(s.id))
  const nearest = inReach.sort((a, b) => Math.hypot(a.x - poi.x, a.y - poi.y) - Math.hypot(b.x - poi.x, b.y - poi.y))[0]
  return nearest ? [nearest] : []
}

/** The points of interest people travel to from this station, nearest first. */
export function poisServedBy(doc: CityDoc, st: Station): Poi[] {
  return (doc.pois ?? [])
    .filter((p) => poiStations(doc, p).some((s) => s.id === st.id))
    .sort((a, b) => Math.hypot(st.x - a.x, st.y - a.y) - Math.hypot(st.x - b.x, st.y - b.y))
}

/** The 3D models a point of interest can have; each kind has a few to choose from. */
export type PoiModel = 'football' | 'arena' | 'wheel' | 'tvtower' | 'dome' | 'gate' | 'clocktower' | 'cathedral' | 'church' | 'townhall' | 'cemetery' | 'castle'

export const POI_MODELS: Record<PoiKind, { id: PoiModel; label: string }[]> = {
  stadium: [
    { id: 'football', label: 'Fußballfeld' },
    { id: 'arena', label: 'Freies Feld' },
  ],
  attraction: [
    { id: 'wheel', label: 'Riesenrad' },
    { id: 'tvtower', label: 'Fernsehturm' },
    { id: 'dome', label: 'Kuppelhalle' },
  ],
  landmark: [
    { id: 'gate', label: 'Stadttor' },
    { id: 'clocktower', label: 'Uhrturm' },
    { id: 'cathedral', label: 'Dom' },
    { id: 'church', label: 'Kirche' },
    { id: 'townhall', label: 'Rathaus' },
    { id: 'cemetery', label: 'Friedhof' },
    { id: 'castle', label: 'Schloss / Burg' },
  ],
}

/** The model of a point of interest: its own choice if it fits the kind, else the first one of the kind. */
export function poiModel(p: Poi): PoiModel {
  const list = POI_MODELS[p.kind]
  return list.find((m) => m.id === p.model)?.id ?? list[0].id
}

/** Half the footprint (world units) a model occupies: nothing else is built there */
export const POI_FOOTPRINT: Record<PoiModel, number> = { football: 2, arena: 2, wheel: 1.4, tvtower: 0.9, dome: 1.5, gate: 1.4, clocktower: 0.9, cathedral: 1.4, church: 0.9, townhall: 1.3, cemetery: 1.3, castle: 1.5 }

/** A point of interest closer than this (cells) to a station stands on its platforms in 3D */
export const POI_STATION_CLEAR = 2.5

/** Does the point of interest stand on a station (so its model would stand on the platforms)? */
export function poiOnStation(doc: CityDoc, p: { x: number; y: number }): boolean {
  return Object.values(doc.stations).some((s) => Math.hypot(s.x - p.x, s.y - p.y) < POI_STATION_CLEAR)
}

/**
 * A free cell next to (x, y) for a point of interest: dry land, clear of stations, lines and other points of interest.
 * The nearest such cell wins; null when there is none in reach.
 */
export function freePoiSpot(doc: CityDoc, x: number, y: number, ignoreId?: string): { x: number; y: number } | null {
  const { size, terrain } = doc
  const stations = Object.values(doc.stations)
  const others = (doc.pois ?? []).filter((p) => p.id !== ignoreId)
  const lines: { x: number; y: number }[] = []
  for (const l of Object.values(doc.lines)) if (l.stations.length >= 2) for (const q of lineCurve(doc, l).pts) lines.push(q)
  const ok = (cx: number, cy: number) => {
    if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1 || terrain[cy * size + cx] !== LAND) return false
    if (stations.some((s) => Math.hypot(s.x - cx, s.y - cy) < 4.5)) return false
    if (others.some((p) => Math.hypot(p.x - cx, p.y - cy) < 3.5)) return false
    return !lines.some((q) => Math.hypot(q.x - cx, q.y - cy) < 2.6)
  }
  if (ok(x, y)) return { x, y }
  for (let r = 2; r <= 12; r++) {
    const n = Math.max(12, r * 6)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4
      const cx = Math.round(x + Math.cos(a) * r)
      const cy = Math.round(y + Math.sin(a) * r)
      if (ok(cx, cy)) return { x: cx, y: cy }
    }
  }
  return null
}

/**
 * Old cities have points of interest right on a station (a landmark station became a stop plus a landmark at the same
 * cell): move those to the free spot next to it. Returns the same document when nothing stands on a station.
 */
export function separatePois(doc: CityDoc): CityDoc {
  const pois = doc.pois ?? []
  if (!pois.some((p) => poiOnStation(doc, p))) return doc
  let cur = doc
  const out: Poi[] = []
  for (const p of pois) {
    if (!poiOnStation(doc, p)) {
      out.push(p)
      continue
    }
    const spot = freePoiSpot({ ...cur, pois: [...out, ...pois.slice(out.length + 1)] }, p.x, p.y, p.id)
    out.push(spot ? { ...p, x: spot.x, y: spot.y } : p)
    cur = { ...cur, pois: out }
  }
  return { ...doc, pois: out }
}
