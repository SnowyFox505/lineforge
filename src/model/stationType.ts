import type { CityDoc, StationType } from './types'

/** What the player chooses when building a station: a rail stop or a tram stop (everything else follows from it). */
export const BUILD_TYPES: StationType[] = ['standard', 'tramstop']

/** True when the cell lies on the airport grounds. */
export function onAirport(doc: CityDoc, x: number, y: number): boolean {
  const { zoneGrid, zones, size } = doc
  if (!zoneGrid || !zones?.length) return false
  if (x < 0 || y < 0 || x >= size || y >= size) return false
  const id = zoneGrid[y * size + x]
  return !!id && zones.some((z) => z.id === id && z.kind === 'airport')
}

/**
 * The type a station gets at a cell. A rail stop on the airport grounds is the airport station, and an airport
 * station that is not on the grounds (any more) is a plain stop. A tram stop and the main station stay as they are.
 */
export function stationTypeAt(doc: CityDoc, x: number, y: number, wanted: StationType): StationType {
  if (wanted === 'tramstop' || wanted === 'hauptbahnhof') return wanted
  return onAirport(doc, x, y) ? 'airport' : wanted === 'airport' ? 'standard' : wanted
}

/** Default name of a new station of this type */
export function stationName(type: StationType, count: number): string {
  return type === 'airport' ? `Flughafen ${count}` : type === 'hauptbahnhof' ? `Hauptbahnhof ${count}` : `Station ${count}`
}

/** The station that is marked as the main station of the city, if any. */
export function mainStationId(doc: CityDoc): string | null {
  for (const s of Object.values(doc.stations)) if (s.type === 'hauptbahnhof') return s.id
  return null
}
