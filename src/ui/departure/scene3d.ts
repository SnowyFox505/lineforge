import { clamp01 } from '../netCanvas'

/**
 * A small perspective renderer on a 2D canvas, just enough for the station of the update screen:
 * a platform hall seen along the track, a tunnel mouth at the far end, and a train that comes out of it.
 * World units are metres: x to the right, y up, z away from the camera.
 */
type V3 = [number, number, number]
type RGB = [number, number, number]

export const TUNNEL_Z = 34 // the wall with the tunnel mouth
export const TRACK_X = 4.2
export const CAR_LEN = 15.5
export const CAR_GAP = 0.7
export const CARS = 4
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
}

function toCam(c: Cam, p: V3): V3 {
  const rx = p[0] - c.x
  const ry = p[1] - c.y
  const rz = p[2] - c.z
  return [rx * c.cos - rz * c.sin, ry, rx * c.sin + rz * c.cos]
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
  const cam: Cam = {
    x: 0,
    y: 2.3,
    z: 0,
    cos: Math.cos(yaw),
    sin: Math.sin(yaw),
    f: Math.min(rw * 1.0, rh * 1.55),
    cx: rx + rw * 0.5 + shakeX,
    cy: ry + rh * 0.4 + shakeY,
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

  const face = (f: Face) => {
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

  // the train (also built a few times shifted along its way for the blur)
  const addTrain = (zf: number, out: Item[]) => {
    const lit = (z: number) => 0.28 + 0.72 * clamp01((Zt - z) / 7) // a car inside the tunnel is dark
    for (let i = 0; i < CARS; i++) {
      const z0 = zf + i * (CAR_LEN + CAR_GAP)
      const z1 = z0 + CAR_LEN
      const head = i === 0
      const nose = head ? 3.4 : 0
      const k = (z: number) => lit(z)
      out.push({
        depth: depthOf([T, 2, z0 + CAR_LEN / 2]),
        draw: () => {
          const kk = k(z0 + CAR_LEN / 2)
          const body: RGB = [226, 231, 238]
          const xl = T - 1.45
          const xr = T + 1.45
          // side (the one facing the platform)
          face({ pts: [[xl, 0.55, z0], [xl, head ? 1.7 : 3.1, z0], ...(head ? ([[xl, 3.1, z0 + nose]] as V3[]) : []), [xl, 3.1, z1], [xl, 0.55, z1]], fill: body, k: 0.78 * kk })
          // dark skirt and the accent stripe
          face({ pts: [[xl - 0.005, 0.55, z0], [xl - 0.005, 0.95, z0], [xl - 0.005, 0.95, z1], [xl - 0.005, 0.55, z1]], fill: [40, 46, 56], k: kk })
          face({ pts: [[xl - 0.006, 0.97, z0], [xl - 0.006, 1.22, z0], [xl - 0.006, 1.22, z1], [xl - 0.006, 0.97, z1]], fill: s.accent, k: 0.95 * kk, glow: kk })
          // windows and doors
          const w0 = z0 + (head ? 4.4 : 0.9)
          const n = head ? 5 : 7
          const step = (z1 - 1 - w0) / n
          for (let w = 0; w < n; w++) {
            const door = w === 2 || (!head && w === 4)
            const a = w0 + w * step + 0.18
            const b = w0 + (w + 1) * step - 0.18
            if (door) {
              face({ pts: [[xl - 0.008, 1.3, a], [xl - 0.008, 2.95, a], [xl - 0.008, 2.95, b], [xl - 0.008, 1.3, b]], fill: [60, 120, 170], k: 0.9 * kk })
            } else {
              face({ pts: [[xl - 0.008, 1.75, a], [xl - 0.008, 2.75, a], [xl - 0.008, 2.75, b], [xl - 0.008, 1.75, b]], fill: [255, 226, 160], k: 1, glow: kk, alpha: 0.95 * kk + 0.05 })
            }
          }
          // roof chamfers and roof
          const shoulder = 3.1
          face({ pts: [[xl, shoulder, z0 + nose], [xl + 0.35, 3.7, z0 + nose], [xl + 0.35, 3.7, z1], [xl, shoulder, z1]], fill: body, k: 0.92 * kk })
          face({ pts: [[xl + 0.35, 3.7, z0 + nose], [xr - 0.35, 3.7, z0 + nose], [xr - 0.35, 3.7, z1], [xl + 0.35, 3.7, z1]], fill: [214, 220, 229], k: 1 * kk })
          if (head) {
            // windscreen, lower nose and the two small triangles at the corners
            face({ pts: [[xl, 1.7, z0], [xr, 1.7, z0], [xr - 0.35, 3.7, z0 + nose], [xl + 0.35, 3.7, z0 + nose]], fill: [14, 22, 32], k: 1 * kk })
            const sx = (T - 1.0) + 0.25 * Math.sin(s.t * 0.7)
            face({ pts: [[sx, 2.0, z0 - 0.02], [sx + 0.55, 2.0, z0 - 0.02], [sx + 1.0, 3.55, z0 + nose - 0.03], [sx + 0.45, 3.55, z0 + nose - 0.03]], fill: [120, 150, 190], k: 1, glow: 1, alpha: 0.1 * kk })
            face({ pts: [[xl, 0.55, z0], [xr, 0.55, z0], [xr, 1.7, z0], [xl, 1.7, z0]], fill: [232, 236, 242], k: 0.62 * kk })
            face({ pts: [[xl, 0.98, z0 - 0.004], [xr, 0.98, z0 - 0.004], [xr, 1.2, z0 - 0.004], [xl, 1.2, z0 - 0.004]], fill: s.accent, k: 0.95 * kk, glow: kk })
            face({ pts: [[xl, 1.7, z0], [xl + 0.35, 3.7, z0 + nose], [xl, 3.1, z0 + nose]], fill: body, k: 0.7 * kk })
            face({ pts: [[xl + 0.4, 3.3, z0 + nose - 0.05], [xr - 0.4, 3.3, z0 + nose - 0.05], [xr - 0.4, 3.55, z0 + nose - 0.05], [xl + 0.4, 3.55, z0 + nose - 0.05]], fill: [255, 170, 60], k: 1, glow: kk, alpha: 0.9 * kk })
          } else {
            // the front of a middle car is only seen as a dark gap
            face({ pts: [[xl, 0.55, z0], [xl, 3.1, z0], [xl + 0.1, 3.1, z0 - 0.7], [xl + 0.1, 0.55, z0 - 0.7]], fill: [10, 12, 16], k: 1 })
          }
        },
      })
    }
  }
  if (s.trainZ !== null) addTrain(s.trainZ, items)

  // the platform sign hanging over the track
  const signZ = 19
  for (const rxp of [T - 1.0, T + 1.0]) face({ pts: [[rxp - 0.03, 5.9, signZ], [rxp + 0.03, 5.9, signZ], [rxp + 0.03, HALL_TOP, signZ], [rxp - 0.03, HALL_TOP, signZ]], fill: [90, 98, 110], k: 0.8 })
  face({ pts: [[T - 1.35, 4.8, signZ], [T + 1.35, 4.8, signZ], [T + 1.35, 5.9, signZ], [T - 1.35, 5.9, signZ]], fill: [14, 92, 66], k: 1, glow: 1 })
  add([[T - 1.5, 4.6, signZ], [T + 1.5, 4.6, signZ], [T + 1.5, 6.1, signZ], [T - 1.5, 6.1, signZ]], [60, 255, 170], 0.05 + 0.04 * s.go)
  {
    const v = toCam(cam, [T, 5.35, signZ])
    if (v[2] > NEAR) {
      const [tx, ty] = scr(cam, v)
      ctx.font = `700 ${(cam.f * 0.62) / v[2]}px ${s.family}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillText('GLEIS 1', tx, ty)
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
    const k = clamp01((Zt + 6 - zf) / 8)
    for (const dx of [-0.95, 0.95]) {
      light([T + dx, 1.15, zf - 0.05], 2.1, [255, 250, 235], 0.85 * k)
      light([T + dx, 1.15, zf - 0.05], 0.7, [255, 255, 255], 1 * k)
    }
    // the beam on the rails and the platform ahead of the train
    light([T, 0.3, zf - 5], 10, [255, 244, 220], 0.2 * k)
    light([T - 2, PLATFORM_Y, zf - 4], 8, [255, 236, 200], 0.12 * k)
    // lit windows throw light onto the platform
    for (let i = 0; i < CARS; i++) {
      const z0 = zf + i * (CAR_LEN + CAR_GAP)
      if (z0 > Zt + 2) continue
      add([[EDGE_X - 0.1, PLATFORM_Y + 0.012, z0 + 1], [EDGE_X - 2.4, PLATFORM_Y + 0.012, z0 + 1.6], [EDGE_X - 2.4, PLATFORM_Y + 0.012, z0 + CAR_LEN - 1.6], [EDGE_X - 0.1, PLATFORM_Y + 0.012, z0 + CAR_LEN - 1]], [255, 222, 150], 0.1 * k)
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
