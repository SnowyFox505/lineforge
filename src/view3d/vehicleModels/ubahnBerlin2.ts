import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin U-Bahn class H (large profile, cars 5001-5046; photos "U-Bahn Berlin / Zug 2"): all yellow, black skirt, an almost
 * flat front with a very wide black windscreen whose top holds the destination display, an emergency-door panel in the
 * middle of the glass, a yellow chin with the head lights (white over red) in the lower corners, the BERLIN plate beside the
 * coupler and a dark apron. Sides: black-framed fixed windows, double-leaf yellow doors with a glass pane in each leaf, a
 * narrow cab door behind the nose. Third-rail train: current collector shoes on the bogies instead of a pantograph.
 */

const BLACK = '#0d1114'
const SEAL = '#14181c'

const GLASS_BOTTOM = 0.15
const GLASS_TOP_GAP = 0.014

/** The windscreen: bottom, top, centre height, height, width of the black frame. */
function screen(m: FrontMetrics) {
  const y0 = GLASS_BOTTOM
  const y1 = m.capTop - GLASS_TOP_GAP
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w: 2 * m.capHW - 0.012 }
}

export const ubahnBerlin2Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.033, w: s.w * 0.64, h: 0.03, x: 0.0122 }
}
export const ubahnBerlin2Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 - 0.05, z: m.capHW - 0.036, w: 0.046, h: 0.018 }
}

