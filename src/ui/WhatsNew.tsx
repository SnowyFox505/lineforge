import type { Release } from '../changelog'
import { APP_STAGE } from '../version'
import { Sheet } from './primitives'

const date = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
const when = (iso: string) => date.format(new Date(`${iso}T12:00:00`))

/** The patch notes in plain words: what is new, how it works, what you get from it. */
export default function WhatsNew({ open, releases, onClose, title = 'Das ist neu' }: { open: boolean; releases: Release[]; onClose: () => void; title?: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-6">
        {releases.map((r) => (
          <section key={r.version}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-bold">
                {APP_STAGE} {r.version}
              </span>
              <span className="text-xs text-white/45">{when(r.date)}</span>
            </div>
            <p className="mt-0.5 text-sm text-white/65">{r.headline}</p>
            <div className="mt-3 space-y-3">
              {r.changes.map((c) => (
                <article key={c.title} className="rounded-2xl bg-white/5 p-3.5">
                  <h3 className="text-[15px] font-bold leading-tight">{c.title}</h3>
                  <p className="mt-1.5 text-sm leading-snug text-white/80">{c.what}</p>
                  <dl className="mt-2 space-y-1.5 text-[13px] leading-snug">
                    <div>
                      <dt className="eyebrow">So geht’s</dt>
                      <dd className="text-white/70">{c.how}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Das bringt dir</dt>
                      <dd className="text-white/70">{c.benefit}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <button className="btn-primary mt-5 w-full rounded-2xl py-3 text-base font-bold" onClick={onClose}>
        Verstanden
      </button>
    </Sheet>
  )
}
