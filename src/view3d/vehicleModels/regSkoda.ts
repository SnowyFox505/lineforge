import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Skoda double-deck push-pull cars of DB Regio Bayern (photos "Skoda double-deck"): red body with a white waist stripe under the
 * upper windows and a white sill band, light grey roof with air conditioning units and a ribbed vent on the shoulder, black
 * skirts, single-leaf white doors with a small window, two window rows (lower deck, upper deck). The driving trailer has a
 * sloped, rounded red cab: a big black windscreen in a black frame with the destination display above it, the DB logo under it,
 * slim LED head lights at the lower corners under a white eyebrow, a dark fascia with the coupler cover and apron "ears".
 * Both ends of the game train are cab ends; the cars in between are closed by bellows. No pantograph: the real cars are pulled by a loco.
 */

const WHITE = '#eceef0'
const FASCIA = '#2a2e34'
const INK = '#0b0e12'
const SCREEN = '#141c25'
const ROOF_UNIT = '#9ea5ad'
const ROOF_DARK = '#6a717a'

const WS_BOTTOM = 0.255
const WS_TOP_GAP = 0.046

/** Windscreen outline: centre height, height, width at the bottom and the top. */
function screen(m: FrontMetrics) {
  const y0 = WS_BOTTOM
  const y1 = m.capTop - WS_TOP_GAP
  const wb = 2 * m.capHW - 0.02
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb, wt: wb * 0.9 }
}

export const skodaSign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 + 0.0225, w: s.wt * 0.64, h: 0.022, x: 0.0122 }
}
export const skodaLogo = () => ({ y: WS_BOTTOM - 0.04, z: 0, w: 0.064, h: 0.036, x: 0.0098 })
export const skodaLamp = (m: FrontMetrics) => ({ y: 0.147, z: m.capHW * 0.7, w: 0.058, h: 0.015 })

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

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = skodaLamp(m)
  const sign = skodaSign(m)
  const parts: THREE.BufferGeometry[] = []

  // dark fascia across the lower face: carries the coupler, the head lights sit above it
  parts.push(frontPlate(2 * c.capHW - 0.012, 0.115, 0.02, x + 0.0005, 0.0675, 0, 0.0035, FASCIA))
  // windscreen: black frame, dark glass, a faint reflection, wipers parked at the lower edge
  parts.push(frontShape(taper(s.wb, s.wt, s.h, 0.022, 0.05), x + 0.001, s.cy, 0, 0.006, INK))
  parts.push(frontShape(taper(s.wb - 0.026, s.wt - 0.03, s.h - 0.03, 0.018, 0.042), x + 0.007, s.cy + 0.001, 0, 0.0025, SCREEN))
  parts.push(frontShape(taper(0.07, 0.04, s.h - 0.05, 0.006, 0.006), x + 0.0095, s.cy + 0.001, -s.wb * 0.22, 0.0006, '#1f3042'))
  parts.push(frontShape(taper(0.016, 0.01, s.h - 0.05, 0.003, 0.003), x + 0.0095, s.cy + 0.001, -s.wb * 0.06, 0.0006, '#1f3042'))
  const a = 1.3
  for (const zp of [-0.085, 0.015]) {
    const L = 0.098
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.05 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // dark recess for the destination display above the windscreen
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // marker lights at the top corners
  for (const sz of [-1, 1]) parts.push(box(0.004, 0.006, 0.022, x + 0.0015, c.capTop - 0.006, sz * 0.105, '#f4f6f9'))
  // head light housings with a white eyebrow above each (the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.016, lamp.h + 0.014, 0.007, x + 0.0045, lamp.y, sz * lamp.z, 0.0035, '#0a0c0f'))
    parts.push(box(0.004, 0.006, lamp.w + 0.026, x + 0.0065, lamp.y + 0.021, sz * lamp.z, '#d9dde2'))
    // lower fog / cornering lamp
    parts.push(cylX(0.006, 0.004, x + 0.0058, 0.095, sz * (lamp.z + 0.02), '#cfd4da', 8))
  }
  // coupler cover and the coupler head, air hoses in red and yellow beside it
  parts.push(box(0.024, 0.07, 0.11, x + 0.008, 0.068, 0, '#3a4048'))
  parts.push(box(0.01, 0.03, 0.074, x + 0.018, 0.088, 0, '#4a525c'))
  parts.push(cylX(0.021, 0.03, x + 0.025, 0.064, 0, '#737b86'))
  parts.push(cylX(0.009, 0.014, x + 0.04, 0.064, 0, '#14181c'))
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.004, 0.022, x + 0.018, 0.04, sz * 0.05, sz > 0 ? '#d7b52a' : '#c8212a', 6))
    parts.push(cylX(0.004, 0.02, x + 0.018, 0.04, sz * 0.064, sz > 0 ? '#c8212a' : '#d7b52a', 6))
  }
  // apron / buffer beam, step plates and the black "ears" at the outer corners
  parts.push(box(0.032, 0.03, c.capHW * 2 * 0.96, x + 0.005, 0.017, 0, '#1b2026'))
  parts.push(box(0.012, 0.006, c.capHW * 1.5, x + 0.019, 0.034, 0, '#3a424b'))
  for (const sz of [-1, 1]) {
    parts.push(box(0.05, 0.05, 0.036, x + 0.014, 0.04, sz * (c.capHW - 0.022), '#1b2026'))
    parts.push(box(0.012, 0.012, 0.03, x + 0.04, 0.05, sz * (c.capHW - 0.022), '#a5acb4'))
  }
  // grey roof cap above the display with a small sensor
  parts.push(cylX(0.006, 0.005, x + 0.0015, c.capTop - 0.012, 0.07, '#1a1f25', 10))
  return rakeParts(parts, c.rake, c.h)
}

