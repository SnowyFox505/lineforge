import { buildField, BRIDGE_THRESHOLD, makeSampler } from '../model/terrainField'
import { layoutStation, resolveDesign, stationOperators, trackFor, TRACK_OFFSET } from '../model/stationDesign'
import type { ResolvedDesign, StationLayout } from '../model/stationDesign'
import type { CityDoc, Line, OperatorId, Station } from '../model/types'
import { clusterByDirection, levelHeight, lineDirectionAtStation, meanDirection, LEVEL_STEP } from '../model/stationGroups'
import { EMB_H, isUndergroundStation, legBridge, legProfile, UG_COVER, UG_LIFT } from '../model/profiles'
import type { BridgeStyle, TrackProfile } from '../model/types'
import { trainLength, VEHICLES } from '../model/vehicles'
import { layoutLines } from '../plan/layout'
import { cleanPolyline, extendEnds, resample, roundPolyline, smooth01 } from './curves'
import type { P } from './curves'
import { groundHeight, LAND_Y } from './heights'

export type { P }

export { TRACK_OFFSET }
/** Lane spacing in 3D: two tracks with ballast fit between neighbouring lines */
export const LANE_GAP = 1.05
/** Free track behind the last platform before the buffer stop */
export const BUFFER_CLEAR = 1.2
/** Length over which a track swings from the line axis onto its station track */
export const TAPER = 5
export const DEFAULT_CURVE = 3
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
export const TRAM_GAP = 1.8
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
  /** platform height above the ground (0, or a multiple of LEVEL_H) */
  lift: number
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
  total: number
  stops: Stop[]
  bridges: Bridge[]
  legs: LegRange[]
  sidings: Siding[]
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
  /** rotation about Y so that local +x runs along the tracks */
  angle: number
  /** world position of the platform complex (the station centre, or beside it for the tram stop) */
  ox: number
  oz: number
  design: ResolvedDesign
  layout: StationLayout
  /** lateral positions that lines already use with their own tracks */
  usedZ: number[]
  lineIds: string[]
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
function relaxCurvature(xs: number[], zs: number[], pinned: boolean[]): void {
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
    if (worst <= MAX_TURN) continue
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
      if (w2 <= MAX_TURN) break
    }
  }
}

interface Coarse {
  pts: P[]
  cum: number[]
  tx: number[]
  tz: number[]
}

const TRAM_STATION: Station = { id: 'tram-stop', name: '', x: 0, y: 0, type: 'standard', design: { tracks: 2, platform: 'side', length: 'short', roof: 'canopy', ubahn: false } }

interface Entry {
  line: Line
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
  const inZone = (ln: LineNet, d: number) => ln.stops.some((s) => Math.abs(d - s.d) < s.half + s.taper + 3)
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
            if (!prev) events.push({ a, b: o.li, da: la.cum[j], db: lb.cum[o.j], sin: Math.sqrt(1 - dot * dot) })
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
  const lanes = layoutLines(doc, LANE_GAP, { smooth: 4 })
  const lineList = Object.values(doc.lines)

  // ---- pass A: smooth axis of every line, with generous run-out at both ends ---------------
  const coarse = new Map<string, Coarse>()
  for (const line of lineList) {
    const lat = lanes[line.id]
    if (!lat || lat.length < 2) continue
    const world: P[] = lat.map((p) => ({ x: p.x + 0.5 - half, z: p.y + 0.5 - half }))
    const rounded = roundPolyline(extendEnds(cleanPolyline(world), 14), line.curve ?? DEFAULT_CURVE)
    const r = resample(rounded, STEP)
    const t = tangents(r.pts.map((p) => p.x), r.pts.map((p) => p.z))
    coarse.set(line.id, { pts: r.pts, cum: r.cum, tx: t.tx, tz: t.tz })
  }

  // nearest sample index at or after `from`
  const nearest = (c: Coarse, sx: number, sz: number, from: number) => {
    let best = Infinity
    let bi = from
    for (let i = from; i < c.pts.length; i++) {
      const d = (c.pts[i].x - sx) ** 2 + (c.pts[i].z - sz) ** 2
      if (d < best) {
        best = d
        bi = i
      }
    }
    return bi
  }

