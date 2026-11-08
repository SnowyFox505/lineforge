import { useEffect, useState } from 'react'
import { useAuth } from '../auth/authStore'
import Icon from './Icon'
import { Segmented, Sheet } from './primitives'

type Tab = 'in' | 'up'

export const WELCOME_KEY = 'lineforge-welcome-seen'

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

/** Sign-in, sign-up, phone login and the profile of a signed-in person. `welcome` is the first-start variant with a guest button. */
export default function AccountSheet({ open, onClose, welcome = false }: { open: boolean; onClose: () => void; welcome?: boolean }) {
  const a = useAuth()
  const [tab, setTab] = useState<Tab>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [adopted, setAdopted] = useState<number | null>(null)
  const [unsynced, setUnsynced] = useState(false)
  const signedIn = a.status === 'user' && a.user

  // signing in worked: remember that the welcome screen has been dealt with
  useEffect(() => {
    if (a.status === 'user') {
      try {
        localStorage.setItem(WELCOME_KEY, '1')
      } catch {
        // private mode: the welcome screen may appear again, which is harmless
      }
    }
  }, [a.status])

  const close = () => {
    a.clearError()
    setResetSent(false)
    setUnsynced(false)
    onClose()
  }

  const guest = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // see above
    }
    close()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tab === 'in') await a.signInEmail(email, password)
    else await a.signUpEmail(name, email, password)
  }

  const title = signedIn ? 'Dein Konto' : welcome ? 'Willkommen bei LineForge' : 'Anmelden'

  return (
    <Sheet open={open} onClose={close} title={title}>
      {signedIn ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-bold text-accent-ink" style={{ background: 'linear-gradient(160deg,#d6fb5c,#9bd21c)' }}>
              {a.user!.photo ? <img src={a.user!.photo} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" /> : a.user!.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">{a.user!.name}</div>
              <div className="truncate text-sm text-white/55">{a.user!.email ?? 'Angemeldet'}</div>
            </div>
          </div>

          <Field label="Anzeigename">
            <div className="flex gap-2">
              <input className="field min-w-0 flex-1" defaultValue={a.user!.name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              <button className="btn-soft rounded-2xl px-4 text-sm" onClick={() => name.trim() && void a.updateName(name)}>
                Speichern
              </button>
            </div>
          </Field>

          <div className="card flex items-center gap-3 rounded-2xl p-3.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.sync === 'error' ? 'bg-red-400' : a.sync === 'syncing' ? 'animate-pulse bg-amber-300' : 'bg-accent'}`} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">{a.sync === 'syncing' ? 'Synchronisiere …' : a.sync === 'error' ? 'Noch nicht synchronisiert' : 'Deine Städte sind in der Cloud'}</div>
              <div className="text-xs text-white/50">{a.sync === 'error' ? 'Keine Verbindung? Es wird später automatisch nachgeholt.' : 'Auf jedem Gerät, auf dem du angemeldet bist.'}</div>
            </div>
            <button className="btn-soft shrink-0 rounded-full px-3.5 py-2 text-xs" onClick={() => void a.syncNow()}>
              Jetzt
            </button>
          </div>

          {a.guestCities > 0 && adopted === null && (
            <div className="card rounded-2xl p-3.5">
              <div className="text-sm font-semibold">
                {a.guestCities} {a.guestCities === 1 ? 'Stadt liegt' : 'Städte liegen'} ohne Konto auf diesem Gerät
              </div>
              <p className="mt-1 text-xs text-white/50">Übernimm sie in dein Konto, dann sind sie überall dabei.</p>
              <button className="btn-primary mt-3 w-full rounded-2xl px-4 py-3 text-sm" onClick={() => void a.adoptLocalCities().then(setAdopted)}>
                In mein Konto übernehmen
              </button>
            </div>
          )}
          {adopted !== null && <p className="text-sm text-accent">{adopted} Stadt/Städte übernommen.</p>}

          {unsynced && <p className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-200">Einige Änderungen sind noch nicht in der Cloud (vielleicht bist du offline). Beim Abmelden gehen sie verloren.</p>}
          <button
            className="btn-soft flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-red-200"
            onClick={async () => {
              const r = await a.signOut(unsynced)
              if (r === 'unsynced') setUnsynced(true)
              else close()
            }}
          >
            {unsynced ? 'Trotzdem abmelden' : 'Abmelden'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {welcome && <p className="text-sm text-white/60">Melde dich an, dann sind deine Städte auf jedem Gerät da. Oder leg direkt los: als Gast bleiben sie auf diesem Gerät.</p>}

          <button
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-[15px] font-semibold text-[#1f1f1f] active:scale-[0.98] disabled:opacity-50"
            disabled={a.busy}
            onClick={() => void a.signInGoogle()}
          >
            <GoogleG /> Mit Google fortfahren
          </button>

          <div className="flex items-center gap-3 text-xs text-white/35">
            <span className="h-px flex-1 bg-white/10" /> oder <span className="h-px flex-1 bg-white/10" />
          </div>

          <Segmented<Tab>
            value={tab}
            onChange={(t) => {
              setTab(t)
              a.clearError()
              setResetSent(false)
            }}
            options={[
              { value: 'in', label: 'Anmelden' },
              { value: 'up', label: 'Neu hier' },
            ]}
          />

          <form onSubmit={submit} className="space-y-3">
            {tab === 'up' && (
              <Field label="Name">
                <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wie sollen wir dich nennen?" autoComplete="name" maxLength={40} />
              </Field>
            )}
            <>
                <Field label="E-Mail">
                  <input className="field w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" autoComplete="email" required />
                </Field>
                <Field label="Passwort">
                  <input className="field w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tab === 'up' ? 'Mindestens 6 Zeichen' : 'Dein Passwort'} autoComplete={tab === 'up' ? 'new-password' : 'current-password'} minLength={6} required />
                </Field>
            </>
            {a.error && <p className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-200">{a.error}</p>}
            {resetSent && <p className="rounded-2xl bg-accent/10 p-3 text-sm text-accent">Wir haben dir eine E-Mail zum Zurücksetzen geschickt.</p>}

            <button type="submit" disabled={a.busy} className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] disabled:opacity-60">
              {a.busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {tab === 'in' ? 'Anmelden' : 'Konto erstellen'}
            </button>

            {tab === 'in' && (
              <button
                type="button"
                className="w-full text-center text-sm text-white/55 underline-offset-4 hover:underline"
                onClick={async () => {
                  if (!email.trim()) return void useAuth.setState({ error: 'Gib oben deine E-Mail ein, dann schicken wir dir den Link.' })
                  setResetSent(await a.resetPassword(email))
                }}
              >
                Passwort vergessen?
              </button>
            )}
          </form>

          {welcome && (
            <button className="btn-soft flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm" onClick={guest}>
              <Icon name="arrow" size={16} /> Als Gast fortfahren
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}
