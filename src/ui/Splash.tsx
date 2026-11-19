import { useEffect, useRef, useState } from 'react'
import { clamp01, drawLight, easeInOut, easeOut, easeOutBack, prepareNet, REDUCED_MOTION, strokeGlowing } from './netCanvas'
import type { P } from './netCanvas'
import { ACCENT_LINE, closingProgress, DIAL_R, EMBLEM, emblemBox, FINISH_CITY, FINISH_UPDATE, hexRgb, HUB, IRIS_FEATHER, irisRadius, loadProgress } from './splashScene'

export interface SplashProps {
  /** `city` opens onto the game through a round hole, `update` ends in a check mark */
  variant: 'city' | 'update'
  eyebrow: string
  title: string
  /** what is going on, one line at a time */
  messages: string[]
  /** go round the messages again and again (otherwise the last one stays) */
  loop?: boolean
  hint?: string
  /**
   * Real progress (0..1) reported by the work behind the screen. The ring follows it but never runs ahead of the pace of the animation,
   * so a fast device still shows the screen for `minMs`. Without it the ring creeps along a made-up curve.
   */
  progress?: number
  /** the step that is going on now (replaces the cycling messages when `progress` is given) */
  liveMessage?: string
  doneTitle?: string
  doneMessage?: string
  /** the thing that was waited for is there */
  ready: boolean
  /** show at least this long (milliseconds) */
  minMs: number
  onDone: () => void
  z?: number
}

const TAIL = 110 // length of the light that runs along a line (design units)
const PULSE_STEPS = 12

