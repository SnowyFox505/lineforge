import { useEffect, useRef } from 'react'
import { clamp01, easeInOut, easeOut, REDUCED_MOTION } from './netCanvas'
import { BOARD_H, BOARD_W, boardSettled, drawBoard, FINISH_TEXT, flipStatus, flipVersion, makeBoard, setClock, startBoard, STOPS, stepBoard } from './departure/board'
import { drawStation, TUNNEL_Z } from './departure/scene3d'
import { hexRgb } from './splashScene'

export interface DepartureProps {
  oldVersion: string
  newVersion: string
  /** what the update is doing now: 0 looking, 1 clearing the offline copy, 2 sending cities to the cloud, 3 done */
  stage: number
  onDone: () => void
}

/** the LED line, one text per stage (a stage is shown for at least a moment, however fast the work is) */
const TICKER = STOPS
const STAGE_MS = 0.7
/** timeline after the work is done, in seconds: the status flips, and only when every tile and the LED line have settled the train gets its turn */
const T_STATUS = 0.55
/** the pause between the last tile turning and the first light from the tunnel, so the text can be read */
const READ_TIME = 2
/** the train brakes from about 45 km/h to a stop in 8 s over 45 m (a normal service braking of the underground), then the screen goes dark */
const BRAKE_T = 8
const STOP_Z = 7
const BRAKE_D = TUNNEL_Z + 18 - STOP_Z
const BRAKE_P = 2.2

const clockText = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * The update screen: a departure board in a station hall. The version turns from the old to the new one, the status says
 * "punctual", and a train comes out of the tunnel and rushes by. Then the app starts again.
 */
