import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin BVG tram "Flexity Berlin" (Bombardier / Alstom GT6, photos "Straßenbahn Berlin / Zug 1": 4027, 8018, 9010): signal yellow
 * low-floor car, 2.40 m wide, white roof cap that runs down over the top of the windscreen, a big black-framed windscreen with the
 * destination display at its top, a black light band below it (slim LED head lights) over a yellow bulging chin with the
 * "be Berlin" plate and the car number, black mirror arms at the corners. Sides: continuous dark tinted windows between yellow
 * pillars, double doors with a glass leaf each, skirts with wheel arches, black accordion bellows between the modules and a single
 * arm pantograph on the middle module. Both ends are driver's cabs.
 */

const BLACK = '#0f1113'
const RUBBER = '#17191c'
const FRONT_GLASS = '#24364a'
const WHITE = '#eceef0'
const DOOR_W = 0.17

// face layout (heights in design units above the car underside)
const BAND_Y0 = 0.13
const BAND_H = 0.048
const WS_Y0 = BAND_Y0 + BAND_H + 0.004
const CAP_H = 0.026

/** Top of the windscreen frame */
const wsTop = (m: FrontMetrics) => m.capTop - CAP_H + 0.002

export const tramBerlin1Sign = (m: FrontMetrics) => ({ y: wsTop(m) - 0.03, w: Math.min(0.17, 2 * m.capHW * 0.66), h: 0.027, x: 0.0127 })
export const tramBerlin1Lamp = (m: FrontMetrics) => ({ y: BAND_Y0 + BAND_H / 2, z: m.capHW * 0.72, w: 0.05, h: 0.013 })

/** A thin bar from (x0, y0) to (x1, y1) at height z: used for the pantograph arms. */
function bar(x0: number, y0: number, x1: number, y1: number, t: number, w: number, z: number, hex: string): THREE.BufferGeometry {
  const L = Math.hypot(x1 - x0, y1 - y0)
  return box(t, L, w, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(-(x1 - x0), y1 - y0))
}

/**
 * The white roof cap on the top of the end face: a plate whose upper edge follows the rounded roof corners of the face (half width
 * `hw`, corner radius `rr`, top at `top`), `h` high, standing `depth` proud of the plane x.
 */
