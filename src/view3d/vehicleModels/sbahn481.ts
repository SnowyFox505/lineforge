import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, sidePlate, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin S-Bahn class 481/480 (the red-and-yellow classic, photos "S-Bahn Berlin / Zug 2"): cream upper body, red lower body (the
 * line colour), a nearly flat front with a very wide, black-framed windscreen whose top holds the destination display, two round
 * head lights in the lower corners of the windscreen, the DB logo on the red face below it, two bulging oval vents and the
 * Scharfenberg coupler in a dark recess. Sides: tall windows, double-leaf doors (red leaves with a glass top), narrow cab door,
 * green S-Bahn logo. Under the floor: bogies with motors, brake discs and third-rail collector shoes.
 */

const WS_BOTTOM = 0.42 // windscreen bottom as a share of the face height (just above the red)
const WS_TOP_GAP = 0.02
const WIN_Y0 = 0.48
const WIN_Y1 = 0.8

/** Black panel of the windscreen: centre height, height, width. */
function screen(m: FrontMetrics) {
  const y0 = m.capTop * WS_BOTTOM + 0.014
  const y1 = m.capTop - WS_TOP_GAP
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w: Math.min(2 * m.capHW * 0.86, 0.29) }
}

export const sbahn481Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.03, w: s.w * 0.62, h: 0.034, x: 0.0122 }
}
export const sbahn481Logo = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 - 0.032, z: 0, w: 0.04, h: 0.022, x: 0.0022 }
}
export const sbahn481Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 + 0.028, z: s.w / 2 - 0.03, w: 0.026, h: 0.026, round: true, warm: true }
}

/** A cylinder standing upright (springs, posts): radius r, height len, centred on (x, y, z). */
function cylY(r: number, len: number, x: number, y: number, z: number, hex: string, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg).toNonIndexed()
  g.deleteAttribute('uv')
  g.translate(x, y, z)
  return paint(g, hex)
}

/** A plate on a side wall: outer face `off` outside the wall; `s` picks the side (+1 / -1), x along the car. */
function wall(s: 1 | -1, w: number, h: number, r: number, x: number, y: number, zw: number, off: number, depth: number, hex: string): THREE.BufferGeometry {
  const z0 = s > 0 ? zw + off - depth : -(zw + off)
  return sidePlate(w, h, r, x, y, z0, depth, hex)
}

/** The green S-Bahn logo (disc with a white S built from bars) and the white "S-Bahn Berlin" lettering beside it. */
function sLogo(s: 1 | -1, x: number, y: number, zw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const z = s * (zw + 0.0012)
  out.push(cylZ(0.0115, 0.0016, x, y, z, '#00873d', 14))
  const k = 0.0035
  const bar = (u: number, v: number, w: number, h: number) => out.push(box(w * k, h * k, 0.0012, x + s * u * k, y + v * k, z + s * 0.0014, '#ffffff'))
  bar(0, 2, 2.4, 0.7) // top
  bar(-1, 1, 0.7, 1.7) // upper left
  bar(0, 0, 2.4, 0.7) // middle
  bar(1, -1, 0.7, 1.7) // lower right
  bar(0, -2, 2.4, 0.7) // bottom
  out.push(box(0.07, 0.006, 0.0012, x + s * 0.052, y + 0.004, z + s * 0.0008, '#f2f0ea'))
  out.push(box(0.044, 0.004, 0.0012, x + s * 0.04, y - 0.006, z + s * 0.0008, '#f2f0ea'))
  return out
}

