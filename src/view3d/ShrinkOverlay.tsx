import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { keptSquare } from '../model/shrink'
import { useEditor } from '../store/editorStore'

const RED = '#ff3b3b'

/**
 * While the map is being cut down: the part that would be deleted lies under a red cover that breathes, the square that stays
 * has a red frame with a low wall, and the camera looks at the whole map.
 */
export default function ShrinkOverlay() {
  const size = useEditor((s) => s.doc.size)
  const to = useEditor((s) => s.shrinkTo)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const cover = useRef<THREE.MeshBasicMaterial>(null)
  const wallMat = useMemo(() => new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }), [])

  // the whole map in view when the shrinking starts
  useEffect(() => {
    if (!to || !controls) return
    camera.position.set(0, size * 0.95, size * 0.7)
    controls.target.set(0, 0, 0)
    controls.update()
  }, [to, size, camera, controls])

  const geo = useMemo(() => {
    if (!to) return null
    const half = size / 2
    const k = keptSquare(size, to)
    const x0 = k.x0 - half
    const x1 = k.x1 - half
    const z0 = k.y0 - half
    const z1 = k.y1 - half
    const pad = 4
    const shape = new THREE.Shape()
    shape.moveTo(-half - pad, -half - pad)
    shape.lineTo(half + pad, -half - pad)
    shape.lineTo(half + pad, half + pad)
    shape.lineTo(-half - pad, half + pad)
    shape.closePath()
    const hole = new THREE.Path()
    hole.moveTo(x0, z0)
    hole.lineTo(x0, z1)
    hole.lineTo(x1, z1)
    hole.lineTo(x1, z0)
    hole.closePath()
    shape.holes.push(hole)
    const cov = new THREE.ShapeGeometry(shape)
    cov.rotateX(Math.PI / 2) // lies flat: shape y becomes world z
    const frame = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, 0.4, z0),
      new THREE.Vector3(x1, 0.4, z0),
      new THREE.Vector3(x1, 0.4, z1),
      new THREE.Vector3(x0, 0.4, z1),
      new THREE.Vector3(x0, 0.4, z0),
    ])
    return { cov, frame, x0, x1, z0, z1 }
  }, [size, to])

  useFrame(({ clock }) => {
    const b = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4)
    if (cover.current) cover.current.opacity = 0.2 + 0.25 * b
    wallMat.opacity = 0.12 + 0.2 * b
  })

  if (!to || !geo) return null
  const side = geo.x1 - geo.x0
  const walls: { p: [number, number, number]; r: number }[] = [
    { p: [(geo.x0 + geo.x1) / 2, 3, geo.z0], r: 0 },
    { p: [(geo.x0 + geo.x1) / 2, 3, geo.z1], r: Math.PI },
    { p: [geo.x0, 3, (geo.z0 + geo.z1) / 2], r: -Math.PI / 2 },
    { p: [geo.x1, 3, (geo.z0 + geo.z1) / 2], r: Math.PI / 2 },
  ]
  return (
    <group>
      {/* the cover over everything that goes: visible through hills and buildings */}
      <mesh geometry={geo.cov} position={[0, 0.6, 0]} renderOrder={999}>
        <meshBasicMaterial ref={cover} color={RED} transparent opacity={0.3} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={w.p} rotation={[0, w.r, 0]} renderOrder={998} material={wallMat}>
          <planeGeometry args={[side, 6]} />
        </mesh>
      ))}
      <line>
        <primitive object={geo.frame} attach="geometry" />
        <lineBasicMaterial color="#ffffff" depthTest={false} />
      </line>
    </group>
  )
}
