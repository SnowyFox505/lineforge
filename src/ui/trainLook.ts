import { create } from 'zustand'

/**
 * Whether trains are painted in the colour of their line. Off by default: a train keeps the colours of the real train it is
 * modelled on (the destination display still shows the line in its colour). A setting of the app, not of a city.
 */
const KEY = 'lineforge-trainlook'

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === 'line'
  } catch {
    return false
  }
}

interface TrainLookState {
  /** paint trains in the line colour */
  tint: boolean
  setTint: (on: boolean) => void
}

export const useTrainLook = create<TrainLookState>((set) => ({
  tint: stored(),
  setTint: (tint) => {
    set({ tint })
    try {
      localStorage.setItem(KEY, tint ? 'line' : 'original')
    } catch {
      // private mode: the choice is just not remembered
    }
  },
}))
