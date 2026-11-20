import { clamp01 } from '../netCanvas'
import { padTo, Roll } from './roll'

/**
 * The picture on the passenger information display of the update screen. It is modelled on the displays of the Hamburg
 * S-Bahn and underground (blue screen, a narrow column "Es folgen / followed by" on the left, the big "Nächster Zug / next
 * train" on the right, a light information strip at the bottom, "Gleis" on the black frame). Here the "trains" are the steps
 * of the update, the destination is the new version and the information strip tells what happens right now.
 * This file only draws the front of the display onto a texture canvas (in design units of 1024 x 430); `scene3d.ts` hangs it in
 * the station. Texts change by rolling (see `Roll`).
 */
export const TEX_W = 1024
export const TEX_H = 430

/** the steps of the update, shown as the stops of the journey; the update screen sets the ticker to one of them */
export const STOPS = ['Suche nach Updates', 'Speicher leeren', 'Städte sichern', 'Neustart']
/** the same steps, short enough for the narrow column */
const ROW_NAMES = ['Updates suchen', 'Speicher leeren', 'Städte sichern', 'Neustart']
export const FINISH_TEXT = 'Bitte zurücktreten'

type RGB = [number, number, number]
const WHITE: RGB = [255, 255, 255]
const MINT: RGB = [150, 244, 178]
const YELLOW: RGB = [252, 205, 22]
const INFO_BG: RGB = [234, 242, 255]
const INFO_INK: RGB = [20, 38, 152]
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
  row1: Roll
  row1s: Roll
  row2: Roll
  row2s: Roll
  info1: Roll
  info2: Roll
  ticker: string
}

export function makeBoard(oldVersion: string, newVersion: string): Board {
  const n = Math.max(oldVersion.length, newVersion.length)
  return {
    clock: new Roll(),
    version: Array.from({ length: n }, () => new Roll()),
    ziel: new Roll(),
    status: new Roll(),
    row1: new Roll(),
    row1s: new Roll(),
    row2: new Roll(),
    row2s: new Roll(),
    info1: new Roll(),
    info2: new Roll(),
    ticker: '',
  }
}

const allRolls = (b: Board): Roll[] => [b.clock, ...b.version, b.ziel, b.status, b.row1, b.row1s, b.row2, b.row2s, b.info1, b.info2]

