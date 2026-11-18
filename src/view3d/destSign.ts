import * as THREE from 'three'

/**
 * The destination display on the front of a train: the line on the left (in its colour), where the train is going to on
 * the right, in amber LED dots. The textures are made on demand (a canvas each, shared by every train showing the same text)
 * and swapped on the sign's material when the train changes ends at a terminal.
 */

const W = 352
const H = 64
const cache = new Map<string, THREE.CanvasTexture>()
const MAX_CACHED = 160

/** Black or white, whichever reads better on a colour. */
function inkOn(hex: string): string {
  const c = new THREE.Color(hex)
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.55 ? '#14161a' : '#ffffff'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function draw(line: string, color: string, dest: string): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#0a0806'
  ctx.fillRect(0, 0, W, H)

  // the line: a badge in the line's colour
  ctx.font = '700 40px "Arial Narrow", Arial, Helvetica, sans-serif'
  ctx.textBaseline = 'middle'
  const lw = Math.max(70, ctx.measureText(line).width + 26)
  ctx.fillStyle = color
  roundRect(ctx, 8, 8, lw, H - 16, 9)
  ctx.fill()
  ctx.fillStyle = inkOn(color)
  ctx.textAlign = 'center'
  ctx.fillText(line, 8 + lw / 2, H / 2 + 2)

  // where the train goes: amber, squeezed to fit
  const x0 = 8 + lw + 20
  ctx.textAlign = 'left'
  ctx.font = '700 38px "Arial Narrow", Arial, Helvetica, sans-serif'
  ctx.shadowColor = '#ff9a1a'
  ctx.shadowBlur = 7
  ctx.fillStyle = '#ffb53d'
  ctx.fillText(dest, x0, H / 2 + 2, W - x0 - 12)
  ctx.shadowBlur = 0

  // LED matrix: a fine dark grid over everything
  ctx.fillStyle = 'rgba(0,0,0,0.38)'
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H)
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1)
  return cv
}

/** The texture for a sign showing `line` (in `color`) and `dest`. */
export function signTexture(line: string, color: string, dest: string): THREE.CanvasTexture {
  const key = `${line}|${color}|${dest}`
  const hit = cache.get(key)
  if (hit) return hit
  const t = new THREE.CanvasTexture(draw(line, color, dest))
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (cache.size >= MAX_CACHED) {
    const first = cache.keys().next().value
    if (first !== undefined) {
      cache.get(first)?.dispose()
      cache.delete(first)
    }
  }
  cache.set(key, t)
  return t
}

/** A sign material to put on a train's display mesh; give it its text with `setSign`. */
export function makeSignMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: signTexture('', '#444', ''), toneMapped: false })
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  return m
}

/** Show this text on the sign; does nothing when it already shows it. */
export function setSign(mat: THREE.MeshBasicMaterial, line: string, color: string, dest: string) {
  const t = signTexture(line, color, dest)
  if (mat.map !== t) mat.map = t
}

let logo: THREE.CanvasTexture | null = null
/** The railway company logo for the front of a train: white letters on a red plate. */
export function logoTexture(): THREE.CanvasTexture {
  if (logo) return logo
  const cv = document.createElement('canvas')
  cv.width = 128
  cv.height = 72
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#ec0016'
  roundRect(ctx, 2, 2, 124, 68, 7)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 52px Arial, Helvetica, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('DB', 64, 38)
  logo = new THREE.CanvasTexture(cv)
  logo.colorSpace = THREE.SRGBColorSpace
  logo.anisotropy = 4
  return logo
}
