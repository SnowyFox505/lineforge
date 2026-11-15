import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useEditor } from '../store/editorStore'
import Icon from '../ui/Icon'
import { FOLLOW_MODES, followState } from './follow'

/** Small control panel while the camera follows a train: line, where it is going, view, other train, stop. */
export default function FollowHud() {
  const id = useEditor((s) => s.followId)
  const mode = useEditor((s) => s.followMode)
  const setMode = useEditor((s) => s.setFollowMode)
  const setFollow = useEditor((s) => s.setFollow)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!id) return
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [id])

  if (!id) return null
  const ids = followState.trainIds
  const step = (d: number) => {
    if (ids.length < 2) return
    const i = ids.indexOf(id)
    setFollow(ids[(i + d + ids.length) % ids.length])
  }
  const under = followState.underground

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="glass pointer-events-auto absolute bottom-[98px] left-3 right-[72px] z-20 rounded-3xl p-3 md:left-1/2 md:right-auto md:w-[420px] md:-translate-x-1/2"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl px-2 text-sm font-bold text-white" style={{ background: followState.color, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
          {followState.line || '–'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-tight">{followState.status || 'Zug folgen'}</div>
          <div className="truncate text-[11px] leading-tight text-white/50">{(under ? 'Unter der Erde: Röntgenblick' : 'Über der Erde') + (mode === 'free' ? ' · Wischen zum Drehen' : ' · Wischen zum Umschauen')}</div>
        </div>
        <button onClick={() => step(-1)} aria-label="Vorheriger Zug" className="btn-soft grid h-9 w-9 place-items-center rounded-full disabled:opacity-30" disabled={ids.length < 2}>
          <Icon name="back" size={18} />
        </button>
        <button onClick={() => step(1)} aria-label="Nächster Zug" className="btn-soft grid h-9 w-9 place-items-center rounded-full disabled:opacity-30" disabled={ids.length < 2}>
          <Icon name="back" size={18} className="rotate-180" />
        </button>
        <button onClick={() => setFollow(null)} aria-label="Folgen beenden" className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink">
          <Icon name="close" size={18} stroke={2.4} />
        </button>
      </div>
      <div className="mt-2.5 flex gap-1 rounded-2xl bg-black/30 p-1">
        {FOLLOW_MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className={`flex-1 rounded-xl py-1.5 text-[13px] font-semibold transition-colors ${mode === m.id ? 'bg-accent text-accent-ink' : 'text-white/70'}`}>
            {m.label}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
