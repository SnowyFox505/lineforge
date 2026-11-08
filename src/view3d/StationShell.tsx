import { useMemo } from 'react'
import * as THREE from 'three'
import type { StationLayout } from '../model/stationDesign'
import type { StationLook } from '../model/types'
import { LAND_Y, RAIL_Y } from './heights'

const PF = RAIL_Y + 0.1 // platform top

const BRICK = '#a65d43'
const STONE = '#c9cdd3'
const SLATE = '#4c5661'
const STEEL = '#93a6c0'

function Mat({ color, opacity = 1, metal = 0.1, rough = 0.8 }: { color: string; opacity?: number; metal?: number; rough?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} transparent={opacity < 1} opacity={opacity} side={opacity < 1 ? THREE.DoubleSide : THREE.FrontSide} depthWrite={opacity >= 1} />
}

/** Half-pipe roof along x with ribs, optionally flattened. */
function Barrel({ L, W, k, base, color, opacity = 1, ribs = true }: { L: number; W: number; k: number; base: number; color: string; opacity?: number; ribs?: boolean }) {
  const r = W / 2
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(r, r, L, 40, Math.min(48, Math.max(1, Math.ceil(L / 0.45))), true, 0, Math.PI)
    g.rotateZ(Math.PI / 2)
    return g
  }, [r, L])
  const ribXs = useMemo(() => {
    const n = Math.max(3, Math.round(L / 1.5))
    return Array.from({ length: n + 1 }, (_, i) => -L / 2 + (L * i) / n)
  }, [L])
  return (
    <group position={[0, base, 0]}>
      <group scale={[1, k, 1]}>
        <mesh geometry={geo}>
          <Mat color={color} opacity={opacity} metal={0.3} rough={0.5} />
        </mesh>
        {ribs &&
          ribXs.map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[r, 0.05 / Math.max(0.5, k) ** 0.3, 6, 40, Math.PI]} />
              <meshStandardMaterial color="#e6ebf2" roughness={0.4} metalness={0.5} />
            </mesh>
          ))}
      </group>
    </group>
  )
}

/** Side walls under a roof: a long box on both sides of the platforms. */
function Walls({ L, W, h, color, opacity = 1, thick = 0.07 }: { L: number; W: number; h: number; color: string; opacity?: number; thick?: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, PF + h / 2 - 0.02, (s * W) / 2]}>
          <boxGeometry args={[L, h, thick]} />
          <Mat color={color} opacity={opacity} />
        </mesh>
      ))}
    </>
  )
}

/** A prism (triangle in the x/y plane) of length `d` along z, for gables and saw teeth. */
function prismGeo(w: number, h: number, d: number, skew = 0.5) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(-w / 2 + w * skew, h)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
  g.translate(0, 0, -d / 2)
  return g
}

function Pitched({ L, W, base, color }: { L: number; W: number; base: number; color: string }) {
  const a = (24 * Math.PI) / 180
  const half = W / 2 + 0.35
  const rise = half * Math.tan(a)
  const len = half / Math.cos(a)
  return (
    <group position={[0, base, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, rise / 2 + 0.02, (s * half) / 2]} rotation={[s * a, 0, 0]}>
          <boxGeometry args={[L, 0.07, len]} />
          <Mat color={color} rough={0.7} />
        </mesh>
      ))}
      <mesh position={[0, rise + 0.08, 0]}>
        <boxGeometry args={[L * 0.6, 0.22, 0.5]} />
        <Mat color="#8fb3d0" opacity={0.7} />
      </mesh>
    </group>
  )
}

