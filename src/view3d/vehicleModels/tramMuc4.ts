import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich tram R2.2 / R2.2b (Adtranz / Siemens low-floor articulated tram, 27.4 m, 2.30 m wide; photos "Strassenbahn Muenchen / Zug 4":
 * cars 2150, 2140, 2125, 2117): all over Munich blue with a dark base strip, a nearly flat, slightly raked front with one huge
 * windscreen across almost the full width (black rubber rim, destination display behind the top of the glass), two rounded
 * head light housings low on the face (white lamp inside, amber indicator outside) with the Munich coat of arms between them,
 * the car number in white on both sides under the lights, a light bumper bar over a dark apron. Sides: big dark windows,
 * glazed double doors in light frames, a small cab window and a mirror on its arm behind the nose. Roof: a dark equipment box on
 * the cab roof and a diamond pantograph behind it (head car), air-conditioning units on the other cars. Black ribbed bellows
 * between the cars. Both ends are driver's cabs; driving direction +x.
 */

const RUBBER = '#0e1216'
const FRONT_GLASS = '#33485b'
const APRON = '#23282e'
const LIGHT_FRAME = '#c4ccd5'
const ROOF_DARK = '#30353c'
const ROOF_GREY = '#aab2bb'

const SCREEN_BOTTOM = 0.45 // share of the face height
const SCREEN_TOP_GAP = 0.014

/** The windscreen: bottom, top, centre height, height, width. */
function screen(m: FrontMetrics) {
  const y0 = m.capTop * SCREEN_BOTTOM
  const y1 = m.capTop - SCREEN_TOP_GAP
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w: 2 * m.capHW - 0.024 }
}

export const tramMuc4Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.03, w: s.w * 0.74, h: 0.03, x: 0.0122 }
}
export const tramMuc4Lamp = (m: FrontMetrics) => ({ y: 0.105, z: m.capHW * 0.6, w: 0.024, h: 0.024, round: true })

/** Outline of the windscreen: wide at the bottom, the top corners rounded off more than the bottom ones. */
function glassShape(w: number, h: number, rt: number, rb: number, topInset: number): THREE.Shape {
  const s = new THREE.Shape()
  const b = w / 2
  const t = b - topInset
  const y = -h / 2
  s.moveTo(-b + rb, y)
  s.lineTo(b - rb, y)
  s.quadraticCurveTo(b, y, b, y + rb)
  s.lineTo(t + topInset * 0.2, y + h - rt * 1.4)
  s.quadraticCurveTo(t, y + h, t - rt, y + h)
  s.lineTo(-t + rt, y + h)
  s.quadraticCurveTo(-t, y + h, -t - topInset * 0.2, y + h - rt * 1.4)
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

/** A thin bar between two points in the x-y plane (pantograph arms). */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, hex: string): THREE.BufferGeometry {
  return box(Math.hypot(x1 - x0, y1 - y0), t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = tramMuc4Lamp(m)
  const sign = tramMuc4Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // windscreen: black rubber rim, dark glass, a faint reflection, the recess of the destination display at the top
  parts.push(frontShape(glassShape(s.w, s.h, 0.035, 0.012, 0.012), x, s.cy, 0, 0.006, RUBBER))
  parts.push(frontShape(glassShape(s.w - 0.014, s.h - 0.014, 0.03, 0.01, 0.012), x + 0.006, s.cy, 0, 0.0022, FRONT_GLASS))
  parts.push(frontShape(glassShape(0.045, s.h - 0.05, 0.004, 0.003, 0.008), x + 0.0082, s.cy - 0.008, -s.w * 0.2, 0.0006, '#2c3f50'))
  parts.push(frontShape(glassShape(0.02, s.h - 0.05, 0.003, 0.002, 0.004), x + 0.0082, s.cy - 0.008, s.w * 0.12, 0.0006, '#273a4b'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // wipers parked across the lower edge of the glass
  const a = 1.3
  for (const zp of [-0.075, 0.025]) {
    const L = 0.1
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.02 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
    parts.push(box(0.003, 0.006, 0.006, x + 0.0105, s.y0 + 0.02, zp, '#1b2026'))
  }
  // thin light frame line along the lower edge of the glass
  parts.push(box(0.003, 0.004, s.w * 0.96, x + 0.0045, s.y0 - 0.006, 0, '#16191d'))
  // top: small marker light and the rain edge of the roof
  parts.push(box(0.004, 0.005, 0.04, x + 0.002, c.capTop - 0.003, 0, '#f2efe2'))

  // head light housings (dark rounded plates): the white lamp (a separate mesh, see CarMesh) sits inside, the amber indicator outside
  for (const sz of [-1, 1]) {
    const hz = sz * (lamp.z + 0.012)
    parts.push(frontPlate(0.072, 0.04, 0.014, x + 0.0085, lamp.y, hz, 0.0032, '#171b20'))
    parts.push(frontPlate(0.066, 0.034, 0.012, x + 0.0114, lamp.y, hz, 0.0008, '#2a3037'))
    parts.push(cylX(0.0088, 0.003, x + 0.0128, lamp.y, sz * (lamp.z + 0.03), '#e08a14', 12))
    parts.push(cylX(0.0145, 0.002, x + 0.0125, lamp.y, sz * lamp.z, '#c9ced4', 14))
  }
  // Munich coat of arms between the lights: pale shield with a dark figure and a gold crown
  parts.push(frontPlate(0.017, 0.021, 0.004, x + 0.0055, lamp.y, 0, 0.0016, '#e8e4d6'))
  parts.push(frontPlate(0.009, 0.012, 0.002, x + 0.0071, lamp.y - 0.001, 0, 0.0012, '#2b2a28'))
  parts.push(box(0.0012, 0.004, 0.011, x + 0.0071, lamp.y + 0.0082, 0, '#d4a82a'))
  // the car number in white, both sides under the lights
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(0.045, 0.014, 0.003, x + 0.0045, 0.062, sz * 0.088, 0.0016, '#1d2228'))
    for (let k = 0; k < 4; k++) parts.push(box(0.0012, 0.009, 0.0055, x + 0.0066, 0.062, sz * 0.088 - 0.017 + k * 0.0115, '#eceae2'))
  }

  // bumper: light bar over the dark apron, with a dark top lip, and the cover of the coupler
  parts.push(box(0.018, 0.034, c.capHW * 2 * 0.62, x + 0.008, 0.056, 0, c.line))
  parts.push(box(0.02, 0.005, c.capHW * 2 * 0.62, x + 0.008, 0.0745, 0, '#1b2026'))
  parts.push(box(0.012, 0.022, 0.05, x + 0.021, 0.048, 0, '#2d333a'))
  parts.push(cylX(0.011, 0.012, x + 0.03, 0.046, 0, '#5d646d', 10))
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.95, x + 0.004, 0.015, 0, APRON))
  parts.push(box(0.034, 0.006, c.capHW * 2 * 0.9, x + 0.005, 0.003, 0, '#0c0e10'))
  return rakeParts(parts, c.rake, c.h)
}

