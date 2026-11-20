import { useEffect, useRef } from 'react'
import { clamp01, easeInOut, easeOut, REDUCED_MOTION } from './netCanvas'
import { boardSettled, drawBoardTexture, FINISH_TEXT, flipStatus, flipVersion, makeBoard, setClock, setTicker, startBoard, STOPS, stepBoard, TEX_H, TEX_W } from './departure/board'
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
/**
 * The train starts deep in the tunnel (nobody sees it appear), drives at about 43 km/h towards the mouth while the light grows,
 * and brakes to a stop at the platform (30 m in 5 s, the brake eases off towards the end). Then the screen goes dark.
 */
const V0 = 12
const START_Z = TUNNEL_Z + 44
const STOP_Z = 7
const BRAKE_D = 30
const BRAKE_T = (2 * BRAKE_D) / V0
const BRAKE_Z = STOP_Z + BRAKE_D
const CRUISE_T = (START_Z - BRAKE_Z) / V0
const TOTAL_T = CRUISE_T + BRAKE_T

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
    // the picture of the display is drawn on a texture that the station hangs up
    const tex = document.createElement('canvas')
    const texCtx = tex.getContext('2d')
    if (!texCtx) return
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
    setTicker(board, tickerText, reduced, 1.1)
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
        setTicker(board, wantText, reduced)
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
      let trainZ: number | null = null
      let speed = 0
      if (!reduced && tau >= 0) {
        if (tau < CRUISE_T) {
          trainZ = START_Z - V0 * tau
          speed = V0
        } else {
          const u = clamp01((tau - CRUISE_T) / BRAKE_T)
          trainZ = STOP_Z + BRAKE_D * (1 - u) * (1 - u)
          speed = V0 * (1 - u)
        }
      }
      // the light in the tunnel mouth grows slowly as the train comes closer, and calms down when it has come out
      const portalGlow =
        f < 0 || glowIn === 0 && tau < 0
          ? 0.04 + 0.03 * Math.sin(el * 3)
          : trainZ === null
            ? 0.04
            : Math.max(0.04, easeOut(clamp01(tau / 3)) * (1 - 0.7 * clamp01((TUNNEL_Z - trainZ) / 12)))
      const shake = trainZ === null ? 0.12 * glowIn : 0.03 + 0.4 * clamp01(speed / 12)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // the picture of the display, as sharp as the screen needs it
      const tw = Math.round(Math.min(1280, Math.max(640, W * dpr * 0.85)))
      if (tw !== tex.width) {
        tex.width = tw
        tex.height = Math.round((tw * TEX_H) / TEX_W)
      }
      drawBoardTexture(texCtx, tex.width, tex.height, board, { go, t: el })

      // the doors of the train open when it stands
      const doors = reduced || tau < TOTAL_T + 0.15 ? 0 : easeInOut(clamp01((tau - TOTAL_T - 0.15) / 0.6))

      // the station, with the display hanging in it
      drawStation(ctx, 0, 0, W, H, { t: el, trainZ, trainFade: clamp01(tau / 1), board: tex, doors, speed, portalGlow, go, accent, shake, family })

      // mark and name
      const ls = Math.max(0.9, Math.min(1.3, W / 380))
      const logoSize = 26 * ls
      const logoX = W / 2 - 52 * ls
      const logoY = safeTop + 18 * ls
      logo(logoX, logoY, logoSize, el)
      ctx.font = `700 ${12 * ls}px ${family}`
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${3.4 * ls}px`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      ctx.fillText('LINEFORGE', logoX + logoSize * 0.7, logoY + logoSize / 2 + 1)
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

      // The screen fades in at the start. When the train has passed it goes dark (not see-through: the home screen
      // underneath must not show) and the app reloads right then.
      const out = trainZ === null || reduced ? 1 : 1 - clamp01((tau - TOTAL_T - 0.9) / 0.6)
      if (out < 1) {
        ctx.fillStyle = `rgba(6,8,12,${1 - out})`
        ctx.fillRect(0, 0, W, H)
      }
      root.style.opacity = String(clamp01(el / 0.35))

      const gone = reduced ? f >= 1.4 : trainZ !== null && tau >= TOTAL_T + 1.55
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
