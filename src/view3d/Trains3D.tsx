import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditor } from '../store/editorStore'
import { followState, trainPick } from './follow'
import { railOf } from '../model/scale'
import { LAND_Y, RAIL_Y, TRAM_ROAD_TOP } from './heights'
import { TRAM_DIP } from './network3d'
import type { Network3D } from './network3d'
import { bindNet } from '../sim/world'
import { carPoses } from './trainSim'
import { makeSignMaterial, setSign } from './destSign'
import { CarMesh } from './vehicles3d'

const qYaw = new THREE.Quaternion()
const qPitch = new THREE.Quaternion()
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/**
 * Invisible tap target round every car: the cars are small and fast, so the real meshes are hard to hit and the tap
 * ends up on the track below. The box is at least this big in world units, whatever the scale of the train.
 */
const HIT_WIDTH = 1.5
const HIT_HEIGHT = 1.1
const HIT_EXTRA_LENGTH = 0.8
const hitGeo = new THREE.BoxGeometry(1, 1, 1)
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
const noRaycast = () => {}
const meshRaycast = THREE.Mesh.prototype.raycast

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
  // one destination display per train (the head car of the models that have one shows it)
  const signs = useMemo(() => sim.trains.map(() => makeSignMaterial()), [sim])
  const groups = useRef<(THREE.Group | null)[][]>([])
  const hits = useRef<(THREE.Mesh | null)[][]>([])
  const select = useEditor((s) => s.setFollow)
  // a train's "at" / "to" is a platform track key: `${stationId}|${track}`
  const stationName = (key: string | null) => (key ? net.stations[key.split('|')[0]]?.st.name ?? '' : '')

  useFrame(() => {
    sim.trains.forEach((tr, ti) => {
      const cars = groups.current[ti]
      if (!cars) return
      // the display: the line, and where the train is going to (the terminal of the direction it runs in; a ring just says Ring)
      const stops = tr.net.stops
      const goes = tr.legs[tr.leg % tr.legs.length].dir > 0 ? stops[stops.length - 1] : stops[0]
      const dest = tr.net.line.loop ? 'Ring' : net.stations[goes.stationId]?.st.name ?? ''
      if (signs[ti]) setSign(signs[ti], tr.net.line.name, tr.net.line.color, dest)
      const poses = carPoses(tr)
      poses.forEach((p, ci) => {
        const g = cars[ci]
        if (!g) return
        g.position.set(p.x, p.y, p.z)
        qYaw.setFromAxisAngle(AXIS_Y, Math.atan2(-p.tz, p.tx))
        qPitch.setFromAxisAngle(AXIS_Z, p.pitch)
        g.quaternion.copy(qYaw).multiply(qPitch)
        // a car below the ground cannot be tapped through the ground
        const hit = hits.current[ti]?.[ci]
        if (hit) hit.raycast = p.y < -0.9 ? noRaycast : meshRaycast
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
          onPointerDown={(e) => {
            // remember the train under the finger: it may be gone from under it when the finger lifts (see takeTrainPick)
            e.stopPropagation()
            trainPick.id = tr.id
            trainPick.at = performance.now()
          }}
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
                <CarMesh spec={tr.spec} index={ci} color={tr.color} sign={signs[ti]} />
              </group>
              <mesh
                ref={(m) => {
                  ;(hits.current[ti] ??= [])[ci] = m
                }}
                geometry={hitGeo}
                material={hitMat}
                position={[0, RAIL_Y + HIT_HEIGHT * 0.3, 0]}
                scale={[tr.spec.lens[ci] * railOf(tr.spec.kind) + HIT_EXTRA_LENGTH, HIT_HEIGHT, HIT_WIDTH]}
                renderOrder={-1}
              />
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