/** Bellows between two cars: this car's half of it (a dark ribbed tube with a light frame), reaching `ext` into the gap. */
function bellows(c: CarCtx, dir: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const ext = c.spec.gap / 2 + 0.004
  const x0 = dir * (c.len / 2)
  const h = c.h * 0.9
  const w = c.w * 0.9
  const cx = x0 + (dir * ext) / 2
  out.push(box(ext, h, w, cx, c.h * 0.47, 0, '#12161a'))
  out.push(box(ext, c.h * 0.1, w * 0.64, cx, c.h * 0.95, 0, '#12161a'))
  // folds
  for (let k = 0; k < 3; k++) {
    const fx = x0 + dir * (0.012 + k * 0.0155)
    out.push(box(0.007, h + 0.006, w + 0.006, fx, c.h * 0.47, 0, '#1d2329'))
    out.push(box(0.007, c.h * 0.1 + 0.006, w * 0.64 + 0.006, fx, c.h * 0.95, 0, '#1d2329'))
  }
  // light frame at the car end and a roof cover plate over the joint
  out.push(box(0.004, h + 0.012, w + 0.012, x0 + dir * 0.003, c.h * 0.47, 0, '#7e858d'))
  out.push(box(ext + 0.004, 0.005, w * 0.5, cx, c.h * 1.0 + 0.002, 0, '#2a2f36'))
  return out
}