function roofCap(hw: number, rr: number, top: number, h: number, x: number, depth: number, hex: string): THREE.BufferGeometry {
  const edge = (y: number) => (y > top - rr ? hw - rr + Math.sqrt(Math.max(0, rr * rr - (y - (top - rr)) ** 2)) : hw) - 0.002
  const ys: number[] = [top - h]
  for (let k = 0; k <= 6; k++) ys.push(Math.max(top - h, top - rr) + ((top - Math.max(top - h, top - rr)) * k) / 6)
  const sh = new THREE.Shape()
  sh.moveTo(-edge(ys[0]), ys[0])
  sh.lineTo(edge(ys[0]), ys[0])
  for (const y of ys.slice(1)) sh.lineTo(edge(y), y)
  for (const y of ys.slice(1).reverse()) sh.lineTo(-edge(y), y)
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false })
  g.rotateY(Math.PI / 2)
  g.translate(x, 0, 0)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const hw = c.capHW
  const T = c.capTop
  const lamp = tramBerlin1Lamp(m)
  const sign = tramBerlin1Sign(m)
  const y1 = wsTop(m)
  const hS = y1 - WS_Y0
  const cy = (y1 + WS_Y0) / 2
  const sw = 2 * hw - 0.016
  const parts: THREE.BufferGeometry[] = []

  // yellow chin: a bulge over the bumper with a dark rubber strip and a hinged cover in front of the coupler
  parts.push(frontPlate(2 * hw * 0.985, BAND_Y0 - 0.012, 0.03, x - 0.001, (BAND_Y0 + 0.012) / 2, 0, 0.0095, c.body))
  parts.push(frontPlate(2 * hw * 0.93, 0.008, 0.003, x + 0.0085, 0.062, 0, 0.0014, '#c9970a'))
  parts.push(box(0.008, 0.016, 2 * hw * 0.985, x + 0.004, 0.026, 0, '#1a1c1f'))
  parts.push(frontPlate(0.085, 0.036, 0.008, x + 0.0085, 0.088, 0, 0.0016, '#2b2e33'))
  parts.push(cylX(0.009, 0.012, x + 0.015, 0.032, 0, '#5d646d', 8))
  parts.push(box(0.016, 0.02, 2 * hw * 0.95, x - 0.002, 0.008, 0, '#16181b'))
  // "be Berlin" plate (red with a white strip) on the right of the chin, car number on the left
  parts.push(frontPlate(0.062, 0.016, 0.003, x + 0.0098, 0.1, hw * 0.52, 0.0016, '#d3202a'))
  for (let k = 0; k < 4; k++) parts.push(box(0.0012, 0.008, 0.009, x + 0.0118, 0.1, hw * 0.52 - 0.021 + k * 0.014, '#f2f2f0'))
  for (let k = 0; k < 4; k++) parts.push(box(0.0012, 0.015, 0.0042, x + 0.0112, 0.092, -hw * 0.5 + (k - 1.5) * 0.011, '#15171a'))

  // black light band with the head light housings and small indicator lights
  parts.push(frontPlate(2 * hw - 0.006, BAND_H, 0.014, x, BAND_Y0 + BAND_H / 2, 0, 0.0078, BLACK))
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.012, lamp.h + 0.01, 0.005, x + 0.0078, lamp.y, sz * lamp.z, 0.0012, '#07080a'))
    for (const dz of [0.052, 0.064]) parts.push(cylX(0.0032, 0.003, x + 0.0098, lamp.y, sz * (lamp.z - dz), '#c98a12', 6))
    parts.push(box(0.003, 0.009, 0.016, x + 0.0092, lamp.y, sz * (lamp.z + 0.04), '#3a3f46'))
  }

  // windscreen: black frame, tinted glass, reflections, two wipers parked at the lower edge, dark recess for the display
  parts.push(frontPlate(sw, hS, 0.03, x, cy, 0, 0.0074, BLACK))
  parts.push(frontPlate(sw - 0.014, hS - 0.014, 0.024, x + 0.0074, cy, 0, 0.0022, FRONT_GLASS))
  parts.push(frontPlate(sw * 0.14, hS - 0.05, 0.004, x + 0.0098, cy - 0.01, -sw * 0.18, 0.0006, '#2c4054'))
  parts.push(frontPlate(sw * 0.07, hS - 0.05, 0.004, x + 0.0098, cy - 0.01, -sw * 0.02, 0.0006, '#2c4054'))
  const a = 1.18
  for (const zp of [-0.075, 0.05]) {
    const L = 0.095
    parts.push(box(0.0025, L, 0.0045, x + 0.0102, WS_Y0 + 0.02 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.01, x + 0.0098, sign.y, 0, 0.0016, '#050607'))
  // pale thin bar over the display (rain gutter)
  parts.push(box(0.004, 0.004, sw - 0.03, x + 0.0076, y1 - 0.004, 0, '#2a2e33'))

  // white roof cap that comes down over the top of the windscreen
  parts.push(roofCap(hw, c.roofR * (hw / (c.w / 2)), T, CAP_H, x + 0.0004, 0.0048, WHITE))

  // mirror arms with black mirror housings at the windscreen corners
  for (const sz of [-1, 1]) {
    parts.push(box(0.012, 0.008, 0.05, x - 0.03, 0.285, sz * (hw + 0.015), BLACK))
    parts.push(box(0.012, 0.012, 0.014, x - 0.03, 0.285, sz * (hw + 0.002), BLACK))
    parts.push(box(0.008, 0.07, 0.024, x - 0.036, 0.258, sz * (hw + 0.044), BLACK))
    parts.push(box(0.0012, 0.058, 0.018, x - 0.0316, 0.258, sz * (hw + 0.044), '#3a444e'))
  }
  // central roof marker light
  parts.push(box(0.004, 0.006, 0.026, x + 0.0004, T - 0.004, 0, '#f4f0e2'))
  return rakeParts(parts, c.rake, c.h)
}

/** Black accordion bellows over the gap behind a head / mid car (the car behind it only adds the generic dark gangway box), with white roof bridge. */
function bellows(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const gap = c.spec.gap
  const x0 = -c.len / 2 - gap
  const hh = c.h * 0.93
  const ww = c.w * 0.95
  out.push(frontPlate(ww, hh, 0.07, x0, hh / 2 + 0.006, 0, gap, '#15171a'))
  // folds
  const n = 5
  for (let k = 0; k < n; k++) out.push(frontPlate(ww + 0.006, hh + 0.006, 0.073, x0 + gap * ((k + 0.5) / n) - 0.004, hh / 2 + 0.006, 0, 0.008, '#222529'))
  // roof bridge: pale grey plate over the folds
  out.push(box(gap + 0.004, 0.006, c.w * 0.4, x0 + gap / 2, hh + 0.006, 0, '#b9bfc6'))
  return out
}

/**
 * Doors and windows along a car (x-intervals, car frame). The shell has none of its own (see the style): a head car has the
 * double door right behind the cab and tall windows behind it, the middle module a door in the middle with a window each side.
 */
