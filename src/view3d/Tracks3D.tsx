import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LAND_Y, RAIL_Y } from './heights'
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

function matrixAt(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, pitch = 0): THREE.Matrix4 {
  tmp.position.set(x, y, z)
  qYaw.setFromAxisAngle(AXIS_Y, yaw)
  qPitch.setFromAxisAngle(AXIS_Z, pitch)
  tmp.quaternion.copy(qYaw).multiply(qPitch)
  tmp.scale.set(sx, sy, sz)
  tmp.updateMatrix()
  return tmp.matrix.clone()
}

export function Boxes({ items, color, roughness = 0.9, metalness = 0, emissive, shape = 'box' }: { items: THREE.Matrix4[]; color: string; roughness?: number; metalness?: number; emissive?: number; shape?: 'box' | 'cyl' }) {
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
      {shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <cylinderGeometry args={[1, 1, 1, 12]} />}
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive ? color : '#000'} emissiveIntensity={emissive ?? 0} />
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
}

export const emptyBufs = (): Bufs => ({ ballast: [], rails: [], buffers: [], girders: [], posts: [], handrails: [], piers: [], walls: [], roads: [], curbs: [] })

/** One track as a chain of short boxes that follows the (curved, possibly rising) sample points exactly. */
export function addTrack(b: Bufs, X: number[], Z: number[], Y: number[], TX: number[], TZ: number[], buffers = true) {
  const n = X.length
  const nrm = (i: number) => ({ x: -TZ[i], z: TX[i] })
  for (let j = 0; j < n - 1; j++) {
    b.ballast.push(boxAlong3(X[j], Y[j], Z[j], X[j + 1], Y[j + 1], Z[j + 1], 0.52, 0.1, RAIL_Y - 0.1, 0.1))
    const na = nrm(j)
    const nc = nrm(j + 1)
    for (const off of [-0.085, 0.085]) {
      b.rails.push(boxAlong3(X[j] + na.x * off, Y[j], Z[j] + na.z * off, X[j + 1] + nc.x * off, Y[j + 1], Z[j + 1] + nc.z * off, 0.035, 0.05, RAIL_Y + 0.0, 0.03))
    }
  }
  // minimal look: a plain bed with two thin rails, no individual sleepers
  // buffer stops at both ends
  for (const e of buffers ? [0, n - 1] : []) {
    const sx = e === 0 ? -1 : 1
    const ex = X[e] + TX[e] * sx * 0.12
    const ez = Z[e] + TZ[e] * sx * 0.12
    b.buffers.push(matrixAt(ex, Y[e] + RAIL_Y + 0.17, ez, Math.atan2(-TZ[e], TX[e]), 0.12, 0.22, 0.4))
  }
}

type Pose = ReturnType<typeof posOn>

/** Points along the line axis between two arc lengths. */
function deckPoints(ln: LineNet, d0: number, d1: number): Pose[] {
  const step = 0.4
  const lo = Math.max(0, d0)
  const hi = Math.min(ln.total, d1)
  const cnt = Math.max(2, Math.ceil((hi - lo) / step))
  const pts: Pose[] = []
  for (let k = 0; k <= cnt; k++) pts.push(posOn(ln, 'c', lo + ((hi - lo) * k) / cnt))
  return pts
}

const sideOf = (p: Pose, o: number) => ({ x: p.x - p.tz * o, z: p.z + p.tx * o })

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
    for (const off of [-0.085, 0.085]) {
      b.rails.push(boxAlong3(X[j] + na.x * off, Y[j] + TRAM_DIP, Z[j] + na.z * off, X[j + 1] + nc.x * off, Y[j + 1] + TRAM_DIP, Z[j + 1] + nc.z * off, 0.035, 0.04, LAND_Y + 0.02, 0.03))
    }
  }
}

/** The street a tram runs on: asphalt strip with kerbs along the whole line. */
function addRoad(b: Bufs, ln: LineNet) {
  for (let j = 0; j < ln.n - 1; j++) {
    const a = { x: ln.cx[j], z: ln.cz[j], y: ln.cy[j] + TRAM_DIP }
    const c = { x: ln.cx[j + 1], z: ln.cz[j + 1], y: ln.cy[j + 1] + TRAM_DIP }
    b.roads.push(boxAlong3(a.x, a.y, a.z, c.x, c.y, c.z, 1.05, 0.05, LAND_Y - 0.01, 0.1))
    for (const sgn of [-1, 1]) {
      const o = 0.55 * sgn
      b.curbs.push(boxAlong3(a.x - ln.tz[j] * o, a.y, a.z + ln.tx[j] * o, c.x - ln.tz[j + 1] * o, c.y, c.z + ln.tx[j + 1] * o, 0.14, 0.08, LAND_Y - 0.01, 0.1))
    }
  }
}

/** A deck on piers: over water or, when the track is lifted off the ground, as a viaduct. */
function addDeck(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number) {
  const pts = deckPoints(ln, d0, d1)
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k]
    const q = pts[k + 1]
    b.girders.push(boxAlong3(p.x, p.y, p.z, q.x, q.y, q.z, 1.1, 0.34, RAIL_Y - 0.46, 0.06))
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
  const top = LAND_Y + 0.04
  for (let j = 0; j < ln.n - 1; j++) {
    const ya = LAND_Y + ln.cy[j] - 0.12
    const yb = LAND_Y + ln.cy[j + 1] - 0.12
    const y0 = Math.min(ya, yb)
    const h = top - y0
    if (h < 0.2) continue
    for (const sgn of [-1, 1]) {
      const o = 0.95 * sgn
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
      for (const br of ln.bridges) addDeck(b, net, ln, br.d0, br.d1)
      for (const run of liftedRuns(ln)) addDeck(b, net, ln, run.d0, run.d1)
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
      <Boxes items={data.walls} color="#b4bcc7" roughness={0.9} />
      <Boxes items={data.roads} color="#2d3138" roughness={0.95} />
      <Boxes items={data.curbs} color="#8e969f" roughness={0.9} />
    </group>
  )
}
