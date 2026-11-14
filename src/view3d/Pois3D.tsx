import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { poiModel } from '../model/poi'
import type { PoiModel } from '../model/poi'
import type { Poi } from '../model/types'
import { useEditor } from '../store/editorStore'
import { clockHands, gameTime } from '../sim/clock'
import type { Network3D } from './network3d'

/** Small, minimal models of the points of interest: easy to recognise, plain in form. */

const CONCRETE = '#d9dbe0'
const STONE = '#d8c9a6'
const GLASS = '#9fd3ef'

function Mat({ color, rough = 0.85, metal = 0, emissive }: { color: string; rough?: number; metal?: number; emissive?: string }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive} emissiveIntensity={emissive ? 0.35 : 0} />
}

/** An elliptic ring (stands of a stadium) standing on the ground, `h` high */
function Ring({ rx, rz, ix, iz, h, y = 0, color }: { rx: number; rz: number; ix: number; iz: number; h: number; y?: number; color: string }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0)
    const hole = new THREE.Path()
    hole.absellipse(0, 0, ix, iz, 0, Math.PI * 2, true, 0)
    shape.holes.push(hole)
    return new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 44 })
  }, [rx, rz, ix, iz, h])
  return (
    <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <Mat color={color} />
    </mesh>
  )
}

function Stadium({ football, accent }: { football: boolean; accent: string }) {
  const lineMat = <meshStandardMaterial color="#f4f7f4" roughness={0.9} />
  const px = 0.92
  const pz = 0.52
  return (
    <group>
      {/* stands: a low inner tier in the club colour, a taller outer wall, and a roof ring */}
      <Ring rx={1.6} rz={1.12} ix={1.12} iz={0.68} h={0.3} color={accent} />
      <Ring rx={1.6} rz={1.12} ix={1.34} iz={0.9} h={0.42} y={0.3} color={CONCRETE} />
      <Ring rx={1.64} rz={1.16} ix={1.24} iz={0.8} h={0.05} y={0.72} color="#eef0f3" />
      {/* the field */}
      {football ? (
        <group position={[0, 0.02, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[px * 2, pz * 2]} />
            <Mat color="#4c9a52" />
          </mesh>
          {/* touch lines, halfway line, centre circle, penalty areas */}
          {[-1, 1].map((s) => (
            <mesh key={`z${s}`} position={[0, 0.004, s * pz]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[px * 2, 0.025]} />
              {lineMat}
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`x${s}`} position={[s * px, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.025, pz * 2]} />
              {lineMat}
            </mesh>
          ))}
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.025, pz * 2]} />
            {lineMat}
          </mesh>
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.17, 0.195, 32]} />
            {lineMat}
          </mesh>
          {[-1, 1].map((s) => (
            <group key={`b${s}`}>
              <mesh position={[s * (px - 0.16), 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.025, 0.5]} />
                {lineMat}
              </mesh>
              {[-1, 1].map((t) => (
                <mesh key={t} position={[s * (px - 0.08), 0.004, t * 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.16, 0.025]} />
                  {lineMat}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ) : (
        <group position={[0, 0.02, 0]}>
          {/* an open arena: a sandy oval with a ring around it */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[px * 1.18, pz * 1.35, 1]}>
            <circleGeometry args={[1, 40]} />
            <Mat color="#cdb58a" />
          </mesh>
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[px * 0.8, pz * 0.78, 1]}>
            <circleGeometry args={[1, 40]} />
            <Mat color="#7fae68" />
          </mesh>
        </group>
      )}
      {/* floodlight masts at the four corners */}
      {[
        [-1.35, -0.95],
        [1.35, -0.95],
        [-1.35, 0.95],
        [1.35, 0.95],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.018, 0.026, 1.2, 8]} />
            <Mat color="#9aa0aa" />
          </mesh>
          <mesh position={[0, 1.22, 0]}>
            <boxGeometry args={[0.2, 0.09, 0.07]} />
            <Mat color="#fff6c8" emissive="#fff0a8" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FerrisWheel({ accent }: { accent: string }) {
  const wheel = useRef<THREE.Group>(null)
  const R = 0.95
  const cabins = 12
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z += dt * 0.12
  })
  const hub = 1.15
  return (
    <group>
      {/* the two legs of the frame and the axle */}
      {[-0.1, 0.1].map((z) => (
        <group key={z}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.34, hub / 2, z]} rotation={[0, 0, -s * 0.28]}>
              <boxGeometry args={[0.045, hub + 0.1, 0.045]} />
              <Mat color="#aab0ba" />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, hub, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.34, 10]} />
        <Mat color="#7b828d" />
      </mesh>
      <group ref={wheel} position={[0, hub, 0]}>
        {[-0.1, 0.1].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh>
              <torusGeometry args={[R, 0.014, 6, 56]} />
              <Mat color="#f2f4f7" />
            </mesh>
            <mesh>
              <torusGeometry args={[R * 0.55, 0.01, 6, 40]} />
              <Mat color="#f2f4f7" />
            </mesh>
            {Array.from({ length: cabins }, (_, i) => (
              <mesh key={i} rotation={[0, 0, (i * Math.PI) / cabins]}>
                <boxGeometry args={[R * 2, 0.008, 0.008]} />
                <Mat color="#f2f4f7" />
              </mesh>
            ))}
          </group>
        ))}
        {Array.from({ length: cabins }, (_, i) => {
          const a = (i * Math.PI * 2) / cabins
          return (
            <CabinOnRim key={i} x={Math.cos(a) * R} y={Math.sin(a) * R} color={i % 2 ? accent : '#ffffff'} />
          )
        })}
      </group>
    </group>
  )
}

