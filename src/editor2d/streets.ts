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
  /** a number from the place of the neighbourhood in the pattern: random numbers that must not change when the map grows are drawn from it */
  lat: number
  /** the neighbourhood was added when the map grew (it is not part of the town as it was founded) */
  ext?: boolean
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

/** A number from a few whole numbers: the same input always gives the same output (random numbers that belong to a place). */
function hash(...n: number[]): number {
  let h = 0x9e3779b9
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return h >>> 0
}

/**
 * How the streets of a city sit on its map. They are made for a map of `gen` cells (the size the city had when it was
 * founded) and lie `dx`, `dy` cells from the origin of the map: a map that is enlarged or cut keeps its streets where they
 * were and only gets new ones in the parts that are added. `size` is the map as it is now. Without a frame a map is
 * simply its own size.
 */
export interface StreetFrame {
  gen: number
  dx: number
  dy: number
  size: number
}

export const plainFrame = (size: number): StreetFrame => ({ gen: size, dx: 0, dy: 0, size })

/** The street frame of a city. */
export const frameOf = (doc: { size: number; streetGen?: number; streetDx?: number; streetDy?: number }): StreetFrame => ({
  gen: doc.streetGen ?? doc.size,
  dx: doc.streetDx ?? 0,
  dy: doc.streetDy ?? 0,
  size: doc.size,
})

const frameKey = (f: StreetFrame) => `${f.size}|${f.gen},${f.dx},${f.dy}`

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

/** The same neighbourhoods one frame further: moved by the offset of the frame. */
function shifted(patches: Patch[], f: StreetFrame): Patch[] {
  if (!f.dx && !f.dy) return patches
  return patches.map((p) => ({ ...p, cx: p.cx + f.dx, cy: p.cy + f.dy, cell: p.cell.map(([x, y]): Pt => [x + f.dx, y + f.dy]) }))
}

/**
 * A chessboard town: every neighbourhood has the same angle and the streets run straight through from one to the next
 * (their positions are multiples of the block size in the common frame), so the town is one even grid. The neighbourhoods
 * lie on a lattice that does not depend on the map, so a bigger map simply gets more of them.
 */
function rasterPatches(f: StreetFrame, look: StreetLook, cfg: Cfg): Patch[] {
  const theta = look.seed === 0 ? 0.12 : ((look.seed * 0.6180339) % 1) * (Math.PI / 2)
  const ca = Math.cos(theta)
  const sa = Math.sin(theta)
  const S = cfg.spacing
  const R = S * 1.3
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
  const make = (i: number, j: number, cx: number, cy: number, ext: boolean): Patch => {
    const u = axis(cx * ca + cy * sa)
    const v = axis(-cx * sa + cy * ca)
    const h = S / 2
    const corner = (du: number, dv: number): Pt => [cx + du * ca - dv * sa, cy + du * sa + dv * ca]
    return { id: 0, cx, cy, angle: theta, us: u.pos, vs: v.pos, majorU: u.major, majorV: v.major, cell: [corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)], lat: hash(i, j, 3), ...(ext ? { ext: true } : {}) }
  }
  const centre = (i: number, j: number): Pt => [(i + 0.5) * S * ca - (j + 0.5) * S * sa, (i + 0.5) * S * sa + (j + 0.5) * S * ca]
  const patches: Patch[] = []
  // the town as it was founded (the same neighbourhoods, in the same order, as before)
  const nOld = Math.ceil((f.gen * 1.5) / S) + 1
  const old = (i: number, j: number, c: Pt) => Math.abs(i) <= nOld && Math.abs(j) <= nOld && !(c[0] < -S || c[1] < -S || c[0] > f.gen + S || c[1] > f.gen + S)
  for (let j = -nOld; j <= nOld; j++) {
    for (let i = -nOld; i <= nOld; i++) {
      const c = centre(i, j)
      if (old(i, j, c)) patches.push(make(i, j, c[0], c[1], false))
    }
  }
  // what the map has gained since: the neighbourhoods inside the map that the founded town did not have
  const x0 = -f.dx
  const y0 = -f.dy
  const x1 = f.size - f.dx
  const y1 = f.size - f.dy
  const nAll = Math.ceil((Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1), f.gen) * 1.5) / S) + 1
  for (let j = -nAll; j <= nAll; j++) {
    for (let i = -nAll; i <= nAll; i++) {
      const c = centre(i, j)
      if (c[0] < x0 - S || c[1] < y0 - S || c[0] > x1 + S || c[1] > y1 + S || old(i, j, c)) continue
      patches.push(make(i, j, c[0], c[1], true))
    }
  }
  patches.forEach((p, id) => (p.id = id))
  return patches
}

