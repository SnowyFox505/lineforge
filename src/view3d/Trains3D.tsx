import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { useEditor } from '../store/editorStore'
import { followState } from './follow'
import { RAIL } from '../model/scale'
import { LAND_Y, RAIL_Y } from './heights'
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
  if (import.meta.env.DEV) (window as unknown as { __sim: unknown }).__sim = sim
  const groups = useRef<(THREE.Group | null)[][]>([])
  const select = useEditor((s) => s.setFollow)
  // a train's "at" / "to" is a platform track key: `${stationId}|${track}`
  const stationName = (key: string | null) => (key ? net.stations[key.split('|')[0]]?.st.name ?? '' : '')

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
      // the train the camera follows: publish where its head is
      if (useEditor.getState().followId === tr.id) {
        const h = poses[0]
        followState.pos.set(h.x, h.y + RAIL_Y, h.z)
        followState.dir.set(h.tx * Math.cos(h.pitch), Math.sin(h.pitch), h.tz * Math.cos(h.pitch)).normalize()
        followState.underground = h.y < -0.9
        // within a platform's length (plus a run-up) of a stop of its line
        followState.inStation = tr.net.stops.some((st) => Math.abs(tr.s - st.d) < st.half + 6)
        followState.line = tr.net.line.name
        followState.color = tr.net.line.color
        followState.status = tr.phase === 'dwell' ? `Halt in ${stationName(tr.at)}` : `Weiter nach ${stationName(tr.to)}`
      }
    })
    if (followState.trainIds.length !== sim.trains.length) followState.trainIds = sim.trains.map((t) => t.id)
  })

  return (
    <group>
      {sim.trains.map((tr, ti) => (
        <group
          key={tr.id}
          onClick={(e) => {
            if (e.delta > 6) return
            e.stopPropagation()
            select(tr.id)
          }}
        >
          {tr.spec.lens.map((_, ci) => (
            <group
              key={ci}
              ref={(g) => {
                ;(groups.current[ti] ??= [])[ci] = g
              }}
            >
              <group position={[0, LAND_Y * (1 - RAIL), 0]} scale={RAIL}>
                <CarMesh spec={tr.spec} index={ci} color={tr.color} />
              </group>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
