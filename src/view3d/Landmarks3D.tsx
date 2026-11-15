import { useMemo } from 'react'
import * as THREE from 'three'

/** Plain, recognisable models of town landmarks: cathedral, church, town hall, cemetery and castle. Local frame: y up, front towards +z. */

const STONE = '#d8d0bc'
const STONE_DARK = '#b9b09a'
const SLATE = '#5f6672'
const COPPER = '#5fa08c'
const BRICK = '#b9694f'
const GOLD = '#d9ad3a'
const GLASS = '#7fb4d6'

function Mat({ color, rough = 0.85, metal = 0, emissive }: { color: string; rough?: number; metal?: number; emissive?: string }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive} emissiveIntensity={emissive ? 0.5 : 0} />
}

function Box({ p, s, c, rough, metal }: { p: [number, number, number]; s: [number, number, number]; c: string; rough?: number; metal?: number }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <Mat color={c} rough={rough} metal={metal} />
    </mesh>
  )
}

/** A gabled roof over a w x d footprint (ridge along z), sitting on y */
function Gable({ w, d, h, y, c }: { w: number; d: number; h: number; y: number; c: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0)
    s.lineTo(w / 2, 0)
    s.lineTo(0, h)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
    g.translate(0, 0, -d / 2)
    return g
  }, [w, d, h])
  return (
    <mesh geometry={geo} position={[0, y, 0]}>
      <Mat color={c} rough={0.7} />
    </mesh>
  )
}

/** A square pyramid roof */
function Spire({ r, h, y, c, x = 0, z = 0, metal = 0 }: { r: number; h: number; y: number; c: string; x?: number; z?: number; metal?: number }) {
  return (
    <mesh position={[x, y + h / 2, z]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[r * Math.SQRT2, h, 4]} />
      <Mat color={c} rough={0.6} metal={metal} />
    </mesh>
  )
}

function Cross({ y, x = 0, z = 0, s = 1 }: { y: number; x?: number; z?: number; s?: number }) {
  return (
    <group position={[x, y, z]} scale={s}>
      <Box p={[0, 0.07, 0]} s={[0.02, 0.14, 0.02]} c={GOLD} metal={0.6} />
      <Box p={[0, 0.1, 0]} s={[0.08, 0.02, 0.02]} c={GOLD} metal={0.6} />
    </group>
  )
}

/** Pointed windows as dark glass panels on a wall; `axis` x puts them on the sides, z on the front */
function Windows({ at, count, step, y, axis, h = 0.2, w = 0.07 }: { at: number; count: number; step: number; y: number; axis: 'x' | 'z'; h?: number; w?: number }) {
  const items = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step)
  return (
    <>
      {items.map((t, i) => (
        <mesh key={i} position={axis === 'x' ? [at, y, t] : [t, y, at]}>
          <boxGeometry args={axis === 'x' ? [0.012, h, w] : [w, h, 0.012]} />
          <Mat color={GLASS} rough={0.3} emissive="#ffd98a" />
        </mesh>
      ))}
    </>
  )
}

