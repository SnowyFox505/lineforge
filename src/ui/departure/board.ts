import { clamp01 } from '../netCanvas'
import { padTo, Roll } from './roll'

/**
 * The passenger information display of the update screen, modelled on the new displays above the platforms of the
 * Hamburg underground (2026): a deep blue screen in a grey housing, the line badge and the destination on top, the
 * stops "über ..." below, a thin line, and at the bottom the departure info. Here the "stops" are the steps of the update
 * and the departure info is the version and the status. Texts change by rolling (see `Roll`).
 * Everything is laid out in "design units" of a board that is 350 wide and scaled as a whole.
 */
export const BOARD_W = 350
export const BOARD_H = 196

/** the steps of the update, shown as the stops of the journey; the update screen sets `Board.ticker` to one of them */
export const STOPS = ['Suche nach Updates', 'Speicher leeren', 'Städte sichern', 'Neustart']
export const FINISH_TEXT = 'Bitte zurücktreten'

type RGB = [number, number, number]
const BLUE_TOP: RGB = [18, 46, 132]
const BLUE_BOTTOM: RGB = [9, 28, 98]
const WHITE: RGB = [255, 255, 255]
const SOFT: RGB = [186, 202, 238]
const MINT: RGB = [150, 244, 178]
const YELLOW: RGB = [252, 205, 22]
/** the lettering of platform displays: a plain grotesque, on purpose not the font of the app */
const SIGN = `'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, sans-serif`

const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)

export interface Board {
  clock: Roll
  /** one roll per character, so the digits turn one after the other */
  version: Roll[]
  ziel: Roll
  status: Roll
  ticker: string
}

export function makeBoard(oldVersion: string, newVersion: string): Board {
  const n = Math.max(oldVersion.length, newVersion.length)
  return {
    clock: new Roll(),
    version: Array.from({ length: n }, () => new Roll()),
    ziel: new Roll(),
    status: new Roll(),
    ticker: '',
  }
}

const allRolls = (b: Board): Roll[] => [b.clock, ...b.version, b.ziel, b.status]

/** The display comes to life: the texts roll in, top to bottom. */
export function startBoard(b: Board, oldVersion: string, clock: string, instant: boolean) {
  const put = (r: Roll, text: string, delay: number) => (instant ? r.jump(text) : r.set(text, delay))
  put(b.clock, clock, 0.2)
  put(b.ziel, 'Neue Version', 0.35)
  padTo(oldVersion, b.version.length).forEach((ch, i) => put(b.version[i], ch, 0.8 + i * 0.07))
  put(b.status, 'Einfahrt', 1.05)
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
  /** how far the text travels while it rolls */
  rise: number
}

/** a rolling text: the old one goes up and out, the new one comes from below (the caller sets the clip) */
function drawRoll(ctx: CanvasRenderingContext2D, r: Roll, x: number, y: number, t: TextLook) {
  ctx.font = `${t.weight} ${t.size}px ${SIGN}`
  ctx.textAlign = t.align
  ctx.textBaseline = 'alphabetic'
  if (r.next === null) {
    if (r.cur) {
      ctx.fillStyle = css(t.color)
      ctx.fillText(r.cur, x, y)
    }
    return
  }
  const e = easeOutCubic(r.p)
  if (r.cur && e < 0.99) {
    ctx.fillStyle = css(t.color, 1 - e)
    ctx.fillText(r.cur, x, y - e * t.rise)
  }
  if (e > 0.01) {
    ctx.fillStyle = css(t.color, e)
    ctx.fillText(r.next, x, y + (1 - e) * t.rise)
  }
}

export interface BoardLook {
  /** 0 = waiting, 1 = on time (the status turns mint) */
  go: number
  /** seconds since the info text changed */
  tickerAge: number
}

