import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatClock, gameTime, minuteOfDay, sunAt } from '../sim/clock'

const SIZE = 200
const C = SIZE / 2
const R = 76
const SNAP = 5

const PRESETS: { label: string; m: number }[] = [
  { label: 'Morgen', m: 6 * 60 + 30 },
  { label: 'Mittag', m: 12 * 60 },
  { label: 'Abend', m: 18 * 60 },
  { label: 'Nacht', m: 0 },
]

/** Noon is at the top of the ring, midnight at the bottom: the minute of the day as an angle in turns (0 = top, clockwise). */
const turnOf = (m: number) => (((m - 720) / 1440) % 1 + 1) % 1
const minuteOfTurn = (t: number) => (((t * 1440 + 720) % 1440) + 1440) % 1440

function phase(m: number): string {
  const s = sunAt(m)
  if (s.daylight < 0.08) return 'Nacht'
  if (s.glow > 0.45) return m < 720 ? 'Morgendämmerung' : 'Abenddämmerung'
  return m < 720 ? 'Vormittag' : m < 15 * 60 ? 'Mittag' : 'Nachmittag'
}

/**
 * Set the game time by hand (creative mode): drag the sun round a 24 hour ring, or pick a time of day. The 3D view
 * (sky, light, lit windows) follows live because it reads the same clock. The clock goes on running afterwards.
 */
export default function TimeDial({ onClose }: { onClose: () => void }) {
  const [m, setM] = useState(() => minuteOfDay(gameTime.minutes))
  const dragging = useRef(false)
  const ring = useRef<HTMLDivElement>(null)

  // follow the running clock while the player is not holding the sun
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!dragging.current) setM(minuteOfDay(gameTime.minutes))
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const apply = useCallback((minute: number) => {
    const day = Math.floor(gameTime.minutes / 1440) * 1440
    gameTime.minutes = day + minute
    setM(minute)
  }, [])

  const fromPointer = useCallback(
    (e: React.PointerEvent) => {
      const r = ring.current?.getBoundingClientRect()
      if (!r) return
      const x = e.clientX - (r.left + r.width / 2)
      const y = e.clientY - (r.top + r.height / 2)
      const turn = (Math.atan2(x, -y) / (Math.PI * 2) + 1) % 1
      const snapped = Math.round(minuteOfTurn(turn) / SNAP) * SNAP
      apply(snapped % 1440)
    },
    [apply],
  )

  const sun = sunAt(m)
  const a = turnOf(m) * Math.PI * 2
  const kx = C + Math.sin(a) * R
  const ky = C - Math.cos(a) * R
  const day = sun.daylight > 0.25
  // the ring: a conic gradient of the sky through the day (noon on top)
  const ringBg = 'conic-gradient(from 0deg, #7cc4ff 0%, #8fcfff 8%, #ffb066 22%, #ff7a59 26%, #3b2f6b 32%, #0b1230 45%, #0b1230 55%, #2b2a63 68%, #ff8a5c 74%, #ffc27a 78%, #8fcfff 92%, #7cc4ff 100%)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(12px+var(--safe-bottom))]"
    >
      <div className="card pointer-events-auto mx-auto max-w-lg space-y-2.5 rounded-[26px] p-3.5">
        <div className="flex items-center justify-between">
          <div className="text-base font-bold">Tageszeit einstellen</div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70">Kreativ</span>
        </div>

        <div
          ref={ring}
          className="relative mx-auto touch-none select-none"
          style={{ width: SIZE, height: SIZE }}
          onPointerDown={(e) => {
            dragging.current = true
            ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
            fromPointer(e)
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          aria-label="Tageszeit"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={1439}
          aria-valuenow={Math.round(m)}
          aria-valuetext={formatClock(m)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') apply((m + 15) % 1440)
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') apply((m + 1425) % 1440)
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-90"
            style={{ background: ringBg, WebkitMask: `radial-gradient(circle, transparent ${R - 15}px, #000 ${R - 14}px, #000 ${R + 14}px, transparent ${R + 15}px)`, mask: `radial-gradient(circle, transparent ${R - 15}px, #000 ${R - 14}px, #000 ${R + 14}px, transparent ${R + 15}px)` }}
          />
          {/* hour ticks */}
          <svg className="pointer-events-none absolute inset-0" width={SIZE} height={SIZE}>
            {Array.from({ length: 24 }, (_, h) => {
              const t = turnOf(h * 60) * Math.PI * 2
              const big = h % 6 === 0
              const r1 = R - 20
              const r2 = R - (big ? 28 : 24)
              return <line key={h} x1={C + Math.sin(t) * r1} y1={C - Math.cos(t) * r1} x2={C + Math.sin(t) * r2} y2={C - Math.cos(t) * r2} stroke="currentColor" strokeOpacity={big ? 0.55 : 0.25} strokeWidth={big ? 2 : 1.5} strokeLinecap="round" />
            })}
          </svg>
          {/* the sun / moon */}
          <div
            className="pointer-events-none absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
            style={{
              left: kx,
              top: ky,
              background: day ? 'radial-gradient(circle at 35% 35%, #fff6c2, #ffc83d 70%)' : 'radial-gradient(circle at 35% 35%, #ffffff, #c9d3f0 75%)',
              boxShadow: day ? '0 0 18px 6px rgba(255,200,61,0.55), 0 2px 6px rgba(0,0,0,0.35)' : '0 0 16px 4px rgba(190,205,255,0.45), 0 2px 6px rgba(0,0,0,0.35)',
            }}
          >
            {!day && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-[#9aa7d6]/60" />}
          </div>
          {/* the middle: time and part of the day */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-[36px] font-bold leading-none tabular-nums tracking-wide">{formatClock(m)}</div>
              <div className="mt-1 text-sm font-semibold text-white/60">{phase(m)}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} className="btn-soft rounded-2xl py-2.5 text-sm font-semibold active:scale-95" onClick={() => apply(p.m)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-white/45">Ziehe die Sonne um den Ring. In 3D siehst du Himmel und Licht live. Danach läuft die Zeit normal weiter.</p>
        <button className="btn-primary w-full rounded-2xl py-3 text-sm font-bold active:scale-95" onClick={onClose}>
          Fertig
        </button>
      </div>
    </motion.div>
  )
}