function sideLayout(c: CarCtx) {
  const doors: [number, number][] = []
  const wins: [number, number][] = []
  const hl = c.len / 2
  const nose = c.nF > 0 && c.nR === 0 ? 1 : c.nR > 0 && c.nF === 0 ? -1 : 0
  if (nose === 0) {
    doors.push([-DOOR_W / 2, DOOR_W / 2])
    const wMax = hl - 0.05 - (DOOR_W / 2 + 0.035)
    for (const sg of [-1, 1]) wins.push([sg * (DOOR_W / 2 + 0.035), sg * (DOOR_W / 2 + 0.035 + wMax)].sort((p, q) => p - q) as [number, number])
    return { doors, wins }
  }
  // measured towards the nose (u), then turned into x
  const n = nose > 0 ? c.nF : c.nR
  const dEnd = hl - n - 0.04
  const door: [number, number] = [dEnd - DOOR_W, dEnd]
  const toX = (u0: number, u1: number): [number, number] => (nose > 0 ? [u0, u1] : [-u1, -u0])
  doors.push(toX(door[0], door[1]))
  let u1 = door[0] - 0.035
  while (u1 - 0.2 > -hl + 0.06) {
    wins.push(toX(u1 - 0.2, u1))
    u1 -= 0.235
  }
  return { doors, wins }
}

