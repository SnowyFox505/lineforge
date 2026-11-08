import { RAIL } from '../model/scale'
import { RAIL_Y } from './heights'
import { posOn } from './network3d'
import type { Bridge, LineNet, Network3D } from './network3d'
import { addArches, addDeck, boxAlong3, deckPiers, deckPoints, matrixAt, sideOf } from './Tracks3D'
import type { Bufs } from './Tracks3D'

/** Pose on the line axis at arc length d. */
const poseAt = (ln: LineNet, d: number) => posOn(ln, 'c', Math.min(ln.total, Math.max(0, d)))

/** Deck plate and parapets shared by most bridge types. */
function deckPlate(b: Bufs, ln: LineNet, d0: number, d1: number, thick: number, parapet = true) {
  const pts = deckPoints(ln, d0, d1)
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k]
    const q = pts[k + 1]
    b.girders.push(boxAlong3(p.x, p.y, p.z, q.x, q.y, q.z, 1.25 * RAIL, thick, RAIL_Y - 0.02 - thick, 0.06))
    if (!parapet) continue
    for (const sgn of [-1, 1]) {
      const a = sideOf(p, 0.6 * RAIL * sgn)
      const c = sideOf(q, 0.6 * RAIL * sgn)
      b.curbs.push(boxAlong3(a.x, p.y, a.z, c.x, q.y, c.z, 0.05, 0.09, RAIL_Y - 0.02, 0.04))
    }
  }
}

/** Piers under the deck at the ends of the bridge and, for long ones, every `every` units. */
function slimPiers(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number, every: number) {
  const len = d1 - d0
  const n = Math.max(1, Math.round(len / every))
  for (let k = 0; k <= n; k++) {
    const p = poseAt(ln, d0 + (len * k) / n)
    const g = net.groundAt(p.x, p.z)
    const h = p.y + RAIL_Y - 0.3 - g
    if (h <= 0.2) continue
    const spots = [-1, 1].map((s) => sideOf(p, 0.34 * RAIL * s))
    if (spots.some((s) => net.trackBelow(s.x, s.z, p.y, ln.line.id))) continue
    for (const s of spots) b.piers.push(matrixAt(s.x, g + h / 2 - 0.05, s.z, 0, 0.13, h + 0.1, 0.13))
  }
}

/** Riveted steel truss: two lattice girders beside the track. */
function addTruss(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number) {
  deckPlate(b, ln, d0, d1, 0.14, false)
  const len = d1 - d0
  const n = Math.max(2, Math.round(len / 0.85))
  const H = 0.55
  for (const sgn of [-1, 1]) {
    const pts = Array.from({ length: n + 1 }, (_, k) => {
      const p = poseAt(ln, d0 + (len * k) / n)
      const s = sideOf(p, 0.64 * RAIL * sgn)
      return { x: s.x, z: s.z, y: p.y, tx: p.tx, tz: p.tz }
    })
    for (let k = 0; k < n; k++) {
      const p = pts[k]
      const q = pts[k + 1]
      b.iron.push(boxAlong3(p.x, p.y, p.z, q.x, q.y, q.z, 0.05, 0.05, RAIL_Y - 0.1, 0.03)) // bottom chord
      b.iron.push(boxAlong3(p.x, p.y, p.z, q.x, q.y, q.z, 0.06, 0.05, RAIL_Y + H, 0.03)) // top chord
      // diagonals alternate
      const up = k % 2 === 0
      b.iron.push(boxAlong3(p.x, p.y + (up ? 0 : H), p.z, q.x, q.y + (up ? H : 0), q.z, 0.035, 0.035, RAIL_Y - 0.1, 0.02))
    }
    for (const p of pts) b.iron.push(matrixAt(p.x, p.y + RAIL_Y + H / 2 - 0.05, p.z, 0, 0.04, H + 0.1, 0.04))
  }
  // cross bracing on top
  for (let k = 0; k <= n; k += 2) {
    const p = poseAt(ln, d0 + (len * k) / n)
    const a = sideOf(p, 0.64 * RAIL)
    const c = sideOf(p, -0.64 * RAIL)
    b.iron.push(boxAlong3(a.x, p.y, a.z, c.x, p.y, c.z, 0.04, 0.04, RAIL_Y + H, 0))
  }
  for (const pr of deckPiers(net, ln, d0, d1)) b.piers.push(matrixAt(pr.x, pr.ground + pr.h / 2 - 0.05, pr.z, pr.yaw, 0.2, pr.h + 0.1, 0.2))
}

