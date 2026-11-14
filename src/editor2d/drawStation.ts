import type { StationType } from '../model/types'
import { getAccent } from '../ui/theme'
import { PLANE_POINTS } from '../plan/glyphs'

const FONT = "'Space Grotesk Variable', system-ui, sans-serif"

/** Draw a station symbol on a 2D canvas. r is the base radius in px, k an optional pop-in scale. */
export function drawStation(
  ctx: CanvasRenderingContext2D,
  type: StationType,
  x: number,
  y: number,
  r: number,
  selected = false,
  k = 1,
) {
  if (k <= 0.01) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  ctx.lineJoin = 'round'
  // a soft drop shadow made of two flat discs (a real blurred shadow is slow on phones)
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.arc(0, r * 0.3, r * 1.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.arc(0, r * 0.25, r * 1.15, 0, Math.PI * 2)
  ctx.fill()

  if (selected) {
    const acc = getAccent()
    ctx.save()
    ctx.shadowColor = `rgba(${acc.rgb},0.9)`
    ctx.shadowBlur = r * 2.2
    ctx.beginPath()
    ctx.arc(0, 0, r * 2.3, 0, Math.PI * 2)
    ctx.strokeStyle = acc.hex
    ctx.lineWidth = Math.max(2, r * 0.3)
    ctx.stroke()
    ctx.restore()
  }

  const ink = '#0b0f15'
  switch (type) {
    case 'standard':
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = ink
      ctx.lineWidth = Math.max(1.5, r * 0.38)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.stroke()
      break
    case 'interchange':
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = ink
      ctx.lineWidth = Math.max(2, r * 0.5)
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.stroke()
      break
    case 'tramstop': {
      // a small rounded square: the stop of a tram
      const d = r * 1.05
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = ink
      ctx.lineWidth = Math.max(1.6, r * 0.42)
      ctx.beginPath()
      ctx.roundRect(-d, -d, d * 2, d * 2, d * 0.45)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.stroke()
      break
    }
    case 'hauptbahnhof': {
      const w = r * 2.3
      const h = r * 1.8
      const g = ctx.createLinearGradient(0, -h, 0, h)
      g.addColorStop(0, '#3a63ff')
      g.addColorStop(1, '#1c2f9e')
      ctx.fillStyle = g
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = Math.max(1.5, r * 0.3)
      ctx.beginPath()
      ctx.roundRect(-w, -h, w * 2, h * 2, r * 0.7)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${Math.round(r * 2.2)}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('H', 0, r * 0.08)
      break
    }
    case 'airport': {
      const R = r * 2.1
      const g = ctx.createLinearGradient(0, -R, 0, R)
      g.addColorStop(0, '#2fb8ff')
      g.addColorStop(1, '#0a5fbf')
      ctx.fillStyle = g
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = Math.max(1.5, r * 0.3)
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.stroke()
      ctx.fillStyle = '#fff'
      const a = Math.PI / 4
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      ctx.beginPath()
      PLANE_POINTS.forEach(([px, py], i) => {
        const rx = (px * cos - py * sin) * R * 0.6
        const ry = (px * sin + py * cos) * R * 0.6
        if (i) ctx.lineTo(rx, ry)
        else ctx.moveTo(rx, ry)
      })
      ctx.closePath()
      ctx.fill()
      break
    }
  }
  ctx.restore()
}
