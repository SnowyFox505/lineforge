import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { airportBoxes, airportLayout } from '../model/airport'
import type { AirportLayout, Rect } from '../model/airport'
import type { CityDoc } from '../model/types'
import type { Network3D } from './network3d'
import { Boxes, matrixAt } from './Tracks3D'

const ASPHALT = '#252a31'
const TAXI = '#656d78'
const APRON = '#808895'
const WHITE = '#f3f6fa'

const mid = (a: number, b: number) => (a + b) / 2

/** A flat slab on the ground. Local frame of the airport: x = u (along the long side), z = v (across). */
function Slab({ r, h, y = 0, color }: { r: Rect; h: number; y?: number; color: string }) {
  return (
    <mesh position={[mid(r.u0, r.u1), y + h / 2, mid(r.v0, r.v1)]}>
      <boxGeometry args={[r.u1 - r.u0, h, r.v1 - r.v0]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  )
}

/** A simple airliner, nose towards +x. */
function Plane({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 2.5, 14]} />
        <meshStandardMaterial color={WHITE} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh position={[1.25, 0.3, 0]} scale={[1.5, 1, 1]}>
        <sphereGeometry args={[0.2, 14, 10]} />
        <meshStandardMaterial color={WHITE} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh position={[-1.3, 0.34, 0]} rotation={[0, 0, 0.18]} scale={[2, 1, 1]}>
        <sphereGeometry args={[0.19, 12, 8]} />
        <meshStandardMaterial color={WHITE} roughness={0.4} />
      </mesh>
      {/* wings, tail */}
      <mesh position={[0.1, 0.25, 0]}>
        <boxGeometry args={[0.65, 0.04, 2.7]} />
        <meshStandardMaterial color="#e6ebf1" roughness={0.5} />
      </mesh>
      <mesh position={[-1.25, 0.34, 0]}>
        <boxGeometry args={[0.4, 0.03, 1]} />
        <meshStandardMaterial color="#e6ebf1" roughness={0.5} />
      </mesh>
      <mesh position={[-1.25, 0.62, 0]}>
        <boxGeometry args={[0.45, 0.5, 0.04]} />
        <meshStandardMaterial color="#2e6cd6" roughness={0.5} />
      </mesh>
      {[-0.7, 0.7].map((z) => (
        <mesh key={z} rotation={[0, 0, Math.PI / 2]} position={[0.28, 0.12, z]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 10]} />
          <meshStandardMaterial color="#aab2bd" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/** A plane that takes off again and again from the first runway. */
function Departure({ l }: { l: AirportLayout }) {
  const ref = useRef<THREE.Group>(null)
  const t0 = useMemo(() => Math.random() * 10, [])
  const v = l.runways[0].v
  const L = l.runwayLength
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const T = 30
    const t = (clock.elapsedTime + t0) % T
    // waits at the start of the runway, rolls with growing speed, lifts off and climbs away
    const roll = Math.max(0, t - 4)
    const u = -L * 0.46 + 0.17 * roll * roll
    const lift = Math.max(0, u - L * 0.1)
    const y = 0.02 + lift * lift * 0.07
    g.position.set(u, y, v)
    g.rotation.z = Math.min(0.32, lift * 0.1)
    g.visible = t > 2 && y < 9
  })
  return (
    <group ref={ref} visible={false}>
      <Plane scale={0.9} />
    </group>
  )
}

function Tower({ u, v }: { u: number; v: number }) {
  return (
    <group position={[u, 0, v]}>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.2, 0.28, 3.4, 12]} />
        <meshStandardMaterial color="#d3d9e0" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.6, 0]}>
        <cylinderGeometry args={[0.55, 0.4, 0.5, 14]} />
        <meshStandardMaterial color="#5f93bd" roughness={0.2} metalness={0.3} emissive="#2a5a82" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 3.92, 0]}>
        <cylinderGeometry args={[0.62, 0.62, 0.08, 14]} />
        <meshStandardMaterial color="#aab2bd" roughness={0.6} />
      </mesh>
      <mesh position={[0, 4.25, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 6]} />
        <meshStandardMaterial color="#cfd6de" />
      </mesh>
    </group>
  )
}

