/** Wait this long after the last change before a city goes to the cloud (every further change starts the wait again) */
export const UPLOAD_DEBOUNCE = 1500
/** ...but never keep a city waiting longer than this while the player keeps changing things: long sessions are saved to the cloud on the way */
export const UPLOAD_MAX_WAIT = 15000

/** Milliseconds until the upload of a city, given when its first not yet uploaded change was made. */
export function uploadDelay(firstChangeAt: number, now: number): number {
  return Math.max(0, Math.min(UPLOAD_DEBOUNCE, firstChangeAt + UPLOAD_MAX_WAIT - now))
}