  // ---- pass B: platform groups of every station -------------------------------------------
  const groupsOf = new Map<string, StationGroup[]>()
  const sidingPlan = new Map<string, Siding3[]>() // `${stationId}|${group}` -> sidings
  const entryOf = new Map<string, Entry>() // `${lineId}|${stationId}`
  const stationBase = new Map<string, { st: Station; design: ResolvedDesign; layout: StationLayout }>()

  for (const st of Object.values(doc.stations)) {
    const sx = st.x + 0.5 - half
    const sz = st.y + 0.5 - half
    const allOps = stationOperators(doc, st.id)
    const baseDesign = resolveDesign(st, allOps)
    const minLen = (ops: OperatorId[]) => ops.reduce((m, op) => Math.max(m, trainLength(VEHICLES[op]) + 1.2), 0)
    stationBase.set(st.id, { st, design: baseDesign, layout: layoutStation(baseDesign, minLen(allOps)) })

    const entries: Entry[] = []
    for (const line of lineList) {
      if (!line.stations.includes(st.id) || entries.some((e) => e.line.id === line.id)) continue
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
      entries.push({ line, i, tx: cdx, tz: cdz, sgn: 1, zF: 0, zB: 0 })
    }
    if (!entries.length) continue

    const mains = entries.filter((e) => e.line.operator !== 'tram')
    const normal = mains.length ? mains : entries.filter((e) => e.line.operator === 'tram')
    const trams = mains.length ? entries.filter((e) => e.line.operator === 'tram') : []

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
    for (let k = 0; k < levelCount; k++) {
      const list = normal.filter((_, i) => labels[i] === k)
      const mean = meanDirection(list.map((e) => ({ x: e.tx, z: e.tz })))
      let ax = mean.x
      let az = mean.z
      const resolved = resolveDesign(st, [...new Set(list.map((e) => e.line.operator))], k)
      if (resolved.angle !== null) {
        const a = (resolved.angle * Math.PI) / 180
        ax = Math.cos(a)
        az = -Math.sin(a)
      }
      const lift = levelCount === 1 && isUndergroundStation(doc, st) ? UG_LIFT : levelHeight(levelCount, k)
      const g: StationGroup = {
        index: groups.length,
        kind: 'main',
        level: k,
        lift,
        ax,
        az,
        angle: Math.atan2(-az, ax),
        ox: sx,
        oz: sz,
        design: resolved,
        layout: stationBase.get(st.id)!.layout,
        usedZ: [],
        lineIds: list.map((e) => e.line.id),
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
          angle: Math.atan2(-e.tz, e.tx),
          ox: sx,
          oz: sz,
          design: baseDesign,
          layout: stationBase.get(st.id)!.layout,
          usedZ: [],
          lineIds: [],
        }
        groups.push(g)
        members.set(g.index, [])
      }
      g.lineIds.push(e.line.id)
      members.get(g.index)!.push(e)
    }

    // design and layout of every group (spread operators over its own tracks)
    for (const g of groups) {
      const list = members.get(g.index)!
      const ops = [...new Set(list.map((e) => e.line.operator))]
      if (g.kind === 'tram') {
        g.design = resolveDesign(TRAM_STATION, ['tram'])
        g.layout = layoutStation(g.design, minLen(['tram']))
      } else {
        g.design = resolveDesign(st, ops, g.level)
        g.layout = layoutStation(g.design, minLen(ops))
      }
    }
    // the tram stop sits beside the main station, not inside its track field
    const main0 = groups.find((g) => g.kind === 'main')
    for (const g of groups) {
      if (g.kind !== 'tram' || !main0) continue
      const off = main0.layout.halfWidth + TRAM_GAP + g.layout.halfWidth
      g.ox = sx - g.az * off
      g.oz = sz + g.ax * off
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
  }

