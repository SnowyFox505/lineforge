import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin U-Bahn, Stadler series J / JK (photos "U-Bahn Berlin / Zug 1": 7021 and 7045 on the U5, 6007 / 6040 / 6041 on the U2):
 * signal yellow body, black doors in a wide double-leaf frame, big dark windows, a dark grey base stripe, a nearly flat raked
 * front with one huge black windscreen unit whose top carries the destination display, two flat white LED bars low in the glass,
 * a shallow yellow panel with the BERLIN plate and the car number, dark bumper "ears" at the lower corners and the coupler
 * between them. A yellow cab door with a narrow window sits right behind the nose. Third-rail train: current collector
 * shoes on the bogies instead of a pantograph.
 */

const BLACK = '#0b0e12'
const INK = '#121a22'
const EAR = '#555b63'

const GLASS_BOTTOM = 0.115
const GLASS_TOP_GAP = 0.013

/** Black windscreen unit: bottom, top, centre height, height and half width. */
function screen(m: FrontMetrics) {
  const y0 = GLASS_BOTTOM
  const y1 = m.capTop - GLASS_TOP_GAP
  const hw = m.capHW - 0.007
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, hw, wb: 2 * hw, wt: 2 * hw * 0.975 }
}

export const ubahnBerlin1Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.026, w: s.wb * 0.6, h: 0.031, x: 0.0122 }
}
export const ubahnBerlin1Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 + 0.021, z: s.hw * 0.62, w: 0.07, h: 0.0105 }
}

/** Outline of a slightly tapered, rounded panel centred on the origin. */
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

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = ubahnBerlin1Lamp(m)
  const sign = ubahnBerlin1Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // windscreen unit: black frame, dark glass, soft reflections, the dark recess of the destination display, a mullion
  parts.push(frontShape(taper(s.wb, s.wt, s.h, 0.022, 0.04), x, s.cy, 0, 0.006, BLACK))
  parts.push(frontShape(taper(s.wb - 0.014, s.wt - 0.014, s.h - 0.012, 0.018, 0.036), x + 0.006, s.cy, 0, 0.0025, INK))
  parts.push(frontShape(taper(0.07, 0.04, s.h - 0.075, 0.006, 0.006), x + 0.0087, s.cy - 0.01, s.hw * 0.3, 0.0006, '#1b2833'))
  parts.push(frontShape(taper(0.018, 0.01, s.h - 0.075, 0.003, 0.003), x + 0.0087, s.cy - 0.01, s.hw * 0.52, 0.0006, '#1b2833'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0095, sign.y, 0, 0.0015, '#030405'))
  // the narrow side pane of the driver (left side in travel direction = -z) with its own frame
  parts.push(box(0.004, s.h - 0.03, 0.006, x + 0.0087, s.cy - 0.012, -s.hw * 0.62, BLACK))
  // wiper parked across the lower edge of the glass
  const a = 1.3
  const L = 0.11
  parts.push(box(0.0025, L, 0.0045, x + 0.0092, s.y0 + 0.048 + (L / 2) * Math.cos(a), -0.02 + (L / 2) * Math.sin(a), '#040506', 0, a))
  // head light housings (the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) parts.push(frontPlate(lamp.w + 0.012, lamp.h + 0.008, 0.005, x + 0.0085, lamp.y, sz * lamp.z, 0.0014, '#06080a'))
  // small round marker light at the driver's corner
  parts.push(cylX(0.0055, 0.003, x + 0.009, lamp.y + 0.0, -s.hw * 0.88, '#e9edf2', 10))
  // camera / sensor dome above the glass and a top marker
  parts.push(box(0.004, 0.005, 0.045, x + 0.0015, c.capTop - 0.006, 0.0, '#2b3036'))

  // shallow yellow panel below the glass: the BERLIN plate and the car number
  parts.push(box(0.0022, 0.021, 0.062, x + 0.0013, 0.077, 0.078, '#f1f3f5'))
  parts.push(box(0.0026, 0.011, 0.034, x + 0.0016, 0.077, 0.066, '#15181c'))
  parts.push(box(0.0022, 0.016, 0.052, x + 0.0013, 0.075, -0.078, '#e6e9ed'))
  for (let k = 0; k < 4; k++) parts.push(box(0.0026, 0.01, 0.007, x + 0.0016, 0.075, -0.094 + k * 0.0115, '#15181c'))

  // bumper ears at the lower corners, apron and coupler between them
  const ez = Math.min(c.capHW - 0.034, 0.108)
  for (const sz of [-1, 1]) {
    parts.push(box(0.04, 0.078, 0.07, x + 0.012, -0.003, sz * ez, EAR))
    parts.push(box(0.034, 0.012, 0.064, x + 0.011, 0.042, sz * ez, '#2f343a'))
    for (const dy of [-0.02, 0.004]) parts.push(box(0.0026, 0.007, 0.05, x + 0.0328, dy, sz * ez, '#2b3036'))
    // light grey step plate on top of the ear
    parts.push(box(0.03, 0.003, 0.056, x + 0.012, 0.0475, sz * ez, '#8a919a'))
  }
  parts.push(box(0.022, 0.055, c.capHW * 2 - 0.02, x + 0.003, -0.007, 0, '#23272d'))
  parts.push(box(0.03, 0.062, 0.09, x + 0.01, -0.004, 0, '#181b20'))
  // Scharfenberg coupler: neck, head, the black face
  parts.push(box(0.034, 0.02, 0.05, x + 0.027, -0.003, 0, '#7e8691'))
  parts.push(cylX(0.021, 0.03, x + 0.034, -0.004, 0, '#9aa1ab', 14))
  parts.push(cylX(0.011, 0.012, x + 0.05, -0.004, 0, '#0c0e11', 10))
  // air hoses and a red coupling lever
  for (const sz of [-1, 1]) parts.push(cylX(0.004, 0.02, x + 0.03, -0.028, sz * 0.04, '#c8321f', 6))
  parts.push(box(0.01, 0.014, 0.01, x + 0.026, 0.026, 0.045, '#c8321f'))
  return rakeParts(parts, c.rake, c.h)
}

