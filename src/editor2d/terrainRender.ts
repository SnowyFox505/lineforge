import { buildField, WATER_THRESHOLD } from '../model/terrainField'
import { airportLayout } from '../model/airport'
import { streetPaths } from './streets'
import { ZONE_STYLE } from './zoneGfx'
import type { ZoneGfx } from './zoneGfx'

export interface TerrainPaths {
  /** Filled water area in cell coordinates */
  water: Path2D
  /** Coastline segments in cell coordinates (for stroking) */
  coast: Path2D
  /** The smooth water field the contours were cut from */
  field: Float32Array
}

interface Crossing {
  x: number
  y: number
  exit: boolean
}

/**
 * Marching squares over the smooth water field. Returns vector paths, so the map
 * stays razor sharp at any zoom level (no pixels, no checkerboard).
 */
export function buildTerrainPaths(terrain: Uint8Array, size: number): TerrainPaths {
  const f = buildField(terrain, size)
  const n = size + 1
  const th = WATER_THRESHOLD
  const water = new Path2D()
  const coast = new Path2D()

  // Cell corners in clockwise order: tl, tr, br, bl
  const cx = [0, 1, 1, 0]
  const cy = [0, 0, 1, 1]

  for (let y = 0; y < size; y++) {
    let runStart = -1
    for (let x = 0; x <= size; x++) {
      let full = false
      if (x < size) {
        const v = [f[y * n + x], f[y * n + x + 1], f[(y + 1) * n + x + 1], f[(y + 1) * n + x]]
        const ins = v.map((a) => a >= th)
        const count = ins.filter(Boolean).length
        if (count === 4) {
          full = true
        } else if (count > 0) {
          const poly: [number, number][] = []
          const crossings: Crossing[] = []
          for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4
            if (ins[i]) poly.push([x + cx[i], y + cy[i]])
            if (ins[i] !== ins[j]) {
              const t = (th - v[i]) / (v[j] - v[i])
              const px = x + cx[i] + (cx[j] - cx[i]) * t
              const py = y + cy[i] + (cy[j] - cy[i]) * t
              poly.push([px, py])
              crossings.push({ x: px, y: py, exit: ins[i] })
            }
          }
          water.moveTo(poly[0][0], poly[0][1])
          for (let k = 1; k < poly.length; k++) water.lineTo(poly[k][0], poly[k][1])
          water.closePath()
          // Each exit crossing is followed (cyclically) by an entry crossing: that span is coast.
          for (let k = 0; k < crossings.length; k++) {
            if (!crossings[k].exit) continue
            const a = crossings[k]
            const b = crossings[(k + 1) % crossings.length]
            coast.moveTo(a.x, a.y)
            coast.lineTo(b.x, b.y)
          }
        }
      }
      if (full) {
        if (runStart < 0) runStart = x
      } else if (runStart >= 0) {
        water.rect(runStart, y, x - runStart, 1)
        runStart = -1
      }
    }
  }
  return { water, coast, field: f }
}

// ---------------------------------------------------------------------------
// Land texture: smooth value noise, so the land has soft organic tones instead
// of a flat fill or a checkerboard.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let landTexture: HTMLCanvasElement | null = null

export function getLandTexture(): HTMLCanvasElement {
  if (landTexture) return landTexture
  const S = 384
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(S, S)
  const rand = mulberry32(20261107)
  const octaves = [
    { cells: 3, amp: 0.62 },
    { cells: 7, amp: 0.28 },
    { cells: 16, amp: 0.1 },
  ].map((o) => {
    const grid = new Float32Array((o.cells + 1) * (o.cells + 1))
    for (let i = 0; i < grid.length; i++) grid[i] = rand()
    return { ...o, grid }
  })
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const lo = [30, 66, 52] // deep green-teal
  const hi = [46, 96, 68] // lighter moss
  const warm = [58, 106, 66] // slightly warmer patches
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0
      for (const o of octaves) {
        const gx = (x / S) * o.cells
        const gy = (y / S) * o.cells
        const x0 = Math.floor(gx)
        const y0 = Math.floor(gy)
        const tx = smooth(gx - x0)
        const ty = smooth(gy - y0)
        const w = o.cells + 1
        const a = o.grid[y0 * w + x0]
        const b = o.grid[y0 * w + x0 + 1]
        const c = o.grid[(y0 + 1) * w + x0]
        const d = o.grid[(y0 + 1) * w + x0 + 1]
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * o.amp
      }
      // Soft top-left light falloff
      const light = 1.04 - ((x + y) / (2 * S)) * 0.2
      const t = Math.min(1, Math.max(0, (v - 0.3) / 0.45))
      const k = (y * S + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        const base = lo[ch] + (hi[ch] - lo[ch]) * t
        const mixed = base + (warm[ch] - base) * Math.max(0, t - 0.65) * 1.4
        img.data[k + ch] = mixed * light
      }
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  landTexture = canvas
  return canvas
}

