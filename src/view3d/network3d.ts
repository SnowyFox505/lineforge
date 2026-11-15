import { buildField, BRIDGE_THRESHOLD, makeSampler } from '../model/terrainField'
import { RAIL, railOf, TRAM } from '../model/scale'
import { bypassFor, layoutStation, resolveDesign, scaleLayout, stationOperators, trackFor, TRACK_OFFSET } from '../model/stationDesign'
import { passesThrough, stopsAt } from '../model/stops'
import type { ResolvedDesign, StationLayout } from '../model/stationDesign'
import type { CityDoc, Line, OperatorId, Station } from '../model/types'
import { clusterByDirection, lineDirectionAtStation, meanDirection, LEVEL_STEP } from '../model/stationGroups'
import { EMB_H, isUndergroundStation, legBridge, legProfile, stationLift, UG_COVER, UG_LIFT } from '../model/profiles'
import type { BridgeStyle, TrackProfile } from '../model/types'
import { trainLength, VEHICLES } from '../model/vehicles'
import { layoutLines } from '../plan/layout'
import { cleanPolyline, extendEnds, resample, roundPolyline, smooth01 } from './curves'
import type { P } from './curves'
import { groundHeight, LAND_Y } from './heights'

export type { P }

/** Distance of the two tracks of a line from its axis, in world units */
const TRACK_OFF = TRACK_OFFSET * RAIL
export { TRACK_OFF as TRACK_OFFSET }
/** Lane spacing in 3D: two tracks with ballast fit between neighbouring lines */
export const LANE_GAP = 1.05 * RAIL
/** Free track behind the last platform before the buffer stop */
export const BUFFER_CLEAR = 1.2 * RAIL
/** Length over which a track swings from the line axis onto its station track */
export const TAPER = 5
export const DEFAULT_CURVE = 3
/** Length of straight track added beyond both ends of a line (room for the buffer stops) */
const RUN_OUT = 14
/** Trams run flush with the street: slightly lower than railway track beds */
export const TRAM_DIP = 0.08
export const STEP = 0.4
/** Height of one station level (a line that crosses the station at a steep angle gets its own, higher level) */
export const LEVEL_H = LEVEL_STEP
/** Run-up per level: gentle enough for trains */
export const RAMP_PER_LEVEL = 10
/** Length of the run-up to a level `lift` above/below the ground: long, so lines are already on their way long before the station */
export const rampFor = (lift: number) => 12 * Math.abs(lift) + 5
/** Free space between the main station and the tram stop next to it */
export const TRAM_GAP = 2.5 * RAIL
/** Lines whose directions differ by less than this share a platform group */
const COS_GROUP = Math.cos((40 * Math.PI) / 180)

export interface Stop {
  stationId: string
  /** index of the platform group the line uses at this station */
  group: number
  /** arc length of the station centre along the line axis */
  d: number
  /** station track (lateral z in the group's frame) for the forward / return direction */
  zF: number
  zB: number
  half: number
  taper: number
  /** length of the crossover behind a terminal platform, where a train that changes ends moves to the other track (0 elsewhere) */
  cross: number
  /** platform height above the ground (0, or a multiple of LEVEL_H) */
  lift: number
}

/** The short connecting track between the two tracks of a line behind a terminal platform. */
export interface Crossover {
  x: number[]
  z: number[]
  y: number[]
  tx: number[]
  tz: number[]
}

export interface Bridge {
  d0: number
  d1: number
  /** leg of the line (stations[leg] -> stations[leg+1]) the bridge belongs to, and its look */
  leg: number
  style: BridgeStyle
}

/** Arc length range of one leg (between two stations) with the way the track runs there. */
export interface LegRange {
  k: number
  profile: TrackProfile
  d0: number
  d1: number
}

/** Extra track of a station that leaves the line's own track and rejoins it behind the platform. */
export interface Siding {
  /** index of the line sample where the siding starts, and the line track (forward / return) it leaves */
  j0: number
  side: 'f' | 'b'
  x: number[]
  z: number[]
  tx: number[]
  tz: number[]
  y: number[]
}

/** Everything the 3D view needs to know about one line. All arrays share the same sample index. */
export interface LineNet {
  line: Line
  n: number
  cx: number[]
  cz: number[]
  tx: number[]
  tz: number[]
  fx: number[]
  fz: number[]
  ftx: number[]
  ftz: number[]
  bx: number[]
  bz: number[]
  btx: number[]
  btz: number[]
  /** height of the track above the normal rail level (stations on a higher level, crossings) */
  cy: number[]
  /** slope dy/ds of the track */
  cs: number[]
  /** arc length of the line axis at every sample */
  cum: number[]
  /** 1 on the open line, falling to 0 on a station's platforms (how free the tracks are to move sideways) */
  free: number[]
  total: number
  /** the stations the line stops at (in order) */
  stops: Stop[]
  /** the stations it runs through without stopping, on the bypass tracks beside the platforms */
  through: Stop[]
  bridges: Bridge[]
  legs: LegRange[]
  sidings: Siding[]
  /** one behind each terminal platform: the rails a train takes to the other track after changing ends */
  crossovers: Crossover[]
}

/** One platform complex of a station. Lines that cross at a steep angle do not share it. */
export interface StationGroup {
  index: number
  kind: 'main' | 'tram'
  level: number
  /** platform height above the ground */
  lift: number
  ax: number
  az: number
  /**
   * Curvature of the platform axis (1/units, positive = turning towards the local +z side).
   * 0 for a straight station; a station on a bend follows the curve of its tracks.
   */
  curv: number
  /** which side (±1 of the lateral axis) the reception building / station annex stands on: opposite to a tram stop beside it */
  annex: 1 | -1
  /** a plain halt (only trams): no hall, roof or station building */
  halt: boolean
  /** rotation about Y so that local +x runs along the tracks */
  angle: number
  /** world position of the platform complex (the station centre, or beside it for the tram stop) */
  ox: number
  oz: number
  design: ResolvedDesign
  layout: StationLayout
  /** lateral positions that lines already use with their own tracks */
  usedZ: number[]
  /** lines that stop at this platform complex */
  lineIds: string[]
  /** lines that run through on its bypass tracks without stopping */
  passIds: string[]
}

export interface StationNet {
  st: Station
  x: number
  z: number
  /** the main (ground level) platform group, or the default layout for a station without lines */
  angle: number
  ax: number
  az: number
  design: ResolvedDesign
  layout: StationLayout
  usedZ: number[]
  groups: StationGroup[]
}

export interface Network3D {
  lines: LineNet[]
  stations: Record<string, StationNet>
  /** terrain height including trenches and pits for lowered tracks / platforms */
  groundAt: (x: number, z: number) => number
  /** applies the trenches and pits to a terrain height */
  carve: (x: number, z: number, h: number) => number
  /**
   * Is there a track of another line (or any track, when `ignoreLine` is omitted) within reach of (x, z)
   * that lies at least 0.8 below height `yTop`? Pillars must not stand there.
   */
  trackBelow: (x: number, z: number, yTop: number, ignoreLine?: string) => boolean
  /**
   * How free of rails and platforms a spot is: 0 on and right next to them, 1 from about 4 cells away. Mountains are
   * lowered by it, so a line always runs through a valley, and trees keep off the track.
   */
  railClearance: (x: number, z: number) => number
  field: Float32Array
}

type Which = 'c' | 'f' | 'b'

export interface Pose {
  x: number
  y: number
  z: number
  tx: number
  tz: number
  /** dy/ds */
  slope: number
}

/** Position and heading on the axis ('c') or on the forward / return track at arc length d. */
export function posOn(net: LineNet, which: Which, d: number): Pose {
  const X = which === 'c' ? net.cx : which === 'f' ? net.fx : net.bx
  const Z = which === 'c' ? net.cz : which === 'f' ? net.fz : net.bz
  const TX = which === 'c' ? net.tx : which === 'f' ? net.ftx : net.btx
  const TZ = which === 'c' ? net.tz : which === 'f' ? net.ftz : net.btz
  const cum = net.cum
  const n = net.n
  if (d <= 0) return { x: X[0] + TX[0] * d, y: net.cy[0], z: Z[0] + TZ[0] * d, tx: TX[0], tz: TZ[0], slope: 0 }
  if (d >= net.total) {
    const e = n - 1
    const o = d - net.total
    return { x: X[e] + TX[e] * o, y: net.cy[e], z: Z[e] + TZ[e] * o, tx: TX[e], tz: TZ[e], slope: 0 }
  }
  let lo = 1
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < d) lo = mid + 1
    else hi = mid
  }
  const i = lo
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
  let tx = TX[i - 1] + (TX[i] - TX[i - 1]) * t
  let tz = TZ[i - 1] + (TZ[i] - TZ[i - 1]) * t
  const l = Math.hypot(tx, tz) || 1
  tx /= l
  tz /= l
  return {
    x: X[i - 1] + (X[i] - X[i - 1]) * t,
    y: net.cy[i - 1] + (net.cy[i] - net.cy[i - 1]) * t,
    z: Z[i - 1] + (Z[i] - Z[i - 1]) * t,
    tx,
    tz,
    slope: net.cs[i - 1] + (net.cs[i] - net.cs[i - 1]) * t,
  }
}

