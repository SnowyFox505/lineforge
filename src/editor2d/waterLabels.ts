import { namedWaters } from '../model/waters'
import type { CityDoc } from '../model/types'
import type { ViewTransform } from './terrainRender'

/** Names of the lakes, rivers, canals and seas (italic, light blue on the water) and a glow on the selected one. */
export function drawWaterLabels(ctx: CanvasRenderingContext2D, view: ViewTransform, doc: CityDoc, selectedId: string | null) {
  const named = namedWaters(doc)
  if (!named.length) return
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const { water, body } of named) {
    if (water.id === selectedId) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      for (const i of body.cells) {
        const x = i % doc.size
        const y = (i - x) / doc.size
        ctx.fillRect(view.ox + x * view.s - 0.3, view.oy + y * view.s - 0.3, view.s + 0.6, view.s + 0.6)
      }
    }
    // the name has to fit the water on screen: wide water gets a bigger name, a thin river a small one
    const span = Math.max(body.x1 - body.x0 + 1, body.y1 - body.y0 + 1) * view.s
    if (span < 40 && water.id !== selectedId) continue
    const fs = Math.round(Math.min(24, Math.max(11, span * 0.1)))
    ctx.font = `italic 600 ${fs}px 'Space Grotesk Variable', system-ui, sans-serif`
    const x = view.ox + body.label.x * view.s
    const y = view.oy + body.label.y * view.s
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(8,40,70,0.85)'
    ctx.strokeText(water.name, x, y)
    ctx.fillStyle = '#d8efff'
    ctx.fillText(water.name, x, y)
  }
  ctx.restore()
}