function Tower({ x, z, h, w }: { x: number; z: number; h: number; w: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, LAND_Y + h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <Mat color={BRICK} />
      </mesh>
      <mesh position={[0, LAND_Y + h * 0.78, w / 2 + 0.005]}>
        <circleGeometry args={[w * 0.3, 20]} />
        <meshStandardMaterial color="#f1eadb" />
      </mesh>
      <mesh position={[0, LAND_Y + h + w * 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[w * 0.85, w * 0.9, 4]} />
        <Mat color={SLATE} />
      </mesh>
    </group>
  )
}

/** Reception building beside the platforms. */
function Hall({ L, side, len, dep, h, roof = true }: { L: number; side: number; len: number; dep: number; h: number; roof?: boolean }) {
  return (
    <group position={[-L * 0.05, 0, side]}>
      <mesh position={[0, LAND_Y + h / 2, 0]}>
        <boxGeometry args={[len, h, dep]} />
        <Mat color={BRICK} />
      </mesh>
      {/* windows */}
      {Array.from({ length: Math.max(2, Math.floor(len / 0.7)) }, (_, i) => (
        <mesh key={i} position={[-len / 2 + (len * (i + 0.5)) / Math.max(2, Math.floor(len / 0.7)), LAND_Y + h * 0.55, (Math.sign(side) * dep) / 2 + 0.004]}>
          <boxGeometry args={[0.22, h * 0.45, 0.01]} />
          <meshStandardMaterial color="#27384c" roughness={0.3} />
        </mesh>
      ))}
      {roof && (
        <mesh position={[0, LAND_Y + h + 0.1, 0]}>
          <boxGeometry args={[len + 0.1, 0.22, dep + 0.1]} />
          <Mat color={SLATE} />
        </mesh>
      )}
    </group>
  )
}

/** The roofed station as seen from outside. Local frame: x along the tracks, z across (origin = platform centre). */
export default function StationShell({ look, layout, annex = -1 }: { look: StationLook; layout: StationLayout; annex?: 1 | -1 }) {
  const L = layout.length + 1.6
  const W = layout.halfWidth * 2 + 0.7
  const wallH = 0.78
  const side = annex * (layout.halfWidth + 1.1)
  const tooth = useMemo(() => prismGeo(1.5, 0.45, W + 0.6, 0.15), [W])

  switch (look) {
    case 'halle':
      return (
        <group>
          <Walls L={L} W={W} h={wallH} color={STONE} thick={0.12} />
          <Barrel L={L} W={W} k={0.55} base={PF + wallH} color={STEEL} opacity={0.98} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * L) / 2, PF + wallH, 0]} rotation={[0, (s * Math.PI) / 2, 0]} scale={[1, 0.55, 1]}>
              <circleGeometry args={[W / 2, 36, 0, Math.PI]} />
              <Mat color="#9fd8ff" opacity={0.28} />
            </mesh>
          ))}
          <Hall L={L} side={side} len={Math.min(L * 0.42, 4.2)} dep={0.9} h={0.95} roof />
        </group>
      )
    case 'glas':
      return (
        <group>
          <Walls L={L} W={W} h={wallH} color="#9fd8ff" opacity={0.3} thick={0.04} />
          <Barrel L={L} W={W} k={0.5} base={PF + wallH} color="#8fd2ff" opacity={0.3} />
        </group>
      )
    case 'gruenderzeit':
      return (
        <group>
          <Walls L={L} W={W} h={wallH} color={BRICK} thick={0.1} />
          <Pitched L={L} W={W} base={PF + wallH} color={SLATE} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * L) / 2, PF + wallH + 0.12, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
              <extrudeGeometry args={[(() => { const sh = new THREE.Shape(); sh.moveTo(-W / 2 - 0.35, 0); sh.lineTo(W / 2 + 0.35, 0); sh.lineTo(0, (W / 2 + 0.35) * Math.tan((24 * Math.PI) / 180)); sh.closePath(); return sh })(), { depth: 0.05, bevelEnabled: false }]} />
              <Mat color="#8fb3d0" opacity={0.55} />
            </mesh>
          ))}
          <Hall L={L} side={side} len={Math.min(L * 0.45, 4.6)} dep={1.0} h={1.1} roof />
          <Tower x={-L * 0.05 - Math.min(L * 0.45, 4.6) * 0.38} z={side} h={2.0} w={0.5} />
        </group>
      )
    case 'modern':
      return (
        <group>
          <mesh position={[0, PF + 0.85, 0]}>
            <boxGeometry args={[L + 0.8, 0.09, W + 0.9]} />
            <Mat color="#eef1f5" rough={0.4} metal={0.2} />
          </mesh>
          <mesh position={[0, PF + 0.8, 0]}>
            <boxGeometry args={[L + 0.7, 0.02, W + 0.8]} />
            <Mat color="#2e6cd6" />
          </mesh>
          <Walls L={L} W={W} h={0.8} color="#9fd8ff" opacity={0.3} thick={0.03} />
          {Array.from({ length: Math.max(2, Math.round(L / 2.2)) + 1 }, (_, i) => (
            <group key={i}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[-L / 2 + (L * i) / Math.max(2, Math.round(L / 2.2)), PF + 0.4, (s * W) / 2]}>
                  <cylinderGeometry args={[0.035, 0.035, 0.8, 8]} />
                  <Mat color="#dfe5ec" metal={0.5} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )
    case 'shed': {
      const n = Math.max(2, Math.round(L / 1.5))
      return (
        <group>
          <Walls L={L} W={W} h={wallH} color="#d9dde3" thick={0.1} />
          {Array.from({ length: n }, (_, i) => (
            <group key={i} position={[-L / 2 + (L * (i + 0.5)) / n, PF + wallH, 0]} scale={[(L / n) / 1.5, 1, 1]}>
              <mesh geometry={tooth}>
                <Mat color="#cfd5dc" rough={0.6} />
              </mesh>
              <mesh position={[-0.75, 0.22, 0]}>
                <boxGeometry args={[0.02, 0.4, W + 0.55]} />
                <Mat color="#8fd2ff" opacity={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      )
    }
    case 'tonne':
      return (
        <group>
          <Walls L={L} W={W} h={wallH} color="#cdd3da" thick={0.12} />
          <Barrel L={L} W={W} k={0.32} base={PF + wallH} color="#cdd3da" opacity={1} ribs={false} />
        </group>
      )
    case 'zelt': {
      const n = Math.max(2, Math.round(L / (W + 0.8)))
      const w = L / n
      return (
        <group>
          {Array.from({ length: n }, (_, i) => (
            <group key={i} position={[-L / 2 + w * (i + 0.5), 0, 0]}>
              <mesh position={[0, PF + 0.8 + 0.5, 0]} rotation={[0, Math.PI / 4, 0]}>
                <coneGeometry args={[Math.hypot(w, W + 0.6) / 2.1, 1.0, 4]} />
                <Mat color="#f4f1ea" opacity={0.92} rough={0.9} />
              </mesh>
              <mesh position={[0, PF + 1.05, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 2.1, 8]} />
                <Mat color="#cfd6de" metal={0.6} />
              </mesh>
            </group>
          ))}
          <Walls L={L} W={W} h={0.35} color="#e9edf2" thick={0.05} />
        </group>
      )
    }
    default: // landhalt
      return (
        <group>
          <mesh position={[0, PF + 0.9, 0]}>
            <boxGeometry args={[L * 0.8, 0.06, W + 0.3]} />
            <Mat color="#e7ebf1" />
          </mesh>
          <mesh position={[0, PF + 0.87, 0]}>
            <boxGeometry args={[L * 0.8 - 0.05, 0.02, W + 0.36]} />
            <Mat color="#2e6cd6" />
          </mesh>
          {[-0.4, 0, 0.4].flatMap((f) => [-1, 1].map((s) => (
            <mesh key={`${f}${s}`} position={[L * f * 0.9, PF + 0.45, (s * W) / 2]}>
              <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
              <Mat color="#cdd4de" metal={0.5} />
            </mesh>
          )))}
          <Hall L={L} side={side} len={1.8} dep={0.7} h={0.65} roof />
          <mesh position={[-L * 0.05, LAND_Y + 0.75 + 0.3, side]} rotation={[0, 0, 0]}>
            <boxGeometry args={[2.0, 0.06, 0.9]} />
            <Mat color={SLATE} />
          </mesh>
        </group>
      )
  }
}
