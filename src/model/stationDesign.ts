import type { CityDoc, OperatorId, PlatformLength, PlatformStyle, RoofType, Station, StationDesign, StationType } from './types'

export const PLATFORM_LENGTH: Record<PlatformLength, number> = { short: 4.5, medium: 6.5, long: 9 }
export const MAX_TRACKS = 8

export const ROOF_LABEL: Record<RoofType, string> = {
  open: 'Offen',
  canopy: 'Dächer',
  glass: 'Glasdach',
  hall: 'Halle',
}

const DEFAULTS: Record<StationType, { tracks: number; platform: PlatformStyle; length: PlatformLength; roof: RoofType; ubahn: boolean }> = {
  standard: { tracks: 2, platform: 'side', length: 'short', roof: 'open', ubahn: false },
  interchange: { tracks: 4, platform: 'island', length: 'medium', roof: 'canopy', ubahn: true },
  landmark: { tracks: 2, platform: 'island', length: 'medium', roof: 'canopy', ubahn: false },
  hauptbahnhof: { tracks: 6, platform: 'island', length: 'long', roof: 'hall', ubahn: true },
  airport: { tracks: 4, platform: 'island', length: 'long', roof: 'glass', ubahn: true },
}

export interface ResolvedDesign {
  tracks: number
  platform: PlatformStyle
  length: PlatformLength
  roof: RoofType
  ubahn: boolean
  /** null = follow the line through the station */
  angle: number | null
  trackOps: OperatorId[][]
}

/** Operators of all lines that stop at a station. */
export function stationOperators(doc: CityDoc, stationId: string): OperatorId[] {
  const set = new Set<OperatorId>()
  for (const l of Object.values(doc.lines)) if (l.stations.includes(stationId)) set.add(l.operator)
  return [...set]
}

/** Merge the user's overrides with the defaults of the station type. */
export function resolveDesign(st: Station, ops: OperatorId[], level = 0): ResolvedDesign {
  const base = { ...DEFAULTS[st.type] }
  // higher levels default to a plain two-track platform with a simple roof, so they read as a separate module
  if (level > 0) Object.assign(base, { tracks: 2, platform: 'side' as PlatformStyle, length: 'medium' as PlatformLength, roof: 'canopy' as RoofType, ubahn: false })
  const d: StationDesign = (level === 0 ? st.design : st.levelDesigns?.[level]) ?? {}
  const tracks = Math.min(MAX_TRACKS, Math.max(1, d.tracks ?? base.tracks))
  const all: OperatorId[] = ops.length ? ops : ['sbahn']
  // unless the user decided otherwise, spread the operators over the tracks of each side:
  // the track nearest the axis serves the first operator, the next one the second, and so on
  const { zs } = trackPositions(tracks, d.platform ?? base.platform)
  const rank = (i: number) => zs.filter((z, k) => (zs[i] <= 0 ? z <= 0 && z > zs[i] : z > 0 && z < zs[i]) && k !== i).length
  const perSide = (i: number) => zs.filter((z) => (zs[i] <= 0 ? z <= 0 : z > 0)).length
  const spread = (i: number) =>
    all.length <= perSide(i)
      ? [all[rank(i) % all.length]]
      : all.filter((_, k) => k % perSide(i) === rank(i)) // more operators than tracks: share
  const trackOps = Array.from({ length: tracks }, (_, i) => d.trackOps?.[i] ?? spread(i))
  return {
    tracks,
    platform: d.platform ?? base.platform,
    length: d.length ?? base.length,
    roof: d.roof ?? base.roof,
    ubahn: d.ubahn ?? base.ubahn,
    angle: d.angle ?? null,
    trackOps,
  }
}

export interface StationLayout {
  /** Lateral position (world units across the track direction) and the operators allowed on it */
  tracks: { z: number; ops: OperatorId[]; /** where the through-route enters this track (±0.3) or null for a stub */ anchor: number | null }[]
  platforms: { z0: number; z1: number }[]
  /** Half of the overall width */
  halfWidth: number
  length: number
}

