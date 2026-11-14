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
