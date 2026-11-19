import type * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich tram, Stadler Variobahn (MVG class S, cars 2301 ff.; photos "Straßenbahn München / Zug 3": 2317, 2312, 2308 ...):
 * 2.30 m wide, low floor, MVG blue all over with a light grey stripe above the dark window band. The blunt front has one huge
 * black windscreen (nearly the full width, destination display behind the glass at the top), under it a blue panel with the
 * Munich shield and the car number, tall black light housings at both corners (white head light over an amber indicator, a red
 * strip on top) and a rounded blue chin down to the rail. Big mirrors on short arms, one parked wiper. Sides: double doors of
 * dark glass in black frames, a continuous dark window band, blue skirts to the rail with the wheels in dark arches.
 * One single-arm pantograph on the middle car, grey air-conditioning units on the roof. Both ends are driver's cabs.
 */

const BLACK = '#0b0d10'
const RUBBER = '#14171b'
const FRONT_GLASS = '#1c2834'
const DOOR_GLASS = '#26364a'
const GREY = '#aab2ba'
const STRIPE = '#dde2e6'
const SKIRT_Y = -0.045 // lower edge of the blue skirts (rail head is at y = -0.07)

const MIRROR_Y = 0.19

/** The windscreen: centre height, height, width. Top sits just under the top of the end face. */
function screen(m: FrontMetrics) {
  const y1 = m.capTop - 0.02
  const y0 = 0.108
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w: 2 * m.capHW - 0.016 }
}

export const tramMuc3Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.03, w: s.w * 0.74, h: 0.034, x: 0.0122 }
}
export const tramMuc3Lamp = (m: FrontMetrics) => ({ y: 0.088, z: m.capHW - 0.026, w: 0.022, h: 0.022, round: true })

