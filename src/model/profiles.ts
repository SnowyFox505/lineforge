import type { BridgeStyle, CityDoc, Line, Station, TrackProfile } from './types'

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
export function legProfile(line: Line, k: number): TrackProfile {
  return line.legs?.[k]?.profile ?? (line.operator === 'ubahn' ? 'tunnel' : 'ground')
}

export function legBridge(line: Line, k: number): BridgeStyle {
  return line.legs?.[k]?.bridge ?? 'standard'
}

/** A station lies underground when set so, or by default when only metro lines call there. */
export function isUndergroundStation(doc: CityDoc, st: Station): boolean {
  if (st.underground !== undefined) return st.underground
  const lines = Object.values(doc.lines).filter((l) => l.stations.includes(st.id))
  return lines.length > 0 && lines.every((l) => l.operator === 'ubahn')
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
