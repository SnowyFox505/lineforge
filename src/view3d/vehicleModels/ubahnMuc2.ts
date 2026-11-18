import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich U-Bahn, class A (A2.x, photos "U-Bahn Muenchen / Zug 2"): a boxy blue car with an almost upright front. Cream window
 * band that wraps round the front, blue doors and blue roof strip, light grey roof. Front: two big windscreens in a cream
 * frame with a blue pillar between them, the destination display in its own cream frame above, rectangular head lights low
 * on the blue panel, the Munich Kindl shield in the middle, a dark apron and the Scharfenberg coupler below. Side: three
 * double doors per car, window groups between them, a narrow cab door behind the front. Power comes from the third rail:
 * collector shoes on both sides of every bogie (no pantograph).
 */

const CREAM = '#f7f0da'
const CREAM_DARK = '#d8d0b6'
const SILVER = '#aeb5bc'
const INK = '#1a232d'

/** The front: windscreen band, destination display and lower panel, all as heights of the end face (capTop) */
function front(m: FrontMetrics) {
  const u = m.capTop
  const y0 = u * 0.4
  const y1 = u * 0.845
  return { u, hw: m.capHW, y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, signY: u * 0.912 }
}

export const ubahnMuc2Sign = (m: FrontMetrics) => {
  const f = front(m)
  return { y: f.signY, w: 0.16, h: 0.035, x: 0.0122 }
}
export const ubahnMuc2Lamp = (m: FrontMetrics) => {
  const f = front(m)
  return { y: f.u * 0.2, z: 0.122, w: 0.032, h: 0.019 }
}

/** Outline of a tapered, rounded panel centred on the origin: `wb` wide at the bottom, `wt` at the top, `h` high. */
function taper(wb: number, wt: number, h: number, rb: number, rt: number): THREE.Shape {
  const s = new THREE.Shape()
  const b = wb / 2
  const t = wt / 2
  const y = -h / 2
  s.moveTo(-b + rb, y)
  s.lineTo(b - rb, y)
  s.quadraticCurveTo(b, y, b, y + rb)
  s.lineTo(t, y + h - rt)
  s.quadraticCurveTo(t, y + h, t - rt, y + h)
  s.lineTo(-t + rt, y + h)
  s.quadraticCurveTo(-t, y + h, -t, y + h - rt)
  s.lineTo(-b, y + rb)
  s.quadraticCurveTo(-b, y, -b + rb, y)
  return s
}

/** A raised panel of any outline on the front face (like `frontPlate`). */
function frontShape(shape: THREE.Shape, x: number, y: number, z: number, depth: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 })
  g.rotateY(Math.PI / 2)
  g.translate(x, y, z)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** The Munich shield: pointed at the bottom, `w` wide and `h` high, centred on the origin. */
function shield(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape()
  const a = w / 2
  s.moveTo(-a, h / 2)
  s.lineTo(a, h / 2)
  s.lineTo(a, -h * 0.05)
  s.quadraticCurveTo(a, -h * 0.34, 0, -h / 2)
  s.quadraticCurveTo(-a, -h * 0.34, -a, -h * 0.05)
  s.lineTo(-a, h / 2)
  return s
}

