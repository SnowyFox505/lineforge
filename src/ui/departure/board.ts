import { clamp01 } from '../netCanvas'
import { textDots } from './dotFont'
import { Flap, padTo } from './flap'

/**
 * The departure board of the update screen: split-flap tiles and an LED line, drawn on a 2D canvas.
 * Everything is laid out in "design units" of a board that is 350 wide and scaled as a whole.
 */
export const BOARD_W = 350
export const BOARD_H = 382

const WARM: RGB = [244, 240, 228]
const AMBER: RGB = [255, 176, 46]
const GREEN: RGB = [98, 242, 161]
type RGB = [number, number, number]

const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export interface Board {
  clock: Flap[]
  version: Flap[]
  zug: Flap[]
  gleis: Flap[]
  ziel: Flap[]
  status: Flap[]
  /** a wide tile (digit) or a narrow one (dot) for every place of the version */
  wide: boolean[]
  ticker: string
  tickerSince: number
}

const isDigit = (c: string) => c >= '0' && c <= '9'

export function makeBoard(oldVersion: string, newVersion: string): Board {
  const n = Math.max(oldVersion.length, newVersion.length)
  const mk = (len: number, fps = 15) => Array.from({ length: len }, () => new Flap(fps))
  return {
    clock: mk(5, 14),
    version: Array.from({ length: n }, () => new Flap(14)),
    zug: mk(9),
    gleis: mk(1),
    ziel: mk(12),
    status: mk(9),
    wide: Array.from({ length: n }, (_, i) => isDigit(oldVersion[i] ?? ' ') || isDigit(newVersion[i] ?? ' ')),
    ticker: '',
    tickerSince: 0,
  }
}

/** The board comes to life: every tile turns to its first text, left to right and top to bottom. */
export function startBoard(b: Board, oldVersion: string, clock: string, instant: boolean) {
  const put = (tiles: Flap[], text: string, delay: number, step: number, spins = 0) => {
    padTo(text, tiles.length).forEach((ch, i) => {
      if (instant) {
        tiles[i].cur = ch
        tiles[i].target = ch
      } else tiles[i].set(ch, delay + i * step, spins)
    })
  }
  put(b.clock, clock, 0.25, 0.07)
  put(b.version, oldVersion, 0.35, 0.09, 4)
  put(b.zug, 'LINEFORGE', 0.7, 0.05)
  put(b.gleis, '1', 1.0, 0)
  put(b.ziel, 'NEUE VERSION', 0.95, 0.045)
  put(b.status, 'EINFAHRT', 1.35, 0.045)
}

/** The new version turns in place of the old one. */
export function flipVersion(b: Board, newVersion: string, instant: boolean) {
  padTo(newVersion, b.version.length).forEach((ch, i) => {
    if (instant) {
      b.version[i].cur = ch
      b.version[i].target = ch
    } else b.version[i].set(ch, i * 0.08, 5)
  })
}

export function flipStatus(b: Board, instant: boolean) {
  padTo('PÜNKTLICH', b.status.length).forEach((ch, i) => {
    if (instant) {
      b.status[i].cur = ch
      b.status[i].target = ch
    } else b.status[i].set(ch, i * 0.05, 4)
  })
}

export function stepBoard(b: Board, dt: number) {
  for (const row of [b.clock, b.version, b.zug, b.gleis, b.ziel, b.status]) for (const f of row) f.step(dt)
}

/** true when no tile is turning any more */
export function boardSettled(b: Board): boolean {
  return [b.clock, b.version, b.zug, b.gleis, b.ziel, b.status].every((row) => row.every((f) => f.settled))
}

export function setClock(b: Board, clock: string) {
  padTo(clock, b.clock.length).forEach((ch, i) => b.clock[i].set(ch, 0, 0))
}

