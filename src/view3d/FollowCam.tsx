import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useEditor } from '../store/editorStore'
import { useTheme } from '../ui/theme'
import { cameraFor, followState } from './follow'
import type { CameraRig } from './follow'
import { xray } from './xray'

type Controls = { enabled: boolean; target: THREE.Vector3; minDistance: number; maxPolarAngle: number; update: () => void }

/**
 * Camera that flies to the followed train and stays with it (chase, side or cockpit view).
 * Underground the x-ray bubble opens around the train: the ground above it dissolves, so you still see it.
 */
export default function FollowCam() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const accent = useTheme((s) => s.accent)
  const rig = useRef<CameraRig>({ position: new THREE.Vector3(), look: new THREE.Vector3() })
  const cur = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const saved = useRef<{ minDistance: number; maxPolarAngle: number } | null>(null)

  useEffect(() => {
    xray.rim.value.set(accent)
  }, [accent])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const st = useEditor.getState()
    const active = !!st.followId

    // the x-ray bubble grows when the train goes below ground and closes when it comes up
    const goal = active && followState.underground ? 1 : 0
    xray.strength.value += (goal - xray.strength.value) * (1 - Math.exp(-dt * 3.2))
    if (xray.strength.value < 0.002 && goal === 0) xray.strength.value = 0
    xray.focus.value.copy(followState.pos)
    xray.radius.value = st.followMode === 'cockpit' ? 8 : 10.5

    if (!controls) return
    if (active) {
      if (!saved.current) {
        saved.current = { minDistance: controls.minDistance, maxPolarAngle: controls.maxPolarAngle }
        controls.enabled = false
        controls.minDistance = 0.05
        controls.maxPolarAngle = Math.PI
        cur.current.pos.copy(camera.position)
        cur.current.look.copy(controls.target)
      }
      cameraFor(st.followMode, followState.pos, followState.dir, followState.underground, rig.current)
      // glide there; the cockpit view sticks to the train more tightly
      const k = 1 - Math.exp(-dt * (st.followMode === 'cockpit' ? 9 : 3.6))
      cur.current.pos.lerp(rig.current.position, k)
      cur.current.look.lerp(rig.current.look, k)
      camera.position.copy(cur.current.pos)
      controls.target.copy(cur.current.look)
      camera.lookAt(cur.current.look)
    } else if (saved.current) {
      // back to the free camera: hover over the spot where the train is, looking down at it (never from below the ground)
      const off = camera.position.clone().sub(followState.pos)
      const az = Math.atan2(off.x, off.z)
      const r = 16
      const phi = 0.95
      controls.target.set(followState.pos.x, 0.6, followState.pos.z)
      camera.position.set(controls.target.x + Math.sin(az) * Math.sin(phi) * r, controls.target.y + Math.cos(phi) * r, controls.target.z + Math.cos(az) * Math.sin(phi) * r)
      controls.enabled = true
      controls.minDistance = saved.current.minDistance
      controls.maxPolarAngle = saved.current.maxPolarAngle
      saved.current = null
    }
  })

  return null
}