/** The yellow cab door with its narrow tall window on the side wall behind a nose (replaces the last window of the car). */
function cabDoor(c: CarCtx, x0: number, x1: number, sz: 1 | -1, towardsNose: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const w = x1 - x0
  const h = c.h
  const z = (d: number) => sz * (zw + d)
  // thin black seam all round, then the yellow leaf
  out.push(box(w + 0.008, h * 0.8, 0.005, cx, h * 0.48, z(0.0014), '#0f1216'))
  out.push(box(w - 0.004, h * 0.77, 0.0062, cx, h * 0.48, z(0.002), c.body))
  // tall narrow window in the upper part, the handle on the edge away from the nose
  out.push(box(w * 0.56, h * 0.43, 0.0072, cx + towardsNose * w * 0.06, h * 0.64, z(0.0024), '#10161c'))
  out.push(box(0.014, 0.0055, 0.0085, cx - towardsNose * w * 0.36, h * 0.4, z(0.0028), '#272c32'))
  return out
}

/** A small decal plate on the side wall (white plate with a dark mark). */
function sticker(x: number, y: number, z: number, w: number, h: number, sz: 1 | -1): THREE.BufferGeometry[] {
  return [box(w, h, 0.0035, x, y, z + sz * 0.0014, '#eef0f2'), box(w * 0.5, h * 0.55, 0.0042, x, y, z + sz * 0.0016, '#2a2f35')]
}

