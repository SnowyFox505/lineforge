import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/authStore'
import Icon from './Icon'
import { Segmented, Sheet } from './primitives'
import { accentFromHue, hueOf, PRESETS, useTheme } from './theme'

type Tab = 'in' | 'up'

export const WELCOME_KEY = 'lineforge-welcome-seen'

const SOFT = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 } as const
const SWAP = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const

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

/** Burst of little lights around a check mark: the "it worked" moment. */
function Celebrate({ headline, sub }: { headline: string; sub: string }) {
  const colors = ['#ff5470', '#3db8ff', '#a6e03c', '#ffc233', '#9a6bff', '#c4f03a', '#ff5470', '#3db8ff']
  return (
    <motion.div className="grid place-items-center py-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} transition={SWAP}>
      <div className="relative grid h-28 w-28 place-items-center">
        {colors.map((c, i) => {
          const a = (i / colors.length) * Math.PI * 2
          return (
            <motion.span
              key={i}
              className="absolute h-2.5 w-2.5 rounded-full"
              style={{ background: c, boxShadow: `0 0 12px ${c}` }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{ x: Math.cos(a) * 54, y: Math.sin(a) * 54, scale: [0, 1.2, 0], opacity: [1, 1, 0] }}
              transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
            />
          )
        })}
        <motion.span className="absolute inset-0 rounded-full border-2 border-accent" initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }} />
        <motion.div
          className="grid h-20 w-20 place-items-center rounded-full"
          style={{ background: 'linear-gradient(160deg,var(--accent-hi),var(--accent-lo))', boxShadow: '0 0 40px rgba(var(--accent-rgb),0.5)' }}
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 16 }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0d1300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.2, ease: 'easeOut' }} />
          </svg>
        </motion.div>
      </div>
      <motion.div className="mt-4 text-xl font-bold tracking-tight" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ...SOFT }}>
        {headline}
      </motion.div>
      <motion.div className="mt-1 text-sm text-white/55" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, ...SOFT }}>
        {sub}
      </motion.div>
    </motion.div>
  )
}

