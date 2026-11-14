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
export type PoiModel = 'football' | 'arena' | 'wheel' | 'tvtower' | 'dome' | 'gate' | 'clocktower'

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
  ],
}

/** The model of a point of interest: its own choice if it fits the kind, else the first one of the kind. */
export function poiModel(p: Poi): PoiModel {
  const list = POI_MODELS[p.kind]
  return list.find((m) => m.id === p.model)?.id ?? list[0].id
}

/** Half the footprint (world units) a model occupies: nothing else is built there */
export const POI_FOOTPRINT: Record<PoiModel, number> = { football: 2, arena: 2, wheel: 1.4, tvtower: 0.9, dome: 1.5, gate: 1.4, clocktower: 0.9 }