export function Cathedral() {
  return (
    <group>
      <Box p={[0, 0.03, 0]} s={[1.5, 0.06, 2.5]} c={STONE_DARK} />
      {/* nave and the lower choir at the back */}
      <Box p={[0, 0.4, 0.1]} s={[0.78, 0.68, 1.7]} c={STONE} />
      <Gable w={0.9} d={1.7} h={0.42} y={0.74} c={SLATE} />
      <Box p={[0, 0.3, -1.05]} s={[0.6, 0.48, 0.6]} c={STONE} />
      <Gable w={0.7} d={0.6} h={0.3} y={0.54} c={SLATE} />
      {/* transept */}
      <Box p={[0, 0.4, 0.05]} s={[1.5, 0.68, 0.5]} c={STONE} />
      <Gable w={0.62} d={1.5} h={0.34} y={0.74} c={SLATE} />
      {/* the two front towers with spires */}
      {[-0.34, 0.34].map((x) => (
        <group key={x}>
          <Box p={[x, 0.78, 1.02]} s={[0.36, 1.5, 0.36]} c={STONE} />
          <Box p={[x, 1.55, 1.02]} s={[0.4, 0.06, 0.4]} c={STONE_DARK} />
          <Spire r={0.19} h={0.7} y={1.58} c={SLATE} x={x} z={1.02} />
          <Cross y={2.28} x={x} z={1.02} />
          <Box p={[x, 1.2, 1.205]} s={[0.08, 0.3, 0.012]} c={GLASS} />
        </group>
      ))}
      {/* the slender crossing spire */}
      <Spire r={0.11} h={0.9} y={1.1} c={COPPER} z={0.05} metal={0.2} />
      <Cross y={2.0} z={0.05} />
      {/* portal and rose window */}
      <Box p={[0, 0.2, 1.22]} s={[0.3, 0.4, 0.06]} c={STONE_DARK} />
      <mesh position={[0, 0.7, 1.235]}>
        <circleGeometry args={[0.13, 20]} />
        <Mat color={GLASS} rough={0.3} emissive="#ffd98a" />
      </mesh>
      {/* buttresses along the nave */}
      {[-0.42, 0.42].map((x) =>
        [-0.45, 0.2, 0.7].map((z) => <Box key={`${x}${z}`} p={[x, 0.3, z]} s={[0.07, 0.6, 0.08]} c={STONE_DARK} />),
      )}
      <Windows at={0.395} count={3} step={0.4} y={0.42} axis="x" h={0.28} />
      <Windows at={-0.395} count={3} step={0.4} y={0.42} axis="x" h={0.28} />
    </group>
  )
}

export function Church() {
  return (
    <group>
      <Box p={[0, 0.025, 0]} s={[1.1, 0.05, 1.7]} c="#a9b58a" rough={0.95} />
      <Box p={[0, 0.27, -0.1]} s={[0.56, 0.44, 1.0]} c="#ece5d3" />
      <Gable w={0.66} d={1.0} h={0.3} y={0.49} c={BRICK} />
      <Box p={[0, 0.2, -0.78]} s={[0.36, 0.3, 0.3]} c="#ece5d3" />
      <Gable w={0.42} d={0.3} h={0.18} y={0.35} c={BRICK} />
      {/* the tower at the front, with a pointed roof and a clock-less belfry */}
      <Box p={[0, 0.5, 0.58]} s={[0.34, 0.95, 0.34]} c="#ece5d3" />
      <Box p={[0, 1.0, 0.58]} s={[0.36, 0.06, 0.36]} c={STONE_DARK} />
      <Spire r={0.18} h={0.6} y={1.03} c={BRICK} z={0.58} />
      <Cross y={1.62} z={0.58} />
      <Box p={[0, 0.82, 0.76]} s={[0.1, 0.16, 0.01]} c="#2b2f36" />
      <Box p={[0, 0.12, 0.76]} s={[0.14, 0.24, 0.02]} c="#6a4a32" />
      <Windows at={0.285} count={2} step={0.34} y={0.28} axis="x" />
      <Windows at={-0.285} count={2} step={0.34} y={0.28} axis="x" />
    </group>
  )
}

export function TownHall() {
  return (
    <group>
      <Box p={[0, 0.03, 0.1]} s={[2.5, 0.06, 1.7]} c="#c6c2b6" />
      {/* the long main building with its hipped roof */}
      <Box p={[0, 0.4, 0]} s={[2.1, 0.68, 0.8]} c="#e2d3b3" />
      <Box p={[0, 0.76, 0]} s={[2.18, 0.06, 0.88]} c={STONE_DARK} />
      <group rotation={[0, Math.PI / 2, 0]}>
        <Gable w={0.88} d={2.18} h={0.28} y={0.79} c={BRICK} />
      </group>
      {/* two rows of windows, a door and steps */}
      {[0.28, 0.56].map((y) => (
        <group key={y}>
          <Windows at={0.405} count={7} step={0.28} y={y} axis="z" h={0.14} w={0.1} />
        </group>
      ))}
      <Box p={[0, 0.2, 0.46]} s={[0.24, 0.34, 0.06]} c="#6a4a32" />
      <Box p={[0, 0.04, 0.6]} s={[0.7, 0.08, 0.3]} c="#c6c2b6" />
      <Box p={[0, 0.1, 0.55]} s={[0.54, 0.08, 0.2]} c="#c6c2b6" />
      {/* the tower in the middle, with a gold-tipped copper roof */}
      <Box p={[0, 1.2, 0]} s={[0.46, 0.9, 0.46]} c="#e2d3b3" />
      <Box p={[0, 1.67, 0]} s={[0.54, 0.06, 0.54]} c={STONE_DARK} />
      <Spire r={0.27} h={0.55} y={1.7} c={COPPER} metal={0.2} />
      <mesh position={[0, 2.35, 0]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <Mat color={GOLD} rough={0.35} metal={0.7} />
      </mesh>
      {/* the balcony and flags */}
      <Box p={[0, 0.46, 0.46]} s={[0.5, 0.04, 0.14]} c={STONE_DARK} />
      {[-0.9, 0.9].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.78, 0.45]}>
            <cylinderGeometry args={[0.01, 0.01, 0.9, 6]} />
            <Mat color="#9aa0a8" metal={0.5} />
          </mesh>
          <Box p={[x + 0.09, 1.1, 0.45]} s={[0.16, 0.1, 0.01]} c="#d94a4a" />
        </group>
      ))}
    </group>
  )
}

