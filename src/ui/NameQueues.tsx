import { useState } from 'react'
import { emptyQueues, NAME_KINDS } from '../model/names'
import type { NameKind, NameQueues as Queues } from '../model/names'
import Icon from './Icon'
import { Segmented } from './primitives'

/** Names are separated by commas, semicolons or new lines */
export function parseNames(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean)
}

/**
 * The wish lists for new names: type names you like (several at once with commas), the first name in a list is
 * used for the next new district, suburb, water or landscape. What is left over stays in the list.
 */
export default function NameQueuesEditor({ value, onChange }: { value: Partial<Queues> | undefined; onChange: (q: Queues) => void }) {
  const [kind, setKind] = useState<NameKind>('district')
  const [text, setText] = useState('')
  const queues: Queues = { ...emptyQueues(), ...(value ?? {}) }
  const list = queues[kind]
  const info = NAME_KINDS.find((k) => k.kind === kind)!
  const set = (names: string[]) => onChange({ ...queues, [kind]: names })
  const add = () => {
    const added = parseNames(text).filter((n) => !list.some((l) => l.toLowerCase() === n.toLowerCase()))
    if (added.length) set([...list, ...added])
    setText('')
  }
  return (
    <div className="space-y-3">
      <Segmented value={kind} onChange={setKind} options={NAME_KINDS.map((k) => ({ value: k.kind, label: k.label, sub: queues[k.kind].length ? String(queues[k.kind].length) : undefined }))} />
      <p className="text-xs text-white/50">{info.hint}</p>
      <div className="flex gap-2">
        <input
          className="field min-w-0 flex-1"
          placeholder="z. B. Wittenau, Leckenberg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button className="btn-soft shrink-0 rounded-2xl px-4 text-sm font-semibold" onClick={add} disabled={!text.trim()}>
          Hinzufügen
        </button>
      </div>
      {list.length > 0 ? (
        <ol className="flex flex-wrap gap-2">
          {list.map((n, i) => (
            <li key={n} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1 text-sm">
              <span className="text-xs tabular-nums text-white/40">{i + 1}.</span>
              {n}
              <button className="grid h-6 w-6 place-items-center rounded-full bg-white/10" onClick={() => set(list.filter((_, k) => k !== i))} aria-label={`${n} entfernen`}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-white/35">Noch keine Wünsche: die Namen werden zufällig gewählt.</p>
      )}
    </div>
  )
}
