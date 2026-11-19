import { clamp01 } from '../netCanvas'
import { padTo, Roll } from './roll'

/**
 * The information display of the update screen: a flat dark panel with a line badge, big version number, status and a
 * line of text for what the update is doing. Texts change by rolling (see `Roll`).
 * Everything is laid out in "design units" of a board that is 350 wide and scaled as a whole.
 */
export const BOARD_W = 350
export const BOARD_H = 262

type RGB = [number, number, number]
const AMBER: RGB = [255, 176, 46]
const GREEN: RGB = [98, 242, 161]
const GREY: RGB = [140, 150, 165]

const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)

export interface Board {
  clock: Roll
  /** one roll per character, so the digits turn one after the other */
  version: Roll[]
  zug: Roll
  ziel: Roll
  status: Roll
  ticker: string
  tickerSince: number
}

export function makeBoard(oldVersion: string, newVersion: string): Board {
  const n = Math.max(oldVersion.length, newVersion.length)
  return {
    clock: new Roll(),
    version: Array.from({ length: n }, () => new Roll()),
    zug: new Roll(),
    ziel: new Roll(),
    status: new Roll(),
    ticker: '',
    tickerSince: 0,
  }
}

const allRolls = (b: Board): Roll[] => [b.clock, ...b.version, b.zug, b.ziel, b.status]

/** The board comes to life: the texts roll in, top to bottom. */
export function startBoard(b: Board, oldVersion: string, clock: string, instant: boolean) {
  const put = (r: Roll, text: string, delay: number) => (instant ? r.jump(text) : r.set(text, delay))
  put(b.clock, clock, 0.2)
  padTo(oldVersion, b.version.length).forEach((ch, i) => put(b.version[i], ch, 0.3 + i * 0.08))
  put(b.zug, 'LineForge', 0.85)
  put(b.ziel, 'Neue Version', 0.95)
  put(b.status, 'Einfahrt', 1.15)
}

/** The new version rolls in place of the old one. */
export function flipVersion(b: Board, newVersion: string, instant: boolean) {
  padTo(newVersion, b.version.length).forEach((ch, i) => (instant ? b.version[i].jump(ch) : b.version[i].set(ch, i * 0.09)))
}

export function flipStatus(b: Board, instant: boolean) {
  if (instant) b.status.jump('Pünktlich')
  else b.status.set('Pünktlich', 0)
}

export function stepBoard(b: Board, dt: number) {
  for (const r of allRolls(b)) r.step(dt)
}

/** true when nothing is rolling any more */
export function boardSettled(b: Board): boolean {
  return allRolls(b).every((r) => r.settled)
}

export function setClock(b: Board, clock: string) {
  b.clock.set(clock, 0)
}

// ---- drawing ----------------------------------------------------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

interface TextLook {
  size: number
  weight: number
  color: RGB
  align: CanvasTextAlign
  family: string
  /** how far the text travels while it rolls */
  rise: number
}

/** a rolling text: the old one goes up and out, the new one comes from below (the caller sets the clip) */
function drawRoll(ctx: CanvasRenderingContext2D, r: Roll, x: number, y: number, t: TextLook, alpha = 1) {
  ctx.font = `${t.weight} ${t.size}px ${t.family}`
  ctx.textAlign = t.align
  ctx.textBaseline = 'alphabetic'
  if (r.next === null) {
    if (r.cur) {
      ctx.fillStyle = css(t.color, alpha)
      ctx.fillText(r.cur, x, y)
    }
    return
  }
  const e = easeOutCubic(r.p)
  if (r.cur && e < 0.99) {
    ctx.fillStyle = css(t.color, alpha * (1 - e))
    ctx.fillText(r.cur, x, y - e * t.rise)
  }
  if (e > 0.01) {
    ctx.fillStyle = css(t.color, alpha * e)
    ctx.fillText(r.next, x, y + (1 - e) * t.rise)
  }
}

export interface BoardLook {
  /** seconds, for the fine flicker of the screen */
  t: number
  /** 0 = waiting, 1 = on time (the status turns green) */
  go: number
  dpr: number
  family: string
  /** the colour of the line badge */
  accent: RGB
  /** seconds since the text line changed (it comes in from below) */
  tickerAge: number
}