export const tramBerlin1: ModelDef = {
  sign: tramBerlin1Sign,
  lamp: tramBerlin1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const hl = c.len / 2
    const xa = c.nR > 0 ? -hl + c.nR : -hl
    const xb = c.nF > 0 ? hl - c.nF : hl
    out.push(box(c.len * 0.84, 0.045, c.w * 0.74, 0, -0.025, 0, '#1a1e23'))
    // equipment under the floor: boxes, air tanks, resistor grille
    out.push(box(c.len * 0.14, 0.04, c.w * 0.54, -c.len * 0.1, -0.034, 0, '#2d343b'))
    out.push(box(c.len * 0.1, 0.036, c.w * 0.46, c.len * 0.12, -0.032, 0, '#262c33'))
    out.push(cylX(0.015, c.len * 0.14, 0, -0.046, 0.06, '#3a4149', 8))
    // skirt panels in body yellow with wheel arches round the bogies
    const arches = [-c.len * 0.3, c.len * 0.3]
    const AR = 0.14
    const cuts = [xa, ...arches.flatMap((bx) => [bx - AR, bx + AR]), xb]
    for (let i = 0; i < cuts.length; i += 2) {
      const s0 = cuts[i]
      const s1 = cuts[i + 1]
      if (s1 - s0 < 0.02) continue
      for (const sz of [-1, 1]) {
        out.push(box(s1 - s0, 0.036, 0.006, (s0 + s1) / 2, -0.016, sz * (c.w / 2 - 0.003), c.body))
        out.push(box(s1 - s0, 0.006, 0.0065, (s0 + s1) / 2, -0.034, sz * (c.w / 2 - 0.003), '#1a1d21'))
      }
    }
    // bogies: frame, motor, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const bx of arches) {
      out.push(box(0.26, 0.02, 0.18, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.04, 0.09, bx, -0.032, 0, '#2b3137'))
      for (const dx of [-0.085, 0.085]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.04, 0.016, bx + dx, -0.03, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.02, 0.02, bx + dx, -0.03, sz * 0.085, '#2a3036', 8))
        }
      }
      for (const sz of [-1, 1]) out.push(box(0.26, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.4
    const wy1 = c.h * 0.84
    const wyc = (wy0 + wy1) / 2
    const { doors, wins } = sideLayout(c)
    for (const s of [-1, 1]) {
      // windows: black rubber rim, tinted glass pane proud of the wall
      for (const [x0, x1] of wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, wyc, s * (zw + 0.0015), RUBBER))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, wyc, s * (zw + 0.002), GLASS))
      }
      // doors: black frame, two leaves with tall glass over a yellow lower panel, seal between them, push button, pictograms
      for (const [x0, x1] of doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        const dy0 = 0.03
        const dy1 = wy1 + 0.004
        const gy0 = 0.1
        out.push(box(dw + 0.012, dy1 - dy0 + 0.01, 0.007, cx, (dy0 + dy1) / 2, s * (zw + 0.002), RUBBER))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0015)
          out.push(box(dw / 2 - 0.01, 0.07 - 0.004, 0.0085, lx, (dy0 + gy0) / 2 + 0.002, s * (zw + 0.0028), c.body))
          out.push(box(dw / 2 - 0.01, dy1 - gy0, 0.0088, lx, (gy0 + dy1) / 2, s * (zw + 0.003), '#101316'))
          out.push(box(dw / 2 - 0.02, dy1 - gy0 - 0.018, 0.0098, lx, (gy0 + dy1) / 2, s * (zw + 0.0036), GLASS))
        }
        out.push(box(0.004, dy1 - dy0, 0.0105, cx, (dy0 + dy1) / 2, s * (zw + 0.004), '#07080a'))
        out.push(box(0.01, 0.014, 0.007, x1 + 0.014, c.h * 0.42, s * (zw + 0.003), '#3f9a4b'))
        // wheelchair and pram pictograms on the pillar beside the door
        out.push(box(0.014, 0.014, 0.0042, x0 - 0.016, c.h * 0.5, s * (zw + 0.0028), '#f2f2f0'))
        out.push(box(0.014, 0.014, 0.0042, x0 - 0.016, c.h * 0.43, s * (zw + 0.0028), '#f2f2f0'))
      }
    }

    // driver's side window on the flank of each nose, behind the mirror
    for (const [n, sg] of [[c.nF, 1], [c.nR, -1]] as const) {
      if (n <= 0) continue
      const x0 = c.len / 2 - 0.12
      const x1 = c.len / 2 - 0.058
      for (const s of [-1, 1]) {
        const cx = sg * (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, wyc, s * (zw * 0.985 + 0.001), RUBBER))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, wyc, s * (zw * 0.985 + 0.0018), GLASS))
      }
    }

    // roof: air conditioning units and ducts (white roof, light grey units)
    const ac = (px: number, len: number) => {
      out.push(box(len, 0.012, 0.09, px, c.h + 0.002, 0, '#cfd4d9'))
      for (const k of [-1, 0, 1]) out.push(box(len * 0.8, 0.004, 0.012, px, c.h + 0.009, k * 0.028, '#9aa1a9'))
    }
    if (c.role === 'mid') {
      ac(-c.len * 0.3, c.len * 0.22)
      // single arm pantograph: base frame on insulators, lower arm, upper arm and a wide collector strip (sprung up under the wire)
      const px = c.len * 0.12
      const py = c.h + 0.003
      out.push(box(0.17, 0.008, 0.12, px, py, 0, '#2a2f35'))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(0.014, 0.014, 0.014, px + sx * 0.06, py + 0.009, sz * 0.045, '#d8d2c2'))
      const jx = px + 0.07
      const jy = c.h + 0.095
      const tx = px - 0.03
      const ty = c.h + 0.176
      out.push(bar(px - 0.045, py + 0.012, jx, jy, 0.011, 0.012, 0.0, '#9aa1aa'))
      out.push(bar(px - 0.045, py + 0.012, jx, jy, 0.008, 0.008, 0.016, '#6c737c'))
      out.push(bar(jx, jy, tx, ty, 0.01, 0.012, 0.0, '#9aa1aa'))
      out.push(bar(jx, jy, tx, ty, 0.007, 0.008, 0.016, '#6c737c'))
      out.push(box(0.014, 0.01, 0.2, tx, ty + 0.004, 0, '#1b1f24'))
      out.push(box(0.008, 0.006, 0.2, tx, ty + 0.012, 0, '#3a3f46'))
      out.push(box(0.03, 0.006, 0.026, tx, ty + 0.002, 0.096, '#8d949d'))
    } else {
      ac(-c.len * 0.12, c.len * 0.34)
      if (c.nF > 0 || c.nR > 0) {
        const sgn = c.nF > 0 ? 1 : -1
        // shark fin antenna and a small round one
        out.push(box(0.05, 0.016, 0.012, sgn * (c.len / 2 - 0.4), c.h + 0.01, 0, '#2e3238'))
        out.push(cylZ(0.005, 0.005, sgn * (c.len / 2 - 0.3), c.h + 0.007, 0.02, '#aab1b9', 8))
      }
    }
    // thin rain gutter lines under the roof cap (grey strip)
    for (const sz of [-1, 1]) {
      const x0 = c.nR > 0 ? -c.len / 2 + c.nR : -c.len / 2 + 0.002
      const x1 = c.nF > 0 ? c.len / 2 - c.nF : c.len / 2 - 0.002
      out.push(box(x1 - x0, 0.004, 0.003, (x0 + x1) / 2, c.h * 0.845, sz * (zw + 0.0005), '#bfc5cb'))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    // the articulation bellows close the gap behind the car (between this car and the one behind it)
    if ((c.role === 'mid' || c.role === 'head') && c.nR === 0) out.push(...bellows(c))
    return out
  },
}
