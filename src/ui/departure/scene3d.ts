import { clamp01 } from '../netCanvas'
import { TEX_H, TEX_W } from './board'

/**
 * A small perspective renderer on a 2D canvas, just enough for the station of the update screen:
 * a platform hall seen along the track, a tunnel mouth at the far end, and a train that comes out of it.
 * World units are metres: x to the right, y up, z away from the camera.
 */
type V3 = [number, number, number]
type RGB = [number, number, number]

export const TUNNEL_Z = 34 // the wall with the tunnel mouth
export const TRACK_X = 4.2
export const CAR_LEN = 17
export const CAR_GAP = 0.3
export const CAR_W = 2.6
export const CARS = 3
export const TRAIN_LEN = CARS * CAR_LEN + (CARS - 1) * CAR_GAP

const PLATFORM_Y = 0.95
const EDGE_X = TRACK_X - 1.75
const HALL_TOP = 7.5
const FOG: RGB = [6, 9, 14]
const NEAR = 0.35

interface Cam {
  x: number
  y: number
  z: number
  cos: number
  sin: number
  f: number
  cx: number
  cy: number
  /** the camera looks up by this much (cosine and sine) */
  cp: number
  sp: number
}

function toCam(c: Cam, p: V3): V3 {
  const rx = p[0] - c.x
  const ry = p[1] - c.y
  const rz = p[2] - c.z
  const x = rx * c.cos - rz * c.sin
  const z = rx * c.sin + rz * c.cos
  return [x, ry * c.cp - z * c.sp, z * c.cp + ry * c.sp]
}

function scr(c: Cam, v: V3): [number, number] {
  return [c.cx + (c.f * v[0]) / v[2], c.cy - (c.f * v[1]) / v[2]]
}

/** Sutherland-Hodgman against the near plane, in camera space */
function clipNear(pts: V3[]): V3[] {
  const out: V3[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ain = a[2] >= NEAR
    const bin = b[2] >= NEAR
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (NEAR - a[2]) / (b[2] - a[2])
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR])
    }
  }
  return out
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

export interface StationState {
  /** seconds since the screen opened */
  t: number
  /** z of the front of the train; null while there is none */
  trainZ: number | null
  /** 0..1 the train fades in (it starts far inside the tunnel) */
  trainFade: number
  /** the picture of the information display (see board.ts), null while there is none */
  board: HTMLCanvasElement | null
  /** 0..1 the doors of the train are open */
  doors: number
  /** speed of the train in m/s (for the blur) */
  speed: number
  /** 0..1 light coming out of the tunnel before the train */
  portalGlow: number
  /** 0 = waiting (amber), 1 = clear (green) */
  go: number
  /** accent colour of the player (the stripe of the train) */
  accent: RGB
  /** 0..1 shaking when the train rushes by */
  shake: number
  /** font of the platform sign */
  family: string
}

interface Face {
  pts: V3[]
  fill: RGB
  /** brightness 0..1 of the face, already including the direction of the light */
  k: number
  /** extra emissive light (windows, lamps): drawn without fog and without the darkness of the tunnel */
  glow?: number
  alpha?: number
  /** a part of the train: what is behind the tunnel wall is only seen through the opening */
  thru?: boolean
}

let glowSprite: HTMLCanvasElement | null = null
function sprite(): HTMLCanvasElement {
  if (glowSprite) return glowSprite
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.2, 'rgba(255,255,255,0.55)')
  gr.addColorStop(0.5, 'rgba(255,255,255,0.14)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 96, 96)
  glowSprite = c
  return c
}

