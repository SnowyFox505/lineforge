import { useEffect, useRef } from 'react'
import { clamp01, drawLight, drawStation, easeInOut, easeOut, easeOutBack, prepareNet, REDUCED_MOTION, strokeGlowing } from './netCanvas'

const CYCLE = 4.2 // seconds for one line to be drawn and to wipe out again
const DISSOLVE = 1.05 // seconds the network needs to dissolve

/**
 * Loading screen: the lines of a network are drawn and wiped out again in an endless loop.
 * It stays at least `minMs` and until `ready`; then the network breaks up into dots and fades into the game.
 */
export default function LoadingScreen({ title, ready, minMs = 3000, onDone }: { title: string; ready: boolean; minMs?: number; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(ready)
  const doneRef = useRef(onDone)

  useEffect(() => {
    readyRef.current = ready
    doneRef.current = onDone
  }, [ready, onDone])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const text = textRef.current
    if (!root || !canvas || !text) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const net = prepareNet()
    const reduced = REDUCED_MOTION()
    let dpr = 1
    let k = 1
    let ox = 0
    let oy = 0
    let rotate = false
    let raf = 0
    const start = performance.now()
    let dissolveAt = -1
    let finished = false

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      // portrait: 400 x 800 design space; landscape: turned by 90 degrees so the long side uses the width
      rotate = r.width > r.height
      const dw = rotate ? 800 : 400
      const dh = rotate ? 400 : 800
      k = Math.max(r.width / dw, r.height / dh)
      ox = (r.width - dw * k) / 2
      oy = (r.height - dh * k) / 2
    }

    const draw = (t: number, u: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (rotate) ctx.setTransform(0, dpr * k, dpr * k, 0, dpr * ox, dpr * oy)
      else ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy)
      const fade = 1 - easeOut(u)
      net.forEach((l, i) => {
        const L = l.track.total
        const c = (((t - 0.25 - i * 0.55) % CYCLE) + CYCLE) % CYCLE / CYCLE
        const started = t - 0.25 - i * 0.55 >= 0
        if (!started && !reduced) return
        const head = reduced ? 1 : easeInOut(c / 0.5)
        const tail = reduced ? 0 : easeInOut((c - 0.5) / 0.5)
        const d0 = tail * L
        const d1 = head * L
        // dissolve: the line breaks up into dashes that shrink to dots
        if (u > 0) ctx.setLineDash([Math.max(0.1, (1 - u) * 38), 4 + u * 34])
        ctx.lineDashOffset = -u * 70
        strokeGlowing(ctx, l.track, d0, d1, l.color, fade)
        ctx.setLineDash([])
        ctx.lineDashOffset = 0
        for (const s of l.stationAt) {
          const inside = d1 >= s.d - 1 && d0 <= s.d + 1
          const entered = clamp01((d1 - s.d + 6) / 12)
          const left = 1 - clamp01((d0 - s.d + 6) / 12)
          const sc = inside || (entered > 0 && left > 0) ? easeOutBack(Math.min(entered, left) * 1.4) : 0
          drawStation(ctx, s.p, s.big, sc * (1 - easeOut(u * 1.3)), fade)
          // a ring spreads when the line reaches a station
          const since = (d1 - s.d) / L
          if (!reduced && head < 1 && since > 0 && since < 0.1) {
            const r = since / 0.1
            ctx.globalAlpha = (1 - r) * 0.5 * fade
            ctx.beginPath()
            ctx.arc(s.p[0], s.p[1], (s.big ? 10 : 6.5) + r * 16, 0, Math.PI * 2)
            ctx.lineWidth = 2
            ctx.strokeStyle = l.color
            ctx.stroke()
            ctx.globalAlpha = 1
          }
        }
        // the light at the head of the line
        if (!reduced && head > 0 && head < 1) drawLight(ctx, l.track.at(d1), 26, fade)
      })
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const el = now - start
      const t = el / 1000
      if (dissolveAt < 0 && el >= minMs && readyRef.current) dissolveAt = now
      const u = dissolveAt < 0 ? 0 : clamp01((now - dissolveAt) / 1000 / DISSOLVE)
      draw(t, u)
      // fade in at the beginning, fade the whole screen out in the second half of the dissolve
      const fin = clamp01(t / 0.25)
      const fout = 1 - clamp01((u - 0.55) / 0.45)
      root.style.opacity = String(Math.min(fin, fout))
      text.style.opacity = String(1 - clamp01(u / 0.4))
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
    <div ref={rootRef} className="fixed inset-0 z-[70]" style={{ opacity: 0, background: 'radial-gradient(ellipse at 50% 42%, #14202e 0%, #080b10 62%, #05070a 100%)' }} role="status" aria-live="polite">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div ref={textRef} className="pointer-events-none absolute inset-x-0 bottom-[calc(14%+var(--safe-bottom))] text-center">
        <div className="eyebrow">Stadt wird geladen</div>
        <div className="mx-auto mt-2 max-w-[80%] truncate text-3xl font-bold tracking-tight">{title}</div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="load-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
