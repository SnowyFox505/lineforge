import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { saveCity } from './persistence/db'
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
  const [ready, setReady] = useState(false)
  if (screen !== prevScreen) {
    setPrevScreen(screen)
    if (screen === 'editor') {
      setLoading(true)
      setReady(false)
    }
  }
  // #fahrzeuge opens the vehicle gallery (also linked from the city list)
  const [gallery, setGallery] = useState(() => location.hash === '#fahrzeuge')
  useEffect(() => {
    const onHash = () => setGallery(location.hash === '#fahrzeuge')
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
    const onHide = () => {
      const st = useEditor.getState()
      if (st.screen === 'editor' && document.visibilityState === 'hidden') void saveCity(st.doc)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
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
            <ReadyMarker onReady={() => setReady(true)} />
          </motion.div>
        )}
      </AnimatePresence>
      {loading && <LoadingScreen title={doc.name} ready={ready} minMs={3000} onDone={() => setLoading(false)} />}
    </div>
  )
}

/** Reports once the editor has been mounted and painted (fonts loaded, two frames drawn). */
function ReadyMarker({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let alive = true
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve()
    void fonts.then(() => requestAnimationFrame(() => requestAnimationFrame(() => alive && onReady())))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
