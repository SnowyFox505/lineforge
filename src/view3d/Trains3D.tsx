import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { Network3D } from './network3d'
import { carPoses, Sim } from './trainSim'
import { CarMesh } from './vehicles3d'

const qYaw = new THREE.Quaternion()
const qPitch = new THREE.Quaternion()
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/** All trains of the network, driving back and forth on their lines (see trainSim for the rules). */
export default function Trains3D({ net, speedRef }: { net: Network3D; speedRef: MutableRefObject<number> }) {
  const sim = useMemo(() => new Sim(net), [net])
  const groups = useRef<(THREE.Group | null)[][]>([])

  useFrame((_, dt) => {
    sim.update(Math.min(dt, 0.1) * speedRef.current)
    sim.trains.forEach((tr, ti) => {
      const cars = groups.current[ti]
      if (!cars) return
      const poses = carPoses(tr)
      poses.forEach((p, ci) => {
        const g = cars[ci]
        if (!g) return
        g.position.set(p.x, p.y, p.z)
        qYaw.setFromAxisAngle(AXIS_Y, Math.atan2(-p.tz, p.tx))
        qPitch.setFromAxisAngle(AXIS_Z, p.pitch)
        g.quaternion.copy(qYaw).multiply(qPitch)
      })
    })
  })

  return (
    <group>
      {sim.trains.map((tr, ti) => (
        <group key={tr.id}>
          {tr.spec.lens.map((_, ci) => (
            <group
              key={ci}
              ref={(g) => {
                ;(groups.current[ti] ??= [])[ci] = g
              }}
            >
              <CarMesh spec={tr.spec} index={ci} color={tr.color} />
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