/** Bellows between two cars: a dark frame with a rubber rim, half a gap long on each side. */
function bellows(c: CarCtx, sx: 1 | -1): THREE.BufferGeometry[] {
  const x = sx * (c.len / 2 + 0.016)
  return [
    box(0.04, c.h * 0.9, c.w * 0.82, x, c.h * 0.46, 0, '#23282e'),
    box(0.042, c.h * 0.8, c.w * 0.7, x, c.h * 0.46, 0, '#14171b'),
    // coupling drawbar between the bogies
    box(0.05, 0.016, 0.04, sx * (c.len / 2 + 0.014), -0.026, 0, '#2a2f36'),
  ]
}

/** The cab-side windows on the wall beside a nose (a narrow lower-deck slit and an upper-deck window). */
function cabSide(c: CarCtx, sign: 1 | -1, sz: 1 | -1): THREE.BufferGeometry[] {
  const nose = sign > 0 ? c.nF : c.nR
  if (nose <= 0) return []
  const t = 0.3
  const wf = 1 - 0.1 * t * t
  const x = sign * (c.len / 2 - nose + nose * t + 0.02)
  const z = sz * (c.w / 2) * wf
  const out: THREE.BufferGeometry[] = []
  out.push(box(0.06, 0.1, 0.006, x, 0.185, z + sz * 0.0015, '#10141a'))
  out.push(box(0.054, 0.094, 0.008, x, 0.185, z + sz * 0.002, GLASS))
  out.push(box(0.07, 0.11, 0.006, x + sign * 0.02, 0.37, z + sz * 0.0015, '#10141a'))
  out.push(box(0.064, 0.104, 0.008, x + sign * 0.02, 0.37, z + sz * 0.002, GLASS))
  return out
}

