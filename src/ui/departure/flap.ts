/**
 * One tile of a split-flap display. The drum only turns forwards: to show another character it flips through every character
 * in between, like the real thing. No drawing in here.
 */
export const RING = ' ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789.-:'

/** at most this many flips are shown for one change (a real drum would turn for ages, the rest is skipped) */
const MAX_FLIPS = 14

export class Flap {
  /** the character that is showing (the old one while a flip is running) */
  cur = ' '
  /** the character that is flipping in, null when the tile is at rest */
  next: string | null = null
  /** progress of the running flip, 0..1 */
  p = 0
  target = ' '
  private queue: string[] = []
  private wait = 0
  private flipT: number

  /** `flipsPerSecond`: how fast the drum turns */
  constructor(flipsPerSecond = 15, initial = ' ') {
    this.flipT = 1 / flipsPerSecond
    this.cur = initial
    this.target = initial
  }

  /** the last character that is or will be showing before `target` */
  private lastShown(): string {
    return this.queue.length ? this.queue[this.queue.length - 1] : (this.next ?? this.cur)
  }

  /** Show `target` after `delay` seconds. `spins` extra characters are turned through first (a more lively start). */
  set(target: string, delay = 0, spins = 0) {
    const t = RING.includes(target) ? target : ' '
    if (t === this.target && !this.next && !this.queue.length) return
    this.target = t
    let i = RING.indexOf(this.lastShown())
    const path: string[] = []
    for (let s = 0; s < spins; s++) {
      i = (i + 1) % RING.length
      path.push(RING[i])
    }
    do {
      i = (i + 1) % RING.length
      path.push(RING[i])
    } while (RING[i] !== t)
    this.queue = path.slice(-MAX_FLIPS)
    this.wait = Math.max(0, delay)
  }

  /** true when the tile shows its target and nothing is turning */
  get settled(): boolean {
    return this.next === null && this.queue.length === 0 && this.wait <= 0
  }

  step(dt: number) {
    if (this.wait > 0) {
      this.wait -= dt
      if (this.wait > 0) return
      dt = -this.wait
      this.wait = 0
    }
    while (dt > 0) {
      if (this.next === null) {
        const n = this.queue.shift()
        if (n === undefined) return
        this.next = n
        this.p = 0
      }
      const need = (1 - this.p) * this.flipT
      if (dt >= need) {
        dt -= need
        this.cur = this.next
        this.next = null
        this.p = 0
      } else {
        this.p += dt / this.flipT
        dt = 0
      }
    }
  }
}

/** a row of tiles showing `text`, padded with blanks to `n` tiles */
export function padTo(text: string, n: number): string[] {
  return text.toUpperCase().padEnd(n, ' ').slice(0, n).split('')
}