export default function DepartureScreen({ oldVersion, newVersion, stage, onDone }: DepartureProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef(stage)
  const doneRef = useRef(onDone)

  useEffect(() => {
    stageRef.current = stage
    doneRef.current = onDone
  }, [stage, onDone])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = REDUCED_MOTION()
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif'
    const accent = hexRgb(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
    const board = makeBoard(oldVersion, newVersion)
    startBoard(board, oldVersion, clockText(), reduced)
    const safeTop = parseFloat(getComputedStyle(root).paddingTop) || 0

    let W = 0
    let H = 0
    let dpr = 1
    let raf = 0
    let last = performance.now()
    const start = last
    let shown = 0
    let shownAt = 0
    let finishAt = -1
    let flipped = false
    let statusFlipped = false
    // when the board stood still after the finish began (null while something still turns)
    let settledAt: number | null = null
    let tickerAt = 0
    let tickerText = TICKER[0]
    board.ticker = tickerText
    let lastClock = clockText()
    let finished = false

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = r.width
      H = r.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }

    const logo = (x: number, y: number, size: number, t: number) => {
      // the two lines and two stations of the app icon, drawn in
      const k = size / 330
      ctx.save()
      ctx.translate(x - size / 2, y)
      ctx.scale(k, k)
      ctx.translate(-92, -150)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = `rgb(${accent.join(',')})`
      ctx.lineWidth = 34
      const grow = reduced ? 1 : easeOut(clamp01(t / 1.0))
      ctx.globalAlpha = 0.95
      ctx.setLineDash([700 * grow, 1000])
      ctx.stroke(new Path2D('M112 340h112l80-100h96'))
      ctx.stroke(new Path2D('M112 172h96l56 56'))
      ctx.setLineDash([])
      ctx.fillStyle = `rgb(${accent.join(',')})`
      ctx.beginPath()
      ctx.arc(400, 240, 30 * grow, 0, Math.PI * 2)
      ctx.arc(112, 172, 30 * grow, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const el = (now - start) / 1000

      // the stage that is shown: never faster than one every STAGE_MS
      if (shown < stageRef.current && el - shownAt >= STAGE_MS) {
        shown++
        shownAt = el
      }
      const text = TICKER[Math.min(shown, TICKER.length - 1)]
      const wantText = finishAt >= 0 ? FINISH_TEXT : text
      if (wantText !== tickerText) {
        tickerText = wantText
        board.ticker = wantText
        tickerAt = el
      }

      // the clock follows the real time
      const c = clockText()
      if (c !== lastClock) {
        lastClock = c
        setClock(board, c)
      }

      // everything is done: the finish begins
      if (finishAt < 0 && shown >= 3 && el >= 2) finishAt = el
      const f = finishAt < 0 ? -1 : el - finishAt
      if (f >= 0 && !flipped) {
        flipped = true
        flipVersion(board, newVersion, reduced)
      }
      if (f >= T_STATUS && !statusFlipped) {
        statusFlipped = true
        flipStatus(board, reduced)
      }
      stepBoard(board, dt)
      if (f >= 0 && settledAt === null && flipped && statusFlipped && boardSettled(board) && el - tickerAt > 0.6) settledAt = f

      // numbers for the picture
      const go = f < 0 ? 0 : easeInOut(clamp01((f - T_STATUS) / 0.6))
      const tau = settledAt === null ? -1 : f - settledAt - READ_TIME
      const glowIn = settledAt === null ? 0 : easeOut(clamp01((f - settledAt - READ_TIME) / 0.9))
      const portalGlow = f < 0 ? 0.04 + 0.03 * Math.sin(el * 3) : Math.max(0.04, glowIn * (1 - 0.7 * clamp01(tau / 0.7)))
      let trainZ: number | null = null
      let speed = 0
      if (!reduced && tau >= 0) {
        // the train comes out of the tunnel and brakes to a stop at the platform, slowly letting go of the brake at the end
        const u = clamp01(tau / BRAKE_T)
        trainZ = STOP_Z + BRAKE_D * Math.pow(1 - u, BRAKE_P)
        speed = ((BRAKE_P * BRAKE_D) / BRAKE_T) * Math.pow(1 - u, BRAKE_P - 1)
      }
      const shake = trainZ === null ? 0.12 * glowIn : 0.03 + 0.4 * clamp01(speed / 12)

      // layout: on a phone the board is on top and the station below it, on a wide screen they stand side by side
      const wide = W >= H * 1.25
      let s: number
      let by: number
      let bx: number
      let scene: [number, number, number, number]
      let logoX: number
      if (wide) {
        s = Math.max(0.5, Math.min((H - 100 - safeTop) / (BOARD_H + 48), (W * 0.42) / BOARD_W, 2.4))
        bx = Math.max(W * 0.05, 24)
        by = (H - BOARD_H * s) / 2 + 24 * s
        scene = [bx + BOARD_W * s + 16 * s, 0, W - (bx + BOARD_W * s + 16 * s), H]
        logoX = bx + 65 * s
      } else {
        s = Math.max(0.5, Math.min((W * 0.93) / BOARD_W, (H - 210 - safeTop) / (BOARD_H + 74), 2.6))
        by = safeTop + 24 * s + 26 * s + 18 * s
        bx = (W - BOARD_W * s) / 2
        const top = by + BOARD_H * s + 4 * s
        scene = [0, top, W, H - top]
        logoX = W / 2 - 52 * s + 52 * s
      }
      const logoSize = 26 * s
      const logoY = by - 18 * s - logoSize

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // soft light behind the board
      const bg = ctx.createRadialGradient(bx + (BOARD_W * s) / 2, by + BOARD_H * s * 0.4, 0, bx + (BOARD_W * s) / 2, by + BOARD_H * s * 0.4, Math.max(W, H) * 0.7)
      bg.addColorStop(0, 'rgba(255,176,46,0.06)')
      bg.addColorStop(1, 'rgba(255,176,46,0)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // the station
      const [sx, sy, sw, sh] = scene
      drawStation(ctx, sx, sy, sw, sh, { t: el, trainZ, speed, portalGlow, go, accent, shake, family })
      // fade the edge of the picture next to the board into the background
      if (wide) {
        const fade = ctx.createLinearGradient(sx, 0, sx + sw * 0.22, 0)
        fade.addColorStop(0, '#06080c')
        fade.addColorStop(1, 'rgba(6,8,12,0)')
        ctx.fillStyle = fade
        ctx.fillRect(sx - 1, 0, sw * 0.22 + 1, H)
      } else {
        const fade = ctx.createLinearGradient(0, sy, 0, sy + sh * 0.3)
        fade.addColorStop(0, '#06080c')
        fade.addColorStop(1, 'rgba(6,8,12,0)')
        ctx.fillStyle = fade
        ctx.fillRect(0, sy - 1, W, sh * 0.3 + 1)
      }

      // mark and name
      logo(logoX - 52 * s, logoY, logoSize, el)
      ctx.font = `700 ${12 * s}px ${family}`
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${3.4 * s}px`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      ctx.fillText('LINEFORGE', logoX - 52 * s + logoSize * 0.7, logoY + logoSize / 2 + 1)
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

      drawBoard(ctx, board, bx, by, s, { go, tickerAge: el - tickerAt })

      // The screen fades in at the start. When the train has passed it goes dark (not see-through: the home screen
      // underneath must not show) and the app reloads right then.
      const out = trainZ === null || reduced ? 1 : 1 - clamp01((tau - BRAKE_T - 0.25) / 0.7)
      if (out < 1) {
        ctx.fillStyle = `rgba(6,8,12,${1 - out})`
        ctx.fillRect(0, 0, W, H)
      }
      root.style.opacity = String(clamp01(el / 0.35))

      const gone = reduced ? f >= 1.4 : trainZ !== null && tau >= BRAKE_T + 1
      if (gone && !finished) {
        finished = true
        cancelAnimationFrame(raf)
        doneRef.current()
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden" style={{ zIndex: 60, opacity: 0, background: 'radial-gradient(ellipse at 50% 30%, #101722 0%, #06080c 70%)', paddingTop: 'var(--safe-top)' }} role="status" aria-live="polite">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <span className="sr-only">{`Aktualisiere LineForge von Version ${oldVersion} auf ${newVersion}`}</span>
    </div>
  )
}
