import type { StreetStyle, Zone } from '../model/types'

export type { StreetStyle }

/**
 * Street pattern of towns, shaped like a grown German city: neighbourhoods ("Kieze") with their own street
 * grid at different angles, long diagonal avenues through the centre and a ring road. The same data draws
 * the streets on the 2D map and decides where the 3D buildings stand, so both always agree.
 */
export type UrbanKind = 'city' | 'suburb'

type Pt = [number, number]

export interface Patch {
  id: number
  /** centre of the neighbourhood (cells) */
  cx: number
  cy: number
  angle: number
  /** street positions along both axes of the patch's rotated frame (relative to its centre), sorted */
  us: number[]
  vs: number[]
  majorU: boolean[]
  majorV: boolean[]
  /** outline of the neighbourhood (voronoi cell), clockwise */
  cell: Pt[]
}

export interface Avenues {
  cx: number
  cy: number
  /** directions of the straight avenues through the centre (radians) */
  angles: number[]
  /** radius of the ring road (cells), 0 = none */
  ring: number
}

/** The street look of an area: a style and a number (another number gives another town of the same style). */
export interface StreetLook {
  style: StreetStyle
  seed: number
}

export const DEFAULT_LOOK: StreetLook = { style: 'gewachsen', seed: 0 }

export const STREET_STYLES: { id: StreetStyle; label: string; hint: string }[] = [
  { id: 'gewachsen', label: 'Gewachsen', hint: 'Viertel mit eigenen Straßenrastern in verschiedenen Winkeln, wie in einer alten Stadt' },
  { id: 'raster', label: 'Schachbrett', hint: 'Gerade Straßen in einem gleichmäßigen Raster, wie in einer Planstadt' },
  { id: 'dicht', label: 'Dicht', hint: 'Kleine Blöcke und viele Straßen, wie in einer Altstadt' },
  { id: 'weit', label: 'Weitläufig', hint: 'Große Blöcke mit breiten Abständen' },
  { id: 'strahlen', label: 'Strahlen', hint: 'Straßen laufen sternförmig auf die Mitte der Karte zu' },
]

export const lookKey = (l: StreetLook) => `${l.style}.${l.seed}`

/** The street look of an area (the default one when it has none of its own). */
export const lookOf = (z: Zone | undefined): StreetLook => z?.street ?? DEFAULT_LOOK

const CONFIG: Record<UrbanKind, { spacing: number; gap: number; majorEvery: number; seed: number }> = {
  city: { spacing: 26, gap: 4.9, majorEvery: 3, seed: 7 },
  suburb: { spacing: 32, gap: 6.2, majorEvery: 3, seed: 19 },
}

type Cfg = (typeof CONFIG)[UrbanKind]

/** The numbers of a style: the default style keeps the original values, so old towns look as they always did. */
function cfgOf(kind: UrbanKind, look: StreetLook): Cfg {
  const b = CONFIG[kind]
  switch (look.style) {
    case 'dicht':
      return { ...b, spacing: b.spacing * 0.78, gap: b.gap * 0.76, majorEvery: 4 }
    case 'weit':
      return { ...b, spacing: b.spacing * 1.3, gap: b.gap * 1.5 }
    case 'strahlen':
      return { ...b, spacing: b.spacing * 0.9 }
    case 'raster': {
      // blocks of equal size; a patch is six streets wide so its borders lie on streets
      const gap = Math.round(b.gap)
      return { ...b, gap, spacing: gap * 6 }
    }
    default:
      return b
  }
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Clip a polygon to the half plane of points closer to `a` than to `b`. */
function clipCloser(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const nx = b[0] - a[0]
  const ny = b[1] - a[1]
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const f = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny // <= 0 on a's side
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const fp = f(p)
    const fq = f(q)
    if (fp <= 0) out.push(p)
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

const patchCache = new Map<string, Patch[]>()

/**
 * A chessboard town: every neighbourhood has the same angle and the streets run straight through from one to the next
 * (their positions are multiples of the block size in the common frame), so the town is one even grid.
 */
function rasterPatches(size: number, look: StreetLook, cfg: Cfg): Patch[] {
  const theta = look.seed === 0 ? 0.12 : ((look.seed * 0.6180339) % 1) * (Math.PI / 2)
  const ca = Math.cos(theta)
  const sa = Math.sin(theta)
  const S = cfg.spacing
  const R = S * 1.3
  const n = Math.ceil((size * 1.5) / S) + 1
  const patches: Patch[] = []
  const axis = (proj: number) => {
    const pos: number[] = []
    const major: boolean[] = []
    // global positions are multiples of the block size
    for (let k = Math.ceil((proj - R) / cfg.gap); k * cfg.gap <= proj + R; k++) {
      pos.push(k * cfg.gap - proj)
      major.push(((k % cfg.majorEvery) + cfg.majorEvery) % cfg.majorEvery === 0)
    }
    return { pos, major }
  }
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const cx = (i + 0.5) * S * ca - (j + 0.5) * S * sa
      const cy = (i + 0.5) * S * sa + (j + 0.5) * S * ca
      if (cx < -S || cy < -S || cx > size + S || cy > size + S) continue
      const u = axis(cx * ca + cy * sa)
      const v = axis(-cx * sa + cy * ca)
      const h = S / 2
      const corner = (du: number, dv: number): Pt => [cx + du * ca - dv * sa, cy + du * sa + dv * ca]
      patches.push({ id: patches.length, cx, cy, angle: theta, us: u.pos, vs: v.pos, majorU: u.major, majorV: v.major, cell: [corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)] })
    }
  }
  return patches
}

