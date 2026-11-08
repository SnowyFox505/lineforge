import type { PoiKind } from '../model/types'
import { getAccent } from '../ui/theme'

export const POI_STYLE: Record<PoiKind, { label: string; color: string; hint: string }> = {
  stadium: { label: 'Stadion', color: '#ff5470', hint: 'Bei Spielen strömen viele Menschen gleichzeitig an und ab.' },
  landmark: { label: 'Wahrzeichen', color: '#ffc233', hint: 'Zieht Touristen an, die mit dem Fernverkehr oder vom Flughafen kommen.' },
  attraction: { label: 'Attraktion', color: '#3db8ff', hint: 'Museum, Park, Messe oder ein anderes beliebtes Ziel.' },
}

/** Map marker of a point of interest. r is the base radius in px. */
export function drawPoi(ctx: CanvasRenderingContext2D, kind: PoiKind, x: number, y: number, r: number, selected: boolean, label?: string) {
  const color = POI_STYLE[kind].color
  ctx.save()
  ctx.translate(x, y)
  if (selected) {
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2)
    const acc = getAccent()
    ctx.strokeStyle = acc.hex
    ctx.lineWidth = 2.5
    ctx.shadowColor = `rgba(${acc.rgb},0.9)`
    ctx.shadowBlur = 14
    ctx.stroke()
    ctx.shadowBlur = 0
  }
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = r * 0.8
  ctx.shadowOffsetY = r * 0.2
  // rounded badge
  const d = r * 1.35
  ctx.beginPath()
  ctx.roundRect(-d, -d, d * 2, d * 2, d * 0.55)
  const g = ctx.createLinearGradient(0, -d, 0, d)
  g.addColorStop(0, color)
  g.addColorStop(1, '#1a1f27')
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = Math.max(1.5, r * 0.22)
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  // glyph
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = Math.max(1.4, r * 0.18)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const u = r * 0.62
  if (kind === 'stadium') {
    ctx.beginPath()
    ctx.ellipse(0, 0, u * 1.2, u * 0.75, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0, 0, u * 0.55, u * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'landmark') {
    ctx.beginPath()
    ctx.moveTo(-u, u)
    ctx.lineTo(-u, -u * 0.1)
    ctx.arc(0, -u * 0.1, u, Math.PI, 0)
    ctx.lineTo(u, u)
    ctx.moveTo(-u * 1.25, u)
    ctx.lineTo(u * 1.25, u)
    ctx.stroke()
  } else {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? u * 0.45 : u * 1.1
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  if (label) {
    ctx.save()
    ctx.font = `600 ${Math.max(11, Math.round(r * 1.5))}px 'Space Grotesk Variable', system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(6,10,14,0.85)'
    ctx.strokeText(label, x, y + r * 1.9)
    ctx.fillStyle = '#f4f7fa'
    ctx.fillText(label, x, y + r * 1.9)
    ctx.restore()
  }
}
