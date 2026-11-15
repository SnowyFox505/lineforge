import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { UG_COVER } from '../model/profiles'
import { night, poolTexture } from './night'
import type { Network3D } from './network3d'

/**
 * At night every station above ground throws a warm pool of light on the ground around its platforms, so that
 * stations stay easy to find in the dark. A flat additive disc per platform complex, no real lights (they would
 * make every material in the scene more expensive).
 */
export default function NightGlow({ net }: { net: Network3D }) {
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: poolTexture() ?? undefined, color: '#ff9d45', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    [],
  )
  const pools = useMemo(() => {
    const out: { x: number; y: number; z: number; r: number }[] = []
    for (const sn of Object.values(net.stations)) {
      for (const g of sn.groups) {
        if (g.lift <= UG_COVER) continue
        const r = Math.max(g.layout.length, g.layout.halfWidth * 2) * 0.75 + 1.4
        out.push({ x: g.ox, y: net.groundAt(g.ox, g.oz) + 0.04, z: g.oz, r })
      }
    }
    return out
  }, [net])

  useFrame(() => {
    material.opacity = night.value * 0.7
    material.visible = night.value > 0.01
  })

  return (
    <group>
      {pools.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <circleGeometry args={[p.r, 40]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  )
}
