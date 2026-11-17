import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import MapEditor from '../editor2d/MapEditor'
import { saveCity } from '../persistence/db'
import { flushUploads } from '../cloud/sync'
import PlanView from '../plan/PlanView'
import { useEditor } from '../store/editorStore'
import type { Tab } from '../store/editorStore'
import { distToRect, fadeOpacity, useDockFade } from './dockFade'
import Icon from './Icon'
import type { IconName } from './Icon'
import { spring } from './primitives'
import { formatClock, gameTime } from '../sim/clock'
import WorldSim from '../sim/WorldSim'
import SettingsSheet from './SettingsSheet'
import ShrinkBar from './ShrinkBar'
import TimeDial from './TimeDial'
import ToolDock from './ToolDock'

// three.js is large; only load it when the 3D tab is opened.
const Scene3D = lazy(() => import('../view3d/Scene3D'))
const StationEditor3D = lazy(() => import('../view3d/StationEditor3D'))

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'map', label: 'Karte', icon: 'map' },
  { id: 'plan', label: 'Netzplan', icon: 'plan' },
  { id: 'view3d', label: '3D', icon: 'cube' },
]

/** The game time as a digital clock (hh:mm); one real second is one game minute. */
function GameClock({ onTap }: { onTap?: () => void }) {
  const [text, setText] = useState(() => formatClock(gameTime.minutes))
  useEffect(() => {
    const tick = () => setText(formatClock(gameTime.minutes))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span
      className={`shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[14px] font-bold leading-none tabular-nums tracking-wide text-white/90 ${onTap ? 'ring-1 ring-white/25 active:scale-90' : ''}`}
      aria-label={onTap ? 'Spielzeit einstellen' : 'Spielzeit'}
      role={onTap ? 'button' : undefined}
      onClick={
        onTap
          ? (e) => {
              // the clock sits inside the title button: it opens the time dial, not the settings
              e.stopPropagation()
              onTap()
            }
          : undefined
      }
    >
      {text}
    </span>
  )
}

function TopBar({ onSettings, onClock }: { onSettings: () => void; onClock: () => void }) {
  const doc = useEditor((s) => s.doc)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const setScreen = useEditor((s) => s.setScreen)
  const tab = useEditor((s) => s.tab)
  const stations = Object.keys(doc.stations).length
  const lines = Object.keys(doc.lines).length

  const back = async () => {
    useEditor.getState().cancelShrink()
    await saveCity(useEditor.getState().doc)
    // the cloud copy follows at once in the background, no waiting for the quiet period
    void flushUploads()
    setScreen('menu')
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex max-w-2xl items-center gap-2 px-3 pt-[calc(10px+var(--safe-top))]">
      <button onClick={back} className="glass pointer-events-auto grid h-12 w-12 shrink-0 place-items-center rounded-full active:scale-90" aria-label="Zum Menü">
        <Icon name="back" />
      </button>
      <button onClick={onSettings} className="glass pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-full py-1.5 pl-4 pr-3 text-left active:scale-[0.98]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">{doc.name}</span>
          <span className="block truncate text-[11px] leading-tight text-white/50">
            {doc.mode === 'normal' ? 'Normal' : 'Kreativ'} · {stations} Stationen · {lines} Linien
          </span>
        </span>
        <GameClock onTap={doc.mode === 'normal' ? undefined : onClock} />
        <Icon name="sliders" size={18} className="shrink-0 text-white/60" />
      </button>
      {tab === 'map' && (
        <div className="glass pointer-events-auto flex shrink-0 rounded-full p-1">
          <button onClick={undo} disabled={!canUndo} className="grid h-10 w-10 place-items-center rounded-full transition-opacity active:scale-90 disabled:opacity-25" aria-label="Rückgängig">
            <Icon name="undo" size={20} />
          </button>
          <button onClick={redo} disabled={!canRedo} className="grid h-10 w-10 place-items-center rounded-full transition-opacity active:scale-90 disabled:opacity-25" aria-label="Wiederholen">
            <Icon name="redo" size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

function TabPill() {
  const tab = useEditor((s) => s.tab)
  const setTab = useEditor((s) => s.setTab)
  return (
    <div className="glass pointer-events-auto mx-auto flex w-fit rounded-full p-1.5">
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${active ? 'text-accent-ink' : 'text-white/65'}`}
          >
            {active && <motion.span layoutId="tabPill" className="btn-primary absolute inset-0 rounded-full" transition={spring} />}
            <span className="relative">
              <Icon name={t.icon} size={19} />
            </span>
            <span className="relative">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The tool dock at the bottom (the tab pill below it stays). While a tool is picked on the map it gets out of the way of what is drawn beneath it:
 * - with a mouse it fades the closer the cursor comes (and lets clicks through to the map, buttons excepted),
 * - on a touch screen it fades while a finger draws and comes back when the finger lifts.
 * Whatever is drawn hides it at once. After the dock is used or something is selected (a station, a line) it stays fully
 * visible for HOLD_MS, so the buttons can be reached, until the next stroke.
 * The opacity is written straight to the element: a re-render per mouse move would be far too much.
 */
/** How long the dock stays visible after it was used */
const HOLD_MS = 5000

function FadingDock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const tab = useEditor((s) => s.tab)
  const tool = useEditor((s) => s.tool)
  const drawing = useDockFade((s) => s.drawing)
  const active = tab === 'map' && tool !== 'pan'
  /** opacity from the mouse distance (1 = far away or no mouse) */
  const near = useRef(1)
  /** until when (performance.now) the dock stays fully visible after it was used */
  const holdUntil = useRef(0)
  const holdTimer = useRef<number | undefined>(undefined)

  const apply = useCallback(() => {
    const el = ref.current
    if (!el) return
    const held = performance.now() < holdUntil.current
    const o = useDockFade.getState().drawing ? 0 : held ? 1 : near.current
    el.style.opacity = String(o)
    // faded menu: the map beneath takes the clicks (only the buttons and sliders stay clickable)
    el.classList.toggle('dock-through', o < 0.8)
    el.classList.toggle('dock-hidden', useDockFade.getState().drawing)
  }, [])

  useEffect(() => {
    if (!active) {
      near.current = 1
      apply()
      return
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !ref.current) return
      let d = Infinity
      // distance to the dock itself, not the empty space around it
      for (const c of Array.from(ref.current.children)) {
        const r = c.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) d = Math.min(d, distToRect(e.clientX, e.clientY, r))
      }
      near.current = fadeOpacity(d)
      apply()
    }
    const onLeave = () => {
      near.current = 1
      apply()
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      near.current = 1
      apply()
    }
  }, [active, apply])

  useEffect(() => {
    if (drawing) holdUntil.current = 0 // a new stroke: the menu is gone at once
    apply()
  }, [drawing, apply])

  // the menu stays for a few seconds after it was used or after something was picked on the map
  useEffect(() => {
    const el = ref.current
    const hold = () => {
      if (useDockFade.getState().drawing) return
      holdUntil.current = performance.now() + HOLD_MS
      window.clearTimeout(holdTimer.current)
      holdTimer.current = window.setTimeout(apply, HOLD_MS + 30)
      apply()
    }
    el?.addEventListener('pointerdown', hold)
    el?.addEventListener('input', hold)
    el?.addEventListener('keydown', hold)
    const unsub = useEditor.subscribe((s, p) => {
      if (s.selectedStationId !== p.selectedStationId || s.activeLineId !== p.activeLineId || s.selectedPoiId !== p.selectedPoiId || s.selectedWaypoint !== p.selectedWaypoint || s.tool !== p.tool || s.lineMode !== p.lineMode) hold()
    })
    return () => {
      el?.removeEventListener('pointerdown', hold)
      el?.removeEventListener('input', hold)
      el?.removeEventListener('keydown', hold)
      unsub()
      window.clearTimeout(holdTimer.current)
    }
  }, [apply])

  return (
    <div ref={ref} className="dock-fade">
      {children}
    </div>
  )
}

export default function Editor() {
  const tab = useEditor((s) => s.tab)
  const editId = useEditor((s) => s.editStationId)
  const shrinking = useEditor((s) => s.shrinkTo !== null)
  const [settings, setSettings] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  // load the station editor (and three.js) on first use, keep it mounted for its exit animation
  const [editorLoaded, setEditorLoaded] = useState(false)
  useEffect(() => {
    if (editId) setEditorLoaded(true)
  }, [editId])

  return (
    <div className="absolute inset-0 overflow-hidden bg-ink">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {tab === 'map' && <MapEditor insets={{ top: 84, bottom: 250 }} />}
          {tab === 'plan' && <PlanView />}
          {tab === 'view3d' && (
            <Suspense fallback={<div className="grid h-full place-items-center text-white/50">3D wird geladen…</div>}>
              <Scene3D />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>

      <WorldSim />
      <TopBar onSettings={() => setSettings(true)} onClock={() => setTimeOpen((o) => !o)} />

      {shrinking ? (
        <ShrinkBar />
      ) : timeOpen ? (
        <TimeDial onClose={() => setTimeOpen(false)} />
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-3 pb-[calc(12px+var(--safe-bottom))]">
          {tab === 'map' && (
            <FadingDock>
              <ToolDock />
            </FadingDock>
          )}
          <TabPill />
        </div>
      )}

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />

      {editorLoaded && (
        <Suspense fallback={null}>
          <StationEditor3D />
        </Suspense>
      )}
    </div>
  )
}