  // ---- pass C: tracks of every line ---------------------------------------------------------
  const lines: LineNet[] = []
  for (const line of lineList) {
    const c = coarse.get(line.id)
    if (!c) continue
    const raw: { id: string; i: number }[] = []
    let from = 0
    for (const id of line.stations) {
      const st = doc.stations[id]
      if (!st || !groupsOf.has(id)) continue
      const i = nearest(c, st.x + 0.5 - half, st.y + 0.5 - half, from)
      raw.push({ id, i })
      from = i
    }
    if (raw.length < 2) continue

    const lenOf = (id: string) => {
      const e = entryOf.get(`${line.id}|${id}`)!
      const g = groupsOf.get(id)!.find((x) => x.lineIds.includes(line.id))!
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
    const cum0 = c.cum.slice(iA, iB + 1).map((d) => d - c.cum[iA])

    const info = raw.map((r, k) => {
      const { e, g, L } = lenOf(r.id)
      const idx = r.i - iA
      const dot = pt.tx[idx] * g.ax + pt.tz[idx] * g.az
      const ang = Math.acos(Math.min(1, Math.abs(dot)))
      const st = doc.stations[r.id]
      const off = Math.hypot(g.ox - (st.x + 0.5 - half), g.oz - (st.y + 0.5 - half))
      return {
        id: r.id,
        k,
        i: idx,
        g,
        sgn: e.sgn,
        zF: e.zF,
        zB: e.zB,
        half: L / 2,
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
        const ws = smooth01(1 - Math.min(1, Math.max(0, (dd - s.half) / s.taper)))
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
      const norm = Math.max(1, sum)
      kap.push(wsj.map((v) => v / norm))
      w[j] = Math.min(1, sum)
    }
    const cx: number[] = []
    const cz: number[] = []
    for (let j = 0; j < m; j++) {
      let x = px[j]
      let z = pz[j]
      info.forEach((s, k) => {
        const f = kap[j][k]
        if (f <= 0) return
        const along = (cum0[j] - cum0[s.i]) * s.sgn
        x += (s.g.ox + s.g.ax * along - px[j]) * f
        z += (s.g.oz + s.g.az * along - pz[j]) * f
      })
      cx.push(x)
      cz.push(z)
    }
    // no bend tighter than a train can follow: relax the axis everywhere except on the platforms and at the ends
    relaxCurvature(
      cx,
      cz,
      cx.map((_, j) => j < 3 || j > m - 4 || w[j] > 0.995),
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
        ox -= s.g.az * zt * f
        oz += s.g.ax * zt * f
      })
      return { x: cx[j] + ox, z: cz[j] + oz }
    }
    const fx: number[] = []
    const fz: number[] = []
    const bx: number[] = []
    const bz: number[] = []
    for (let j = 0; j < m; j++) {
      const f = trackAt(j, TRACK_OFFSET, (k) => info[k].zF)
      const b = trackAt(j, -TRACK_OFFSET, (k) => info[k].zB)
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
          const p = trackAt(j, sp.side === 'f' ? TRACK_OFFSET : -TRACK_OFFSET, (k) => (k === s.k ? sp.zt : 0))
          X.push(p.x)
          Z.push(p.z)
          Y.push(cy[j])
        }
        const t = tangents(X, Z)
        sidings.push({ x: X, z: Z, tx: t.tx, tz: t.tz, y: Y })
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

    const stops: Stop[] = info.map((s) => ({ stationId: s.id, group: s.g.index, d: cum[s.i], zF: s.zF, zB: s.zB, half: s.half, taper: s.taper, lift: s.g.lift }))

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
      total: cum[m - 1],
      stops,
      bridges: bridges.filter((b) => b.d1 - b.d0 >= 1.2),
      legs: legRanges,
      sidings,
    })
  }

  separateCrossings(lines)

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
      if (g.lift < -0.15 && g.lift > UG_COVER) pits.push({ ox: g.ox, oz: g.oz, ax: g.ax, az: g.az, halfL: g.layout.length / 2 + 1.6, halfW: g.layout.halfWidth + 1.3, y: g.lift })
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
  }
  // footprints (platforms + tracks) of every platform complex: nothing may stand on a lower one
  const footprints: { ox: number; oz: number; ax: number; az: number; halfL: number; halfW: number; lift: number }[] = []
  for (const sn of Object.values(stations)) {
    for (const g of sn.groups) footprints.push({ ox: g.ox, oz: g.oz, ax: g.ax, az: g.az, halfL: g.layout.length / 2 + 0.3, halfW: g.layout.halfWidth + 0.3, lift: g.lift })
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

  return { lines, stations, groundAt: groundCarved, carve, trackBelow, field }
}
