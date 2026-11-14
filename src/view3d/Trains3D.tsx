import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditor } from '../store/editorStore'
import { followState } from './follow'
import { railOf } from '../model/scale'
import { LAND_Y, RAIL_Y, TRAM_ROAD_TOP } from './heights'
import { TRAM_DIP } from './network3d'
import type { Network3D } from './network3d'
import { bindNet } from '../sim/world'
import { carPoses } from './trainSim'
import { CarMesh } from './vehicles3d'

const qYaw = new THREE.Quaternion()
const qPitch = new THREE.Quaternion()
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/**
 * Height of a car's frame of reference: the car is built at design size and scaled down about the ground. A tram's track
 * lies in the street, which is flush with the ground (its samples are lowered by TRAM_DIP): the wheels have to stand on
 * the rails in the road, not sink into it.
 */
function carLift(kind: string): number {
  const s = railOf(kind)
  return LAND_Y * (1 - s) + (kind === 'tram' ? TRAM_DIP + (TRAM_ROAD_TOP + 0.008 - LAND_Y) - s * (RAIL_Y - LAND_Y) : 0)
}

/** All trains of the network, driving back and forth on their lines (see trainSim for the rules; the clock is the world's, see sim/world). */
export default function Trains3D({ net }: { net: Network3D }) {
  const cityId = useEditor((s) => s.doc.id)
  // the world simulation runs outside this view (sim/WorldSim); here the trains are only put on the rails
  const sim = useMemo(() => bindNet(net, cityId), [net, cityId])
  const groups = useRef<(THREE.Group | null)[][]>([])
  const select = useEditor((s) => s.setFollow)
  // a train's "at" / "to" is a platform track key: `${stationId}|${track}`
  const stationName = (key: string | null) => (key ? net.stations[key.split('|')[0]]?.st.name ?? '' : '')

  useFrame(() => {
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
              <group position={[0, carLift(tr.spec.kind), 0]} scale={railOf(tr.spec.kind)}>
                <CarMesh spec={tr.spec} index={ci} color={tr.color} />
              </group>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