/** Cable-stayed bridge: a slim deck hung from two masts. */
function addCable(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number) {
  const len = d1 - d0
  if (len < 7) return addSlim(b, net, ln, d0, d1)
  deckPlate(b, ln, d0, d1, 0.12)
  const mid = poseAt(ln, d0 + len * 0.5)
  const g = net.groundAt(mid.x, mid.z)
  const top = mid.y + RAIL_Y + Math.min(2.2, 0.9 + len * 0.12)
  const tops = [-1, 1].map((s) => ({ ...sideOf(mid, 0.78 * RAIL * s), s }))
  for (const t of tops) {
    b.concrete.push(matrixAt(t.x, g + (top - g) / 2, t.z, 0, 0.17, top - g, 0.17))
    // cables fan out to both sides
    const cnt = Math.min(7, Math.floor(len / 1.1 / 2))
    for (let k = 1; k <= cnt; k++) {
      for (const dir of [-1, 1]) {
        const d = d0 + len * 0.5 + dir * k * (len * 0.46) / cnt
        const p = poseAt(ln, d)
        const a = sideOf(p, 0.52 * RAIL * t.s)
        b.cables.push(boxAlong3(t.x, top - 0.1 - (k % 2) * 0.1, t.z, a.x, p.y + RAIL_Y, a.z, 0.018, 0.018, 0, 0))
      }
    }
  }
  const c0 = tops[0]
  const c1 = tops[1]
  b.concrete.push(boxAlong3(c0.x, top, c0.z, c1.x, top, c1.z, 0.12, 0.12, -0.06, 0))
  slimPiers(b, net, ln, d0, d1, Math.max(len, 8))
}

/** Tied arch: a white steel arch over the deck with vertical hangers. */
function addTiedArch(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number) {
  const len = d1 - d0
  if (len < 5) return addSlim(b, net, ln, d0, d1)
  deckPlate(b, ln, d0, d1, 0.18)
  const H = Math.min(1.5, 0.5 + len * 0.13)
  const n = Math.max(6, Math.round(len / 0.5))
  for (const sgn of [-1, 1]) {
    const rib = Array.from({ length: n + 1 }, (_, k) => {
      const t = k / n
      const p = poseAt(ln, d0 + len * t)
      const s = sideOf(p, 0.66 * RAIL * sgn)
      return { x: s.x, z: s.z, y: p.y + RAIL_Y + 0.05 + H * Math.sin(Math.PI * t), py: p.y }
    })
    for (let k = 0; k < n; k++) b.steel.push(boxAlong3(rib[k].x, rib[k].y, rib[k].z, rib[k + 1].x, rib[k + 1].y, rib[k + 1].z, 0.08, 0.09, 0, 0.03))
    for (let k = 2; k < n - 1; k += 2) {
      const r = rib[k]
      const base = r.py + RAIL_Y
      b.cables.push(matrixAt(r.x, (base + r.y) / 2, r.z, 0, 0.02, r.y - base, 0.02))
    }
  }
  slimPiers(b, net, ln, d0, d1, Math.max(len, 8))
}

/** Slender prestressed-concrete bridge with few, thin piers. */
function addSlim(b: Bufs, net: Network3D, ln: LineNet, d0: number, d1: number) {
  deckPlate(b, ln, d0, d1, 0.16)
  const pts = deckPoints(ln, d0, d1)
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k]
    const q = pts[k + 1]
    for (const sgn of [-1, 1]) {
      const a = sideOf(p, 0.66 * RAIL * sgn)
      const c = sideOf(q, 0.66 * RAIL * sgn)
      b.steel.push(boxAlong3(a.x, p.y, a.z, c.x, q.y, c.z, 0.025, 0.1, RAIL_Y + 0.07, 0.03)) // glass-like rail
    }
  }
  slimPiers(b, net, ln, d0, d1, 5.5)
}

/** One bridge over water, drawn in the style the user chose. */
export function addBridge(b: Bufs, net: Network3D, ln: LineNet, br: Bridge) {
  switch (br.style) {
    case 'stone':
      return addArches(b, net, ln, br.d0, br.d1, 2.7, 'stone')
    case 'brick':
      return addArches(b, net, ln, br.d0, br.d1, 1.15, 'brick')
    case 'truss':
      return addTruss(b, net, ln, br.d0, br.d1)
    case 'cable':
      return addCable(b, net, ln, br.d0, br.d1)
    case 'arch':
      return addTiedArch(b, net, ln, br.d0, br.d1)
    case 'slim':
      return addSlim(b, net, ln, br.d0, br.d1)
    default:
      return addDeck(b, net, ln, br.d0, br.d1)
  }
}