// ---- drawing ----------------------------------------------------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function tile(ctx: CanvasRenderingContext2D, f: Flap, x: number, y: number, w: number, h: number, color: RGB, glow: number, s: number, font: string) {
  const mid = y + h / 2
  const r = 3.4 * s
  const half = (which: 'top' | 'bot', ch: string, scaleY: number, shade: number) => {
    if (scaleY < 0.002) return
    ctx.save()
    ctx.translate(0, mid)
    ctx.scale(1, scaleY)
    ctx.translate(0, -mid)
    ctx.beginPath()
    if (which === 'top') ctx.rect(x - 1, y - 1, w + 2, h / 2 + 1)
    else ctx.rect(x - 1, mid, w + 2, h / 2 + 1)
    ctx.clip()
    roundRect(ctx, x, y, w, h, r)
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, '#222833')
    g.addColorStop(0.5, '#171c24')
    g.addColorStop(0.5, '#10141a')
    g.addColorStop(1, '#0c0f14')
    ctx.fillStyle = g
    ctx.fill()
    if (ch !== ' ') {
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (glow > 0.01) {
        ctx.shadowColor = css(color, 0.9 * glow)
        ctx.shadowBlur = 10 * s * glow
      }
      ctx.fillStyle = css(color)
      ctx.fillText(ch, x + w / 2, mid + h * 0.03)
      ctx.shadowBlur = 0
    }
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
    }
    ctx.restore()
  }
  const flipping = f.next !== null
  half('top', flipping ? f.next! : f.cur, 1, 0)
  half('bot', f.cur, 1, flipping && f.p > 0.5 ? 0.35 : 0)
  if (flipping) {
    if (f.p < 0.5) half('top', f.cur, Math.cos(f.p * Math.PI), f.p * 0.7)
    else half('bot', f.next!, -Math.cos(f.p * Math.PI), (1 - f.p) * 0.55)
  }
  // the gap between the two flaps and the hinge pins
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillRect(x, mid - 0.7 * s, w, 1.4 * s)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(x, mid + 0.7 * s, w, 0.6 * s)
  ctx.fillStyle = '#05070a'
  ctx.beginPath()
  ctx.arc(x + 1.2 * s, mid, 1.2 * s, 0, Math.PI * 2)
  ctx.arc(x + w - 1.2 * s, mid, 1.2 * s, 0, Math.PI * 2)
  ctx.fill()
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.stroke()
}

// the LED line: text raster as lit dots, rendered once per text and size
const tickerCache = new Map<string, HTMLCanvasElement>()

function tickerImage(text: string, w: number, h: number, dpr: number): HTMLCanvasElement {
  const key = `${text}|${Math.round(w)}|${Math.round(h)}|${dpr}`
  const hit = tickerCache.get(key)
  if (hit) return hit
  if (tickerCache.size > 12) tickerCache.clear()
  const { cols, rows, dots } = textDots(text)
  const out = document.createElement('canvas')
  out.width = Math.round(w * dpr)
  out.height = Math.round(h * dpr)
  const g = out.getContext('2d')!
  g.scale(dpr, dpr)
  const pitch = Math.min((h - 8) / 9.4, (w - 18) / (cols + 1), 5)
  const ox = (w - cols * pitch) / 2
  const oy = (h - rows * pitch) / 2
  // unlit dots over the whole panel
  g.fillStyle = 'rgba(255,176,46,0.08)'
  g.beginPath()
  for (let gx = ox - Math.floor((ox - 6) / pitch) * pitch; gx < w - 5; gx += pitch) {
    for (let gy = oy - Math.floor((oy - 3) / pitch) * pitch; gy < h - 3; gy += pitch) {
      g.moveTo(gx + pitch * 0.2, gy)
      g.arc(gx, gy, pitch * 0.2, 0, Math.PI * 2)
    }
  }
  g.fill()
  // lit dots, with a glow
  g.shadowColor = 'rgba(255,170,40,0.9)'
  g.shadowBlur = pitch * 1.3
  g.fillStyle = '#ffc04d'
  g.beginPath()
  for (const [x, y] of dots) {
    const cx = ox + (x + 0.5) * pitch
    const cy = oy + (y + 0.5) * pitch
    g.moveTo(cx + pitch * 0.34, cy)
    g.arc(cx, cy, pitch * 0.34, 0, Math.PI * 2)
  }
  g.fill()
  tickerCache.set(key, out)
  return out
}

export interface BoardLook {
  /** seconds, for the blinking and the gloss */
  t: number
  /** 0 = waiting, 1 = on time (the status turns green) */
  go: number
  dpr: number
  font: string
  family: string
  /** seconds since the LED text changed (it is written in from the left) */
  tickerAge: number
}