/** What the display says about the step that is shown now: the two rows of the left column and the information strip. */
export function setTicker(b: Board, text: string, instant: boolean, delay = 0) {
  b.ticker = text
  const idx = STOPS.indexOf(text)
  const fin = text !== '' && idx < 0
  const put = (r: Roll, t: string, d: number) => (instant ? r.jump(t) : r.set(t, delay + d))
  const cur = fin ? 3 : Math.max(0, idx)
  put(b.row1, ROW_NAMES[cur], 0)
  put(b.row1s, fin ? 'jetzt' : 'läuft', 0.06)
  put(b.row2, ROW_NAMES[cur + 1] ?? '', 0.12)
  put(b.row2s, cur + 1 < ROW_NAMES.length ? 'danach' : '', 0.18)
  put(b.info1, fin ? 'Bitte zurücktreten.' : 'LineForge wird aktualisiert.', 0.1)
  put(b.info2, fin ? 'Der Zug fährt gleich ein.' : `${STOPS[cur]} …`, 0.2)
}

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
  if (e > 0.01 && r.next) {
    ctx.fillStyle = css(t.color, e)
    ctx.fillText(r.next, x, y + (1 - e) * t.rise)
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, color: RGB, align: CanvasTextAlign = 'left') {
  ctx.font = `${weight} ${size}px ${SIGN}`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = css(color)
  ctx.fillText(s, x, y)
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: RGB, ink: RGB, label: string, size: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fillStyle = css(fill)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.font = `700 ${size}px ${SIGN}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = css(ink)
  ctx.fillText(label, x + w / 2, y + h / 2 + size * 0.04)
}

export interface BoardLook {
  /** 0 = waiting, 1 = on time (the status turns mint) */
  go: number
  /** seconds, for the slow breathing of the backlight */
  t: number
}

/** Draws the front of the display (frame and screen) into a canvas of any size, scaled from the design units TEX_W x TEX_H. */
export function drawBoardTexture(ctx: CanvasRenderingContext2D, w: number, h: number, b: Board, look: BoardLook) {
  ctx.save()
  ctx.scale(w / TEX_W, h / TEX_H)
  ctx.clearRect(0, 0, TEX_W, TEX_H)
  const clipRect = (x: number, y: number, cw: number, ch: number) => {
    ctx.beginPath()
    ctx.rect(x, y, cw, ch)
    ctx.clip()
  }

  // the black frame, thicker at the bottom where "Gleis" stands
  ctx.beginPath()
  ctx.roundRect(0, 0, TEX_W, TEX_H, 20)
  ctx.fillStyle = '#07090d'
  ctx.fill()
  text(ctx, 'Gleis 1', 38, 411, 31, 400, [196, 202, 212])

  // the screen
  const X0 = 24
  const Y0 = 22
  const X1 = TEX_W - 24
  const Y1 = 376
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(X0, Y0, X1 - X0, Y1 - Y0, 4)
  ctx.clip()
  const bg = ctx.createLinearGradient(0, Y0, 0, Y1)
  bg.addColorStop(0, '#2036cc')
  bg.addColorStop(1, '#1427ab')
  ctx.fillStyle = bg
  ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0)
  const breath = 0.13 + 0.015 * Math.sin(look.t * 1.3)
  const vg = ctx.createRadialGradient(TEX_W * 0.5, 190, 0, TEX_W * 0.5, 190, 620)
  vg.addColorStop(0, `rgba(90,120,255,${breath})`)
  vg.addColorStop(1, 'rgba(90,120,255,0)')
  ctx.fillStyle = vg
  ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0)

  const LEFT = 494
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  const hline = (y: number, x0: number, x1: number) => ctx.fillRect(x0, y - 1, x1 - x0, 2)
  hline(76, X0, LEFT)
  hline(226, X0, LEFT)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(LEFT - 1, Y0, 2, Y1 - Y0)

  // left column: "Es folgen / followed by", the clock and two rows
  text(ctx, 'Es folgen / followed by:', 44, 58, 22, 400, WHITE)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 2
  ctx.strokeRect(352, 31, 130, 40)
  ctx.save()
  clipRect(354, 33, 76, 36)
  drawRoll(ctx, b.clock, 424, 61, { size: 25, weight: 500, color: WHITE, align: 'right', rise: 22 })
  ctx.restore()
  text(ctx, 'Uhr', 434, 61, 18, 400, WHITE)
  const rows: [Roll, Roll, number][] = [
    [b.row1, b.row1s, 76],
    [b.row2, b.row2s, 226],
  ]
  for (const [name, state, top] of rows) {
    if (name.cur || name.next) pill(ctx, 44, top + 53, 84, 44, YELLOW, [22, 20, 8], 'U1', 26)
    ctx.save()
    clipRect(138, top + 40, 232, 70)
    drawRoll(ctx, name, 144, top + 86, { size: 31, weight: 500, color: WHITE, align: 'left', rise: 30 })
    ctx.restore()
    ctx.save()
    clipRect(372, top + 40, 112, 70)
    drawRoll(ctx, state, 478, top + 86, { size: 29, weight: 500, color: WHITE, align: 'right', rise: 30 })
    ctx.restore()
  }

  // right: the next train
  text(ctx, 'Nächster Zug / next train:', 516, 58, 22, 400, WHITE)
  pill(ctx, 516, 92, 118, 62, YELLOW, [22, 20, 8], 'U1', 38)
  ctx.save()
  clipRect(650, 84, 350, 84)
  drawRoll(ctx, b.ziel, 656, 146, { size: 52, weight: 500, color: WHITE, align: 'left', rise: 44 })
  ctx.restore()
  text(ctx, 'Version', 656, 226, 28, 400, WHITE)
  ctx.font = `600 58px ${SIGN}`
  const vx0 = 764
  const widths = b.version.map((r) => {
    const ch = r.target === ' ' ? (r.next !== null ? r.cur : '') : r.target
    return ch ? ctx.measureText(ch).width : 0
  })
  let vx = vx0
  b.version.forEach((r, i) => {
    ctx.save()
    clipRect(vx - 2, 172, widths[i] + 4, 70)
    drawRoll(ctx, r, vx + widths[i] / 2, 226, { size: 58, weight: 600, color: WHITE, align: 'center', rise: 50 })
    ctx.restore()
    vx += widths[i]
  })
  ctx.save()
  clipRect(650, 246, 350, 50)
  drawRoll(ctx, b.status, 656, 286, { size: 38, weight: 500, color: mixC(WHITE, MINT, look.go), align: 'left', rise: 34 })
  ctx.restore()

  // the light information strip
  ctx.fillStyle = css(INFO_BG)
  ctx.fillRect(LEFT, 308, X1 - LEFT, Y1 - 308)
  ctx.beginPath()
  ctx.roundRect(510, 320, 44, 44, 7)
  ctx.fillStyle = '#16279e'
  ctx.fill()
  text(ctx, 'i', 532, 354, 36, 700, WHITE, 'center')
  ctx.save()
  clipRect(570, 312, X1 - 570, 62)
  drawRoll(ctx, b.info1, 572, 338, { size: 22, weight: 500, color: INFO_INK, align: 'left', rise: 22 })
  drawRoll(ctx, b.info2, 572, 364, { size: 22, weight: 400, color: INFO_INK, align: 'left', rise: 22 })
  ctx.restore()

  ctx.restore()
  ctx.restore()
}