/** The face of a head or tail end: built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = ubahnBerlin2Lamp(m)
  const sign = ubahnBerlin2Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // windscreen: black frame, dark glass in two halves, the emergency-door panel in the middle, the display recess on top
  parts.push(frontPlate(s.w, s.h, 0.03, x, s.cy, 0, 0.007, BLACK))
  const gw = s.w - 0.016
  const gh = s.h - 0.016
  parts.push(frontPlate(gw, gh, 0.024, x + 0.007, s.cy, 0, 0.0025, '#1a2733'))
  // faint reflections across the left and right glass
  parts.push(frontPlate(0.05, gh - 0.075, 0.006, x + 0.0095, s.cy - 0.036, -s.w * 0.3, 0.0006, '#243545'))
  parts.push(frontPlate(0.016, gh - 0.075, 0.003, x + 0.0095, s.cy - 0.036, -s.w * 0.17, 0.0006, '#243545'))
  parts.push(frontPlate(0.05, gh - 0.075, 0.006, x + 0.0095, s.cy - 0.036, s.w * 0.28, 0.0006, '#202f3d'))
  // emergency door in the middle: black frame, grey leaf with a glass pane, handle
  const dw = 0.098
  const dh = gh - 0.058
  const dcy = s.y0 + 0.008 + dh / 2
  parts.push(frontPlate(dw + 0.008, dh, 0.004, x + 0.0095, dcy, 0, 0.0012, BLACK))
  parts.push(frontPlate(dw - 0.006, dh - 0.01, 0.004, x + 0.0107, dcy, 0, 0.0012, '#343b44'))
  parts.push(frontPlate(dw - 0.03, dh * 0.5, 0.004, x + 0.0119, dcy + dh * 0.12, 0, 0.0008, '#161e27'))
  parts.push(box(0.003, 0.016, 0.004, x + 0.0123, dcy - dh * 0.1, dw * 0.34, '#bfc5cc'))
  // display recess
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // wipers parked low across the glass, one for each half
  for (const sg of [-1, 1]) {
    const a = sg * 1.32
    const L = 0.1
    const pz = sg * 0.07
    parts.push(box(0.0025, L, 0.0045, x + 0.0107, s.y0 + 0.016 + (L / 2) * Math.cos(a), pz + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // grab rails of the front: thin lighter edge strips at the sides of the glass
  for (const sg of [-1, 1]) parts.push(box(0.004, s.h * 0.84, 0.006, x + 0.0075, s.cy, sg * (s.w / 2 + 0.001), '#c89f0c'))
  // marker lights above the display
  for (const sg of [-1, 1]) parts.push(box(0.003, 0.008, 0.016, x + 0.002, c.capTop - 0.004, sg * 0.07, '#f4f6f8'))

  // chin: head lights (white, the lit mesh is added by CarMesh) over red tail lights, in dark housings at the lower corners
  for (const sg of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.016, 0.054, 0.006, x + 0.0095, lamp.y - 0.013, sg * lamp.z, 0.0015, BLACK))
    parts.push(frontPlate(lamp.w - 0.008, 0.016, 0.004, x + 0.011, lamp.y - 0.025, sg * lamp.z, 0.001, '#d02a1f'))
    // yellow side flank of the face with the rounded corner glass
    parts.push(box(0.004, 0.04, 0.012, x + 0.003, 0.088, sg * (c.capHW - 0.004), '#d8ac0c'))
  }
  // BERLIN plate (white with a dark line of lettering) and the car number as a dark strip, both beside the coupler
  parts.push(frontPlate(0.05, 0.016, 0.003, x + 0.003, 0.082, -0.062, 0.0015, '#f2f4f6'))
  parts.push(box(0.0012, 0.005, 0.036, x + 0.0052, 0.082, -0.062, '#1f4d9a'))
  parts.push(box(0.0012, 0.01, 0.05, x + 0.0045, 0.06, 0.07, '#3a3a2c'))

  // dark apron under the chin with rubber corner guards, coupler cover and Scharfenberg coupler
  parts.push(frontPlate(c.capHW * 2 * 0.96, 0.05, 0.01, x + 0.001, 0.027, 0, 0.012, '#1e2328'))
  parts.push(frontPlate(c.capHW * 2 * 0.96 - 0.03, 0.012, 0.004, x + 0.0125, 0.049, 0, 0.002, '#2d343b'))
  parts.push(box(0.024, 0.07, 0.11, x + 0.008, 0.045, 0, '#2c3238'))
  parts.push(box(0.012, 0.05, 0.08, x + 0.02, 0.04, 0, '#3a424b'))
  parts.push(cylX(0.024, 0.034, x + 0.028, 0.04, 0, '#6e7681'))
  parts.push(cylX(0.011, 0.016, x + 0.046, 0.04, 0, '#14181c'))
  parts.push(box(0.012, 0.012, 0.05, x + 0.026, 0.07, 0, '#80878f'))
  // air hoses and a snow plough bar over the rail heads
  for (const sg of [-1, 1]) parts.push(cylX(0.004, 0.022, x + 0.018, 0.015, sg * 0.05, '#c9a81f', 6))
  for (const sg of [-1, 1]) parts.push(box(0.02, 0.032, 0.016, x + 0.01, 0.002, sg * 0.085, '#181c20'))
  return rakeParts(parts, c.rake, c.h)
}

/** The cab door and the pillars around it, on the side wall behind a nose (the last window of the car is covered by them). */
function cabDoor(c: CarCtx, x0: number, x1: number, sz: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const h = c.h
  const z = (d: number) => sz * (zw + d)
  // yellow cover over the wall (it was going to be glass), the black seal, the door leaf with a window and the handle
  out.push(box(x1 - x0 + 0.004, h * 0.8, 0.005, cx, h * 0.46, z(0.0014), c.body))
  const dw = Math.min(0.1, (x1 - x0) * 0.7)
  out.push(box(dw + 0.012, h * 0.78, 0.0065, cx, h * 0.46, z(0.002), SEAL))
  out.push(box(dw, h * 0.75, 0.0075, cx, h * 0.46, z(0.0025), c.body))
  out.push(box(dw * 0.68, h * 0.44, 0.0085, cx, h * 0.6, z(0.003), GLASS))
  out.push(box(0.012, 0.005, 0.009, cx + dw * 0.3, h * 0.38, z(0.0035), '#d8dde2'))
  return out
}

