import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RAIL, TRAM } from '../model/scale'
import { LAND_Y, RAIL_Y, TRAM_ROAD_TOP } from './heights'
import { UG_COVER } from '../model/profiles'
import { xrayMaterial } from './xray'
import { addBridge } from './Bridges3D'
import { posOn, TRAM_DIP } from './network3d'
import type { LineNet, Network3D, P } from './network3d'

const tmp = new THREE.Object3D()
const qYaw = new THREE.Quaternion()
const qPitch = new THREE.Quaternion()
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/** A box from (ax,ay,az) to (bx,by,bz): `width` across, `height` tall, rising `y0` above the line. Follows slopes. */
export function boxAlong3(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, height: number, y0: number, extra = 0): THREE.Matrix4 {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const horiz = Math.hypot(dx, dz)
  const len = Math.hypot(horiz, dy) + extra
  tmp.position.set((ax + bx) / 2, (ay + by) / 2 + y0 + height / 2, (az + bz) / 2)
  qYaw.setFromAxisAngle(AXIS_Y, Math.atan2(-dz, dx))
  qPitch.setFromAxisAngle(AXIS_Z, Math.atan2(dy, horiz))
  tmp.quaternion.copy(qYaw).multiply(qPitch)
  tmp.scale.set(Math.max(len, 0.001), height, width)
  tmp.updateMatrix()
  return tmp.matrix.clone()
}

/** A flat box along the segment a->b: `width` across, `height` tall, its underside at y0. */
export function boxAlong(a: P, b: P, width: number, height: number, y0: number, extra = 0): THREE.Matrix4 {
  return boxAlong3(a.x, 0, a.z, b.x, 0, b.z, width, height, y0, extra)
}

export function matrixAt(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, pitch = 0): THREE.Matrix4 {
  tmp.position.set(x, y, z)
  qYaw.setFromAxisAngle(AXIS_Y, yaw)
  qPitch.setFromAxisAngle(AXIS_Z, pitch)
  tmp.quaternion.copy(qYaw).multiply(qPitch)
  tmp.scale.set(sx, sy, sz)
  tmp.updateMatrix()
  return tmp.matrix.clone()
}

export function Boxes({ items, color, roughness = 0.9, metalness = 0, emissive, shape = 'box', geo, opacity, xray }: { items: THREE.Matrix4[]; color: string; roughness?: number; metalness?: number; emissive?: number; shape?: 'box' | 'cyl'; geo?: THREE.BufferGeometry; opacity?: number; xray?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    items.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      {geo ? <primitive object={geo} attach="geometry" /> : shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <cylinderGeometry args={[1, 1, 1, 12]} />}
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive ? color : '#000'} emissiveIntensity={emissive ?? 0} transparent={opacity !== undefined} opacity={opacity ?? 1} {...(xray ? xrayMaterial : {})} />
    </instancedMesh>
  )
}

export interface Bufs {
  ballast: THREE.Matrix4[]
  rails: THREE.Matrix4[]
  buffers: THREE.Matrix4[]
  girders: THREE.Matrix4[]
  posts: THREE.Matrix4[]
  handrails: THREE.Matrix4[]
  piers: THREE.Matrix4[]
  walls: THREE.Matrix4[]
  roads: THREE.Matrix4[]
  curbs: THREE.Matrix4[]
  /** arched walls (embankments, masonry bridges) grouped by colour and proportion */
  arcGroups: Map<string, THREE.Matrix4[]>
  iron: THREE.Matrix4[]
  steel: THREE.Matrix4[]
  cables: THREE.Matrix4[]
  concrete: THREE.Matrix4[]
  ceilings: THREE.Matrix4[]
}

export const emptyBufs = (): Bufs => ({ ballast: [], rails: [], buffers: [], girders: [], posts: [], handrails: [], piers: [], walls: [], roads: [], curbs: [], arcGroups: new Map(), iron: [], steel: [], cables: [], concrete: [], ceilings: [] })

