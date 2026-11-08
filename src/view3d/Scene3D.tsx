import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useCallback, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildTerrainPaths, drawTerrain } from '../editor2d/terrainRender'
import { buildZoneGfx } from '../editor2d/zoneGfx'
import { makeSampler } from '../model/terrainField'
import type { CityDoc } from '../model/types'
import { useEditor } from '../store/editorStore'
import Icon from '../ui/Icon'
import { lookOf } from '../model/profiles'
import Buildings3D from './Buildings3D'
import Label3D from './Label3D'
import { LegPanel, LegPicker } from './LegTools'
import StationBuilding from './StationBuilding'
import type { EntranceSign } from './StationBuilding'
import { BASE_Y, groundHeight, LAND_Y, WATER_Y } from './heights'
import { buildNetwork3D } from './network3d'
import type { Network3D, StationGroup, StationNet } from './network3d'
import Tracks3D from './Tracks3D'
import TouchRig, { TOUCHES } from './TouchRig'
import Trains3D from './Trains3D'

const c = (hex: string) => new THREE.Color(hex)

/** Smooth terrain with real river beds. Resolution doubles on small maps so the banks stay round. */
function buildTerrain(doc: CityDoc, field: Float32Array, carve: (x: number, z: number, h: number) => number) {
  const { size } = doc
  const r = size <= 256 ? 2 : 1
  const m = size * r
  const n = m + 1
  const sample = makeSampler(field, size)
  const pos = new Float32Array(n * n * 3)
  const uv = new Float32Array(n * n * 2)
  const heights = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const idx = j * n + i
      const u = i / r
      const v = j / r
      const h = carve(u - size / 2, v - size / 2, groundHeight(sample(u, v)))
      heights[idx] = h
      pos[idx * 3] = u - size / 2
      pos[idx * 3 + 1] = h
      pos[idx * 3 + 2] = v - size / 2
      uv[idx * 2] = i / m
      uv[idx * 2 + 1] = 1 - j / m
    }
  }
  const index = new Uint32Array(m * m * 6)
  let k = 0
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const a = j * n + i
      const b = a + 1
      const d = a + n
      const e = d + 1
      index[k++] = a
      index[k++] = d
      index[k++] = b
      index[k++] = b
      index[k++] = d
      index[k++] = e
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeVertexNormals()

  // Four walls make the map a solid block, so river banks show their cross-section
  const sp: number[] = []
  const sc: number[] = []
  const si: number[] = []
  const top = c('#27483f')
  const bottom = c('#070d0e')
  const wall = (pts: [number, number, number][]) => {
    const base = sp.length / 3
    for (const [x, y, z] of pts) {
      sp.push(x, y, z, x, BASE_Y, z)
      sc.push(top.r, top.g, top.b, bottom.r, bottom.g, bottom.b)
    }
    for (let q = 0; q < pts.length - 1; q++) {
      const a = base + q * 2
      si.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  }
  const row = (j: number) => Array.from({ length: n }, (_, i) => [i / r - size / 2, heights[j * n + i], j / r - size / 2] as [number, number, number])
  const col = (i: number) => Array.from({ length: n }, (_, j) => [i / r - size / 2, heights[j * n + i], j / r - size / 2] as [number, number, number])
  wall(row(0))
  wall(row(m))
  wall(col(0))
  wall(col(m))
  const skirt = new THREE.BufferGeometry()
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
  skirt.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3))
  skirt.setIndex(si)
  skirt.computeVertexNormals()
  return { geo, skirt }
}

