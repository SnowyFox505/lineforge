import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

/** Deletes the offline copy of the app (service worker + caches). Saved cities live in IndexedDB and stay untouched. */
export async function clearAppCaches() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const LINES = [
  { d: 'M -10 70 H 90 L 150 130 V 200', color: '#ff5470' },
  { d: 'M 410 90 H 300 L 250 140 V 200', color: '#3db8ff' },
  { d: 'M 40 410 V 330 L 120 250 H 200', color: '#a6e03c' },
  { d: 'M 360 410 V 320 L 280 240 H 200', color: '#ffc233' },
  { d: 'M 200 -10 V 200', color: '#9a6bff' },
]

const STEPS = ['Suche nach Updates …', 'Zwischenspeicher wird geleert …', 'Neue Version wird geladen …']
const TOTAL = 3200

/** Full-screen update animation: the lines of the network run into one station, then the app reloads. */
export default function UpdateOverlay() {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    const t1 = setTimeout(() => alive && setStep(1), 900)
    const t2 = setTimeout(() => alive && setStep(2), 2100)
    ;(async () => {
      const t0 = Date.now()
      try {
        await clearAppCaches()
      } catch {
        // clearing is best effort: the reload below still fetches the newest version
      }
      await sleep(Math.max(0, TOTAL - (Date.now() - t0)))
      if (!alive) return
      setDone(true)
      await sleep(850)
      location.reload()
    })()
    return () => {
      alive = false
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #14202e 0%, #080b10 62%, #05070a 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col items-center px-8">
        <svg viewBox="0 0 400 400" className="h-auto w-full max-w-[340px] overflow-visible" aria-hidden>
          <defs>
            <filter id="upd-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {LINES.map((l, i) => (
            <g key={l.d}>
              <path className="draw-line" d={l.d} fill="none" stroke={l.color} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} filter="url(#upd-glow)" pathLength={1} strokeDasharray="1 2" style={{ animationDelay: `${0.1 + i * 0.16}s`, animationDuration: '1.3s' }} />
              <path className="draw-line" d={l.d} fill="none" stroke={l.color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 2" style={{ animationDelay: `${0.1 + i * 0.16}s`, animationDuration: '1.3s' }} />
              <circle r={5} fill="#fff" opacity={0}>
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur="1.6s" begin={`${1.0 + i * 0.22}s`} fill="freeze" />
                <animateMotion dur="1.6s" begin={`${1.0 + i * 0.22}s`} fill="freeze" path={l.d} />
              </circle>
            </g>
          ))}
          {/* the station all lines run into, with a progress ring */}
          <circle className="pop-dot" cx={200} cy={200} r={26} fill="#0a0e14" stroke="#fff" strokeWidth={9} style={{ animationDelay: '1.1s' }} />
          <circle cx={200} cy={200} r={43} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={5} />
          <circle className="update-ring" cx={200} cy={200} r={43} fill="none" style={{ stroke: 'var(--color-accent)' }} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray="1 2" transform="rotate(-90 200 200)" />
          {done && (
            <motion.path d="M 187 201 l 9 9 l 18 -20" fill="none" style={{ stroke: 'var(--color-accent)' }} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
          )}
        </svg>
        <div className="mt-2 text-center">
          <div className="text-xl font-bold tracking-tight">{done ? 'Aktuell!' : 'Aktualisiere LineForge'}</div>
          <div className="mt-1 h-5 text-sm text-white/60">{done ? 'Die App startet neu …' : STEPS[step]}</div>
          <div className="mt-5 text-xs text-white/40">Deine Städte bleiben erhalten.</div>
        </div>
      </div>
    </motion.div>
  )
}
