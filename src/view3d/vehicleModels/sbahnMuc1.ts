import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich S-Bahn class 423 (photos "S-Bahn München / Zug 1", e.g. 423 724-4): red body (the line colour), a thin white pinstripe over
 * the windows, a white stripe low on the body over a dark grey skirt, narrow windows in pairs between wide white double doors, a
 * rounded front with a big windscreen in a black frame whose top holds the destination display, a grey panel below the glass,
 * round head lights low at the corners with the DB logo between them, coupler and buffer beam below, long dark roof units.
 */

const WHITE = '#e9ebec'
const FRAME = '#0d1013'
const GREY_PANEL = '#767b81'

/** Local helpers (non-indexed, position / normal / color only, like everything in parts.ts). */
function cylY(r: number, len: number, x: number, y: number, z: number, hex: string, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg)
  g.translate(x, y, z)
  return flat(g, hex)
}
function flat(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g
  if (ng !== g) g.dispose()
  ng.deleteAttribute('uv')
  if (!ng.attributes.normal) ng.computeVertexNormals()
  return paint(ng, hex)
}
/** A colour made darker or lighter by a factor. */
function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex).multiplyScalar(f)
  return '#' + c.getHexString()
}

/** Geometry of the front windscreen block, in absolute car-frame heights. H = top of the end face. */
function screen(m: FrontMetrics) {
  const H = m.capTop
  const y0 = H * 0.505
  const y1 = H - 0.008
  const w = Math.min(2 * m.capHW - 0.026, 0.285)
  return { H, y0, y1, w, cy: (y0 + y1) / 2, h: y1 - y0 }
}

export const sbahnMuc1Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.025, w: 0.182, h: 0.033, x: 0.0122 }
}
export const sbahnMuc1Logo = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.H * 0.31, z: 0, w: 0.05, h: 0.028, x: 0.0098 }
}
export const sbahnMuc1Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.H * 0.305, z: Math.min(0.118, m.capHW - 0.04), w: 0.044, h: 0.03 }
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = sbahnMuc1Lamp(m)
  const sign = sbahnMuc1Sign(m)
  const logo = sbahnMuc1Logo(m)
  const parts: THREE.BufferGeometry[] = []

  // grey panel below the windscreen (where the wipers park and the number sits)
  parts.push(frontPlate(2 * m.capHW - 0.012, s.y0 - s.H * 0.34 + 0.004, 0.014, x, (s.y0 + s.H * 0.34) / 2 - 0.002, 0, 0.0035, GREY_PANEL))
  // windscreen: black frame, dark glass inset, black recess for the destination display
  parts.push(frontPlate(s.w, s.h, 0.04, x, s.cy, 0, 0.007, FRAME))
  const gy0 = s.y0 + 0.011
  const gy1 = s.y1 - 0.047
  parts.push(frontPlate(s.w - 0.02, gy1 - gy0, 0.02, x + 0.007, (gy0 + gy1) / 2, 0, 0.0025, '#2b3c4b'))
  // a slim light reflection across the glass (the windscreen is strongly curved on the real train)
  parts.push(frontPlate(0.012, gy1 - gy0 - 0.02, 0.004, x + 0.0095, (gy0 + gy1) / 2, -(s.w / 2 - 0.035), 0.0007, '#4a5e70'))
  parts.push(frontPlate(sign.w + 0.014, sign.h + 0.008, 0.007, x + 0.0095, sign.y, 0, 0.0015, '#050607'))
  // centre pillar-less glass: two wipers parked low on the glass, one at the driver's side and one in the middle
  const a = 1.3
  for (const zp of [-0.105, -0.005]) {
    const L = 0.1
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, gy0 + 0.02 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // number plate on the grey panel
  parts.push(box(0.003, 0.012, 0.05, x + 0.0045, s.H * 0.4, -0.07, '#d7dadd'))

  // head light housings: round, dark ring, a lighter inner ring (the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.032, 0.012, x + 0.002, lamp.y, sz * lamp.z, '#1b1f23', 16))
    parts.push(cylX(0.026, 0.0125, x + 0.0023, lamp.y, sz * lamp.z, '#4a5058', 16))
  }
  // DB logo recess (the logo itself is a separate textured plane)
  parts.push(frontPlate(logo.w + 0.008, logo.h + 0.008, 0.004, x + 0.0085, logo.y, 0, 0.0007, '#8a1018'))

  // white / grey bumper details: step plates left and right of the coupler
  for (const sz of [-1, 1]) parts.push(box(0.012, 0.014, 0.05, x + 0.002, 0.0, sz * 0.11, '#9ba0a6'))
  // buffer beam, coupler cover with the Scharfenberg coupler head and two air hoses
  parts.push(box(0.03, 0.026, 2 * m.capHW * 0.9, x + 0.004, -0.012, 0, '#24282d'))
  parts.push(box(0.024, 0.062, 0.105, x + 0.009, 0.026, 0, '#8e949b'))
  parts.push(box(0.01, 0.045, 0.085, x + 0.0225, 0.026, 0, '#6b727a'))
  parts.push(cylX(0.019, 0.03, x + 0.036, 0.026, 0, '#4b5159', 14))
  parts.push(cylX(0.011, 0.014, x + 0.054, 0.026, 0, '#1a1d21', 12))
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.004, 0.03, x + 0.026, 0.002, sz * 0.045, '#111315', 6))
    parts.push(cylX(0.005, 0.01, x + 0.04, 0.002, sz * 0.045, '#c9a227', 6))
  }
  return parts
}