/** Water surface only where there is water (a plane over the whole map would flood lowered tracks). */
function buildWater(size: number, field: Float32Array) {
  const n = size + 1
  const pos: number[] = []
  const idx: number[] = []
  const half = size / 2
  let v = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = Math.max(field[y * n + x], field[y * n + x + 1], field[(y + 1) * n + x], field[(y + 1) * n + x + 1])
      if (m < 0.3) continue
      pos.push(x - half, WATER_Y, y - half, x + 1 - half, WATER_Y, y - half, x - half, WATER_Y, y + 1 - half, x + 1 - half, WATER_Y, y + 1 - half)
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
      v += 4
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** The smooth 2D map is rendered once into a texture, so 3D and 2D look identical. */
function buildTexture(doc: CityDoc) {
  const res = Math.min(2048, doc.size * 8)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = res
  const ctx = canvas.getContext('2d')!
  drawTerrain(ctx, { ox: 0, oy: 0, s: res / doc.size }, doc.size, buildTerrainPaths(doc.terrain, doc.size), res, res, true, buildZoneGfx(doc))
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function Terrain({ doc, net, see }: { doc: CityDoc; net: Network3D; see: boolean }) {
  const { geo, skirt } = useMemo(() => buildTerrain(doc, net.field, net.carve), [doc.size, net.field, net.carve]) // eslint-disable-line react-hooks/exhaustive-deps
  const tex = useMemo(() => buildTexture(doc), [doc.terrain, doc.zoneGrid, doc.zones, doc.size]) // eslint-disable-line react-hooks/exhaustive-deps
  const water = useMemo(() => buildWater(doc.size, net.field), [doc.size, net.field])
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial key={see ? 'see' : 'solid'} map={tex} color={see ? '#46505e' : '#ffffff'} roughness={0.95} metalness={0} transparent={see} opacity={see ? 0.3 : 1} depthWrite={!see} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial key={see ? 'see' : 'solid'} vertexColors roughness={1} side={THREE.DoubleSide} transparent={see} opacity={see ? 0.3 : 1} />
      </mesh>
      {/* water surface */}
      <mesh geometry={water}>
        <meshStandardMaterial color="#3fb2e6" transparent opacity={0.4} roughness={0.08} metalness={0.25} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Lowest terrain height under an elevated platform complex (its pillars stand on it). */
function groundUnder(net: Network3D, g: StationGroup): number {
  let low = Infinity
  for (const u of [-1, 0, 1]) {
    for (const v of [-1, 0, 1]) {
      const lu = (u * g.layout.length) / 2
      const lv = v * g.layout.halfWidth
      low = Math.min(low, net.groundAt(g.ox + g.ax * lu - g.az * lv, g.oz + g.az * lu + g.ax * lv))
    }
  }
  return low
}

/** Entrance sign of a station group: U if the metro calls there, S for the S-Bahn, else Bf. */
function signFor(net: Network3D, lineIds: string[]): EntranceSign {
  const ops = lineIds.map((id) => net.lines.find((l) => l.line.id === id)?.line.operator)
  return ops.includes('ubahn') ? 'U' : ops.includes('sbahn') ? 'S' : 'Bf'
}

function Stations({ net }: { net: Network3D }) {
  const setEdit = useEditor((s) => s.setEditStation)
  return (
    <>
      {Object.values(net.stations).map((sn) => {
        const { st } = sn
        const main = sn.groups.find((g) => g.kind === 'main') ?? sn.groups[0]
        const tall = Math.max(0, ...sn.groups.map((g) => g.lift)) + (sn.design.roof === 'hall' ? 2.1 : sn.design.roof === 'glass' ? 1.9 : st.type === 'landmark' ? 2.2 : 1.5)
        const tap = (g: { layout: StationNet['layout'] }) => (
          <mesh
            position={[0, LAND_Y + 0.5, 0]}
            onClick={(e) => {
              e.stopPropagation()
              setEdit(st.id)
            }}
          >
            <boxGeometry args={[g.layout.length + 2, 1.4, g.layout.halfWidth * 2 + 2]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )
        return (
          <group key={st.id}>
            {sn.groups.length === 0 && (
              // a station without lines: platforms with short tracks
              <group position={[sn.x, 0, sn.z]} rotation={[0, sn.angle, 0]}>
                <StationBuilding design={sn.design} layout={sn.layout} usedZ={[]} />
                {tap(sn)}
              </group>
            )}
            {sn.groups.map((g) => (
              <group key={g.index} position={[g.ox, 0, g.oz]} rotation={[0, g.angle, 0]}>
                <StationBuilding design={g.design} layout={g.layout} noTracks lift={g.lift} groundY={groundUnder(net, g)} pillarFree={(lx, lz) => !net.trackBelow(g.ox + g.ax * lx - g.az * lz, g.oz + g.az * lx + g.ax * lz, g.lift)} shell={g.kind === 'main' ? lookOf(st) : null} showUbahn={g === main && g.design.ubahn} sign={signFor(net, g.lineIds)} entrance={g === main && g.kind !== 'tram' && g.lift === 0 ? (st.type === 'hauptbahnhof' || st.type === 'interchange' ? 'big' : st.type === 'standard' ? null : 'small') : null} />
                {g.index === main?.index && st.type === 'landmark' && (
                  <group position={[0, 0, g.layout.halfWidth + 1.8]}>
                    <mesh position={[0, LAND_Y + 0.7, 0]}>
                      <boxGeometry args={[0.45, 1.4, 0.45]} />
                      <meshStandardMaterial color="#ffbd3d" emissive="#ffbd3d" emissiveIntensity={0.25} />
                    </mesh>
                    <mesh position={[0, LAND_Y + 1.65, 0]}>
                      <coneGeometry args={[0.42, 0.55, 4]} />
                      <meshStandardMaterial color="#c26a12" />
                    </mesh>
                  </group>
                )}
                {tap(g)}
              </group>
            ))}
            <Label3D text={st.type === 'landmark' && st.landmarkLabel ? st.landmarkLabel : st.name} position={[sn.x, tall + 0.9, sn.z]} />
          </group>
        )
      })}
    </>
  )
}

/** Initial camera: frame the network (or a patch of the map if empty), taking the screen aspect into account. */
function useInitialCamera(doc: CityDoc) {
  return useMemo(() => {
    const half = doc.size / 2
    const sts = Object.values(doc.stations)
    let cx = 0
    let cz = 0
    let extent = Math.min(doc.size, 60)
    if (sts.length) {
      const xs = sts.map((s) => s.x + 0.5 - half)
      const zs = sts.map((s) => s.y + 0.5 - half)
      cx = (Math.min(...xs) + Math.max(...xs)) / 2
      cz = (Math.min(...zs) + Math.max(...zs)) / 2
      extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 24) + 16
    }
    const aspect = Math.min(1.6, window.innerWidth / Math.max(1, window.innerHeight))
    const dist = (extent / Math.min(1, aspect)) * 1.2
    return {
      target: [cx, 0, cz] as [number, number, number],
      position: [cx + dist * 0.3, dist * 0.72, cz + dist * 0.72] as [number, number, number],
    }
    // Computed once per mounted scene; the user owns the camera afterwards.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Dev only: lets scripted browser tests place the camera. */
function DevCam() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const scene = useThree((s) => s.scene)
  if (import.meta.env.DEV) (window as unknown as { __cam: unknown }).__cam = { camera, controls, scene }
  return null
}

const SPEEDS = [1, 2, 4]

export default function Scene3D() {
  const doc = useEditor((s) => s.doc)
  const editId = useEditor((s) => s.editStationId)
  const cam = useInitialCamera(doc)
  const net = useMemo(() => buildNetwork3D(doc), [doc])
  if (import.meta.env.DEV) (window as unknown as { __net: unknown }).__net = net
  const [auto, setAuto] = useState(false)
  const [see, setSee] = useState(false)
  const [running, setRunning] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(0)
  const speedRef = useRef(1)
  const stopAuto = useCallback(() => setAuto(false), [])
  speedRef.current = running ? SPEEDS[speedIdx] : 0

  return (
    <div className={`absolute inset-0 ${editId ? 'invisible' : ''}`} style={{ background: 'radial-gradient(ellipse at 50% 38%, #1a2a3a 0%, #0a1017 55%, #06080c 100%)' }}>
      <Canvas frameloop={editId ? 'never' : 'always'} camera={{ position: cam.position, fov: 42, near: 0.5, far: 3000 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <hemisphereLight args={['#cfe2ff', '#1d3a30', 1.7]} />
        <directionalLight position={[doc.size * 0.6, doc.size * 0.9, doc.size * 0.35]} intensity={2.3} color="#fff0d9" />
        <directionalLight position={[-doc.size * 0.5, doc.size * 0.4, -doc.size * 0.6]} intensity={0.35} color="#7aa8ff" />
        <Terrain doc={doc} net={net} see={see} />
        {!see && <Buildings3D doc={doc} net={net} />}
        <LegPicker net={net} see={see} />
        <Tracks3D net={net} />
        <Stations net={net} />
        <Trains3D net={net} speedRef={speedRef} />
        <DevCam />
        <TouchRig onGesture={stopAuto} />
        <OrbitControls
          makeDefault
          touches={TOUCHES}
          screenSpacePanning={false}
          enableDamping
          dampingFactor={0.08}
          autoRotate={auto}
          autoRotateSpeed={0.5}
          onStart={() => setAuto(false)}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={doc.size * 3}
          target={cam.target}
        />
      </Canvas>

      <LegPanel net={net} />
      <div className="pointer-events-none absolute bottom-[98px] right-3 z-10 flex flex-col gap-2">
        <button onClick={() => setAuto((a) => !a)} aria-label="Automatisch drehen" className={`glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full active:scale-90 ${auto ? 'text-accent' : ''}`}>
          <Icon name="undo2" size={19} />
        </button>
        <button onClick={() => setSee((v) => !v)} aria-label="Untergrund anzeigen" className={`glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full active:scale-90 ${see ? 'text-accent' : ''}`}>
          <Icon name="layers" size={19} />
        </button>
        <button onClick={() => setRunning((r) => !r)} aria-label={running ? 'Verkehr anhalten' : 'Verkehr starten'} className={`glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full active:scale-90 ${running ? 'text-accent' : ''}`}>
          <Icon name={running ? 'pause' : 'play'} size={19} />
        </button>
        <button onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)} aria-label="Geschwindigkeit" className="glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-sm font-bold active:scale-90">
          ×{SPEEDS[speedIdx]}
        </button>
      </div>

    </div>
  )
}