export const ubahnBerlin2: ModelDef = {
  sign: ubahnBerlin2Sign,
  lamp: ubahnBerlin2Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor and the equipment under it: battery boxes, converters, compressor, air tanks, brake resistors
    out.push(box(c.len * 0.84, 0.05, c.w * 0.74, 0, -0.03, 0, '#1f242a'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.56, 0.036, 0.006, 0, -0.012, sz * (c.w * 0.37 + 0.002), '#2a3036'))
    out.push(box(c.len * 0.16, 0.054, c.w * 0.56, -c.len * 0.07, -0.046, 0, '#313840'))
    out.push(box(c.len * 0.12, 0.048, c.w * 0.48, c.len * 0.12, -0.042, 0, '#2c3239'))
    out.push(box(c.len * 0.07, 0.044, c.w * 0.4, c.len * 0.21, -0.04, 0, '#3a424b'))
    out.push(cylX(0.02, c.len * 0.15, 0, -0.06, 0.075, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.11, c.len * 0.02, -0.058, -0.075, '#3a4149'))
    // bogies Bo'Bo' (wheelbase 1.8 m, pivots 9.5 m apart): frame, two motors, brake discs, axle boxes, current collector shoes
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.27, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.06, 0.04, 0.1, bx, -0.016, 0, '#252b31'))
      for (const dx of [-0.108, 0.108]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(box(0.065, 0.05, 0.09, bx + dx * 0.66, -0.034, 0, '#2b3137'))
        out.push(cylZ(0.022, 0.008, bx + dx, -0.027, 0.04, '#5a626c', 10))
        out.push(cylZ(0.022, 0.008, bx + dx, -0.027, -0.04, '#5a626c', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.27, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        // collector shoe on an insulated beam, reaching out over the third rail beside the track
        out.push(box(0.016, 0.01, 0.044, bx + 0.05, -0.04, sz * 0.123, '#4a4f55'))
        out.push(box(0.05, 0.007, 0.02, bx + 0.05, -0.052, sz * 0.146, '#8a7a45'))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.42
    const wy1 = c.h * 0.82
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) {
          out.push(...cabDoor(c, x0, x1, s))
          continue
        }
        // fixed windows: black frame, glass pane proud of the wall
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), BLACK))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
        // a window sash bar halfway
        out.push(box(0.004, wy1 - wy0, 0.0085, cx, (wy0 + wy1) / 2, s * (zw + 0.0022), '#1b2026'))
      }
      // doors: yellow leaves with a black seal, a tall glass pane in each leaf and a dark seam, step sill, lamp above and button beside
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.012, c.h * 0.8, 0.006, cx, c.h * 0.47, s * (zw + 0.0014), SEAL))
        for (const sl of [-1, 1]) {
          out.push(box(dw / 2 - 0.004, c.h * 0.76, 0.0075, cx + sl * (dw / 4 + 0.001), c.h * 0.46, s * (zw + 0.0022), c.body))
          out.push(box(dw / 2 - 0.026, c.h * 0.5, 0.0095, cx + sl * (dw / 4 + 0.001), c.h * 0.58, s * (zw + 0.0028), SEAL))
          out.push(box(dw / 2 - 0.03, c.h * 0.47, 0.01, cx + sl * (dw / 4 + 0.001), c.h * 0.58, s * (zw + 0.0032), GLASS))
        }
        out.push(box(0.004, c.h * 0.78, 0.0105, cx, c.h * 0.46, s * (zw + 0.0034), '#0a0c0e'))
        out.push(box(dw + 0.01, 0.012, 0.012, cx, 0.073, s * (zw + 0.003), '#2a2f36'))
        out.push(box(dw * 0.4, 0.008, 0.005, cx, c.h * 0.9, s * (zw + 0.0014), '#d9871a'))
        out.push(box(0.01, 0.016, 0.007, x1 + 0.014, c.h * 0.46, s * (zw + 0.003), '#3f9a4b'))
      }
      // a thin black rubber strip along the lower edge of the body and the rain gutter above the windows
      out.push(box(c.len * 0.94, 0.006, 0.004, 0, 0.034, s * (zw + 0.0008), '#2a2f36'))
      out.push(box(c.len * 0.94, 0.004, 0.005, 0, c.h * 0.88, s * (zw + 0.001), '#d5a80b'))
    }

    // roof: a central cable duct, two air conditioning units with grilles, ventilation hoods
    for (const f of [-0.26, 0.2]) {
      out.push(box(c.len * 0.2, 0.016, 0.15, c.len * f, c.h + 0.003, 0, '#bcc1c8'))
      out.push(box(c.len * 0.21, 0.006, 0.158, c.len * f, c.h - 0.002, 0, '#9ba1a9'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.14, 0.004, 0.012, c.len * f, c.h + 0.012, k * 0.045, '#7f868f'))
    }
    out.push(box(c.len * 0.82, 0.006, 0.026, 0, c.h + 0.002, 0, '#8b9199'))
    for (const f of [-0.02, 0.4]) out.push(box(0.08, 0.012, 0.07, c.len * f, c.h + 0.004, 0, '#cfa40c'))
    if (c.nF > 0) out.push(box(0.05, 0.02, 0.006, c.len / 2 - c.nF - 0.22, c.h + 0.008, 0, '#d9dde2', -0.35))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