function tangents(xs: number[], zs: number[]): { tx: number[]; tz: number[] } {
  const n = xs.length
  const tx: number[] = []
  const tz: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    let dx = xs[b] - xs[a]
    let dz = zs[b] - zs[a]
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    tx.push(dx)
    tz.push(dz)
  }
  return { tx, tz }
}

/** Largest allowed heading change over two samples on each side (about 1.6 units of track): radius of about 3 */
const MAX_TURN = 0.55

/** Solves the dense system A u = r (Gauss with partial pivoting); A is n x n, row-major. */
function solveDense(A: Float64Array, r: Float64Array[], n: number): void {
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i * n + c]) > Math.abs(A[piv * n + c])) piv = i
    if (piv !== c) {
      for (let k = 0; k < n; k++) {
        const t = A[c * n + k]
        A[c * n + k] = A[piv * n + k]
        A[piv * n + k] = t
      }
      for (const v of r) {
        const t = v[c]
        v[c] = v[piv]
        v[piv] = t
      }
    }
    const d = A[c * n + c] || 1e-12
    for (let i = c + 1; i < n; i++) {
      const f = A[i * n + c] / d
      if (f === 0) continue
      for (let k = c; k < n; k++) A[i * n + k] -= f * A[c * n + k]
      for (const v of r) v[i] -= f * v[c]
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    for (const v of r) {
      let sum = v[i]
      for (let k = i + 1; k < n; k++) sum -= A[i * n + k] * v[k]
      v[i] = sum / (A[i * n + i] || 1e-12)
    }
  }
}

/**
 * Makes sure no bend of the axis is tighter than MAX_TURN. Pinned samples (platforms, line ends) stay where they
 * are. A stretch of free samples between them that bends too sharply is replaced by the smoothest curve (minimal
 * bending energy, so it also keeps the direction at the platform ends) that stays as close as it can to the route.
 */
function relaxCurvature(xs: number[], zs: number[], pinned: boolean[], maxTurn = MAX_TURN): void {
  const n = xs.length
  const K = 2
  const turnAt = (j: number) => {
    const ax = xs[j] - xs[j - K]
    const az = zs[j] - zs[j - K]
    const bx = xs[j + K] - xs[j]
    const bz = zs[j + K] - zs[j]
    const la = Math.hypot(ax, az)
    const lb = Math.hypot(bx, bz)
    if (la < 1e-6 || lb < 1e-6) return 0
    return Math.acos(Math.min(1, Math.max(-1, (ax * bx + az * bz) / (la * lb))))
  }
  let j = 0
  while (j < n) {
    if (pinned[j]) {
      j++
      continue
    }
    const a = j
    while (j < n && !pinned[j]) j++
    const b = j - 1
    // needs two fixed samples on each side to keep the direction
    if (a < 2 || b > n - 3 || !pinned[a - 1] || !pinned[a - 2] || !pinned[b + 1] || !pinned[b + 2]) continue
    let worst = 0
    for (let q = Math.max(K, a - K); q <= Math.min(n - 1 - K, b + K); q++) worst = Math.max(worst, turnAt(q))
    if (worst <= maxTurn) continue
    const cnt = b - a + 1
    if (cnt > 160) continue
    const x0 = xs.slice(a, b + 1)
    const z0 = zs.slice(a, b + 1)
    // the more it has to bend, the less it sticks to the original route
    for (const lambda of [0.02, 0.006, 0.002, 0.0005, 0.0001]) {
      const A = new Float64Array(cnt * cnt)
      const rx = new Float64Array(cnt)
      const rz = new Float64Array(cnt)
      for (let i = a - 1; i <= b + 1; i++) {
        const idx = [i - 1, i, i + 1]
        const c = [1, -2, 1]
        for (let p = 0; p < 3; p++) {
          const ip = idx[p]
          if (ip < a || ip > b) continue
          for (let q = 0; q < 3; q++) {
            const iq = idx[q]
            if (iq >= a && iq <= b) A[(ip - a) * cnt + (iq - a)] += c[p] * c[q]
            else {
              rx[ip - a] -= c[p] * c[q] * xs[iq]
              rz[ip - a] -= c[p] * c[q] * zs[iq]
            }
          }
        }
      }
      for (let i = 0; i < cnt; i++) {
        A[i * cnt + i] += lambda
        rx[i] += lambda * x0[i]
        rz[i] += lambda * z0[i]
      }
      solveDense(A, [rx, rz], cnt)
      for (let i = 0; i < cnt; i++) {
        xs[a + i] = rx[i]
        zs[a + i] = rz[i]
      }
      let w2 = 0
      for (let q = Math.max(K, a - K); q <= Math.min(n - 1 - K, b + K); q++) w2 = Math.max(w2, turnAt(q))
      if (w2 <= maxTurn) break
    }
  }
}

interface Coarse {
  pts: P[]
  cum: number[]
  tx: number[]
  tz: number[]
}

/** A tram stop is a plain halt: two tracks with a kerb-high platform beside them, no roof, no building */
const TRAM_STATION: Station = { id: 'tram-stop', name: '', x: 0, y: 0, type: 'standard', design: { tracks: 2, platform: 'side', length: 'short', roof: 'open', ubahn: false } }
const onlyTrams = (ops: OperatorId[]) => ops.length > 0 && ops.every((op) => op === 'tram')

/** Sample index of a coarse line at arc length `d` */
function indexAtCum(c: Coarse, d: number): number {
  let lo = 0
  let hi = c.cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (c.cum[mid] < d) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** A tram stop runs beside the main platforms only if its line runs about parallel to them (within 35 degrees) */
const COS_BESIDE = Math.cos((35 * Math.PI) / 180)

interface Entry {
  line: Line
  /** the line runs through this station without stopping */
  pass?: boolean
  i: number
  tx: number
  tz: number
  sgn: 1 | -1
  zF: number
  zB: number
}

interface Siding3 {
  lineId: string
  zt: number
  side: 'f' | 'b'
}

/**
 * Point and lateral direction of a platform group's axis at arc position `s` (from its origin along the axis).
 * A straight group is a line; a curved one an arc of curvature `curv`. Lateral position z of the platform
 * is then `point + (nx, nz) * z`.
 */
export function groupFrame(g: Pick<StationGroup, 'ox' | 'oz' | 'ax' | 'az' | 'curv'>, s: number): { x: number; z: number; nx: number; nz: number } {
  const nax = -g.az
  const naz = g.ax
  const k = g.curv
  if (Math.abs(k) < 1e-6) return { x: g.ox + g.ax * s, z: g.oz + g.az * s, nx: nax, nz: naz }
  const th = k * s
  const sn = Math.sin(th)
  const cs = Math.cos(th)
  const a = sn / k
  const b = (1 - cs) / k
  return { x: g.ox + g.ax * a + nax * b, z: g.oz + g.az * a + naz * b, nx: -g.ax * sn + nax * cs, nz: -g.az * sn + naz * cs }
}

interface Box2 {
  ox: number
  oz: number
  ax: number
  az: number
  halfL: number
  halfW: number
}

/** Do two oriented rectangles overlap? Returns the push that separates them (minimum translation of `b`), or null. */
function overlapOf(a: Box2, b: Box2): { x: number; z: number; depth: number } | null {
  const dx = b.ox - a.ox
  const dz = b.oz - a.oz
  let best: { x: number; z: number; depth: number } | null = null
  for (const [ux, uz] of [[a.ax, a.az], [-a.az, a.ax], [b.ax, b.az], [-b.az, b.ax]]) {
    const reach = (r: Box2) => r.halfL * Math.abs(r.ax * ux + r.az * uz) + r.halfW * Math.abs(-r.az * ux + r.ax * uz)
    const dist = dx * ux + dz * uz
    const depth = reach(a) + reach(b) - Math.abs(dist)
    if (depth <= 0) return null
    if (!best || depth < best.depth) {
      const sg = dist >= 0 ? 1 : -1
      best = { x: ux * sg, z: uz * sg, depth }
    }
  }
  return best
}

/** How far the ends of a curved platform (with its roof or hall) swing out sideways from the tangent at its middle */
function swing(g: Pick<StationGroup, 'curv' | 'layout'>): number {
  const h = (g.layout.length + 1.6 * RAIL) / 2
  return (Math.abs(g.curv) * h * h) / 2
}

/** Shortest platform a crowded station is cut down to */
const MIN_PLATFORM = 1.5
/** Extra length of roofs and halls beyond the platforms, and extra width beside them */
const FOOT_L = 0.8 * RAIL
const FOOT_W = 0.5 * RAIL

/**
 * Stations that stand close together would grow into each other (platforms, roofs, halls). Their platforms are
 * shortened until they clear each other; if they are too close even then, they are pushed apart a little.
 */
function footBox(g: StationGroup, len: number): Box2 {
  return { ox: g.ox, oz: g.oz, ax: g.ax, az: g.az, halfL: len / 2 + FOOT_L, halfW: g.layout.halfWidth + FOOT_W + swing({ curv: g.curv, layout: { ...g.layout, length: len } }) }
}

export function separateStations(all: { id: string; g: StationGroup }[]): void {
  const box = footBox
  const pushed = new Map<StationGroup, number>()
  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const A = all[i]
        const B = all[j]
        if (A.id === B.id || Math.abs(A.g.lift - B.g.lift) > 1) continue
        const LA = A.g.layout.length
        const LB = B.g.layout.length
        if (!overlapOf(box(A.g, LA), box(B.g, LB))) continue
        // shorten both in the same proportion until they clear each other
        let f = 1
        while (f > 0.2) {
          f -= 0.05
          if (!overlapOf(box(A.g, Math.max(MIN_PLATFORM, LA * f)), box(B.g, Math.max(MIN_PLATFORM, LB * f)))) break
        }
        const nA = Math.max(MIN_PLATFORM, LA * f)
        const nB = Math.max(MIN_PLATFORM, LB * f)
        if (nA < LA - 1e-6) A.g.layout = { ...A.g.layout, length: nA }
        if (nB < LB - 1e-6) B.g.layout = { ...B.g.layout, length: nB }
        changed = true
        // still touching at the shortest platforms: move them apart (at most 1.6 each)
        const hit = overlapOf(box(A.g, nA), box(B.g, nB))
        if (hit) {
          const room = (g: StationGroup) => Math.max(0, 1.6 * RAIL - (pushed.get(g) ?? 0))
          const half = hit.depth / 2 + 0.05
          const mA = Math.min(half, room(A.g))
          const mB = Math.min(half, room(B.g))
          A.g.ox -= hit.x * mA
          A.g.oz -= hit.z * mA
          B.g.ox += hit.x * mB
          B.g.oz += hit.z * mB
          pushed.set(A.g, (pushed.get(A.g) ?? 0) + mA)
          pushed.set(B.g, (pushed.get(B.g) ?? 0) + mB)
        }
      }
    }
    if (!changed) break
  }
}