/** A tilted bar between two points in the x-y plane (z = across the car). */
function bar(x0: number, y0: number, x1: number, y1: number, t: number, d: number, z: number, hex: string): THREE.BufferGeometry {
  const L = Math.hypot(x1 - x0, y1 - y0)
  return box(L, t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = tramMuc3Lamp(m)
  const sign = tramMuc3Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // windscreen: black frame with the pillars, dark glass, the display recess behind the top of the glass
  parts.push(frontPlate(s.w, s.h, 0.028, x, s.cy, 0, 0.006, BLACK))
  parts.push(frontPlate(s.w - 0.018, s.h - 0.018, 0.022, x + 0.006, s.cy, 0, 0.0025, FRONT_GLASS))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0085, sign.y, 0, 0.0016, '#040506'))
  // two faint reflections across the glass
  parts.push(box(0.0008, s.h * 0.62, 0.014, x + 0.0089, s.cy - 0.016, -0.055, '#2f4152', 0, 0.38))
  parts.push(box(0.0008, s.h * 0.5, 0.008, x + 0.0089, s.cy - 0.022, -0.02, '#2f4152', 0, 0.38))
  // one wiper parked low across the glass, pivot on the left of the centre
  const wa = 1.25
  const wl = 0.15
  parts.push(box(0.0025, wl, 0.0045, x + 0.0098, s.y0 + 0.014 + (wl / 2) * Math.cos(wa), -0.075 + (wl / 2) * Math.sin(wa), '#030405', 0, wa))
  parts.push(box(0.004, 0.008, 0.01, x + 0.0098, s.y0 + 0.012, -0.075, '#1b1e22'))

  // big mirrors on short arms at both pillars
  for (const sz of [-1, 1]) {
    parts.push(box(0.008, 0.008, 0.026, x - 0.012, MIRROR_Y, sz * (c.capHW + 0.01), '#101316'))
    parts.push(box(0.014, 0.05, 0.012, x - 0.008, MIRROR_Y - 0.006, sz * (c.capHW + 0.026), '#0e1114'))
    parts.push(box(0.0016, 0.044, 0.0095, x - 0.0005, MIRROR_Y - 0.006, sz * (c.capHW + 0.026), '#2a3541'))
  }

  // light housings: tall black block, white head light over the amber indicator, red strip on top
  for (const sz of [-1, 1]) {
    const lz = sz * lamp.z
    parts.push(frontPlate(0.034, 0.104, 0.012, x + 0.0035, 0.062, lz, 0.0055, '#0d0f12'))
    parts.push(cylX(0.0145, 0.003, x + 0.0088, lamp.y, lz, '#1b1e22', 14))
    parts.push(cylX(0.0095, 0.003, x + 0.0092, 0.05, lz, '#e49a1d', 12))
    parts.push(cylX(0.0125, 0.0014, x + 0.0088, 0.05, lz, '#1b1e22', 12))
    parts.push(box(0.004, 0.0055, 0.036, x + 0.0066, 0.118, lz, '#d8231f'))
    // the clear lens of the light is separate (white lamp mesh), a small corner marker light beside it
    parts.push(box(0.003, 0.012, 0.004, x + 0.0066, 0.03, sz * (c.capHW - 0.004), '#e0e3e6'))
  }

  // Munich shield between the light housings
  parts.push(frontPlate(0.024, 0.029, 0.005, x + 0.003, 0.074, 0, 0.0018, '#eef0f3'))
  parts.push(frontPlate(0.017, 0.021, 0.004, x + 0.0046, 0.074, 0, 0.0012, '#1a1d22'))
  parts.push(frontPlate(0.011, 0.014, 0.003, x + 0.0058, 0.075, 0, 0.0008, '#d9a31a'))
  // car number left and right of the shield (four small white strokes each)
  for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) parts.push(box(0.0012, 0.011, 0.0035, x + 0.0036, 0.078, sz * (0.047 + k * 0.0065), '#f1f3f5'))

  // chin: the blue front goes on down to the rail, black rubber bumper strip, coupler flap, ribbed grille
  parts.push(box(0.13, 0.05, c.capHW * 2 * 0.99, x - 0.065, -0.02, 0, c.body))
  parts.push(box(0.014, 0.013, c.capHW * 2 * 0.985, x + 0.0015, SKIRT_Y + 0.004, 0, RUBBER))
  parts.push(box(0.01, 0.02, 0.07, x + 0.002, -0.012, 0, '#20252b'))
  parts.push(cylX(0.008, 0.012, x + 0.009, -0.012, 0, '#6d757d', 8))
  for (const sz of [-1, 1]) {
    parts.push(box(0.004, 0.018, 0.05, x + 0.0016, -0.014, sz * 0.085, '#1a1e23'))
    for (const dy of [-0.007, -0.0015, 0.004]) parts.push(box(0.0016, 0.0022, 0.044, x + 0.0036, -0.014 + dy, sz * 0.085, '#3a4148'))
  }
  // light roof-edge strip above the screen
  parts.push(box(0.003, 0.004, s.w * 0.6, x - 0.001, c.capTop - 0.004, 0, '#d4dadf'))
  return rakeParts(parts, c.rake, c.h)
}

/** The three letters M V G as small bars on a side wall: centre cx, centre height cy, side s (1 = +z). Reads left to right for the viewer. */
function mvg(cx: number, cy: number, zw: number, s: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const H = 0.017
  const t = 0.0026
  const z = s * (zw + 0.0013)
  const X = (u: number) => cx + s * u
  const hex = '#f4f6f8'
  const V = (u: number, h = H, y = cy) => box(t, h, 0.0026, X(u), y, z, hex)
  const diag = (u0: number, y0: number, u1: number, y1: number) => bar(X(u0), y0, X(u1), y1, t, 0.0026, z, hex)
  // M
  out.push(V(-0.02), V(-0.0105), diag(-0.02, cy + H / 2, -0.0152, cy - 0.001), diag(-0.0105, cy + H / 2, -0.0152, cy - 0.001))
  // V
  out.push(diag(-0.003, cy + H / 2, 0.0015, cy - H / 2), diag(0.006, cy + H / 2, 0.0015, cy - H / 2))
  // G
  out.push(V(0.012), box(0.012, t, 0.0026, X(0.0178), cy + H / 2, z, hex), box(0.012, t, 0.0026, X(0.0178), cy - H / 2, z, hex))
  out.push(V(0.0237, H / 2, cy - H / 4), box(0.006, t, 0.0026, X(0.0207), cy, z, hex))
  return out
}

