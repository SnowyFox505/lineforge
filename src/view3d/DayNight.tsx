import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { gameTime, sunAt } from '../sim/clock'
import { glowEmissives, night, nightAmount, trainSpill } from './night'
import type { SunState } from '../sim/clock'

/**
 * Day and night: the sky behind the scene, the light, the sun and the moon and the stars all follow the game time
 * (`gameTime.minutes`, see sim/clock.ts). Everything is written straight to the objects each frame, no React state.
 */

const c = (hex: string) => new THREE.Color(hex)

/** sky gradient (centre, middle, edge) by time of day */
const SKY = {
  day: [c('#b9d8f6'), c('#7db1e6'), c('#4d82c2')],
  dusk: [c('#ffa664'), c('#b0607e'), c('#3b3f78')],
  night: [c('#16233b'), c('#0a1220'), c('#04060b')],
}

const tmp = [new THREE.Color(), new THREE.Color(), new THREE.Color()]

/** Sky colours: night, mixed with day by the daylight and with a warm tint near the horizon. */
function skyColors(sun: SunState): THREE.Color[] {
  for (let i = 0; i < 3; i++) {
    tmp[i].copy(SKY.night[i]).lerp(SKY.day[i], sun.daylight).lerp(SKY.dusk[i], sun.glow * 0.85)
  }
  return tmp
}

const css = (col: THREE.Color) => `#${col.getHexString()}`

interface Props {
  /** the element behind the (transparent) canvas whose background is the sky */
  sky: RefObject<HTMLDivElement | null>
  size: number
}

const STARS = 420

export default function DayNight({ sky, size }: Props) {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const main = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const sunMesh = useRef<THREE.Mesh>(null)
  const moonMesh = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  const lastSky = useRef(-1e9)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const glowState = useRef({ amount: -1, frames: 0 })
  const radius = Math.max(600, size * 4) * 0.8
  // dev hook: the clock this component reads (modules can be loaded twice after hot reloads)
  if (import.meta.env.DEV) (window as unknown as { __gt: unknown }).__gt = gameTime

  // stars on the upper half of a sphere
  const starGeo = useMemo(() => {
    const pos = new Float32Array(STARS * 3)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < STARS; i++) {
      const u = rnd() * Math.PI * 2
      const v = Math.acos(0.05 + rnd() * 0.95) // keep them above the horizon
      pos.set([Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  const col = useMemo(() => ({ a: new THREE.Color(), b: new THREE.Color() }), [])

  useFrame(() => {
    const sun = sunAt(gameTime.minutes)
    const { daylight, glow, dir, elevation } = sun
    const reach = size * 1.1

    // the light comes from the sun by day and from the moon at night (the other side of the sky)
    const up = elevation >= 0
    const lx = up ? dir.x : -dir.x
    const ly = Math.max(0.18, up ? dir.y : -dir.y)
    const lz = up ? dir.z : -dir.z
    if (main.current) {
      main.current.position.set(lx * reach, ly * reach, lz * reach)
      main.current.intensity = 0.5 + daylight * 1.8
      // white-warm at noon, orange at the horizon, pale blue moonlight
      col.a.set('#fff0d9').lerp(col.b.set('#ff9d5c'), glow * 0.9)
      main.current.color.copy(col.a).lerp(col.b.set('#a3b8ff'), 1 - daylight)
    }
    if (fill.current) fill.current.intensity = 0.2 + daylight * 0.15
    if (hemi.current) {
      hemi.current.intensity = 0.7 + daylight * 1.0
      hemi.current.color.set('#6584cc').lerp(col.a.set('#cfe2ff'), daylight).lerp(col.b.set('#ffc197'), glow * 0.35)
      hemi.current.groundColor.set('#1a2a3a').lerp(col.a.set('#1d3a30'), daylight)
    }

    // night lights: windows (shader uniform) and every emissive lamp / headlight / sign
    night.value = nightAmount(daylight)
    trainSpill.opacity = night.value * 0.5
    trainSpill.visible = night.value > 0.01
    const gs = glowState.current
    gs.frames++
    if (Math.abs(night.value - gs.amount) > 0.015 || (night.value > 0.01 && gs.frames > 90)) {
      glowEmissives(scene, night.value)
      gs.amount = night.value
      gs.frames = 0
    }

    // sun, moon and stars sit on a big sphere round the camera
    const cp = camera.position
    const place = (m: THREE.Mesh | null, sx: number, sy: number, sz: number, visible: boolean) => {
      if (!m) return
      m.visible = visible
      m.position.set(cp.x + sx * radius, cp.y + sy * radius, cp.z + sz * radius)
      m.lookAt(cp)
    }
    place(sunMesh.current, dir.x, dir.y, dir.z, dir.y > -0.05)
    place(moonMesh.current, -dir.x, -dir.y, -dir.z, -dir.y > -0.05)
    if (sunMesh.current) {
      const m = sunMesh.current.material as THREE.MeshBasicMaterial
      m.color.set('#fff6d8').lerp(col.a.set('#ff8a3d'), glow)
    }
    if (stars.current) {
      stars.current.position.copy(cp)
      stars.current.rotation.y = (gameTime.minutes / 1440) * Math.PI * 2 * 0.25
      const m = stars.current.material as THREE.PointsMaterial
      const o = Math.max(0, 1 - daylight * 1.6)
      m.opacity = o
      stars.current.visible = o > 0.01
    }

    // the sky behind the canvas, rewritten only when the time has moved on a bit
    const el = sky.current
    if (el && Math.abs(gameTime.minutes - lastSky.current) > 0.4) {
      lastSky.current = gameTime.minutes
      const [a, b, d] = skyColors(sun)
      el.style.background = `radial-gradient(ellipse at 50% 38%, ${css(a)} 0%, ${css(b)} 55%, ${css(d)} 100%)`
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe2ff', '#1d3a30', 1.7]} />
      <directionalLight ref={main} position={[size * 0.6, size * 0.9, size * 0.35]} intensity={2.3} color="#fff0d9" />
      <directionalLight ref={fill} position={[-size * 0.5, size * 0.4, -size * 0.6]} intensity={0.35} color="#7aa8ff" />
      <mesh ref={sunMesh} renderOrder={-10}>
        <circleGeometry args={[radius * 0.045, 32]} />
        <meshBasicMaterial color="#fff6d8" fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={moonMesh} renderOrder={-10}>
        <circleGeometry args={[radius * 0.032, 32]} />
        <meshBasicMaterial color="#e9eefc" fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <points ref={stars} geometry={starGeo} renderOrder={-11} frustumCulled={false} scale={radius}>
        <pointsMaterial color="#ffffff" size={2} sizeAttenuation={false} transparent opacity={0} depthWrite={false} fog={false} toneMapped={false} />
      </points>
    </>
  )
}
