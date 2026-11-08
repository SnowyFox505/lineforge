import { layoutLines } from '../plan/layout'
import type { CityDoc } from '../model/types'
import { buildTerrainPaths, drawTerrain } from './terrainRender'
import { buildZoneGfx } from './zoneGfx'

/** Render a small preview of a city (terrain + network) into a canvas. */
export function renderThumb(canvas: HTMLCanvasElement, doc: CityDoc, cssW: number, cssH: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#0a0f15'
  ctx.fillRect(0, 0, cssW, cssH)

  const sts = Object.values(doc.stations)
  let cx = doc.size / 2
  let cy = doc.size / 2
  let span = doc.size
  if (sts.length) {
    const xs = sts.map((s) => s.x)
    const ys = sts.map((s) => s.y)
    cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5
    cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5
    span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * (cssW / cssH), 20) + 14
  }
  const s = cssW / span
  const view = { s, ox: cssW / 2 - cx * s, oy: cssH / 2 - cy * s }
  drawTerrain(ctx, view, doc.size, buildTerrainPaths(doc.terrain, doc.size), cssW, cssH, false, buildZoneGfx(doc))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const paths = layoutLines(doc, 0.2, { source: 'geo' })
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const line of Object.values(doc.lines)) {
    const pts = paths[line.id]
    if (!pts || pts.length < 2) continue
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = view.ox + (p.x + 0.5) * s
      const y = view.oy + (p.y + 0.5) * s
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.strokeStyle = line.color
    ctx.lineWidth = Math.max(2, s * 0.55)
    ctx.stroke()
  }
  for (const st of sts) {
    ctx.beginPath()
    ctx.arc(view.ox + (st.x + 0.5) * s, view.oy + (st.y + 0.5) * s, Math.max(2, s * 0.5), 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }
}
