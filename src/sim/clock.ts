/**
 * Game time: one real minute is one hour in the game (so a day lasts 24 real minutes). Game time is counted in minutes
 * since midnight of day 1, as a plain number.
 */
export const GAME_MINUTES_PER_SECOND = 1
/** A new city starts at eight in the morning */
export const GAME_START = 8 * 60

/** The running game time of the city that is open (`cityId`), in minutes. It is saved with the city (see saveCity). */
export const gameTime: { cityId: string; minutes: number } = { cityId: '', minutes: GAME_START }

/** Start the clock of a city that was just opened, at the time saved with it (or in the morning for a new one). */
export function startGameTime(cityId: string, saved?: number) {
  gameTime.cityId = cityId
  gameTime.minutes = typeof saved === 'number' && Number.isFinite(saved) ? saved : GAME_START
}

/** Minutes since midnight of the current day (0..1440) */
export function minuteOfDay(clock: number): number {
  return ((clock % 1440) + 1440) % 1440
}

/** "08:05" */
export function formatClock(clock: number): string {
  const m = Math.floor(minuteOfDay(clock))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Angles of the clock hands in turns (0..1, clockwise from twelve o'clock): the hour hand moves with the minutes. */
export function clockHands(clock: number): { hour: number; minute: number } {
  const m = minuteOfDay(clock)
  return { hour: (m % 720) / 720, minute: (m % 60) / 60 }
}

// ---- the sun -----------------------------------------------------------------------------

/** Sunrise and sunset in minutes of the day: a day of twelve hours */
export const SUNRISE = 6 * 60
export const SUNSET = 18 * 60

export interface SunState {
  /** angle round the sky: 0 at sunrise in the east, a half turn at sunset in the west, then the moon's way back */
  angle: number
  /** height of the sun above the horizon (-1..1): negative at night */
  elevation: number
  /** how bright the day is (0 = night, 1 = day), with a smooth twilight */
  daylight: number
  /** how much of a dawn / dusk glow there is (1 right at the horizon, 0 high or deep below) */
  glow: number
  /** unit vector towards the sun (x east, y up, z a fixed tilt so shadows are not cast along one axis) */
  dir: { x: number; y: number; z: number }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Where the sun is and how bright it is at a game time. */
export function sunAt(clock: number): SunState {
  const m = minuteOfDay(clock)
  const angle = (((m - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI + 2 * Math.PI) % (2 * Math.PI)
  const elevation = Math.sin(angle)
  const daylight = smooth(-0.25, 0.3, elevation)
  const glow = Math.exp(-((elevation / 0.2) ** 2))
  const x = Math.cos(angle)
  const y = elevation
  const z = 0.35
  const l = Math.hypot(x, y, z)
  return { angle, elevation, daylight, glow, dir: { x: x / l, y: y / l, z: z / l } }
}
