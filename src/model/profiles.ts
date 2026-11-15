import { levelHeight } from './stationGroups'
import { stopsAt } from './stops'
import type { BridgeStyle, CityDoc, Line, Station, StationLook, TrackProfile } from './types'

/** Height of an embankment / viaduct above the ground */
export const EMB_H = 1.25
/** Platform and track height of an underground station / tunnel (relative to the ground) */
export const UG_LIFT = -2.0
/** Anything lower than this lies fully under the ground (no trench is cut into the terrain) */
export const UG_COVER = -1.0

/** Platform height of an elevated station: level with the viaduct (embankment) its tracks run on */
export const ELEV_LIFT = EMB_H
/** Platform height of a lowered station in an open cutting (shallower than UG_COVER, so the ground stays open above it) */
export const LOWER_LIFT = -0.7

export const PROFILE_LABEL: Record<TrackProfile, string> = {
  ground: 'Ebenerdig',
  embankment: 'Damm mit Bögen',
  tunnel: 'Tunnel',
}

/** How the leg `k` (stations[k] -> stations[k+1]) of a line runs. The metro goes underground unless set otherwise. */
export function legProfile(line: Line, k: number, doc?: CityDoc): TrackProfile {
  const own = line.legs?.[k]?.profile
  if (own) return own
  // a leg that starts or ends at an elevated station climbs onto an arched embankment
  if (doc) {
    const a = doc.stations[line.stations[k]]
    const b = doc.stations[line.stations[k + 1]]
    if ((a && stopsAt(line, a.id) && stationHeight(doc, a) === 'elevated') || (b && stopsAt(line, b.id) && stationHeight(doc, b) === 'elevated')) return 'embankment'
  }
  if (line.operator === 'ubahn') return 'tunnel'
  // a leg that starts or ends at an underground station dives into a tunnel by default
  if (doc) {
    // (a station the line only runs through does not pull it down)
    const a = doc.stations[line.stations[k]]
    const b = doc.stations[line.stations[k + 1]]
    if ((a && stopsAt(line, a.id) && isUndergroundStation(doc, a)) || (b && stopsAt(line, b.id) && isUndergroundStation(doc, b))) return 'tunnel'
  }
  return 'ground'
}

export function legBridge(line: Line, k: number): BridgeStyle {
  return line.legs?.[k]?.bridge ?? 'standard'
}

/**
 * A station lies underground when set so (any kind of train can stop there). By default that is the case
 * for stations only the metro serves and for airports.
 */
export function isUndergroundStation(doc: CityDoc, st: Station): boolean {
  if (st.underground !== undefined) return st.underground
  // raised or lowered by choice: not underground, whatever the lines
  if (st.height) return false
  const lines = Object.values(doc.lines).filter((l) => stopsAt(l, st.id))
  if (!lines.length) return false
  return st.type === 'airport' || lines.every((l) => l.operator === 'ubahn')
}

export type StationHeight = 'ground' | 'elevated' | 'lowered' | 'underground'

export const HEIGHT_LABEL: Record<StationHeight, { label: string; hint: string }> = {
  ground: { label: 'Ebenerdig', hint: 'Bahnsteige auf Höhe des Bodens' },
  elevated: { label: 'Erhöht', hint: 'Auf einem Viadukt über der Straße' },
  lowered: { label: 'Abgesenkt', hint: 'In einem offenen Einschnitt unter dem Boden' },
  underground: { label: 'Unterirdisch', hint: 'Im Tunnel unter der Erde' },
}

/** Where the platforms of a station lie: on the ground, on a viaduct, in a cutting or in a tunnel. */
export function stationHeight(doc: CityDoc, st: Station): StationHeight {
  if (isUndergroundStation(doc, st)) return 'underground'
  return st.height ?? 'ground'
}

/** Platform height (world units) of level `index` of a station with `levelCount` levels. A single level follows the station's setting. */
export function stationLift(doc: CityDoc, st: Station, levelCount: number, index: number): number {
  if (levelCount > 1) return levelHeight(levelCount, index)
  switch (stationHeight(doc, st)) {
    case 'underground':
      return UG_LIFT
    case 'elevated':
      return ELEV_LIFT
    case 'lowered':
      return LOWER_LIFT
    default:
      return 0
  }
}

export interface BridgeInfo {
  id: BridgeStyle
  label: string
  era: 'standard' | 'historic' | 'modern'
  hint: string
}

/** The bridges to choose from: the plain standard one, historic ones and modern ones. */
export const BRIDGE_STYLES: BridgeInfo[] = [
  { id: 'standard', label: 'Standard', era: 'standard', hint: 'Schlichte Balkenbrücke' },
  { id: 'stone', label: 'Steinbogen', era: 'historic', hint: 'Gemauerte Bogenbrücke mit Rundbögen' },
  { id: 'brick', label: 'Backsteinviadukt', era: 'historic', hint: 'Viele kleine Ziegelbögen wie ein Stadtbahn-Viadukt' },
  { id: 'truss', label: 'Fachwerk', era: 'historic', hint: 'Genietete Stahlfachwerkbrücke' },
  { id: 'cable', label: 'Schrägseil', era: 'modern', hint: 'Pylon mit Seilen' },
  { id: 'arch', label: 'Stabbogen', era: 'modern', hint: 'Stählerner Bogen über der Fahrbahn' },
  { id: 'slim', label: 'Schlank', era: 'modern', hint: 'Dünne Spannbetonbrücke mit wenigen Pfeilern' },
]

export interface LookInfo {
  id: StationLook
  label: string
  hint: string
}

/** The looks a heavy-rail station can have from outside. */
export const STATION_LOOKS: LookInfo[] = [
  { id: 'halle', label: 'Bahnhofshalle', hint: 'Große stählerne Bogenhalle wie ein Kopfbahnhof' },
  { id: 'glas', label: 'Glasdach', hint: 'Lichtdurchflutetes Glas-Tonnendach' },
  { id: 'gruenderzeit', label: 'Gründerzeit', hint: 'Backsteingebäude mit Uhrturm und Satteldach-Halle' },
  { id: 'modern', label: 'Modern', hint: 'Flaches Dach mit Glaswänden' },
  { id: 'shed', label: 'Sheddach', hint: 'Sägezahndach mit Oberlichtern' },
  { id: 'tonne', label: 'Betontonne', hint: 'Flaches Tonnengewölbe aus Beton' },
  { id: 'zelt', label: 'Zeltdach', hint: 'Leichte Zeltdächer auf Masten' },
  { id: 'landhalt', label: 'Haltepunkt', hint: 'Kleines Backsteinhaus mit langem Bahnsteigdach' },
]

/** Look of a station: its own choice, else a sensible one for its type. */
export function lookOf(st: Station): StationLook {
  if (st.look) return st.look
  switch (st.type) {
    case 'hauptbahnhof':
      return 'halle'
    case 'interchange':
      return 'glas'
    case 'airport':
      return 'modern'
    default:
      return 'landhalt'
  }
}