/** One track as a chain of short boxes that follows the (curved, possibly rising) sample points exactly. */
export function addTrack(b: Bufs, X: number[], Z: number[], Y: number[], TX: number[], TZ: number[], buffers = true) {
  const n = X.length
  const nrm = (i: number) => ({ x: -TZ[i], z: TX[i] })
  for (let j = 0; j < n - 1; j++) {
    b.ballast.push(boxAlong3(X[j], Y[j], Z[j], X[j + 1], Y[j + 1], Z[j + 1], 0.52 * RAIL, 0.1 * RAIL, RAIL_Y - 0.1 * RAIL, 0.1))
    const na = nrm(j)
    const nc = nrm(j + 1)
    for (const off of [-0.085 * RAIL, 0.085 * RAIL]) {
      b.rails.push(boxAlong3(X[j] + na.x * off, Y[j], Z[j] + na.z * off, X[j + 1] + nc.x * off, Y[j + 1], Z[j + 1] + nc.z * off, 0.07 * RAIL, 0.06 * RAIL, RAIL_Y + 0.0, 0.03))
    }
  }
  // minimal look: a plain bed with two thin rails, no individual sleepers
  // buffer stops at both ends
  for (const e of buffers ? [0, n - 1] : []) {
    const sx = e === 0 ? -1 : 1
    const ex = X[e] + TX[e] * sx * 0.12
    const ez = Z[e] + TZ[e] * sx * 0.12
    b.buffers.push(matrixAt(ex, Y[e] + RAIL_Y + 0.17 * RAIL, ez, Math.atan2(-TZ[e], TX[e]), 0.12 * RAIL, 0.22 * RAIL, 0.4 * RAIL))
  }
}

export type Pose = ReturnType<typeof posOn>

/** Points along the line axis between two arc lengths. */
export function deckPoints(ln: LineNet, d0: number, d1: number): Pose[] {
  const step = 0.4
  const lo = Math.max(0, d0)
  const hi = Math.min(ln.total, d1)
  const cnt = Math.max(2, Math.ceil((hi - lo) / step))
  const pts: Pose[] = []
  for (let k = 0; k <= cnt; k++) pts.push(posOn(ln, 'c', lo + ((hi - lo) * k) / cnt))
  return pts
}

export const sideOf = (p: Pose, o: number) => ({ x: p.x - p.tz * o, z: p.z + p.tx * o })

/**
 * Where the deck of a bridge or viaduct stands on piers. A pier is never put where a track of another
 * line runs underneath: the span simply gets longer there and the next pier follows right after.
 */
export function deckPiers(net: Network3D, ln: LineNet, d0: number, d1: number): { x: number; z: number; h: number; ground: number; yaw: number }[] {
  const pts = deckPoints(ln, d0, d1)
  const out: { x: number; z: number; h: number; ground: number; yaw: number }[] = []
  let pier = 1.5
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]
    pier += k > 0 ? Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z) : 0
    if (!(pier >= 2.6 || k === 0 || k === pts.length - 1)) continue
    const g = net.groundAt(p.x, p.z)
    const h = p.y + RAIL_Y - 0.46 - g
    if (h <= 0.2) {
      pier = 0
      continue
    }
    const spots = [-1, 1].map((sgn) => sideOf(p, 0.3 * sgn))
    if (spots.some((s) => net.trackBelow(s.x, s.z, p.y, ln.line.id))) continue // try again at the next sample
    pier = 0
    for (const s of spots) out.push({ x: s.x, z: s.z, h, ground: g, yaw: Math.atan2(-p.tz, p.tx) })
  }
  return out
}

/** A tram track set into the street: just two flush rails (the road surface is added along the whole line). */
function addStreetTrack(b: Bufs, X: number[], Z: number[], Y: number[], TX: number[], TZ: number[]) {
  const n = X.length
  for (let j = 0; j < n - 1; j++) {
    const na = { x: -TZ[j], z: TX[j] }
    const nc = { x: -TZ[j + 1], z: TX[j + 1] }
    for (const off of [-0.085 * TRAM, 0.085 * TRAM]) {
      b.rails.push(boxAlong3(X[j] + na.x * off, Y[j] + TRAM_DIP, Z[j] + na.z * off, X[j + 1] + nc.x * off, Y[j + 1] + TRAM_DIP, Z[j + 1] + nc.z * off, 0.07 * TRAM, 0.012, TRAM_ROAD_TOP - 0.004, 0.02))
    }
  }
}

