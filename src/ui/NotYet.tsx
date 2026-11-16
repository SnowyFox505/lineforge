import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/**
 * For something that is not there yet (the normal game mode is still in beta): `poke()` shakes the thing and shows a
 * "Beta" note that fades in and out again. Put `controls` on a motion element and render `<BetaNote show={shown} />`.
 */
export function useNotYet() {
  const controls = useAnimationControls()
  const [shown, setShown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const poke = () => {
    void controls.start({ x: [0, -9, 9, -7, 7, -3, 0], transition: { duration: 0.45 } })
    setShown(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShown(false), 1900)
  }
  return { controls, shown, poke }
}

export function BetaNote({ show, className = '' }: { show: boolean; className?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          key="beta"
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.9 }}
          transition={{ duration: 0.25 }}
          className={`pointer-events-none inline-flex items-center rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#fff] shadow-lg ${className}`}
        >
          Beta · noch nicht verfügbar
        </motion.span>
      )}
    </AnimatePresence>
  )
}
