import type * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich tram, Siemens Avenio (photos "Strassenbahn Muenchen / Zug 1", numbers 2804, 2807, 2897): four-section 100 % low-floor
 * tram, 2.3 m wide, light "Muenchner Blau" lower body, one long dark window band with slim blue pillars and a blue roof edge,
 * light grey roof. The front is a big, almost upright windscreen in a black frame with the orange destination display inside its
 * top, a black cowl under it, a blue lower panel with the city's coat of arms between the head lights (two small round lamps,
 * a round head light, an indicator), fog lamps and a dark bumper strip. Doors: double leaves with dark glass over a blue panel.
 * Between the sections: black rubber bellows. Single-arm pantograph behind the cab of the head car. Both ends are driver's cabs.
 */

const BLUE_DARK = '#4a79c4'
const BLACK = '#0d1013'
const RUBBER = '#171b1f'
const FRONT_GLASS = '#33434f'
const SILVER = '#8c939c'

// face layout (heights in design units above the car underside)
const FACE_BOTTOM = -0.04
const COWL_BOTTOM = 0.078
const WS_BOTTOM = 0.112
const WS_TOP_GAP = 0.012

/** Black frame of the windscreen and the glass inside it. */
function screen(m: FrontMetrics) {
  const y1 = m.capTop - WS_TOP_GAP
  return { y0: WS_BOTTOM, y1, cy: (WS_BOTTOM + y1) / 2, h: y1 - WS_BOTTOM, w: 2 * m.capHW - 0.03 }
}