/** Bicycle and wheelchair pictograms (white on the glass) for the mid car. */
function pictograms(s: 1 | -1, bx: number, wx: number, y: number, zw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const z = s * (zw + 0.0075)
  const white = '#f4f4f0'
  // bicycle: two wheels, frame, handlebar
  for (const dx of [-0.011, 0.011]) out.push(cylZ(0.0085, 0.0012, bx + dx, y - 0.005, z, white, 12), cylZ(0.0062, 0.0016, bx + dx, y - 0.005, z, GLASS, 12))
  out.push(box(0.02, 0.0016, 0.0012, bx, y + 0.0, z, white, 0.45))
  out.push(box(0.012, 0.0016, 0.0012, bx + 0.003, y + 0.006, z, white, -0.25))
  out.push(box(0.008, 0.0016, 0.0012, bx + 0.012, y + 0.011, z, white))
  // wheelchair: head, body, seat, wheel
  out.push(cylZ(0.0032, 0.0012, wx - 0.002, y + 0.016, z, white, 8))
  out.push(box(0.0035, 0.015, 0.0012, wx - 0.003, y + 0.006, z, white))
  out.push(box(0.012, 0.0035, 0.0012, wx + 0.002, y - 0.0015, z, white))
  out.push(cylZ(0.0078, 0.0012, wx - 0.001, y - 0.003, z, white, 12), cylZ(0.0058, 0.0016, wx - 0.001, y - 0.003, z, GLASS, 12))
  return out
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = sbahn481Lamp(m)
  const sign = sbahn481Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // windscreen: black rubber rim, tinted glass (lighter than the rim), a faint reflection, dark recess for the destination display
  parts.push(frontPlate(s.w, s.h, 0.04, x, s.cy, 0, 0.007, '#0b0e11'))
  parts.push(frontPlate(s.w - 0.022, s.h - 0.022, 0.032, x + 0.007, s.cy, 0, 0.0025, '#2c4358'))
  parts.push(box(0.0012, 0.13, 0.014, x + 0.0098, s.cy - 0.002, 0.07, '#33495e', 0, 0.55))
  parts.push(box(0.0012, 0.1, 0.007, x + 0.0098, s.cy - 0.006, 0.045, '#2f4458', 0, 0.55))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // train number plate inside the glass, lower right (as seen from the front)
  parts.push(box(0.0012, 0.016, 0.026, x + 0.0098, s.y0 + 0.03, -0.092, '#b9bfc2'))
  parts.push(box(0.0014, 0.01, 0.004, x + 0.0098, s.y0 + 0.03, -0.1, '#20262b'))
  parts.push(box(0.0014, 0.01, 0.004, x + 0.0098, s.y0 + 0.03, -0.088, '#20262b'))
  // wipers parked on the glass: pivot low, arm rising to the left (towards +z)
  for (const [zp, L] of [
    [0.02, 0.14],
    [-0.085, 0.115],
  ] as const) {
    const a = 0.85
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.012 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
    parts.push(cylX(0.005, 0.004, x + 0.0098, s.y0 + 0.012, zp, '#1b2026', 8))
  }
  // round head lights: dark housing with a chrome ring (the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.0205, 0.003, x + 0.0097, lamp.y, sz * lamp.z, '#9aa1a8', 18))
    parts.push(cylX(0.0175, 0.0042, x + 0.0104, lamp.y, sz * lamp.z, '#0a0c0e', 18))
  }
  // small marker lamps above the windscreen corners
  parts.push(cylX(0.0045, 0.004, x + 0.001, s.y1 + 0.007, 0, '#d8d6cc', 8))

  // oval vents that bulge out of the red face, with slats
  for (const sz of [-1, 1]) {
    const vz = sz * Math.min(0.112, c.capHW - 0.05)
    parts.push(frontPlate(0.062, 0.034, 0.017, x - 0.001, 0.088, vz, 0.012, '#252a30'))
    parts.push(frontPlate(0.05, 0.022, 0.011, x + 0.0108, 0.088, vz, 0.0022, '#14181c'))
    for (const dy of [-0.007, 0, 0.007]) parts.push(box(0.003, 0.0028, 0.046, x + 0.0122, 0.088 + dy, vz, '#444c55'))
  }
  // coupler: dark recess in the middle, the coupler head with contact plate, air hoses and cable
  parts.push(frontPlate(0.108, 0.074, 0.006, x - 0.001, 0.073, 0, 0.009, '#15191d'))
  parts.push(box(0.024, 0.044, 0.07, x + 0.011, 0.066, 0, '#242a31'))
  parts.push(box(0.036, 0.04, 0.04, x + 0.024, 0.066, 0, '#79828c'))
  parts.push(box(0.012, 0.03, 0.028, x + 0.045, 0.066, 0, '#9aa2ab'))
  for (const dz of [-0.008, 0.008]) parts.push(cylX(0.0055, 0.004, x + 0.0515, 0.07, dz, '#14181c', 8))
  parts.push(cylX(0.004, 0.02, x + 0.03, 0.098, -0.037, '#cfd3d7', 8))
  parts.push(cylX(0.004, 0.02, x + 0.03, 0.098, 0.037, '#cfd3d7', 8))
  parts.push(box(0.016, 0.006, 0.07, x + 0.019, 0.1, 0, '#272d34'))
  for (const sz of [-1, 1]) parts.push(box(0.006, 0.05, 0.004, x + 0.014, 0.044, sz * 0.03, '#0f1215'))
  // apron / buffer beam and the shunter's steps in the corners
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.95, x + 0.004, 0.015, 0, '#1b2026'))
  parts.push(box(0.012, 0.016, c.capHW * 2 * 0.95, x + 0.016, 0.026, 0, '#2d333b'))
  for (const sz of [-1, 1]) parts.push(box(0.022, 0.012, 0.04, x + 0.008, -0.01, sz * (c.capHW - 0.022), '#14181c'))
  return parts
}