export const regSkoda: ModelDef = {
  sign: skodaSign,
  logo: skodaLogo,
  lamp: skodaLamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor and the equipment under it: battery boxes, air tanks, toilet tank, cable ducts
    out.push(box(c.len * 0.86, 0.05, c.w * 0.74, 0, -0.03, 0, '#1f242a'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.44, 0.04, 0.008, 0, -0.016, sz * (c.w * 0.37 + 0.002), '#2b3138'))
    out.push(box(c.len * 0.14, 0.05, c.w * 0.5, -c.len * 0.04, -0.045, 0, '#313840'))
    out.push(box(c.len * 0.09, 0.044, c.w * 0.44, c.len * 0.1, -0.042, 0, '#2c3239'))
    out.push(box(c.len * 0.07, 0.04, c.w * 0.38, -c.len * 0.19, -0.04, 0, '#394049'))
    out.push(cylX(0.019, c.len * 0.13, c.len * 0.02, -0.058, 0.07, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.1, c.len * 0.02, -0.056, -0.07, '#3a4149'))
    // trailer bogies: frame, brake discs, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.34
      out.push(box(0.31, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.06, 0.044, 0.1, bx, -0.032, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylZ(0.022, 0.008, bx + dx, -0.027, 0.04, '#5a626c', 10))
        out.push(cylZ(0.022, 0.008, bx + dx, -0.027, -0.04, '#5a626c', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.31, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        out.push(cylX(0.006, 0.06, bx + 0.07, -0.012, sz * 0.045, '#8a929c', 6))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.24
    const wy1 = c.h * 0.42
    const uy0 = c.h * 0.56
    const uy1 = c.h * 0.76
    for (const s of [-1, 1] as const) {
      // lower deck windows: dark rim, glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        const ww = x1 - x0
        out.push(box(ww + 0.012, wy1 - wy0 + 0.012, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#10141a'))
        out.push(box(ww, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
        // upper deck windows: the same bays, split in two by a red pillar
        out.push(box(ww + 0.012, uy1 - uy0 + 0.012, 0.006, cx, (uy0 + uy1) / 2, s * (zw + 0.0015), '#10141a'))
        out.push(box(ww, uy1 - uy0, 0.008, cx, (uy0 + uy1) / 2, s * (zw + 0.002), GLASS))
        out.push(box(0.012, uy1 - uy0 + 0.014, 0.0095, cx, (uy0 + uy1) / 2, s * (zw + 0.0026), c.body))
      }
      // doors: white single leaf with a small window, a dark rubber seam and a push button; the upper deck window above stays
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        const y0 = c.h * 0.1
        const y1 = c.h * 0.46
        out.push(box(dw + 0.012, y1 - y0 + 0.004, 0.006, cx, (y0 + y1) / 2, s * (zw + 0.0015), '#1d2126'))
        out.push(box(dw, y1 - y0 - 0.004, 0.008, cx, (y0 + y1) / 2, s * (zw + 0.002), WHITE))
        out.push(box(dw * 0.58, c.h * 0.17, 0.0095, cx, c.h * 0.33, s * (zw + 0.0026), GLASS))
        // the white waist stripe runs on above the door, and so does the upper deck window with its rim and pillar
        out.push(box(dw + 0.03, c.h * 0.04, 0.0065, cx, c.h * 0.48, s * (zw + 0.0012), WHITE))
        out.push(box(dw + 0.012, uy1 - uy0 + 0.012, 0.006, cx, (uy0 + uy1) / 2, s * (zw + 0.0015), '#10141a'))
        out.push(box(dw, uy1 - uy0, 0.008, cx, (uy0 + uy1) / 2, s * (zw + 0.002), GLASS))
        out.push(box(0.012, uy1 - uy0 + 0.014, 0.0095, cx, (uy0 + uy1) / 2, s * (zw + 0.0026), c.body))
        out.push(box(0.004, y1 - y0 - 0.01, 0.0098, cx - dw * 0.46, (y0 + y1) / 2, s * (zw + 0.003), '#8a9199'))
        out.push(box(0.012, 0.018, 0.009, x1 + 0.014, c.h * 0.37, s * (zw + 0.003), '#3f9a4b'))
        // class marker on the leaf
        out.push(box(0.008, 0.02, 0.0099, cx + dw * 0.22, c.h * 0.43, s * (zw + 0.0031), '#c8212a'))
        // door step
        out.push(box(dw * 0.9, 0.006, 0.014, cx, c.h * 0.088, s * (zw + 0.004), '#23282e'))
      }
      // blue Bayern sticker on the white sill band next to the first door, a small tag by the second
      const d0 = c.doors[0]
      if (d0) out.push(box(0.05, 0.024, 0.0075, d0[1] + 0.07, c.h * 0.15, s * (zw + 0.0025), '#2d6cb5'))
      out.push(...cabSide(c, 1, s))
      out.push(...cabSide(c, -1, s))
    }

    // roof: two air conditioning units with louvres, a cable duct, and the ribbed vent on the shoulder behind the cab
    for (const f of [-0.27, 0.2]) {
      out.push(box(c.len * 0.2, 0.014, 0.15, c.len * f, c.h + 0.003, 0, ROOF_UNIT))
      for (const k of [-2, -1, 0, 1, 2]) out.push(box(c.len * 0.15, 0.004, 0.011, c.len * f, c.h + 0.012, k * 0.03, ROOF_DARK))
      out.push(box(c.len * 0.2, 0.01, 0.006, c.len * f, c.h + 0.005, 0.082, ROOF_DARK))
      out.push(box(c.len * 0.2, 0.01, 0.006, c.len * f, c.h + 0.005, -0.082, ROOF_DARK))
    }
    out.push(box(c.len * 0.28, 0.005, 0.022, -c.len * 0.04, c.h + 0.002, 0, ROOF_DARK))
    for (const sx of [-1, 1]) {
      const nose = sx > 0 ? c.nF : c.nR
      if (nose > 0) {
        // louvred vent panel on the sloping shoulder, and a lighter hatch between the nose and the first unit
        for (const sz of [-1, 1]) {
          for (let k = 0; k < 6; k++) out.push(box(0.012, 0.003, 0.016, sx * (c.len / 2 - nose - 0.18 + k * 0.026), c.h - 0.004, sz * 0.114, ROOF_DARK, 0, sz * 0.9))
        }
        out.push(box(0.16, 0.006, 0.1, sx * (c.len / 2 - nose - 0.04), c.h + 0.003, 0, ROOF_UNIT))
      }
    }

    // bellows towards the neighbouring cars
    if (c.nF === 0) out.push(...bellows(c, 1))
    if (c.nR === 0) out.push(...bellows(c, -1))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