export const tramMuc1Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.034, w: s.w * 0.68, h: 0.03, x: 0.0122 }
}
export const tramMuc1Lamp = () => ({ y: 0.046, z: 0.084, w: 0.016, h: 0.016, round: true })

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = tramMuc1Lamp()
  const sign = tramMuc1Sign(m)
  const fw = 2 * c.capHW
  const parts: THREE.BufferGeometry[] = []

  // blue lower panel, standing a little proud, with a darker crease below the cowl
  parts.push(frontPlate(fw - 0.012, COWL_BOTTOM - FACE_BOTTOM - 0.004, 0.026, x, (COWL_BOTTOM + FACE_BOTTOM) / 2 - 0.002, 0, 0.004, c.body))
  parts.push(box(0.003, 0.004, fw - 0.05, x + 0.0045, 0.0, 0, BLUE_DARK))

  // windscreen: black frame, smoky glass, dark recess for the destination display
  parts.push(frontPlate(s.w, s.h, 0.04, x, s.cy, 0, 0.007, BLACK))
  parts.push(frontPlate(s.w - 0.02, s.h - 0.02, 0.032, x + 0.007, s.cy, 0, 0.0025, FRONT_GLASS))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // centre pillar of the glass is absent; a rain strip and the parked wipers across the lower edge
  for (const zp of [-0.075, 0.012]) {
    const a = 1.35
    const L = 0.1
    parts.push(box(0.0025, L, 0.004, x + 0.0105, s.y0 + 0.04 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }

  // black cowl under the windscreen with the maker's name
  parts.push(frontPlate(s.w, WS_BOTTOM - COWL_BOTTOM + 0.004, 0.012, x, (WS_BOTTOM + COWL_BOTTOM) / 2, 0, 0.0085, '#14181c'))
  parts.push(box(0.002, 0.004, 0.05, x + 0.0095, (WS_BOTTOM + COWL_BOTTOM) / 2 + 0.002, 0, '#8e949b'))

  // lamp clusters at the sides: two small round lamps over the main head light, each in a dark housing
  for (const sz of [-1, 1]) {
    const z = sz * lamp.z
    parts.push(cylX(0.0108, 0.006, x + 0.003, lamp.y, z, '#0a0c0e', 16))
    parts.push(cylX(0.0068, 0.006, x + 0.003, 0.062, z, '#16191c', 12))
    parts.push(cylX(0.0036, 0.007, x + 0.0035, 0.062, z, '#e3a22b', 8))
    parts.push(cylX(0.0068, 0.006, x + 0.003, 0.076, z, '#16191c', 12))
    parts.push(cylX(0.0036, 0.007, x + 0.0035, 0.076, z, '#b9bfc6', 8))
    // fog lamp low on the bumper
    parts.push(cylX(0.0075, 0.006, x + 0.003, -0.016, sz * 0.104, '#0a0c0e', 12))
    parts.push(cylX(0.0042, 0.007, x + 0.0035, -0.016, sz * 0.104, '#9aa1a9', 8))
  }

  // coat of arms of the city: white shield with a dark figure
  parts.push(frontPlate(0.03, 0.036, 0.01, x + 0.004, 0.052, 0, 0.0018, '#fbfbf8'))
  parts.push(frontPlate(0.015, 0.021, 0.005, x + 0.0058, 0.05, 0, 0.0008, '#2a2a2c'))
  parts.push(frontPlate(0.017, 0.004, 0.0015, x + 0.0058, 0.0705, 0, 0.0008, '#d8a925'))
  // vehicle number, low on the left
  parts.push(frontPlate(0.034, 0.014, 0.003, x + 0.004, 0.012, -0.075, 0.0012, '#3f6cb8'))
  for (const k of [-3, -1, 1, 3]) parts.push(box(0.001, 0.008, 0.004, x + 0.0054, 0.012, -0.075 + k * 0.0075, '#142a52'))

  // coupler cover in the middle, dark bumper strip along the bottom
  parts.push(box(0.016, 0.034, 0.058, x + 0.007, 0.002, 0, '#2a3037'))
  parts.push(cylX(0.011, 0.016, x + 0.019, 0.002, 0, SILVER))
  parts.push(box(0.014, 0.014, fw * 0.95, x + 0.006, FACE_BOTTOM + 0.007, 0, '#1b2026'))
  // rail guards (skids) under the front
  for (const sz of [-1, 1]) parts.push(box(0.03, 0.01, 0.012, x - 0.01, -0.058, sz * 0.085, '#15191d'))
  return parts
}

/** The cab side: dark glass behind the A-pillar, an outside mirror on a short arm. */
function cabSide(c: CarCtx, sign: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const nose = sign > 0 ? c.nF : c.nR
  if (nose <= 0) return out
  const xs = c.len / 2 - nose
  const zw = c.w / 2
  const y0 = c.h * 0.37
  const y1 = c.h * 0.86
  for (const s of [-1, 1]) {
    const x0 = xs - 0.02
    const x1 = xs + nose * 0.7
    out.push(box(x1 - x0, y1 - y0, 0.007, sign * (x0 + x1) / 2, (y0 + y1) / 2, s * (zw - 0.0006), GLASS))
    // outside mirror
    out.push(box(0.006, 0.006, 0.026, sign * (xs + nose * 0.62), c.h * 0.7, s * (zw + 0.012), '#15191d'))
    out.push(box(0.01, 0.055, 0.013, sign * (xs + nose * 0.6), c.h * 0.66, s * (zw + 0.024), '#15191d'))
  }
  return out
}

/** Black rubber bellows in the gap behind a car (between this car and the one behind it). */
function bellows(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const gap = c.spec.gap
  const x = -c.len / 2 - gap / 2
  out.push(box(gap - 0.004, c.h * 0.9, c.w * 0.9, x, c.h * 0.46, 0, RUBBER))
  for (const k of [-0.33, -0.11, 0.11, 0.33]) out.push(box(0.008, c.h * 0.94, c.w * 0.95, x + k * gap, c.h * 0.47, 0, '#2c3238'))
  // roof arch over the joint and the blue corner pillars of the module ends
  out.push(box(gap + 0.01, 0.012, c.w * 0.62, x, c.h - 0.004, 0, '#3a4047'))
  for (const s of [-1, 1]) out.push(box(0.012, c.h * 0.84, 0.01, -c.len / 2 - 0.004, c.h * 0.45, s * (c.w / 2 - 0.006), c.body))
  return out
}

/** Single-arm pantograph on a base with insulators. */
function pantograph(px: number, h: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  out.push(box(0.2, 0.01, 0.15, px, h + 0.004, 0, '#2a2f36'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(0.014, 0.022, 0.014, px + sx * 0.07, h + 0.02, sz * 0.05, '#a39d8f'))
  out.push(box(0.17, 0.008, 0.12, px, h + 0.034, 0, '#394049'))
  const arm = (x0: number, y0: number, x1: number, y1: number, t: number, hex: string) =>
    box(Math.hypot(x1 - x0, y1 - y0), t, t, (x0 + x1) / 2, (y0 + y1) / 2, 0, hex, Math.atan2(y1 - y0, x1 - x0))
  const base = h + 0.04
  const kx = px - 0.07
  const ky = base + 0.085
  out.push(arm(px + 0.04, base, kx, ky, 0.012, '#7d848d'))
  out.push(arm(kx, ky, px + 0.02, base + 0.15, 0.01, '#9aa1aa'))
  out.push(arm(px + 0.04, base + 0.01, px + 0.0, base + 0.09, 0.006, '#5b626b'))
  out.push(box(0.03, 0.008, 0.2, px + 0.02, base + 0.156, 0, '#2d3238'))
  out.push(box(0.012, 0.005, 0.19, px + 0.02, base + 0.162, 0, '#15181a'))
  for (const sz of [-1, 1]) out.push(box(0.018, 0.012, 0.01, px + 0.02, base + 0.16, sz * 0.1, '#2d3238', 0.5))
  return out
}

export const tramMuc1: ModelDef = {
  sign: tramMuc1Sign,
  lamp: tramMuc1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    // the single bogie of the section sits a little behind the cab in the end cars
    const bx = c.nF > 0 ? -c.len * 0.1 : c.nR > 0 ? c.len * 0.1 : 0
    out.push(box(c.len * 0.9, 0.03, c.w * 0.82, 0, -0.016, 0, '#20252b'))
    out.push(box(c.len * 0.3, 0.03, c.w * 0.6, -c.len * 0.22 * (c.nF > 0 ? -1 : 1), -0.03, 0, '#2c3238'))
    // bogie: frame, two axles, wheels on the rails (rails stand 0.085 either side of the centre line)
    out.push(box(0.26, 0.02, 0.19, bx, -0.032, 0, '#13171b'))
    out.push(box(0.09, 0.04, 0.08, bx, -0.04, 0, '#2b3137'))
    for (const dx of [-0.075, 0.075]) {
      out.push(cylZ(0.007, 0.19, bx + dx, -0.03, 0, '#2b3036', 6))
      for (const sz of [-1, 1]) {
        out.push(cylZ(0.04, 0.016, bx + dx, -0.03, sz * 0.085, '#59616b', 14))
        out.push(cylZ(0.046, 0.004, bx + dx, -0.03, sz * 0.0965, '#4a5159', 14))
        out.push(cylZ(0.02, 0.02, bx + dx, -0.03, sz * 0.085, '#2a3036', 8))
      }
    }
    // wheel arch covers on the sides
    for (const sz of [-1, 1]) {
      out.push(box(0.27, 0.05, 0.006, bx, -0.025, sz * (zw - 0.012), '#22272d'))
      out.push(box(0.27, 0.01, 0.014, bx, -0.002, sz * (zw - 0.012), '#1a1f24'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.37
    const wy1 = c.h * 0.88
    for (const s of [-1, 1]) {
      // windows: dark glass pane proud of the wall, slim rim above and below
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0, wy1 - wy0, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.001), GLASS))
        out.push(box(x1 - x0 + 0.008, 0.005, 0.007, cx, wy1 + 0.001, s * (zw + 0.0012), '#10151a'))
        out.push(box(x1 - x0 + 0.008, 0.005, 0.007, cx, wy0 - 0.001, s * (zw + 0.0012), '#10151a'))
      }
      // doors: dark frame, two glass leaves over blue panels, a centre gap, yellow info sticker and a push button
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        const top = wy1 + 0.004
        const bot = c.h * 0.04
        out.push(box(dw + 0.01, top - bot, 0.006, cx, (top + bot) / 2, s * (zw + 0.0012), '#11151a'))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0015)
          const lw = dw / 2 - 0.009
          out.push(box(lw, c.h * 0.3, 0.009, lx, c.h * 0.205, s * (zw + 0.0022), c.body))
          out.push(box(lw, wy1 - c.h * 0.37, 0.009, lx, (wy1 + c.h * 0.37) / 2, s * (zw + 0.0022), GLASS))
        }
        out.push(box(0.004, top - bot - 0.01, 0.01, cx, (top + bot) / 2, s * (zw + 0.003), '#080a0c'))
        out.push(box(0.01, 0.014, 0.0095, x1 + 0.013, c.h * 0.42, s * (zw + 0.0012), '#e8c52f'))
        out.push(box(0.008, 0.012, 0.007, x0 - 0.012, c.h * 0.5, s * (zw + 0.002), '#3f9a4b'))
      }
    }
    // roof: long equipment cover and two air conditioning units; an antenna fin on end cars
    const px = c.nF > 0 ? c.len / 2 - c.nF - 0.3 : 0
    const unit = (cx: number, l: number) => {
      out.push(box(l, 0.016, c.w * 0.58, cx, c.h + 0.001, 0, '#d4d9df'))
      for (const k of [-1, 0, 1]) out.push(box(l * 0.78, 0.004, 0.014, cx, c.h + 0.011, k * 0.05, '#9aa1a9'))
    }
    if (c.nF > 0) {
      unit(-c.len * 0.22, c.len * 0.22)
      out.push(...pantograph(px, c.h - 0.008))
    } else if (c.nR > 0) {
      unit(c.len * 0.22, c.len * 0.22)
      unit(-c.len * 0.08, c.len * 0.16)
    } else {
      unit(-c.len * 0.2, c.len * 0.24)
      unit(c.len * 0.2, c.len * 0.24)
    }
    if (c.nF > 0) out.push(box(0.05, 0.016, 0.006, c.len / 2 - c.nF - 0.05, c.h + 0.008, 0, '#d9dde2', -0.3))
    if (c.nR > 0) out.push(box(0.05, 0.016, 0.006, -c.len / 2 + c.nR + 0.05, c.h + 0.008, 0, '#d9dde2', 0.3))

    out.push(...cabSide(c, 1), ...cabSide(c, -1))
    if (c.nR === 0) out.push(...bellows(c))
    if (c.nF > 0) out.push(...rakeParts(endFace(c), c.rake, c.h))
    if (c.nR > 0) out.push(...toRear(rakeParts(endFace(c), c.rake, c.h)))
    return out
  },
}
