import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { saveCity } from './persistence/db'
import { flushUploads } from './cloud/sync'
import Menu from './screens/Menu'
import { useEditor } from './store/editorStore'
import Editor from './ui/Editor'
import LoadingScreen from './ui/LoadingScreen'
import { useAuth } from './auth/authStore'

const VehicleGallery = lazy(() => import('./screens/VehicleGallery'))

export default function App() {
  const doc = useEditor((s) => s.doc)
  const screen = useEditor((s) => s.screen)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  useEffect(() => useAuth.getState().init(), [])
  // iOS Safari zooms the whole page on a pinch; the app handles pinching itself
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    for (const n of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(n, stop)
    return () => {
      for (const n of ['gesturestart', 'gesturechange', 'gestureend']) document.removeEventListener(n, stop)
    }
  }, [])
  // loading screen whenever a city is opened: at least a few seconds, and until the editor is on screen
  const [prevScreen, setPrevScreen] = useState(screen)
  const [loading, setLoading] = useState(false)
  // how many of the real loading steps are done (see LOAD_STEPS)
  const [loadDone, setLoadDone] = useState(0)
  if (screen !== prevScreen) {
    setPrevScreen(screen)
    if (screen === 'editor') {
      setLoading(true)
      setLoadDone(1) // the city itself is in the store
    }
  }
  // #fahrzeuge opens the vehicle gallery (also linked from the city list)
  const [gallery, setGallery] = useState(() => location.hash.startsWith('#fahrzeuge'))
  useEffect(() => {
    const onHash = () => setGallery(location.hash.startsWith('#fahrzeuge'))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Autosave (debounced) while editing. The blank placeholder city is never saved from the menu.
  useEffect(() => {
    if (screen !== 'editor') return
    const t = setTimeout(() => void saveCity(doc), 500)
    return () => clearTimeout(t)
  }, [doc, screen])

  // Flush when the app goes to the background (important on iPhone)
  useEffect(() => {
    const onHide = (e: Event) => {
      const st = useEditor.getState()
      if (st.screen === 'editor' && (document.visibilityState === 'hidden' || e.type === 'pagehide')) void saveCity(st.doc).then(() => flushUploads())
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  // Keyboard shortcuts (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink">
      {gallery && (
        <div className="absolute inset-0 z-50">
          <Suspense fallback={null}>
            <VehicleGallery onClose={() => (location.hash = '')} />
          </Suspense>
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {screen === 'menu' ? (
          <motion.div key="menu" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03 }} transition={{ duration: 0.25 }}>
            <Menu />
          </motion.div>
        ) : (
          <motion.div key="editor" className="absolute inset-0" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
            <Editor />
            <ReadyMarker onStep={(n) => setLoadDone((d) => Math.max(d, n))} />
          </motion.div>
        )}
      </AnimatePresence>
      {loading && <LoadingScreen title={doc.name} done={loadDone} minMs={3000} onDone={() => setLoading(false)} />}
    </div>
  )
}

/** Reports the steps of opening: the editor is mounted (2), fonts are loaded (3), the first frames are painted (4). */
function ReadyMarker({ onStep }: { onStep: (n: number) => void }) {
  useEffect(() => {
    let alive = true
    onStep(2)
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve()
    void fonts.then(() => {
      if (!alive) return
      onStep(3)
      requestAnimationFrame(() => requestAnimationFrame(() => alive && onStep(4)))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
