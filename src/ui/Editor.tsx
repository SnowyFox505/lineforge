import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import MapEditor from '../editor2d/MapEditor'
import { saveCity } from '../persistence/db'
import PlanView from '../plan/PlanView'
import { useEditor } from '../store/editorStore'
import type { Tab } from '../store/editorStore'
import Icon from './Icon'
import type { IconName } from './Icon'
import { spring } from './primitives'
import SettingsSheet from './SettingsSheet'
import ToolDock from './ToolDock'

// three.js is large; only load it when the 3D tab is opened.
const Scene3D = lazy(() => import('../view3d/Scene3D'))
const StationEditor3D = lazy(() => import('../view3d/StationEditor3D'))

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'map', label: 'Karte', icon: 'map' },
  { id: 'plan', label: 'Netzplan', icon: 'plan' },
  { id: 'view3d', label: '3D', icon: 'cube' },
]

function TopBar({ onSettings }: { onSettings: () => void }) {
  const doc = useEditor((s) => s.doc)
  const tab = useEditor((s) => s.tab)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const setScreen = useEditor((s) => s.setScreen)
  const stations = Object.keys(doc.stations).length
  const lines = Object.keys(doc.lines).length

  const back = async () => {
    await saveCity(useEditor.getState().doc)
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

export default function Editor() {
  const tab = useEditor((s) => s.tab)
  const editId = useEditor((s) => s.editStationId)
  const [settings, setSettings] = useState(false)
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

      <TopBar onSettings={() => setSettings(true)} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-3 pb-[calc(12px+var(--safe-bottom))]">
        {tab === 'map' && <ToolDock />}
        <TabPill />
      </div>

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />

      {editorLoaded && (
        <Suspense fallback={null}>
          <StationEditor3D />
        </Suspense>
      )}
    </div>
  )
}