/** Narrow cab door (outline, small window, handle) just behind the nose, on both sides. */
function cabDoor(c: CarCtx, sgn: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const nose = sgn > 0 ? c.nF : c.nR
  if (nose <= 0) return out
  const cx = sgn * (c.len / 2 - nose + 0.005)
  const dw = 0.08
  const dh = c.h * 0.74
  const zw = c.w / 2
  const line = '#1c1a17'
  for (const s of [-1, 1] as const) {
    const zz = s * (zw + 0.0022)
    out.push(box(0.003, dh, 0.0035, cx - dw / 2, c.h * 0.45, zz, line))
    out.push(box(0.003, dh, 0.0035, cx + dw / 2, c.h * 0.45, zz, line))
    out.push(box(dw, 0.003, 0.0035, cx, c.h * 0.45 + dh / 2, zz, line))
    out.push(box(dw, 0.003, 0.0035, cx, c.h * 0.45 - dh / 2, zz, line))
    out.push(wall(s, dw - 0.02, c.h * 0.34, 0.009, cx - sgn * 0.003, c.h * 0.63, zw, 0.0026, 0.006, '#12161a'))
    out.push(wall(s, dw - 0.026, c.h * 0.31, 0.007, cx - sgn * 0.003, c.h * 0.63, zw, 0.0033, 0.006, GLASS))
    out.push(box(0.012, 0.004, 0.005, cx - sgn * 0.028, c.h * 0.4, zz, '#aab0b6'))
  }
  return out
}

