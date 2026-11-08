import { drawTerrain } from './terrainRender'
import type { TerrainPaths } from './terrainRender'
import type { ZoneGfx } from './zoneGfx'

/**
 * The map's ground (land, water, towns with their streets, shore glow) is expensive to paint and does not move
 * while the user pans or zooms. It is painted once into an off-screen picture that reaches a little beyond the
 * screen, and every frame only copies that picture: panning costs next to nothing, zooming scales the picture and
 * paints it sharp again once the gesture rests.
 */
export interface TerrainCache {
  canvas: HTMLCanvasElement | null
  /** where the map's origin was on screen, and the zoom, when the picture was painted */
  ox: number
  oy: number
  s: number
  /** margin around the screen (CSS px) */
  mx: number
  my: number
  /** what the picture was made from */
  paths: TerrainPaths | null
  zones: ZoneGfx | null
  size: number
  vw: number
  vh: number
  dpr: number
  /** paint the picture again at the next frame (the zoom has come to rest) */
  force: boolean
}

export const newTerrainCache = (): TerrainCache => ({ force: false, canvas: null, ox: 0, oy: 0, s: 1, mx: 0, my: 0, paths: null, zones: null, size: 0, vw: 0, vh: 0, dpr: 1 })

/** Largest picture, in device pixels, we are willing to keep (iOS limits canvases to about 16.7 million) */
const MAX_PIXELS = 12_000_000

export function drawTerrainCached(
  ctx: CanvasRenderingContext2D,
  view: { ox: number; oy: number; s: number },
  size: number,
  paths: TerrainPaths | null,
  vw: number,
  vh: number,
  zones: ZoneGfx | null,
  dpr: number,
  cache: TerrainCache,
  onScaled: () => void,
) {
  const fresh = !cache.force && cache.canvas && cache.paths === paths && cache.zones === zones && cache.size === size && cache.vw === vw && cache.vh === vh && cache.dpr === dpr
  if (fresh) {
    const k = view.s / cache.s
    const dx = view.ox + (-cache.mx - cache.ox) * k
    const dy = view.oy + (-cache.my - cache.oy) * k
    const dw = (vw + 2 * cache.mx) * k
    const dh = (vh + 2 * cache.my) * k
    // the picture still covers the whole screen: just copy it
    if (dx <= 0.5 && dy <= 0.5 && dx + dw >= vw - 0.5 && dy + dh >= vh - 0.5) {
      ctx.drawImage(cache.canvas!, dx, dy, dw, dh)
      if (Math.abs(k - 1) > 1e-4) onScaled()
      return
    }
  }
  // paint a new picture around the current view
  cache.force = false
  let f = 0.3
  if ((vw * (1 + 2 * f) * vh * (1 + 2 * f)) * dpr * dpr > MAX_PIXELS) f = 0.12
  const mx = Math.round(vw * f)
  const my = Math.round(vh * f)
  const canvas = cache.canvas ?? document.createElement('canvas')
  const W = Math.round((vw + 2 * mx) * dpr)
  const H = Math.round((vh + 2 * my) * dpr)
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W
    canvas.height = H
  }
  const c = canvas.getContext('2d')!
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, W, H)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawTerrain(c, { ox: view.ox + mx, oy: view.oy + my, s: view.s }, size, paths, vw + 2 * mx, vh + 2 * my, false, zones)
  cache.canvas = canvas
  cache.ox = view.ox
  cache.oy = view.oy
  cache.s = view.s
  cache.mx = mx
  cache.my = my
  cache.paths = paths
  cache.zones = zones
  cache.size = size
  cache.vw = vw
  cache.vh = vh
  cache.dpr = dpr
  ctx.drawImage(canvas, -mx, -my, vw + 2 * mx, vh + 2 * my)
}