/** Half the width of the street a tram runs on: just wider than its two tracks with a car on each; the whole street is about as wide as those of the map */
const ROAD_HALF = 0.5 * TRAM

/** The street a tram runs on: asphalt strip with kerbs along the whole line. */
function addRoad(b: Bufs, ln: LineNet) {
  for (let j = 0; j < ln.n - 1; j++) {
    const a = { x: ln.cx[j], z: ln.cz[j], y: ln.cy[j] + TRAM_DIP }
    const c = { x: ln.cx[j + 1], z: ln.cz[j + 1], y: ln.cy[j + 1] + TRAM_DIP }
    b.roads.push(boxAlong3(a.x, a.y, a.z, c.x, c.y, c.z, ROAD_HALF * 2, TRAM_ROAD_TOP - (LAND_Y - 0.01), LAND_Y - 0.01, 0.05))
    for (const sgn of [-1, 1]) {
      const o = ROAD_HALF * sgn
      b.curbs.push(boxAlong3(a.x - ln.tz[j] * o, a.y, a.z + ln.tx[j] * o, c.x - ln.tz[j + 1] * o, c.y, c.z + ln.tx[j + 1] * o, 0.12 * TRAM, TRAM_ROAD_TOP - (LAND_Y - 0.01) + 0.012, LAND_Y - 0.01, 0.05))
    }
  }
}

const archCache = new Map<number, THREE.BufferGeometry>()
/**
 * One span of a masonry arcade: a wall of width 1 and height `aspect` with a round-arched opening,
 * 1 deep (scaled per instance). Proportions are kept, so tall arches stay round.
 */
function archGeometry(aspect: number) {
  const hit = archCache.get(aspect)
  if (hit) return hit
  const shape = new THREE.Shape()
  shape.moveTo(-0.5, 0)
  shape.lineTo(0.5, 0)
  shape.lineTo(0.5, aspect)
  shape.lineTo(-0.5, aspect)
  shape.closePath()
  const crown = aspect - (aspect > 0.5 ? 0.17 : 0.1)
  let r = Math.min(0.36, crown * 0.9)
  let spring = crown - r
  if (spring < 0) {
    r = crown
    spring = 0
  }
  if (r > 0.08) {
    const hole = new THREE.Path()
    hole.moveTo(-r, 0)
    hole.lineTo(-r, spring)
    hole.absarc(0, spring, r, Math.PI, 0, true)
    hole.lineTo(r, 0)
    hole.closePath()
    shape.holes.push(hole)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 12 })
  g.translate(0, 0, -0.5)
  archCache.set(aspect, g)
  return g
}

const ARCH_COLOR: Record<string, string> = { stone: '#b9b0a3', brick: '#a65d43' }

/** Deck on a row of round arches: the user's embankment, or a masonry / brick bridge over water. */
export function addArches(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number, span: number, col: 'stone' | 'brick') {
  const pts = deckPoints(ln, d0, d1)
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k]
    const q = pts[k + 1]
    // the top of the deck lies a little below the top of the ballast: two faces in the same plane would flicker
    b.girders.push(boxAlong3(p.x, p.y, p.z, q.x, q.y, q.z, 1.25 * RAIL, 0.12, RAIL_Y - 0.14, 0.06))
    for (const sgn of [-1, 1]) {
      const a = sideOf(p, 0.6 * RAIL * sgn)
      const c = sideOf(q, 0.6 * RAIL * sgn)
      b.curbs.push(boxAlong3(a.x, p.y, a.z, c.x, q.y, c.z, 0.06, 0.1, RAIL_Y - 0.02, 0.04))
    }
  }
  // evenly spaced spans over the whole length, so the first and the last arch touch the ends
  const total = pts.reduce((acc, p, k) => (k ? acc + Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z) : 0), 0)
  const n = Math.max(1, Math.round(total / span))
  const w = total / n
  let acc = w / 2
  let walked = 0
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k]
    const q = pts[k + 1]
    const seg = Math.hypot(q.x - p.x, q.z - p.z)
    while (acc - walked < seg + 1e-6 && acc < total) {
      const t = (acc - walked) / (seg || 1)
      const x = p.x + (q.x - p.x) * t
      const z = p.z + (q.z - p.z) * t
      const y = p.y + (q.y - p.y) * t
      const g = net.groundAt(x, z)
      const top = y + RAIL_Y - 0.12
      const h = top - g
      if (h > 0.2) {
        const aspect = Math.ceil((h / w) * 10) / 10
        const yaw = Math.atan2(-(q.z - p.z), q.x - p.x)
        const key = `${col}|${aspect.toFixed(1)}`
        const list = b.arcGroups.get(key) ?? []
        list.push(matrixAt(x, top - aspect * w, z, yaw, w * 1.01, w, 1.1 * RAIL * 1.25))
        b.arcGroups.set(key, list)
      }
      acc += w
    }
    walked += seg
  }
}