/** Dark bellows between two cars, built on the front end of a car that has no nose (it spans the whole gap). */
function bellows(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const gap = c.spec.gap
  const x = c.len / 2 + gap / 2
  // lower part (generic gangway box of the shell lies inside this one) and the roof cover that follows the curve of the roof
  out.push(box(gap + 0.024, c.h * 0.84, c.w * 0.86, x, c.h * 0.44, 0, '#15191e'))
  out.push(box(gap + 0.016, c.h * 0.14, c.w * 0.6, x, c.h * 0.9, 0, '#1a1f25'))
  out.push(box(gap + 0.012, 0.012, c.w * 0.4, x, c.h - 0.004, 0, '#232a31'))
  // folds: thin ribs round the bellows
  const n = 4
  for (let k = 0; k < n; k++) {
    const rx = c.len / 2 + (gap * (k + 0.5)) / n
    out.push(box(0.006, c.h * 0.86, c.w * 0.885, rx, c.h * 0.44, 0, '#262d35'))
    out.push(box(0.006, 0.016, c.w * 0.62, rx, c.h * 0.9 + 0.022, 0, '#262d35'))
  }
  // grey sealing frames on the car body at the end of the bellows
  out.push(box(0.008, c.h * 0.88, c.w * 0.9, c.len / 2 + 0.004, c.h * 0.44, 0, '#3a424b'))
  return out
}

