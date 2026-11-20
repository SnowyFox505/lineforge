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
/** the cars are the Berlin U-Bahn J / JK of the game: one game unit is K metres */
const K = 8.125
const CAR_UNITS = 1.9
export const CAR_LEN = CAR_UNITS * K
export const CAR_GAP = 0.06 * K
export const CAR_W = 0.32 * K
export const CARS = 3
export const TRAIN_LEN = CARS * CAR_LEN + (CARS - 1) * CAR_GAP

const PLATFORM_Y = 0.95

/** x-intervals (game units from the middle of the car, +x towards the nose) of windows and doors of a J / JK car with a nose of nF / nR at its ends (the layout of `layoutSide` in vehicles3d.tsx) */
function jLayout(nF: number, nR: number) {
  const DOORS = [0.17, 0.5, 0.83]
  const DOOR_W = 0.17
  const WIN_W = 0.15
  const WIN_GAP = 0.04
  const a = -CAR_UNITS / 2 + (nR > 0 ? nR + 0.04 : 0.13)
  const b = CAR_UNITS / 2 - (nF > 0 ? nF + 0.04 : 0.13)
  const span = Math.max(0.2, b - a)
  const doors = DOORS.map((f) => a + span * f)
    .filter((c) => c - DOOR_W / 2 > a - 0.001 && c + DOOR_W / 2 < b + 0.001)
    .map((c) => [c - DOOR_W / 2, c + DOOR_W / 2] as [number, number])
  const wins: [number, number][] = []
  const cuts = [a, ...doors.flatMap((d) => d), b]
  for (let i = 0; i < cuts.length; i += 2) {
    const x0 = cuts[i] + (i === 0 ? 0 : 0.035)
    const x1 = cuts[i + 1] - (i + 1 === cuts.length - 1 ? 0 : 0.035)
    const seg = x1 - x0
    if (seg < 0.14) continue
    const n = Math.max(1, Math.round((seg + WIN_GAP) / (WIN_W + WIN_GAP)))
    const w = (seg - WIN_GAP * (n - 1)) / n
    for (let k = 0; k < n; k++) wins.push([x0 + k * (w + WIN_GAP), x0 + k * (w + WIN_GAP) + w])
  }
  return { doors, wins }
}
const CAR_LAYOUT = [jLayout(0.13, 0), jLayout(0, 0), jLayout(0, 0.13)]
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

  // the train: the three cars of the Berlin U-Bahn series J / JK, built from the same measures as the model of the game
  // (src/view3d/vehicleModels/ubahnBerlin1.ts and the style `ubahnj` in vehicles3d.tsx; one game unit is K metres here).
  // Only what the camera can see is drawn: the side facing the platform, the front of the head car, the gangways.
  const addTrain = (zf: number, out: Item[]) => {
    const tface = (f: Face) => face({ ...f, thru: true })
    const lit = (z: number) => 0.15 + 0.85 * clamp01((Zt + 10 - z) / 20) // a car inside the tunnel is dark, it gets lighter as it comes out
    const YEL: RGB = [252, 205, 22]
    const ROOF: RGB = [244, 193, 15]
    const STRIPE: RGB = [77, 83, 91]
    const DOORC: RGB = [21, 25, 29]
    const GLASS: RGB = [37, 56, 76]
    const BLACK: RGB = [11, 14, 18]
    const INK: RGB = [18, 26, 34]
    const xl = T - CAR_W / 2
    const BY = 0.7 // the underside of the body above the rails (the door sill is level with the platform)
    const H = 0.4 * K
    const TOP = BY + H
    const Y = (f: number) => BY + f * H
    const NOSE = 0.13 * K
    const RAKE = 0.05 * K
    const CAP_TOP = BY + 0.38 * K
    const CAP_HW = 0.1408 * K
    const WALL_TOP = TOP - 0.0416 * K // where the rounded roof edge begins
    for (let i = 0; i < CARS; i++) {
      const head = i === 0
      const tail = i === CARS - 1
      const lay = CAR_LAYOUT[head ? 0 : tail ? 2 : 1]
      const z0 = zf + i * (CAR_LEN + CAR_GAP)
      const z1 = z0 + CAR_LEN
      const zc = z0 + CAR_LEN / 2
      /** car x (forward, game units from the middle of the car) to the z of the scene */
      const Z = (x: number) => zc - x * K
      const xFront = CAR_UNITS / 2 - (head ? 0.13 : 0)
      const xRear = -CAR_UNITS / 2 + (tail ? 0.13 : 0)
      out.push({
        depth: depthOf([T, 2, zc]),
        draw: () => {
          ctx.save()
          ctx.globalAlpha *= s.trainFade
          const kk = lit(zc)
          const sq = (y0: number, y1: number, xa: number, xb: number, fill: RGB, k: number, off = 0.004, extra: Partial<Face> = {}) =>
            tface({ pts: [[xl - off, y0, Z(xa)], [xl - off, y1, Z(xa)], [xl - off, y1, Z(xb)], [xl - off, y0, Z(xb)]], fill, k: k * kk, ...extra })
          // the wall: yellow, with the dark grey base stripe, then the rounded roof edge
          sq(BY, WALL_TOP, xFront, xRear, YEL, 0.8, 0)
          sq(BY, Y(0.1), xFront, xRear, STRIPE, 0.82, 0.002)
          tface({ pts: [[xl, WALL_TOP, Z(xFront)], [xl + 0.09, TOP - 0.11, Z(xFront)], [xl + 0.09, TOP - 0.11, Z(xRear)], [xl, WALL_TOP, Z(xRear)]], fill: YEL, k: 0.92 * kk })
          tface({ pts: [[xl + 0.09, TOP - 0.11, Z(xFront)], [xl + 0.34, TOP, Z(xFront)], [xl + 0.34, TOP, Z(xRear)], [xl + 0.09, TOP - 0.11, Z(xRear)]], fill: ROOF, k: 0.95 * kk })

          // windows: dark rim and dark glass with the warm light of the inside
          const wy0 = Y(0.44)
          const wy1 = Y(0.84)
          lay.wins.forEach(([x0, x1], wi) => {
            const cab = (head && x1 > CAR_UNITS / 2 - NOSE / K - 0.07 && wi === lay.wins.length - 1) || (tail && x0 < -CAR_UNITS / 2 + NOSE / K + 0.07 && wi === 0)
            const tn = head ? 1 : -1
            if (cab) {
              // the yellow cab door with its tall narrow window
              const w = x1 - x0
              const cx = (x0 + x1) / 2
              sq(Y(0.08), Y(0.88), cx - w / 2 - 0.004, cx + w / 2 + 0.004, [15, 18, 22], 0.9, 0.006)
              sq(Y(0.09), Y(0.86), cx - w / 2 + 0.002, cx + w / 2 - 0.002, YEL, 0.8, 0.008)
              sq(Y(0.43), Y(0.86), cx + tn * w * 0.06 - w * 0.28, cx + tn * w * 0.06 + w * 0.28, [16, 22, 28], 0.9, 0.01)
              sq(Y(0.4) - 0.02, Y(0.4) + 0.03, cx - tn * w * 0.36 - 0.007, cx - tn * w * 0.36 + 0.007, [39, 44, 50], 0.9, 0.011)
              return
            }
            sq(wy0 - 0.04, wy1 + 0.04, x0 - 0.005, x1 + 0.005, [15, 19, 24], 0.9, 0.006)
            sq(wy0, wy1, x0, x1, GLASS, 1, 0.008)
            sq(wy0 + 0.05, wy1 - 0.05, x0 + 0.012, x1 - 0.012, [255, 214, 140], 1, 0.01, { glow: kk, alpha: 0.2 * kk })
          })

          // doors: black frame, two leaves with glass in the upper part, a light bar above, kick plate, stickers beside
          const o = s.doors
          for (const [x0, x1] of lay.doors) {
            const cx = (x0 + x1) / 2
            const gl = [x0, x0 + (cx - 0.003 - x0) * (1 - o * 0.92)]
            const gr = [x1 - (x1 - cx - 0.003) * (1 - o * 0.92), x1]
            sq(Y(0.08), Y(0.86), x0 - 0.005, x1 + 0.005, [13, 16, 19], 0.9, 0.006)
            if (o > 0.02) sq(Y(0.09), Y(0.85), gl[1], gr[0], [255, 238, 196], 1, 0.007, { glow: kk, alpha: 0.95 * o })
            for (const [p, q] of [gl, gr]) {
              sq(Y(0.09), Y(0.85), p, q, DOORC, 0.9, 0.008)
              if (q - p > 0.02) {
                sq(Y(0.24), Y(0.84), p + 0.008, q - 0.008, GLASS, 1, 0.01)
                if (q - p > 0.05) sq(Y(0.3), Y(0.8), p + 0.02, q - 0.02, [255, 214, 140], 1, 0.011, { glow: kk, alpha: 0.2 * kk })
              }
            }
            if (o < 0.05) sq(Y(0.09), Y(0.85), cx - 0.003, cx + 0.003, [5, 6, 7], 1, 0.012)
            sq(Y(0.87), Y(0.89), cx - (x1 - x0) * 0.3, cx + (x1 - x0) * 0.3, [217, 221, 226], 1, 0.008, { glow: kk, alpha: 0.85 * kk })
            sq(Y(0.1), Y(0.13), x0, x1, [38, 43, 49], 0.9, 0.012)
            // stickers beside the door on the yellow wall
            sq(Y(0.32) - 0.08, Y(0.32) + 0.08, x1 + 0.0165, x1 + 0.0285, [238, 240, 242], 0.85, 0.006)
            sq(Y(0.32) - 0.045, Y(0.32) + 0.045, x1 + 0.0195, x1 + 0.0255, [42, 47, 53], 0.85, 0.008)
            sq(Y(0.22) - 0.03, Y(0.22) + 0.03, x1 + 0.0205, x1 + 0.0245, [214, 47, 34], 0.85, 0.006)
          }
          // the BERLIN plate low on the wall behind the nose
          if (head) {
            const px = xFront - 0.065
            sq(Y(0.2) - 0.08, Y(0.2) + 0.08, px - 0.03, px + 0.03, [241, 243, 245], 0.85, 0.006)
            sq(Y(0.2) - 0.035, Y(0.2) + 0.035, px - 0.034, px + 0.006, [23, 25, 29], 0.85, 0.008)
          }

          // between two cars: the dark gangway with its folds
          if (!tail) {
            const gz0 = z1
            const gz1 = z1 + CAR_GAP
            tface({ pts: [[xl + 0.1, Y(0.05), gz0], [xl + 0.1, Y(0.92), gz0], [xl + 0.1, Y(0.92), gz1], [xl + 0.1, Y(0.05), gz1]], fill: [29, 33, 39], k: kk })
            for (const f of [0.25, 0.5, 0.75]) tface({ pts: [[xl + 0.095, Y(0.05), gz0 + CAR_GAP * f - 0.015], [xl + 0.095, Y(0.92), gz0 + CAR_GAP * f - 0.015], [xl + 0.095, Y(0.92), gz0 + CAR_GAP * f + 0.015], [xl + 0.095, Y(0.05), gz0 + CAR_GAP * f + 0.015]], fill: [48, 54, 62], k: kk })
          }
          // the dark underframe, seen below the base stripe where the platform edge does not hide it
          tface({ pts: [[xl + 0.15, 0.3, Z(xFront)], [xl + 0.15, BY, Z(xFront)], [xl + 0.15, BY, Z(xRear)], [xl + 0.15, 0.3, Z(xRear)]], fill: [24, 27, 32], k: kk })

          if (tail) tface({ pts: [[xl, BY, z1 - NOSE], [T - CAP_HW, BY, z1], [T - CAP_HW, CAP_TOP, z1 - RAKE], [xl, WALL_TOP, z1 - NOSE]], fill: YEL, k: 0.7 * kk })
          if (head) {
            const fz = (y: number) => z0 + (RAKE * clamp01((y - BY) / H))
            // the nose: the side turns in to the narrower flat front
            tface({ pts: [[xl, BY, z0 + NOSE], [T - CAP_HW, BY, z0], [T - CAP_HW, CAP_TOP, fz(CAP_TOP)], [xl, WALL_TOP, z0 + NOSE]], fill: YEL, k: 0.7 * kk })
            // the flat front, yellow
            tface({ pts: [[T - CAP_HW, BY, z0], [T + CAP_HW, BY, z0], [T + CAP_HW, CAP_TOP, fz(CAP_TOP)], [T - CAP_HW, CAP_TOP, fz(CAP_TOP)]], fill: YEL, k: 0.66 * kk })
            // the huge black windscreen unit with its darker glass, two reflections, the driver's pane and the destination display
            const yb = BY + 0.115 * K
            const yt = BY + (0.38 - 0.013) * K
            const hw = CAP_HW - 0.007 * K
            const hwt = hw * 0.975
            const zy = (y: number) => fz(y) - 0.012
            tface({ pts: [[T - hw, yb, zy(yb)], [T + hw, yb, zy(yb)], [T + hwt, yt, zy(yt)], [T - hwt, yt, zy(yt)]], fill: BLACK, k: kk })
            const iw = hw - 0.057
            const iy0 = yb + 0.05
            const iy1 = yt - 0.05
            tface({ pts: [[T - iw, iy0, zy(iy0) - 0.004], [T + iw, iy0, zy(iy0) - 0.004], [T + iw * 0.975, iy1, zy(iy1) - 0.004], [T - iw * 0.975, iy1, zy(iy1) - 0.004]], fill: INK, k: kk })
            const gx = T - hw * 0.3
            const gy0 = yb + 0.25
            const gy1 = yt - 0.5
            tface({ pts: [[gx - 0.29, gy0, zy(gy0) - 0.008], [gx + 0.29, gy0, zy(gy0) - 0.008], [gx + 0.16, gy1, zy(gy1) - 0.008], [gx - 0.16, gy1, zy(gy1) - 0.008]], fill: [27, 40, 51], k: kk })
            const gx2 = T - hw * 0.52
            tface({ pts: [[gx2 - 0.07, gy0, zy(gy0) - 0.008], [gx2 + 0.07, gy0, zy(gy0) - 0.008], [gx2 + 0.04, gy1, zy(gy1) - 0.008], [gx2 - 0.04, gy1, zy(gy1) - 0.008]], fill: [27, 40, 51], k: kk })
            const sweep = T - 0.5 + 0.3 * Math.sin(s.t * 0.7)
            tface({ pts: [[sweep, yb + 0.1, zy(yb) - 0.012], [sweep + 0.5, yb + 0.1, zy(yb) - 0.012], [sweep + 0.95, iy1 - 0.1, zy(iy1) - 0.012], [sweep + 0.45, iy1 - 0.1, zy(iy1) - 0.012]], fill: [120, 150, 190], k: 1, glow: 1, alpha: 0.08 * kk })
            const px = T + hw * 0.62
            tface({ pts: [[px - 0.02, yb + 0.06, zy(yb) - 0.01], [px + 0.02, yb + 0.06, zy(yb) - 0.01], [px + 0.02, yt - 0.06, zy(yt) - 0.01], [px - 0.02, yt - 0.06, zy(yt) - 0.01]], fill: BLACK, k: kk })
            // destination display on top of the glass: a dark recess with amber light
            const sy = yt - 0.026 * K
            const sw = hw * 2 * 0.6
            tface({ pts: [[T - sw / 2 - 0.05, sy - 0.15, zy(sy) - 0.014], [T + sw / 2 + 0.05, sy - 0.15, zy(sy) - 0.014], [T + sw / 2 + 0.05, sy + 0.15, zy(sy) - 0.014], [T - sw / 2 - 0.05, sy + 0.15, zy(sy) - 0.014]], fill: [3, 4, 5], k: kk })
            tface({ pts: [[T - sw / 2, sy - 0.09, zy(sy) - 0.018], [T - sw / 2 + 0.22, sy - 0.09, zy(sy) - 0.018], [T - sw / 2 + 0.22, sy + 0.09, zy(sy) - 0.018], [T - sw / 2, sy + 0.09, zy(sy) - 0.018]], fill: [255, 176, 50], k: 1, glow: kk, alpha: 0.95 * kk })
            for (let d = 0; d < 5; d++) {
              const dx0 = T - sw / 2 + 0.3 + d * 0.17
              tface({ pts: [[dx0, sy - 0.07, zy(sy) - 0.018], [dx0 + 0.12, sy - 0.07, zy(sy) - 0.018], [dx0 + 0.12, sy + 0.07, zy(sy) - 0.018], [dx0, sy + 0.07, zy(sy) - 0.018]], fill: [255, 176, 50], k: 1, glow: kk, alpha: 0.75 * kk })
            }
            // the two flat white LED bars low in the glass, in their housings
            const ly = BY + (0.115 + 0.021) * K
            const lz = hw * 0.62
            for (const sg of [-1, 1]) {
              const lx = T + sg * lz
              tface({ pts: [[lx - 0.333, ly - 0.075, zy(ly) - 0.02], [lx + 0.333, ly - 0.075, zy(ly) - 0.02], [lx + 0.333, ly + 0.075, zy(ly) - 0.02], [lx - 0.333, ly + 0.075, zy(ly) - 0.02]], fill: [6, 8, 10], k: kk })
              tface({ pts: [[lx - 0.285, ly - 0.043, zy(ly) - 0.024], [lx + 0.285, ly - 0.043, zy(ly) - 0.024], [lx + 0.285, ly + 0.043, zy(ly) - 0.024], [lx - 0.285, ly + 0.043, zy(ly) - 0.024]], fill: [255, 255, 255], k: 1, glow: kk, alpha: 1 })
            }
            // marker light at the driver's corner
            tface({ pts: [[T + hw * 0.88 - 0.045, ly - 0.045, zy(ly) - 0.02], [T + hw * 0.88 + 0.045, ly - 0.045, zy(ly) - 0.02], [T + hw * 0.88 + 0.045, ly + 0.045, zy(ly) - 0.02], [T + hw * 0.88 - 0.045, ly + 0.045, zy(ly) - 0.02]], fill: [233, 237, 242], k: 1, glow: kk, alpha: 0.9 })
            // the white plate with BERLIN and the plate with the car number, on the yellow panel under the glass
            const py = BY + 0.077 * K
            for (const [cxp, fillp] of [[T - 0.078 * K, [241, 243, 245]], [T + 0.078 * K, [230, 233, 237]]] as [number, RGB][]) {
              tface({ pts: [[cxp - 0.25, py - 0.085, fz(py) - 0.012], [cxp + 0.25, py - 0.085, fz(py) - 0.012], [cxp + 0.25, py + 0.085, fz(py) - 0.012], [cxp - 0.25, py + 0.085, fz(py) - 0.012]], fill: fillp, k: 0.85 * kk })
            }
            tface({ pts: [[T - 0.078 * K - 0.14, py - 0.045, fz(py) - 0.014], [T - 0.078 * K + 0.14, py - 0.045, fz(py) - 0.014], [T - 0.078 * K + 0.14, py + 0.045, fz(py) - 0.014], [T - 0.078 * K - 0.14, py + 0.045, fz(py) - 0.014]], fill: [21, 24, 28], k: kk })
            for (let d = 0; d < 4; d++) {
              const dx = T + 0.078 * K - 0.19 + d * 0.095
              tface({ pts: [[dx, py - 0.04, fz(py) - 0.014], [dx + 0.055, py - 0.04, fz(py) - 0.014], [dx + 0.055, py + 0.04, fz(py) - 0.014], [dx, py + 0.04, fz(py) - 0.014]], fill: [21, 24, 28], k: kk })
            }
            // below the front: the dark underfloor, bumper ears, apron and the Scharfenberg coupler between them
            tface({ pts: [[T - 1.1, 0.3, z0 - 0.02], [T + 1.1, 0.3, z0 - 0.02], [T + 1.1, BY - 0.26, z0 - 0.02], [T - 1.1, BY - 0.26, z0 - 0.02]], fill: [20, 23, 27], k: kk })
            tface({ pts: [[T - 1.06, BY - 0.28, z0 - 0.04], [T + 1.06, BY - 0.28, z0 - 0.04], [T + 1.06, BY + 0.16, z0 - 0.04], [T - 1.06, BY + 0.16, z0 - 0.04]], fill: [35, 39, 45], k: kk })
            tface({ pts: [[T - 0.37, BY - 0.28, z0 - 0.09], [T + 0.37, BY - 0.28, z0 - 0.09], [T + 0.37, BY + 0.22, z0 - 0.09], [T - 0.37, BY + 0.22, z0 - 0.09]], fill: [24, 27, 32], k: kk })
            for (const sg of [-1, 1]) {
              const ex = T + sg * 0.86
              tface({ pts: [[ex - 0.285, BY - 0.34, z0 - 0.1], [ex + 0.285, BY - 0.34, z0 - 0.1], [ex + 0.285, BY + 0.29, z0 - 0.1], [ex - 0.285, BY + 0.29, z0 - 0.1]], fill: [85, 91, 99], k: kk })
              tface({ pts: [[ex - 0.26, BY + 0.27, z0 - 0.11], [ex + 0.26, BY + 0.27, z0 - 0.11], [ex + 0.26, BY + 0.34, z0 - 0.11], [ex - 0.26, BY + 0.34, z0 - 0.11]], fill: [47, 52, 58], k: kk })
              tface({ pts: [[ex - 0.23, BY + 0.34, z0 - 0.12], [ex + 0.23, BY + 0.34, z0 - 0.12], [ex + 0.23, BY + 0.37, z0 - 0.12], [ex - 0.23, BY + 0.37, z0 - 0.12]], fill: [138, 145, 154], k: kk })
              for (const dy of [-0.2, -0.1]) tface({ pts: [[ex - 0.2, BY + dy, z0 - 0.115], [ex + 0.2, BY + dy, z0 - 0.115], [ex + 0.2, BY + dy + 0.055, z0 - 0.115], [ex - 0.2, BY + dy + 0.055, z0 - 0.115]], fill: [43, 48, 54], k: kk })
            }
            tface({ pts: [[T - 0.2, BY - 0.1, z0 - 0.22], [T + 0.2, BY - 0.1, z0 - 0.22], [T + 0.2, BY + 0.06, z0 - 0.22], [T - 0.2, BY + 0.06, z0 - 0.22]], fill: [126, 134, 145], k: kk })
            const disc = (r: number, z: number, fill: RGB) => {
              const pts: V3[] = []
              for (let a = 0; a < 14; a++) pts.push([T + Math.cos((a / 14) * Math.PI * 2) * r, BY - 0.03 + Math.sin((a / 14) * Math.PI * 2) * r, z])
              tface({ pts, fill, k: kk })
            }
            disc(0.17, z0 - 0.3, [154, 161, 171])
            disc(0.09, z0 - 0.32, [12, 14, 17])
            for (const sg of [-1, 1]) tface({ pts: [[T + sg * 0.33 - 0.025, BY - 0.24, z0 - 0.26], [T + sg * 0.33 + 0.025, BY - 0.24, z0 - 0.26], [T + sg * 0.33 + 0.025, BY - 0.08, z0 - 0.26], [T + sg * 0.33 - 0.025, BY - 0.08, z0 - 0.26]], fill: [200, 50, 31], k: kk })
            tface({ pts: [[T + 0.36, BY + 0.2, z0 - 0.2], [T + 0.45, BY + 0.2, z0 - 0.2], [T + 0.45, BY + 0.31, z0 - 0.2], [T + 0.36, BY + 0.31, z0 - 0.2]], fill: [200, 50, 31], k: kk })
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
    const dsp = (cam.f * A_W) / (wide ? rw * 0.4 : rw * 0.58)
    const ty = ry + rh * (wide ? 0.27 : 0.25)
    const ccy = ((baseCy - ty) * dsp) / cam.f
    const ycy = ccy * cam.cp + dsp * cam.sp
    const ycz = dsp * cam.cp - ccy * cam.sp
    // the screen hangs 0.5 m beside the line of sight along the platform, so it is seen almost straight on (as in the photo);
    // yaw space is the world turned like the camera (before the camera looks up), so the x position follows from the yaw
    const WX = 0.5
    const ycx = (WX - ycz * cam.sin) / cam.cos
    const yc: V3 = [ycx, ycy, ycz]
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
    // the screen faces along the platform, straight at whoever stands there (in yaw space that is the opposite of the camera's yaw);
    // the second screen sits back to back with it and looks the other way, so from here only its back is seen
    const azA = -Math.atan2(cam.sin, cam.cos)
    const frA = frame(yc, azA)
    // the rear unit: 0.68 behind the first, a little to the side so that its back shows next to it, looking the other way
    const frB = frame(at(frA, 0.5, 0, -0.68), azA + Math.PI)
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
    const top = at(frA, 0.25, hh + 0.02, -0.34)
    const stemFr: Fr = { c: top, r: [Math.cos(azA), 0, -Math.sin(azA)], u: [0, 1, 0], n: [-Math.sin(azA), 0, -Math.cos(azA)] }
    box(stemFr, -0.08, 0.08, 0, Math.max(0.2, stemTop - stemFr.c[1]), -0.08, 0.08, [92, 98, 106], 0.9)
    const unit = (fr: Fr, front: boolean) => {
      box(fr, -hw, hw, -hh - 0.04, hh + 0.04, -0.34, 0, HOUSE, 0.95)
      if (front) drawTex(fr)
      else {
        // the back of the screen that looks the other way: a darker rear panel with cooling slots, a plate and the cable gland
        const bk = -0.345
        face({ pts: [at(fr, -hw + 0.1, -hh + 0.06, bk), at(fr, hw - 0.1, -hh + 0.06, bk), at(fr, hw - 0.1, hh - 0.06, bk), at(fr, -hw + 0.1, hh - 0.06, bk)].map(yw), fill: [92, 98, 106], k: 0.55 })
        for (let b = -hh + 0.14; b < hh - 0.1; b += 0.09) {
          face({ pts: [at(fr, -hw + 0.22, b, bk - 0.003), at(fr, hw - 0.22, b, bk - 0.003), at(fr, hw - 0.22, b + 0.03, bk - 0.003), at(fr, -hw + 0.22, b + 0.03, bk - 0.003)].map(yw), fill: [48, 52, 58], k: 0.6 })
        }
        face({ pts: [at(fr, hw - 0.5, hh - 0.3, bk - 0.004), at(fr, hw - 0.2, hh - 0.3, bk - 0.004), at(fr, hw - 0.2, hh - 0.16, bk - 0.004), at(fr, hw - 0.5, hh - 0.16, bk - 0.004)].map(yw), fill: [200, 204, 208], k: 0.6 })
      }
      // the grey slab below the screen, with the vent slots on its underside
      box(fr, -hw - 0.02, hw + 0.04, -hh - 0.22, -hh - 0.04, -0.46, 0.05, SLAB, 1)
      const bn = -hh - 0.22
      const bp = at(fr, 0, bn, -0.2)
      if (fr.u[0] * bp[0] + fr.u[1] * bp[1] + fr.u[2] * bp[2] > 0) {
        for (let a = -hw + 0.12; a < hw - 0.1; a += 0.14) {
          face({ pts: [at(fr, a, bn, -0.4), at(fr, a + 0.06, bn, -0.4), at(fr, a + 0.06, bn, -0.06), at(fr, a, bn, -0.06)].map(yw), fill: [60, 64, 70], k: 0.9 })
        }
      }
    }
    unit(frB, false)
    unit(frA, true)

    // the blue light of the screens on the ceiling and the platform
    for (const fr of [frA]) {
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
    for (const dx of [-0.674, 0.674]) {
      light([T + dx, 1.8, zf - 0.1], 2.1, [255, 250, 235], 0.85 * k)
      light([T + dx, 1.8, zf - 0.1], 0.7, [255, 255, 255], 1 * k)
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