/** Tunnel box around the track where it runs under the ground (seen in the underground view). */
function addTunnel(b: Bufs, ln: LineNet) {
  for (let j = 0; j < ln.n - 1; j++) {
    if (ln.cy[j] > UG_COVER + 0.12 || ln.cy[j + 1] > UG_COVER + 0.12) continue
    b.ceilings.push(boxAlong3(ln.cx[j], ln.cy[j], ln.cz[j], ln.cx[j + 1], ln.cy[j + 1], ln.cz[j + 1], 1.5 * RAIL, 0.1, RAIL_Y + 0.95 * RAIL, 0.06))
    for (const sgn of [-1, 1]) {
      const o = 0.68 * RAIL * sgn
      b.walls.push(boxAlong3(ln.cx[j] - ln.tz[j] * o, ln.cy[j], ln.cz[j] + ln.tx[j] * o, ln.cx[j + 1] - ln.tz[j + 1] * o, ln.cy[j + 1], ln.cz[j + 1] + ln.tx[j + 1] * o, 0.1, 1.05 * RAIL, RAIL_Y - 0.1, 0.06))
    }
  }
}

/** A deck on piers: over water or, when the track is lifted off the ground, as a viaduct. */
export function addDeck(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number) {
  const pts = deckPoints(ln, d0, d1)
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k]
    const q = pts[k + 1]
    b.girders.push(boxAlong3(p.x, p.y, p.z, q.x, q.y, q.z, 1.1 * RAIL, 0.34, RAIL_Y - 0.46, 0.06))
    for (const sgn of [-1, 1]) {
      const a = sideOf(p, 0.6 * sgn)
      const c = sideOf(q, 0.6 * sgn)
      b.handrails.push(boxAlong3(a.x, p.y, a.z, c.x, q.y, c.z, 0.03, 0.03, RAIL_Y + 0.16, 0.04))
    }
  }
  let acc = 0
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]
    acc += k > 0 ? Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z) : 0
    if (k === 0 || acc >= 1.4 || k === pts.length - 1) {
      acc = 0
      for (const sgn of [-1, 1]) {
        const s = sideOf(p, 0.6 * sgn)
        b.posts.push(matrixAt(s.x, p.y + RAIL_Y + 0.08, s.z, 0, 0.03, 0.18, 0.03))
      }
    }
  }
  for (const pr of deckPiers(net, ln, d0, d1)) b.piers.push(matrixAt(pr.x, pr.ground + pr.h / 2 - 0.05, pr.z, pr.yaw, 0.17, pr.h + 0.1, 0.17))
}

/** Retaining walls along both sides of the stretches that run below ground level. */
function addTrenchWalls(b: Bufs, ln: LineNet) {
  // a tram only sits a hair below its street: no retaining walls
  if (ln.line.operator === 'tram') return
  const top = LAND_Y + 0.04
  for (let j = 0; j < ln.n - 1; j++) {
    const ya = LAND_Y + ln.cy[j] - 0.12
    const yb = LAND_Y + ln.cy[j + 1] - 0.12
    const y0 = Math.min(ya, yb)
    const h = top - y0
    if (h < 0.2 || ln.cy[j] <= UG_COVER || ln.cy[j + 1] <= UG_COVER) continue
    for (const sgn of [-1, 1]) {
      const o = 0.95 * RAIL * sgn
      b.walls.push(
        boxAlong3(ln.cx[j] - ln.tz[j] * o, 0, ln.cz[j] + ln.tx[j] * o, ln.cx[j + 1] - ln.tz[j + 1] * o, 0, ln.cz[j + 1] + ln.tx[j + 1] * o, 0.14, h, y0, 0.08),
      )
    }
  }
}