export interface ViewTransform {
  ox: number
  oy: number
  /** pixels per cell */
  s: number
}


let scratch: HTMLCanvasElement | null = null
/** A reusable offscreen canvas of the given size (cleared by the caller). */
function scratchFor(w: number, h: number): HTMLCanvasElement {
  scratch ??= document.createElement('canvas')
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w
    scratch.height = h
  }
  return scratch
}

/** Streets of a town in white on its grey area; finer streets appear as you zoom in. */
function drawStreets(ctx: CanvasRenderingContext2D, kind: 'city' | 'suburb', size: number, s: number) {
  const p = streetPaths(kind, size)
  ctx.lineCap = 'butt'
  for (const patch of p.patches) {
    ctx.save()
    ctx.clip(patch.clip)
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = Math.max(0.5, 2.4 / s)
    ctx.stroke(patch.major)
    if (s >= 2.2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = Math.max(0.22, 1.3 / s)
      ctx.stroke(patch.minor)
    }
    if (s >= 7) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = Math.max(0.1, 0.9 / s)
      ctx.stroke(patch.fine)
    }
    ctx.restore()
    // the border between two neighbourhoods is a street of its own
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = Math.max(0.3, 1.6 / s)
    ctx.stroke(patch.outline)
  }
  // long avenues and the ring road
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = Math.max(0.7, 3.2 / s)
  ctx.lineCap = 'round'
  ctx.stroke(p.avenues)
}

