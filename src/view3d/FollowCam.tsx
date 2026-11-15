import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useEditor } from '../store/editorStore'
import { useTheme } from '../ui/theme'
import { cameraFor, followState } from './follow'
import type { CameraRig } from './follow'
import { xray } from './xray'

type Controls = {
  enabled: boolean
  enablePan: boolean
  target: THREE.Vector3
  minDistance: number
  maxDistance: number
  maxPolarAngle: number
  touches: { ONE: THREE.TOUCH; TWO: THREE.TOUCH }
  update: () => void
}

/** A finger or the mouse has to move this far (pixels) before it counts as "I want to look around" */
const LOOK_AROUND_PX = 10
/** Furthest the free camera can go from the train */
const FREE_MAX_DISTANCE = 45

/**
 * Camera that flies to the followed train and stays with it (chase, side or cockpit view, or free: you turn the view yourself).
 * Dragging in one of the fixed views switches to the free view, starting from where the camera is.
 * Underground the x-ray bubble opens around the train: the ground above it dissolves, so you still see it.
 */
export default function FollowCam() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const accent = useTheme((s) => s.accent)
  const rig = useRef<CameraRig>({ position: new THREE.Vector3(), look: new THREE.Vector3() })
  const cur = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const goal = useRef(new THREE.Vector3())
  const before = useRef(new THREE.Vector3())
  const saved = useRef<{ minDistance: number; maxDistance: number; maxPolarAngle: number; enablePan: boolean; touches: Controls['touches'] } | null>(null)

  useEffect(() => {
    xray.rim.value.set(accent)
  }, [accent])

  // dragging while one of the fixed views is on: from here on you look around yourself
  useEffect(() => {
    const el = gl.domElement
    let start: { x: number; y: number; id: number } | null = null
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const st = useEditor.getState()
      if (!st.followId || st.followMode === 'free') return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > LOOK_AROUND_PX) {
        st.setFollowMode('free')
        start = null
      }
    }
    const up = () => {
      start = null
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const st = useEditor.getState()
    const active = !!st.followId

    // the x-ray bubble grows when the train goes below ground or into a station (roofs, halls) and closes when it is out again
    const bubble = active && (followState.underground || followState.inStation) ? 1 : 0
    xray.strength.value += (bubble - xray.strength.value) * (1 - Math.exp(-dt * 3.2))
    if (xray.strength.value < 0.002 && bubble === 0) xray.strength.value = 0
    xray.focus.value.copy(followState.pos)
    xray.lift.value += ((followState.underground ? 0 : 0.55) - xray.lift.value) * (1 - Math.exp(-dt * 6))
    xray.radius.value = st.followMode === 'cockpit' ? 8 : 10.5

    if (!controls) return
    // inside a train the camera is close to things: a nearer clipping plane; otherwise keep it far for depth precision
    const near = active ? 0.08 : 1
    const cam = camera as THREE.PerspectiveCamera
    if (cam.near !== near) {
      cam.near = near
      cam.updateProjectionMatrix()
    }
    if (active) {
      if (!saved.current) {
        saved.current = { minDistance: controls.minDistance, maxDistance: controls.maxDistance, maxPolarAngle: controls.maxPolarAngle, enablePan: controls.enablePan, touches: controls.touches }
        // the controls stay on: a drag turns the view (and switches to the free view); the fixed views overwrite the camera every frame
        controls.enabled = true
        controls.enablePan = false
        controls.minDistance = 0.05
        controls.maxPolarAngle = Math.PI
        // one finger turns the view instead of moving the map
        controls.touches = { ...controls.touches, ONE: THREE.TOUCH.ROTATE }
        cur.current.pos.copy(camera.position)
        cur.current.look.copy(controls.target)
      }
      if (st.followMode === 'free') {
        // stay with the train, look wherever you like: the target follows the train and takes the camera along
        controls.maxDistance = FREE_MAX_DISTANCE
        controls.minDistance = 0.3
        // above ground the camera stays above the rails; underground it may go anywhere (the ground dissolves)
        controls.maxPolarAngle = followState.underground ? Math.PI : Math.PI / 2 - 0.03
        goal.current.copy(followState.pos)
        goal.current.y += 0.35
        before.current.copy(controls.target)
        controls.target.lerp(goal.current, 1 - Math.exp(-dt * 8))
        camera.position.add(before.current.negate().add(controls.target))
        controls.update()
        // a later switch to a fixed view glides from here
        cur.current.pos.copy(camera.position)
        cur.current.look.copy(controls.target)
      } else {
        controls.maxDistance = saved.current.maxDistance
        cameraFor(st.followMode, followState.pos, followState.dir, followState.underground, rig.current)
        // glide there; the cockpit view sticks to the train more tightly
        const k = 1 - Math.exp(-dt * (st.followMode === 'cockpit' ? 9 : 3.6))
        cur.current.pos.lerp(rig.current.position, k)
        cur.current.look.lerp(rig.current.look, k)
        camera.position.copy(cur.current.pos)
        controls.target.copy(cur.current.look)
        camera.lookAt(cur.current.look)
      }
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
      controls.maxDistance = saved.current.maxDistance
      controls.maxPolarAngle = saved.current.maxPolarAngle
      controls.enablePan = saved.current.enablePan
      controls.touches = saved.current.touches
      saved.current = null
    }
  })

  return null
}