/** A gondola hangs from the rim and keeps upright: it counter-rotates with the wheel (see FerrisWheel's group) */
function CabinOnRim({ x, y, color }: { x: number; y: number; color: string }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const parent = g.current?.parent
    if (g.current && parent) g.current.rotation.z = -parent.rotation.z
  })
  return (
    <group ref={g} position={[x, y, 0]}>
      <mesh position={[0, -0.075, 0]}>
        <boxGeometry args={[0.11, 0.1, 0.17]} />
        <Mat color={color} />
      </mesh>
    </group>
  )
}

function TvTower() {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.3, 0.38, 0.12, 20]} />
        <Mat color={CONCRETE} />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.04, 0.11, 2.5, 14]} />
        <Mat color="#e8eaee" />
      </mesh>
      {/* the sphere with its ring, and a lower platform */}
      <mesh position={[0, 2.35, 0]}>
        <sphereGeometry args={[0.3, 24, 16]} />
        <Mat color="#c8ccd4" rough={0.35} metal={0.5} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.07, 24]} />
        <Mat color="#aeb4be" metal={0.3} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.11, 0.07, 0.14, 16]} />
        <Mat color="#aeb4be" metal={0.3} />
      </mesh>
      {/* antenna in red and white */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 2.78 + i * 0.19, 0]}>
          <cylinderGeometry args={[0.022 - i * 0.004, 0.026 - i * 0.004, 0.19, 8]} />
          <Mat color={i % 2 ? '#ffffff' : '#e03a3a'} />
        </mesh>
      ))}
      <mesh position={[0, 2.43, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.01, 4]} />
        <Mat color="#ff3030" emissive="#ff3030" />
      </mesh>
    </group>
  )
}

function Dome({ accent }: { accent: string }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.0, 1.05, 0.24, 36]} />
        <Mat color={CONCRETE} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <sphereGeometry args={[0.92, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={GLASS} roughness={0.2} metalness={0.2} transparent opacity={0.72} />
      </mesh>
      {/* a frame of two half rings and an entrance */}
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} position={[0, 0.24, 0]} rotation={[0, r, 0]}>
          <torusGeometry args={[0.925, 0.012, 6, 40, Math.PI]} />
          <Mat color="#ffffff" />
        </mesh>
      ))}
      <mesh position={[0.95, 0.2, 0]}>
        <boxGeometry args={[0.36, 0.3, 0.5]} />
        <Mat color={accent} />
      </mesh>
    </group>
  )
}