export function Cemetery() {
  // headstones in rows, each a little different in height
  const stones = useMemo(() => {
    const out: { x: number; z: number; h: number; cross: boolean }[] = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const k = r * 5 + c
        out.push({ x: -0.85 + c * 0.28 + ((k * 7) % 3) * 0.01, z: -0.45 + r * 0.3, h: 0.09 + ((k * 5) % 4) * 0.02, cross: k % 6 === 2 })
      }
    }
    return out
  }, [])
  return (
    <group>
      <Box p={[0, 0.015, 0]} s={[2.4, 0.03, 2.2]} c="#8fa07a" rough={0.95} />
      {/* paths in a cross */}
      <Box p={[0, 0.034, 0]} s={[0.16, 0.01, 2.2]} c="#cdbf9c" rough={0.95} />
      <Box p={[0, 0.036, 0.1]} s={[2.4, 0.01, 0.12]} c="#cdbf9c" rough={0.95} />
      {/* the low wall with the gate */}
      <Box p={[0, 0.09, -1.1]} s={[2.4, 0.12, 0.05]} c={STONE} />
      <Box p={[-1.2, 0.09, 0]} s={[0.05, 0.12, 2.2]} c={STONE} />
      <Box p={[1.2, 0.09, 0]} s={[0.05, 0.12, 2.2]} c={STONE} />
      <Box p={[-0.75, 0.09, 1.1]} s={[0.9, 0.12, 0.05]} c={STONE} />
      <Box p={[0.75, 0.09, 1.1]} s={[0.9, 0.12, 0.05]} c={STONE} />
      {[-0.31, 0.31].map((x) => (
        <Box key={x} p={[x, 0.15, 1.1]} s={[0.07, 0.24, 0.07]} c={STONE_DARK} />
      ))}
      {stones.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <Box p={[0, s.h / 2 + 0.03, 0]} s={[0.1, s.h, 0.03]} c="#9a9fa8" />
          {s.cross && <Cross y={s.h + 0.03} s={0.7} />}
        </group>
      ))}
      {/* a small chapel at the back and two cypresses */}
      <Box p={[0, 0.2, -0.85]} s={[0.5, 0.34, 0.4]} c="#ece5d3" />
      <Gable w={0.58} d={0.4} h={0.2} y={0.37} c={SLATE} />
      <Cross y={0.57} z={-0.85} />
      {[-1.0, 1.0].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.8]}>
          <coneGeometry args={[0.1, 0.55, 8]} />
          <Mat color="#2f5a37" />
        </mesh>
      ))}
    </group>
  )
}

/** Battlements: small blocks along one side of a wall */
function Crenels({ from, to, y, n, size = 0.07 }: { from: [number, number]; to: [number, number]; y: number; n: number; size?: number }) {
  const items = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as const
  })
  return (
    <>
      {items.map(([x, z], i) => (
        <Box key={i} p={[x, y, z]} s={[size, size, size]} c={STONE_DARK} />
      ))}
    </>
  )
}

