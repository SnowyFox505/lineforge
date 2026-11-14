import { stopsAt } from './stops'
import type { BridgeStyle, CityDoc, Line, Station, StationLook, TrackProfile } from './types'

/** Height of an embankment / viaduct above the ground */
export const EMB_H = 1.25
/** Platform and track height of an underground station / tunnel (relative to the ground) */
export const UG_LIFT = -2.0
/** Anything lower than this lies fully under the ground (no trench is cut into the terrain) */
export const UG_COVER = -1.0

export const PROFILE_LABEL: Record<TrackProfile, string> = {
  ground: 'Ebenerdig',
  embankment: 'Damm mit Bögen',
  tunnel: 'Tunnel',
}

/** How the leg `k` (stations[k] -> stations[k+1]) of a line runs. The metro goes underground unless set otherwise. */
export function legProfile(line: Line, k: number, doc?: CityDoc): TrackProfile {
  const own = line.legs?.[k]?.profile
  if (own) return own
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
  const lines = Object.values(doc.lines).filter((l) => stopsAt(l, st.id))
  if (!lines.length) return false
  return st.type === 'airport' || lines.every((l) => l.operator === 'ubahn')
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
