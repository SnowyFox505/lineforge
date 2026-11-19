import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/authStore'
import { deleteIdea, flushIdeas, ideasAsText, listIdeas, MAX_IDEA, pendingIdeas, setIdeaDone, writeIdea } from '../cloud/ideas'
import type { Idea } from '../cloud/ideas'
import { APP_VERSION } from '../version'
import Icon from './Icon'
import { Segmented, Sheet } from './primitives'

/** A quick note about an idea or a bug: one sentence, send. Everybody's notes are listed below. */
export default function IdeaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Idea['kind']>('idea')
  const [list, setList] = useState<Idea[] | null>(null)
  const [waiting, setWaiting] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setWaiting(pendingIdeas().length)
    if (!user) {
      setList(null)
      return
    }
    try {
      await flushIdeas()
      setWaiting(pendingIdeas().length)
      setList(await listIdeas())
      setNote(null)
    } catch {
      setList(null)
      setNote('Die Liste kann gerade nicht geladen werden (keine Verbindung oder dein Konto darf sie nicht lesen).')
    }
  }, [user])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const send = async () => {
    if (!writeIdea(text, kind, APP_VERSION)) return
    setText('')
    setWaiting(pendingIdeas().length)
    await load()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ideasAsText(list ?? []))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setNote('Kopieren hat nicht geklappt.')
    }
  }

  const openCount = (list ?? []).filter((i) => !i.done).length

  return (
    <Sheet open={open} onClose={onClose} title="Idee oder Fehler melden">
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'idea', label: 'Idee' },
            { value: 'bug', label: 'Fehler' },
          ]}
        />
        <textarea
          className="field min-h-[84px] w-full resize-none"
          value={text}
          maxLength={MAX_IDEA}
          placeholder={kind === 'bug' ? 'Was geht nicht? Ein Satz reicht.' : 'Was wäre cool? Ein Satz reicht.'}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary w-full rounded-2xl py-3 text-sm font-bold disabled:opacity-40" disabled={!text.trim()} onClick={() => void send()}>
          Senden
        </button>
        {waiting > 0 && (
          <p className="text-xs leading-snug text-amber-300">
            {waiting} {waiting === 1 ? 'Notiz wartet' : 'Notizen warten'} auf diesem Gerät{user ? ' und gehen raus, sobald du online bist.' : ': Melde dich an, dann gehen sie raus.'}
          </p>
        )}

        {user && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="eyebrow flex-1">Alle Notizen · {openCount} offen</div>
              <button className="btn-soft rounded-full px-3 py-1.5 text-xs font-semibold" disabled={!openCount} onClick={() => void copy()}>
                {copied ? 'Kopiert' : 'Offene kopieren'}
              </button>
            </div>
            {note && <p className="text-xs text-white/55">{note}</p>}
            {(list ?? []).map((i) => (
              <div key={i.id} className={`flex items-start gap-3 rounded-2xl bg-white/6 p-3 ${i.done ? 'opacity-50' : ''}`}>
                <button
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${i.done ? 'btn-primary border-transparent' : 'border-white/30'}`}
                  aria-label={i.done ? 'Wieder öffnen' : 'Als erledigt markieren'}
                  onClick={() => void setIdeaDone(i.id, !i.done).then(load)}
                >
                  {i.done && <Icon name="check" size={14} stroke={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm leading-snug ${i.done ? 'line-through' : ''}`}>{i.text}</div>
                  <div className="mt-0.5 text-[11px] text-white/45">
                    {i.kind === 'bug' ? 'Fehler' : 'Idee'} · {i.by} · {new Date(i.at).toLocaleDateString('de-DE')} · v{i.version}
                  </div>
                </div>
                <button className="shrink-0 p-1 text-white/40" aria-label="Löschen" onClick={() => void deleteIdea(i.id).then(load)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
            {list && !list.length && <p className="text-xs text-white/45">Noch keine Notizen.</p>}
            <p className="break-all pt-1 text-[10px] text-white/30">Konto-Kennung: {user.uid}</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