function Hangar({ r }: { r: Rect }) {
  const w = r.u1 - r.u0
  const d = r.v1 - r.v0
  return (
    <group position={[mid(r.u0, r.u1), 0, mid(r.v0, r.v1)]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[w, 0.6, d]} />
        <meshStandardMaterial color="#c8ced6" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.6, 0]} rotation={[0, Math.PI / 2, Math.PI / 2]} scale={[1, 1, 1]}>
        <cylinderGeometry args={[d / 2, d / 2, w, 14, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#9aa2ad" roughness={0.6} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Airport({ l, base }: { l: AirportLayout; base: number }) {
  const markings = useMemo(() => {
    const m: THREE.Matrix4[] = []
    for (const r of l.runways) {
      const n = Math.max(2, Math.floor(l.runwayLength / 1.1))
      for (let i = 0; i < n; i++) m.push(matrixAt(-l.runwayLength / 2 + 0.8 + ((l.runwayLength - 1.6) * (i + 0.5)) / n, 0.047, r.v, 0, 0.5, 0.012, 0.06))
      // threshold stripes at both ends
      for (const sgn of [-1, 1]) {
        for (let k = -2; k <= 2; k++) m.push(matrixAt(sgn * (l.runwayLength / 2 - 0.5), 0.047, r.v + k * (r.w / 6), 0, 0.36, 0.012, r.w / 14))
      }
    }
    return m
  }, [l])

  return (
    <group position={[0, base, 0]}>
      {/* the long side of the area is x (u); turn the whole airport when the area is taller than wide */}
      {l.runways.map((r, i) => (
        <Slab key={i} r={{ u0: -l.runwayLength / 2, u1: l.runwayLength / 2, v0: r.v - r.w / 2, v1: r.v + r.w / 2 }} h={0.04} color={ASPHALT} />
      ))}
      <Slab r={{ u0: -l.runwayLength * 0.42, u1: l.runwayLength * 0.42, v0: l.taxiV - l.taxiW / 2, v1: l.taxiV + l.taxiW / 2 }} h={0.035} color={TAXI} />
      {[-0.3, 0.3].flatMap((f) =>
        l.runways.map((r, i) => (
          <Slab key={`${f}${i}`} r={{ u0: l.runwayLength * f - l.taxiW / 2, u1: l.runwayLength * f + l.taxiW / 2, v0: Math.min(r.v, l.taxiV), v1: Math.max(r.v, l.taxiV) }} h={0.036} color={TAXI} />
        )),
      )}
      <Boxes items={markings} color="#f1f4f8" roughness={0.7} />
      {l.apron && <Slab r={l.apron} h={0.05} color={APRON} />}

      {l.terminal && (
        <group>
          <mesh position={[mid(l.terminal.u0, l.terminal.u1), 0.45, mid(l.terminal.v0, l.terminal.v1)]}>
            <boxGeometry args={[l.terminal.u1 - l.terminal.u0, 0.9, l.terminal.v1 - l.terminal.v0]} />
            <meshStandardMaterial color="#e3e8ef" roughness={0.7} />
          </mesh>
          {/* glass front towards the apron */}
          <mesh position={[mid(l.terminal.u0, l.terminal.u1), 0.5, l.terminal.v0 - 0.005]}>
            <boxGeometry args={[(l.terminal.u1 - l.terminal.u0) * 0.96, 0.55, 0.02]} />
            <meshStandardMaterial color="#6aa5d3" roughness={0.1} metalness={0.3} emissive="#2a5a82" emissiveIntensity={0.3} />
          </mesh>
          {/* roof with an overhang */}
          <mesh position={[mid(l.terminal.u0, l.terminal.u1), 0.95, mid(l.terminal.v0, l.terminal.v1) - 0.15]}>
            <boxGeometry args={[l.terminal.u1 - l.terminal.u0 + 0.5, 0.1, l.terminal.v1 - l.terminal.v0 + 0.4]} />
            <meshStandardMaterial color="#aab2bd" roughness={0.5} metalness={0.2} />
          </mesh>
          {l.piers.map((p, i) => (
            <group key={i}>
              <Slab r={p} h={0.32} y={0.04} color="#d6dce4" />
              <Slab r={{ u0: p.u0 - 0.06, u1: p.u1 + 0.06, v0: p.v0, v1: p.v1 }} h={0.04} y={0.36} color="#9aa2ad" />
            </group>
          ))}
        </group>
      )}
      {l.tower && <Tower u={l.tower.u} v={l.tower.v} />}
      {l.hangars.map((h, i) => (
        <Hangar key={i} r={h} />
      ))}
      {l.stands.map((s, i) => (
        <group key={i} position={[s.u, 0.05, s.v]} rotation={[0, -Math.PI / 2, 0]}>
          <Plane scale={0.78} />
        </group>
      ))}
      <Departure l={l} />
    </group>
  )
}

/** The airports of the city as 3D models: runways, taxiways, apron, terminal with piers, tower, hangars and planes. */
export default function Airports3D({ doc, net }: { doc: CityDoc; net: Network3D }) {
  const items = useMemo(
    () =>
      airportBoxes(doc).map((b) => {
        const l = airportLayout(b)
        const half = doc.size / 2
        return { id: b.zoneId, l, x: l.cx - half, z: l.cy - half }
      }),
    [doc.zoneGrid, doc.zones, doc.size], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <group>
      {items.map(({ id, l, x, z }) => (
        <group key={id} position={[x, 0, z]} rotation={[0, l.horiz ? 0 : -Math.PI / 2, 0]}>
          <Airport l={l} base={net.groundAt(x, z)} />
        </group>
      ))}
    </group>
  )
}
