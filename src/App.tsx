import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { saveCity } from './persistence/db'
import Menu from './screens/Menu'
import { useEditor } from './store/editorStore'
import Editor from './ui/Editor'

const VehicleGallery = lazy(() => import('./screens/VehicleGallery'))

export default function App() {
  const doc = useEditor((s) => s.doc)
  const screen = useEditor((s) => s.screen)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