export const ubahnBerlin1: ModelDef = {
  sign: ubahnBerlin1Sign,
  lamp: ubahnBerlin1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor and the equipment under it: transformer-free metro train, so converters, battery boxes, compressor, air tanks
    out.push(box(c.len * 0.84, 0.05, c.w * 0.74, 0, -0.03, 0, '#1e2327'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.52, 0.03, 0.006, 0, -0.01, sz * (c.w * 0.37 + 0.002), '#2a3037'))
    out.push(box(c.len * 0.2, 0.054, c.w * 0.56, -c.len * 0.07, -0.046, 0, '#2f353d'))
    out.push(box(c.len * 0.12, 0.046, c.w * 0.5, c.len * 0.13, -0.04, 0, '#2a3037'))
    out.push(box(c.len * 0.07, 0.038, c.w * 0.42, c.len * 0.22, -0.037, 0, '#384049'))
    out.push(cylX(0.02, c.len * 0.16, 0, -0.058, 0.075, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.1, c.len * 0.02, -0.056, -0.075, '#3a4149'))
    // bogies: frame, motors, brake discs, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.31
      out.push(box(0.32, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.11, 0.052, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.118, 0.118]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
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
        out.push(cylX(0.005, 0.07, bx + 0.07, -0.012, sz * 0.045, '#8a929c', 6))
        // third-rail current collector: carrier beam out of the bogie frame, insulator, shoe
        out.push(box(0.03, 0.008, 0.05, bx, -0.026, sz * 0.13, '#2b3036'))
        out.push(box(0.022, 0.02, 0.014, bx, -0.036, sz * 0.152, '#7a828c'))
        out.push(box(0.06, 0.005, 0.02, bx, -0.047, sz * 0.152, '#b9bfc7'))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.44
    const wy1 = c.h * 0.84
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) {
          out.push(...cabDoor(c, x0, x1, s, (x0 + x1) / 2 > 0 ? 1 : -1))
          continue
        }
        // windows: dark rim, glass pane proud of the wall
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#0f1318'))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // double doors: black frame, two glass leaves with the seam between them, door-leaf edges, a light bar above
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.01, c.h * 0.78, 0.006, cx, c.h * 0.47, s * (zw + 0.0015), '#0d1013'))
        out.push(box(dw, c.h * 0.76, 0.008, cx, c.h * 0.47, s * (zw + 0.002), '#15191d'))
        for (const sl of [-1, 1]) out.push(box(dw / 2 - 0.016, c.h * 0.6, 0.0095, cx + sl * (dw / 4 + 0.0016), c.h * 0.54, s * (zw + 0.0026), GLASS))
        out.push(box(0.006, c.h * 0.74, 0.0105, cx, c.h * 0.47, s * (zw + 0.003), '#050607'))
        out.push(box(dw * 0.6, 0.006, 0.006, cx, c.h * 0.875, s * (zw + 0.002), '#d9dde2'))
        out.push(box(dw - 0.006, 0.012, 0.009, cx, c.h * 0.13, s * (zw + 0.0026), '#262b31'))
        // stickers beside the door on the yellow wall
        out.push(...sticker(x1 + 0.0225, c.h * 0.32, s * zw, 0.012, 0.02, s))
        out.push(box(0.008, 0.008, 0.0035, x1 + 0.0225, c.h * 0.22, s * (zw + 0.0014), '#d62f22'))
      }
      // BERLIN plate low on the wall right behind the nose
      for (const [nose, sgn] of [[c.nF, 1], [c.nR, -1]] as const) {
        if (nose <= 0) continue
        const px = sgn * (c.len / 2 - nose - 0.065)
        out.push(box(0.06, 0.02, 0.004, px, c.h * 0.2, s * (zw + 0.0016), '#f1f3f5'))
        out.push(box(0.04, 0.009, 0.0046, px - sgn * 0.004, c.h * 0.2, s * (zw + 0.0018), '#17191d'))
      }
    }

    // roof: air conditioning units with louvres, long vent strips along both edges, a cable duct; an aerial on the head car
    const roofY = c.h
    for (const f of [-0.27, 0.22]) {
      out.push(box(c.len * 0.2, 0.014, 0.15, c.len * f, roofY + 0.004, 0, '#f1c83c'))
      out.push(box(c.len * 0.21, 0.006, 0.158, c.len * f, roofY - 0.001, 0, '#d9a80d'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.15, 0.003, 0.014, c.len * f, roofY + 0.0125, k * 0.042, '#9a7a12'))
    }
    for (const sz of [-1, 1]) out.push(box(c.len * 0.34, 0.005, 0.03, -c.len * 0.02, roofY + 0.0015, sz * 0.088, '#e3b20e'))
    out.push(box(c.len * 0.3, 0.006, 0.022, -c.len * 0.03, roofY + 0.003, 0, '#d6a50c'))
    if (c.nF > 0 || c.nR > 0) {
      const sx = c.nF > 0 ? 1 : -1
      out.push(box(0.045, 0.014, 0.012, sx * (c.len / 2 - c.nF - c.nR - 0.2), roofY + 0.006, 0.05, '#bfc4ca', 0))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
