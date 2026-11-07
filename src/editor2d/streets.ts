/**
 * Street pattern of towns: a slightly irregular grid of avenues and streets. The same grid draws the streets
 * on the 2D map and decides where the 3D buildings stand, so both always agree.
 */
export type UrbanKind = 'city' | 'suburb'

export interface StreetGrid {
  /** rotation of the grid around the map centre (radians) */
  angle: number
  /** street positions along both axes of the rotated frame (cells, relative to the map centre), sorted */
  us: number[]
  vs: number[]
  /** avenues (every few streets); a subset of the streets */
  majorU: boolean[]
  majorV: boolean[]
  /** map centre */
  cx: number
  cy: number
}

const CONFIG: Record<UrbanKind, { angle: number; gap: number; majorEvery: number; seed: number }> = {
  city: { angle: 0, gap: 3.8, majorEvery: 3, seed: 7 },
  suburb: { angle: 0.32, gap: 5.6, majorEvery: 3, seed: 19 },
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

const gridCache = new Map<string, StreetGrid>()

export function streetGrid(kind: UrbanKind, size: number): StreetGrid {
  const key = `${kind}|${size}`
  const hit = gridCache.get(key)
  if (hit) return hit
  const cfg = CONFIG[kind]
  const half = size * 0.75
  const make = (seed: number) => {
    const r = rng(cfg.seed * 1000 + seed)
    const pos: number[] = []
    const major: boolean[] = []
    let p = -half + r() * cfg.gap
    let i = 0
    while (p < half) {
      pos.push(p)
      major.push(i % cfg.majorEvery === 0)
      p += cfg.gap * (0.78 + r() * 0.44)
      i++
    }
    return { pos, major }
  }
  const u = make(1)
  const v = make(2)
  const grid: StreetGrid = { angle: cfg.angle, us: u.pos, vs: v.pos, majorU: u.major, majorV: v.major, cx: size / 2, cy: size / 2 }
  gridCache.set(key, grid)
  return grid
}

/** Rotated-frame coordinates -> map cell coordinates. */
export function gridToCell(g: StreetGrid, u: number, v: number): { x: number; y: number } {
  const c = Math.cos(g.angle)
  const s = Math.sin(g.angle)
  return { x: g.cx + u * c - v * s, y: g.cy + u * s + v * c }
}

export interface StreetPaths {
  major: Path2D
  minor: Path2D
  fine: Path2D
}

const pathCache = new Map<string, StreetPaths>()

/** The streets as paths in cell space. Minor streets and alleys have dead ends so blocks look organic. */
export function streetPaths(kind: UrbanKind, size: number): StreetPaths {
  const key = `${kind}|${size}`
  const hit = pathCache.get(key)
  if (hit) return hit
  const g = streetGrid(kind, size)
  const r = rng(CONFIG[kind].seed * 77)
  const major = new Path2D()
  const minor = new Path2D()
  const fine = new Path2D()
  const ext = size * 0.75
  const seg = (path: Path2D, fixed: number, along: number, along2: number, alongU: boolean) => {
    // alongU: the street runs along the u axis at constant v = fixed
    const a = alongU ? gridToCell(g, along, fixed) : gridToCell(g, fixed, along)
    const b = alongU ? gridToCell(g, along2, fixed) : gridToCell(g, fixed, along2)
    path.moveTo(a.x, a.y)
    path.lineTo(b.x, b.y)
  }
  const draw = (pos: number[], isMajor: boolean[], alongU: boolean) => {
    for (let i = 0; i < pos.length; i++) {
      if (isMajor[i]) {
        seg(major, pos[i], -ext, ext, alongU)
        continue
      }
      // a minor street: pieces of random length, some left out
      let t = -ext
      while (t < ext) {
        const len = 5 + r() * 16
        if (r() > 0.16) seg(minor, pos[i], t, Math.min(ext, t + len), alongU)
        t += len
      }
      // an alley half way to the next street
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
  draw(g.vs, g.majorV, true)
  draw(g.us, g.majorU, false)
  const out = { major, minor, fine }
  pathCache.set(key, out)
  return out
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
  rand: number
}

/** Building lots between the streets of a grid (before checking the zone map). */
export function lotsOf(kind: UrbanKind, size: number): Lot[] {
  const g = streetGrid(kind, size)
  const r = rng(CONFIG[kind].seed * 131)
  const out: Lot[] = []
  for (let i = 0; i < g.us.length - 1; i++) {
    for (let j = 0; j < g.vs.length - 1; j++) {
      const u0 = g.us[i]
      const u1 = g.us[i + 1]
      const v0 = g.vs[j]
      const v1 = g.vs[j + 1]
      const mu0 = g.majorU[i] ? 0.85 : 0.5
      const mu1 = g.majorU[i + 1] ? 0.85 : 0.5
      const mv0 = g.majorV[j] ? 0.85 : 0.5
      const mv1 = g.majorV[j + 1] ? 0.85 : 0.5
      const a0 = u0 + mu0
      const a1 = u1 - mu1
      const b0 = v0 + mv0
      const b1 = v1 - mv1
      if (a1 - a0 < 1 || b1 - b0 < 1) continue
      const cells = [{ a0, a1, b0, b1 }]
      // big blocks hold two buildings
      if (kind === 'city' && (a1 - a0 > 2.4 || b1 - b0 > 2.4) && r() > 0.3) {
        cells.length = 0
        if (a1 - a0 >= b1 - b0) {
          const m = (a0 + a1) / 2
          cells.push({ a0, a1: m - 0.12, b0, b1 }, { a0: m + 0.12, a1, b0, b1 })
        } else {
          const m = (b0 + b1) / 2
          cells.push({ a0, a1, b0, b1: m - 0.12 }, { a0, a1, b0: m + 0.12, b1 })
        }
      } else if (kind === 'suburb') {
        // detached houses: smaller, in the middle of the plot
        const sx = (a1 - a0) * 0.28
        const sy = (b1 - b0) * 0.28
        cells[0] = { a0: a0 + sx, a1: a1 - sx, b0: b0 + sy, b1: b1 - sy }
      }
      for (const c of cells) {
        const p = gridToCell(g, (c.a0 + c.a1) / 2, (c.b0 + c.b1) / 2)
        const fill = 0.78 + r() * 0.18
        out.push({ x: p.x, y: p.y, w: (c.a1 - c.a0) * fill, d: (c.b1 - c.b0) * fill, angle: g.angle, rand: r() })
      }
    }
  }
  return out
}