/** A platform's total turn (radians) below which it stays straight, and the sharpest a platform may be bent */
const CURVE_MIN = 0.03
const CURVE_MAX_TURN = 0.55
const CURVE_MAX_K = 1 / (8 * RAIL)

/**
 * A station on a bend gets a curved platform. The curvature is read off the tracks of its lines over the length
 * of the platform; the axis of the group turns to the direction the tracks have at the middle of the station.
 */
function curveGroup(g: StationGroup, list: Entry[], coarse: Map<string, Coarse>): void {
  if (g.design.angle !== null || !list.length) return
  const H = Math.max(3, Math.round(g.layout.length / 2 / STEP))
  const win: { c: Coarse; a: number; b: number }[] = []
  for (const e of list) {
    const c = coarse.get(e.line.id)
    if (!c) continue
    const a = Math.max(0, e.i - H)
    const b = Math.min(c.pts.length - 1, e.i + H)
    if (b - a >= H) win.push({ c, a, b })
  }
  if (!win.length) return
  // direction of the chord over the platform length, aligned with the group axis
  let sx = 0
  let sz = 0
  for (const w of win) {
    let dx = w.c.pts[w.b].x - w.c.pts[w.a].x
    let dz = w.c.pts[w.b].z - w.c.pts[w.a].z
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    const s = dx * g.ax + dz * g.az >= 0 ? 1 : -1
    sx += dx * s
    sz += dz * s
  }
  const ml = Math.hypot(sx, sz)
  if (ml < 1e-6) return
  const ax = sx / ml
  const az = sz / ml
  let kSum = 0
  for (const w of win) {
    const s = (w.c.pts[w.b].x - w.c.pts[w.a].x) * ax + (w.c.pts[w.b].z - w.c.pts[w.a].z) * az >= 0 ? 1 : -1
    // heading at both ends, in the frame (axis, lateral); oriented along the axis
    const head = (i: number) => {
      const tx = w.c.tx[i] * s
      const tz = w.c.tz[i] * s
      return Math.atan2(-tx * az + tz * ax, tx * ax + tz * az)
    }
    let turn = head(s > 0 ? w.b : w.a) - head(s > 0 ? w.a : w.b)
    if (turn > Math.PI) turn -= Math.PI * 2
    if (turn < -Math.PI) turn += Math.PI * 2
    kSum += turn / Math.max(1e-6, w.c.cum[w.b] - w.c.cum[w.a])
  }
  let k = kSum / win.length
  if (Math.abs(k * g.layout.length) < CURVE_MIN) return
  const kMax = Math.min(CURVE_MAX_K, CURVE_MAX_TURN / g.layout.length)
  k = Math.max(-kMax, Math.min(kMax, k))
  g.curv = k
  g.ax = ax
  g.az = az
  g.angle = Math.atan2(-az, ax)
}

/**
 * Lines that run side by side keep the tracks of one direction together: all tracks against the direction of travel on
 * one side, all along it on the other. With one pair per line the two middle tracks would have to cross in front of
 * every station that the lines share (and again behind it); grouped by direction they simply merge into the station's
 * two tracks. Trams and heavy rail are not mixed.
 */
export function groupTracks(lines: LineNet[]) {
  if (lines.length < 2) return
  const reach = 3.6 * LANE_GAP
  const cellSize = 4
  const grid = new Map<string, { li: number; j: number }[]>()
  lines.forEach((ln, li) => {
    for (let j = 0; j < ln.n; j++) {
      const k = `${Math.floor(ln.cx[j] / cellSize)},${Math.floor(ln.cz[j] / cellSize)}`
      const list = grid.get(k)
      if (list) list.push({ li, j })
      else grid.set(k, [{ li, j }])
    }
  })
  const dF = lines.map((ln) => new Array<number>(ln.n).fill(0))
  const dB = lines.map((ln) => new Array<number>(ln.n).fill(0))
  type Near = Map<number, { u: number; s: number; d: number }>
  // pass 1: who runs alongside every sample of every line (and on which side)
  const nearOf: (Near | null)[][] = lines.map((la, a) => {
    const tram = la.line.operator === 'tram'
    const res: (Near | null)[] = new Array(la.n).fill(null)
    for (let j = 0; j < la.n; j++) {
      if (la.free[j] < 0.02) continue
      const nx = -la.tz[j]
      const nz = la.tx[j]
      const near: Near = new Map()
      const gx = Math.floor(la.cx[j] / cellSize)
      const gz = Math.floor(la.cz[j] / cellSize)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          for (const o of grid.get(`${gx + ox},${gz + oz}`) ?? []) {
            if (o.li === a) continue
            const lb = lines[o.li]
            // trams and heavy rail are never bundled together
            if ((lb.line.operator === 'tram') !== tram || lb.free[o.j] < 0.02) continue
            const dx = lb.cx[o.j] - la.cx[j]
            const dz = lb.cz[o.j] - la.cz[j]
            const dist = Math.hypot(dx, dz)
            if (dist > reach) continue
            const dot = la.tx[j] * lb.tx[o.j] + la.tz[j] * lb.tz[o.j]
            if (Math.abs(dot) < 0.96) continue
            const prev = near.get(o.li)
            if (!prev || dist < prev.d) near.set(o.li, { u: dx * nx + dz * nz, s: dot > 0 ? 1 : -1, d: dist })
          }
        }
      }
      if (near.size) res[j] = near
    }
    return res
  })
  // pass 2: which side another line is on is decided ONCE for the whole stretch they run together (a run of samples),
  // not sample by sample. The centre lines of two lines wobble against each other (different neighbours at the next
  // station bend their curves differently); sorting by the momentary position let a train hop to the other pair of rails.
  const RUN_GAP = 16
  const sideOf: Map<number, number>[][] = lines.map((la, a) => {
    const res: Map<number, number>[] = la.cx.map(() => new Map<number, number>())
    const runs = new Map<number, { from: number; to: number; sum: number }[]>()
    for (let j = 0; j < la.n; j++) {
      const near = nearOf[a][j]
      if (!near) continue
      for (const [b, v] of near) {
        const list = runs.get(b) ?? []
        runs.set(b, list)
        const last = list[list.length - 1]
        if (last && j - last.to <= RUN_GAP) {
          last.to = j
          last.sum += v.u
        } else list.push({ from: j, to: j, sum: v.u })
      }
    }
    for (const [b, list] of runs) {
      for (const r of list) {
        if (Math.abs(r.sum) < 1e-6) continue
        const sg = r.sum < 0 ? -1 : 1
        for (let j = r.from; j <= r.to; j++) res[j].set(b, sg)
      }
    }
    return res
  })
  // pass 3: the tracks of every bundle and the lane each line takes
  lines.forEach((la, a) => {
    // trams and heavy rail are never bundled together, so the whole bundle has the track spacing of this line
    const TO = TRACK_OFFSET * railOf(la.line.operator)
    const pitch = 2 * TO
    for (let j = 0; j < la.n; j++) {
      const near = nearOf[a][j]
      if (!near) continue
      // every track of the bundle with the side it uses now (lateral position across the bundle) and its direction;
      // `key` only sorts: the side comes from the whole stretch, the distance from the momentary position
      const members = [{ u: 0, key: 0, s: 1, self: true }, ...[...near].map(([b, v]) => ({ u: v.u, key: (sideOf[a][j].get(b) ?? (v.u < 0 ? -1 : 1)) * (Math.abs(v.u) + 1e-3), s: v.s, self: false }))]
      const tracks: { pos: number; key: number; dir: number; self: boolean; f: boolean }[] = []
      // lines on the very same track (the same stretch of the same kind) share it: one slot, not two side by side
      const addTrack = (pos: number, key: number, dir: number, self: boolean, f: boolean) => {
        const hit = tracks.find((t) => t.dir === dir && Math.abs(t.pos - pos) < 0.05)
        if (!hit) tracks.push({ pos, key, dir, self, f })
        else if (self) {
          hit.self = true
          hit.f = f
        }
      }
      for (const m of members) {
        addTrack(m.u + m.s * TO, m.key + m.s * TO, m.s, m.self, true)
        addTrack(m.u - m.s * TO, m.key - m.s * TO, -m.s, m.self, false)
      }
      // against the direction of travel on the left (-normal), along it on the right: the same order as a line's own pair
      const ordered = [...tracks.filter((t) => t.dir < 0).sort((p, q) => p.key - q.key), ...tracks.filter((t) => t.dir > 0).sort((p, q) => p.key - q.key)]
      const centre = members.reduce((s, m) => s + m.u, 0) / members.length
      ordered.forEach((t, i) => {
        if (!t.self) return
        const target = centre + (i - (ordered.length - 1) / 2) * pitch
        if (t.f) dF[a][j] = target - TO
        else dB[a][j] = target + TO
      })
    }
  })
  lines.forEach((ln, li) => {
    if (!dF[li].some((v) => v !== 0) && !dB[li].some((v) => v !== 0)) return
    // a bundle appears and ends gradually: smooth the shifts along the line
    const W = 10
    const smooth = (src: number[]) =>
      src.map((_, j) => {
        let sum = 0
        let ws = 0
        for (let d = -W; d <= W; d++) {
          const k = j + d
          if (k < 0 || k >= ln.n) continue
          const wt = W + 1 - Math.abs(d)
          sum += src[k] * wt
          ws += wt
        }
        return sum / ws
      })
    const sf = smooth(dF[li])
    const sb = smooth(dB[li])
    for (let j = 0; j < ln.n; j++) {
      const nx = -ln.tz[j]
      const nz = ln.tx[j]
      ln.fx[j] += nx * sf[j] * ln.free[j]
      ln.fz[j] += nz * sf[j] * ln.free[j]
      ln.bx[j] += nx * sb[j] * ln.free[j]
      ln.bz[j] += nz * sb[j] * ln.free[j]
    }
    // the sidings leave and rejoin the track: they move with it
    for (const sd of ln.sidings) {
      const sh = sd.side === 'f' ? sf : sb
      for (let k = 0; k < sd.x.length; k++) {
        const j = Math.min(ln.n - 1, sd.j0 + k)
        sd.x[k] += -ln.tz[j] * sh[j] * ln.free[j]
        sd.z[k] += ln.tx[j] * sh[j] * ln.free[j]
      }
      const t = tangents(sd.x, sd.z)
      sd.tx = t.tx
      sd.tz = t.tz
    }
    const ft = tangents(ln.fx, ln.fz)
    const bt = tangents(ln.bx, ln.bz)
    ln.ftx = ft.tx
    ln.ftz = ft.tz
    ln.btx = bt.tx
    ln.btz = bt.tz
  })
}