export function streetPatches(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK): Patch[] {
  const key = `${kind}|${size}|${lookKey(look)}`
  const hit = patchCache.get(key)
  if (hit) return hit
  const cfg = cfgOf(kind, look)
  if (look.style === 'raster') {
    const raster = rasterPatches(size, look, cfg)
    patchCache.set(key, raster)
    return raster
  }
  const r = rng(cfg.seed * 1009 + size + look.seed * 7919)
  const S = cfg.spacing
  const seeds: Pt[] = []
  for (let j = -1; j * S < size + S; j++) {
    for (let i = -1; i * S < size + S; i++) {
      // every second row is shifted, so the neighbourhoods do not form a grid themselves
      const ox = (j & 1) * S * 0.5
      seeds.push([(i + 0.5) * S + ox + (r() - 0.5) * S * 0.55, (j + 0.5) * S + (r() - 0.5) * S * 0.55])
    }
  }
  const big = size * 2
  const patches: Patch[] = seeds.map((s, id) => {
    let cell: Pt[] = [[-big, -big], [big, -big], [big, big], [-big, big]]
    for (const o of seeds) {
      if (o === s || Math.hypot(o[0] - s[0], o[1] - s[1]) > S * 2.6) continue
      cell = clipCloser(cell, s, o)
    }
    const random = r() * (Math.PI / 2)
    // a radial town turns every neighbourhood towards the middle of the map, so its streets run like spokes and rings
    const angle = look.style === 'strahlen' ? Math.atan2(s[1] - size / 2, s[0] - size / 2) : random
    const gap = cfg.gap * (0.85 + r() * 0.35)
    const R = S * 1.3
    const make = () => {
      const pos: number[] = []
      const major: boolean[] = []
      let p = -R + r() * gap
      let i = 0
      while (p < R) {
        pos.push(p)
        major.push(i % cfg.majorEvery === 0)
        p += gap * (0.8 + r() * 0.4)
        i++
      }
      return { pos, major }
    }
    const u = make()
    const v = make()
    return { id, cx: s[0], cy: s[1], angle, us: u.pos, vs: v.pos, majorU: u.major, majorV: v.major, cell }
  })
  patchCache.set(key, patches)
  return patches
}