const RAINBOW = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 359].map((h) => accentFromHue(h)).join(', ')})`

/** Four ready-made accent colours (all checked for readability) and a slider for your own. */
function AccentPicker() {
  const accent = useTheme((s) => s.accent)
  const setAccent = useTheme((s) => s.setAccent)
  const save = useAuth((s) => s.saveAccent)
  const isPreset = PRESETS.some((p) => p.hex.toLowerCase() === accent.toLowerCase())
  const [custom, setCustom] = useState(!isPreset)
  const hue = hueOf(accent)
  const pick = (hex: string) => {
    setAccent(hex)
    save(hex)
  }
  return (
    <div>
      <span className="eyebrow mb-2 block">Akzentfarbe</span>
      <div className="flex items-center gap-3">
        {PRESETS.map((p) => {
          const on = !custom && p.hex.toLowerCase() === accent.toLowerCase()
          return (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.85 }}
              aria-label={p.label}
              aria-pressed={on}
              onClick={() => {
                setCustom(false)
                pick(p.hex)
              }}
              className="relative grid h-11 w-11 place-items-center rounded-full"
              style={{ background: p.hex, boxShadow: on ? `0 0 0 2px #11151c, 0 0 0 4px ${p.hex}` : 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
            >
              <AnimatePresence>
                {on && (
                  <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                    <Icon name="check" size={20} stroke={3} className="text-[#0d1300]" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
        <motion.button
          whileTap={{ scale: 0.85 }}
          aria-label="Eigene Farbe"
          aria-pressed={custom}
          onClick={() => {
            setCustom(true)
            pick(accentFromHue(hue))
          }}
          className="relative grid h-11 w-11 place-items-center rounded-full"
          style={{ background: 'conic-gradient(from 0deg, #ff5470, #ffc233, #a6e03c, #17c3b2, #5b7cff, #e055c4, #ff5470)', boxShadow: custom ? '0 0 0 2px #11151c, 0 0 0 4px #fff' : 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
        >
          <AnimatePresence>
            {custom && (
              <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                <Icon name="check" size={20} stroke={3} className="text-white drop-shadow" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {custom && (
          <motion.div key="hue" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
            <div className="pt-4">
              <input
                type="range"
                className="slider hue-slider"
                min={0}
                max={359}
                step={1}
                value={hue}
                aria-label="Farbton"
                style={{ ['--track' as string]: RAINBOW }}
                onChange={(e) => pick(accentFromHue(Number(e.target.value)))}
              />
              <p className="mt-2 text-xs text-white/45">Die Helligkeit passt sich dem Farbton an, damit Schrift immer lesbar bleibt.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const list = { show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: SOFT } }

/** Sign-in, sign-up and the profile of a signed-in person. `welcome` is the first-start variant with a guest button. */
export default function AccountSheet({ open, onClose, welcome = false }: { open: boolean; onClose: () => void; welcome?: boolean }) {
  const a = useAuth()
  const [tab, setTab] = useState<Tab>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [adopted, setAdopted] = useState<number | null>(null)
  const [unsynced, setUnsynced] = useState(false)
  // null, or what was done: signed in / created an account (the name is read live, it can still change a moment later)
  const [celebrate, setCelebrate] = useState<null | 'in' | 'up'>(null)
  const [leaving, setLeaving] = useState(false)
  const signedIn = a.status === 'user' && a.user
  const wasSignedOut = useRef(true)
  const justSignedUp = useRef(false)

  // remember whether the sheet was opened signed out: only then a sign-in is celebrated
  useEffect(() => {
    if (open) wasSignedOut.current = a.status !== 'user'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // signing in worked: remember that the welcome screen has been dealt with, and celebrate
  useEffect(() => {
    if (a.status !== 'user') return
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // private mode: the welcome screen may appear again, which is harmless
    }
    if (open && wasSignedOut.current && a.user) {
      wasSignedOut.current = false
      setCelebrate(justSignedUp.current ? 'up' : 'in')
    }
  }, [a.status, a.user, open])

  // the celebration ends by itself (its own timer: changes of the name in between must not cancel it)
  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(null), 1700)
    return () => clearTimeout(t)
  }, [celebrate])

  const close = () => {
    a.clearError()
    setResetSent(false)
    setUnsynced(false)
    setLeaving(false)
    onClose()
  }

  const guest = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // see above
    }
    setLeaving(true)
    setTimeout(close, 950)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    justSignedUp.current = tab === 'up'
    if (tab === 'in') await a.signInEmail(email, password)
    else await a.signUpEmail(name, email, password)
  }

  const title = celebrate || leaving ? '' : signedIn ? 'Dein Konto' : welcome ? 'Willkommen bei LineForge' : 'Anmelden'
  const view = leaving ? 'guest' : celebrate ? 'celebrate' : signedIn ? 'profile' : 'form'

  return (
    <MotionConfig reducedMotion="user">
      <Sheet open={open} onClose={close} title={title}>
        <AnimatePresence mode="wait" initial={false}>
          {view === 'guest' && <Celebrate key="guest" headline="Los geht's!" sub="Deine Städte bleiben auf diesem Gerät." />}
          {view === 'celebrate' && celebrate && <Celebrate key="celebrate" headline={celebrate === 'up' ? `Willkommen, ${a.user?.name ?? ''}!` : `Schön, dass du da bist, ${a.user?.name ?? ''}!`} sub={celebrate === 'up' ? 'Dein Konto ist startklar.' : 'Deine Städte werden geholt …'} />}

          {view === 'profile' && (
            <motion.div key="profile" variants={list} initial="hidden" animate="show" exit={{ opacity: 0, y: -10, transition: SWAP }} className="space-y-5">
              <motion.div variants={rise} className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-bold text-accent-ink" style={{ background: 'linear-gradient(160deg,var(--accent-hi),var(--accent-lo))' }}>
                  {a.user!.photo ? <img src={a.user!.photo} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" /> : a.user!.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">{a.user!.name}</div>
                  <div className="truncate text-sm text-white/55">{a.user!.email ?? 'Angemeldet'}</div>
                </div>
              </motion.div>

              <motion.div variants={rise}>
                <Field label="Anzeigename">
                  <div className="flex gap-2">
                    <input className="field min-w-0 flex-1" defaultValue={a.user!.name} onChange={(e) => setName(e.target.value)} maxLength={40} />
                    <motion.button whileTap={{ scale: 0.94 }} className="btn-soft rounded-2xl px-4 text-sm" onClick={() => name.trim() && void a.updateName(name)}>
                      Speichern
                    </motion.button>
                  </div>
                </Field>
              </motion.div>

              <motion.div variants={rise}>
                <AccentPicker />
              </motion.div>

              <motion.div variants={rise} className="card flex items-center gap-3 rounded-2xl p-3.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.sync === 'error' ? 'bg-red-400' : a.sync === 'syncing' ? 'animate-pulse bg-amber-300' : 'bg-accent'}`} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">{a.sync === 'syncing' ? 'Synchronisiere …' : a.sync === 'error' ? 'Noch nicht synchronisiert' : 'Deine Städte sind in der Cloud'}</div>
                  <div className="text-xs text-white/50">{a.sync === 'error' ? 'Keine Verbindung? Es wird später automatisch nachgeholt.' : 'Auf jedem Gerät, auf dem du angemeldet bist.'}</div>
                </div>
                <motion.button whileTap={{ scale: 0.92 }} className="btn-soft shrink-0 rounded-full px-3.5 py-2 text-xs" onClick={() => void a.syncNow()}>
                  Jetzt
                </motion.button>
              </motion.div>

              <AnimatePresence initial={false}>
                {a.guestCities > 0 && adopted === null && (
                  <motion.div key="adopt" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
                    <div className="card rounded-2xl p-3.5">
                      <div className="text-sm font-semibold">
                        {a.guestCities} {a.guestCities === 1 ? 'Stadt liegt' : 'Städte liegen'} ohne Konto auf diesem Gerät
                      </div>
                      <p className="mt-1 text-xs text-white/50">Übernimm sie in dein Konto, dann sind sie überall dabei.</p>
                      <motion.button whileTap={{ scale: 0.97 }} className="btn-primary mt-3 w-full rounded-2xl px-4 py-3 text-sm" onClick={() => void a.adoptLocalCities().then(setAdopted)}>
                        In mein Konto übernehmen
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {adopted !== null && (
                  <motion.p key="adopted" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-accent">
                    {adopted} Stadt/Städte übernommen.
                  </motion.p>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {unsynced && (
                  <motion.p key="unsynced" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-2xl bg-red-500/10 text-sm text-red-200">
                    <span className="block p-3">Einige Änderungen sind noch nicht in der Cloud (vielleicht bist du offline). Beim Abmelden gehen sie verloren.</span>
                  </motion.p>
                )}
              </AnimatePresence>
              <motion.button
                variants={rise}
                whileTap={{ scale: 0.97 }}
                className="btn-soft flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-red-200"
                onClick={async () => {
                  const r = await a.signOut(unsynced)
                  if (r === 'unsynced') setUnsynced(true)
                  else close()
                }}
              >
                {unsynced ? 'Trotzdem abmelden' : 'Abmelden'}
              </motion.button>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div key="form" variants={list} initial="hidden" animate="show" exit={{ opacity: 0, y: -10, transition: SWAP }} className="space-y-4">
              {welcome && (
                <motion.p variants={rise} className="text-sm text-white/60">
                  Melde dich an, dann sind deine Städte auf jedem Gerät da. Oder leg direkt los: als Gast bleiben sie auf diesem Gerät.
                </motion.p>
              )}

              <motion.button
                variants={rise}
                whileTap={{ scale: 0.97 }}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-[15px] font-semibold text-[#1f1f1f] disabled:opacity-50"
                disabled={a.busy}
                onClick={() => {
                  justSignedUp.current = false
                  void a.signInGoogle()
                }}
              >
                <GoogleG /> Mit Google fortfahren
              </motion.button>

              <motion.div variants={rise} className="flex items-center gap-3 text-xs text-white/35">
                <span className="h-px flex-1 bg-white/10" /> oder <span className="h-px flex-1 bg-white/10" />
              </motion.div>

              <motion.div variants={rise}>
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
              </motion.div>

              <motion.form variants={rise} onSubmit={submit} layout="position" className="space-y-3">
                {/* the name field flies in from the right when you go to "Neu hier" and flies back out when you return */}
                <AnimatePresence initial={false}>
                  {tab === 'up' && (
                    <motion.div
                      key="name"
                      initial={{ height: 0, opacity: 0, x: 70 }}
                      animate={{ height: 'auto', opacity: 1, x: 0 }}
                      exit={{ height: 0, opacity: 0, x: 70 }}
                      transition={SOFT}
                      style={{ overflow: 'hidden', margin: '-4px', padding: '4px' }}
                    >
                      <div className="pb-3">
                        <Field label="Name">
                          <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wie sollen wir dich nennen?" autoComplete="name" maxLength={40} />
                        </Field>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Field label="E-Mail">
                  <input className="field w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" autoComplete="email" required />
                </Field>
                <Field label="Passwort">
                  <input className="field w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tab === 'up' ? 'Mindestens 6 Zeichen' : 'Dein Passwort'} autoComplete={tab === 'up' ? 'new-password' : 'current-password'} minLength={6} required />
                </Field>

                <AnimatePresence initial={false}>
                  {a.error && (
                    <motion.p
                      key={a.error}
                      initial={{ opacity: 0, height: 0, x: 0 }}
                      animate={{ opacity: 1, height: 'auto', x: [0, -9, 8, -5, 3, 0] }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ height: SOFT, opacity: { duration: 0.2 }, x: { duration: 0.45, delay: 0.1 } }}
                      className="overflow-hidden rounded-2xl bg-red-500/10 text-sm text-red-200"
                    >
                      <span className="block p-3">{a.error}</span>
                    </motion.p>
                  )}
                  {resetSent && (
                    <motion.p key="reset" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-2xl bg-accent/10 text-sm text-accent">
                      <span className="block p-3">Wir haben dir eine E-Mail zum Zurücksetzen geschickt.</span>
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={a.busy} className="btn-primary flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3.5 text-[15px] disabled:opacity-60">
                  <AnimatePresence initial={false}>
                    {a.busy && <motion.span key="spin" initial={{ width: 0, opacity: 0 }} animate={{ width: 16, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="h-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                  </AnimatePresence>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.16 }}>
                      {tab === 'in' ? 'Anmelden' : 'Konto erstellen'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>

                <AnimatePresence initial={false}>
                  {tab === 'in' && (
                    <motion.button
                      key="forgot"
                      type="button"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="block w-full overflow-hidden text-center text-sm text-white/55 underline-offset-4 hover:underline"
                      onClick={async () => {
                        if (!email.trim()) return void useAuth.setState({ error: 'Gib oben deine E-Mail ein, dann schicken wir dir den Link.' })
                        setResetSent(await a.resetPassword(email))
                      }}
                    >
                      <span className="block py-1">Passwort vergessen?</span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.form>

              {welcome && (
                <motion.button variants={rise} whileTap={{ scale: 0.97 }} className="btn-soft flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm" onClick={guest}>
                  <Icon name="arrow" size={16} /> Als Gast fortfahren
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Sheet>
    </MotionConfig>
  )
}