/** The Kindl coat of arms on the front: a light shield in a dark rim with the small dark figure of the monk child. */
function kindl(x: number, y: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  out.push(frontShape(shield(0.036, 0.043), x, y, z, 0.0022, '#2a2f36'))
  out.push(frontShape(shield(0.03, 0.037), x + 0.0022, y + 0.0006, z, 0.0018, '#dfe3e7'))
  // robe, head and the raised hand
  const robe = new THREE.Shape()
  robe.moveTo(-0.0075, -0.0135)
  robe.lineTo(0.0075, -0.0135)
  robe.lineTo(0.0038, 0.0035)
  robe.lineTo(-0.0038, 0.0035)
  robe.closePath()
  out.push(frontShape(robe, x + 0.004, y - 0.001, z, 0.0012, '#15181c'))
  out.push(cylX(0.0042, 0.0012, x + 0.0046, y + 0.0095, z, '#15181c', 10))
  out.push(box(0.0012, 0.0045, 0.0022, x + 0.0046, y + 0.0035, z + 0.006, '#15181c', 0, 0.4))
  return out
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const f = front(m)
  const lamp = ubahnMuc2Lamp(m)
  const sign = ubahnMuc2Sign(m)
  const parts: THREE.BufferGeometry[] = []
  const hw = f.hw

  // cream frame that wraps the windscreens, the two panes with a pillar between them
  parts.push(frontPlate(2 * hw - 0.004, f.h + 0.012, 0.014, x, f.cy, 0, 0.006, CREAM))
  const pillar = 0.011
  const edge = 0.015
  const pw = hw - edge - pillar
  const ph = f.h - 0.02
  for (const sz of [-1, 1]) {
    const zc = sz * (pillar + pw / 2)
    parts.push(frontShape(taper(pw, pw * 0.95, ph, 0.012, 0.016), x + 0.006, f.cy, zc, 0.0025, INK))
    // faint reflections, a lighter band across the upper third and a streak
    parts.push(frontShape(taper(pw * 0.82, pw * 0.78, ph * 0.3, 0.004, 0.004), x + 0.0083, f.cy + ph * 0.25, zc, 0.0006, '#1d2a37'))
    parts.push(frontShape(taper(0.012, 0.008, ph * 0.7, 0.003, 0.003), x + 0.0083, f.cy - ph * 0.05, zc - sz * pw * 0.22, 0.0006, '#1a2530'))
    // wiper parked along the lower edge of each pane
    const L = pw * 0.9
    parts.push(box(0.0025, 0.004, L, x + 0.0092, f.cy - ph / 2 + 0.014, zc, '#050607'))
    parts.push(box(0.0028, 0.007, 0.005, x + 0.0092, f.cy - ph / 2 + 0.014, zc - sz * (L / 2), '#050607'))
  }
  // destination display: cream frame, deep dark recess (the lit sign itself is a separate mesh, see CarMesh)
  parts.push(frontPlate(sign.w + 0.016, sign.h + 0.01, 0.006, x + 0.001, sign.y, 0, 0.0055, CREAM))
  parts.push(frontPlate(sign.w + 0.006, sign.h + 0.004, 0.004, x + 0.0064, sign.y, 0, 0.0034, '#06080a'))
  // small marker lights beside the display on the roof edge
  for (const sz of [-1, 1]) parts.push(box(0.003, 0.005, 0.014, x + 0.002, f.u - 0.007, sz * 0.1, '#eef1f4'))

  // head and tail light units low on the blue panel: grey housing, red tail lens above the white lamp (the lit lamp is a separate mesh)
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.014, lamp.h + 0.026, 0.006, x + 0.0015, lamp.y + 0.004, sz * lamp.z, 0.0042, SILVER))
    parts.push(frontPlate(lamp.w + 0.006, lamp.h + 0.02, 0.004, x + 0.0057, lamp.y + 0.004, sz * lamp.z, 0.0016, '#14181c'))
    parts.push(frontPlate(lamp.w, 0.007, 0.002, x + 0.0066, lamp.y + 0.0125, sz * lamp.z, 0.0014, '#b3161d'))
  }
  // the Kindl shield between the windscreens and the coupler, with the train number plate below it
  parts.push(...kindl(x + 0.0015, f.y0 - 0.03, 0))
  parts.push(frontPlate(0.05, 0.015, 0.003, x + 0.0015, f.y0 - 0.066, 0, 0.0018, '#d9dde0'))
  for (let k = 0; k < 4; k++) parts.push(box(0.0012, 0.008, 0.005, x + 0.0036, f.y0 - 0.066, -0.016 + k * 0.0107, '#1b1f24'))

  // dark apron below the blue front with a step, the coupler cover and the Scharfenberg head with its hoses
  parts.push(box(0.03, 0.026, hw * 2 * 0.96, x + 0.006, 0.013, 0, '#1b2026'))
  parts.push(box(0.016, 0.006, hw * 1.6, x + 0.02, 0.028, 0, '#3a424b'))
  parts.push(box(0.03, 0.036, 0.085, x + 0.012, 0.05, 0, '#242a31'))
  parts.push(cylX(0.016, 0.034, x + 0.032, 0.05, 0, '#7a828c', 12))
  parts.push(cylX(0.01, 0.016, x + 0.054, 0.05, 0, '#1b2026', 10))
  parts.push(cylX(0.005, 0.006, x + 0.056, 0.05, 0, '#9aa1aa', 8))
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.004, 0.022, x + 0.022, 0.032, sz * 0.04, '#d7b52a', 6))
    parts.push(cylX(0.003, 0.016, x + 0.022, 0.062, sz * 0.032, '#15181c', 6))
    parts.push(box(0.01, 0.012, 0.018, x + 0.012, 0.076, sz * 0.055, '#151a1f'))
  }
  return rakeParts(parts, c.rake, c.h)
}

