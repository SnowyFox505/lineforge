export type GameMode = 'normal' | 'creative'

export type OperatorId = 'sbahn' | 'ubahn' | 'tram' | 'regional' | 'fernverkehr'

export type StationType = 'standard' | 'interchange' | 'landmark' | 'hauptbahnhof' | 'airport'

/** Terrain cell values */
export const LAND = 0
export const WATER = 1

export interface Pt {
  x: number
  y: number
}

export type RoofType = 'open' | 'canopy' | 'glass' | 'hall'
export type PlatformStyle = 'island' | 'side'
export type PlatformLength = 'short' | 'medium' | 'long'

/** Optional 3D station layout. Missing fields fall back to sensible defaults (see model/stationDesign.ts). */
export interface StationDesign {
  tracks?: number
  platform?: PlatformStyle
  length?: PlatformLength
  roof?: RoofType
  /** Underground metro connection below the station */
  ubahn?: boolean
  /** Track direction in degrees; undefined/null = follow the line through the station */
  angle?: number | null
  /** Which operators may stop on each track (index = track) */
  trackOps?: OperatorId[][]
}

export interface Station {
  id: string
  name: string
  /** Integer cell coordinates on the map grid */
  x: number
  y: number
  type: StationType
  /** Optional label for landmark stations, e.g. "Bundestag" */
  landmarkLabel?: string
  /** Design of the lowest level (and of the whole station when it has only one) */
  design?: StationDesign
  /** How many platform levels the station has (1..3). Lines are spread over them by direction. */
  levels?: number
  /** Designs of the higher levels, index = level (1, 2); level 0 uses `design` */
  levelDesigns?: Record<number, StationDesign>
}

export interface Line {
  id: string
  /** Short name, e.g. "S5" or "U2" */
  name: string
  operator: OperatorId
  color: string
  /** Ordered station ids */
  stations: string[]
  /**
   * Waypoints the user placed: via[i] lies after stations[i] on the way to stations[i+1].
   * The last entry (same index as the last station) collects waypoints set before the next station exists.
   */
  via?: Pt[][]
  /** Computed route geometry (lattice points, octilinear) for every segment between two stations */
  segs?: Pt[][]
  /** Radius of the curves in the 3D view (the 2D plan keeps its sharp bends). Default 3. */
  curve?: number
}

/** Kinds of areas that can be painted on the map to show where the city, its suburbs and the airport are. */
export type ZoneKind = 'city' | 'suburb' | 'airport'

/** A named area. Districts (Bezirke) are several `city` zones, each with its own name. */
export interface Zone {
  /** 1-based id stored in `CityDoc.zoneGrid` */
  id: number
  kind: ZoneKind
  name: string
}

export type PoiKind = 'stadium' | 'landmark' | 'attraction'

/** A point of interest (stadium, landmark, ...) shown as a marker on the map. */
export interface Poi {
  id: string
  kind: PoiKind
  name: string
  x: number
  y: number
}

export interface CityDoc {
  id: string
  name: string
  mode: GameMode
  /** Map is size x size cells */
  size: number
  /** size*size cells, row-major: terrain[y*size+x] is LAND or WATER */
  terrain: Uint8Array
  stations: Record<string, Station>
  lines: Record<string, Line>
  /** Painted areas: zone id per cell (0 = none), size*size, row-major */
  zoneGrid?: Uint16Array
  zones?: Zone[]
  pois?: Poi[]
}