/** A number between 0 and 1 from a cell and a salt: the same trees and peaks on every redraw. */
function cellRand(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7919, 668265263) ^ Math.imul(salt + 31, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Forests: a dark green area with a tree on every cell once you zoom in (the 3D view has real trees, so its texture stays flat). */
function drawForest(ctx: CanvasRenderingContext2D, mask: Uint8Array | undefined, size: number, s: number, bare: boolean) {
  if (!mask || bare || s < 3) return
  const greens = ['#1f5a36', '#276b40', '#2f7a48', '#1b4e30']
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue
      const r = 0.3 + cellRand(x, y, 1) * 0.16
      const px = x + 0.25 + cellRand(x, y, 2) * 0.5
      const py = y + 0.25 + cellRand(x, y, 3) * 0.5
      ctx.fillStyle = greens[Math.floor(cellRand(x, y, 4) * greens.length)]
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      if (s >= 6) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.45, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

/** Mountains: little peaks (a light and a dark side, snow on the high ones) every other cell; the 3D view raises the ground itself. */
function drawMountains(ctx: CanvasRenderingContext2D, mask: Uint8Array | undefined, size: number, s: number, bare: boolean) {
  if (!mask || bare || s < 2.4) return
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      // a peak stands at this cell when the cell is painted
      if (!mask[y * size + x]) continue
      const w = 1.5 + cellRand(x, y, 5) * 0.7
      const h = w * (0.9 + cellRand(x, y, 6) * 0.4)
      const cx = x + 0.5 + (cellRand(x, y, 7) - 0.5) * 0.8
      const base = y + 1.2 + (cellRand(x, y, 8) - 0.5) * 0.6
      const peak = base - h
      ctx.fillStyle = '#6c675d'
      ctx.beginPath()
      ctx.moveTo(cx - w / 2, base)
      ctx.lineTo(cx, peak)
      ctx.lineTo(cx + w * 0.08, base)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#b3ada1'
      ctx.beginPath()
      ctx.moveTo(cx + w * 0.08, base)
      ctx.lineTo(cx, peak)
      ctx.lineTo(cx + w / 2, base)
      ctx.closePath()
      ctx.fill()
      if (cellRand(x, y, 9) > 0.45) {
        ctx.fillStyle = '#f4f6f8'
        ctx.beginPath()
        ctx.moveTo(cx, peak)
        ctx.lineTo(cx - w * 0.14, peak + h * 0.26)
        ctx.lineTo(cx + w * 0.02, peak + h * 0.2)
        ctx.lineTo(cx + w * 0.15, peak + h * 0.27)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
}

/** Runways, taxiway, apron, terminal and hangars of an airport (layout shared with the 3D view). */
function drawAirport(ctx: CanvasRenderingContext2D, zones: ZoneGfx, s: number) {
  for (const a of zones.airports) {
    if (a.x1 - a.x0 < 6 && a.y1 - a.y0 < 6) continue
    const l = airportLayout(a)
    const rect = (r: { u0: number; u1: number; v0: number; v1: number }) => ctx.fillRect(r.u0, r.v0, r.u1 - r.u0, r.v1 - r.v0)
    ctx.save()
    ctx.translate(l.cx, l.cy)
    if (!l.horiz) ctx.rotate(Math.PI / 2)
    const L = l.runwayLength
    // taxiway, with links to the runways
    ctx.lineCap = 'butt'
    ctx.strokeStyle = 'rgba(150,158,170,0.6)'
    ctx.lineWidth = l.taxiW
    ctx.beginPath()
    ctx.moveTo(-L * 0.42, l.taxiV)
    ctx.lineTo(L * 0.42, l.taxiV)
    for (const f of [-0.3, 0.3]) {
      for (const r of l.runways) {
        ctx.moveTo(L * f, l.taxiV)
        ctx.lineTo(L * f, r.v)
      }
    }
    ctx.stroke()
    if (l.apron) {
      // the taxiway runs on to the apron at both ends
      for (const sg of [-1, 1]) {
        ctx.moveTo(sg * l.apron.u1 * 0.85, l.taxiV)
        ctx.lineTo(sg * l.apron.u1 * 0.85, l.apron.v0)
      }
      ctx.stroke()
      ctx.fillStyle = 'rgba(126,134,146,0.92)'
      rect(l.apron)
    }
    for (const r of l.runways) {
      ctx.strokeStyle = '#262b32'
      ctx.lineWidth = r.w
      ctx.beginPath()
      ctx.moveTo(-L / 2, r.v)
      ctx.lineTo(L / 2, r.v)
      ctx.stroke()
      if (s >= 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = Math.max(0.06, r.w * 0.06)
        ctx.setLineDash([r.w * 0.9, r.w * 0.7])
        ctx.beginPath()
        ctx.moveTo(-L / 2 + r.w, r.v)
        ctx.lineTo(L / 2 - r.w, r.v)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    ctx.fillStyle = 'rgba(176,184,196,0.95)'
    for (const p of l.piers) rect(p)
    for (const hg of l.hangars) rect(hg)
    ctx.fillStyle = 'rgba(120,128,140,0.55)'
    for (const pk of l.parking) rect(pk)
    ctx.fillStyle = 'rgba(176,184,196,0.95)'
    for (const g of l.garages) rect(g)
    if (l.terminal) {
      ctx.fillStyle = '#e4e9f0'
      rect(l.terminal)
    }
    if (l.tower) {
      ctx.beginPath()
      ctx.arc(l.tower.u, l.tower.v, 0.5, 0, Math.PI * 2)
      ctx.fillStyle = '#f2f5f8'
      ctx.fill()
    }
    ctx.restore()
  }
}

/** Draw land, water, shoreline glow and (when zoomed in) a faint grid. */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  size: number,
  paths: TerrainPaths | null,
  vw: number,
  vh: number,
  /** Plain square texture without board chrome (shadow, rounded corners, grid, rim), e.g. for the 3D view */
  bare = false,
  zones: ZoneGfx | null = null,
) {
  const { ox, oy, s } = view
  const mapW = size * s
  ctx.save()

  // Board with soft glow and rounded corners
  const radius = bare ? 0 : Math.min(28, Math.max(6, s * 1.2))
  ctx.shadowColor = bare ? 'transparent' : 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = bare ? 0 : 40
  ctx.shadowOffsetY = bare ? 0 : 12
  ctx.fillStyle = '#1b3a30'
  ctx.beginPath()
  ctx.roundRect(ox, oy, mapW, mapW, radius)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.beginPath()
  ctx.roundRect(ox, oy, mapW, mapW, radius)
  ctx.clip()

  // Land
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(getLandTexture(), ox, oy, mapW, mapW)

  ctx.restore()

  if (!paths && !zones) return

  // Water + shore are drawn in cell space (scaled), clipped to the board.
  const dpr = ctx.getTransform().a
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(ox, oy, mapW, mapW, radius)
  ctx.clip()
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy)

  // Painted areas (city, suburbs, airport) lie on the land; water and shore are drawn over them
  if (zones) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'butt'
    const cell = ctx.getTransform()
    for (const layer of zones.layers) {
      const st = ZONE_STYLE[layer.kind]
      const soft = (layer.kind === 'city' || layer.kind === 'suburb') && zones.soft
      // towns are painted on a scratch canvas first, so their whole look (colour, streets) can fade out at the edge
      const target = soft ? scratchFor(ctx.canvas.width, ctx.canvas.height) : null
      const c = target ? target.getContext('2d')! : ctx
      if (target) {
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, target.width, target.height)
        c.setTransform(cell)
        c.lineJoin = 'round'
        c.lineCap = 'butt'
      }
      c.globalAlpha = st.alpha
      c.fillStyle = st.fill
      c.fill(layer.paths.water)
      c.globalAlpha = 1
      c.save()
      c.clip(layer.paths.water)
      if (layer.kind === 'airport') drawAirport(c, zones, s)
      else if (layer.kind === 'forest') drawForest(c, zones.masks.forest, size, s, bare)
      else if (layer.kind === 'mountain') drawMountains(c, zones.masks.mountain, size, s, bare)
      else drawStreets(c, layer.kind, size, s)
      c.restore()
      if (target && soft) {
        c.save()
        c.setTransform(cell)
        c.globalCompositeOperation = 'destination-in'
        c.imageSmoothingEnabled = true
        c.imageSmoothingQuality = 'high'
        c.drawImage(soft, 0, 0, size, size)
        c.restore()
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(target, 0, 0)
        ctx.restore()
      } else {
        ctx.strokeStyle = layer.kind === 'airport' ? 'rgba(255,255,255,0.22)' : layer.kind === 'forest' || layer.kind === 'mountain' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.55)'
        ctx.lineWidth = Math.max(0.1, 1.3 / s)
        ctx.stroke(layer.paths.coast)
      }
    }
    ctx.strokeStyle = 'rgba(60,70,84,0.45)'
    ctx.lineWidth = Math.max(0.08, 1.1 / s)
    ctx.setLineDash([Math.max(0.5, 5 / s), Math.max(0.35, 3 / s)])
    ctx.stroke(zones.borders)
    ctx.setLineDash([])
  }
  if (!paths) {
    ctx.restore()
    return
  }

  // Beach haze on the land side, painted before the water covers its half
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(205, 225, 160, 0.10)'
  ctx.lineWidth = Math.max(0.6, 14 / s)
  ctx.stroke(paths.coast)

  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, '#1a6a86')
  grad.addColorStop(0.55, '#10527a')
  grad.addColorStop(1, '#0b3a66')
  ctx.fillStyle = grad
  ctx.fill(paths.water)

  // Shallow-water glow, then a crisp shoreline
  ctx.strokeStyle = 'rgba(110, 215, 225, 0.16)'
  ctx.lineWidth = Math.max(0.5, 9 / s)
  ctx.stroke(paths.coast)
  ctx.strokeStyle = 'rgba(165, 238, 240, 0.28)'
  ctx.lineWidth = Math.max(0.2, 3.5 / s)
  ctx.stroke(paths.coast)
  ctx.strokeStyle = 'rgba(225, 252, 250, 0.7)'
  ctx.lineWidth = Math.max(0.1, 1.4 / s)
  ctx.stroke(paths.coast)
  ctx.restore()

  // Faint grid when zoomed in (helps placing stations precisely)
  if (s >= 6 && !bare) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(ox, oy, mapW, mapW, radius)
    ctx.clip()
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath()
    const x0 = Math.max(0, Math.floor(-ox / s))
    const x1 = Math.min(size, Math.ceil((vw - ox) / s))
    const y0 = Math.max(0, Math.floor(-oy / s))
    const y1 = Math.min(size, Math.ceil((vh - oy) / s))
    for (let x = x0; x <= x1; x++) {
      ctx.moveTo(ox + x * s, oy + y0 * s)
      ctx.lineTo(ox + x * s, oy + y1 * s)
    }
    for (let y = y0; y <= y1; y++) {
      ctx.moveTo(ox + x0 * s, oy + y * s)
      ctx.lineTo(ox + x1 * s, oy + y * s)
    }
    ctx.stroke()
    ctx.restore()
  }

  // Board rim
  if (bare) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(ox + 0.5, oy + 0.5, mapW - 1, mapW - 1, radius)
  ctx.stroke()
  ctx.restore()
}
