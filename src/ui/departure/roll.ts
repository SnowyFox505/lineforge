/**
 * A piece of text on the display that changes by rolling: the old text slides up and fades out while the new one comes in
 * from below. It waits for its delay, then needs `DUR` seconds. A change that arrives while it rolls is taken afterwards.
 */
export const ROLL_DUR = 0.5

export class Roll {
  cur = ''
  next: string | null = null
  /** 0..1 progress of the roll that is running */
  p = 0
  target = ''
  private wait = 0

  set(text: string, delay = 0) {
    if (text === this.target) return
    this.target = text
    this.wait = delay
  }

  /** shows the text at once, without rolling */
  jump(text: string) {
    this.cur = text
    this.target = text
    this.next = null
    this.p = 0
    this.wait = 0
  }

  step(dt: number) {
    if (this.next === null && this.target !== this.cur) {
      this.wait -= dt
      if (this.wait > 0) return
      this.next = this.target
      this.p = 0
      return
    }
    if (this.next !== null) {
      this.p += dt / ROLL_DUR
      if (this.p >= 1) {
        this.cur = this.next
        this.next = null
        this.p = 0
      }
    }
  }

  get settled(): boolean {
    return this.next === null && this.cur === this.target
  }
}

/** the characters of a text, upper or lower case as it is, padded with spaces or cut to `n` places */
export function padTo(text: string, n: number): string[] {
  const chars = [...text]
  while (chars.length < n) chars.push(' ')
  return chars.slice(0, n)
}