/** Draws the board with its top left corner at (bx, by), `s` pixels per design unit. */
export function drawBoard(ctx: CanvasRenderingContext2D, b: Board, bx: number, by: number, s: number, look: BoardLook) {
  ctx.save()
  ctx.translate(bx, by)
  const W = BOARD_W * s
  const H = BOARD_H * s
  const ls = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  const clipRect = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
  }

  // steel frame
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.7)'
  ctx.shadowBlur = 30 * s
  ctx.shadowOffsetY = 10 * s
  roundRect(ctx, 0, 0, W, H, 7 * s)
  const fg = ctx.createLinearGradient(0, 0, 0, H)
  fg.addColorStop(0, '#3a4048')
  fg.addColorStop(0.5, '#23272d')
  fg.addColorStop(1, '#17191d')
  ctx.fillStyle = fg
  ctx.fill()
  ctx.restore()
  // the screen
  const m = 6 * s
  const sx = m
  const sy = m
  const sw = W - 2 * m
  const sh = H - 2 * m
  roundRect(ctx, sx, sy, sw, sh, 2.5 * s)
  ctx.fillStyle = '#03050a'
  ctx.fill()
  ctx.save()
  roundRect(ctx, sx, sy, sw, sh, 2.5 * s)
  ctx.clip()

  const px = 22 * s
  const white: RGB = [250, 251, 253]
  const line = (y: number, a = 0.16) => {
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fillRect(sx, y, sw, Math.max(1, 1 * s))
  }

  // header: platform and clock
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillRect(sx, sy, sw, 40 * s)
  ctx.font = `700 ${18 * s}px ${look.family}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = css(white)
  ctx.fillText('Gleis 1', px, sy + 21 * s)
  ctx.save()
  clipRect(W - px - 90 * s, sy + 4 * s, 90 * s, 34 * s)
  drawRoll(ctx, b.clock, W - px, sy + 28 * s, { size: 20 * s, weight: 600, color: white, align: 'right', family: look.family, rise: 14 * s })
  ctx.restore()
  line(sy + 40 * s, 0.3)

  // the departure: line badge, destination and status
  const r1 = sy + 40 * s
  const bw = 58 * s
  const bh = 40 * s
  const byy = r1 + 16 * s
  roundRect(ctx, px, byy, bw, bh, 7 * s)
  ctx.fillStyle = css(look.accent)
  ctx.fill()
  const luma = 0.299 * look.accent[0] + 0.587 * look.accent[1] + 0.114 * look.accent[2]
  ctx.font = `700 ${25 * s}px ${look.family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = luma > 150 ? '#05070a' : '#ffffff'
  ctx.fillText('U1', px + bw / 2, byy + bh / 2 + 1 * s)
  const tx = px + bw + 16 * s
  ctx.save()
  clipRect(tx, r1 + 6 * s, 150 * s, 36 * s)
  drawRoll(ctx, b.ziel, tx, r1 + 33 * s, { size: 24 * s, weight: 700, color: white, align: 'left', family: look.family, rise: 18 * s })
  ctx.restore()
  ctx.save()
  clipRect(tx, r1 + 38 * s, 150 * s, 24 * s)
  drawRoll(ctx, b.zug, tx, r1 + 54 * s, { size: 14 * s, weight: 500, color: GREY, align: 'left', family: look.family, rise: 12 * s })
  ctx.restore()
  const statusColor = mixC(AMBER, GREEN, look.go)
  line(r1 + 74 * s)

  // the version
  const r2 = r1 + 74 * s
  ls.letterSpacing = `${1.8 * s}px`
  ctx.font = `600 ${10.5 * s}px ${look.family}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = css(GREY)
  ctx.fillText('VERSION', px, r2 + 24 * s)
  ctx.textAlign = 'right'
  ctx.fillText('STATUS', W - px, r2 + 24 * s)
  ls.letterSpacing = '0px'
  ctx.save()
  clipRect(W - px - 130 * s, r2 + 38 * s, 130 * s, 44 * s)
  drawRoll(ctx, b.status, W - px, r2 + 68 * s, { size: 22 * s, weight: 700, color: statusColor, align: 'right', family: look.family, rise: 18 * s })
  ctx.restore()
  const vsize = 50 * s
  ctx.font = `700 ${vsize}px ${look.family}`
  const widths = b.version.map((r) => {
    const ch = r.target === ' ' ? (r.next !== null ? r.cur : '') : r.target
    return ch ? ctx.measureText(ch).width : 0
  })
  let vx = px
  b.version.forEach((r, i) => {
    ctx.save()
    clipRect(vx - 2 * s, r2 + 30 * s, widths[i] + 4 * s, 62 * s)
    drawRoll(ctx, r, vx + widths[i] / 2, r2 + 76 * s, { size: vsize, weight: 700, color: white, align: 'center', family: look.family, rise: 40 * s })
    ctx.restore()
    vx += widths[i]
  })
  line(r2 + 98 * s)

  // the info line in amber, as on the screens above real platforms
  const r3 = r2 + 98 * s
  const ih = sy + sh - r3
  if (b.ticker) {
    const e = easeOutCubic(look.tickerAge / 0.4)
    const col = look.go > 0.5 ? GREEN : AMBER
    ctx.fillStyle = css(col, e)
    roundRect(ctx, px, r3 + ih / 2 - 3.5 * s, 7 * s, 7 * s, 1.5 * s)
    ctx.fill()
    ctx.save()
    clipRect(px + 16 * s, r3, sw - 2 * px, ih)
    ctx.font = `600 ${16 * s}px ${look.family}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = css(col, e)
    ctx.fillText(b.ticker, px + 18 * s, r3 + ih / 2 + 1 * s + (1 - e) * 12 * s)
    ctx.restore()
  }

  // the fine raster of the display and a trace of glass
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  for (let y = sy; y < sy + sh; y += 2 * s) ctx.fillRect(sx, y, sw, Math.max(0.5, 0.8 * s))
  const gl = ctx.createLinearGradient(0, sy, 0, sy + sh * 0.5)
  gl.addColorStop(0, 'rgba(255,255,255,0.04)')
  gl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gl
  ctx.fillRect(sx, sy, sw, sh * 0.5)
  ctx.restore()
  roundRect(ctx, sx, sy, sw, sh, 2.5 * s)
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'
  ctx.lineWidth = 1.2 * s
  ctx.stroke()

  ctx.restore()
}