/** The cab door behind the nose: a darker red leaf with a small dark window and a handle. */
function cabDoor(c: CarCtx, sign: 1 | -1): THREE.BufferGeometry[] {
  const nose = sign > 0 ? c.nF : c.nR
  if (nose <= 0) return []
  const out: THREE.BufferGeometry[] = []
  const x = sign * (c.len / 2 - nose - 0.095)
  const zw = c.w / 2
  const door = shade(c.line, 0.93)
  for (const s of [-1, 1]) {
    out.push(box(0.108, c.h * 0.74, 0.005, x, c.h * 0.43, s * (zw + 0.001), '#14171a'))
    out.push(box(0.098, c.h * 0.71, 0.006, x, c.h * 0.43, s * (zw + 0.0016), door))
    out.push(box(0.07, c.h * 0.24, 0.007, x, c.h * 0.6, s * (zw + 0.002), '#1d2a36'))
    out.push(box(0.016, 0.005, 0.009, x + sign * 0.03, c.h * 0.4, s * (zw + 0.003), '#c9cdd1'))
  }
  return out
}

/** Pseudo lettering: a row of small white blocks (a company name at this scale). */
function lettering(x0: number, y: number, z: number, side: number, n: number, hh: number, unit: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  let x = x0
  for (let i = 0; i < n; i++) {
    const w = unit * (0.7 + ((i * 5) % 3) * 0.45)
    out.push(box(w, hh * (0.75 + ((i * 7) % 4) * 0.08), 0.0016, x + w / 2, y, side * z, '#f4f4f2'))
    x += w + unit * 0.45
  }
  return out
}

function sideDecor(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const xa = c.nR > 0 ? -c.len / 2 + c.nR : -c.len / 2
  const xb = c.nF > 0 ? c.len / 2 - c.nF : c.len / 2
  for (const s of [-1, 1]) {
    // thin white pinstripe above the windows
    out.push(box(xb - xa, 0.0045, 0.002, (xa + xb) / 2, c.h * 0.775, s * (zw + 0.001), WHITE))
    // door-side pictograms (bicycle, pram, wheelchair) above each door
    for (const [x0, x1] of c.doors) {
      const cx = (x0 + x1) / 2
      for (let k = -1; k <= 1; k++) out.push(box(0.014, 0.012, 0.0016, cx + k * 0.03, c.h * 0.84, s * (zw + 0.0008), '#f1f1ef'))
    }
  }
  // company lettering and roundel between the first two doors
  if (c.doors.length >= 2) {
    const [, d0x1] = c.doors[0]
    const [d1x0] = c.doors[1]
    const x0 = d0x1 + 0.05
    const room = d1x0 - 0.05 - x0
    if (room > 0.1) {
      for (const s of [-1, 1]) {
        const k = s > 0 ? 1 : -1
        out.push(...lettering(s > 0 ? x0 : x0, c.h * 0.31, zw + 0.0012, k, 8, 0.012, Math.min(0.0075, room / 14)))
        out.push(...lettering(x0, c.h * 0.255, zw + 0.0012, k, 5, 0.01, Math.min(0.0075, room / 14)))
      }
    }
    // green S-Bahn roundel near the first window
    for (const s of [-1, 1]) {
      const rx = Math.max(c.wins[0]?.[0] ?? x0, x0 - 0.25) + 0.03
      out.push(cylZ(0.0125, 0.0025, rx, c.h * 0.3, s * (zw + 0.0012), '#2f9e46', 12))
      out.push(box(0.012, 0.004, 0.0032, rx, c.h * 0.3, s * (zw + 0.0016), '#fafafa'))
    }
  }
  return out
}