/** The cab door and its small window on the side wall behind a nose (the last window of the car is replaced by it). */
function cabDoor(c: CarCtx, x0: number, x1: number, sz: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const w = x1 - x0
  const h = c.h
  const z = (d: number) => sz * (zw + d)
  out.push(box(w + 0.012, h * 0.8, 0.005, cx, h * 0.435, z(0.0013), CREAM_DARK))
  out.push(box(w - 0.004, h * 0.34, 0.0065, cx, h * 0.19, z(0.002), c.line))
  out.push(box(w - 0.004, h * 0.4, 0.0065, cx, h * 0.62, z(0.002), CREAM))
  out.push(box(w * 0.7, h * 0.32, 0.0078, cx + w * 0.02, h * 0.62, z(0.0026), GLASS))
  out.push(box(0.016, 0.005, 0.009, cx - w * 0.36, h * 0.4, z(0.003), '#e6e9ed'))
  out.push(box(0.003, h * 0.76, 0.0072, cx - w / 2 - 0.0005, h * 0.43, z(0.0022), '#14181c'))
  return out
}

export const ubahnMuc2: ModelDef = {
  sign: ubahnMuc2Sign,
  lamp: ubahnMuc2Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor, side skirts and the equipment under it: resistor boxes, battery boxes, compressor, air tanks
    out.push(box(c.len * 0.84, 0.05, c.w * 0.74, 0, -0.03, 0, '#1f242a'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.56, 0.032, 0.006, 0, -0.011, sz * (c.w * 0.37 + 0.002), '#2b3138'))
    out.push(box(c.len * 0.15, 0.054, c.w * 0.56, -c.len * 0.1, -0.045, 0, '#3a4149'))
    for (let k = 0; k < 4; k++) out.push(box(c.len * 0.14, 0.004, 0.012, -c.len * 0.1, -0.025 - k * 0.0115, c.w * 0.28 + 0.004, '#20252b'))
    out.push(box(c.len * 0.12, 0.046, c.w * 0.5, c.len * 0.12, -0.04, 0, '#313840'))
    out.push(box(c.len * 0.07, 0.04, c.w * 0.4, c.len * 0.22, -0.037, 0, '#394049'))
    out.push(cylX(0.02, c.len * 0.16, 0, -0.058, 0.07, '#4a525b'))
    out.push(cylX(0.016, c.len * 0.1, 0, -0.056, -0.07, '#4a525b'))
    // bogies: frame, motors, brake discs, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.33
      out.push(box(0.32, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.12, 0.12]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(box(0.05, 0.04, 0.05, bx + dx * 0.55, -0.03, 0, '#2d343b'))
        out.push(cylZ(0.024, 0.008, bx + dx, -0.027, 0.04, '#5a626c', 10))
        out.push(cylZ(0.024, 0.008, bx + dx, -0.027, -0.04, '#5a626c', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.32, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        // third rail collector: an insulated arm reaching out to the side with the shoe on its end
        out.push(box(0.03, 0.01, 0.05, bx, -0.03, sz * 0.14, '#3a4046'))
        out.push(box(0.012, 0.014, 0.012, bx, -0.036, sz * 0.172, '#c2a24a'))
        out.push(box(0.075, 0.007, 0.024, bx, -0.044, sz * 0.18, '#7b6a3a'))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.43
    const wy1 = c.h * 0.8
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) {
          out.push(...cabDoor(c, x0, x1, s))
          continue
        }
        // windows: cream-grey frame, glass pane proud of the wall, a thin bar between the fixed lower and the upper part
        const cx = (x0 + x1) / 2
        const ww = x1 - x0
        out.push(box(ww + 0.012, wy1 - wy0 + 0.012, 0.0045, cx, (wy0 + wy1) / 2, s * (zw + 0.0012), CREAM_DARK))
        out.push(box(ww, wy1 - wy0, 0.0065, cx, (wy0 + wy1) / 2, s * (zw + 0.0022), GLASS))
        out.push(box(ww + 0.004, 0.004, 0.0072, cx, wy0 + (wy1 - wy0) * 0.74, s * (zw + 0.0024), CREAM_DARK))
      }
      // doors: cream frame, two blue leaves with a narrow window each and a rubber seam between them, a green push button beside
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.014, c.h * 0.8, 0.005, cx, c.h * 0.435, s * (zw + 0.0012), CREAM))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.001)
          out.push(box(dw / 2 - 0.004, c.h * 0.76, 0.0068, lx, c.h * 0.43, s * (zw + 0.0022), c.line))
          out.push(box(0.03, c.h * 0.34, 0.0082, lx, c.h * 0.61, s * (zw + 0.0029), GLASS))
          out.push(box(0.036, c.h * 0.38, 0.0074, lx, c.h * 0.61, s * (zw + 0.0024), '#10151a'))
          out.push(box(dw / 2 - 0.016, 0.005, 0.0074, lx, c.h * 0.14, s * (zw + 0.0025), '#2d6aa8'))
        }
        out.push(box(0.005, c.h * 0.76, 0.0088, cx, c.h * 0.43, s * (zw + 0.0032), '#090b0d'))
        out.push(box(0.01, 0.016, 0.0075, x1 + 0.016, c.h * 0.42, s * (zw + 0.003), '#3f9a4b'))
      }
      // dark vent grilles in the blue strip above the windows
      for (const fx of [-0.3, 0.34]) {
        out.push(box(0.075, 0.021, 0.004, c.len * fx, c.h * 0.9, s * (zw - 0.002), '#1c2127'))
        for (let k = 0; k < 4; k++) out.push(box(0.065, 0.0016, 0.0052, c.len * fx, c.h * 0.9 - 0.007 + k * 0.0047, s * (zw - 0.002), '#4a525b'))
      }
      // a thin silver rain gutter along the roof edge
      out.push(box(c.len * 0.9, 0.004, 0.004, 0, c.h * 0.845, s * (zw - 0.0005), '#9aa1a9'))
    }

    // roof: long cable duct, two vent hoods with louvres, a resistor box and a few small covers (the roof is light grey)
    for (const f of [-0.27, 0.22]) {
      out.push(box(c.len * 0.17, 0.014, 0.14, c.len * f, c.h + 0.003, 0, '#aab1b9'))
      out.push(box(c.len * 0.18, 0.006, 0.148, c.len * f, c.h - 0.002, 0, '#838a93'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.12, 0.004, 0.012, c.len * f, c.h + 0.011, k * 0.04, '#6a717a'))
    }
    out.push(box(c.len * 0.5, 0.005, 0.022, c.len * -0.02, c.h + 0.002, 0, '#6f767f'))
    out.push(box(c.len * 0.1, 0.02, 0.1, c.len * 0.02, c.h + 0.005, 0, '#8f969f'))
    for (const k of [-1, 1]) out.push(cylX(0.011, 0.012, c.len * 0.4, c.h + 0.006, k * 0.05, '#9aa1a9', 10))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
