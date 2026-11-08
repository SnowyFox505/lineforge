import { buildField, WATER_THRESHOLD } from '../model/terrainField'
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

/** Runways, taxiway and apron of an airport, laid along the long side of its area. */
function drawAirport(ctx: CanvasRenderingContext2D, zones: ZoneGfx, s: number) {
  for (const a of zones.airports) {
    const w = a.x1 - a.x0
    const h = a.y1 - a.y0
    if (w < 6 && h < 6) continue
    const horiz = w >= h
    const long = horiz ? w : h
    const short = horiz ? h : w
    const cx = (a.x0 + a.x1) / 2
    const cy = (a.y0 + a.y1) / 2
    ctx.save()
    ctx.translate(cx, cy)
    if (!horiz) ctx.rotate(Math.PI / 2)
    const L = long * 0.88
    const rw = Math.min(1.5, short * 0.14)
    const lanes = short > 12 ? [-0.24, 0.24] : [0]
    // taxiway and apron
    ctx.strokeStyle = 'rgba(150,158,170,0.55)'
    ctx.lineWidth = Math.max(0.2, rw * 0.35)
    ctx.beginPath()
    ctx.moveTo(-L / 2, short * 0.06)
    ctx.lineTo(L / 2, short * 0.06)
    ctx.stroke()
    ctx.fillStyle = 'rgba(126,134,146,0.9)'
    ctx.fillRect(-long * 0.16, short * 0.12, long * 0.32, Math.min(short * 0.26, 5))
    for (const f of lanes) {
      const y = f * short
      ctx.lineCap = 'butt'
      ctx.strokeStyle = '#262b32'
      ctx.lineWidth = rw
      ctx.beginPath()
      ctx.moveTo(-L / 2, y)
      ctx.lineTo(L / 2, y)
      ctx.stroke()
      if (s >= 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = Math.max(0.06, rw * 0.06)
        ctx.setLineDash([rw * 0.9, rw * 0.7])
        ctx.beginPath()
        ctx.moveTo(-L / 2 + rw, y)
        ctx.lineTo(L / 2 - rw, y)
        ctx.stroke()
        ctx.setLineDash([])
      }
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
      const soft = layer.kind !== 'airport' && zones.soft
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
        ctx.strokeStyle = layer.kind === 'airport' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)'
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
