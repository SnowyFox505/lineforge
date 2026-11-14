import { useEffect, useMemo, useRef } from 'react'
import type { ComponentProps } from 'react'
import * as THREE from 'three'
import { scaleLayout } from '../model/stationDesign'
import type { ResolvedDesign, StationLayout } from '../model/stationDesign'
import { LAND_Y, RAIL_Y } from './heights'
import { addTrack, Boxes, boxAlong, emptyBufs } from './Tracks3D'
import { UG_COVER } from '../model/profiles'
import type { StationLook } from '../model/types'
import StationShell from './StationShell'
import { TAPER } from './network3d'
import { smooth01 } from './curves'
import Bend from './Bend'
import { xrayCompile } from './xray'

export const PF_TOP = RAIL_Y + 0.1

export type EntranceSign = 'U' | 'S' | 'Bf' | 'H'
const SIGN_COLOR: Record<EntranceSign, string> = { U: '#0b4fa8', S: '#1a8a3d', Bf: '#a31a21', H: '#1f8a3a' }
const signTextures = new Map<EntranceSign, THREE.CanvasTexture>()
/** Sign above the entrance of a station: U for the metro, S for the S-Bahn, Bf for other trains. */
function signTexture(sign: EntranceSign) {
  const hit = signTextures.get(sign)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = SIGN_COLOR[sign]
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = sign === 'H' ? '#ffd400' : '#fff'
  g.font = `700 ${sign === 'Bf' ? 72 : 96}px 'Space Grotesk Variable', system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(sign, 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  signTextures.set(sign, t)
  return t
}

/** Tangents of a sampled curve. */
function tangentsOf(X: number[], Z: number[]) {
  const n = X.length
  const TX: number[] = []
  const TZ: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const c = Math.min(n - 1, i + 1)
    const dx = X[c] - X[a]
    const dz = Z[c] - Z[a]
    const l = Math.hypot(dx, dz) || 1
    TX.push(dx / l)
    TZ.push(dz / l)
  }
  return { TX, TZ }
}

/**
 * Rails of the station tracks (local frame: x along the tracks, z across).
 * In the world the lines bring their own tracks through the station, so only the extra tracks are
 * drawn: sidings that branch off the nearest line track and rejoin it behind the platform.
 * In the editor (usedZ undefined) every track is drawn on its own.
 */
function stationTracks(layout: StationLayout, usedZ?: number[], none = false) {
  const h = layout.length / 2
  const b = emptyBufs()
  if (none) return b
  const step = 0.4
  for (const t of layout.tracks) {
    let anchor: number | null
    if (usedZ === undefined) anchor = t.anchor
    else {
      if (usedZ.some((u) => Math.abs(u - t.z) < 0.08)) continue
      anchor = usedZ.length ? usedZ.reduce((best, u) => (Math.abs(u - t.z) < Math.abs(best - t.z) ? u : best), usedZ[0]) : null
    }
    const X: number[] = []
    const Z: number[] = []
    if (anchor === null) {
      for (let x = -h - 1.5; x <= h + 1.5 + 1e-6; x += step) {
        X.push(x)
        Z.push(t.z)
      }
    } else {
      const T = TAPER
      for (let x = -h - T; x <= h + T + 1e-6; x += step) {
        const w = smooth01(1 - Math.min(1, Math.max(0, (Math.abs(x) - h) / T)))
        X.push(x)
        Z.push(anchor + (t.z - anchor) * w)
      }
    }
    const { TX, TZ } = tangentsOf(X, Z)
    addTrack(b, X, Z, X.map(() => 0), TX, TZ, anchor === null)
  }
  return b
}

function platformBoxes(layout: StationLayout) {
  const body: THREE.Matrix4[] = []
  const edge: THREE.Matrix4[] = []
  const h = layout.length / 2
  for (const p of layout.platforms) {
    const zc = (p.z0 + p.z1) / 2
    body.push(boxAlong({ x: -h, z: zc }, { x: h, z: zc }, p.z1 - p.z0, PF_TOP - LAND_Y + 0.15, LAND_Y - 0.15, 0))
    // yellow safety edges
    for (const z of [p.z0 + 0.05, p.z1 - 0.05]) edge.push(boxAlong({ x: -h, z }, { x: h, z }, 0.06, 0.02, PF_TOP, 0))
  }
  return { body, edge }
}


/**
 * More of a station than platforms and a roof: tactile strips along the platform edge, departure displays with a clock,
 * bins, overhead-line masts, and for an island platform a footbridge with a stair shaft at both ends (local frame).
 */
function platformDetails(layout: StationLayout, design: ResolvedDesign, roof: ResolvedDesign['roof']) {
  const strips: THREE.Matrix4[] = []
  const posts: THREE.Matrix4[] = []
  const screens: THREE.Matrix4[] = []
  const clocks: THREE.Matrix4[] = []
  const bins: THREE.Matrix4[] = []
  const arms: THREE.Matrix4[] = []
  const wires: THREE.Matrix4[] = []
  const deck: THREE.Matrix4[] = []
  const shafts: THREE.Matrix4[] = []
  const rails: THREE.Matrix4[] = []
  const lights: THREE.Matrix4[] = []
  const h = layout.length / 2
  const trackZs = layout.tracks.map((t) => t.z)
  const nearTrack = (z: number) => trackZs.some((tz) => Math.abs(tz - z) < 0.45)
  let wireLo = Infinity
  let wireHi = -Infinity
  layout.platforms.forEach((p, pi) => {
    const w = p.z1 - p.z0
    if (w < 0.3) return
    const zc = (p.z0 + p.z1) / 2
    // tactile guidance strip beside the yellow edge, on the sides that face a track
    for (const [z, inward] of [[p.z0, 1], [p.z1, -1]] as [number, number][]) {
      if (!nearTrack(z - inward * 0.25)) continue
      strips.push(boxAlong({ x: -h, z: z + inward * 0.17 }, { x: h, z: z + inward * 0.17 }, 0.1, 0.012, PF_TOP, 0))
    }
    // departure display on a post with a clock above, bins
    const zs = Math.abs(zc) < 0.01 ? zc : zc
    for (const sx of [-0.55, 0.55]) {
      const x = h * sx
      posts.push(at(x, PF_TOP + 0.24, zs, 0.022, 0.48, 0.022))
      screens.push(at(x, PF_TOP + 0.4, zs, 0.04, 0.13, 0.3))
      clocks.push(at(x, PF_TOP + 0.52, zs, 0.04, 0.09, 0.09))
    }
    for (const x of [-h + 1.2, h - 1.2, 0]) {
      if (Math.abs(x) < 0.01 && layout.length < 6) continue
      bins.push(at(x, PF_TOP + 0.065, zc + (w > 0.6 ? w * 0.3 : 0), 0.09, 0.13, 0.09))
    }
    // overhead line masts: one per platform, an arm over each track beside it
    const outer = w > 1.4 ? zc : zc
    for (let x = -h + 0.6; x <= h - 0.4 && roof === 'open'; x += 3.3) {
      posts.push(at(x, PF_TOP + 0.5, outer, 0.026, 1.0, 0.026))
      for (const tz of trackZs) {
        if (Math.abs(tz - outer) > w / 2 + 0.6) continue
        const zm = (outer + tz) / 2
        arms.push(at(x, PF_TOP + 0.95, zm, 0.02, 0.02, Math.abs(tz - outer) + 0.02))
        wireLo = Math.min(wireLo, tz)
        wireHi = Math.max(wireHi, tz)
      }
    }
    void pi
  })
  if (wireHi >= wireLo && roof === 'open') for (const tz of trackZs) wires.push(at(0, PF_TOP + 0.9, tz, layout.length + 3, 0.012, 0.012))
  // footbridge with stair shafts over an island platform
  if ((design.platform === 'island' || layout.platforms.length > 2) && layout.platforms.length && layout.length > 5 && (roof === 'open' || roof === 'canopy')) {
    const zLo = Math.min(...layout.platforms.map((p) => p.z0)) - 0.25
    const zHi = Math.max(...layout.platforms.map((p) => p.z1)) + 0.25
    const xb = -h * 0.62
    const top = PF_TOP + 0.98
    deck.push(at(xb, top, (zLo + zHi) / 2, 0.3, 0.04, zHi - zLo))
    for (const z of [zLo, zHi]) rails.push(at(xb, top + 0.09, z, 0.3, 0.16, 0.012))
    lights.push(at(xb, top - 0.025, (zLo + zHi) / 2, 0.06, 0.012, zHi - zLo - 0.1))
    for (const p of layout.platforms) {
      const pw = p.z1 - p.z0
      if (pw < 0.6) continue
      shafts.push(at(xb, PF_TOP + 0.49, (p.z0 + p.z1) / 2, 0.34, 0.98, pw * 0.7))
    }
  }
  return { strips, posts, screens, clocks, bins, arms, wires, deck, shafts, rails, lights }
}

const fm = new THREE.Matrix4()
const fp = new THREE.Vector3()
const fq = new THREE.Quaternion()
const fs = new THREE.Vector3()
const at = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => fm.compose(fp.set(x, y, z), fq.identity(), fs.set(sx, sy, sz)).clone()

/** Lamps, benches and name boards on the platforms (local frame). */
function platformFurniture(layout: StationLayout, roof: ResolvedDesign['roof']) {
  const posts: THREE.Matrix4[] = []
  const heads: THREE.Matrix4[] = []
  const wood: THREE.Matrix4[] = []
  const backs: THREE.Matrix4[] = []
  const boards: THREE.Matrix4[] = []
  const h = layout.length / 2
  const L = layout.length * 0.75
  const roofPosts = roof === 'canopy' ? [-L / 2 + 0.3, 0, L / 2 - 0.3] : []
  const free = (x: number) => roofPosts.every((rp) => Math.abs(rp - x) > 0.28)
  for (const p of layout.platforms) {
    const zc = (p.z0 + p.z1) / 2
    const w = p.z1 - p.z0
    if (w < 0.3) continue
    for (let x = -h + 0.7; x < h - 0.5; x += 2.3) {
      if (!free(x)) continue
      posts.push(at(x, PF_TOP + 0.21, zc, 0.022, 0.42, 0.022))
      heads.push(at(x, PF_TOP + 0.43, zc, 0.12, 0.02, 0.05))
    }
    for (let x = -h + 1.6; x < h - 1; x += 3.4) {
      if (!free(x)) continue
      const z = zc + (w > 0.6 ? w * 0.22 : 0)
      wood.push(at(x, PF_TOP + 0.085, z, 0.34, 0.025, 0.1))
      backs.push(at(x, PF_TOP + 0.15, z + 0.05, 0.34, 0.09, 0.012))
    }
    for (const sx of [-0.3, 0.3]) {
      const x = h * sx * 1.4
      if (!free(x)) continue
      posts.push(at(x, PF_TOP + 0.16, zc - w * 0.2, 0.02, 0.32, 0.02))
      boards.push(at(x, PF_TOP + 0.3, zc - w * 0.2, 0.3, 0.075, 0.012))
    }
  }
  return { posts, heads, wood, backs, boards }
}

/** A small station building beside the platforms. */
function Entrance({ layout, big, annex }: { layout: StationLayout; big: boolean; annex: 1 | -1 }) {
  const len = Math.min(layout.length * (big ? 0.42 : 0.3), big ? 3.4 : 2.0)
  const dep = big ? 0.8 : 0.6
  const hgt = big ? 0.8 : 0.55
  const z = annex * (layout.halfWidth + 0.9 + dep / 2)
  return (
    <group position={[-layout.length * 0.12, 0, z]} rotation={[0, annex > 0 ? Math.PI : 0, 0]}>
      <mesh position={[0, LAND_Y + hgt / 2, 0]}>
        <boxGeometry args={[len, hgt, dep]} />
        <meshStandardMaterial color="#d7dce3" roughness={0.85} />
      </mesh>
      <mesh position={[0, LAND_Y + hgt + 0.025, 0]}>
        <boxGeometry args={[len + 0.16, 0.05, dep + 0.16]} />
        <meshStandardMaterial color="#8f98a5" roughness={0.7} />
      </mesh>
      {/* glass front towards the platforms */}
      <mesh position={[0, LAND_Y + hgt * 0.45, dep / 2 + 0.006]}>
        <boxGeometry args={[len * 0.8, hgt * 0.6, 0.012]} />
        <meshPhysicalMaterial color="#8fc6e6" roughness={0.1} metalness={0.2} transparent opacity={0.7} />
      </mesh>
      {big && (
        <mesh position={[0, LAND_Y + hgt + 0.28, 0]}>
          <boxGeometry args={[len * 0.45, 0.4, dep * 0.6]} />
          <meshStandardMaterial color="#c5ccd6" roughness={0.8} />
        </mesh>
      )}
    </group>
  )
}

function Vault({ halfW, length, kind }: { halfW: number; length: number; kind: 'glass' | 'hall' }) {
  const k = kind === 'hall' ? 0.7 : 0.42
  const r = halfW
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(r, r, length, 36, Math.min(48, Math.max(1, Math.ceil(length / 0.45))), true, 0, Math.PI)
    g.rotateZ(Math.PI / 2)
    return g
  }, [r, length])
  const ribs = useMemo(() => {
    const n = Math.max(3, Math.round(length / 1.6))
    return Array.from({ length: n + 1 }, (_, i) => -length / 2 + (length * i) / n)
  }, [length])
  const baseY = PF_TOP + 0.55
  return (
    <group position={[0, baseY, 0]}>
      <group scale={[1, k, 1]}>
        <mesh geometry={geo}>
          {kind === 'glass' ? (
            <meshPhysicalMaterial color="#8fd2ff" transparent opacity={0.26} roughness={0.05} metalness={0.1} side={THREE.DoubleSide} depthWrite={false} />
          ) : (
            <meshStandardMaterial color="#9db0cc" transparent opacity={0.55} roughness={0.35} metalness={0.4} side={THREE.DoubleSide} depthWrite={false} />
          )}
        </mesh>
        {ribs.map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[r, 0.04 / k ** 0.3, 6, 36, Math.PI]} />
            <meshStandardMaterial color="#e6ebf2" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
      </group>
      {/* hall: solid stone side walls under the vault */}
      {kind === 'hall' &&
        [-1, 1].map((sz) => (
          <mesh key={sz} position={[0, -(baseY - PF_TOP) / 2 - 0.05, sz * r]}>
            <boxGeometry args={[length, baseY - PF_TOP + 0.1, 0.12]} />
            <meshStandardMaterial color="#c5ccd6" roughness={0.85} />
          </mesh>
        ))}
      {/* gable ends */}
      {(kind === 'hall' ? [-1, 1] : []).map((sx) => (
        <mesh key={sx} position={[(sx * length) / 2, 0, 0]} rotation={[0, (sx * Math.PI) / 2, 0]} scale={[1, k, 1]}>
          <circleGeometry args={[r, 36, 0, Math.PI]} />
          <meshPhysicalMaterial color="#9fd8ff" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {/* side supports */}
      {ribs.filter((_, i) => i % 2 === 0).flatMap((x) =>
        [-r, r].map((z) => (
          <mesh key={`${x}${z}`} position={[x, -(baseY - PF_TOP) / 2, z]}>
            <cylinderGeometry args={[0.045, 0.045, baseY - PF_TOP, 8]} />
            <meshStandardMaterial color="#d5dbe4" metalness={0.5} roughness={0.5} />
          </mesh>
        )),
      )}
    </group>
  )
}

function Canopies({ layout }: { layout: StationLayout }) {
  const L = layout.length * 0.75
  const posts = [-L / 2 + 0.3, 0, L / 2 - 0.3]
  return (
    <group>
      {layout.platforms.map((p, i) => {
        const w = p.z1 - p.z0
        const zc = (p.z0 + p.z1) / 2
        return (
          <group key={i} position={[0, 0, zc]}>
            <mesh position={[0, PF_TOP + 0.78, 0]}>
              <boxGeometry args={[L, 0.05, w + 0.2]} />
              <meshStandardMaterial color="#e7ebf1" roughness={0.6} />
            </mesh>
            <mesh position={[0, PF_TOP + 0.75, 0]}>
              <boxGeometry args={[L - 0.05, 0.02, w + 0.26]} />
              <meshStandardMaterial color="#2e6cd6" roughness={0.5} />
            </mesh>
            {/* skylight strip on the roof, lamps and a cross beam under it */}
            <mesh position={[0, PF_TOP + 0.806, 0]}>
              <boxGeometry args={[L * 0.7, 0.012, Math.max(0.1, w * 0.35)]} />
              <meshStandardMaterial color="#bfe3f7" roughness={0.2} metalness={0.2} />
            </mesh>
            {[-0.33, 0, 0.33].map((f) => (
              <mesh key={f} position={[L * f, PF_TOP + 0.735, 0]}>
                <boxGeometry args={[0.2, 0.012, Math.max(0.1, w * 0.4)]} />
                <meshStandardMaterial color="#fff7d6" emissive="#fff0b0" emissiveIntensity={0.9} />
              </mesh>
            ))}
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[(sx * (L - 0.05)) / 2, PF_TOP + 0.74, 0]}>
                <boxGeometry args={[0.03, 0.05, w + 0.2]} />
                <meshStandardMaterial color="#cdd4de" metalness={0.5} roughness={0.5} />
              </mesh>
            ))}
            {posts.map((x) => (
              <mesh key={x} position={[x, PF_TOP + 0.38, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.76, 8]} />
                <meshStandardMaterial color="#cdd4de" metalness={0.5} roughness={0.5} />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

/**
 * A tram stop in the street: a kerb-high platform beside the track, a small shelter with a glass back wall and a bench,
 * a stop sign on a pole and a ticket machine. Nothing like the halls and roofs of a railway station.
 */
function TramHalt({ layout }: { layout: StationLayout }) {
  const L = layout.length
  const items = useMemo(() => {
    const posts: THREE.Matrix4[] = []
    const roofs: THREE.Matrix4[] = []
    const glass: THREE.Matrix4[] = []
    const wood: THREE.Matrix4[] = []
    const steel: THREE.Matrix4[] = []
    const machines: THREE.Matrix4[] = []
    const signs: { x: number; y: number; z: number; yaw: number }[] = []
    for (const p of layout.platforms) {
      const w = p.z1 - p.z0
      if (w < 0.3) continue
      const zc = (p.z0 + p.z1) / 2
      // the outer edge is the one away from the tracks
      const out = zc >= 0 ? 1 : -1
      const zOut = zc + out * (w / 2 - 0.1)
      const x0 = -L * 0.12
      // shelter: roof on two posts, glass back wall, bench inside
      roofs.push(at(x0, PF_TOP + 0.52, zOut - out * 0.03, 1.3, 0.035, 0.34))
      for (const dx of [-0.6, 0.6]) posts.push(at(x0 + dx, PF_TOP + 0.26, zOut + out * 0.12, 0.025, 0.52, 0.025))
      glass.push(at(x0, PF_TOP + 0.27, zOut + out * 0.14, 1.2, 0.46, 0.012))
      wood.push(at(x0, PF_TOP + 0.1, zOut - out * 0.02, 0.9, 0.03, 0.12))
      // stop sign pole near the end of the platform, where the cars stop
      const xs = L * 0.34
      steel.push(at(xs, PF_TOP + 0.4, zOut, 0.022, 0.8, 0.022))
      signs.push({ x: xs, y: PF_TOP + 0.84, z: zOut, yaw: Math.PI / 2 })
      // ticket machine
      machines.push(at(-L * 0.38, PF_TOP + 0.17, zOut, 0.12, 0.34, 0.1))
    }
    return { posts, roofs, glass, wood, steel, machines, signs }
  }, [layout, L])
  return (
    <group>
      <Boxes items={items.roofs} color="#e7ebf1" roughness={0.6} />
      <Boxes items={items.posts} color="#cdd4de" roughness={0.5} metalness={0.5} />
      <Boxes items={items.steel} color="#c3cad4" roughness={0.5} metalness={0.5} />
      <Boxes items={items.glass} color="#8fc6e6" roughness={0.1} metalness={0.2} opacity={0.55} />
      <Boxes items={items.wood} color="#7a5a3c" roughness={0.9} />
      <Boxes items={items.machines} color="#2e6cd6" roughness={0.6} emissive={0.15} />
      {items.signs.map((sg, i) => (
        <mesh key={i} position={[sg.x, sg.y, sg.z]} rotation={[0, sg.yaw, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.02]} />
          <meshStandardMaterial map={signTexture('H')} emissive={SIGN_COLOR.H} emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** Concrete box around the platforms of an underground station (seen in the underground view). */
function UndergroundShell({ layout, lift }: { layout: StationLayout; lift: number }) {
  const L = layout.length + 3
  const W = layout.halfWidth * 2 + 1.6
  const y0 = LAND_Y + lift
  return (
    <group>
      <mesh position={[0, y0 + 1.2, 0]}>
        <boxGeometry args={[L, 0.12, W]} />
        <meshStandardMaterial color="#7d8591" roughness={0.9} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {[-1, 1].map((sz) => (
        <mesh key={sz} position={[0, y0 + 0.55, (sz * W) / 2]}>
          <boxGeometry args={[L, 1.4, 0.12]} />
          <meshStandardMaterial color="#8a93a0" roughness={0.9} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, y0 - 0.12, 0]}>
        <boxGeometry args={[L, 0.1, W]} />
        <meshStandardMaterial color="#5f6772" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Retaining walls along the long sides of a platform complex that is sunk into the ground. */
function PitWalls({ layout, lift }: { layout: StationLayout; lift: number }) {
  const floor = LAND_Y + lift - 0.12
  const top = LAND_Y + 0.04
  const h = top - floor
  const L = layout.length + 3.2
  const o = layout.halfWidth + 0.8
  return (
    <group>
      {[-o, o].map((z) => (
        <mesh key={z} position={[0, floor + h / 2, z]}>
          <boxGeometry args={[L, h, 0.14]} />
          <meshStandardMaterial color="#b4bcc7" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** Slab and pillars under a station level that sits above the ground. */
function Supports({ layout, lift, groundY, free }: { layout: StationLayout; lift: number; groundY: number; free?: (x: number, z: number) => boolean }) {
  const W = layout.halfWidth * 2 + 1.1
  const L = layout.length + 2.4
  const top = lift + RAIL_Y - 0.16
  const bottom = top - 0.34
  const ground = groundY
  const h = bottom - ground
  const xs = Array.from({ length: Math.max(2, Math.round(L / 4) + 1) }, (_, i) => -L / 2 + (L * i) / Math.max(1, Math.max(2, Math.round(L / 4) + 1) - 1))
  return (
    <group>
      <mesh position={[0, bottom + 0.17, 0]}>
        <boxGeometry args={[L, 0.34, W]} />
        <meshStandardMaterial color="#8f98a5" roughness={0.85} />
      </mesh>
      {xs.flatMap((x) =>
        [-W / 2 + 0.2, W / 2 - 0.2].filter((z) => !free || free(x, z)).map((z) => (
          <mesh key={`${x}${z}`} position={[x, ground + h / 2, z]}>
            <cylinderGeometry args={[0.17, 0.17, h, 12]} />
            <meshStandardMaterial color="#9aa3af" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  )
}

/**
 * A station: platforms, tracks, roof and optional metro entrance. Local frame: x runs along the tracks,
 * z across them. Used in the world and in the 3D station editor.
 */
function StationBody({
  design,
  layout,
  underground = false,
  usedZ,
  noTracks = false,
  lift = 0,
  groundY = LAND_Y,
  pillarFree,
  showUbahn,
  sign = 'U',
  entrance = null,
  shell = null,
  halt = false,
  curve = 0,
  annex = -1,
  liftScale = 1,
}: {
  /** the lift is given in design units (world lift divided by this): thresholds in world units are divided by it too */
  liftScale?: number
  /** a plain tram halt (see `StationGroup.halt`): shelter and sign instead of roofs, halls and buildings */
  halt?: boolean
  /** side of the lateral axis for the reception building (see `StationGroup.annex`) */
  annex?: 1 | -1
  /** curvature of the platform axis (see `StationGroup.curv`); 0 = straight */
  curve?: number
  design: ResolvedDesign
  layout: StationLayout
  underground?: boolean
  usedZ?: number[]
  /** the lines bring their own tracks (world view): draw platforms and roof only */
  noTracks?: boolean
  /** platform height above the ground for a station level above the others */
  lift?: number
  /** terrain height under an elevated level (pillars stand there) */
  groundY?: number
  /** true where a pillar may stand (no track of a lower level underneath), in the station's local frame */
  pillarFree?: (x: number, z: number) => boolean
  showUbahn?: boolean
  /** sign above the surface entrance */
  sign?: EntranceSign
  /** station building beside the main platforms */
  entrance?: 'small' | 'big' | null
  /** draw the closed, roofed station seen from outside instead of the open platforms' roof */
  shell?: StationLook | null
}) {
  const tracks = useMemo(() => stationTracks(layout, usedZ, noTracks), [layout, usedZ, noTracks])
  const pf = useMemo(() => platformBoxes(layout), [layout])
  const ugCover = UG_COVER / liftScale
  const eps = 0.15 / liftScale
  const furn = useMemo(() => (halt ? { posts: [], heads: [], wood: [], backs: [], boards: [] } : platformFurniture(layout, lift <= ugCover ? 'open' : design.roof)), [layout, design.roof, lift, ugCover, halt])
  const halfW = layout.halfWidth + 0.25
  const L = layout.length
  const ubahn = !halt && (showUbahn ?? design.ubahn)
  const roof = halt || lift <= ugCover || shell ? 'open' : design.roof
  const details = useMemo(() => (halt || shell || lift <= ugCover ? null : platformDetails(layout, design, roof)), [layout, design, halt, shell, lift, ugCover, roof])

  const uEntrance = ubahn || lift <= ugCover ? (

        <group position={[L * 0.18, LAND_Y * 0.55, annex * (layout.halfWidth + 1.0)]} scale={0.45}>
          {/* stair entrance */}
          <mesh position={[0, LAND_Y + 0.28, 0]}>
            <boxGeometry args={[1.5, 0.56, 1.0]} />
            <meshStandardMaterial color="#cfd6e0" roughness={0.8} />
          </mesh>
          <mesh position={[0, LAND_Y + 0.58, 0]}>
            <boxGeometry args={[1.6, 0.08, 1.1]} />
            <meshStandardMaterial color="#2f5fb8" roughness={0.6} />
          </mesh>
          <mesh position={[-0.9, LAND_Y + 0.9, 0]}>
            <boxGeometry args={[0.04, 0.7, 0.04]} />
            <meshStandardMaterial color="#d5dbe4" metalness={0.5} />
          </mesh>
          <mesh position={[-0.9, LAND_Y + 1.35, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.55, 0.55, 0.05]} />
            <meshStandardMaterial map={signTexture(sign)} emissive={SIGN_COLOR[sign]} emissiveIntensity={0.45} />
          </mesh>
        </group>
      
  ) : null

  const body = (
    <group>
      {lift > eps && <Supports layout={layout} lift={lift} groundY={groundY} free={pillarFree} />}
      {lift < -eps && lift > ugCover && <PitWalls layout={layout} lift={lift} />}
      {lift <= ugCover && <UndergroundShell layout={layout} lift={lift} />}
      {lift <= ugCover && uEntrance}
      <group position={[0, lift, 0]}>
      <Boxes items={tracks.ballast} color="#4a4d54" roughness={1} />
      <Boxes items={tracks.rails} color="#d6dde8" roughness={0.3} metalness={0.8} />
      <Boxes items={tracks.buffers} color="#c0392b" roughness={0.7} />
      <Boxes items={pf.body} color="#b7bfc9" roughness={0.9} />
      <Boxes items={pf.edge} color="#f2c230" roughness={0.6} emissive={0.25} />
      <Boxes items={furn.posts} color="#cdd4de" roughness={0.5} metalness={0.4} />
      <Boxes items={furn.heads} color="#ffe9a8" roughness={0.5} emissive={0.8} />
      <Boxes items={furn.wood} color="#7a5a3c" roughness={0.9} />
      <Boxes items={furn.backs} color="#6a4d33" roughness={0.9} />
      <Boxes items={furn.boards} color="#2e6cd6" roughness={0.6} emissive={0.15} />
      {halt && <TramHalt layout={layout} />}
      {details && (
        <>
          <Boxes items={details.strips} color="#7c848f" roughness={0.95} />
          <Boxes items={details.posts} color="#c3cad4" roughness={0.5} metalness={0.5} />
          <Boxes items={details.arms} color="#aab2bd" roughness={0.5} metalness={0.5} />
          <Boxes items={details.wires} color="#3b4048" roughness={0.6} />
          <Boxes items={details.screens} color="#10151c" roughness={0.4} emissive={0.6} />
          <Boxes items={details.clocks} color="#f4f6f9" roughness={0.5} emissive={0.4} />
          <Boxes items={details.bins} color="#3d6b4f" roughness={0.8} />
          <Boxes items={details.deck} color="#b0b8c3" roughness={0.9} />
          <Boxes items={details.shafts} color="#c9d0da" roughness={0.85} />
          <Boxes items={details.rails} color="#8fc6e6" roughness={0.1} metalness={0.2} opacity={0.55} />
          <Boxes items={details.lights} color="#fff7d6" roughness={0.5} emissive={0.9} />
        </>
      )}
      {entrance && !halt && <Entrance layout={layout} big={entrance === 'big'} annex={annex} />}

      {shell && lift > ugCover && <StationShell look={shell} layout={layout} annex={annex} />}
      {roof === 'canopy' && <Canopies layout={layout} />}
      {roof === 'glass' && <Vault halfW={halfW} length={L + 1.2} kind="glass" />}
      {roof === 'hall' && <Vault halfW={halfW} length={L + 1.2} kind="hall" />}

      {lift > ugCover && uEntrance}

      {ubahn && underground && (
        <group position={[0, 0, 0]}>
          {/* metro platform level below ground */}
          <mesh position={[0, LAND_Y - 2.9, 0]}>
            <boxGeometry args={[L + 2, 0.2, layout.halfWidth * 2 + 3]} />
            <meshStandardMaterial color="#4a5260" roughness={0.9} />
          </mesh>
          <mesh position={[0, LAND_Y - 2.55, -layout.halfWidth - 1]}>
            <boxGeometry args={[L + 2, 0.5, 0.2]} />
            <meshStandardMaterial color="#2f5fb8" roughness={0.6} emissive="#2f5fb8" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, LAND_Y - 2.74, 0.4]}>
            <boxGeometry args={[L, 0.12, 1.6]} />
            <meshStandardMaterial color="#b7bfc9" roughness={0.9} />
          </mesh>
          {/* stairs up to the entrance */}
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[L * 0.18, LAND_Y - 2.7 + i * 0.42, layout.halfWidth + 1.9 - i * 0.12 - 0.6]}>
              <boxGeometry args={[1.2, 0.16, 0.5]} />
              <meshStandardMaterial color="#cfd6e0" />
            </mesh>
          ))}
        </group>
      )}
      </group>
    </group>
  )
  return curve ? <Bend k={curve}>{body}</Bend> : body
}

/**
 * A station. `layout` is in world units; when it was shrunk to the scale of the world (`layout.scale`), the whole station is
 * built at design size and scaled down about the ground, so roofs, benches and platforms keep their proportions.
 */
export default function StationBuilding(props: ComponentProps<typeof StationBody>) {
  const root = useRef<THREE.Group>(null)
  // every material of the station joins the x-ray effect, so the follow camera sees the train through roofs and halls
  useEffect(() => {
    root.current?.traverse((o) => {
      const mats = (o as THREE.Mesh).material
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (m.userData.xr || !((m as THREE.MeshStandardMaterial).isMeshStandardMaterial)) continue
        m.userData.xr = true
        // keep what is already hooked into the material (the bend of a curved station): the roofs and halls are plain
        // materials, and replacing their hook left them straight above the curved platforms
        const before = m.onBeforeCompile
        const key = m.customProgramCacheKey?.bind(m)
        m.onBeforeCompile = (shader, renderer) => {
          before?.call(m, shader, renderer)
          xrayCompile(shader)
        }
        m.customProgramCacheKey = () => `${key ? key() : ''}|lf-xray`
        m.needsUpdate = true
      }
    })
  })
  const R = props.layout.scale ?? 1
  const big = useMemo(() => (R === 1 ? props.layout : scaleLayout(props.layout, 1 / R)), [props.layout, R])
  if (R === 1) return <group ref={root}><StationBody {...props} /></group>
  const { lift = 0, groundY = LAND_Y, pillarFree } = props
  return (
    <group ref={root} position={[0, LAND_Y * (1 - R), 0]} scale={R}>
      <StationBody
        {...props}
        layout={big}
        // the platform is built at design size: a curve of the world (1/radius) is R times as tight in design units
        curve={(props.curve ?? 0) * R}
        lift={lift / R}
        groundY={LAND_Y + (groundY - LAND_Y) / R}
        pillarFree={pillarFree && ((x, z) => pillarFree(x * R, z * R))}
        liftScale={R}
      />
    </group>
  )
}