export function streetPatches(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK, frame?: StreetFrame): Patch[] {
  const f = frame ?? plainFrame(size)
  const key = `${kind}|${frameKey(f)}|${lookKey(look)}`
  const hit = patchCache.get(key)
  if (hit) return hit
  const cfg = cfgOf(kind, look)
  if (look.style === 'raster') {
    const raster = shifted(rasterPatches(f, look, cfg), f)
    patchCache.set(key, raster)
    return raster
  }
  const r = rng(cfg.seed * 1009 + f.gen + look.seed * 7919)
  const S = cfg.spacing
  interface Seed {
    p: Pt
    i: number
    j: number
    ext: boolean
    /** random numbers of a neighbourhood that was added later: they come from its place, not from a sequence */
    er?: () => number
  }
  const seeds: Seed[] = []
  // the town as it was founded: the same seeds and the same random numbers, in the same order, as ever
  const oldRange = (i: number, j: number) => i >= -1 && j >= -1 && i * S < f.gen + S && j * S < f.gen + S
  for (let j = -1; j * S < f.gen + S; j++) {
    for (let i = -1; i * S < f.gen + S; i++) {
      // every second row is shifted, so the neighbourhoods do not form a grid themselves
      const ox = (j & 1) * S * 0.5
      seeds.push({ p: [(i + 0.5) * S + ox + (r() - 0.5) * S * 0.55, (j + 0.5) * S + (r() - 0.5) * S * 0.55], i, j, ext: false })
    }
  }
  // what the map has gained since: more places of the same pattern, each with random numbers of its own
  const x0 = -f.dx
  const y0 = -f.dy
  const x1 = f.size - f.dx
  const y1 = f.size - f.dy
  for (let j = Math.ceil((y0 - S) / S - 0.5); j <= Math.floor((y1 + S) / S - 0.5); j++) {
    for (let i = Math.ceil((x0 - S) / S - 0.5); i <= Math.floor((x1 + S) / S - 0.5); i++) {
      if (oldRange(i, j)) continue
      const er = rng(hash(cfg.seed, look.seed, i, j, 17))
      const ox = (j & 1) * S * 0.5
      seeds.push({ p: [(i + 0.5) * S + ox + (er() - 0.5) * S * 0.55, (j + 0.5) * S + (er() - 0.5) * S * 0.55], i, j, ext: true, er })
    }
  }
  const big = Math.max(f.gen, f.size) * 2 + Math.abs(f.dx) + Math.abs(f.dy)
  const patches: Patch[] = seeds.map((sd, id) => {
    const s = sd.p
    let cell: Pt[] = [[-big, -big], [big, -big], [big, big], [-big, big]]
    for (const o of seeds) {
      if (o.p === s || Math.hypot(o.p[0] - s[0], o.p[1] - s[1]) > S * 2.6) continue
      cell = clipCloser(cell, s, o.p)
    }
    const rr = sd.er ?? r
    const random = rr() * (Math.PI / 2)
    // a radial town turns every neighbourhood towards the middle of the map, so its streets run like spokes and rings
    const angle = look.style === 'strahlen' ? Math.atan2(s[1] - f.gen / 2, s[0] - f.gen / 2) : random
    const gap = cfg.gap * (0.85 + rr() * 0.35)
    const R = S * 1.3
    const make = () => {
      const pos: number[] = []
      const major: boolean[] = []
      let p = -R + rr() * gap
      let i = 0
      while (p < R) {
        pos.push(p)
        major.push(i % cfg.majorEvery === 0)
        p += gap * (0.8 + rr() * 0.4)
        i++
      }
      return { pos, major }
    }
    const u = make()
    const v = make()
    return { id, cx: s[0], cy: s[1], angle, us: u.pos, vs: v.pos, majorU: u.major, majorV: v.major, cell, lat: hash(sd.i, sd.j, 5), ...(sd.ext ? { ext: true } : {}) }
  })
  const out = shifted(patches, f)
  patchCache.set(key, out)
  return out
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

export function avenuesOf(size: number, frame?: StreetFrame): Avenues {
  const f = frame ?? plainFrame(size)
  const g = f.gen
  const r = rng(g * 31 + 5)
  const base = r() * Math.PI
  return {
    cx: g / 2 + (r() - 0.5) * g * 0.06 + f.dx,
    cy: g / 2 + (r() - 0.5) * g * 0.06 + f.dy,
    angles: [base, base + 1.05 + r() * 0.3, base + 2.1 + r() * 0.3],
    ring: g >= 96 ? g * 0.27 : 0,
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
export function streetSegments(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK, frame?: StreetFrame): PatchSegs[] {
  const f = frame ?? plainFrame(size)
  const key = `${kind}|${frameKey(f)}|${lookKey(look)}`
  const hit = segCache.get(key)
  if (hit) return hit
  const patches = streetPatches(kind, size, look, f)
  const r0 = rng(CONFIG[kind].seed * 77 + f.gen + look.seed * 104729)
  const out: PatchSegs[] = []
  for (const p of patches) {
    // a neighbourhood of the founded town keeps the random numbers it always had; the others (added with a bigger map, or too
    // far out for the founded town to have streets there) draw their own, and only exist where the map is
    const sx = p.cx - f.dx
    const sy = p.cy - f.dy
    const founded = !p.ext && !(sx < -40 || sy < -40 || sx > f.gen + 40 || sy > f.gen + 40)
    if (!founded && (p.cx < -40 || p.cy < -40 || p.cx > f.size + 40 || p.cy > f.size + 40)) continue
    const r = founded ? r0 : rng(hash(CONFIG[kind].seed * 77, look.seed, p.lat, 7))
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
export function streetPaths(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK, frame?: StreetFrame): StreetPaths {
  const f = frame ?? plainFrame(size)
  const key = `${kind}|${frameKey(f)}|${lookKey(look)}`
  const hit = pathCache.get(key)
  if (hit) return hit
  const out: PatchPaths[] = []
  for (const { patch: p, major: ma, minor: mi, fine: fi } of streetSegments(kind, size, look, f)) {
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
  const av = avenuesOf(size, f)
  const avenues = new Path2D()
  const L = Math.max(f.gen, f.size + Math.abs(f.dx) + Math.abs(f.dy)) * 1.6
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
export function lotsOf(kind: UrbanKind, size: number, look: StreetLook = DEFAULT_LOOK, frame?: StreetFrame): Lot[] {
  const f = frame ?? plainFrame(size)
  const patches = streetPatches(kind, size, look, f)
  const av = avenuesOf(size, f)
  const r0 = rng(CONFIG[kind].seed * 131 + f.gen + look.seed * 337)
  const out: Lot[] = []
  /** the lots of one neighbourhood; `accept` says where a lot may stand */
  const fill = (p: Patch, r: () => number, accept: (c: Pt) => boolean) => {
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
          if (!accept(c)) return
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
  const grown = f.gen !== f.size || f.dx !== 0 || f.dy !== 0
  const reach = cfgOf(kind, look).spacing * 1.5
  /** inside the map the town was founded for (street space) */
  const inGen = (c: Pt) => !(c[0] - f.dx < -2 || c[1] - f.dy < -2 || c[0] - f.dx > f.gen + 2 || c[1] - f.dy > f.gen + 2)
  const inMap = (c: Pt) => !(c[0] < -2 || c[1] < -2 || c[0] > f.size + 2 || c[1] > f.size + 2)
  for (const p of patches) {
    const sx = p.cx - f.dx
    const sy = p.cy - f.dy
    // a neighbourhood of the founded town keeps the random numbers it always had
    const founded = !p.ext && !(sx < -40 || sy < -40 || sx > f.gen + 40 || sy > f.gen + 40)
    if (founded) fill(p, r0, inGen)
    if (!grown) continue
    // what a bigger map gained: lots outside the founded town (own random numbers, so the old ones stay as they were)
    if (founded && sx - reach > -2 && sy - reach > -2 && sx + reach < f.gen + 2 && sy + reach < f.gen + 2) continue
    fill(p, rng(hash(CONFIG[kind].seed * 131, look.seed, p.lat, 9)), (c) => inMap(c) && !(founded && inGen(c)))
  }
  return out
}