/** The pantograph on the cab roof: a diamond of arms (two on each side) with a wide bow and carbon strip. */
function pantograph(px: number, h: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const y0 = h + 0.016
  out.push(box(0.2, 0.012, 0.15, px, h + 0.006, 0, '#2a2f36'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylX(0.007, 0.012, px + sx * 0.07, h + 0.016, sz * 0.055, '#c9ced5', 8))
  out.push(box(0.17, 0.006, 0.13, px, h + 0.013, 0, '#3a4048'))
  const kneeY = y0 + 0.08
  const topY = y0 + 0.165
  for (const sz of [-1, 1]) {
    const z = sz * 0.022
    // lower arms from the base pivot to the knees, upper arms from the knees to the bow
    out.push(bar(px, y0, px - 0.06, kneeY, z, 0.007, 0.01, '#9aa1aa'))
    out.push(bar(px, y0, px + 0.06, kneeY, z, 0.007, 0.01, '#9aa1aa'))
    out.push(bar(px - 0.06, kneeY, px, topY, z, 0.006, 0.01, '#9aa1aa'))
    out.push(bar(px + 0.06, kneeY, px, topY, z, 0.006, 0.01, '#9aa1aa'))
  }
  out.push(box(0.008, 0.008, 0.05, px - 0.06, kneeY, 0, '#7c838c'))
  out.push(box(0.008, 0.008, 0.05, px + 0.06, kneeY, 0, '#7c838c'))
  // bow with carbon strip and the horns at its ends
  out.push(box(0.022, 0.006, 0.2, px, topY + 0.004, 0, '#d2d7de'))
  out.push(box(0.014, 0.004, 0.19, px, topY + 0.009, 0, '#16181b'))
  for (const sz of [-1, 1]) out.push(box(0.014, 0.012, 0.006, px, topY + 0.008, sz * 0.1, '#d2d7de', 0, sz * 0.5))
  // pull cables down to the roof
  out.push(bar(px, topY, px + 0.02, y0 + 0.012, 0, 0.003, 0.003, '#15181b'))
  return out
}

export const tramMuc4: ModelDef = {
  sign: tramMuc4Sign,
  lamp: tramMuc4Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor and the low equipment under it
    out.push(box(c.len * 0.86, 0.04, c.w * 0.78, 0, -0.022, 0, '#1b2026'))
    out.push(box(c.len * 0.2, 0.04, c.w * 0.52, c.len * 0.02, -0.04, 0, '#313840'))
    out.push(box(c.len * 0.12, 0.034, c.w * 0.44, -c.len * 0.2, -0.036, 0, '#2c3239'))
    out.push(cylX(0.016, c.len * 0.12, c.len * 0.17, -0.044, 0.07, '#3a4149', 10))
    // side skirts between the bogies
    for (const sz of [-1, 1]) out.push(box(c.len * 0.3, 0.036, 0.006, 0, -0.016, sz * (c.w * 0.45), '#272c33'))
    // bogies: the driven ones under the cabs, a joint bogie in the middle of each gap (drawn by the car in front of it)
    const xs: number[] = []
    if (c.role === 'head') xs.push(c.len * 0.3, -c.len / 2 - c.spec.gap / 2)
    else if (c.role === 'mid') xs.push(-c.len / 2 - c.spec.gap / 2)
    else if (c.role === 'tail') xs.push(-c.len * 0.3)
    else xs.push(c.len * 0.3, -c.len * 0.3)
    for (const bx of xs) {
      out.push(box(0.3, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) out.push(box(0.3, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.33
    const wy1 = c.h * 0.86
    const wyc = (wy0 + wy1) / 2
    for (const s of [-1, 1] as const) {
      // windows: black rubber rim, glass pane proud of the wall, a thin bar across the top (the tilting vent strip)
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, wyc, s * (zw + 0.0015), RUBBER))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, wyc, s * (zw + 0.002), GLASS))
        out.push(box(x1 - x0 + 0.004, 0.004, 0.0095, cx, wy0 + (wy1 - wy0) * 0.8, s * (zw + 0.0024), RUBBER))
      }
      // the little cab window and the mirror on its arm behind each nose
      const cab = (xa: number, xb: number, xm: number) => {
        const cx = (xa + xb) / 2
        out.push(box(xb - xa + 0.012, wy1 - wy0 + 0.012, 0.006, cx, wyc, s * (zw + 0.0015), RUBBER))
        out.push(box(xb - xa, wy1 - wy0, 0.008, cx, wyc, s * (zw + 0.002), GLASS))
        out.push(box(0.012, 0.008, 0.034, xm, c.h * 0.74, s * (zw + 0.017), '#15191d'))
        out.push(box(0.013, 0.06, 0.006, xm, c.h * 0.72, s * (zw + 0.036), '#15191d'))
        out.push(box(0.0105, 0.05, 0.0035, xm + 0.0005, c.h * 0.72, s * (zw + 0.0398), '#2f3e4b'))
      }
      if (c.nF > 0) cab(c.len / 2 - c.nF - 0.1, c.len / 2 - c.nF - 0.005, c.len / 2 - c.nF - 0.006)
      if (c.nR > 0) cab(-c.len / 2 + c.nR + 0.005, -c.len / 2 + c.nR + 0.1, -c.len / 2 + c.nR + 0.006)

      // doors: black rubber frame in a light surround, two glazed leaves above a blue lower panel, the seam between the leaves,
      // a green push button beside the door and the light bar of the door indicator above it
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.014, c.h * 0.8, 0.006, cx, c.h * 0.46, s * (zw + 0.0015), LIGHT_FRAME))
        out.push(box(dw + 0.003, c.h * 0.78, 0.007, cx, c.h * 0.46, s * (zw + 0.002), RUBBER))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.001)
          out.push(box(dw / 2 - 0.006, c.h * 0.37, 0.0085, lx, c.h * 0.235, s * (zw + 0.0025), c.line))
          out.push(box(dw / 2 - 0.006, c.h * 0.56, 0.0092, lx, c.h * 0.58, s * (zw + 0.003), '#10151a'))
          out.push(box(dw / 2 - 0.014, c.h * 0.52, 0.0102, lx, c.h * 0.585, s * (zw + 0.0034), GLASS))
        }
        out.push(box(0.004, c.h * 0.77, 0.0105, cx, c.h * 0.46, s * (zw + 0.0042), '#080a0c'))
        out.push(box(0.012, 0.018, 0.008, x1 + 0.016, c.h * 0.43, s * (zw + 0.003), '#3f9a4b'))
        out.push(box(dw * 0.6, 0.006, 0.0065, cx, c.h * 0.9, s * (zw + 0.002), '#d9a21a'))
      }
    }

    // roof
    const noseX = c.nF > 0 ? c.len / 2 - c.nF : c.len / 2
    if (c.nF > 0 || c.nR > 0) {
      // dark equipment box on each cab roof with vent slats and an antenna; the head car carries the diamond pantograph behind it
      const roofBox = (dir: 1 | -1) => {
        const bx = dir * (c.len / 2 - (dir > 0 ? c.nF : c.nR) - 0.19)
        const q: THREE.BufferGeometry[] = []
        q.push(box(0.27, 0.03, 0.15, bx, c.h + 0.012, 0, ROOF_DARK))
        q.push(box(0.27, 0.006, 0.16, bx, c.h - 0.001, 0, '#1e2227'))
        for (let k = 0; k < 4; k++) q.push(box(0.012, 0.004, 0.12, bx - dir * 0.09 + dir * k * 0.03, c.h + 0.0285, 0, '#454c55'))
        q.push(box(0.05, 0.016, 0.09, bx + dir * 0.09, c.h + 0.034, 0, '#3a4048'))
        q.push(box(0.012, 0.03, 0.012, bx - dir * 0.06, c.h + 0.042, 0.05, '#15181b', 0, 0.1))
        q.push(box(0.04, 0.008, 0.02, bx - dir * 0.1, c.h + 0.031, -0.045, '#d9dde2', -0.3 * dir))
        return q
      }
      if (c.nF > 0) {
        out.push(...roofBox(1))
        out.push(...pantograph(noseX - 0.52, c.h))
        out.push(box(0.2, 0.016, 0.13, -c.len * 0.3, c.h + 0.003, 0, ROOF_GREY))
        for (const k of [-1, 0, 1]) out.push(box(0.14, 0.004, 0.012, -c.len * 0.3, c.h + 0.012, k * 0.04, '#7c848d'))
      }
      if (c.nR > 0) {
        out.push(...roofBox(-1))
        for (const f of [0.0, 0.3]) {
          out.push(box(c.len * 0.17, 0.016, 0.13, c.len * f, c.h + 0.003, 0, ROOF_GREY))
          out.push(box(c.len * 0.18, 0.006, 0.14, c.len * f, c.h - 0.002, 0, '#7c848d'))
          for (const k of [-1, 0, 1]) out.push(box(c.len * 0.12, 0.004, 0.012, c.len * f, c.h + 0.012, k * 0.04, '#7c848d'))
        }
      }
    } else {
      for (const f of [-0.26, 0.12]) {
        out.push(box(c.len * 0.17, 0.016, 0.13, c.len * f, c.h + 0.003, 0, ROOF_GREY))
        out.push(box(c.len * 0.18, 0.006, 0.14, c.len * f, c.h - 0.002, 0, '#7c848d'))
        for (const k of [-1, 0, 1]) out.push(box(c.len * 0.12, 0.004, 0.012, c.len * f, c.h + 0.012, k * 0.04, '#7c848d'))
      }
      out.push(box(c.len * 0.3, 0.005, 0.02, 0, c.h + 0.002, 0, '#4b525a'))
    }

    if (c.nF === 0) out.push(...bellows(c, 1))
    if (c.nR === 0) out.push(...bellows(c, -1))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