function CityGate() {
  const cols = [-0.85, -0.51, -0.17, 0.17, 0.51, 0.85]
  return (
    <group>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[2.3, 0.08, 0.9]} />
        <Mat color="#c9bb98" />
      </mesh>
      {[-0.2, 0.2].map((z) =>
        cols.map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.48, z]}>
            <cylinderGeometry args={[0.07, 0.08, 0.8, 12]} />
            <Mat color={STONE} />
          </mesh>
        )),
      )}
      {/* entablature and attic, with the figure on top */}
      <mesh position={[0, 0.94, 0]}>
        <boxGeometry args={[2.1, 0.14, 0.62]} />
        <Mat color={STONE} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[1.9, 0.14, 0.5]} />
        <Mat color="#cdbf9c" />
      </mesh>
      <mesh position={[0, 1.27, 0]}>
        <boxGeometry args={[0.5, 0.24, 0.16]} />
        <Mat color="#8c6a3a" metal={0.3} />
      </mesh>
      <mesh position={[0, 1.44, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.16, 0.16, 0.1]} />
        <Mat color="#8c6a3a" metal={0.3} />
      </mesh>
    </group>
  )
}

/** One clock face on a side of the tower: gold rim, white dial, twelve marks, two hands. Faces +z of its group. */
function ClockFace({ y }: { y: number }) {
  const minute = useRef<THREE.Group>(null)
  const hour = useRef<THREE.Group>(null)
  useFrame(() => {
    const h = clockHands(gameTime.minutes)
    // seen from the front a clockwise turn is a negative rotation about z
    if (minute.current) minute.current.rotation.z = -h.minute * Math.PI * 2
    if (hour.current) hour.current.rotation.z = -h.hour * Math.PI * 2
  })
  return (
    <group position={[0, y, 0.275]}>
      <mesh>
        <ringGeometry args={[0.14, 0.175, 40]} />
        <Mat color="#c79a2e" rough={0.4} metal={0.6} />
      </mesh>
      <mesh position={[0, 0, -0.002]}>
        <circleGeometry args={[0.14, 40]} />
        <meshStandardMaterial color="#fffbea" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6
        const big = i % 3 === 0
        return (
          <mesh key={i} position={[Math.sin(a) * 0.115, Math.cos(a) * 0.115, 0.002]} rotation={[0, 0, -a]}>
            <boxGeometry args={[big ? 0.02 : 0.012, big ? 0.04 : 0.025, 0.003]} />
            <Mat color="#2a2a2e" />
          </mesh>
        )
      })}
      {/* the hands show the game time (see sim/clock) */}
      <group ref={minute} position={[0, 0, 0.005]}>
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[0.014, 0.1, 0.004]} />
          <Mat color="#1d1d22" />
        </mesh>
      </group>
      <group ref={hour} position={[0, 0, 0.007]}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.02, 0.07, 0.004]} />
          <Mat color="#1d1d22" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.009]}>
        <circleGeometry args={[0.012, 12]} />
        <Mat color="#c79a2e" metal={0.5} />
      </mesh>
    </group>
  )
}

/**
 * A town-hall clock tower: stone plinth, shaft with corner pilasters and slit windows, a clock stage with four faces, a
 * belfry with arched openings, and a verdigris copper roof with a spire. The parts stack exactly (no gaps).
 */
