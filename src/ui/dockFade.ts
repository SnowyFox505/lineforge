import { create } from 'zustand'

/**
 * Whether a finger / pen is drawing on the map right now. The bottom menu fades out meanwhile
 * (on a desktop it fades with the mouse's distance instead, see BottomBar in Editor).
 */
export const useDockFade = create<{ drawing: boolean; setDrawing: (v: boolean) => void }>((set, get) => ({
  drawing: false,
  setDrawing: (v) => {
    if (get().drawing !== v) set({ drawing: v })
  },
}))

/** Distance of a point to a rectangle (0 inside) */
export function distToRect(x: number, y: number, r: { left: number; right: number; top: number; bottom: number }): number {
  const dx = Math.max(r.left - x, 0, x - r.right)
  const dy = Math.max(r.top - y, 0, y - r.bottom)
  return Math.hypot(dx, dy)
}

/** Distance (px) at which the menu starts to fade, and the opacity it keeps right at the mouse */
export const FADE_REACH = 190
export const FADE_MIN = 0.12

/** Opacity of the menu for a mouse `d` pixels away from it: full far away, fading smoothly as the cursor comes closer. */
export function fadeOpacity(d: number): number {
  const t = Math.min(1, Math.max(0, d / FADE_REACH))
  const s = t * t * (3 - 2 * t)
  return FADE_MIN + (1 - FADE_MIN) * s
}
