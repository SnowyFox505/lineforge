import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

/** Touch mapping of the orbit controls: one finger moves the map, two fingers are handled by `TouchRig` below. */
export const TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: -1 as unknown as THREE.TOUCH }

/** How far a swipe of the three fingers tilts the view (radians per pixel) */
const TILT_PER_PX = 0.005
const MIN_POLAR = 0.1

/**
 * Touch gestures of the 3D map (the mouse keeps the normal orbit controls):
 *  - one finger: move the map (handled by the orbit controls)
 *  - two fingers: pinch to zoom, twist to turn the map
 *  - three fingers: swipe up = camera higher and steeper, swipe down = lower and flatter
 */
export default function TouchRig({ onGesture }: { onGesture?: () => void }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; minDistance: number; maxDistance: number; maxPolarAngle: number; update: () => void } | null

  useEffect(() => {
    if (!controls) return
    const el = gl.domElement
    const pts = new Map<number, { x: number; y: number }>()
    let lastDist = 0
    let lastAngle = 0
    let lastY = 0
    const off = new THREE.Vector3()
    const sph = new THREE.Spherical()

    const pair = () => {
      const [a, b] = [...pts.values()]
      return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }
    }
    const centreY = () => [...pts.values()].reduce((s, p) => s + p.y, 0) / pts.size
    const rebase = () => {
      if (pts.size === 2) {
        const p = pair()
        lastDist = p.dist
        lastAngle = p.angle
      }
      if (pts.size >= 3) lastY = centreY()
    }

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      rebase()
      if (pts.size >= 2) onGesture?.()
    }
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      rebase()
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      off.copy(camera.position).sub(controls.target)

      if (pts.size === 2) {
        const p = pair()
        if (lastDist > 0 && p.dist > 0) {
          // fingers apart = closer to the map
          const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * (lastDist / p.dist)))
          off.setLength(len)
        }
        let twist = p.angle - lastAngle
        if (twist > Math.PI) twist -= Math.PI * 2
        if (twist < -Math.PI) twist += Math.PI * 2
        // the map turns with the fingers: the camera goes around the other way
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), twist)
        lastDist = p.dist
        lastAngle = p.angle
      } else if (pts.size >= 3) {
        const y = centreY()
        sph.setFromVector3(off)
        sph.phi = Math.min(controls.maxPolarAngle, Math.max(MIN_POLAR, sph.phi + (y - lastY) * TILT_PER_PX))
        off.setFromSpherical(sph)
        lastY = y
      } else {
        return
      }
      camera.position.copy(controls.target).add(off)
      controls.update()
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
  }, [camera, gl, controls, onGesture])

  return null
}