export function Castle() {
  const w = 1.1 // half width of the curtain wall
  const towers: [number, number][] = [
    [-w, -w],
    [w, -w],
    [-w, w],
    [w, w],
  ]
  return (
    <group>
      <Box p={[0, 0.02, 0]} s={[2.7, 0.04, 2.7]} c="#9aa682" rough={0.95} />
      {/* the walls with battlements */}
      {[
        { p: [0, 0.3, -w] as [number, number, number], s: [2.2, 0.6, 0.12] as [number, number, number], a: [-w, -w] as [number, number], b: [w, -w] as [number, number] },
        { p: [0, 0.3, w] as [number, number, number], s: [2.2, 0.6, 0.12] as [number, number, number], a: [-w, w] as [number, number], b: [w, w] as [number, number] },
        { p: [-w, 0.3, 0] as [number, number, number], s: [0.12, 0.6, 2.2] as [number, number, number], a: [-w, -w] as [number, number], b: [-w, w] as [number, number] },
        { p: [w, 0.3, 0] as [number, number, number], s: [0.12, 0.6, 2.2] as [number, number, number], a: [w, -w] as [number, number], b: [w, w] as [number, number] },
      ].map((wall, i) => (
        <group key={i}>
          <Box p={wall.p} s={wall.s} c={STONE} />
          <Crenels from={wall.a} to={wall.b} y={0.64} n={16} />
        </group>
      ))}
      {/* round corner towers with cone roofs */}
      {towers.map(([x, z]) => (
        <group key={`${x}${z}`}>
          <mesh position={[x, 0.45, z]}>
            <cylinderGeometry args={[0.22, 0.24, 0.9, 16]} />
            <Mat color={STONE} />
          </mesh>
          <mesh position={[x, 0.93, z]}>
            <cylinderGeometry args={[0.27, 0.22, 0.08, 16]} />
            <Mat color={STONE_DARK} />
          </mesh>
          <mesh position={[x, 1.25, z]}>
            <coneGeometry args={[0.28, 0.56, 16]} />
            <Mat color="#a3473a" rough={0.6} />
          </mesh>
          <mesh position={[x, 0.62, z + (z > 0 ? 0.2 : -0.2)]}>
            <boxGeometry args={[0.05, 0.12, 0.012]} />
            <Mat color="#2b2f36" />
          </mesh>
        </group>
      ))}
      {/* the gate in the front wall */}
      <Box p={[0, 0.2, w + 0.065]} s={[0.36, 0.4, 0.05]} c="#4a3a2c" />
      <Box p={[-0.3, 0.45, w]} s={[0.18, 0.9, 0.2]} c={STONE_DARK} />
      <Box p={[0.3, 0.45, w]} s={[0.18, 0.9, 0.2]} c={STONE_DARK} />
      {/* the keep in the middle, with a smaller tower and a flag */}
      <Box p={[0, 0.65, 0]} s={[0.78, 1.3, 0.78]} c={STONE} />
      <Box p={[0, 1.32, 0]} s={[0.88, 0.07, 0.88]} c={STONE_DARK} />
      <Crenels from={[-0.4, -0.4]} to={[0.4, -0.4]} y={1.4} n={6} size={0.09} />
      <Crenels from={[-0.4, 0.4]} to={[0.4, 0.4]} y={1.4} n={6} size={0.09} />
      <Crenels from={[-0.4, -0.4]} to={[-0.4, 0.4]} y={1.4} n={6} size={0.09} />
      <Crenels from={[0.4, -0.4]} to={[0.4, 0.4]} y={1.4} n={6} size={0.09} />
      <mesh position={[0.2, 1.7, -0.2]}>
        <cylinderGeometry args={[0.22, 0.24, 0.7, 14]} />
        <Mat color={STONE} />
      </mesh>
      <mesh position={[0.2, 2.17, -0.2]}>
        <coneGeometry args={[0.27, 0.45, 14]} />
        <Mat color="#a3473a" rough={0.6} />
      </mesh>
      <mesh position={[-0.2, 1.72, 0.2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.8, 6]} />
        <Mat color="#9aa0a8" metal={0.5} />
      </mesh>
      <Box p={[-0.11, 2.0, 0.2]} s={[0.18, 0.11, 0.01]} c="#d94a4a" />
      <Windows at={0.395} count={3} step={0.22} y={0.8} axis="z" h={0.18} w={0.07} />
    </group>
  )
}
