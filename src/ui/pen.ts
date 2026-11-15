import { create } from 'zustand'

/**
 * Pen mode (iPad with Apple Pencil): the pen draws, fingers only move and zoom the map. "Automatic" switches it on
 * the first time a pen touches the screen (and keeps it on), so nobody has to look for a setting.
 */
export type PenMode = 'auto' | 'on' | 'off'

const MODE_KEY = 'lineforge-pen'
const SEEN_KEY = 'lineforge-pen-seen'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode: the choice is just not remembered
  }
}

interface PenState {
  mode: PenMode
  /** a pen has been used on this device */
  seen: boolean
  setMode: (mode: PenMode) => void
  /** call with every pointer event that comes from a pen */
  markSeen: () => void
}

const storedMode = (): PenMode => {
  const v = read(MODE_KEY)
  return v === 'on' || v === 'off' || v === 'auto' ? v : 'auto'
}

export const usePen = create<PenState>((set, get) => ({
  mode: storedMode(),
  seen: read(SEEN_KEY) === '1',
  setMode: (mode) => {
    write(MODE_KEY, mode)
    set({ mode })
  },
  markSeen: () => {
    if (get().seen) return
    write(SEEN_KEY, '1')
    set({ seen: true })
  },
}))

/** Is pen mode on right now? */
export const penActive = (s: Pick<PenState, 'mode' | 'seen'> = usePen.getState()): boolean => s.mode === 'on' || (s.mode === 'auto' && s.seen)

/** What a touch on the map does: the pen (and the mouse) use the tool, a finger only moves the map when pen mode is on. */
export type PointerRole = 'tool' | 'move'

export function pointerRole(pointerType: string, penMode: boolean): PointerRole {
  return penMode && pointerType === 'touch' ? 'move' : 'tool'
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __pen: unknown }).__pen = usePen
