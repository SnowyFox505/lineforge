import { useEffect, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { bindNet, netFor, tickWorld, world } from './world'

/**
 * Keeps the world running while a city is open, whichever view is shown.
 * Outside the 3D view the network is rebuilt a moment after the last edit (painting would otherwise rebuild it every stroke).
 */
export default function WorldSim() {
  const doc = useEditor((s) => s.doc)
  const tab = useEditor((s) => s.tab)
  const [netDoc, setNetDoc] = useState(doc)

  useEffect(() => {
    if (tab === 'view3d' || netDoc.id !== doc.id) {
      setNetDoc(doc)
      return
    }
    const id = window.setTimeout(() => setNetDoc(doc), 500)
    return () => window.clearTimeout(id)
  }, [doc, tab, netDoc.id])

  useEffect(() => {
    bindNet(netFor(netDoc), netDoc.id)
  }, [netDoc])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      tickWorld(Math.min(0.1, (now - last) / 1000))
      last = now
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      world.sim = null // closing the city ends its world
    }
  }, [])

  return null
}