/** A blurry coloured blob, drawn big and soft behind everything. */
function blobSprite(rgb: [number, number, number]): HTMLCanvasElement {
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

/**
 * Full-screen splash: a transit hub that draws itself line by line while soft colours drift behind it,
 * lights run along the lines and a progress ring around the hub fills up. When the work is done a ring bursts out of the hub
 * and the screen opens like an iris (city) or the hub turns into a check mark (update).
 */
export default function Splash({ variant, eyebrow, title, messages, loop = true, hint, progress, liveMessage, doneTitle, doneMessage, ready, minMs, onDone, z = 70 }: SplashProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(ready)
  const doneRef = useRef(onDone)
  const progressRef = useRef(progress)
  const [finishing, setFinishing] = useState(false)
  const [msg, setMsg] = useState(0)

  useEffect(() => {
    readyRef.current = ready
    doneRef.current = onDone
    progressRef.current = progress
  }, [ready, onDone, progress])

  useEffect(() => {
    if (finishing || progress !== undefined || messages.length < 2 || REDUCED_MOTION()) return
    const id = window.setInterval(() => setMsg((m) => (loop ? (m + 1) % messages.length : Math.min(m + 1, messages.length - 1))), 1250)
    return () => window.clearInterval(id)
  }, [finishing, loop, messages.length, progress])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const text = textRef.current
    if (!root || !canvas || !text) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const css = getComputedStyle(document.documentElement)
    const accentHex = css.getPropertyValue('--accent').trim() || '#c4f03a'
    const accent = hexRgb(accentHex)
    const ink = getComputedStyle(root).getPropertyValue('--splash-ink').trim().toLowerCase()
    const dark = ink === '#fff' || ink === '#ffffff' || ink === ''
    const inkRgb = dark ? '255,255,255' : '15,24,35'
    const stationStroke = dark ? '#0a0e14' : '#0f1823'
    const discFill = dark ? 'rgba(9,13,19,0.94)' : 'rgba(255,255,255,0.95)'
    const accentCss = `rgb(${accent.join(',')})`

    const net = prepareNet(EMBLEM.map((l, i) => ({ color: i === ACCENT_LINE ? accentHex : l.color, pts: l.pts, stations: l.pts.filter((p) => !(p[0] === HUB[0] && p[1] === HUB[1])) })))
    const blobs = [
      blobSprite(hexRgb('#ff5470')),
      blobSprite(hexRgb('#3db8ff')),
      blobSprite(accent),
      blobSprite(hexRgb('#ffc233')),
      blobSprite(hexRgb('#9a6bff')),
    ]
    const reduced = REDUCED_MOTION()
    const finishLen = variant === 'update' ? FINISH_UPDATE : FINISH_CITY

    let w = 0
    let h = 0
    let dpr = 1
    let size = 400
    let cx = 0
    let cy = 0
    let raf = 0
    const start = performance.now()
    let finishAt = -1
    let from = 0
    let finished = false
    let disp = 0
    let lastNow = start

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const box = emblemBox(w, h)
      size = box.size
      cx = box.cx
      cy = box.cy
      text.style.top = `${cy + size / 2 + 20}px`
    }

    /** soft drifting colours + a field of dots that lights up where a ripple passes */
    const drawBackground = (t: number, rippleR: number[], alpha: number) => {
      ctx.save()
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      const big = Math.max(w, h) * 0.62
      blobs.forEach((b, i) => {
        const x = w / 2 + Math.sin(t * 0.13 * (1 + i * 0.27) + i * 1.9) * w * 0.38
        const y = h * 0.42 + Math.cos(t * 0.1 * (1 + i * 0.22) + i * 2.4) * h * 0.26
        const born = clamp01((t - 0.1 - i * 0.12) / 1.2)
        ctx.globalAlpha = (dark ? 0.2 : 0.16) * born * alpha
        ctx.drawImage(b, x - big / 2, y - big / 2, big, big)
      })
      ctx.restore()
      // dots
      const gap = 30
      const colsOff = (w % gap) / 2
      const rowsOff = (h % gap) / 2
      ctx.fillStyle = `rgb(${inkRgb})`
      for (let gx = colsOff; gx < w; gx += gap) {
        for (let gy = rowsOff; gy < h; gy += gap) {
          const d = Math.hypot(gx - cx, gy - cy)
          let a = 0.1
          for (const R of rippleR) {
            const e = (d - R) / (gap * 1.5)
            a += 0.5 * Math.exp(-e * e) * Math.max(0, 1 - R / (Math.max(w, h) * 0.75))
          }
          // the grid is only there around the middle, it fades towards the corners
          a *= 1 - clamp01((d / Math.hypot(w, h) - 0.3) / 0.35)
          if (a < 0.02) continue
          ctx.globalAlpha = Math.min(0.75, a) * alpha
          ctx.fillRect(gx - 1, gy - 1, 2, 2)
        }
      }
      ctx.globalAlpha = 1
    }

    const stationDot = (p: P, s: number, color: string, a: number) => {
      if (s <= 0.01) return
      ctx.globalAlpha = a
      // coloured halo, white body, dark rim
      ctx.beginPath()
      ctx.arc(p[0], p[1], 14 * s, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.35 * a
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.arc(p[0], p[1], 8 * s, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 3.6 * s
      ctx.strokeStyle = stationStroke
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    /** a light with a tapering tail that runs along a track */
    const pulse = (i: number, head: number, a: number) => {
      const tr = net[i].track
      const color = net[i].color
      ctx.save()
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      ctx.lineCap = 'round'
      ctx.strokeStyle = color
      for (let k = 0; k < PULSE_STEPS; k++) {
        const f = k / PULSE_STEPS
        const d1 = head - TAIL * f
        const d0 = head - TAIL * (f + 1 / PULSE_STEPS) - 0.5
        if (d1 <= 0 || d0 >= tr.total) continue
        const strength = (1 - f) ** 1.7
        ctx.globalAlpha = strength * 0.95 * a
        ctx.lineWidth = 3 + 7 * (1 - f)
        ctx.beginPath()
        tr.trace(ctx, Math.max(0, d0), Math.min(tr.total, d1))
        ctx.stroke()
      }
      ctx.restore()
      if (head > 0 && head < tr.total) drawLight(ctx, tr.at(head), 34, a)
    }

    const draw = (t: number, u: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      const closing = u >= 0
      const shown = closing ? closingProgress(from, u) : disp

      // ripples that leave the hub every two seconds
      const ripples: number[] = []
      if (!reduced) {
        for (let j = 0; j < 3; j++) {
          const ph = (((t - 1.3) / 2.2 + j / 3) % 1 + 1) % 1
          if (t > 1.3 + j * 0.7) ripples.push((DIAL_R + ph * 190) * (size / 400))
        }
      }
      if (closing && u > 0.25) ripples.push((DIAL_R + easeOut((u - 0.25) / 0.45) * 520) * (size / 400))
      drawBackground(t, ripples, 1)

      // everything of the emblem lives in the 400 x 400 design space around the hub
      const zoom = closing ? 1 + 0.14 * easeInOut(clamp01((u - 0.25) / 0.6)) : 1
      const k = (size / 400) * zoom
      const alpha = variant === 'city' && closing ? 1 - clamp01((u - 0.5) / 0.3) : 1
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cx - HUB[0] * k), dpr * (cy - HUB[1] * k))

      net.forEach((l, i) => {
        const t0 = 0.2 + i * 0.22
        const dur = 1.3
        const prog = easeOut(clamp01((t - t0) / dur))
        const L = l.track.total
        const head = prog * L
        strokeGlowing(ctx, l.track, 0, head, l.color, alpha)
        for (const s of l.stationAt) {
          if (s.p[0] === HUB[0] && s.p[1] === HUB[1]) continue
          stationDot(s.p, easeOutBack(clamp01((head - s.d) / 30)), l.color, alpha)
        }
        if (prog > 0 && prog < 1) drawLight(ctx, l.track.at(head), 34, alpha)
        if (!reduced && t > t0 + dur + 0.2) {
          const period = 2.5 + i * 0.4
          const phase = (((t - t0 - dur - 0.2) / period) % 1 + 1) % 1
          pulse(i, phase * (L + TAIL), alpha)
        }
      })

      // ripples
      for (const R of ripples) {
        const r = R / k
        const q = clamp01((r - DIAL_R) / 200)
        ctx.globalAlpha = (1 - q) ** 2 * 0.4 * alpha
        ctx.lineWidth = 1 + 3 * (1 - q)
        ctx.strokeStyle = accentCss
        ctx.beginPath()
        ctx.arc(HUB[0], HUB[1], r, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // the dial: a dark disc that the lines run under, with the progress ring and the hub station in it
      const dialIn = easeOutBack(clamp01((t - 0.85) / 0.6))
      if (dialIn > 0.01) {
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(HUB[0], HUB[1])
        ctx.scale(dialIn, dialIn)
        // warm glow behind
        ctx.globalAlpha = (0.55 + 0.15 * Math.sin(t * 2.4)) * alpha
        ctx.drawImage(blobs[2], -80, -80, 160, 160)
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(0, 0, DIAL_R, 0, Math.PI * 2)
        ctx.fillStyle = discFill
        ctx.fill()
        ctx.lineWidth = 3.5
        ctx.strokeStyle = `rgba(${inkRgb},0.14)`
        ctx.stroke()
        // a ring of dots that slowly turns around the dial
        if (!reduced) {
          ctx.save()
          ctx.setLineDash([1.5, 9])
          ctx.lineCap = 'round'
          ctx.lineDashOffset = -t * 14
          ctx.lineWidth = 3
          ctx.globalAlpha = 0.45 * alpha
          ctx.strokeStyle = `rgb(${inkRgb})`
          ctx.beginPath()
          ctx.arc(0, 0, DIAL_R + 16, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
        // progress
        const a0 = -Math.PI / 2
        const a1 = a0 + Math.PI * 2 * clamp01(shown)
        ctx.lineCap = 'round'
        for (const [lw, la] of [[10, 0.18], [3.8, 1]] as [number, number][]) {
          ctx.globalAlpha = la * alpha
          ctx.lineWidth = lw
          ctx.strokeStyle = accentCss
          ctx.beginPath()
          ctx.arc(0, 0, DIAL_R, a0, a1)
          ctx.stroke()
        }
        ctx.globalAlpha = alpha
        if (shown > 0.01 && shown < 0.999) drawLight(ctx, [Math.cos(a1) * DIAL_R, Math.sin(a1) * DIAL_R], 22, alpha)
        // the hub station (a check mark in the update variant once it is done)
        const checkIn = variant === 'update' && closing ? clamp01((u - 0.3) / 0.35) : 0
        if (checkIn > 0) {
          ctx.beginPath()
          ctx.arc(0, 0, 30 * easeOutBack(checkIn), 0, Math.PI * 2)
          ctx.fillStyle = accentCss
          ctx.fill()
          const q = clamp01((u - 0.45) / 0.3)
          const seg1 = 11.3
          const seg2 = 22.7
          const run = q * (seg1 + seg2)
          ctx.strokeStyle = '#0d1300'
          ctx.lineWidth = 6
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(-11, 1)
          if (run <= seg1) ctx.lineTo(-11 + (8 * run) / seg1, 1 + (8 * run) / seg1)
          else {
            ctx.lineTo(-3, 9)
            const f = (run - seg1) / seg2
            ctx.lineTo(-3 + 15 * f, 9 - 17 * f)
          }
          ctx.stroke()
        } else {
          const beat = 1 + 0.12 * Math.sin(t * 4)
          ctx.beginPath()
          ctx.arc(0, 0, 14, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.lineWidth = 5
          ctx.strokeStyle = stationStroke
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(0, 0, 5.5 * beat, 0, Math.PI * 2)
          ctx.fillStyle = accentCss
          ctx.fill()
        }
        ctx.restore()
      }

      // the burst when everything is there
      if (closing) {
        const q = clamp01((u - 0.25) / 0.4)
        if (q > 0 && q < 1) {
          ctx.globalAlpha = (1 - q) * 0.85
          ctx.lineWidth = 2 + 7 * (1 - q)
          ctx.strokeStyle = accentCss
          ctx.beginPath()
          ctx.arc(HUB[0], HUB[1], DIAL_R + easeOut(q) * 300, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
          drawLight(ctx, HUB, 120 + easeOut(q) * 520, (1 - q) * 0.9)
        }
      }
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const el = (now - start) / 1000
      const t = reduced ? el + 10 : el
      // the ring: real progress if there is some, held back to the pace of the animation, and smoothed
      const real = progressRef.current
      const aim = real === undefined ? loadProgress(el) : Math.min(real, 0.97 * easeOut(clamp01((el * 1000) / minMs)))
      disp += (aim - disp) * (1 - Math.exp(-((now - lastNow) / 1000) * 7))
      lastNow = now
      if (finishAt < 0 && el * 1000 >= minMs && readyRef.current) {
        finishAt = now
        from = disp
        setFinishing(true)
      }
      const u = finishAt < 0 ? -1 : clamp01((now - finishAt) / 1000 / finishLen)
      draw(t, u)
      // fade in at the start, close
      root.style.opacity = String(clamp01(el / 0.3))
      if (u >= 0 && variant === 'city') {
        text.style.opacity = String(1 - clamp01(u / 0.3))
        const r = irisRadius(u, w, h)
        const mask = r <= 0 ? 'none' : `radial-gradient(circle at ${cx}px ${cy}px, transparent ${Math.max(0, r - IRIS_FEATHER)}px, #000 ${r}px)`
        root.style.maskImage = mask
        root.style.setProperty('-webkit-mask-image', mask)
      }
      if (u >= 1 && !finished) {
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
  }, [minMs, variant])

  const shownTitle = finishing && doneTitle ? doneTitle : title
  const shownMsg = finishing && doneMessage ? doneMessage : progress !== undefined && liveMessage ? liveMessage : messages[Math.min(msg, messages.length - 1)]

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden" style={{ zIndex: z, opacity: 0, background: 'var(--splash-bg)', color: 'var(--splash-ink)' }} role="status" aria-live="polite">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div ref={textRef} className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6 text-center">
        <div className="splash-eyebrow">{eyebrow}</div>
        <h1 key={shownTitle} className="splash-title mt-2 max-w-full truncate pb-1 text-[2.1rem] font-extrabold leading-tight tracking-tight">
          {shownTitle}
        </h1>
        <div key={shownMsg} className="splash-msg mt-3 min-h-5 text-sm">
          {shownMsg}
          {finishing && doneMessage ? '' : ' …'}
        </div>
        {hint && <div className="splash-hint mt-5 text-xs">{hint}</div>}
      </div>
      {!hint && (
        <div className="splash-brand pointer-events-none absolute inset-x-0 bottom-[calc(26px+var(--safe-bottom))] text-center" aria-hidden>
          LINEFORGE
        </div>
      )}
    </div>
  )
}