/** Distance of the two tracks of a line from its axis */
export const TRACK_OFFSET = 0.23
const GAP = 0.5 // spacing of neighbouring tracks without a platform between them
const ISLAND = 1.2 // spacing of two tracks that share an island platform
const SIDE_W = 0.55 // width of a side platform
/** Distance from the track axis to the platform edge (ballast + clearance for the train body) */
const EDGE = 0.24

/** Lateral positions of the tracks (centred on the route axis) and the island platforms between them. */
export function trackPositions(n: number, style: PlatformStyle): { zs: number[]; platforms: { z0: number; z1: number }[] } {
  const zs: number[] = []
  const platforms: { z0: number; z1: number }[] = []
  if (style === 'island') {
    let z = 0
    let i = 0
    while (i < n) {
      if (i + 1 < n) {
        zs.push(z, z + ISLAND)
        platforms.push({ z0: z + EDGE, z1: z + ISLAND - EDGE })
        z += ISLAND + GAP
        i += 2
      } else {
        zs.push(z)
        platforms.push({ z0: z + EDGE, z1: z + EDGE + SIDE_W })
        z += GAP
        i += 1
      }
    }
  } else {
    // side platforms: tracks side by side, platforms only outside the outermost tracks
    for (let i = 0; i < n; i++) zs.push(i === 0 ? 0 : i === 1 ? 2 * TRACK_OFFSET : 2 * TRACK_OFFSET + (i - 1) * GAP)
  }
  const mid = (Math.min(...zs) + Math.max(...zs)) / 2
  return { zs: zs.map((z) => z - mid), platforms: platforms.map((p) => ({ z0: p.z0 - mid, z1: p.z1 - mid })) }
}

/**
 * Lateral layout of a station: track positions, platforms between/next to them and which tracks the
 * route double-track (at ±0.3) connects to.
 */
export function layoutStation(d: ResolvedDesign, minLength = 0): StationLayout {
  const { zs: tracksZ, platforms: pf } = trackPositions(d.tracks, d.platform)
  if (d.platform === 'side') {
    const lo = Math.min(...tracksZ)
    const hi = Math.max(...tracksZ)
    pf.push({ z0: lo - EDGE - SIDE_W, z1: lo - EDGE }, { z0: hi + EDGE, z1: hi + EDGE + SIDE_W })
  }

  // the two tracks nearest the axis take over the route's double track
  const order = tracksZ.map((z, i) => ({ z, i }))
  const neg = order.filter((o) => o.z <= 0).sort((a, b) => b.z - a.z)[0]
  const pos = order.filter((o) => o.z > 0).sort((a, b) => a.z - b.z)[0]
  const anchors = new Map<number, number>()
  if (neg) anchors.set(neg.i, -TRACK_OFFSET)
  if (pos) anchors.set(pos.i, TRACK_OFFSET)
  if (!pos && neg) anchors.set(neg.i, 0)
  if (!neg && pos) anchors.set(pos.i, 0)

  const all = [...tracksZ, ...pf.flatMap((p) => [p.z0, p.z1])]
  return {
    tracks: tracksZ.map((z, i) => ({ z, ops: d.trackOps[i] ?? [], anchor: anchors.get(i) ?? null })),
    platforms: pf,
    halfWidth: Math.max(Math.abs(Math.min(...all)), Math.abs(Math.max(...all))),
    // long trains need long platforms: grow the platform instead of letting the train overhang
    length: Math.max(PLATFORM_LENGTH[d.length], minLength),
  }
}

/** Track (lateral z) a train of an operator uses at a station. dir = +1 forward lane, -1 return lane. */
export function trackFor(layout: StationLayout, op: OperatorId, dir: 1 | -1): number {
  const side = layout.tracks.filter((t) => (dir > 0 ? t.z >= -0.01 : t.z <= 0.01))
  const pool = side.length ? side : layout.tracks
  const allowed = pool.filter((t) => t.ops.includes(op))
  const pick = (allowed.length ? allowed : pool).slice().sort((a, b) => Math.abs(a.z) - Math.abs(b.z))[0]
  return pick ? pick.z : dir * TRACK_OFFSET
}
