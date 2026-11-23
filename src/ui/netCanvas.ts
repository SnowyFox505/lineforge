/**
 * Shared drawing code for the animated network of the start screen and the loading screen.
 * Everything is drawn on a plain 2D canvas in a 400 x 800 "design space": no SVG filters, no blur,
 * glow comes from a few stacked translucent strokes. That keeps it smooth on phones.
 */
export type P = [number, number]

export interface NetLine {
  color: string
  pts: P[]
  stations: P[]
  big?: P[]
}

export const NET_LINES: NetLine[] = [
  { color: '#ff5470', pts: [[-20, 610], [110, 610], [210, 510], [210, 330], [330, 210], [420, 210]], stations: [[110, 610], [210, 510], [210, 330], [330, 210]] },
  { color: '#3db8ff', pts: [[70, -20], [70, 200], [190, 320], [190, 470], [310, 590], [420, 590]], stations: [[70, 200], [190, 320], [310, 590]], big: [[190, 430]] },
  { color: '#a6e03c', pts: [[-20, 330], [90, 330], [190, 430], [420, 430]], stations: [[90, 330], [330, 430]] },
  { color: '#ffc233', pts: [[330, -20], [330, 110], [250, 190], [250, 260], [150, 360], [150, 560], [90, 620], [90, 820]], stations: [[330, 110], [250, 190], [150, 360], [150, 560], [90, 620]] },
  { color: '#9a6bff', pts: [[420, 700], [260, 700], [190, 770], [190, 820]], stations: [[260, 700], [190, 770]] },
]

export const DESIGN_W = 400
export const DESIGN_H = 800

export class Track {
  readonly cum: number[] = [0]
  readonly pts: P[]
  constructor(pts: P[]) {
    this.pts = pts
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  get total() {
    return this.cum[this.cum.length - 1]
  }
  at(d: number): P {
    const x = Math.min(this.total, Math.max(0, d))
    let i = 1
    while (i < this.cum.length - 1 && this.cum[i] < x) i++
    const seg = this.cum[i] - this.cum[i - 1] || 1
    const t = (x - this.cum[i - 1]) / seg
    return [this.pts[i - 1][0] + (this.pts[i][0] - this.pts[i - 1][0]) * t, this.pts[i - 1][1] + (this.pts[i][1] - this.pts[i - 1][1]) * t]
  }
  /** distance along the track of the point of the track closest to p */
  project(p: P): number {
    let best = Infinity
    let bd = 0
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1]
      const [bx, by] = this.pts[i]
      const dx = bx - ax
      const dy = by - ay
      const l2 = dx * dx + dy * dy || 1
      const t = Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2))
      const d = Math.hypot(ax + dx * t - p[0], ay + dy * t - p[1])
      if (d < best) {
        best = d
        bd = this.cum[i - 1] + Math.sqrt(l2) * t
      }
    }
    return bd
  }
  /** adds the stretch between d0 and d1 to the current path */
  trace(ctx: CanvasRenderingContext2D, d0: number, d1: number) {
    if (d1 <= d0) return
    const a = this.at(d0)
    ctx.moveTo(a[0], a[1])
    for (let i = 1; i < this.pts.length; i++) {
      if (this.cum[i] > d0 && this.cum[i] < d1) ctx.lineTo(this.pts[i][0], this.pts[i][1])
    }
    const b = this.at(d1)
    ctx.lineTo(b[0], b[1])
  }
}

export interface PreparedLine extends NetLine {
  track: Track
  stationAt: { d: number; big: boolean; p: P }[]
}

export function prepareNet(lines: NetLine[] = NET_LINES): PreparedLine[] {
  return lines.map((l) => {
    const track = new Track(l.pts)
    const stationAt = [
      ...l.stations.map((p) => ({ d: track.project(p), big: false, p })),
      ...(l.big ?? []).map((p) => ({ d: track.project(p), big: true, p })),
    ].sort((a, b) => a.d - b.d)
    return { ...l, track, stationAt }
  })
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3
export const easeInOut = (x: number) => {
  const t = clamp01(x)
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
export const easeOutBack = (x: number) => {
  const t = clamp01(x)
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** One line (or a stretch of it) with a soft glow made of stacked strokes. */
export function strokeGlowing(ctx: CanvasRenderingContext2D, track: Track, d0: number, d1: number, color: string, alpha = 1) {
  if (d1 - d0 < 0.01 || alpha <= 0.002) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  for (const [w, a] of [[17, 0.07], [11, 0.13], [5, 1]] as [number, number][]) {
    ctx.globalAlpha = a * alpha * (w === 5 ? 1 : 0.9)
    ctx.lineWidth = w
    ctx.beginPath()
    track.trace(ctx, d0, d1)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

export function drawStation(ctx: CanvasRenderingContext2D, p: P, big: boolean, scale: number, alpha = 1) {
  if (scale <= 0.01) return
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(p[0], p[1], (big ? 10 : 6.5) * scale, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = (big ? 4.5 : 3) * scale
  ctx.strokeStyle = '#0a0e14'
  ctx.stroke()
  ctx.globalAlpha = 1
}

let spriteCache: HTMLCanvasElement | null = null
/** Small pre-rendered glow, so moving lights need no gradients per frame. */
export function glowSprite(): HTMLCanvasElement {
  if (spriteCache) return spriteCache
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  spriteCache = c
  return c
}

export function drawLight(ctx: CanvasRenderingContext2D, p: P, size: number, alpha: number) {
  if (alpha <= 0.002) return
  ctx.globalAlpha = alpha
  ctx.drawImage(glowSprite(), p[0] - size / 2, p[1] - size / 2, size, size)
  ctx.globalAlpha = 1
}

/** A blurry coloured blob, drawn big and soft behind everything. */
export function blobSprite(rgb: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 192
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(96, 96, 0, 96, 96, 96)
  grad.addColorStop(0, `rgba(${rgb.join(',')},1)`)
  grad.addColorStop(0.45, `rgba(${rgb.join(',')},0.35)`)
  grad.addColorStop(1, `rgba(${rgb.join(',')},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 192, 192)
  return c
}

export const REDUCED_MOTION =() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