const tintCache = new Map<string, HTMLCanvasElement>()
function tinted(c: RGB): HTMLCanvasElement {
  const key = `${Math.round(c[0] / 4)},${Math.round(c[1] / 4)},${Math.round(c[2] / 4)}`
  const hit = tintCache.get(key)
  if (hit) return hit
  if (tintCache.size > 120) tintCache.clear()
  const out = document.createElement('canvas')
  out.width = out.height = 96
  const g = out.getContext('2d')!
  g.drawImage(sprite(), 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = css(c)
  g.fillRect(0, 0, 96, 96)
  tintCache.set(key, out)
  return out
}

/** Draws the station into the rectangle (x, y, w, h) of the context. */
export function drawStation(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, s: StationState) {
  const shakeX = Math.sin(s.t * 71) * 2.2 * s.shake
  const shakeY = Math.cos(s.t * 53) * 1.6 * s.shake
  const yaw = 0.3
  // a phone held upright sees much more of the ceiling than a wide window: the wide view looks up a little
  const wide = rw >= rh * 1.25
  const pitch = wide ? 0.2 : 0
  const baseCy = ry + rh * (wide ? 0.42 : 0.54)
  const cam: Cam = {
    x: 0,
    y: 2.3,
    z: 0,
    cos: Math.cos(yaw),
    sin: Math.sin(yaw),
    f: wide ? Math.min(rw * 0.62, rh * 1.05) : Math.min(rw, rh * 1.55),
    cx: rx + rw * 0.5 + shakeX,
    cy: baseCy + shakeY,
    cp: Math.cos(pitch),
    sp: Math.sin(pitch),
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  const depthOf = (p: V3) => toCam(cam, p)[2]
  const fogAt = (z: number) => clamp01((z - 6) / 62) * 0.8

  const path = (pts: V3[]): boolean => {
    const cs = clipNear(pts.map((p) => toCam(cam, p)))
    if (cs.length < 3) return false
    ctx.beginPath()
    cs.forEach((v, i) => {
      const [x, y] = scr(cam, v)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.closePath()
    return true
  }

  /** the part of a polygon on one side of the tunnel wall (plane z = TUNNEL_Z), in world coordinates */
  const wallSide = (pts: V3[], far: boolean): V3[] => {
    const out: V3[] = []
    const inside = (p: V3) => (far ? p[2] >= TUNNEL_Z : p[2] <= TUNNEL_Z)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      if (inside(a)) out.push(a)
      if (inside(a) !== inside(b)) {
        const t = (TUNNEL_Z - a[2]) / (b[2] - a[2])
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, TUNNEL_Z])
      }
    }
    return out
  }

  const face = (f: Face) => {
    if (f.thru && f.pts.some((p) => p[2] > TUNNEL_Z)) {
      const nearPart = wallSide(f.pts, false)
      const farPart = wallSide(f.pts, true)
      if (nearPart.length >= 3) face({ ...f, pts: nearPart, thru: false })
      if (farPart.length >= 3) {
        ctx.save()
        if (path(arch(TUNNEL_Z))) ctx.clip()
        face({ ...f, pts: farPart, thru: false })
        ctx.restore()
      }
      return
    }
    if (!path(f.pts)) return
    const z = depthOf([f.pts[0][0], f.pts[0][1], f.pts[0][2]])
    const fog = f.glow ? 0 : fogAt(z)
    const c = mix([f.fill[0] * f.k, f.fill[1] * f.k, f.fill[2] * f.k], FOG, fog)
    ctx.fillStyle = css(c, f.alpha ?? 1)
    ctx.fill()
  }

  const add = (pts: V3[], color: RGB, alpha: number) => {
    if (alpha <= 0.003 || !path(pts)) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = css(color, alpha)
    ctx.fill()
    ctx.restore()
  }

  const light = (p: V3, size: number, color: RGB, alpha: number) => {
    const v = toCam(cam, p)
    if (v[2] < NEAR || alpha <= 0.003) return
    const [x, y] = scr(cam, v)
    const px = (cam.f * size) / v[2]
    ctx.save()
    // a light inside the tunnel is only seen through the opening
    if (p[2] > TUNNEL_Z + 0.5 && path(arch(TUNNEL_Z))) ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, alpha)
    ctx.drawImage(tinted(color), x - px / 2, y - px / 2, px, px)
    ctx.restore()
  }

  /** a thin line between two world points */
  const seg = (a: V3, b: V3) => {
    let ca = toCam(cam, a)
    let cb = toCam(cam, b)
    if (ca[2] < NEAR && cb[2] < NEAR) return
    if (ca[2] < NEAR) {
      const t = (NEAR - ca[2]) / (cb[2] - ca[2])
      ca = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, NEAR]
    } else if (cb[2] < NEAR) {
      const t = (NEAR - cb[2]) / (ca[2] - cb[2])
      cb = [cb[0] + (ca[0] - cb[0]) * t, cb[1] + (ca[1] - cb[1]) * t, NEAR]
    }
    const p = scr(cam, ca)
    const q = scr(cam, cb)
    ctx.beginPath()
    ctx.moveTo(p[0], p[1])
    ctx.lineTo(q[0], q[1])
    ctx.stroke()
  }

  const Zt = TUNNEL_Z
  const T = TRACK_X
  const amberGo = mix([255, 176, 46], [98, 242, 161], s.go)

  // ---- hall: far wall with the tunnel mouth -------------------------------------------------------------------------
  const wallL = T - 15
  const wallR = T + 7.5
  face({ pts: [[wallL, -3, Zt], [wallR, -3, Zt], [wallR, HALL_TOP, Zt], [wallL, HALL_TOP, Zt]], fill: [30, 38, 50], k: 0.9 })
  // vertical joints in the concrete
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  for (let x = wallL + 2; x < wallR; x += 3) seg([x, -3, Zt], [x, HALL_TOP, Zt])
  ctx.restore()

  // the arch
  const arch = (z: number, grow = 1): V3[] => {
    const pts: V3[] = [[T - 2.45 * grow, -0.6, z]]
    pts.push([T - 2.45 * grow, 2.9, z])
    for (let i = 1; i < 14; i++) {
      const a = Math.PI - (i / 14) * Math.PI
      pts.push([T + Math.cos(a) * 2.45 * grow, 2.9 + Math.sin(a) * 2.45 * grow, z])
    }
    pts.push([T + 2.45 * grow, 2.9, z], [T + 2.45 * grow, -0.6, z])
    return pts
  }
  face({ pts: arch(Zt), fill: [2, 3, 5], k: 1, glow: 1 })
  // lit rim of the portal
  if (path(arch(Zt, 1.12))) {
    ctx.strokeStyle = css(mix([60, 72, 92], amberGo, 0.25 + 0.3 * s.portalGlow), 0.55)
    ctx.lineWidth = Math.max(1, (cam.f * 0.28) / depthOf([T, 2, Zt]))
    ctx.stroke()
  }
  // the tunnel goes on: rings with lamps
  for (let k = 1; k < 9; k++) {
    const z = Zt + k * 7
    if (!path(arch(z))) continue
    ctx.strokeStyle = `rgba(255,190,100,${0.1 * (1 - k / 9)})`
    ctx.lineWidth = 1
    ctx.stroke()
    light([T - 2.2, 2.7, z], 2.6, [255, 170, 70], 0.16 * (1 - k / 9))
    light([T + 2.2, 2.7, z], 2.6, [255, 170, 70], 0.16 * (1 - k / 9))
  }
  // signal beside the tunnel
  light([T + 3.6, 3.6, Zt - 0.1], 2.4, amberGo, 0.95)
  light([T + 3.6, 3.6, Zt - 0.1], 0.7, [255, 255, 255], 0.5)

  // ---- ceiling and side walls ---------------------------------------------------------------------------------------
  face({ pts: [[wallL, HALL_TOP, 0.4], [wallR, HALL_TOP, 0.4], [wallR, HALL_TOP, Zt], [wallL, HALL_TOP, Zt]], fill: [20, 26, 36], k: 0.8 })
  // light strips on the ceiling
  for (const lx of [T - 3.4, T + 0.4, T + 4.4]) {
    face({ pts: [[lx - 0.22, HALL_TOP - 0.02, 0.4], [lx + 0.22, HALL_TOP - 0.02, 0.4], [lx + 0.22, HALL_TOP - 0.02, Zt], [lx - 0.22, HALL_TOP - 0.02, Zt]], fill: [255, 240, 215], k: 1, glow: 1, alpha: 0.9 })
    add([[lx - 0.9, HALL_TOP - 0.02, 0.4], [lx + 0.9, HALL_TOP - 0.02, 0.4], [lx + 0.9, HALL_TOP - 0.02, Zt], [lx - 0.9, HALL_TOP - 0.02, Zt]], [255, 220, 170], 0.05)
  }
  // right wall (beyond the track) with lit panels
  face({ pts: [[wallR, -3, 0.4], [wallR, HALL_TOP, 0.4], [wallR, HALL_TOP, Zt], [wallR, -3, Zt]], fill: [24, 31, 42], k: 0.85 })
  for (let z = 6; z < Zt - 4; z += 9) {
    const hue: RGB = Math.round(z / 9) % 2 ? [90, 190, 255] : [255, 196, 110]
    face({ pts: [[wallR - 0.05, 1.8, z], [wallR - 0.05, 4.4, z], [wallR - 0.05, 4.4, z + 5.4], [wallR - 0.05, 1.8, z + 5.4]], fill: hue, k: 0.5, glow: 1, alpha: 0.5 })
    add([[wallR - 0.05, 1.2, z - 0.5], [wallR - 0.05, 5.0, z - 0.5], [wallR - 0.05, 5.0, z + 5.9], [wallR - 0.05, 1.2, z + 5.9]], hue, 0.045)
  }
  // tiles on the wall beyond the track
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let z = 0.4; z < Zt; z += 1.2) seg([wallR - 0.02, 0.2, z], [wallR - 0.02, 4.4, z])
  for (let y = 0.2; y < 4.5; y += 0.6) seg([wallR - 0.02, y, 0.4], [wallR - 0.02, y, Zt])
  ctx.restore()
  // left wall
  face({ pts: [[wallL, -3, 0.4], [wallL, HALL_TOP, 0.4], [wallL, HALL_TOP, Zt], [wallL, -3, Zt]], fill: [20, 26, 36], k: 0.7 })

  // ---- floor: track bed and platform --------------------------------------------------------------------------------
  face({ pts: [[EDGE_X, 0, 0.4], [wallR, 0, 0.4], [wallR, 0, Zt], [EDGE_X, 0, Zt]], fill: [22, 25, 31], k: 1 })
  face({ pts: [[wallL, PLATFORM_Y, 0.4], [EDGE_X, PLATFORM_Y, 0.4], [EDGE_X, PLATFORM_Y, Zt], [wallL, PLATFORM_Y, Zt]], fill: [48, 55, 68], k: 1 })
  // platform edge (the vertical face is hidden from here, a dark line sells the step)
  // tiles on the platform
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'
  ctx.lineWidth = 1
  for (let z = 1; z < Zt; z += 2) seg([wallL, PLATFORM_Y, z], [EDGE_X, PLATFORM_Y, z])
  for (let x = EDGE_X - 2; x > wallL; x -= 2) seg([x, PLATFORM_Y, 0.4], [x, PLATFORM_Y, Zt])
  ctx.restore()
  // tactile strip and the white line at the edge
  face({ pts: [[EDGE_X - 0.62, PLATFORM_Y + 0.003, 0.4], [EDGE_X - 0.18, PLATFORM_Y + 0.003, 0.4], [EDGE_X - 0.18, PLATFORM_Y + 0.003, Zt], [EDGE_X - 0.62, PLATFORM_Y + 0.003, Zt]], fill: [210, 170, 60], k: 0.55 })
  // the LED strip along the edge: a light chase while waiting, green when the way is clear
  const stripZ0 = 0.4
  const chase = 6
  for (let z = stripZ0; z < Zt; z += 1.1) {
    const wave = 0.5 + 0.5 * Math.sin(z * 0.9 - s.t * 5 * (1 - s.go * 0.4))
    const near = s.trainZ === null ? 0 : clamp01(1 - Math.abs(z - (s.trainZ - 3)) / 10)
    const a = (0.25 + 0.6 * wave * (1 - s.go * 0.3) + near * 0.5) * (s.go > 0.5 ? 1 : 0.85)
    face({ pts: [[EDGE_X - 0.12, PLATFORM_Y + 0.006, z], [EDGE_X - 0.02, PLATFORM_Y + 0.006, z], [EDGE_X - 0.02, PLATFORM_Y + 0.006, z + 0.8], [EDGE_X - 0.12, PLATFORM_Y + 0.006, z + 0.8]], fill: amberGo, k: 1, glow: 1, alpha: Math.min(1, a) })
    if (z < chase * 5) add([[EDGE_X - 0.5, PLATFORM_Y + 0.01, z], [EDGE_X + 0.1, PLATFORM_Y + 0.01, z], [EDGE_X + 0.1, PLATFORM_Y + 0.01, z + 1], [EDGE_X - 0.5, PLATFORM_Y + 0.01, z + 1]], amberGo, 0.05 * wave)
  }

  // ---- rails and sleepers -------------------------------------------------------------------------------------------
  for (let z = 0.6; z < Zt; z += 0.8) {
    face({ pts: [[T - 1.35, 0.1, z], [T + 1.35, 0.1, z], [T + 1.35, 0.1, z + 0.28], [T - 1.35, 0.1, z + 0.28]], fill: [38, 36, 38], k: 1 })
  }
  for (const rxp of [T - 0.7175, T + 0.7175]) {
    face({ pts: [[rxp - 0.06, 0.2, 0.4], [rxp + 0.06, 0.2, 0.4], [rxp + 0.06, 0.2, Zt], [rxp - 0.06, 0.2, Zt]], fill: [150, 156, 166], k: 0.9 })
  }

  // the polished floor mirrors the ceiling lights as long soft streaks
  for (const lx of [T - 3.4, T + 0.4, T + 4.4]) {
    const fy = lx < EDGE_X ? PLATFORM_Y : 0.03
    add([[lx - 0.5, fy + 0.014, 0.4], [lx + 0.5, fy + 0.014, 0.4], [lx + 0.18, fy + 0.014, Zt], [lx - 0.18, fy + 0.014, Zt]], [255, 226, 180], 0.045)
  }
  // ---- things that can stand in front of each other: columns and the train -----------------------------------------
  type Item = { depth: number; draw: () => void }
  const items: Item[] = []

  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill: RGB) => {
    items.push({
      depth: depthOf([(x0 + x1) / 2, y0, (z0 + z1) / 2]),
      draw: () => {
        face({ pts: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], fill, k: 0.6 })
        face({ pts: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], fill, k: 0.8 })
        face({ pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fill, k: 1 })
      },
    })
  }
  for (let z = 9; z < Zt - 3; z += 11) box(T - 6.2, T - 5.6, PLATFORM_Y, HALL_TOP, z, z + 0.6, [40, 48, 62])

  // the train: three articulated cars of the yellow U-Bahn (BLN J / JK of the vehicle gallery), also built a few times shifted for the blur
  const addTrain = (zf: number, out: Item[]) => {
    const tface = (f: Face) => face({ ...f, thru: true })
    const lit = (z: number) => 0.15 + 0.85 * clamp01((Zt + 10 - z) / 20) // a car inside the tunnel is dark, it gets lighter as it comes out
    const YELLOW: RGB = [252, 205, 22]
    const GLASS: RGB = [22, 26, 33]
    const BLACK: RGB = [14, 16, 20]
    const xl = T - CAR_W / 2
    const xr = T + CAR_W / 2
    const top = 3.35
    for (let i = 0; i < CARS; i++) {
      const z0 = zf + i * (CAR_LEN + CAR_GAP)
      const z1 = z0 + CAR_LEN
      const head = i === 0
      const rake = head ? 0.8 : 0
      out.push({
        depth: depthOf([T, 2, z0 + CAR_LEN / 2]),
        draw: () => {
          ctx.save()
          ctx.globalAlpha *= s.trainFade
          const kk = lit(z0 + CAR_LEN / 2)
          // side (the one facing the platform), the dark running gear below it and the roof edge
          tface({ pts: [[xl, 0.5, z0], [xl, top, z0 + rake], [xl, top, z1], [xl, 0.5, z1]], fill: YELLOW, k: 0.8 * kk })
          tface({ pts: [[xl - 0.004, 0.5, z0 + 0.3], [xl - 0.004, 0.8, z0 + 0.3], [xl - 0.004, 0.8, z1 - 0.3], [xl - 0.004, 0.5, z1 - 0.3]], fill: [30, 32, 37], k: kk })
          tface({ pts: [[xl, top, z0 + rake], [xl + 0.28, top + 0.26, z0 + rake], [xl + 0.28, top + 0.26, z1], [xl, top, z1]], fill: YELLOW, k: 0.92 * kk })
          tface({ pts: [[xl + 0.28, top + 0.26, z0 + rake], [xr - 0.28, top + 0.26, z0 + rake], [xr - 0.28, top + 0.26, z1], [xl + 0.28, top + 0.26, z1]], fill: [200, 160, 16], k: kk })
          // doors and windows: dark glass with the warm light of the inside
          const w0 = z0 + (head ? 3.6 : 0.9)
          const w1 = z1 - 0.9
          const n = Math.max(1, Math.floor((w1 - w0) / 2))
          const step = (w1 - w0) / n
          for (let w = 0; w < n; w++) {
            const a = w0 + w * step + 0.1
            const b = w0 + (w + 1) * step - 0.1
            if (w % 3 === 1) {
              const m = (a + b) / 2
              const o = s.doors
              const h1: [number, number] = [a, a + (m - 0.04 - a) * (1 - o * 0.92)]
              const h2: [number, number] = [b - (b - (m + 0.04)) * (1 - o * 0.92), b]
              if (o > 0.02) tface({ pts: [[xl - 0.007, 0.95, h1[1]], [xl - 0.007, 3.0, h1[1]], [xl - 0.007, 3.0, h2[0]], [xl - 0.007, 0.95, h2[0]]], fill: [255, 238, 196], k: 1, glow: kk, alpha: 0.95 * o })
              for (const [p, q] of [h1, h2]) {
                tface({ pts: [[xl - 0.008, 0.95, p], [xl - 0.008, 3.0, p], [xl - 0.008, 3.0, q], [xl - 0.008, 0.95, q]], fill: GLASS, k: kk })
                if (q - p > 0.2) tface({ pts: [[xl - 0.01, 1.2, p + 0.08], [xl - 0.01, 2.9, p + 0.08], [xl - 0.01, 2.9, q - 0.08], [xl - 0.01, 1.2, q - 0.08]], fill: [255, 214, 140], k: 1, glow: kk, alpha: 0.2 * kk })
              }
            } else {
              tface({ pts: [[xl - 0.008, 1.65, a], [xl - 0.008, 2.85, a], [xl - 0.008, 2.85, b], [xl - 0.008, 1.65, b]], fill: GLASS, k: kk })
              tface({ pts: [[xl - 0.01, 1.75, a + 0.08], [xl - 0.01, 2.75, a + 0.08], [xl - 0.01, 2.75, b - 0.08], [xl - 0.01, 1.75, b - 0.08]], fill: [255, 214, 140], k: 1, glow: kk, alpha: 0.24 * kk })
            }
          }
          if (i < CARS - 1) {
            // the dark bellows between two cars
            tface({ pts: [[xl, 0.6, z1], [xl, 3.3, z1], [xl, 3.3, z1 + CAR_GAP], [xl, 0.6, z1 + CAR_GAP]], fill: BLACK, k: kk })
          }
          if (head) {
            const zy = (y: number) => z0 + (rake * (y - 0.5)) / (top - 0.5) - 0.012
            // the cab door
            tface({ pts: [[xl - 0.008, 0.95, z0 + 1.3], [xl - 0.008, 3.0, z0 + 1.3], [xl - 0.008, 3.0, z0 + 2.9], [xl - 0.008, 0.95, z0 + 2.9]], fill: GLASS, k: kk })
            // front: yellow, with a big dark windscreen, the destination display and two white light bars
            tface({ pts: [[xl, 0.5, z0], [xr, 0.5, z0], [xr, top, z0 + rake], [xl, top, z0 + rake]], fill: YELLOW, k: 0.66 * kk })
            tface({ pts: [[xl + 0.16, 1.25, zy(1.25)], [xr - 0.16, 1.25, zy(1.25)], [xr - 0.16, 3.12, zy(3.12)], [xl + 0.16, 3.12, zy(3.12)]], fill: BLACK, k: kk })
            const sx = T - 0.9 + 0.25 * Math.sin(s.t * 0.7)
            tface({ pts: [[sx, 1.5, zy(1.5) - 0.006], [sx + 0.5, 1.5, zy(1.5) - 0.006], [sx + 0.95, 3.0, zy(3.0) - 0.006], [sx + 0.45, 3.0, zy(3.0) - 0.006]], fill: [120, 150, 190], k: 1, glow: 1, alpha: 0.09 * kk })
            tface({ pts: [[xl + 0.4, 2.78, zy(2.78) - 0.006], [xl + 1.5, 2.78, zy(2.78) - 0.006], [xl + 1.5, 2.96, zy(2.96) - 0.006], [xl + 0.4, 2.96, zy(2.96) - 0.006]], fill: [255, 170, 60], k: 1, glow: kk, alpha: 0.9 * kk })
            for (const [p, q] of [[xl + 0.3, xl + 0.95], [xr - 0.95, xr - 0.3]]) {
              tface({ pts: [[p, 1.38, zy(1.38) - 0.006], [q, 1.38, zy(1.38) - 0.006], [q, 1.46, zy(1.46) - 0.006], [p, 1.46, zy(1.46) - 0.006]], fill: [255, 255, 255], k: 1, glow: kk, alpha: 1 })
            }
            tface({ pts: [[xl, 0.5, z0 - 0.02], [xr, 0.5, z0 - 0.02], [xr, 0.82, z0 - 0.02], [xl, 0.82, z0 - 0.02]], fill: [30, 32, 37], k: kk })
          }
          ctx.restore()
        },
      })
    }
  }
  if (s.trainZ !== null) addTrain(s.trainZ, items)

  // ---- the information display: two screens hang side by side from the ceiling above the platform, tilted a little down ----
  const drawDisplay = () => {
    const tex = s.board
    if (!tex) return
    const A_W = 2.2
    const A_H = (A_W * TEX_H) / TEX_W
    const PHI = 0.2
    const dsp = (cam.f * A_W) / (wide ? rw * 0.4 : rw * 0.6)
    const tx = rx + rw * (wide ? 0.4 : 0.42)
    const ty = ry + rh * (wide ? 0.27 : 0.25)
    const ccx = ((tx - (rx + rw * 0.5)) * dsp) / cam.f
    const ccy = ((baseCy - ty) * dsp) / cam.f
    // the middle of the first screen in "yaw space" (the world turned like the camera, before the camera looks up)
    const yc: V3 = [ccx, ccy * cam.cp + dsp * cam.sp, dsp * cam.cp - ccy * cam.sp]
    /** yaw space to world */
    const yw = (v: V3): V3 => [v[0] * cam.cos + v[2] * cam.sin, v[1] + cam.y, -v[0] * cam.sin + v[2] * cam.cos]
    interface Fr {
      c: V3
      r: V3
      u: V3
      n: V3
    }
    const frame = (c: V3, az: number): Fr => {
      const sa = Math.sin(az)
      const ca = Math.cos(az)
      const sp = Math.sin(PHI)
      const cp = Math.cos(PHI)
      return { c, r: [ca, 0, -sa], n: [-sa * cp, -sp, -ca * cp], u: [-sa * sp, cp, -ca * sp] }
    }
    const at = (f: Fr, a: number, b: number, k: number): V3 => [f.c[0] + f.r[0] * a + f.u[0] * b + f.n[0] * k, f.c[1] + f.r[1] * a + f.u[1] * b + f.n[1] * k, f.c[2] + f.r[2] * a + f.u[2] * b + f.n[2] * k]
    const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]]
    const azA = Math.atan2(yc[0], yc[2]) + 0.14
    const frA = frame(yc, azA)
    const apex = at(frA, A_W / 2 + 0.03, 0, 0)
    const azB = azA - 0.9
    const rB: V3 = [Math.cos(azB), 0, -Math.sin(azB)]
    const frB = frame([apex[0] + (rB[0] * A_W) / 2, apex[1], apex[2] + (rB[2] * A_W) / 2], azB)
    const bluish = (c: RGB, t: number): RGB => mix(c, [70, 100, 230], t)

    const box = (f: Fr, a0: number, a1: number, b0: number, b1: number, c0: number, c1: number, fill: RGB, kk: number) => {
      const P = (a: number, b: number, c: number) => at(f, a, b, c)
      const faces: [V3, V3[], number][] = [
        [f.n, [P(a0, b0, c1), P(a1, b0, c1), P(a1, b1, c1), P(a0, b1, c1)], 1],
        [neg(f.n), [P(a1, b0, c0), P(a0, b0, c0), P(a0, b1, c0), P(a1, b1, c0)], 0.5],
        [neg(f.r), [P(a0, b0, c0), P(a0, b0, c1), P(a0, b1, c1), P(a0, b1, c0)], 0.78],
        [f.r, [P(a1, b0, c1), P(a1, b0, c0), P(a1, b1, c0), P(a1, b1, c1)], 0.78],
        [f.u, [P(a0, b1, c1), P(a1, b1, c1), P(a1, b1, c0), P(a0, b1, c0)], 0.9],
        [neg(f.u), [P(a0, b0, c0), P(a1, b0, c0), P(a1, b0, c1), P(a0, b0, c1)], 0.7],
      ]
      for (const [N, pts, k] of faces) {
        const p = pts[0]
        if (N[0] * p[0] + N[1] * p[1] + N[2] * p[2] < 0) face({ pts: pts.map(yw), fill: k < 0.75 ? bluish(fill, 0.18) : fill, k: k * kk })
      }
    }

    // a screen's picture, mapped onto the tilted quad (small triangles, each with its own affine map)
    const drawTex = (f: Fr) => {
      const front = f.n[0] * f.c[0] + f.n[1] * f.c[1] + f.n[2] * f.c[2] < 0
      if (!front) return
      const NX = 12
      const NY = 5
      const grid: [number, number][][] = []
      for (let i = 0; i <= NX; i++) {
        const col: [number, number][] = []
        for (let j = 0; j <= NY; j++) {
          const v = toCam(cam, yw(at(f, -A_W / 2 + (A_W * i) / NX, A_H / 2 - (A_H * j) / NY, 0)))
          if (v[2] < 0.6) return
          col.push(scr(cam, v))
        }
        grid.push(col)
      }
      const tw = tex.width
      const th = tex.height
      const tri = (p0: [number, number], p1: [number, number], p2: [number, number], t0: [number, number], t1: [number, number], t2: [number, number]) => {
        const det = (t1[0] - t0[0]) * (t2[1] - t0[1]) - (t2[0] - t0[0]) * (t1[1] - t0[1])
        if (!det) return
        const a = ((p1[0] - p0[0]) * (t2[1] - t0[1]) - (p2[0] - p0[0]) * (t1[1] - t0[1])) / det
        const c = ((t1[0] - t0[0]) * (p2[0] - p0[0]) - (t2[0] - t0[0]) * (p1[0] - p0[0])) / det
        const b = ((p1[1] - p0[1]) * (t2[1] - t0[1]) - (p2[1] - p0[1]) * (t1[1] - t0[1])) / det
        const d = ((t1[0] - t0[0]) * (p2[1] - p0[1]) - (t2[0] - t0[0]) * (p1[1] - p0[1])) / det
        const e = p0[0] - a * t0[0] - c * t0[1]
        const g = p0[1] - b * t0[0] - d * t0[1]
        const mx = (p0[0] + p1[0] + p2[0]) / 3
        const my = (p0[1] + p1[1] + p2[1]) / 3
        ctx.save()
        ctx.beginPath()
        ;[p0, p1, p2].forEach((p, i) => {
          const dx = p[0] - mx
          const dy = p[1] - my
          const l = Math.hypot(dx, dy) || 1
          const x = p[0] + (dx / l) * 0.8
          const y = p[1] + (dy / l) * 0.8
          if (i) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        ctx.closePath()
        ctx.clip()
        ctx.transform(a, b, c, d, e, g)
        ctx.drawImage(tex, 0, 0)
        ctx.restore()
      }
      for (let i = 0; i < NX; i++) {
        for (let j = 0; j < NY; j++) {
          const u0 = (i / NX) * tw
          const u1 = ((i + 1) / NX) * tw
          const v0 = (j / NY) * th
          const v1 = ((j + 1) / NY) * th
          tri(grid[i][j], grid[i + 1][j], grid[i][j + 1], [u0, v0], [u1, v0], [u0, v1])
          tri(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], [u1, v0], [u1, v1], [u0, v1])
        }
      }
      // gloss: the ceiling lights are reflected in the glass, and the lit screen glows a little into the dark
      const corners = [grid[0][0], grid[NX][0], grid[NX][NY], grid[0][NY]]
      ctx.save()
      ctx.beginPath()
      corners.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.clip()
      const gl = ctx.createLinearGradient(corners[0][0], corners[0][1], corners[2][0], corners[2][1])
      gl.addColorStop(0, 'rgba(255,255,255,0.13)')
      gl.addColorStop(0.28, 'rgba(255,255,255,0.03)')
      gl.addColorStop(0.3, 'rgba(255,255,255,0)')
      gl.addColorStop(0.62, 'rgba(255,255,255,0)')
      gl.addColorStop(0.7, 'rgba(255,255,255,0.05)')
      gl.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gl
      ctx.fillRect(0, 0, rx + rw, ry + rh)
      ctx.restore()
      const gx = (corners[0][0] + corners[2][0]) / 2
      const gy = (corners[0][1] + corners[2][1]) / 2
      const gr = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]) * 0.95
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
      halo.addColorStop(0, 'rgba(70,100,255,0.16)')
      halo.addColorStop(1, 'rgba(70,100,255,0)')
      ctx.fillStyle = halo
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2)
      ctx.restore()
    }

    const HOUSE: RGB = [126, 132, 140]
    const SLAB: RGB = [172, 176, 182]
    const hw = A_W / 2 + 0.04
    const hh = A_H / 2
    // the stem from the ceiling, in the middle between the two screens
    const stemTop = HALL_TOP - cam.y
    const stemFr: Fr = { c: [apex[0], apex[1] + hh + 0.02, apex[2]], r: [Math.cos(azA), 0, -Math.sin(azA)], u: [0, 1, 0], n: [-Math.sin(azA), 0, -Math.cos(azA)] }
    box(stemFr, -0.08, 0.08, 0, Math.max(0.2, stemTop - stemFr.c[1]), -0.08, 0.08, [92, 98, 106], 0.9)
    for (const fr of [frB, frA]) {
      box(fr, -hw, hw, -hh - 0.04, hh + 0.04, -0.3, 0, HOUSE, 0.95)
      drawTex(fr)
      // the grey slab below the screen, with the vent slots on its underside
      box(fr, -hw - 0.02, hw + 0.04, -hh - 0.22, -hh - 0.04, -0.3, 0.05, SLAB, 1)
      const bn = -hh - 0.22
      const bp = at(fr, 0, bn, -0.1)
      if (fr.u[0] * bp[0] + fr.u[1] * bp[1] + fr.u[2] * bp[2] > 0) {
        for (let a = -hw + 0.12; a < hw - 0.1; a += 0.14) {
          face({ pts: [at(fr, a, bn, -0.24), at(fr, a + 0.06, bn, -0.24), at(fr, a + 0.06, bn, -0.06), at(fr, a, bn, -0.06)].map(yw), fill: [60, 64, 70], k: 0.9 })
        }
      }
    }

    // the blue light of the screens on the ceiling and the platform
    for (const fr of [frA, frB]) {
      const w = yw(fr.c)
      light(w, 5.5, [70, 100, 255], 0.1)
      add([[w[0] - 3, HALL_TOP - 0.02, w[2] - 2.4], [w[0] + 3, HALL_TOP - 0.02, w[2] - 2.4], [w[0] + 3, HALL_TOP - 0.02, w[2] + 2.4], [w[0] - 3, HALL_TOP - 0.02, w[2] + 2.4]], [60, 90, 255], 0.05)
      const fy = w[0] < EDGE_X ? PLATFORM_Y : 0.02
      add([[w[0] - 1.6, fy + 0.01, w[2] - 3.4], [w[0] + 1.6, fy + 0.01, w[2] - 3.4], [w[0] + 1.6, fy + 0.01, w[2] + 0.6], [w[0] - 1.6, fy + 0.01, w[2] + 0.6]], [60, 90, 255], 0.045)
    }
  }

  items.sort((a, b) => b.depth - a.depth)
  // blur of the rush: faint copies a little ahead and behind
  if (s.trainZ !== null && s.speed > 32) {
    const d = s.speed * 0.011
    for (const sign of [-1, 1]) {
      const ghosts: Item[] = []
      addTrain(s.trainZ + sign * d, ghosts)
      ghosts.sort((a, b) => b.depth - a.depth)
      ctx.save()
      ctx.globalAlpha = 0.2
      for (const it of ghosts) it.draw()
      ctx.restore()
    }
  }
  for (const it of items) it.draw()
  drawDisplay()

  // ---- light: headlights, windows on the platform, the tunnel mouth, dust -------------------------------------------
  if (s.portalGlow > 0.003) {
    const v = toCam(cam, [T, 2.4, Zt])
    const [px, py] = scr(cam, v)
    const r = ((cam.f * (6 + 20 * s.portalGlow)) / v[2]) * (0.8 + 0.2 * Math.sin(s.t * 14))
    const g = ctx.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, `rgba(255,244,220,${0.9 * s.portalGlow})`)
    g.addColorStop(0.35, `rgba(255,200,130,${0.32 * s.portalGlow})`)
    g.addColorStop(1, 'rgba(255,180,100,0)')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.fillRect(px - r, py - r, r * 2, r * 2)
    ctx.restore()
  }
  if (s.trainZ !== null) {
    const zf = s.trainZ
    const k = clamp01((Zt + 24 - zf) / 10)
    for (const dx of [-0.62, 0.62]) {
      light([T + dx, 1.42, zf - 0.05], 2.1, [255, 250, 235], 0.85 * k)
      light([T + dx, 1.42, zf - 0.05], 0.7, [255, 255, 255], 1 * k)
    }
    // the beam on the rails and the platform ahead of the train (gone when the train stands right in front of the camera)
    const beam = clamp01((zf - 9) / 8)
    light([T, 0.3, zf - 5], 10, [255, 244, 220], 0.2 * k * beam)
    light([T - 2, PLATFORM_Y, zf - 4], 8, [255, 236, 200], 0.12 * k * beam)
    // lit windows throw light onto the platform
    for (let i = 0; i < CARS; i++) {
      const z0 = zf + i * (CAR_LEN + CAR_GAP)
      if (z0 > Zt + 2) continue
      add([[EDGE_X - 0.1, PLATFORM_Y + 0.012, z0 + 1], [EDGE_X - 2.4, PLATFORM_Y + 0.012, z0 + 1.6], [EDGE_X - 2.4, PLATFORM_Y + 0.012, z0 + CAR_LEN - 1.6], [EDGE_X - 0.1, PLATFORM_Y + 0.012, z0 + CAR_LEN - 1]], [255, 222, 150], (0.1 + 0.12 * s.doors) * k)
    }
  }
  // the draught of the arriving train blows dust and bits of paper along the platform
  if (s.trainZ !== null && s.speed > 0.4) {
    const wind = clamp01(s.speed / 10) * clamp01((Zt + 6 - s.trainZ) / 10)
    for (let i = 0; i < 16; i++) {
      const zz = s.trainZ - 1.5 - ((i * 1.9) % 16) + Math.sin(s.t * 5 + i) * 0.5 * wind
      const xx = EDGE_X - 0.4 - ((i * 0.37) % 1.8) + Math.sin(s.t * 6.3 + i * 1.7) * 0.25 * wind
      const yy = PLATFORM_Y + 0.15 + (((i * 0.53) % 1) * 0.7 + Math.sin(s.t * 7 + i * 2) * 0.15) * wind
      if (zz > 0.8) light([xx, yy, zz], 0.2, [255, 250, 240], 0.5 * wind)
    }
  }
  // floating dust in the light
  for (let i = 0; i < 26; i++) {
    const a = (i * 97.13) % 1
    const b = (i * 53.71) % 1
    const x = T - 7 + ((a * 17 + s.t * (0.15 + b * 0.2)) % 17)
    const y = 1.4 + b * 4.5 + Math.sin(s.t * 0.8 + i) * 0.25
    const z = 5 + ((a * 77 + i * 3.3) % 24)
    light([x, y, z], 0.18, [255, 236, 200], 0.2 + 0.2 * Math.sin(s.t * 1.7 + i * 2.1))
  }

  ctx.restore()
}