/** A crossover is about this many times as long as the two tracks are apart (a gentle switch angle) */
const CROSS_RATIO = 8
/** Shortest crossover */
const CROSS_MIN = 1.0

/**
 * A train that changes ends at a terminal leaves on the other track than it arrived on. It does so on a short crossover
 * right behind the platform (rails of its own, so the train never drives across the bed between the tracks).
 * Both the rails and the train read the same blend: `Stop.cross` is its length, the shape is smooth01 from the arrival
 * track to the departure track (see `carPoses`).
 */
export function addCrossovers(lines: LineNet[]) {
  for (const ln of lines) {
    ln.crossovers = []
    // a ring has no terminals: its trains never change ends
    if (ln.stops.length < 2 || ln.line.loop) continue
    for (const [stop, out, from, to] of [
      [ln.stops[0], 1, 'b', 'f'],
      [ln.stops[ln.stops.length - 1], -1, 'f', 'b'],
    ] as [Stop, 1 | -1, Which, Which][]) {
      const d0 = stop.d + out * stop.half
      const a = posOn(ln, 'f', d0)
      const b = posOn(ln, 'b', d0)
      const sep = Math.hypot(a.x - b.x, a.z - b.z)
      stop.cross = Math.min(stop.taper, Math.max(CROSS_MIN * (railOf(ln.line.operator) / RAIL + 0.5), CROSS_RATIO * sep))
      const x: number[] = []
      const z: number[] = []
      const y: number[] = []
      const K = 12
      for (let k = 0; k <= K; k++) {
        const t = k / K
        const d = d0 + out * stop.cross * t
        const p = posOn(ln, from, d)
        const q = posOn(ln, to, d)
        const w = smooth01(t)
        x.push(p.x + (q.x - p.x) * w)
        z.push(p.z + (q.z - p.z) * w)
        y.push(p.y + (q.y - p.y) * w)
      }
      const tg = tangents(x, z)
      ln.crossovers.push({ x, z, y, tx: tg.tx, tz: tg.tz })
    }
  }
}

/**
 * Lines that cross outside of stations do not touch: the one on top climbs onto a viaduct, passes over the other
 * and comes down again. Stations deal with their own crossings through platform levels.
 */
