import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { world } from '../sim/world'
import type { CityDoc, Pt } from '../model/types'
import { buildRunPaths, drawTrains, viewsOf } from './trains2d'
import type { RunPath } from './trains2d'

/**
 * The moving trains on top of the 2D map: a second canvas with its own animation loop, so the map itself
 * only repaints when something on it changes. The trains are those of the world simulation (the same as in 3D);
 * this layer only reads where they are and puts them on the lines, using the map's current view (pan and zoom).
 */
export default function TrainLayer({ view, doc, paths }: { view: MutableRefObject<{ ox: number; oy: number; s: number }>; doc: CityDoc; paths: Record<string, Pt[]> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runs = useRef<Record<string, RunPath>>({})

  useEffect(() => {
    runs.current = buildRunPaths(doc, paths)
  }, [doc, paths])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
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
      if (!world.sim) return
      const v = view.current
      drawTrains(ctx, viewsOf(world.sim, runs.current), runs.current, v.ox, v.oy, v.s, w, h)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [view])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}