/** Dark roof units with louvres, a small antenna on the head car, and a pantograph on the middle car. */
function roof(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const y = c.h
  const unit = (cx: number, len: number) => {
    out.push(box(len, 0.024, 0.172, cx, y + 0.008, 0, '#5b6169'))
    out.push(box(len + 0.012, 0.006, 0.18, cx, y - 0.002, 0, '#3f444b'))
    const n = Math.floor(len / 0.034)
    for (let i = 0; i < n; i++) out.push(box(0.014, 0.004, 0.15, cx - len / 2 + 0.022 + i * 0.034, y + 0.0215, 0, '#7e858d'))
    // raised lip along both sides
    for (const sz of [-1, 1]) out.push(box(len, 0.008, 0.006, cx, y + 0.02, sz * 0.082, '#4b5057'))
  }
  if (c.role === 'head' || c.role === 'single') {
    unit(c.len / 2 - c.nF - 0.36, 0.44)
    unit(-0.2, 0.34)
    out.push(box(0.05, 0.014, 0.01, c.len / 2 - c.nF - 0.72, y + 0.008, 0, '#d9dde2', 0, 0))
    out.push(cylY(0.01, 0.018, c.len / 2 - c.nF - 0.65, y + 0.009, 0.04, '#cfd3d8', 8))
  }
  if (c.role === 'tail' || c.role === 'single') {
    unit(-(c.len / 2 - c.nR - 0.36), 0.44)
    if (c.role === 'tail') unit(0.2, 0.34)
  }
  if (c.role === 'mid') {
    unit(-0.52, 0.42)
    unit(0.52, 0.42)
    // pantograph: base frame on four insulators, two arms, contact strip
    const bx = 0
    out.push(box(0.14, 0.01, 0.15, bx, y + 0.014, 0, '#2a2f35'))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylY(0.007, 0.02, bx + sx * 0.055, y + 0.007, sz * 0.055, '#c8ccd0', 8))
    const a1 = 1.05
    const L = 0.1
    const kx = bx - 0.04 + Math.cos(a1) * L
    const ky = y + 0.024 + Math.sin(a1) * L
    for (const sz of [-1, 1]) {
      out.push(box(L, 0.007, 0.007, bx - 0.04 + (Math.cos(a1) * L) / 2, y + 0.024 + (Math.sin(a1) * L) / 2, sz * 0.045, '#8f98a3', a1))
      out.push(box(L, 0.007, 0.007, kx - (Math.cos(a1) * L) / 2, ky + (Math.sin(a1) * L) / 2, sz * 0.045, '#8f98a3', Math.PI - a1))
    }
    out.push(box(0.014, 0.006, 0.19, kx - Math.cos(a1) * L, ky + Math.sin(a1) * L, 0, '#1b1e22'))
    out.push(box(0.012, 0.004, 0.17, kx - Math.cos(a1) * L, ky + Math.sin(a1) * L + 0.004, 0, '#6b7078'))
  }
  return out
}

