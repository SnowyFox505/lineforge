import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { CityDoc, Pt } from '../model/types'
import { buildRunPaths, drawTrains, lineMetaOf, TrainSim } from './trains2d'

/**
 * The moving trains on top of the 2D map: a second canvas with its own animation loop, so the map itself
 * only repaints when something on it changes. It reads the map's current view (pan and zoom) every frame.
 */
export default function TrainLayer({ view, doc, paths }: { view: MutableRefObject<{ ox: number; oy: number; s: number }>; doc: CityDoc; paths: Record<string, Pt[]> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sim = useRef(new TrainSim())

  useEffect(() => {
    sim.current.setPaths(buildRunPaths(doc, paths), lineMetaOf(doc))
  }, [doc, paths])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!sim.current.trains.length) return
      sim.current.update(dt)
      const v = view.current
      drawTrains(ctx, sim.current, v.ox, v.oy, v.s, w, h)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [view])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}