/** Draws the display with its top left corner at (bx, by), `s` pixels per design unit. */
export function drawBoard(ctx: CanvasRenderingContext2D, b: Board, bx: number, by: number, s: number, look: BoardLook) {
  ctx.save()
  ctx.translate(bx, by)
  const W = BOARD_W * s
  const H = BOARD_H * s
  const clipRect = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
  }

  // the two short poles it hangs on
  for (const px of [58 * s, W - 58 * s]) {
    const g = ctx.createLinearGradient(px - 3 * s, 0, px + 3 * s, 0)
    g.addColorStop(0, '#4c525a')
    g.addColorStop(0.5, '#9aa1ab')
    g.addColorStop(1, '#474c53')
    ctx.fillStyle = g
    ctx.fillRect(px - 3 * s, -14 * s, 6 * s, 16 * s)
  }

  // the housing: grey metal, a little deeper at the bottom
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 26 * s
  ctx.shadowOffsetY = 10 * s
  roundRect(ctx, 0, 0, W, H, 5 * s)
  const hg = ctx.createLinearGradient(0, 0, 0, H)
  hg.addColorStop(0, '#6d747d')
  hg.addColorStop(0.08, '#565c64')
  hg.addColorStop(1, '#2c3037')
  ctx.fillStyle = hg
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(5 * s, 0.5, W - 10 * s, Math.max(1, s * 0.8))

  // the screen
  const sx = 7 * s
  const sy = 7 * s
  const sw = W - 14 * s
  const sh = 172 * s
  roundRect(ctx, sx - 1.5 * s, sy - 1.5 * s, sw + 3 * s, sh + 3 * s, 3 * s)
  ctx.fillStyle = '#05070b'
  ctx.fill()
  ctx.save()
  roundRect(ctx, sx, sy, sw, sh, 1.5 * s)
  ctx.clip()
  ctx.translate(sx, sy)
  const bg = ctx.createLinearGradient(0, 0, 0, sh)
  bg.addColorStop(0, css(BLUE_TOP))
  bg.addColorStop(1, css(BLUE_BOTTOM))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, sw, sh)
  // the backlight is a little brighter in the middle
  const vg = ctx.createRadialGradient(sw / 2, sh * 0.4, 0, sw / 2, sh * 0.4, sw * 0.65)
  vg.addColorStop(0, 'rgba(70,110,230,0.2)')
  vg.addColorStop(1, 'rgba(70,110,230,0)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, sw, sh)

  const pad = 15 * s
  const textX = 58 * s
  const textW = sw - textX - pad

  // line badge, destination and the time
  const bw = 36 * s
  const bh = 27 * s
  roundRect(ctx, pad, 14 * s, bw, bh, 2.5 * s)
  ctx.fillStyle = css(YELLOW)
  ctx.fill()
  ctx.font = `700 ${19 * s}px ${SIGN}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#16140a'
  ctx.fillText('U1', pad + bw / 2, 14 * s + bh / 2 + 1 * s)
  ctx.save()
  clipRect(textX, 10 * s, textW - 46 * s, 36 * s)
  drawRoll(ctx, b.ziel, textX, 37 * s, { size: 25 * s, weight: 500, color: WHITE, align: 'left', rise: 20 * s })
  ctx.restore()
  ctx.save()
  clipRect(sw - pad - 50 * s, 10 * s, 50 * s, 18 * s)
  drawRoll(ctx, b.clock, sw - pad, 24 * s, { size: 11.5 * s, weight: 500, color: SOFT, align: 'right', rise: 10 * s })
  ctx.restore()

  // "über" and the stops: the steps of the update
  const fin = b.ticker !== '' && !STOPS.includes(b.ticker)
  const cur = STOPS.indexOf(b.ticker)
  const e = easeOutCubic(look.tickerAge / 0.4)
  ctx.textBaseline = 'alphabetic'
  if (!fin) {
    ctx.font = `400 ${13.5 * s}px ${SIGN}`
    ctx.textAlign = 'left'
    ctx.fillStyle = css(SOFT)
    ctx.fillText('über', pad, 69 * s)
    const fs = 12.5 * s
    const gap = 6 * s
    ctx.font = `400 ${fs}px ${SIGN}`
    const dash = ctx.measureText('–').width
    let x = textX
    let y = 69 * s
    STOPS.forEach((name, i) => {
      ctx.font = `600 ${fs}px ${SIGN}`
      const w = ctx.measureText(name).width
      const first = x === textX
      const need = (first ? 0 : dash + gap * 2) + w
      if (!first && x - textX + need > textW) {
        x = textX
        y += 21 * s
      }
      if (x !== textX) {
        ctx.font = `400 ${fs}px ${SIGN}`
        ctx.fillStyle = css(SOFT, 0.7)
        ctx.fillText('–', x + gap, y)
        x += dash + gap * 2
      }
      const now = i === cur
      const done = i < cur
      ctx.font = `${now ? 700 : 400} ${fs}px ${SIGN}`
      ctx.fillStyle = css(now ? WHITE : done ? SOFT : WHITE, now ? 1 : done ? 0.5 : 0.88)
      ctx.fillText(name, x, y)
      x += w
    })
  } else {
    ctx.save()
    clipRect(textX - 4 * s, 52 * s, textW + 8 * s, 44 * s)
    ctx.font = `500 ${17 * s}px ${SIGN}`
    ctx.textAlign = 'left'
    ctx.fillStyle = css(WHITE, e)
    ctx.fillText(b.ticker, textX, 72 * s + (1 - e) * 16 * s)
    ctx.restore()
  }

  // the thin line
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(pad, 108 * s, sw - 2 * pad, Math.max(1, 1 * s))

  // the departure info: the version on the left, the status on the right
  ctx.font = `400 ${11.5 * s}px ${SIGN}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = css(SOFT)
  ctx.fillText('Version', pad, 128 * s)
  const vsize = 31 * s
  ctx.font = `600 ${vsize}px ${SIGN}`
  const widths = b.version.map((r) => {
    const ch = r.target === ' ' ? (r.next !== null ? r.cur : '') : r.target
    return ch ? ctx.measureText(ch).width : 0
  })
  let vx = pad
  b.version.forEach((r, i) => {
    ctx.save()
    clipRect(vx - 2 * s, 130 * s, widths[i] + 4 * s, 38 * s)
    drawRoll(ctx, r, vx + widths[i] / 2, 160 * s, { size: vsize, weight: 600, color: WHITE, align: 'center', rise: 26 * s })
    ctx.restore()
    vx += widths[i]
  })
  ctx.save()
  clipRect(sw - pad - 150 * s, 134 * s, 150 * s, 32 * s)
  drawRoll(ctx, b.status, sw - pad, 159 * s, { size: 19 * s, weight: 500, color: mixC(WHITE, MINT, look.go), align: 'right', rise: 16 * s })
  ctx.restore()

  // the glass: a faint reflection across the corner
  const gl = ctx.createLinearGradient(0, 0, sw * 0.9, sh)
  gl.addColorStop(0, 'rgba(255,255,255,0.07)')
  gl.addColorStop(0.32, 'rgba(255,255,255,0.02)')
  gl.addColorStop(0.33, 'rgba(255,255,255,0)')
  gl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gl
  ctx.fillRect(0, 0, sw, sh)
  ctx.restore()

  // the lower lip of the housing with a tiny status light
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(7 * s, 183 * s, W - 14 * s, 1)
  ctx.fillStyle = css(mixC([255, 176, 46], MINT, look.go), 0.9)
  ctx.beginPath()
  ctx.arc(W - 14 * s, 190 * s, 1.6 * s, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}
