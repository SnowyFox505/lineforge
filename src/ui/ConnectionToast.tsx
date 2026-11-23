import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/authStore'

type Kind = 'lost' | 'back'

/** how long the note stays, in milliseconds */
const SHOW_MS = 5200
/** a connection that is gone for less than this is a flicker, not worth a note */
const CONFIRM_MS = 700

const AMBER = '#ffb02e'
const RED = '#ff5a4a'

// three arcs and a dot in a 24 x 24 box (the connection symbol)
const ARCS = ['M8.82 15.82 A4.5 4.5 0 0 1 15.18 15.82', 'M5.99 12.99 A8.5 8.5 0 0 1 18.01 12.99', 'M3.16 10.16 A12.5 12.5 0 0 1 20.84 10.16']

/**
 * The connection symbol that draws itself: when it is lost the arcs come in from the outside, flicker, and a red stroke cuts through them;
 * when it is back the arcs light up one after the other from the inside, like bars of a signal, and a ring spreads from the dot.
 */
function SignalIcon({ kind, reduce }: { kind: Kind; reduce: boolean }) {
  const lost = kind === 'lost'
  const d = (s: number) => (reduce ? 0 : s)
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
      {ARCS.map((p, i) => {
        const order = lost ? 2 - i : i
        return (
          <motion.path
            key={p}
            d={p}
            stroke={lost ? AMBER : 'currentColor'}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={lost ? { pathLength: 1, opacity: [0, 1, 0.45, 1, 0.5, 0.75] } : { pathLength: 1, opacity: 1 }}
            transition={{ delay: d(0.25 + order * 0.14), duration: d(lost ? 0.7 : 0.35), ease: 'easeOut' }}
          />
        )
      })}
      <motion.circle
        cx="12"
        cy="19.2"
        r="1.5"
        fill={lost ? AMBER : 'currentColor'}
        stroke="none"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: d(0.15), type: 'spring', stiffness: 420, damping: 14 }}
        style={{ transformOrigin: '12px 19.2px' }}
      />
      {lost && (
        <>
          <motion.path d="M4.5 4.5 L19.5 19.5" stroke="var(--toast-cut, #0d1218)" strokeWidth="5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: d(0.95), duration: d(0.28), ease: 'easeOut' }} />
          <motion.path d="M4.5 4.5 L19.5 19.5" stroke={RED} strokeWidth="2.3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: d(0.95), duration: d(0.28), ease: 'easeOut' }} />
        </>
      )}
    </svg>
  )
}

/**
 * A small note at the top of the screen while a city is open: it drops in when the connection is gone and when it is back.
 * It only appears for changes while the city is on screen (opening a city offline is told by the loading screen), and goes by itself.
 */
export default function ConnectionToast() {
  const [toast, setToast] = useState<{ kind: Kind; id: number } | null>(null)
  const signedIn = useAuth((s) => s.status === 'user')
  const reduce = useReducedMotion() ?? false

  useEffect(() => {
    let offlineBefore = navigator.onLine === false
    let hide: number | undefined
    let confirm: number | undefined
    let n = 0
    const show = (kind: Kind) => {
      window.clearTimeout(hide)
      setToast({ kind, id: ++n })
      hide = window.setTimeout(() => setToast(null), SHOW_MS)
    }
    const onOffline = () => {
      window.clearTimeout(confirm)
      confirm = window.setTimeout(() => {
        if (navigator.onLine !== false) return
        offlineBefore = true
        show('lost')
      }, CONFIRM_MS)
    }
    const onOnline = () => {
      window.clearTimeout(confirm)
      if (!offlineBefore) return
      offlineBefore = false
      show('back')
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(hide)
      window.clearTimeout(confirm)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const lost = toast?.kind === 'lost'
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(70px+var(--safe-top))] z-30 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.button
            key={toast.id}
            type="button"
            role="status"
            aria-live="polite"
            onClick={() => setToast(null)}
            className="glass pointer-events-auto relative flex max-w-[min(92vw,24rem)] items-center gap-3 overflow-hidden rounded-[22px] py-2.5 pl-2.5 pr-5 text-left"
            style={{ boxShadow: `0 18px 40px -12px rgba(0,0,0,0.6), 0 0 0 1px ${lost ? 'rgba(255,176,46,0.35)' : 'rgba(255,255,255,0.12)'}, 0 0 28px -6px ${lost ? 'rgba(255,176,46,0.45)' : 'var(--accent)'}` }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -46, scale: 0.86 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -26, scale: 0.94, transition: { duration: 0.22, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 380, damping: 26, mass: 0.9 }}
          >
            <motion.span
              className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full ${lost ? '' : 'text-accent'}`}
              style={{ background: lost ? 'rgba(255,176,46,0.16)' : 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
              animate={lost && !reduce ? { x: [0, 0, -3, 3, -2, 2, 0] } : undefined}
              transition={{ delay: 0.95, duration: 0.45 }}
            >
              {/* when the connection is back a ring spreads from the symbol once */}
              {!lost && !reduce && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{ border: '2px solid var(--accent)' }}
                  initial={{ scale: 1, opacity: 0.7 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  transition={{ delay: 0.45, duration: 0.9, ease: 'easeOut' }}
                />
              )}
              <SignalIcon kind={toast.kind} reduce={reduce} />
            </motion.span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-tight" style={lost ? { color: AMBER } : undefined}>
                {lost ? 'Keine Verbindung' : 'Wieder online'}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-white/60">
                {lost ? 'Du baust offline weiter, alles wird auf dem Gerät gespeichert.' : signedIn ? 'Deine Städte werden abgeglichen.' : 'Du bist wieder mit dem Internet verbunden.'}
              </span>
            </span>
            {/* the time that is left, running down along the bottom edge */}
            <motion.span
              className="absolute bottom-0 left-0 h-[3px] w-full origin-left"
              style={{ background: lost ? AMBER : 'var(--accent)', opacity: 0.8 }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: SHOW_MS / 1000, ease: 'linear' }}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
