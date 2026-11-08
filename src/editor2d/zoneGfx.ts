import { airportBoxes } from '../model/airport'
import type { CityDoc, ZoneKind } from '../model/types'
import { buildTerrainPaths } from './terrainRender'
import { urbanAlpha } from './zoneSoft'
import type { TerrainPaths, ViewTransform } from './terrainRender'

export interface ZoneGfx {
  layers: { kind: ZoneKind; paths: TerrainPaths }[]
  /** edges between two different zones (e.g. between districts), in cell coordinates */
  borders: Path2D
  labels: { name: string; kind: ZoneKind; x: number; y: number; cells: number }[]
  /** alpha of the towns (1 px per cell, soft towards the grass): painted over the town layers to fade their edges */
  soft: HTMLCanvasElement | null
  /** bounding boxes of airport areas (cell coordinates), for the runways */
  airports: { x0: number; y0: number; x1: number; y1: number; cells: number }[]
}

/** Light grey for the city, a slightly lighter grey for suburbs, dark grey for the airport. */
export const ZONE_STYLE: Record<ZoneKind, { fill: string; alpha: number; text: string; halo: string }> = {
  city: { fill: '#c9ced6', alpha: 0.96, text: '#1a2028', halo: 'rgba(240,243,247,0.9)' },
  suburb: { fill: '#dce0e6', alpha: 0.94, text: '#262d36', halo: 'rgba(248,249,251,0.9)' },
  airport: { fill: '#4a505a', alpha: 0.98, text: '#f2f5f8', halo: 'rgba(20,24,30,0.8)' },
}

const DRAW_ORDER: ZoneKind[] = ['suburb', 'city', 'airport']

/** Smooth outlines of the painted areas (same contour method as the water) plus borders and name positions. */
export function buildZoneGfx(doc: CityDoc): ZoneGfx | null {
  const grid = doc.zoneGrid
  const zones = doc.zones ?? []
  if (!grid || !zones.length) return null
  const size = doc.size
  const kindOf = new Map(zones.map((z) => [z.id, z.kind]))
  const masks: Record<ZoneKind, Uint8Array | null> = { city: null, suburb: null, airport: null }
  const sums = new Map<number, { x: number; y: number; n: number; x0: number; y0: number; x1: number; y1: number }>()
  const borders = new Path2D()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = grid[y * size + x]
      if (!id) continue
      const kind = kindOf.get(id)
      if (!kind) continue
      ;(masks[kind] ??= new Uint8Array(size * size))[y * size + x] = 1
      const s = sums.get(id) ?? { x: 0, y: 0, n: 0, x0: x, y0: y, x1: x, y1: y }
      s.x += x + 0.5
      s.y += y + 0.5
      s.n++
      s.x0 = Math.min(s.x0, x)
      s.y0 = Math.min(s.y0, y)
      s.x1 = Math.max(s.x1, x + 1)
      s.y1 = Math.max(s.y1, y + 1)
      sums.set(id, s)
      if (x + 1 < size) {
        const r = grid[y * size + x + 1]
        if (r && r !== id) {
          borders.moveTo(x + 1, y)
          borders.lineTo(x + 1, y + 1)
        }
      }
      if (y + 1 < size) {
        const d = grid[(y + 1) * size + x]
        if (d && d !== id) {
          borders.moveTo(x, y + 1)
          borders.lineTo(x + 1, y + 1)
        }
      }
    }
  }
  const layers = DRAW_ORDER.filter((k) => masks[k]).map((kind) => ({ kind, paths: buildTerrainPaths(masks[kind]!, size) }))
  const labels = zones
    .filter((z) => sums.has(z.id))
    .map((z) => {
      const s = sums.get(z.id)!
      return { name: z.name, kind: z.kind, x: s.x / s.n, y: s.y / s.n, cells: s.n }
    })
  const airports = airportBoxes(doc).map((b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, cells: sums.get(b.zoneId)?.n ?? 0 }))
  // soft edge: a 1 px per cell alpha image, scaled up smoothly when drawn
  let soft: HTMLCanvasElement | null = null
  if (masks.city || masks.suburb) {
    const a = urbanAlpha(doc)
    soft = document.createElement('canvas')
    soft.width = soft.height = size
    const sc = soft.getContext('2d')!
    const img = sc.createImageData(size, size)
    for (let i = 0; i < a.length; i++) {
      img.data[i * 4 + 3] = Math.round(a[i] * 255)
    }
    sc.putImageData(img, 0, 0)
  }
  return layers.length ? { layers, borders, labels, airports, soft } : null
}

/** Names of districts, suburbs and airports (screen space, drawn when zoomed in far enough). */
export function drawZoneLabels(ctx: CanvasRenderingContext2D, view: ViewTransform, zones: ZoneGfx | null) {
  if (!zones || view.s < 2.2) return
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const l of zones.labels) {
    const style = ZONE_STYLE[l.kind]
    // a name only makes sense when the area is big enough on screen to hold it
    const w = Math.sqrt(l.cells) * view.s
    if (w < 26) continue
    const fs = Math.round(Math.min(20, Math.max(11, w * 0.16)))
    ctx.font = `700 ${fs}px 'Space Grotesk Variable', system-ui, sans-serif`
    const x = view.ox + l.x * view.s
    const y = view.oy + l.y * view.s
    ctx.lineWidth = 4
    ctx.strokeStyle = style.halo
    ctx.strokeText(l.name, x, y)
    ctx.fillStyle = style.text
    ctx.fillText(l.name, x, y)
  }
  ctx.restore()
}
