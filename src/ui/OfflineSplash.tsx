import { useEffect, useRef, useState } from 'react'
import { blobSprite, clamp01, drawLight, easeInOut, easeOut, easeOutBack, prepareNet, REDUCED_MOTION, strokeGlowing } from './netCanvas'
import type { P } from './netCanvas'
import {
  ACCENT_LINE,
  closingProgress,
  DIAL_R,
  EMBLEM,
  emblemBox,
  FINISH_CITY,
  hexRgb,
  HUB,
  IRIS_FEATHER,
  irisRadius,
  lerpRgb,
  litCells,
  MEMORY_CELLS,
  OFFLINE_AMBER,
  OFFLINE_FADE_IN,
  OFFLINE_MESSAGES,
  OFFLINE_RED,
  offlineMessage,
  offlinePace,
  offlineSymbols,
  RESTORE_AT,
  restoreFront,
} from './splashScene'

export interface OfflineSplashProps {
  title: string
  /** real progress of opening (0..1), the ring follows it but waits for the rebuild of the network */
  progress: number
  ready: boolean
  minMs: number
  onDone: () => void
  z?: number
}

/**
 * Opening a city without a connection. It fades in over the city splash that has just broken off and tells a little story:
 * the connection symbol in the dial flickers and is crossed out, the lines of the emblem fall back to dashed ghosts, then the dial
 * turns into the memory of the device and the network is rebuilt out of it, line by line, while a ring of memory cells lights up.
 * At the end the same burst and iris as in the city splash open onto the game.
 */
