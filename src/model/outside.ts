import { FAR_NAMES } from './nameData'
import { stopsAt } from './stops'
import type { CityDoc, OperatorId, Station } from './types'

/** Only these operators leave the city: the metro, the tram and the suburban rail stay inside. */
export const OUTSIDE_OPERATORS: OperatorId[] = ['regional', 'fernverkehr']

export const canServeOutside = (op: OperatorId) => OUTSIDE_OPERATORS.includes(op)

/** The text next to the station name on the map and in the network plan: "Hauptbahnhof → Nordhafen" */
export function stationLabel(st: Station): string {
  return st.outside ? `${st.name} \u2192 ${st.outside}` : st.name
}

/** Lines that stop here although they must not leave the city (a connection to the outside only suits regional and long-distance trains). */
export function outsideBlockers(doc: CityDoc, stationId: string) {
  return Object.values(doc.lines).filter((l) => stopsAt(l, stationId) && !canServeOutside(l.operator))
}

/** A far-away destination that no other connection of this city already uses. */
export function farDestination(doc: CityDoc, seed = Math.random()): string {
  const used = new Set(Object.values(doc.stations).map((s) => s.outside))
  const free = FAR_NAMES.filter((n) => !used.has(n))
  const pool = free.length ? free : FAR_NAMES
  return pool[Math.floor(seed * pool.length) % pool.length]
}

/** The stations that connect the city to the outside world */
export function outsideStations(doc: CityDoc): Station[] {
  return Object.values(doc.stations).filter((s) => s.outside)
}
