import type { CityDoc } from '../model/types'
import { buildNetwork3D } from '../view3d/network3d'
import type { Network3D } from '../view3d/network3d'
import { Sim } from '../view3d/trainSim'
import { gameTime, GAME_MINUTES_PER_SECOND, startGameTime } from './clock'

// ---------------------------------------------------------------------------
// The world that runs while a city is open
//
// One simulation of all trains, shared by every view: the 2D map, the network plan and the 3D model only read it.
// It keeps running when you switch views, so a train is at the same place in all of them.
// ---------------------------------------------------------------------------

const nets = new WeakMap<CityDoc, Network3D>()

/** The 3D network of a document (built once per document, shared by the simulation and the 3D scene). */
export function netFor(doc: CityDoc): Network3D {
  let n = nets.get(doc)
  if (!n) {
    n = buildNetwork3D(doc)
    nets.set(doc, n)
  }
  return n
}

export const SPEEDS = [1, 2, 4]

export const world: {
  sim: Sim | null
  /** index into SPEEDS, and whether time runs at all */
  speedIdx: number
  running: boolean
  /** the id of the city the simulation belongs to */
  cityId: string
} = { sim: null, speedIdx: 0, running: true, cityId: '' }

/** Make the simulation use `net`: a new city starts afresh, a changed network keeps its trains where they are. */
export function bindNet(net: Network3D, cityId: string, savedClock?: number): Sim {
  const cur = world.sim
  if (cur && cur.net === net) return cur
  const next = new Sim(net)
  if (cur && world.cityId === cityId) next.carryOver(cur)
  world.sim = next
  // game time (see sim/clock): a new city starts in the morning, a saved one at the time it was left
  if (gameTime.cityId !== cityId) startGameTime(cityId, savedClock)
  world.cityId = cityId
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __sim: unknown }).__sim = next
  return next
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __world: unknown }).__world = world

export function worldSpeed(): number {
  return world.running ? SPEEDS[world.speedIdx] : 0
}

/** Advance time. The caller clamps `dt`. */
export function tickWorld(dt: number) {
  if (world.sim) world.sim.update(dt * worldSpeed())
  // a real minute is a game hour; it follows the pause and the speed of the world
  gameTime.minutes += dt * worldSpeed() * GAME_MINUTES_PER_SECOND
}