export const sbahn481: ModelDef = {
  sign: sbahn481Sign,
  logo: sbahn481Logo,
  lamp: sbahn481Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const hw = c.w / 2
    // floor pan and the apron along the lower edge of the body
    out.push(box(c.len * 0.82, 0.04, c.w * 0.72, 0, -0.025, 0, '#20252b'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.8, 0.022, 0.006, 0, -0.011, sz * (hw - 0.012), '#2a3037'))
    // equipment boxes, battery boxes and air tanks under the floor
    for (const sz of [-1, 1]) {
      out.push(box(c.len * 0.16, 0.052, 0.05, -c.len * 0.09, -0.042, sz * 0.105, '#313840'))
      out.push(box(c.len * 0.09, 0.044, 0.05, c.len * 0.1, -0.038, sz * 0.105, '#2b3138'))
      out.push(box(c.len * 0.07, 0.036, 0.04, c.len * 0.02, -0.034, sz * 0.12, '#3a4149'))
    }
    out.push(box(c.len * 0.18, 0.05, c.w * 0.3, -c.len * 0.02, -0.042, 0, '#2c3239'))
    out.push(cylX(0.02, c.len * 0.15, c.len * 0.12, -0.056, 0.03, '#3d444d', 10))
    out.push(cylX(0.016, c.len * 0.11, -c.len * 0.16, -0.054, -0.03, '#3d444d', 10))
    // bogies: side frames, cross beams, motors with gearboxes, axles, wheels with flange, brake discs, springs, collector shoes
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      for (const sz of [-1, 1]) {
        out.push(box(0.31, 0.02, 0.014, bx, -0.024, sz * 0.1, '#13171b'))
        out.push(box(0.05, 0.016, 0.02, bx, -0.043, sz * 0.1, '#1d2227'))
        out.push(cylY(0.007, 0.024, bx - 0.115, -0.014, sz * 0.1, '#7c848d'))
        out.push(cylY(0.007, 0.024, bx + 0.115, -0.014, sz * 0.1, '#7c848d'))
        // collector shoe on its arm, reaching out to the third rail
        out.push(box(0.012, 0.01, 0.05, bx + 0.16, -0.036, sz * 0.122, '#1b2026'))
        out.push(box(0.05, 0.006, 0.026, bx + 0.16, -0.047, sz * 0.147, '#3b414a'))
      }
      out.push(box(0.04, 0.03, 0.2, bx, -0.03, 0, '#181c20'))
      for (const dx of [-0.115, 0.115]) {
        out.push(box(0.075, 0.048, 0.1, bx + dx * 0.55, -0.04, 0, '#39404a')) // motor
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylX(0.021, 0.034, bx + dx, -0.027, 0.025, '#59616b', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 14))
          out.push(cylZ(0.047, 0.004, bx + dx, -0.027, sz * 0.079, '#434a53', 14))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.03, 0.004, bx + dx, -0.027, sz * 0.058, '#697079', 12)) // brake disc
        }
      }
      out.push(box(0.06, 0.02, 0.03, bx, -0.04, 0.052, '#2a3036')) // brake caliper box
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * WIN_Y0
    const wy1 = c.h * WIN_Y1
    const wyc = (wy0 + wy1) / 2
    for (const s of [-1, 1] as const) {
      // windows: black rim, glass pane (rounded corners), a thin mullion for the small hopper light at the top
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(wall(s, x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.012, cx, wyc, zw, 0.0018, 0.005, '#12161a'))
        out.push(wall(s, x1 - x0, wy1 - wy0, 0.01, cx, wyc, zw, 0.0026, 0.005, GLASS))
        out.push(box(x1 - x0, 0.0035, 0.0012, cx, wy1 - 0.03, s * (zw + 0.0034), '#12161a'))
      }
      // doors: black frame, two leaves (red lower part, glass top), centre gap, rubber seals, a push button beside the door
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(wall(s, dw + 0.012, c.h * 0.76, 0.008, cx, c.h * 0.44, zw, 0.0022, 0.006, '#14181c'))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0015)
          const lw = dw / 2 - 0.012
          out.push(wall(s, lw, c.h * 0.7, 0.006, lx, c.h * 0.45, zw, 0.0034, 0.005, '#1d2227'))
          out.push(wall(s, lw - 0.008, c.h * 0.2, 0.004, lx, c.h * 0.22, zw, 0.0042, 0.005, c.line))
          out.push(wall(s, lw - 0.008, c.h * 0.44, 0.007, lx, c.h * 0.58, zw, 0.0042, 0.005, GLASS))
        }
        out.push(box(0.004, c.h * 0.72, 0.0095, cx, c.h * 0.44, s * (zw + 0.0044), '#090b0d'))
        out.push(box(0.012, 0.018, 0.008, x1 + 0.016, c.h * 0.46, s * (zw + 0.003), '#4d555e'))
        out.push(box(0.007, 0.007, 0.0095, x1 + 0.016, c.h * 0.46, s * (zw + 0.003), '#3f9a4b'))
      }
      // green S-Bahn logo on the red body beside the first door of every car
      if (c.doors.length > 0) out.push(...sLogo(s, c.doors[0][1] + 0.14, c.h * 0.24, zw))
      // pictograms on the glass of the mid car (bicycle and wheelchair space)
      if (c.role === 'mid' && c.wins.length >= 3) {
        const [w0, w1] = c.wins[Math.floor(c.wins.length / 2)]
        const cx = (w0 + w1) / 2
        out.push(...pictograms(s, cx - 0.032, cx + 0.032, wyc + 0.0, zw))
      }
      // small yellow-grey rain gutter rail above the windows
      out.push(box(c.len * 0.9, 0.004, 0.003, 0, c.h * 0.84, s * (zw - 0.002), '#cdb36a'))
    }
    out.push(...cabDoor(c, 1), ...cabDoor(c, -1))

    // roof: ventilator hatches and a long cable duct; the head car carries an antenna and a horn
    for (const f of [-0.3, -0.08, 0.16]) {
      out.push(box(c.len * 0.13, 0.01, 0.15, c.len * f, c.h + 0.001, 0, '#bfb9a4'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.09, 0.004, 0.01, c.len * f, c.h + 0.007, k * 0.04, '#8f8b7b'))
    }
    out.push(box(c.len * 0.5, 0.005, 0.02, 0, c.h, 0, '#aaa592'))
    for (const dz of [-0.07, 0.07]) out.push(cylY(0.012, 0.012, -c.len * 0.4, c.h + 0.004, dz, '#a9a593', 10))
    if (c.nF > 0) {
      out.push(box(0.05, 0.02, 0.006, c.len / 2 - c.nF - 0.12, c.h + 0.008, 0, '#d9dde2', -0.35))
      out.push(cylY(0.007, 0.012, c.len / 2 - c.nF - 0.28, c.h + 0.006, 0.05, '#4a4f56', 8))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