/** Index of the neighbourhood a point belongs to. */
export function patchAt(patches: Patch[], x: number, y: number): number {
  let best = 0
  let bd = Infinity
  for (let i = 0; i < patches.length; i++) {
    const d = (patches[i].cx - x) ** 2 + (patches[i].cy - y) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

const patchToCell = (p: Patch, u: number, v: number): Pt => {
  const c = Math.cos(p.angle)
  const s = Math.sin(p.angle)
  return [p.cx + u * c - v * s, p.cy + u * s + v * c]
}

export function avenuesOf(size: number): Avenues {
  const r = rng(size * 31 + 5)
  const base = r() * Math.PI
  return {
    cx: size / 2 + (r() - 0.5) * size * 0.06,
    cy: size / 2 + (r() - 0.5) * size * 0.06,
    angles: [base, base + 1.05 + r() * 0.3, base + 2.1 + r() * 0.3],
    ring: size >= 96 ? size * 0.27 : 0,
  }
}

/** Distance of a point to the nearest avenue or the ring road. */
export function avenueDistance(a: Avenues, x: number, y: number): number {
  let d = Infinity
  for (const ang of a.angles) d = Math.min(d, Math.abs((x - a.cx) * Math.sin(ang) - (y - a.cy) * Math.cos(ang)))
  if (a.ring > 0) d = Math.min(d, Math.abs(Math.hypot(x - a.cx, y - a.cy) - a.ring))
  return d
}

export interface PatchPaths {
  clip: Path2D
  major: Path2D
  minor: Path2D
  fine: Path2D
  outline: Path2D
}
export interface StreetPaths {
  patches: PatchPaths[]
  avenues: Path2D
}

/** A street piece in cell space: x0, y0, x1, y1 */
export type StreetSeg = [number, number, number, number]
export interface PatchSegs {
  patch: Patch
  major: StreetSeg[]
  minor: StreetSeg[]
  fine: StreetSeg[]
}

const segCache = new Map<string, PatchSegs[]>()

/**
 * The streets as plain line pieces in cell space (not yet clipped to the neighbourhood). Minor streets and alleys have
 * dead ends so blocks look organic. The 2D map draws these, the trams route over them.
 */
export function streetSegments(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK): PatchSegs[] {
  const key = `${kind}|${size}|${lookKey(look)}`
  const hit = segCache.get(key)
  if (hit) return hit
  const patches = streetPatches(kind, size, look)
  const r = rng(CONFIG[kind].seed * 77 + size + look.seed * 104729)
  const out: PatchSegs[] = []
  for (const p of patches) {
    // skip neighbourhoods far outside the map
    if (p.cx < -40 || p.cy < -40 || p.cx > size + 40 || p.cy > size + 40) continue
    const major: StreetSeg[] = []
    const minor: StreetSeg[] = []
    const fine: StreetSeg[] = []
    const ext = cfgOf(kind, look).spacing * 1.3
    const seg = (list: StreetSeg[], fixed: number, a: number, b: number, alongU: boolean) => {
      const s = alongU ? patchToCell(p, a, fixed) : patchToCell(p, fixed, a)
      const e = alongU ? patchToCell(p, b, fixed) : patchToCell(p, fixed, b)
      list.push([s[0], s[1], e[0], e[1]])
    }
    const draw = (pos: number[], isMajor: boolean[], alongU: boolean) => {
      for (let i = 0; i < pos.length; i++) {
        if (isMajor[i]) {
          seg(major, pos[i], -ext, ext, alongU)
          continue
        }
        let t = -ext
        while (t < ext) {
          const len = 5 + r() * 16
          if (r() > 0.14) seg(minor, pos[i], t, Math.min(ext, t + len), alongU)
          t += len
        }
        if (i + 1 < pos.length && pos[i + 1] - pos[i] > 3.2) {
          const mid = (pos[i] + pos[i + 1]) / 2
          let q = -ext
          while (q < ext) {
            const len = 3 + r() * 9
            if (r() > 0.42) seg(fine, mid, q, Math.min(ext, q + len), alongU)
            q += len
          }
        }
      }
    }
    draw(p.vs, p.majorV, true)
    draw(p.us, p.majorU, false)
    out.push({ patch: p, major, minor, fine })
  }
  segCache.set(key, out)
  return out
}

const pathCache = new Map<string, StreetPaths>()

/** The streets as paths in cell space. */
export function streetPaths(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK): StreetPaths {
  const key = `${kind}|${size}|${lookKey(look)}`
  const hit = pathCache.get(key)
  if (hit) return hit
  const out: PatchPaths[] = []
  for (const { patch: p, major: ma, minor: mi, fine: fi } of streetSegments(kind, size, look)) {
    const clip = new Path2D()
    const outline = new Path2D()
    p.cell.forEach(([x, y], i) => {
      if (i === 0) {
        clip.moveTo(x, y)
        outline.moveTo(x, y)
      } else {
        clip.lineTo(x, y)
        outline.lineTo(x, y)
      }
    })
    clip.closePath()
    outline.closePath()
    const build = (list: StreetSeg[]) => {
      const path = new Path2D()
      for (const [x0, y0, x1, y1] of list) {
        path.moveTo(x0, y0)
        path.lineTo(x1, y1)
      }
      return path
    }
    out.push({ clip, major: build(ma), minor: build(mi), fine: build(fi), outline })
  }
  const av = avenuesOf(size)
  const avenues = new Path2D()
  const L = size * 1.6
  for (const a of av.angles) {
    avenues.moveTo(av.cx - Math.cos(a) * L, av.cy - Math.sin(a) * L)
    avenues.lineTo(av.cx + Math.cos(a) * L, av.cy + Math.sin(a) * L)
  }
  if (av.ring > 0) {
    avenues.moveTo(av.cx + av.ring, av.cy)
    avenues.arc(av.cx, av.cy, av.ring, 0, Math.PI * 2)
  }
  const res = { patches: out, avenues }
  pathCache.set(key, res)
  return res
}

export interface Lot {
  /** centre in map cell coordinates */
  x: number
  y: number
  /** extent along the grid axes (cells) */
  w: number
  d: number
  /** grid rotation */
  angle: number
  /** per building and per block random numbers (0..1) */
  rand: number
  blockRand: number
}

/**
 * Buildings between the streets (before checking the zone map). The city gets perimeter blocks: houses
 * around the edge of every block with a courtyard inside; suburbs get detached houses.
 */
export function lotsOf(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK): Lot[] {
  const patches = streetPatches(kind, size, look)
  const av = avenuesOf(size)
  const r = rng(CONFIG[kind].seed * 131 + size + look.seed * 337)
  const out: Lot[] = []
  for (const p of patches) {
    if (p.cx < -40 || p.cy < -40 || p.cx > size + 40 || p.cy > size + 40) continue
    for (let i = 0; i < p.us.length - 1; i++) {
      for (let j = 0; j < p.vs.length - 1; j++) {
        const mu0 = p.majorU[i] ? 0.6 : 0.35
        const mu1 = p.majorU[i + 1] ? 0.6 : 0.35
        const mv0 = p.majorV[j] ? 0.6 : 0.35
        const mv1 = p.majorV[j + 1] ? 0.6 : 0.35
        const a0 = p.us[i] + mu0
        const a1 = p.us[i + 1] - mu1
        const b0 = p.vs[j] + mv0
        const b1 = p.vs[j + 1] - mv1
        if (a1 - a0 < 1 || b1 - b0 < 1) continue
        const blockRand = r()
        const push = (u0: number, u1: number, v0: number, v1: number, fill = 0.95) => {
          if (u1 - u0 < 0.5 || v1 - v0 < 0.5) return
          const c = patchToCell(p, (u0 + u1) / 2, (v0 + v1) / 2)
          if (c[0] < -2 || c[1] < -2 || c[0] > size + 2 || c[1] > size + 2) return
          // every building has to stand inside its own neighbourhood and clear of the avenues
          const ca = Math.cos(p.angle)
          const sa = Math.sin(p.angle)
          const hw = ((u1 - u0) * fill) / 2 + 0.15
          const hd = ((v1 - v0) * fill) / 2 + 0.15
          const probes: Pt[] = [c, [c[0] + ca * hw, c[1] + sa * hw], [c[0] - ca * hw, c[1] - sa * hw], [c[0] - sa * hd, c[1] + ca * hd], [c[0] + sa * hd, c[1] - ca * hd]]
          for (const q of probes) if (patchAt(patches, q[0], q[1]) !== p.id || avenueDistance(av, q[0], q[1]) < 0.7) return
          out.push({ x: c[0], y: c[1], w: (u1 - u0) * fill, d: (v1 - v0) * fill, angle: p.angle, rand: r(), blockRand })
        }
        const w = a1 - a0
        const d = b1 - b0
        if (kind === 'suburb') {
          const sx = w * 0.28
          const sy = d * 0.28
          push(a0 + sx, a1 - sx, b0 + sy, b1 - sy, 1)
          continue
        }
        if (Math.min(w, d) < 2.6) {
          // small block: one or two houses
          if (w >= d && w > 2.2) {
            const m = (a0 + a1) / 2
            push(a0, m - 0.06, b0, b1)
            push(m + 0.06, a1, b0, b1)
          } else if (d > 2.2) {
            const m = (b0 + b1) / 2
            push(a0, a1, b0, m - 0.06)
            push(a0, a1, m + 0.06, b1)
          } else push(a0, a1, b0, b1)
          continue
        }
        // perimeter block: strips of houses along the four sides, courtyard in the middle
        const t = Math.min(1.2, Math.min(w, d) * 0.36)
        const split = (from: number, to: number, fn: (x0: number, x1: number) => void) => {
          const len = to - from
          const n = Math.max(1, Math.round(len / (1.7 + r() * 0.9)))
          for (let k = 0; k < n; k++) fn(from + (len * k) / n, from + (len * (k + 1)) / n)
        }
        split(a0, a1, (x0, x1) => push(x0, x1, b0, b0 + t))
        split(a0, a1, (x0, x1) => push(x0, x1, b1 - t, b1))
        split(b0 + t, b1 - t, (y0, y1) => push(a0, a0 + t, y0, y1))
        split(b0 + t, b1 - t, (y0, y1) => push(a1 - t, a1, y0, y1))
      }
    }
  }
  return out
}