/** Stretches of a line that are lifted off the ground (higher station level, crossing over another line). */
function liftedRuns(ln: LineNet): { d0: number; d1: number }[] {
  const out: { d0: number; d1: number }[] = []
  let start = -1
  for (let j = 0; j < ln.n; j++) {
    const up = ln.cy[j] >= 0.35
    if (up && start < 0) start = j
    if ((!up || j === ln.n - 1) && start >= 0) {
      const end = up ? j : j - 1
      out.push({ d0: ln.cum[start], d1: ln.cum[end] })
      start = -1
    }
  }
  return out
}

/** Minimal track: a plain bed with two thin steel rails per track, buffer stops at the ends, bridges and viaducts. */
export default function Tracks3D({ net }: { net: Network3D }) {
  const data = useMemo(() => {
    const b = emptyBufs()
    for (const ln of net.lines) {
      if (ln.line.operator === 'tram') {
        addRoad(b, ln)
        addStreetTrack(b, ln.fx, ln.fz, ln.cy, ln.ftx, ln.ftz)
        addStreetTrack(b, ln.bx, ln.bz, ln.cy, ln.btx, ln.btz)
        for (const s of ln.sidings) addStreetTrack(b, s.x, s.z, s.y, s.tx, s.tz)
      } else {
        addTrack(b, ln.fx, ln.fz, ln.cy, ln.ftx, ln.ftz)
        addTrack(b, ln.bx, ln.bz, ln.cy, ln.btx, ln.btz)
        for (const s of ln.sidings) addTrack(b, s.x, s.z, s.y, s.tx, s.tz, false)
      }
      for (const br of ln.bridges) addBridge(b, net, ln, br)
      for (const run of liftedRuns(ln)) {
        // an embankment chosen by the user rests on an arcade, everything else on piers
        const mid = (run.d0 + run.d1) / 2
        const leg = ln.legs.find((lg) => mid >= lg.d0 && mid <= lg.d1)
        if (leg?.profile === 'embankment') addArches(b, net, ln, run.d0, run.d1, 1.15, 'stone')
        else addDeck(b, net, ln, run.d0, run.d1)
      }
      addTunnel(b, ln)
      addTrenchWalls(b, ln)
    }
    return b
  }, [net])

  return (
    <group>
      <Boxes items={data.ballast} color="#4a4d54" roughness={1} />
            <Boxes items={data.rails} color="#d6dde8" roughness={0.3} metalness={0.8} />
      <Boxes items={data.buffers} color="#c0392b" roughness={0.7} />
      <Boxes items={data.girders} color="#8d96a3" roughness={0.8} />
      <Boxes items={data.handrails} color="#cfd5de" roughness={0.5} metalness={0.4} />
      <Boxes items={data.posts} color="#cfd5de" roughness={0.5} metalness={0.4} />
      <Boxes items={data.piers} color="#9aa3af" roughness={0.9} shape="cyl" />
      <Boxes items={data.walls} color="#b4bcc7" roughness={0.9} xray />
      <Boxes items={data.roads} color="#2d3138" roughness={0.95} />
      <Boxes items={data.curbs} color="#8e969f" roughness={0.9} />
      {[...data.arcGroups.entries()].map(([key, items]) => {
        const [col, aspect] = key.split('|')
        return <Boxes key={key} items={items} color={ARCH_COLOR[col]} roughness={0.95} geo={archGeometry(Number(aspect))} />
      })}
      <Boxes items={data.iron} color="#56707a" roughness={0.6} metalness={0.5} />
      <Boxes items={data.steel} color="#e9eef4" roughness={0.4} metalness={0.4} />
      <Boxes items={data.cables} color="#cfd6de" roughness={0.5} metalness={0.3} />
      <Boxes items={data.concrete} color="#d7dce3" roughness={0.8} />
      <Boxes items={data.ceilings} color="#7d8591" roughness={0.9} xray />
    </group>
  )
}
