import { useMemo } from 'react'
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

export const PF_TOP = RAIL_Y + 0.1

export type EntranceSign = 'U' | 'S' | 'Bf'
const SIGN_COLOR: Record<EntranceSign, string> = { U: '#0b4fa8', S: '#1a8a3d', Bf: '#a31a21' }
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
  g.fillStyle = '#fff'
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
  curve = 0,
  annex = -1,
  liftScale = 1,
}: {
  /** the lift is given in design units (world lift divided by this): thresholds in world units are divided by it too */
  liftScale?: number
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
  const furn = useMemo(() => platformFurniture(layout, lift <= ugCover ? 'open' : design.roof), [layout, design.roof, lift, ugCover])
  const halfW = layout.halfWidth + 0.25
  const L = layout.length
  const ubahn = showUbahn ?? design.ubahn
  const roof = lift <= ugCover || shell ? 'open' : design.roof

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
      {entrance && <Entrance layout={layout} big={entrance === 'big'} annex={annex} />}

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
  const R = props.layout.scale ?? 1
  const big = useMemo(() => (R === 1 ? props.layout : scaleLayout(props.layout, 1 / R)), [props.layout, R])
  if (R === 1) return <StationBody {...props} />
  const { lift = 0, groundY = LAND_Y, pillarFree } = props
  return (
    <group position={[0, LAND_Y * (1 - R), 0]} scale={R}>
      <StationBody
        {...props}
        layout={big}
        lift={lift / R}
        groundY={LAND_Y + (groundY - LAND_Y) / R}
        pillarFree={pillarFree && ((x, z) => pillarFree(x * R, z * R))}
        liftScale={R}
      />
    </group>
  )
}