export const tramMuc3: ModelDef = {
  sign: tramMuc3Sign,
  lamp: tramMuc3Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    // bogie centres: the end cars carry one near the cab and one behind; the middle car is a suspended module
    const bogies: number[] = []
    if (c.nF > 0) bogies.push(c.len / 2 - c.nF - 0.08, c.len / 2 - c.nF - 0.5)
    if (c.nR > 0) bogies.push(-c.len / 2 + c.nR + 0.08, -c.len / 2 + c.nR + 0.5)
    if (c.nF === 0 && c.nR === 0) bogies.push(0)
    const arch = 0.12

    // floor and equipment
    out.push(box(c.len * 0.9, 0.042, c.w * 0.82, 0, -0.022, 0, '#1d2227'))
    out.push(box(c.len * 0.14, 0.03, c.w * 0.6, -c.len * 0.18, -0.045, 0, '#2b3138'))
    out.push(box(c.len * 0.1, 0.026, c.w * 0.5, c.len * 0.2, -0.043, 0, '#262c33'))

    // blue skirts down to the rail, interrupted at the wheel arches
    const xa = c.nR > 0 ? -c.len / 2 + c.nR * 0.65 : -c.len / 2 + 0.004
    const xb = c.nF > 0 ? c.len / 2 - c.nF * 0.65 : c.len / 2 - 0.004
    const cuts = [xa, ...[...bogies].sort((p, q) => p - q).flatMap((b) => [b - arch, b + arch]), xb]
    for (const s of [-1, 1]) {
      for (let i = 0; i < cuts.length; i += 2) {
        const a = cuts[i]
        const b = cuts[i + 1]
        if (b - a < 0.01) continue
        out.push(box(b - a, -SKIRT_Y, 0.0055, (a + b) / 2, SKIRT_Y / 2, s * (zw - 0.0014), c.body))
        out.push(box(b - a, 0.008, 0.0065, (a + b) / 2, SKIRT_Y + 0.004, s * (zw - 0.0012), RUBBER))
      }
      // dark inner side of the arches (wheel house)
      for (const b of bogies) {
        out.push(box(arch * 2, 0.04, 0.003, b, -0.025, s * (zw - 0.02), '#0e1013'))
        out.push(box(arch * 2 + 0.01, 0.006, 0.0075, b, 0.001, s * (zw - 0.0016), '#0f1215'))
      }
    }

    // bogies: frame, motor, two axles with small wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const bx of bogies) {
      out.push(box(0.26, 0.018, 0.17, bx, -0.03, 0, '#13171b'))
      out.push(box(0.09, 0.034, 0.08, bx, -0.044, 0, '#2b3137'))
      for (const dx of [-0.085, 0.085]) {
        out.push(cylZ(0.007, 0.19, bx + dx, -0.034, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.036, 0.016, bx + dx, -0.034, sz * 0.085, '#4c545e', 14))
          out.push(cylZ(0.019, 0.019, bx + dx, -0.034, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.006, 0.012, bx + dx, -0.034, sz * 0.097, '#7a838d', 6))
        }
      }
      for (const sz of [-1, 1]) out.push(box(0.26, 0.012, 0.012, bx, -0.026, sz * 0.1, '#1e2328'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.16
    const wy1 = c.h * 0.72
    const wyc = (wy0 + wy1) / 2
    const lead = c.nF > 0 || c.nR > 0

    for (const s of [-1, 1] as const) {
      // side windows: black rubber rim, dark glass pane proud of the wall (night shader lights the exact glass colour)
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, wyc, s * (zw + 0.0015), BLACK))
        out.push(box(x1 - x0 - 0.004, wy1 - wy0 - 0.004, 0.008, cx, wyc, s * (zw + 0.002), GLASS))
      }
      // double doors: black frame, two glass leaves with black borders, seal between them, push buttons, door rail
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        const dy0 = SKIRT_Y + 0.012
        const dy1 = wy1 + 0.004
        const dh = dy1 - dy0
        const dyc = (dy0 + dy1) / 2
        out.push(box(dw + 0.012, dh + 0.01, 0.007, cx, dyc, s * (zw + 0.0016), BLACK))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0008)
          out.push(box(dw / 2 - 0.006, dh, 0.0082, lx, dyc, s * (zw + 0.0024), '#0f151b'))
          out.push(box(dw / 2 - 0.016, dh * 0.34, 0.009, lx, dy0 + dh * 0.2, s * (zw + 0.0029), DOOR_GLASS))
          out.push(box(dw / 2 - 0.016, dh * 0.56, 0.0092, lx, dy0 + dh * 0.7, s * (zw + 0.0031), GLASS))
        }
        out.push(box(0.004, dh, 0.0098, cx, dyc, s * (zw + 0.0036), '#05070a'))
        // yellow-orange push buttons on the door posts
        for (const bx of [x0 - 0.0045, x1 + 0.0045]) out.push(box(0.005, 0.009, 0.0095, bx, 0.095, s * (zw + 0.0026), '#e6a21c'))
        // door rail above the opening
        out.push(box(dw + 0.014, 0.005, 0.0085, cx, dy1 + 0.007, s * (zw + 0.0022), '#6c737a'))
      }
      // light grey stripe above the window band, running right up to the front pillars
      const sx0 = c.nR > 0 ? -c.len / 2 + c.nR * 0.5 : -c.len / 2 + 0.004
      const sx1 = c.nF > 0 ? c.len / 2 - c.nF * 0.5 : c.len / 2 - 0.004
      out.push(box(sx1 - sx0, c.h * 0.095, 0.003, (sx0 + sx1) / 2, c.h * 0.77, s * (zw + 0.0004), STRIPE))
      // step edge in front of the doors (yellow-white safety strip)
      for (const [x0, x1] of c.doors) out.push(box(x1 - x0, 0.004, 0.012, (x0 + x1) / 2, SKIRT_Y + 0.008, s * (zw - 0.002), '#d7d9dc'))
      // MVG lettering on the blue panel behind the cab and a small side display above the door next to the cab
      if (c.nF > 0) {
        out.push(...mvg(c.len / 2 - c.nF - 0.055, 0.03, zw, s))
        const dd = c.doors[c.doors.length - 1]
        if (dd) {
          out.push(box(0.05, 0.016, 0.006, (dd[0] + dd[1]) / 2, wy1 + 0.028, s * (zw + 0.0012), BLACK))
          out.push(box(0.04, 0.007, 0.0065, (dd[0] + dd[1]) / 2 - 0.002, wy1 + 0.028, s * (zw + 0.0016), '#e08a1b'))
        }
      }
      if (c.nR > 0) {
        out.push(...mvg(-(c.len / 2 - c.nR - 0.055), 0.03, zw, s))
        const dd = c.doors[0]
        if (dd) {
          out.push(box(0.05, 0.016, 0.006, (dd[0] + dd[1]) / 2, wy1 + 0.028, s * (zw + 0.0012), BLACK))
          out.push(box(0.04, 0.007, 0.0065, (dd[0] + dd[1]) / 2 + 0.002, wy1 + 0.028, s * (zw + 0.0016), '#e08a1b'))
        }
      }
    }

    // roof: air-conditioning units with ribs, a cable duct, a fin antenna on the head car; pantograph on the middle car
    const flat = c.w - 2 * c.roofR
    const roofUnits: [number, number][] = c.nF > 0 || c.nR > 0 ? [[c.nF > 0 ? -c.len * 0.1 : c.len * 0.1, c.len * 0.2]] : [[-c.len * 0.3, c.len * 0.24], [c.len * 0.3, c.len * 0.24]]
    for (const [ux, ul] of roofUnits) {
      out.push(box(ul, 0.018, flat * 0.8, ux, c.h + 0.003, 0, GREY))
      out.push(box(ul * 0.96, 0.004, flat * 0.84, ux, c.h + 0.0125, 0, '#8e969e'))
      for (let k = -2; k <= 2; k++) out.push(box(ul * 0.82, 0.003, 0.006, ux, c.h + 0.0155, k * flat * 0.17, '#767e86'))
    }
    out.push(box(c.len * 0.5, 0.004, 0.012, 0, c.h + 0.0, 0, '#586067'))
    if (lead) {
      const ax = c.nF > 0 ? -c.len * 0.34 : c.len * 0.34
      out.push(box(0.05, 0.013, 0.012, ax, c.h + 0.007, 0.03, '#d7dade', -0.2))
      out.push(cylZ(0.006, 0.01, ax + 0.06, c.h + 0.004, -0.03, '#2a3037', 8))
    } else {
      // single-arm pantograph: base frame with two insulators, lower arm, upper arm and the wide head with two carbon strips
      const px = -0.02
      const base = c.h + 0.003
      out.push(box(0.14, 0.008, 0.12, px, base + 0.002, 0, '#262c33'))
      for (const sz of [-1, 1]) out.push(box(0.012, 0.018, 0.012, px - 0.04, base + 0.014, sz * 0.04, '#b8a07a'))
      const k = { x: px + 0.065, y: base + 0.11 }
      const h0 = { x: px - 0.04, y: base + 0.026 }
      const hd = { x: px - 0.01, y: base + 0.196 }
      out.push(bar(h0.x, h0.y, k.x, k.y, 0.009, 0.011, 0, '#8a929a'))
      out.push(bar(k.x, k.y, hd.x, hd.y, 0.007, 0.009, 0, '#9aa2aa'))
      out.push(box(0.006, 0.006, 0.17, hd.x, hd.y + 0.003, 0, '#3a3f46'))
      for (const dx of [-0.007, 0.007]) out.push(box(0.005, 0.004, 0.16, hd.x + dx, hd.y + 0.009, 0, '#15181b'))
      for (const sz of [-1, 1]) out.push(bar(hd.x, hd.y + 0.003, hd.x, hd.y + 0.016, 0.004, 0.004, sz * 0.088, '#3a3f46'))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    // a car without a nose at its front end carries the bellows to the next car
    if (c.nF === 0) out.push(...bellows(c))
    return out
  },
}
