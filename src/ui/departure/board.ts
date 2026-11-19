import { clamp01 } from '../netCanvas'
import { padTo, Roll } from './roll'

/**
 * The information display of the update screen: a flat dark panel with a line badge, big version number, status and a
 * line of text for what the update is doing. Texts change by rolling (see `Roll`).
 * Everything is laid out in "design units" of a board that is 350 wide and scaled as a whole.
 */
export const BOARD_W = 350
export const BOARD_H = 382

type RGB = [number, number, number]
const AMBER: RGB = [255, 176, 46]
const GREEN: RGB = [98, 242, 161]
const INK: RGB = [246, 248, 252]
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
  /** seconds, for the pulse of the status dot */
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

  // the panel
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 44 * s
  ctx.shadowOffsetY = 16 * s
  roundRect(ctx, 0, 0, W, H, 22 * s)
  const hg = ctx.createLinearGradient(0, 0, 0, H)
  hg.addColorStop(0, '#141a23')
  hg.addColorStop(1, '#0a0d12')
  ctx.fillStyle = hg
  ctx.fill()
  ctx.restore()
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 22 * s)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
  // a thin line of the line's colour along the top edge
  ctx.save()
  roundRect(ctx, 0, 0, W, H, 22 * s)
  ctx.clip()
  const bar = ctx.createLinearGradient(0, 0, W, 0)
  bar.addColorStop(0, css(look.accent, 0.95))
  bar.addColorStop(1, css(look.accent, 0.15))
  ctx.fillStyle = bar
  ctx.fillRect(0, 0, W, 3 * s)
  ctx.restore()

  const px = 24 * s
  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    ctx.font = `600 ${10.5 * s}px ${look.family}`
    ls.letterSpacing = `${1.8 * s}px`
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = css(GREY)
    ctx.fillText(text, x, y)
    ls.letterSpacing = '0px'
  }
  const clipRect = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
  }

  // header: the direction and the clock
  label('ABFAHRT', px, 40 * s)
  ctx.save()
  clipRect(W - px - 90 * s, 18 * s, 90 * s, 30 * s)
  drawRoll(ctx, b.clock, W - px, 41 * s, { size: 20 * s, weight: 600, color: INK, align: 'right', family: look.family, rise: 14 * s })
  ctx.restore()

  // the version: big, every character rolls on its own
  label('VERSION', px, 82 * s)
  const vsize = 74 * s
  ctx.font = `600 ${vsize}px ${look.family}`
  const widths = b.version.map((r) => {
    const ch = r.target === ' ' ? (r.next !== null ? r.cur : '') : r.target
    return ch ? ctx.measureText(ch).width : 0
  })
  const total = widths.reduce((a, c) => a + c, 0)
  let vx = (W - total) / 2
  const vtop = 92 * s
  b.version.forEach((r, i) => {
    ctx.save()
    clipRect(vx - 4 * s, vtop, widths[i] + 8 * s, 82 * s)
    drawRoll(ctx, r, vx + widths[i] / 2, vtop + 68 * s, { size: vsize, weight: 600, color: INK, align: 'center', family: look.family, rise: 52 * s })
    ctx.restore()
    vx += widths[i]
  })

  // divider
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillRect(px, 188 * s, W - 2 * px, 1)

  // the departure: line badge, destination, platform
  const bw = 46 * s
  const by0 = 206 * s
  roundRect(ctx, px, by0, bw, bw, 12 * s)
  ctx.fillStyle = css(look.accent)
  ctx.fill()
  const luma = 0.299 * look.accent[0] + 0.587 * look.accent[1] + 0.114 * look.accent[2]
  ctx.font = `700 ${22 * s}px ${look.family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = luma > 150 ? '#0b0e13' : '#ffffff'
  ctx.fillText('U1', px + bw / 2, by0 + bw / 2 + 1 * s)
  const tx = px + bw + 14 * s
  ctx.save()
  clipRect(tx, by0 - 2 * s, 180 * s, 26 * s)
  drawRoll(ctx, b.ziel, tx, by0 + 20 * s, { size: 21 * s, weight: 700, color: INK, align: 'left', family: look.family, rise: 16 * s })
  ctx.restore()
  ctx.save()
  clipRect(tx, by0 + 25 * s, 180 * s, 24 * s)
  drawRoll(ctx, b.zug, tx, by0 + 41 * s, { size: 13.5 * s, weight: 500, color: GREY, align: 'left', family: look.family, rise: 12 * s })
  ctx.restore()
  // platform
  const gw = 64 * s
  const gx = W - px - gw
  roundRect(ctx, gx, by0 + 6 * s, gw, 34 * s, 17 * s)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.stroke()
  ctx.font = `600 ${13.5 * s}px ${look.family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = css(INK, 0.92)
  ctx.fillText('Gleis 1', gx + gw / 2, by0 + 23.5 * s)

  // status
  const sy = 272 * s
  const sh = 48 * s
  const statusColor = mixC(AMBER, GREEN, look.go)
  roundRect(ctx, px, sy, W - 2 * px, sh, 14 * s)
  ctx.fillStyle = css(statusColor, 0.07 + 0.05 * look.go)
  ctx.fill()
  ctx.strokeStyle = css(statusColor, 0.22)
  ctx.stroke()
  // the dot pulses while the train is awaited and stays calm when it is clear
  const pulse = look.go > 0.5 ? 0.5 : 0.5 + 0.5 * Math.sin(look.t * 5)
  const dx = px + 22 * s
  const dy = sy + sh / 2
  ctx.fillStyle = css(statusColor, 0.18 + 0.25 * pulse)
  ctx.beginPath()
  ctx.arc(dx, dy, (7 + 4 * pulse) * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(statusColor)
  ctx.beginPath()
  ctx.arc(dx, dy, 4.5 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  clipRect(px + 40 * s, sy, 170 * s, sh)
  drawRoll(ctx, b.status, px + 40 * s, sy + 31 * s, { size: 21 * s, weight: 700, color: statusColor, align: 'left', family: look.family, rise: 18 * s })
  ctx.restore()
  label('STATUS', W - px - 16 * s, sy + 29 * s, 'right')
  if (look.go > 0.01) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const gr = ctx.createRadialGradient(dx, dy, 0, dx, dy, 170 * s)
    gr.addColorStop(0, css(GREEN, 0.14 * look.go))
    gr.addColorStop(1, css(GREEN, 0))
    ctx.fillStyle = gr
    ctx.fillRect(0, sy - 40 * s, W, 150 * s)
    ctx.restore()
  }

  // what the update is doing right now
  const ly = 334 * s
  const lw = W - 2 * px
  const lh = 30 * s
  roundRect(ctx, px, ly, lw, lh, 15 * s)
  ctx.fillStyle = 'rgba(255,255,255,0.045)'
  ctx.fill()
  ctx.save()
  roundRect(ctx, px, ly, lw, lh, 15 * s)
  ctx.clip()
  // a light runs along the line while the update works, and stays full when it is done
  const run = look.go > 0.5 ? 1 : 0
  const sweep = ((look.t * 0.5) % 1.4) - 0.2
  const sg = ctx.createLinearGradient(px + lw * (sweep - 0.2), 0, px + lw * (sweep + 0.2), 0)
  sg.addColorStop(0, css(look.accent, 0))
  sg.addColorStop(0.5, css(look.accent, 0.5))
  sg.addColorStop(1, css(look.accent, 0))
  ctx.fillStyle = run ? css(GREEN, 0.5) : sg
  ctx.fillRect(px, ly + lh - 2.5 * s, lw, 2.5 * s)
  if (b.ticker) {
    const e = easeOutCubic(look.tickerAge / 0.4)
    ctx.font = `600 ${12.5 * s}px ${look.family}`
    ls.letterSpacing = `${0.6 * s}px`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = css(INK, 0.85 * e)
    ctx.fillText(b.ticker, px + lw / 2, ly + lh / 2 + (1 - e) * 10 * s)
    ls.letterSpacing = '0px'
  }
  ctx.restore()

  ctx.restore()
}
