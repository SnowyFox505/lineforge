import { create } from 'zustand'
import type { ZoneKind } from '../model/types'

/**
 * How painted areas (districts, suburbs, forests ...) look on the map and on the 3D ground: how strong the colour is
 * and whether they have an outline. A setting of the app, not of a city.
 */
export type ZoneWeight = 'strong' | 'light'

export interface ZoneLook {
  weight: ZoneWeight
  /** a line around every area */
  outline: boolean
}

const KEY = 'lineforge-zonelook'

function stored(): ZoneLook {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ZoneLook> | null
    return { weight: v?.weight === 'strong' ? 'strong' : 'light', outline: v?.outline === true }
  } catch {
    return { weight: 'light', outline: false }
  }
}

interface ZoneLookState extends ZoneLook {
  setWeight: (w: ZoneWeight) => void
  setOutline: (on: boolean) => void
}

export const useZoneLook = create<ZoneLookState>((set, get) => {
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ weight: get().weight, outline: get().outline }))
    } catch {
      // private mode: the choice is just not remembered
    }
  }
  return {
    ...stored(),
    setWeight: (weight) => {
      set({ weight })
      save()
    },
    setOutline: (outline) => {
      set({ outline })
      save()
    },
  }
})

/** The look right now (for code that paints on canvases) */
export const getZoneLook = (): ZoneLook => {
  const { weight, outline } = useZoneLook.getState()
  return { weight, outline }
}

/** Changes whenever the look changes: pictures that were painted with the old look are repainted */
export const zoneLookKey = (l: ZoneLook = getZoneLook()) => `${l.weight}${l.outline ? '+o' : ''}`

/** The "light" look lets the grass and the streets show through: how much of the area colour stays */
const LIGHT_FILL: Record<ZoneKind, number> = { city: 0.62, suburb: 0.56, airport: 0.9, forest: 0.7, mountain: 0.72 }

/** Opacity of the colour of an area */
export const fillStrength = (kind: ZoneKind, weight: ZoneWeight): number => (weight === 'light' ? LIGHT_FILL[kind] : 1)

/** Colour of the outline around an area */
export const OUTLINE: Record<ZoneKind, string> = {
  city: 'rgba(70,82,98,0.85)',
  suburb: 'rgba(96,108,124,0.8)',
  airport: 'rgba(240,244,248,0.85)',
  forest: 'rgba(12,60,30,0.85)',
  mountain: 'rgba(70,64,56,0.85)',
}