function ClockTower() {
  const LIME = '#dccfb6'
  const TRIM = '#b8ab92'
  const DARK = '#2b2f38'
  const COPPER = '#5fa892'
  return (
    <group>
      {/* plinth and shaft (0 .. 1.3) */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.76, 0.2, 0.76]} />
        <Mat color={TRIM} />
      </mesh>
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[0.5, 1.1, 0.5]} />
        <Mat color={LIME} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * 0.26, 0.75, sz * 0.26]}>
          <boxGeometry args={[0.07, 1.1, 0.07]} />
          <Mat color={TRIM} />
        </mesh>
      )))}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          {[0.5, 0.92].map((y) => (
            <mesh key={y} position={[0, y, 0.252]}>
              <boxGeometry args={[0.07, 0.26, 0.012]} />
              <Mat color={DARK} />
            </mesh>
          ))}
        </group>
      ))}
      {/* first cornice (1.3 .. 1.37) */}
      <mesh position={[0, 1.335, 0]}>
        <boxGeometry args={[0.62, 0.07, 0.62]} />
        <Mat color={TRIM} />
      </mesh>
      {/* clock stage (1.37 .. 1.87) */}
      <mesh position={[0, 1.62, 0]}>
        <boxGeometry args={[0.54, 0.5, 0.54]} />
        <Mat color={LIME} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <ClockFace y={1.62} />
        </group>
      ))}
      {/* second cornice (1.87 .. 1.94) */}
      <mesh position={[0, 1.905, 0]}>
        <boxGeometry args={[0.66, 0.07, 0.66]} />
        <Mat color={TRIM} />
      </mesh>
      {/* belfry (1.94 .. 2.24) with arched openings */}
      <mesh position={[0, 2.09, 0]}>
        <boxGeometry args={[0.46, 0.3, 0.46]} />
        <Mat color={LIME} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <mesh position={[0, 2.075, 0.233]}>
            <boxGeometry args={[0.13, 0.17, 0.012]} />
            <Mat color={DARK} />
          </mesh>
          <mesh position={[0, 2.16, 0.233]}>
            <cylinderGeometry args={[0.065, 0.065, 0.012, 14]} />
            <Mat color={DARK} />
          </mesh>
        </group>
      ))}
      {/* third cornice (2.24 .. 2.29) and pinnacles on its corners */}
      <mesh position={[0, 2.265, 0]}>
        <boxGeometry args={[0.58, 0.05, 0.58]} />
        <Mat color={TRIM} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`p${sx}${sz}`} position={[sx * 0.25, 2.36, sz * 0.25]}>
          <coneGeometry args={[0.04, 0.14, 4]} />
          <Mat color={TRIM} />
        </mesh>
      )))}
      {/* copper roof (2.29 .. 3.01), spire and gilded ball */}
      <mesh position={[0, 2.65, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.41, 0.72, 4]} />
        <Mat color={COPPER} rough={0.5} metal={0.25} />
      </mesh>
      <mesh position={[0, 3.12, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.22, 8]} />
        <Mat color="#c79a2e" metal={0.6} />
      </mesh>
      <mesh position={[0, 3.04, 0]}>
        <sphereGeometry args={[0.04, 12, 10]} />
        <Mat color="#d9ad3a" rough={0.35} metal={0.7} />
      </mesh>
    </group>
  )
}

function Model({ model, poi, accent }: { model: PoiModel; poi: Poi; accent: string }) {
  void poi
  switch (model) {
    case 'football':
      return <Stadium football accent={accent} />
    case 'arena':
      return <Stadium football={false} accent={accent} />
    case 'wheel':
      return <FerrisWheel accent={accent} />
    case 'tvtower':
      return <TvTower />
    case 'dome':
      return <Dome accent={accent} />
    case 'gate':
      return <CityGate />
    case 'clocktower':
      return <ClockTower />
  }
}

const ACCENT = { stadium: '#d94a4a', attraction: '#2f9bd6', landmark: '#d9a21f' } as const

/** All points of interest of the city as small models on the ground. */
export default function Pois3D({ net }: { net: Network3D }) {
  const pois = useEditor((s) => s.doc.pois)
  const size = useEditor((s) => s.doc.size)
  const half = size / 2
  return (
    <>
      {(pois ?? []).map((p) => {
        const x = p.x + 0.5 - half
        const z = p.y + 0.5 - half
        return (
          <group key={p.id} position={[x, net.groundAt(x, z), z]}>
            <Model model={poiModel(p)} poi={p} accent={ACCENT[p.kind]} />
          </group>
        )
      })}
    </>
  )
}