/** Draws the board with its top left corner at (bx, by), `s` pixels per design unit. */
export function drawBoard(ctx: CanvasRenderingContext2D, b: Board, bx: number, by: number, s: number, look: BoardLook) {
  ctx.save()
  ctx.translate(bx, by)
  const W = BOARD_W * s
  const H = BOARD_H * s

  // housing
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 40 * s
  ctx.shadowOffsetY = 14 * s
  roundRect(ctx, 0, 0, W, H, 18 * s)
  const hg = ctx.createLinearGradient(0, 0, 0, H)
  hg.addColorStop(0, '#1a2029')
  hg.addColorStop(1, '#0b0e13')
  ctx.fillStyle = hg
  ctx.fill()
  ctx.restore()
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 18 * s)
  ctx.strokeStyle = 'rgba(255,255,255,0.09)'
  ctx.lineWidth = 1
  ctx.stroke()
  // inner panel
  roundRect(ctx, 7 * s, 7 * s, W - 14 * s, H - 14 * s, 13 * s)
  ctx.fillStyle = '#080a0e'
  ctx.fill()
  // screws
  ctx.fillStyle = '#2a313c'
  for (const [sx, sy] of [[3.6, 3.6], [BOARD_W - 3.6, 3.6], [3.6, BOARD_H - 3.6], [BOARD_W - 3.6, BOARD_H - 3.6]]) {
    ctx.beginPath()
    ctx.arc(sx * s, sy * s, 1.5 * s, 0, Math.PI * 2)
    ctx.fill()
  }

  const px = 18 * s
  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left', color = 'rgba(255,176,46,0.7)', size = 9) => {
    ctx.font = `600 ${size * s}px ${look.family}`
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${1.6 * s}px`
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
  }

  // header: the direction of the board and the clock
  label('ABFAHRT', px, 30 * s, 'left', 'rgba(255,176,46,0.9)', 11)
  const cw = 13 * s
  const ch = 19 * s
  const cg = 2 * s
  const cwidths = [cw, cw, 7 * s, cw, cw]
  let clockX = W - px - (cwidths.reduce((acc, v) => acc + v, 0) + cg * 4)
  b.clock.forEach((f, i) => {
    tile(ctx, f, clockX, 15 * s, cwidths[i], ch, AMBER, 0, s * 0.5, `700 ${ch * 0.66}px ${look.family}`)
    clockX += cwidths[i] + cg
  })

  // the version
  label('VERSION', px, 62 * s)
  const gap = 4 * s
  const widths = b.wide.map((w) => (w ? 44 : 17) * s)
  const total = widths.reduce((a, c) => a + c, 0) + gap * (widths.length - 1)
  let vx = (W - total) / 2
  const vh = 64 * s
  b.version.forEach((f, i) => {
    tile(ctx, f, vx, 72 * s, widths[i], vh, WARM, 0, s, `700 ${vh * 0.68}px ${look.family}`)
    vx += widths[i] + gap
  })

  // divider
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(px, 150 * s, W - 2 * px, 1)

  // the departure
  const tw = 23 * s
  const th = 34 * s
  const tg = 2.5 * s
  const font = `700 ${th * 0.66}px ${look.family}`
  const row = (tiles: Flap[], y: number, color: RGB, glow = 0, blink = false, x0 = px) => {
    tiles.forEach((f, i) => {
      const on = !blink || Math.sin(look.t * Math.PI * 1.6) > -0.35
      tile(ctx, f, x0 + i * (tw + tg), y, tw, th, mixC(color, [color[0] * 0.35, color[1] * 0.35, color[2] * 0.35], on ? 0 : 1), glow, s, font)
    })
  }
  label('ZUG', px, 168 * s)
  row(b.zug, 174 * s, WARM)
  label('GLEIS', W - px - tw, 168 * s)
  row(b.gleis, 174 * s, WARM, 0, false, W - px - tw)
  label('ZIEL', px, 224 * s)
  row(b.ziel, 230 * s, WARM)
  label('STATUS', px, 280 * s)
  const statusColor = mixC(AMBER, GREEN, look.go)
  row(b.status, 286 * s, statusColor, look.go, look.go < 0.5, px)
  if (look.go > 0.01) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const gx = px + 4.5 * (tw + tg)
    const gr = ctx.createRadialGradient(gx, 303 * s, 0, gx, 303 * s, 150 * s)
    gr.addColorStop(0, css(GREEN, 0.16 * look.go))
    gr.addColorStop(1, css(GREEN, 0))
    ctx.fillStyle = gr
    ctx.fillRect(0, 230 * s, W, 140 * s)
    ctx.restore()
  }

  // the LED line
  const lx = px
  const ly = 332 * s
  const lw = W - 2 * px
  const lh = 36 * s
  roundRect(ctx, lx, ly, lw, lh, 6 * s)
  ctx.fillStyle = '#050608'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.stroke()
  if (b.ticker) {
    const img = tickerImage(b.ticker, lw, lh, look.dpr)
    ctx.save()
    roundRect(ctx, lx, ly, lw, lh, 6 * s)
    ctx.clip()
    // written in from the left
    const reveal = clamp01(look.tickerAge / 0.45)
    ctx.beginPath()
    ctx.rect(lx, ly, lw * reveal + (reveal < 1 ? 0 : 1), lh)
    ctx.clip()
    ctx.drawImage(img, lx, ly, lw, lh)
    ctx.restore()
  }

  // gloss over the glass
  ctx.save()
  roundRect(ctx, 7 * s, 7 * s, W - 14 * s, H - 14 * s, 13 * s)
  ctx.clip()
  const sweep = ((look.t * 0.12) % 2.4) - 0.7
  const gl = ctx.createLinearGradient(W * (sweep - 0.25), 0, W * (sweep + 0.25), H * 0.6)
  gl.addColorStop(0, 'rgba(255,255,255,0)')
  gl.addColorStop(0.5, 'rgba(255,255,255,0.045)')
  gl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gl
  ctx.fillRect(0, 0, W, H)
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.35)
  top.addColorStop(0, 'rgba(255,255,255,0.05)')
  top.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, H * 0.35)
  ctx.restore()

  ctx.restore()
}
