import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { LINE_COLORS } from '../model/constants'
import type { StationType } from '../model/types'
import { planePath } from '../plan/glyphs'
import Icon from './Icon'

export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const

/** Bottom sheet (centred card on desktop) with animated backdrop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            className="glass sheet relative max-h-[88%] w-full max-w-lg overflow-y-auto rounded-t-[28px] p-5 pb-[calc(1.25rem+var(--safe-bottom))] md:rounded-[28px]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">{title}</h2>
                <button className="btn-soft grid h-9 w-9 place-items-center rounded-full" onClick={onClose} aria-label="Schließen">
                  <Icon name="close" size={18} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; sub?: string }[]
}) {
  const id = useId()
  return (
    <div className="flex gap-1 rounded-2xl bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${value === o.value ? 'text-accent-ink' : 'text-white/70'}`}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="btn-primary absolute inset-0 rounded-xl"
              transition={spring}
            />
          )}
          <span className="relative block leading-tight">{o.label}</span>
          {o.sub && <span className="relative block text-[10px] font-medium opacity-70">{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      value={value}
      style={{ ['--p' as string]: `${p}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/** Free colour choice: palette swatches plus a custom colour picker. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const inPalette = LINE_COLORS.includes(value)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {LINE_COLORS.map((c) => (
        <button
          key={c}
          aria-label={`Farbe ${c}`}
          onClick={() => onChange(c)}
          className="relative h-7 w-7 rounded-full transition-transform active:scale-90"
          style={{ background: c, boxShadow: value === c ? `0 0 0 2px #0b0f15, 0 0 0 4px #fff` : 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
        />
      ))}
      <div
        className="relative h-7 w-7 overflow-hidden rounded-full"
        style={{
          background: inPalette
            ? 'conic-gradient(from 0deg, #ff5470, #ffc233, #a6e03c, #17c3b2, #5b7cff, #e055c4, #ff5470)'
            : value,
          boxShadow: !inPalette ? `0 0 0 2px #0b0f15, 0 0 0 4px #fff` : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
        }}
        title="Eigene Farbe"
      >
        <input
          type="color"
          className="swatch-input absolute inset-0 opacity-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Eigene Farbe wählen"
        />
      </div>
    </div>
  )
}

/** Text input that commits on blur/enter so undo history isn't flooded per keystroke. */
export function CommitInput({
  value,
  onCommit,
  className = '',
  placeholder,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => {
    const v = text.trim()
    if (v && v !== value) onCommit(v)
    else setText(value)
  }
  return (
    <input
      className={`field ${className}`}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function StationGlyph({ type, size = 30 }: { type: StationType; size?: number }) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {type === 'standard' && <circle cx={c} cy={c} r={size * 0.2} fill="#fff" stroke="#0b0f15" strokeWidth={size * 0.09} />}
      {type === 'interchange' && <circle cx={c} cy={c} r={size * 0.3} fill="#fff" stroke="#0b0f15" strokeWidth={size * 0.13} />}
      {type === 'landmark' && (
        <polygon
          points={`${c},${c - size * 0.36} ${c + size * 0.36},${c} ${c},${c + size * 0.36} ${c - size * 0.36},${c}`}
          fill="#ffbd3d"
          stroke="#0b0f15"
          strokeWidth={size * 0.08}
          strokeLinejoin="round"
        />
      )}
      {type === 'hauptbahnhof' && (
        <g>
          <rect x={c - size * 0.4} y={c - size * 0.3} width={size * 0.8} height={size * 0.6} rx={size * 0.14} fill="#2c4fe0" stroke="#fff" strokeWidth={size * 0.07} />
          <text x={c} y={c + size * 0.16} textAnchor="middle" fontSize={size * 0.46} fontWeight={700} fill="#fff" fontFamily="inherit">
            H
          </text>
        </g>
      )}
      {type === 'airport' && (
        <g>
          <circle cx={c} cy={c} r={size * 0.4} fill="#1590e8" stroke="#fff" strokeWidth={size * 0.07} />
          <path d={planePath(c, c, size * 0.24)} fill="#fff" />
        </g>
      )}
    </svg>
  )
}