export function separateCrossings(lines: LineNet[]) {
  const R = 1.5
  const cellSize = 2.5
  const grid = new Map<string, { li: number; j: number }[]>()
  const key = (x: number, z: number) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`
  lines.forEach((ln, li) => {
    for (let j = 0; j < ln.n; j++) {
      const k = key(ln.cx[j], ln.cz[j])
      const list = grid.get(k)
      if (list) list.push({ li, j })
      else grid.set(k, [{ li, j }])
    }
  })
  const inZone = (ln: LineNet, d: number) => ln.stops.some((s) => Math.abs(d - s.d) < s.half + s.taper + 3) || ln.through.some((s) => Math.abs(d - s.d) < s.half + s.taper + 3)
  /** Do the two lines run side by side (close and parallel) within about 10 units of these samples? Then they part or join here. */
  const runBeside = (la: LineNet, j: number, lb: LineNet, k: number) => {
    for (let p = -25; p <= 25; p += 2) {
      const ja = j + p
      if (ja < 0 || ja >= la.n) continue
      for (let q = -25; q <= 25; q += 2) {
        const kb = k + q
        if (kb < 0 || kb >= lb.n) continue
        if (Math.hypot(lb.cx[kb] - la.cx[ja], lb.cz[kb] - la.cz[ja]) < 0.9 && Math.abs(la.tx[ja] * lb.tx[kb] + la.tz[ja] * lb.tz[kb]) > 0.95) return true
      }
    }
    return false
  }
  type Event = { a: number; b: number; da: number; db: number; sin: number }
  const events: Event[] = []
  lines.forEach((la, a) => {
    for (let j = 0; j < la.n; j++) {
      if (inZone(la, la.cum[j])) continue
      const gx = Math.floor(la.cx[j] / cellSize)
      const gz = Math.floor(la.cz[j] / cellSize)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          for (const o of grid.get(`${gx + ox},${gz + oz}`) ?? []) {
            if (o.li <= a) continue
            const lb = lines[o.li]
            if (Math.hypot(lb.cx[o.j] - la.cx[j], lb.cz[o.j] - la.cz[j]) > R) continue
            const dot = Math.abs(la.tx[j] * lb.tx[o.j] + la.tz[j] * lb.tz[o.j])
            if (dot > 0.9) continue // running side by side, not crossing
            if (inZone(lb, lb.cum[o.j])) continue
            const prev = events.find((e) => e.a === a && e.b === o.li && Math.abs(e.da - la.cum[j]) < 8)
            // two lines that run side by side a little further on (or back) only part or join here: no crossing
            if (!prev && !runBeside(la, j, lb, o.j)) events.push({ a, b: o.li, da: la.cum[j], db: lb.cum[o.j], sin: Math.sqrt(1 - dot * dot) })
          }
        }
      }
    }
  })
  const bumps = lines.map(() => [] as { d: number; h: number; flat: number }[])
  for (const e of events) {
    const A = lines[e.a]
    const B = lines[e.b]
    const ja = A.cum.findIndex((d) => d >= e.da)
    const jb = B.cum.findIndex((d) => d >= e.db)
    const liftA = A.cy[Math.max(0, ja)]
    const liftB = B.cy[Math.max(0, jb)]
    if (Math.abs(liftA - liftB) >= LEVEL_H * 0.8) continue
    const upperIsB = liftB >= liftA
    const lower = upperIsB ? liftA : liftB
    // the crossing zone must cover the width of the other line's beds along this line
    const flat = Math.min(6, Math.max(2.2, 1.7 / Math.max(0.3, e.sin)))
    if (upperIsB) bumps[e.b].push({ d: e.db, h: lower + LEVEL_H, flat })
    else bumps[e.a].push({ d: e.da, h: lower + LEVEL_H, flat })
  }
  lines.forEach((ln, li) => {
    if (!bumps[li].length) return
    for (const bump of bumps[li]) {
      for (let j = 0; j < ln.n; j++) {
        const dd = Math.abs(ln.cum[j] - bump.d)
        const wgt = smooth01(1 - Math.min(1, Math.max(0, (dd - bump.flat) / RAMP_PER_LEVEL)))
        ln.cy[j] = Math.max(ln.cy[j], bump.h * wgt)
      }
    }
    for (let j = 0; j < ln.n; j++) {
      const a = Math.max(0, j - 1)
      const b = Math.min(ln.n - 1, j + 1)
      ln.cs[j] = (ln.cy[b] - ln.cy[a]) / ((ln.cum[b] - ln.cum[a]) || 1)
    }
    // sidings follow the track height
    for (const sd of ln.sidings) {
      for (let k = 0; k < sd.y.length; k++) {
        let best = 0
        let bd = Infinity
        for (let j = 0; j < ln.n; j++) {
          const d = (ln.cx[j] - sd.x[k]) ** 2 + (ln.cz[j] - sd.z[k]) ** 2
          if (d < bd) {
            bd = d
            best = j
          }
        }
        sd.y[k] = ln.cy[best]
      }
    }
  })
}

export function buildNetwork3D(doc: CityDoc): Network3D {
  const half = doc.size / 2
  const field = buildField(doc.terrain, doc.size)
  const sample = makeSampler(field, doc.size)
  const groundAt = (x: number, z: number) => groundHeight(sample(x + half, z + half))
  // the free curves of the map; a change of lane is spread over about five cells
  // lines on the same stretch share one lane: they run on the same rails
  const lanes = layoutLines(doc, LANE_GAP, { smooth: 10, source: 'geo', share: true })
  const lineList = Object.values(doc.lines)

  // ---- pass A: smooth axis of every line, with generous run-out at both ends ---------------
  const coarse = new Map<string, Coarse>()
  for (const line of lineList) {
    const lat = lanes[line.id]
    if (!lat || lat.length < 2) continue
    const world: P[] = lat.map((p) => ({ x: p.x + 0.5 - half, z: p.y + 0.5 - half }))
    // the curve is smooth already: no corners to round off
    const rounded = roundPolyline(extendEnds(cleanPolyline(world), RUN_OUT), 0)
    const r = resample(rounded, STEP)
    const t = tangents(r.pts.map((p) => p.x), r.pts.map((p) => p.z))
    coarse.set(line.id, { pts: r.pts, cum: r.cum, tx: t.tx, tz: t.tz })
  }

  // The sample at or after `from` where the line passes a station. A line that visits a station twice (a loop that ends
  // where it began) passes it at both ends: the first pass that comes about as close as the closest one counts, so the
  // stops stay in the order of the route.
  const nearest = (c: Coarse, sx: number, sz: number, from: number) => {
    const n = c.pts.length
    const dist = (i: number) => Math.hypot(c.pts[i].x - sx, c.pts[i].z - sz)
    let min = Infinity
    let argMin = from
    for (let i = from; i < n; i++) {
      const d = dist(i)
      if (d < min) {
        min = d
        argMin = i
      }
    }
    let prev = Infinity
    for (let i = from; i < n; i++) {
      const d = dist(i)
      const next = i + 1 < n ? dist(i + 1) : Infinity
      if (d <= prev && d <= next && d <= min + 0.35) return i
      prev = d
    }
    return argMin
  }

  // ---- pass B: platform groups of every station -------------------------------------------
  const groupsOf = new Map<string, StationGroup[]>()
  const membersOf = new Map<string, Map<number, Entry[]>>()
  /** a tram stop that stands crosswise to its station moves along its own line: arc length from the station point */
  const shiftOf = new Map<string, number>()
  const sidingPlan = new Map<string, Siding3[]>() // `${stationId}|${group}` -> sidings
  const entryOf = new Map<string, Entry>() // `${lineId}|${stationId}`
  const stationBase = new Map<string, { st: Station; design: ResolvedDesign; layout: StationLayout }>()

  for (const st of Object.values(doc.stations)) {
    const sx = st.x + 0.5 - half
    const sz = st.y + 0.5 - half
    const allOps = stationOperators(doc, st.id)
    const minLen = (ops: OperatorId[]) => ops.reduce((m, op) => Math.max(m, trainLength(VEHICLES[op]) + 1.2), 0)
    const tramsOnly = onlyTrams(allOps)
    const baseDesign = tramsOnly ? resolveDesign(TRAM_STATION, allOps) : resolveDesign(st, allOps)
    stationBase.set(st.id, { st, design: baseDesign, layout: scaleLayout(layoutStation(baseDesign, minLen(allOps)), railOf(tramsOnly ? 'tram' : 'sbahn')) })

    const everyEntry: Entry[] = []
    for (const line of lineList) {
      const passing = passesThrough(line, st.id)
      if ((!stopsAt(line, st.id) && !passing) || everyEntry.some((e) => e.line.id === line.id)) continue
      const c = coarse.get(line.id)
      if (!c) continue
      const i = nearest(c, sx, sz, 0)
      // overall direction through the station: the chord over a platform length, not the (corner-rounded) local tangent
      const w0 = Math.max(0, i - 24)
      const w1 = Math.min(c.pts.length - 1, i + 24)
      let cdx = c.pts[w1].x - c.pts[w0].x
      let cdz = c.pts[w1].z - c.pts[w0].z
      const cl = Math.hypot(cdx, cdz) || 1
      cdx /= cl
      cdz /= cl
      everyEntry.push({ line, pass: passing, i, tx: cdx, tz: cdz, sgn: 1, zF: 0, zB: 0 })
    }
    const entries = everyEntry.filter((e) => !e.pass)
    // lines that run through (no platform): they are put on a bypass track of the group they run parallel to, further below
    const passEntries = everyEntry.filter((e) => e.pass)
    if (!entries.length) continue

    const mains = entries.filter((e) => e.line.operator !== 'tram')
    const allNormal = mains.length ? mains : entries.filter((e) => e.line.operator === 'tram')
    const trams = mains.length ? entries.filter((e) => e.line.operator === 'tram') : []
    // A metro line never comes up to the surface: where it calls at a station with surface traffic (and the station is not
    // set to be underground or on the ground by hand), it gets its own platforms below the station.
    const deepMetro = st.underground === undefined && !isUndergroundStation(doc, st)
    const deep = deepMetro ? allNormal.filter((e) => e.line.operator === 'ubahn') : []
    const normal = deep.length ? allNormal.filter((e) => e.line.operator !== 'ubahn') : allNormal

    const groups: StationGroup[] = []
    const members = new Map<number, Entry[]>()

    // main platform groups: the lines are spread over the number of levels the user chose, by direction
    const dirs = normal.map((e) => lineDirectionAtStation(doc, e.line, st.id) ?? { x: e.tx, z: e.tz })
    normal.forEach((e, i) => {
      e.tx = dirs[i].x
      e.tz = dirs[i].z
    })
    const labels = clusterByDirection(dirs, st.levels ?? 1)
    const levelCount = labels.length ? Math.max(...labels) + 1 : 0
    // the metro platforms: one underground group below the rest (listed after the surface groups, which stay the station's main one)
    const deepDirs = deep.map((e) => lineDirectionAtStation(doc, e.line, st.id) ?? { x: e.tx, z: e.tz })
    deep.forEach((e, i) => {
      e.tx = deepDirs[i].x
      e.tz = deepDirs[i].z
    })
    for (let k = 0; k < levelCount + (deep.length ? 1 : 0); k++) {
      const isDeep = k >= levelCount
      const list = isDeep ? deep : normal.filter((_, i) => labels[i] === k)
      const mean = meanDirection(list.map((e) => ({ x: e.tx, z: e.tz })))
      let ax = mean.x
      let az = mean.z
      const groupOps = [...new Set(list.map((e) => e.line.operator))]
      const designLevel = isDeep ? 0 : k
      const resolved = onlyTrams(groupOps) ? resolveDesign(TRAM_STATION, groupOps, designLevel) : resolveDesign(st, groupOps, designLevel)
      if (resolved.angle !== null) {
        const a = (resolved.angle * Math.PI) / 180
        ax = Math.cos(a)
        az = -Math.sin(a)
      }
      const lift = isDeep ? UG_LIFT : stationLift(doc, st, levelCount, k)
      const g: StationGroup = {
        index: groups.length,
        kind: 'main',
        level: designLevel,
        lift,
        ax,
        az,
        curv: 0,
        annex: -1,
        halt: onlyTrams(groupOps),
        angle: Math.atan2(-az, ax),
        ox: sx,
        oz: sz,
        design: resolved,
        layout: stationBase.get(st.id)!.layout,
        usedZ: [],
        lineIds: list.map((e) => e.line.id),
        passIds: [],
      }
      groups.push(g)
      members.set(g.index, list)
    }
    // trams that stop at a station with other traffic get their own stop beside it
    for (const e of trams) {
      let g = groups.find((x) => x.kind === 'tram' && Math.abs(e.tx * x.ax + e.tz * x.az) >= COS_GROUP)
      if (!g) {
        g = {
          index: groups.length,
          kind: 'tram',
          level: 0,
          lift: 0,
          ax: e.tx,
          az: e.tz,
          curv: 0,
          annex: -1,
          halt: true,
          angle: Math.atan2(-e.tz, e.tx),
          ox: sx,
          oz: sz,
          design: baseDesign,
          layout: stationBase.get(st.id)!.layout,
          usedZ: [],
          lineIds: [],
          passIds: [],
        }
        groups.push(g)
        members.set(g.index, [])
      }
      g.lineIds.push(e.line.id)
      members.get(g.index)!.push(e)
    }

    // Lines that run through without stopping take a bypass track beside the platforms of the group they run parallel to.
    // A metro line only runs through underground: where the station has no underground platforms it stays below the station.
    const passOf = new Map<number, Entry[]>()
    for (const e of passEntries) {
      const metro = e.line.operator === 'ubahn'
      const fits = groups.filter((g) => (metro ? g.lift <= UG_COVER : g.lift > UG_COVER))
      if (!fits.length) continue
      const dir = lineDirectionAtStation(doc, e.line, st.id)
      if (dir) {
        e.tx = dir.x
        e.tz = dir.z
      }
      let best = fits[0]
      for (const g of fits) if (Math.abs(e.tx * g.ax + e.tz * g.az) > Math.abs(e.tx * best.ax + e.tz * best.az) + 1e-6) best = g
      best.passIds.push(e.line.id)
      const list = passOf.get(best.index)
      if (list) list.push(e)
      else passOf.set(best.index, [e])
    }

    // design and layout of every group (spread operators over its own tracks)
    for (const g of groups) {
      const list = members.get(g.index)!
      const ops = [...new Set(list.map((e) => e.line.operator))]
      const bypass = passOf.has(g.index)
      if (g.kind === 'tram') {
        g.design = resolveDesign(TRAM_STATION, ['tram'])
        g.layout = scaleLayout(layoutStation(g.design, minLen(['tram']), bypass), TRAM)
      } else {
        g.design = g.halt ? resolveDesign(TRAM_STATION, ops, g.level) : resolveDesign(st, ops, g.level)
        g.layout = scaleLayout(layoutStation(g.design, minLen(ops), bypass), railOf(g.halt ? 'tram' : 'sbahn'))
      }
    }
    // station tracks every line uses, and the unused ones that become sidings
    for (const g of groups) {
      const list = members.get(g.index)!
      for (const e of list) {
        const dot = e.tx * g.ax + e.tz * g.az
        e.sgn = dot >= 0 ? 1 : -1
        e.zF = trackFor(g.layout, e.line.operator, e.sgn)
        e.zB = trackFor(g.layout, e.line.operator, e.sgn > 0 ? -1 : 1)
        g.usedZ.push(e.zF, e.zB)
        entryOf.set(`${e.line.id}|${st.id}`, e)
      }
      for (const e of passOf.get(g.index) ?? []) {
        const dot = e.tx * g.ax + e.tz * g.az
        e.sgn = dot >= 0 ? 1 : -1
        e.zF = bypassFor(g.layout, e.sgn)
        e.zB = bypassFor(g.layout, e.sgn > 0 ? -1 : 1)
        g.usedZ.push(e.zF, e.zB)
        entryOf.set(`${e.line.id}|${st.id}`, e)
      }
      const plan: Siding3[] = []
      for (const t of g.layout.tracks) {
        if (g.usedZ.some((u) => Math.abs(u - t.z) < 0.08)) continue
        let best: Siding3 | null = null
        let bestD = Infinity
        for (const e of list) {
          for (const [z, side] of [[e.zF, 'f'], [e.zB, 'b']] as [number, 'f' | 'b'][]) {
            const d = Math.abs(z - t.z)
            if (d < bestD) {
              bestD = d
              best = { lineId: e.line.id, zt: t.z, side }
            }
          }
        }
        if (best) plan.push(best)
      }
      sidingPlan.set(`${st.id}|${g.index}`, plan)
    }
    groupsOf.set(st.id, groups)
    membersOf.set(st.id, members)
  }

  // a station on a bend follows the bend; the tram stop sits beside the main station (clear of its bent hall);
  // neighbouring stations must not grow into each other
  for (const [id, gs] of groupsOf) {
    for (const g of gs) curveGroup(g, membersOf.get(id)?.get(g.index) ?? [], coarse)
    const main0 = gs.find((g) => g.kind === 'main')
    const st = doc.stations[id]
    if (!main0 || !st) continue
    for (const g of gs) {
      if (g.kind !== 'tram') continue
      const ml = membersOf.get(id)?.get(g.index) ?? []
      // a tram that crosses the main platforms at a steep angle cannot run beside them: its stop moves along its own line until it clears the hall
      if (Math.abs(g.ax * main0.ax + g.az * main0.az) < COS_BESIDE && ml.length) {
        const c = coarse.get(ml[0].line.id)
        if (c) {
          const total = c.cum[c.pts.length - 1]
          const mainBox = footBox(main0, main0.layout.length)
          let best: { sh: number; idx: number } | null = null
          for (let D = 0; D <= 18 && !best; D += 0.4) {
            for (const dir of [1, -1]) {
              const d = c.cum[ml[0].i] + dir * D
              if (d < RUN_OUT + 0.5 || d > total - RUN_OUT - 0.5) continue
              const idx = indexAtCum(c, d)
              const flip = c.tx[idx] * g.ax + c.tz[idx] * g.az >= 0 ? 1 : -1
              const cand: Box2 = { ox: c.pts[idx].x, oz: c.pts[idx].z, ax: c.tx[idx] * flip, az: c.tz[idx] * flip, halfL: g.layout.length / 2 + FOOT_L, halfW: g.layout.halfWidth + FOOT_W }
              if (!overlapOf(mainBox, cand)) {
                best = { sh: dir * D, idx }
                break
              }
            }
          }
          if (best) {
            const idx = best.idx
            const flip = c.tx[idx] * g.ax + c.tz[idx] * g.az >= 0 ? 1 : -1
            g.ox = c.pts[idx].x
            g.oz = c.pts[idx].z
            g.ax = c.tx[idx] * flip
            g.az = c.tz[idx] * flip
            g.angle = Math.atan2(-g.az, g.ax)
            g.curv = 0
            for (const e of ml) shiftOf.set(`${e.line.id}|${id}`, best.sh)
            const v = -(g.ox - main0.ox) * main0.az + (g.oz - main0.oz) * main0.ax
            main0.annex = v > 0 ? -1 : 1
            continue
          }
        }
      }
      // the tram stop goes on the side the tram comes from, so its line never has to cross the main platforms or hall
      const sx0 = st.x + 0.5 - half
      const sz0 = st.y + 0.5 - half
      let lat = 0
      for (const e of membersOf.get(id)?.get(g.index) ?? []) {
        const c = coarse.get(e.line.id)
        if (!c) continue
        const total = c.cum[c.pts.length - 1]
        for (const i of [Math.max(0, e.i - 24), Math.min(c.pts.length - 1, e.i + 24)]) {
          // the run-out added beyond the end of a line is no real track
          if (c.cum[i] < RUN_OUT + 1 || c.cum[i] > total - RUN_OUT - 1) continue
          const v = -(c.pts[i].x - sx0) * main0.az + (c.pts[i].z - sz0) * main0.ax
          if (Math.abs(v) > Math.abs(lat)) lat = v
        }
      }
      const side: 1 | -1 = lat < -0.6 ? -1 : 1
      const swingMain = (side > 0 ? Math.max(0, main0.curv) : Math.max(0, -main0.curv)) * swing(main0)
      const swingTram = (side > 0 ? Math.max(0, -g.curv) : Math.max(0, g.curv)) * swing(g)
      const off = main0.layout.halfWidth + TRAM_GAP + g.layout.halfWidth + swingMain + swingTram
      g.ox = sx0 - main0.az * off * side
      g.oz = sz0 + main0.ax * off * side
      main0.annex = side > 0 ? -1 : 1
    }
  }
  separateStations([...groupsOf].flatMap(([id, gs]) => gs.map((g) => ({ id, g }))))

  // ---- pass C: tracks of every line ---------------------------------------------------------
  const lines: LineNet[] = []
  for (const line of lineList) {
    const c = coarse.get(line.id)
    if (!c) continue
    const raw: { id: string; i: number }[] = []
    let from = 0
    for (const id of line.stations) {
      const st = doc.stations[id]
      if (!st || !groupsOf.has(id) || !entryOf.has(`${line.id}|${id}`)) continue
      let i = nearest(c, st.x + 0.5 - half, st.y + 0.5 - half, from)
      const sh = shiftOf.get(`${line.id}|${id}`)
      if (sh) i = Math.max(from, indexAtCum(c, c.cum[i] + sh))
      raw.push({ id, i })
      from = i
    }
    if (raw.length < 2) continue

    const lenOf = (id: string) => {
      const e = entryOf.get(`${line.id}|${id}`)!
      const g = groupsOf.get(id)!.find((x) => x.lineIds.includes(line.id) || x.passIds.includes(line.id))!
      return { e, g, L: g.layout.length }
    }
    // cut the run-out so the buffer stops sit just behind the terminal platforms
    const L0 = lenOf(raw[0].id).L
    const L1 = lenOf(raw[raw.length - 1].id).L
    const dStart = c.cum[raw[0].i] - (L0 / 2 + BUFFER_CLEAR)
    const dEnd = c.cum[raw[raw.length - 1].i] + L1 / 2 + BUFFER_CLEAR
    let iA = 0
    while (iA < c.pts.length - 1 && c.cum[iA] < dStart) iA++
    let iB = c.pts.length - 1
    while (iB > 0 && c.cum[iB] > dEnd) iB--
    const m = iB - iA + 1
    if (m < 4) continue
    const px = c.pts.slice(iA, iB + 1).map((p) => p.x)
    const pz = c.pts.slice(iA, iB + 1).map((p) => p.z)
    const pt = tangents(px, pz)
    // everything on this line is built to the scale of its operator (a tram is much smaller than a train)
    const tOff = TRACK_OFFSET * railOf(line.operator)
    const cum0 = c.cum.slice(iA, iB + 1).map((d) => d - c.cum[iA])

    const info = raw.map((r, k) => {
      const { e, g, L } = lenOf(r.id)
      const idx = r.i - iA
      const dot = pt.tx[idx] * g.ax + pt.tz[idx] * g.az
      const ang = Math.acos(Math.min(1, Math.abs(dot)))
      const st = doc.stations[r.id]
      const off = Math.hypot(g.ox - (st.x + 0.5 - half), g.oz - (st.y + 0.5 - half))
      // a loop that calls at the same station again may run through it the other way round
      let sgn = e.sgn
      let zF = e.zF
      let zB = e.zB
      if (raw.slice(0, k).some((q) => q.id === r.id)) {
        const d2 = pt.tx[idx] * g.ax + pt.tz[idx] * g.az
        sgn = d2 >= 0 ? 1 : -1
        zF = g.passIds.includes(line.id) ? bypassFor(g.layout, sgn) : trackFor(g.layout, line.operator, sgn)
        zB = g.passIds.includes(line.id) ? bypassFor(g.layout, sgn > 0 ? -1 : 1) : trackFor(g.layout, line.operator, sgn > 0 ? -1 : 1)
      }
      return {
        id: r.id,
        k,
        i: idx,
        pass: g.passIds.includes(line.id),
        g,
        sgn,
        zF,
        zB,
        half: L / 2,
        // beside a bigger neighbour group (a tram stop next to a hall) the tracks stay on their platform lane for the
        // neighbour's length too, so they never cut through its hall
        pin: Math.max(L / 2, ...(groupsOf.get(r.id) ?? []).filter((o) => o !== g && Math.abs(o.lift - g.lift) < 1).map((o) => o.layout.length / 2 + (o.kind === 'main' ? 0.8 : 0))),
        taper: TAPER + (ang / (Math.PI / 2)) * 5 + off * 1.1,
        ramp: rampFor(g.lift),
      }
    })

    // blend the axis onto the platform group's axis around every stop (weights by arc distance)
    // Neighbouring stops overlap: their pull is mixed (partition of unity), so the axis never jumps from one platform
    // axis to the next. `w` is the total pull, `dom` the stop with the strongest pull, `kap` every stop's share.
    const w = new Array<number>(m).fill(0)
    const dom = new Array<number>(m).fill(-1)
    const kap: number[][] = []
    const cy = new Array<number>(m).fill(0)
    for (let j = 0; j < m; j++) {
      const wsj: number[] = []
      let best = 0
      let sum = 0
      info.forEach((s, k) => {
        const dd = Math.abs(cum0[j] - cum0[s.i])
        const ws = smooth01(1 - Math.min(1, Math.max(0, (dd - s.pin) / s.taper)))
        wsj.push(ws)
        sum += ws
        if (ws > best) {
          best = ws
          dom[j] = k
        }
        if (s.g.lift !== 0) {
          const lw = smooth01(1 - Math.min(1, Math.max(0, (dd - (s.half + 1)) / s.ramp)))
          const v = s.g.lift * lw
          if (Math.abs(v) > Math.abs(cy[j])) cy[j] = v
        }
      })
      w[j] = Math.min(1, sum)
      // a stop that fully holds the axis (on its platform) is not pulled aside by a neighbour's far taper;
      // where two stops share the pull, a stop's share shrinks as the other one tightens its grip
      const active = wsj.filter((v) => v > 1e-9).length
      if (active <= 1) {
        kap.push(wsj.map((v) => v * (sum > 1 ? 1 / sum : 1)))
      } else {
        const u = wsj.map((v, k) => v * wsj.reduce((p, o, m) => (m === k ? p : p * (1 - o)), 1))
        const su = u.reduce((a, b) => a + b, 0)
        kap.push(su > 1e-9 ? u.map((v) => (v / su) * w[j]) : wsj.map((v) => (v / sum) * w[j]))
      }
    }
    const cx: number[] = []
    const cz: number[] = []
    for (let j = 0; j < m; j++) {
      let x = px[j]
      let z = pz[j]
      info.forEach((s, k) => {
        const f = kap[j][k]
        if (f <= 0) return
        const fr = groupFrame(s.g, (cum0[j] - cum0[s.i]) * s.sgn)
        x += (fr.x - px[j]) * f
        z += (fr.z - pz[j]) * f
      })
      cx.push(x)
      cz.push(z)
    }
    // no bend tighter than a train can follow: relax the axis everywhere except on the platforms and at the ends
    relaxCurvature(
      cx,
      cz,
      cx.map((_, j) => j < 3 || j > m - 4 || w[j] > 0.995),
      // a smaller vehicle follows a tighter bend
      MAX_TURN * (RAIL / railOf(line.operator)),
    )
    const ct = tangents(cx, cz)
    const cum: number[] = [0]
    for (let j = 1; j < m; j++) cum.push(cum[j - 1] + Math.hypot(cx[j] - cx[j - 1], cz[j] - cz[j - 1]))

    // a track's position: ±0.3 from the axis, swinging onto lateral position `zt` of its platform group
    const trackAt = (j: number, base: number, ztOf: (k: number) => number) => {
      const nx = -ct.tz[j]
      const nz = ct.tx[j]
      const own = 1 - w[j]
      let ox = nx * base * own
      let oz = nz * base * own
      info.forEach((s, k) => {
        const f = kap[j][k]
        if (f <= 0) return
        const zt = ztOf(k)
        const fr = s.g.curv === 0 ? null : groupFrame(s.g, (cum0[j] - cum0[s.i]) * s.sgn)
        ox += (fr ? fr.nx : -s.g.az) * zt * f
        oz += (fr ? fr.nz : s.g.ax) * zt * f
      })
      return { x: cx[j] + ox, z: cz[j] + oz }
    }
    const fx: number[] = []
    const fz: number[] = []
    const bx: number[] = []
    const bz: number[] = []
    for (let j = 0; j < m; j++) {
      const f = trackAt(j, tOff, (k) => info[k].zF)
      const b = trackAt(j, -tOff, (k) => info[k].zB)
      fx.push(f.x)
      fz.push(f.z)
      bx.push(b.x)
      bz.push(b.z)
    }
    const ft = tangents(fx, fz)
    const bt = tangents(bx, bz)

    // the user's choice per leg: embankment with arches, tunnel or on the ground
    const legRanges: LegRange[] = []
    for (let k = 0; k < info.length - 1; k++) {
      const A = info[k]
      const B = info[k + 1]
      const profile = legProfile(line, k, doc)
      legRanges.push({ k, profile, d0: cum0[A.i], d1: cum0[B.i] })
      const dA = cum0[A.i] + A.half + 1.2
      const dB = cum0[B.i] - B.half - 1.2
      if (profile === 'ground' || dB - dA < 5) continue
      const target = profile === 'embankment' ? EMB_H : UG_LIFT
      const hA = A.g.lift
      const hB = B.g.lift
      const R = (dh: number) => (Math.abs(dh) < 0.05 ? 0 : 6 * Math.abs(dh) + 2.5)
      let sc = 1
      while (sc > 0.3 && R(target * sc - hA) + R(target * sc - hB) > dB - dA) sc -= 0.05
      if (sc <= 0.3) continue
      const peak = target * sc
      const rIn = R(peak - hA)
      const rOut = R(peak - hB)
      for (let j = 0; j < m; j++) {
        const d = cum0[j]
        if (d < dA || d > dB) continue
        let v = peak
        if (rIn > 0 && d < dA + rIn) v = hA + (peak - hA) * smooth01((d - dA) / rIn)
        else if (rOut > 0 && d > dB - rOut) v = hB + (peak - hB) * smooth01((dB - d) / rOut)
        cy[j] = target < 0 ? Math.min(cy[j], v) : Math.max(cy[j], v)
      }
    }

    if (line.operator === 'tram') for (let j = 0; j < m; j++) cy[j] -= TRAM_DIP

    // slope of the track
    const cs: number[] = []
    for (let j = 0; j < m; j++) {
      const a = Math.max(0, j - 1)
      const b = Math.min(m - 1, j + 1)
      cs.push((cy[b] - cy[a]) / ((cum[b] - cum[a]) || 1))
    }

    // sidings: the station's unused tracks branch off this line's own track and rejoin it behind the platform
    const sidings: Siding[] = []
    info.forEach((s) => {
      const plan = sidingPlan.get(`${s.id}|${s.g.index}`) ?? []
      for (const sp of plan) {
        if (sp.lineId !== line.id) continue
        let ja = -1
        let jb = -1
        for (let j = 0; j < m; j++) {
          if (dom[j] === s.k && w[j] > 0) {
            if (ja < 0) ja = j
            jb = j
          }
        }
        if (ja < 0) continue
        ja = Math.max(0, ja - 1)
        jb = Math.min(m - 1, jb + 1)
        const X: number[] = []
        const Z: number[] = []
        const Y: number[] = []
        for (let j = ja; j <= jb; j++) {
          const p = trackAt(j, sp.side === 'f' ? tOff : -tOff, (k) => (k === s.k ? sp.zt : 0))
          X.push(p.x)
          Z.push(p.z)
          Y.push(cy[j])
        }
        const t = tangents(X, Z)
        sidings.push({ j0: ja, side: sp.side, x: X, z: Z, tx: t.tx, tz: t.tz, y: Y })
      }
    })

    // bridges where the axis runs over water
    const runs: { d0: number; d1: number }[] = []
    let start = -1
    for (let j = 0; j < m; j++) {
      const wet = cy[j] < 0.3 && cy[j] > UG_COVER + 0.1 && sample(cx[j] + half, cz[j] + half) >= BRIDGE_THRESHOLD
      if (wet && start < 0) start = j
      if ((!wet || j === m - 1) && start >= 0) {
        const end = wet ? j : j - 1
        runs.push({ d0: cum[start] - 0.7, d1: cum[end] + 0.7 })
        start = -1
      }
    }
    const merged: { d0: number; d1: number }[] = []
    for (const r of runs) {
      const last = merged[merged.length - 1]
      if (last && r.d0 - last.d1 < 1.5) last.d1 = r.d1
      else merged.push({ ...r })
    }
    const bridges: Bridge[] = merged.map((r) => {
      const mid = (r.d0 + r.d1) / 2
      const leg = Math.max(0, legRanges.findIndex((lg) => mid >= lg.d0 && mid <= lg.d1))
      return { ...r, leg, style: legBridge(line, leg) }
    })

    const stopOf = (s: (typeof info)[number]): Stop => ({ stationId: s.id, group: s.g.index, d: cum[s.i], zF: s.zF, zB: s.zB, half: s.half, taper: s.taper, cross: 0, lift: s.g.lift })
    const stops: Stop[] = info.filter((s) => !s.pass).map(stopOf)
    const through: Stop[] = info.filter((s) => s.pass).map(stopOf)

    lines.push({
      line,
      n: m,
      cx,
      cz,
      tx: ct.tx,
      tz: ct.tz,
      fx,
      fz,
      ftx: ft.tx,
      ftz: ft.tz,
      bx,
      bz,
      btx: bt.tx,
      btz: bt.tz,
      cy,
      cs,
      cum,
      free: w.map((v) => 1 - v),
      total: cum[m - 1],
      stops,
      through,
      bridges: bridges.filter((b) => b.d1 - b.d0 >= 1.2),
      legs: legRanges,
      sidings,
      crossovers: [],
    })
  }

  groupTracks(lines)
  separateCrossings(lines)
  addCrossovers(lines)

  const stations: Record<string, StationNet> = {}
  for (const st of Object.values(doc.stations)) {
    const base = stationBase.get(st.id)!
    const groups = groupsOf.get(st.id) ?? []
    const g0 = groups.find((g) => g.kind === 'main') ?? groups[0]
    const ax = g0 ? g0.ax : base.design.angle !== null ? Math.cos((base.design.angle * Math.PI) / 180) : 1
    const az = g0 ? g0.az : base.design.angle !== null ? -Math.sin((base.design.angle * Math.PI) / 180) : 0
    stations[st.id] = {
      st,
      x: st.x + 0.5 - half,
      z: st.y + 0.5 - half,
      angle: Math.atan2(-az, ax),
      ax,
      az,
      design: g0 ? g0.design : base.design,
      layout: g0 ? g0.layout : base.layout,
      usedZ: g0 ? g0.usedZ : [],
      groups,
    }
  }

  // ---- lowered tracks and platforms are cut into the terrain -------------------------------
  const trench: { x: number; z: number; y: number }[] = []
  for (const ln of lines) for (let j = 0; j < ln.n; j++) if (ln.cy[j] < -0.15 && ln.cy[j] > UG_COVER) trench.push({ x: ln.cx[j], z: ln.cz[j], y: ln.cy[j] })
  const pits: { ox: number; oz: number; ax: number; az: number; halfL: number; halfW: number; y: number }[] = []
  for (const sn of Object.values(stations)) {
    for (const g of sn.groups) {
      if (g.lift < -0.15 && g.lift > UG_COVER) pits.push({ ox: g.ox, oz: g.oz, ax: g.ax, az: g.az, halfL: g.layout.length / 2 + 1.6 * RAIL, halfW: g.layout.halfWidth + 1.3 * RAIL, y: g.lift })
    }
  }
  const cell = 3
  const th = new Map<string, { x: number; z: number; y: number }[]>()
  for (const p of trench) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`
    const l = th.get(k)
    if (l) l.push(p)
    else th.set(k, [p])
  }
  const carve = (x: number, z: number, h: number) => {
    let out = h
    if (th.size) {
      const gx = Math.floor(x / cell)
      const gz = Math.floor(z / cell)
      let bestD = Infinity
      let bestY = 0
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          for (const p of th.get(`${gx + ox},${gz + oz}`) ?? []) {
            const d = Math.hypot(p.x - x, p.z - z)
            if (d < bestD) {
              bestD = d
              bestY = p.y
            }
          }
        }
      }
      if (bestD < 2.7) {
        const w = bestD <= 1.0 ? 1 : 1 - smooth01((bestD - 1.0) / 0.8)
        const target = LAND_Y + bestY - 0.12
        if (target < h) out = Math.min(out, h + (target - h) * w)
      }
    }
    for (const pit of pits) {
      const dx = x - pit.ox
      const dz = z - pit.oz
      const u = dx * pit.ax + dz * pit.az
      const v = -dx * pit.az + dz * pit.ax
      const dist = Math.max(Math.abs(u) - pit.halfL, Math.abs(v) - pit.halfW)
      if (dist < 1.2) {
        const w = dist <= 0 ? 1 : 1 - smooth01(dist / 1.2)
        const target = LAND_Y + pit.y - 0.12
        if (target < h) out = Math.min(out, h + (target - h) * w)
      }
    }
    return out
  }
  const groundCarved = (x: number, z: number) => carve(x, z, groundAt(x, z))

  // all track samples, for keeping pillars off the rails
  const tcell = 2
  const tg = new Map<string, { x: number; z: number; y: number; id: string }[]>()
  const addTrackSample = (x: number, z: number, y: number, id: string) => {
    const k = `${Math.floor(x / tcell)},${Math.floor(z / tcell)}`
    const l = tg.get(k)
    if (l) l.push({ x, z, y, id })
    else tg.set(k, [{ x, z, y, id }])
  }
  for (const ln of lines) {
    for (let j = 0; j < ln.n; j++) {
      addTrackSample(ln.fx[j], ln.fz[j], ln.cy[j], ln.line.id)
      addTrackSample(ln.bx[j], ln.bz[j], ln.cy[j], ln.line.id)
    }
    for (const sd of ln.sidings) for (let k = 0; k < sd.x.length; k++) addTrackSample(sd.x[k], sd.z[k], sd.y[k], ln.line.id)
    for (const co of ln.crossovers) for (let k = 0; k < co.x.length; k++) addTrackSample(co.x[k], co.z[k], co.y[k], ln.line.id)
  }
  // footprints (platforms + tracks) of every platform complex: nothing may stand on a lower one
  const footprints: { ox: number; oz: number; ax: number; az: number; halfL: number; halfW: number; lift: number }[] = []
  for (const sn of Object.values(stations)) {
    for (const g of sn.groups) footprints.push({ ox: g.ox, oz: g.oz, ax: g.ax, az: g.az, halfL: g.layout.length / 2 + 0.3 * RAIL, halfW: g.layout.halfWidth + 0.3 * RAIL, lift: g.lift })
  }
  const trackBelow = (x: number, z: number, yTop: number, ignoreLine?: string) => {
    for (const f of footprints) {
      if (f.lift > yTop - 0.8) continue
      const dx = x - f.ox
      const dz = z - f.oz
      if (Math.abs(dx * f.ax + dz * f.az) < f.halfL && Math.abs(-dx * f.az + dz * f.ax) < f.halfW) return true
    }
    const gx = Math.floor(x / tcell)
    const gz = Math.floor(z / tcell)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        for (const p of tg.get(`${gx + ox},${gz + oz}`) ?? []) {
          if (p.id === ignoreLine || p.y > yTop - 0.8) continue
          if (Math.hypot(p.x - x, p.z - z) < 0.95) return true
        }
      }
    }
    return false
  }

  const CLEAR_NEAR = 1.2
  const CLEAR_FAR = 4.2
  const railClearance = (x: number, z: number) => {
    let d = Infinity
    const gx = Math.floor(x / tcell)
    const gz = Math.floor(z / tcell)
    const reach = Math.ceil(CLEAR_FAR / tcell)
    for (let ox = -reach; ox <= reach; ox++) {
      for (let oz = -reach; oz <= reach; oz++) {
        for (const p of tg.get(`${gx + ox},${gz + oz}`) ?? []) d = Math.min(d, Math.hypot(p.x - x, p.z - z))
      }
    }
    for (const f of footprints) {
      const dx = x - f.ox
      const dz = z - f.oz
      const outside = Math.max(Math.abs(dx * f.ax + dz * f.az) - f.halfL, Math.abs(-dx * f.az + dz * f.ax) - f.halfW)
      d = Math.min(d, Math.max(0, outside))
    }
    return smooth01((d - CLEAR_NEAR) / (CLEAR_FAR - CLEAR_NEAR))
  }

  return { lines, stations, groundAt: groundCarved, carve, trackBelow, railClearance, field }
}
