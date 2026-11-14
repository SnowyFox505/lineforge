/** Binary min-heap of (priority, id) pairs, shared by the grid router and the street router. */
export class Heap {
  private f: number[] = []
  private id: number[] = []
  get size() {
    return this.f.length
  }
  push(f: number, id: number) {
    const F = this.f
    const I = this.id
    let i = F.length
    F.push(f)
    I.push(id)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (F[p] <= f) break
      F[i] = F[p]
      I[i] = I[p]
      i = p
    }
    F[i] = f
    I[i] = id
  }
  /** Priority of the smallest entry (Infinity when empty) */
  peek(): number {
    return this.f.length ? this.f[0] : Infinity
  }
  pop(): number {
    const F = this.f
    const I = this.id
    const top = I[0]
    const lf = F.pop()!
    const li = I.pop()!
    const n = F.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && F[c + 1] < F[c]) c++
        if (F[c] >= lf) break
        F[i] = F[c]
        I[i] = I[c]
        i = c
      }
      F[i] = lf
      I[i] = li
    }
    return top
  }
}
