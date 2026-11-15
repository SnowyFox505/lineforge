import type { CityDoc } from '../model/types'
import { buildTerrainPaths } from './terrainRender'
import type { TerrainPaths, ViewTransform } from './terrainRender'

export interface CountyGfx {
  items: { id: number; name: string; color: string; paths: TerrainPaths; x: number; y: number; cells: number }[]
}

/** Outlines and name positions of the counties (cell coordinates). */
export function buildCountyGfx(doc: CityDoc): CountyGfx | null {
  const grid = doc.countyGrid
  const counties = doc.counties ?? []
  if (!grid || !counties.length) return null
  const size = doc.size
  const masks = new Map<number, { mask: Uint8Array; x: number; y: number; n: number }>()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = grid[y * size + x]
      if (!id) continue
      let m = masks.get(id)
      if (!m) masks.set(id, (m = { mask: new Uint8Array(size * size), x: 0, y: 0, n: 0 }))
      m.mask[y * size + x] = 1
      m.x += x + 0.5
      m.y += y + 0.5
      m.n++
    }
  }
  const items = counties
    .filter((c) => masks.has(c.id))
    .map((c) => {
      const m = masks.get(c.id)!
      return { id: c.id, name: c.name, color: c.color, paths: buildTerrainPaths(m.mask, size), x: m.x / m.n, y: m.y / m.n, cells: m.n }
    })
  return items.length ? { items } : null
}

/** A light tint and a dashed outline in the colour of every county, under the lines and stations. */
export function drawCounties(ctx: CanvasRenderingContext2D, view: ViewTransform, gfx: CountyGfx | null) {
  if (!gfx) return
  const { ox, oy, s } = view
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  for (const c of gfx.items) {
    ctx.globalAlpha = 0.1
    ctx.fillStyle = c.color
    ctx.fill(c.paths.water)
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = c.color
    ctx.lineWidth = Math.max(0.3, 2.6 / s)
    ctx.setLineDash([Math.max(1, 12 / s), Math.max(0.6, 7 / s)])
    ctx.stroke(c.paths.coast)
  }
  ctx.setLineDash([])
  ctx.restore()
}

/** The names of the counties in big letters; they fade out when you zoom in close (the towns' own names take over). */
export function drawCountyLabels(ctx: CanvasRenderingContext2D, view: ViewTransform, gfx: CountyGfx | null) {
  if (!gfx || view.s > 6) return
  const fade = Math.min(1, (6 - view.s) / 2.5)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.9 * fade
  for (const c of gfx.items) {
    const w = Math.sqrt(c.cells) * view.s
    if (w < 40) continue
    const fs = Math.round(Math.min(46, Math.max(13, w * 0.17)))
    ctx.font = `800 ${fs}px 'Space Grotesk Variable', system-ui, sans-serif`
    const x = view.ox + c.x * view.s
    const y = view.oy + c.y * view.s
    const text = c.name.toUpperCase()
    ctx.lineWidth = Math.max(3, fs * 0.16)
    ctx.strokeStyle = 'rgba(8,12,18,0.7)'
    ctx.strokeText(text, x, y)
    ctx.fillStyle = c.color
    ctx.fillText(text, x, y)
  }
  ctx.restore()
}