export default function OfflineSplash({ title, progress, ready, minMs, onDone, z = 72 }: OfflineSplashProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(ready)
  const doneRef = useRef(onDone)
  const progressRef = useRef(progress)
  const [msg, setMsg] = useState(0)

  useEffect(() => {
    readyRef.current = ready
    doneRef.current = onDone
    progressRef.current = progress
  }, [ready, onDone, progress])

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
    const amber = hexRgb(OFFLINE_AMBER)
    const red = hexRgb(OFFLINE_RED)
    const ink = getComputedStyle(root).getPropertyValue('--splash-ink').trim().toLowerCase()
    const dark = ink === '#fff' || ink === '#ffffff' || ink === ''
    const inkRgb = dark ? '255,255,255' : '15,24,35'
    const stationStroke = dark ? '#0a0e14' : '#0f1823'
    const discFill = dark ? 'rgba(9,13,19,0.94)' : 'rgba(255,255,255,0.95)'
    const discSolid = dark ? '#0b1017' : '#ffffff'
    const rgbCss = (c: number[]) => `rgb(${c.join(',')})`
    const accentCss = rgbCss(accent)
    const amberCss = rgbCss(amber)
    const redCss = rgbCss(red)

    const net = prepareNet(EMBLEM.map((l, i) => ({ color: i === ACCENT_LINE ? accentHex : l.color, pts: l.pts, stations: l.pts.filter((p) => !(p[0] === HUB[0] && p[1] === HUB[1])) })))
    /** where each line runs through the hub: the rebuild grows out of there in both directions */
    const hubAt = net.map((l) => l.track.project(HUB))
    const blobs = {
      red: blobSprite(red),
      amber: blobSprite(amber),
      orange: blobSprite(hexRgb('#ff8a3d')),
      accent: blobSprite(accent),
      blue: blobSprite(hexRgb('#3db8ff')),
    }
    const reduced = REDUCED_MOTION()

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
    let shownMsg = 0

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

    /** warm colours first (no signal), the cool ones come back with the rebuild; the dot field lights up where a ripple passes */
    const drawBackground = (t: number, rippleR: number[], rk: number) => {
      ctx.save()
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      const big = Math.max(w, h) * 0.62
      const parts: [HTMLCanvasElement, number][] = [
        [blobs.red, 1 - 0.75 * rk],
        [blobs.amber, 1 - 0.3 * rk],
        [blobs.orange, 0.8 * (1 - rk)],
        [blobs.accent, rk],
        [blobs.blue, 0.5 * rk],
      ]
      parts.forEach(([b, weight], i) => {
        const x = w / 2 + Math.sin(t * 0.13 * (1 + i * 0.27) + i * 1.9) * w * 0.38
        const y = h * 0.42 + Math.cos(t * 0.1 * (1 + i * 0.22) + i * 2.4) * h * 0.26
        const born = clamp01((t + 0.6 - i * 0.12) / 1.2)
        ctx.globalAlpha = (dark ? 0.22 : 0.17) * born * weight
        ctx.drawImage(b, x - big / 2, y - big / 2, big, big)
      })
      ctx.restore()
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
          a *= 1 - clamp01((d / Math.hypot(w, h) - 0.3) / 0.35)
          if (a < 0.02) continue
          ctx.globalAlpha = Math.min(0.75, a)
          ctx.fillRect(gx - 1, gy - 1, 2, 2)
        }
      }
      ctx.globalAlpha = 1
    }

    const stationDot = (p: P, s: number, color: string, a: number) => {
      if (s <= 0.01) return
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

    /** the connection symbol (three arcs and a dot) in the local coordinates of the dial */
    const drawWifi = (t: number, wifi: number, slash: number, alpha: number) => {
      const s = 0.55 + 0.45 * wifi
      const shake = slash > 0.2 ? Math.sin(t * 70) * 2.2 * (1 - clamp01((t - 1.0) / 0.5)) : 0
      ctx.save()
      ctx.translate(shake, 0)
      ctx.scale(s, s)
      ctx.lineCap = 'round'
      ctx.strokeStyle = amberCss
      ctx.lineWidth = 3.6
      for (let j = 0; j < 3; j++) {
        // the signal flickers, after the slash it only stutters
        const fl = 0.5 + 0.5 * Math.abs(Math.sin(t * 7 + j * 2.1))
        ctx.globalAlpha = wifi * alpha * (1 - (1 - fl) * (0.55 + 0.3 * slash))
        ctx.beginPath()
        ctx.arc(0, 11, 8 + j * 8.5, -Math.PI * 0.75, -Math.PI * 0.25)
        ctx.stroke()
      }
      ctx.globalAlpha = wifi * alpha
      ctx.fillStyle = amberCss
      ctx.beginPath()
      ctx.arc(0, 11, 3, 0, Math.PI * 2)
      ctx.fill()
      if (slash > 0.01) {
        const ex = -22 + 44 * slash
        const ey = -20 + 42 * slash
        ctx.globalAlpha = wifi * alpha
        ctx.strokeStyle = discSolid
        ctx.lineWidth = 9
        ctx.beginPath()
        ctx.moveTo(-22, -20)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.strokeStyle = redCss
        ctx.lineWidth = 4.2
        ctx.beginPath()
        ctx.moveTo(-22, -20)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
      ctx.restore()
    }

    /** the memory of the device: a cylinder of three tiers whose edges glow while it is being read */
    const drawStore = (t: number, s: number, rk: number, alpha: number) => {
      const hw = 15
      const ry = 5.5
      const y0 = -12
      const y1 = 12
      const line = rgbCss(lerpRgb(amber, accent, rk))
      ctx.save()
      ctx.scale(s, s)
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.moveTo(-hw, y0)
      ctx.lineTo(-hw, y1)
      ctx.ellipse(0, y1, hw, ry, 0, Math.PI, 0, true)
      ctx.lineTo(hw, y0)
      ctx.ellipse(0, y0, hw, ry, 0, 0, Math.PI, true)
      ctx.closePath()
      ctx.fillStyle = discSolid
      ctx.fill()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = line
      ctx.lineWidth = 2.6
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(0, y0, hw, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      ;[-4, 4].forEach((yy, idx) => {
        const act = rk > 0.05 ? 0.5 + 0.5 * Math.sin(t * 6 - idx * 1.4) : 0.4
        ctx.globalAlpha = alpha * (0.3 + 0.7 * act)
        ctx.beginPath()
        ctx.ellipse(0, yy, hw, ry, 0, 0, Math.PI)
        ctx.stroke()
      })
      ctx.restore()
    }

    const draw = (t: number, u: number, shown: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      const closing = u >= 0
      const rk = easeInOut(clamp01((t - 2.3) / 2))
      const sym = offlineSymbols(t)
      const s400 = size / 400

      // radar-like ripples that get no answer (red), later the bursting ring of the closing animation
      const searching: { r: number; a: number }[] = []
      if (!reduced) {
        for (let j = 0; j < 3; j++) {
          const age = t - (0.35 + j * 0.8)
          if (age > 0 && age < 1.6) searching.push({ r: DIAL_R + age * 170, a: (1 - age / 1.6) ** 2 })
        }
      }
      const rippleR = searching.map((q) => q.r * s400)
      if (closing && u > 0.25) rippleR.push((DIAL_R + easeOut((u - 0.25) / 0.45) * 520) * s400)
      drawBackground(t, rippleR, rk)

      const zoom = closing ? 1 + 0.14 * easeInOut(clamp01((u - 0.25) / 0.6)) : 1
      const k = s400 * zoom
      const alpha = closing ? 1 - clamp01((u - 0.5) / 0.3) : 1
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cx - HUB[0] * k), dpr * (cy - HUB[1] * k))

      for (const q of searching) {
        ctx.globalAlpha = q.a * 0.5 * alpha
        ctx.lineWidth = 1 + 3 * (1 - q.a)
        ctx.strokeStyle = redCss
        ctx.beginPath()
        ctx.arc(HUB[0], HUB[1], q.r, 0, Math.PI * 2)
        ctx.stroke()
      }

      net.forEach((l, i) => {
        const L = l.track.total
        const dh = hubAt[i]
        const f = restoreFront(t, i)
        // the ghost of the line: dashed, dim, it drifts, there is nothing to see of the real thing yet
        ctx.save()
        ctx.setLineDash([6, 11])
        ctx.lineDashOffset = -t * 9
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = l.color
        ctx.lineWidth = 4
        ctx.globalAlpha = (0.2 + 0.07 * Math.sin(t * 3 + i * 1.3)) * alpha * (1 - 0.6 * f)
        ctx.beginPath()
        l.track.trace(ctx, 0, L)
        ctx.stroke()
        ctx.restore()
        for (const s of l.stationAt) {
          if (s.p[0] === HUB[0] && s.p[1] === HUB[1]) continue
          ctx.globalAlpha = 0.28 * alpha * (1 - f)
          ctx.beginPath()
          ctx.arc(s.p[0], s.p[1], 7, 0, Math.PI * 2)
          ctx.lineWidth = 2.4
          ctx.strokeStyle = `rgb(${inkRgb})`
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        if (f <= 0) return
        // the rebuilt part grows out of the hub, with a light at each front
        const r = f * Math.max(dh, L - dh)
        strokeGlowing(ctx, l.track, Math.max(0, dh - r), Math.min(L, dh + r), l.color, alpha)
        for (const s of l.stationAt) {
          if (s.p[0] === HUB[0] && s.p[1] === HUB[1]) continue
          stationDot(s.p, easeOutBack(clamp01((r - Math.abs(s.d - dh)) / 30)), l.color, alpha)
        }
        if (f < 1) {
          if (dh - r > 0) drawLight(ctx, l.track.at(dh - r), 34, alpha)
          if (dh + r < L) drawLight(ctx, l.track.at(dh + r), 34, alpha)
        }
      })
      ctx.globalAlpha = 1

      // the dial: the same disc as in the city splash, so the two screens melt into each other
      const dialIn = easeOutBack(clamp01(t / 0.35))
      if (dialIn > 0.01) {
        ctx.save()
        ctx.translate(HUB[0], HUB[1])
        ctx.scale(dialIn, dialIn)
        ctx.globalAlpha = (0.55 + 0.15 * Math.sin(t * 2.4)) * alpha * (1 - rk)
        ctx.drawImage(blobs.amber, -80, -80, 160, 160)
        ctx.globalAlpha = (0.55 + 0.15 * Math.sin(t * 2.4)) * alpha * rk
        ctx.drawImage(blobs.accent, -80, -80, 160, 160)
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(0, 0, DIAL_R, 0, Math.PI * 2)
        ctx.fillStyle = discFill
        ctx.fill()
        ctx.lineWidth = 3.5
        ctx.strokeStyle = `rgba(${inkRgb},0.14)`
        ctx.stroke()

        // the ring of memory cells: they are read one after the other, the ones read so far glow
        const lit = litCells(shown)
        const span = ((Math.PI * 2) / MEMORY_CELLS) * 0.58
        const scan = Math.floor(t * 11) % MEMORY_CELLS
        ctx.lineCap = 'round'
        ctx.lineWidth = 5
        for (let j = 0; j < MEMORY_CELLS; j++) {
          const a = -Math.PI / 2 + ((j + 0.5) * Math.PI * 2) / MEMORY_CELLS
          const on = j < lit
          const reading = sym.store > 0.3 && !on && j === scan
          ctx.globalAlpha = (on ? 0.95 : reading ? 0.5 : 0.13) * alpha
          ctx.strokeStyle = on ? rgbCss(lerpRgb(amber, accent, j / MEMORY_CELLS + 0.15)) : reading ? amberCss : `rgb(${inkRgb})`
          ctx.beginPath()
          ctx.arc(0, 0, DIAL_R + 17, a - span / 2, a + span / 2)
          ctx.stroke()
        }
        if (lit > 0 && lit < MEMORY_CELLS) {
          const a = -Math.PI / 2 + ((lit - 0.5) * Math.PI * 2) / MEMORY_CELLS
          drawLight(ctx, [Math.cos(a) * (DIAL_R + 17), Math.sin(a) * (DIAL_R + 17)], 26, alpha)
        }

        // progress ring, amber at first and accent when everything is there
        const a0 = -Math.PI / 2
        const a1 = a0 + Math.PI * 2 * clamp01(shown)
        const ringCss = rgbCss(lerpRgb(amber, accent, shown))
        for (const [lw, la] of [[10, 0.18], [3.8, 1]] as [number, number][]) {
          ctx.globalAlpha = la * alpha
          ctx.lineWidth = lw
          ctx.strokeStyle = ringCss
          ctx.beginPath()
          ctx.arc(0, 0, DIAL_R, a0, a1)
          ctx.stroke()
        }
        ctx.globalAlpha = alpha
        if (shown > 0.01 && shown < 0.999) drawLight(ctx, [Math.cos(a1) * DIAL_R, Math.sin(a1) * DIAL_R], 22, alpha)

        if (sym.wifi > 0.01) drawWifi(t, sym.wifi, sym.slash, alpha)
        const store = sym.store * (closing ? 1 - clamp01(u / 0.2) : 1)
        if (store > 0.01) drawStore(t, store, rk, alpha)
        // the hub station only comes back with the closing
        if (closing) {
          const hs = easeOutBack(clamp01(u * 4))
          if (hs > 0.01) {
            ctx.globalAlpha = alpha
            ctx.beginPath()
            ctx.arc(0, 0, 14 * hs, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.fill()
            ctx.lineWidth = 5 * hs
            ctx.strokeStyle = stationStroke
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(0, 0, 5.5 * hs, 0, Math.PI * 2)
            ctx.fillStyle = accentCss
            ctx.fill()
          }
        }
        ctx.restore()
      }

      // the moment the data starts to flow: a flash at the hub
      const flash = clamp01(1 - Math.abs(t - RESTORE_AT - 0.2) / 0.55)
      if (flash > 0 && !closing) drawLight(ctx, HUB, 60 + 160 * flash, 0.85 * flash)

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
      const real = progressRef.current
      const aim = reduced ? real : Math.min(real, 0.97 * offlinePace(el, minMs))
      disp += (aim - disp) * (1 - Math.exp(-((now - lastNow) / 1000) * 7))
      lastNow = now
      if (finishAt < 0 && el * 1000 >= minMs && readyRef.current) {
        finishAt = now
        from = disp
      }
      const u = finishAt < 0 ? -1 : clamp01((now - finishAt) / 1000 / FINISH_CITY)
      const shown = u >= 0 ? closingProgress(from, u) : disp
      draw(t, u, shown)
      const m = offlineMessage(el, u >= 0)
      if (m !== shownMsg) {
        shownMsg = m
        setMsg(m)
      }
      // it melts in over the city splash that is breaking off underneath
      root.style.opacity = String(easeInOut(el / OFFLINE_FADE_IN))
      if (u >= 0) {
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
  }, [minMs])

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden" style={{ zIndex: z, opacity: 0, background: 'var(--splash-bg)', color: 'var(--splash-ink)' }} role="status" aria-live="polite">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div ref={textRef} className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6 text-center">
        <div className="splash-eyebrow" style={{ color: OFFLINE_AMBER, fontSize: 13 }}>
          <span className="splash-offline-dot" />
          Offline
        </div>
        <h1 className="splash-title mt-2 max-w-full truncate pb-1 text-[2.1rem] font-extrabold leading-tight tracking-tight">{title}</h1>
        <div key={msg} className="splash-msg-big mt-4 min-h-8" style={msg === 0 ? { color: OFFLINE_AMBER } : undefined}>
          {OFFLINE_MESSAGES[msg]}
          {msg < OFFLINE_MESSAGES.length - 1 ? ' …' : ''}
        </div>
        <p className="splash-offline-hint mt-4 max-w-xs text-[13px] leading-relaxed">Deine Stadt liegt auf diesem Gerät. Sobald du wieder online bist, wird alles abgeglichen.</p>
      </div>
      <div className="splash-brand pointer-events-none absolute inset-x-0 bottom-[calc(26px+var(--safe-bottom))] text-center" aria-hidden>
        LINEFORGE
      </div>
    </div>
  )
}