export const sbahnMuc1: ModelDef = {
  sign: sbahnMuc1Sign,
  logo: sbahnMuc1Logo,
  lamp: sbahnMuc1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // underframe and equipment hanging under the floor
    out.push(box(c.len * 0.82, 0.05, c.w * 0.68, 0, -0.03, 0, '#1f2328'))
    out.push(box(c.len * 0.17, 0.056, c.w * 0.52, -c.len * 0.08, -0.043, 0, '#323941'))
    out.push(box(c.len * 0.1, 0.048, c.w * 0.44, c.len * 0.14, -0.04, 0, '#2c3238'))
    out.push(box(c.len * 0.07, 0.04, c.w * 0.4, -c.len * 0.2, -0.036, 0, '#3a4149'))
    out.push(cylX(0.02, c.len * 0.16, c.len * 0.02, -0.056, 0.07, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.1, c.len * 0.02, -0.055, -0.07, '#454c55'))
    // dark lower side skirt panels between the bogies
    for (const sz of [-1, 1]) out.push(box(c.len * 0.34, 0.034, 0.006, 0, 0.012, sz * (c.w / 2 - 0.012), '#2a2f35'))
    // bogies: frame, two motors with gearboxes, air springs, axle boxes, two axles with wheels and brake discs on the rails (z = +-0.085)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.3, 0.02, 0.2, bx, -0.026, 0, '#13171b'))
      for (const sz of [-1, 1]) {
        out.push(box(0.31, 0.014, 0.014, bx, -0.016, sz * 0.1, '#1e2328'))
        // secondary air spring on the frame, primary springs above the axle boxes
        out.push(cylY(0.017, 0.022, bx, -0.012, sz * 0.07, '#2b3036', 8))
      }
      out.push(box(0.012, 0.016, 0.2, bx, -0.038, 0, '#20252b'))
      for (const dx of [-0.13, 0.13]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(box(0.05, 0.034, 0.05, bx + dx * 0.55, -0.036, 0, '#2b3137'))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#59616b', 14))
          out.push(cylZ(0.0215, 0.018, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          // brake disc and axle box with its spring
          out.push(cylZ(0.027, 0.005, bx + dx, -0.027, sz * 0.057, '#464c54', 12))
          out.push(box(0.026, 0.026, 0.02, bx + dx, -0.027, sz * 0.105, '#1b1f23'))
          out.push(cylY(0.0075, 0.02, bx + dx, -0.006, sz * 0.1, '#6b737c', 6))
        }
      }
      // gearbox housings with a motor on the inner side
      out.push(cylZ(0.021, 0.075, bx - 0.065, -0.034, 0, '#323941', 10))
      out.push(cylZ(0.021, 0.075, bx + 0.065, -0.034, 0, '#323941', 10))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.4
    const wy1 = c.h * 0.72
    for (const s of [-1, 1]) {
      // windows: dark grey rim, glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.005, cx, (wy0 + wy1) / 2, s * (zw + 0.0012), '#23282d'))
        out.push(box(x1 - x0, wy1 - wy0, 0.007, cx, (wy0 + wy1) / 2, s * (zw + 0.0018), GLASS))
      }
      // doors: wide white double doors, dark frame, a narrow dark window in each leaf, a seam, a green push button and a step
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.01, c.h * 0.76, 0.005, cx, c.h * 0.46, s * (zw + 0.0013), '#2d3237'))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0015)
          out.push(box(dw / 2 - 0.006, c.h * 0.71, 0.0065, lx, c.h * 0.45, s * (zw + 0.0019), '#dee0e2'))
          out.push(box(dw / 2 - 0.032, c.h * 0.4, 0.008, lx, c.h * 0.53, s * (zw + 0.0024), GLASS))
          out.push(box(dw / 2 - 0.006, 0.005, 0.007, lx, c.h * 0.17, s * (zw + 0.0022), '#b9bdc1'))
        }
        out.push(box(0.004, c.h * 0.72, 0.0085, cx, c.h * 0.45, s * (zw + 0.0026), '#2d3237'))
        out.push(box(0.012, 0.016, 0.006, x1 + 0.013, c.h * 0.42, s * (zw + 0.0024), '#c8ccd0'))
        out.push(box(0.006, 0.006, 0.007, x1 + 0.013, c.h * 0.42, s * (zw + 0.0028), '#3fae55'))
        out.push(box(dw, 0.01, 0.014, cx, c.h * 0.025, s * (zw + 0.0035), '#3a4046'))
      }
    }
    out.push(...sideDecor(c))
    out.push(...cabDoor(c, 1), ...cabDoor(c, -1))
    out.push(...roof(c))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
