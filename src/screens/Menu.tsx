import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { renderThumb } from '../editor2d/thumbnail'
import { MAP_SIZES } from '../model/constants'
import type { CityDoc, GameMode } from '../model/types'
import { exportCityJson, importCityJson, listCityDocs, saveCity } from '../persistence/db'
import { useEditor } from '../store/editorStore'
import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { Segmented, spring } from '../ui/primitives'
import AccountSheet, { WELCOME_KEY } from '../ui/AccountSheet'
import UpdateOverlay from '../ui/UpdateOverlay'
import { useAuth } from '../auth/authStore'
import { downloadBlob, MODE_INFO } from '../ui/SettingsSheet'
import MenuBackdrop from './MenuBackdrop'

type View = 'home' | 'new' | 'cities'
interface Saved {
  id: string
  name: string
  updatedAt: number
  doc: CityDoc
}

const NAMES = ['Neustadt', 'Hafenburg', 'Seeheim', 'Flussau', 'Kupferstadt', 'Bergwerda', 'Nordhafen', 'Lindenau', 'Eisenach-Süd', 'Rotterfeld']

const rel = new Intl.RelativeTimeFormat('de', { numeric: 'auto' })
function ago(ts: number) {
  const m = Math.round((ts - Date.now()) / 60000)
  if (Math.abs(m) < 60) return rel.format(m, 'minute')
  const h = Math.round(m / 60)
  if (Math.abs(h) < 48) return rel.format(h, 'hour')
  return rel.format(Math.round(h / 24), 'day')
}

function Logo({ size = 46 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-[14px]"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(160deg, #d6fb5c, #9bd21c)',
        boxShadow: '0 10px 30px -6px rgba(196,240,58,0.6), inset 0 1px 0 rgba(255,255,255,0.55)',
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#0d1300" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17h6l4-5h8" />
        <path d="M3 7h5l3 3" />
        <circle cx="21" cy="12" r="1.2" fill="#0d1300" />
        <circle cx="3" cy="7" r="1.2" fill="#0d1300" />
      </svg>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass grid h-12 w-12 place-items-center rounded-full active:scale-90" aria-label="Zurück">
      <Icon name="back" />
    </button>
  )
}

function Home({ latest, count, go, onContinue }: { latest?: Saved; count: number; go: (v: View) => void; onContinue: () => void }) {
  const [updating, setUpdating] = useState(false)
  const [account, setAccount] = useState(false)
  const [welcome, setWelcome] = useState(false)
  const status = useAuth((s) => s.status)
  const user = useAuth((s) => s.user)
  const sync = useAuth((s) => s.sync)

  // first start with accounts available: offer to sign in (or continue as guest) once
  useEffect(() => {
    if (status !== 'guest') return
    let seen = false
    try {
      seen = localStorage.getItem(WELCOME_KEY) === '1'
    } catch {
      // storage blocked: skip the welcome screen
      seen = true
    }
    if (!seen) {
      setWelcome(true)
      setAccount(true)
    }
  }, [status])
  const item = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: spring },
  }
  return (
    <motion.div
      className="relative z-10 flex h-full flex-col justify-between px-6 pb-[calc(28px+var(--safe-bottom))] pt-[calc(56px+var(--safe-top))] md:pl-[9vw] md:pt-[8vh]"
      variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } }}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -12, transition: { duration: 0.18 } }}
    >
      <div className="absolute right-5 top-[calc(20px+var(--safe-top))] z-20 flex items-center gap-2 md:right-[5vw] md:top-[5vh]">
        {status !== 'off' && (
          <motion.button
            variants={item}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              setWelcome(false)
              setAccount(true)
            }}
            className="glass flex max-w-[9.5rem] items-center gap-2 rounded-full py-2 pl-2 pr-4 text-[13px] font-semibold"
            aria-label={user ? 'Konto' : 'Anmelden'}
          >
            <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">
              {user ? user.name.slice(0, 1).toUpperCase() : <Icon name="user" size={16} />}
              {user && <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0f131b] ${sync === 'error' ? 'bg-red-400' : sync === 'syncing' ? 'bg-amber-300' : 'bg-accent'}`} />}
            </span>
            <span className="truncate">{user ? user.name : 'Anmelden'}</span>
          </motion.button>
        )}
        {/* update: clears the offline copy and loads the newest version (saved cities stay) */}
        <motion.button variants={item} whileTap={{ scale: 0.94 }} onClick={() => setUpdating(true)} className="glass flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-semibold" aria-label="App aktualisieren">
          <Icon name="refresh" size={16} stroke={2.2} />
          <span className="hidden min-[360px]:inline">Aktualisieren</span>
        </motion.button>
      </div>
      {updating && <UpdateOverlay />}
      <AccountSheet open={account} onClose={() => setAccount(false)} welcome={welcome && !user} />

      <div>
        <motion.div variants={item}>
          <Logo />
        </motion.div>
        <motion.div variants={item} className="eyebrow mt-6">
          Netzplan-Studio
        </motion.div>
        <motion.h1 variants={item} className="mt-2 text-[68px] font-bold leading-[0.88] tracking-[-0.045em] md:text-[88px]">
          Line
          <br />
          <span className="text-accent" style={{ textShadow: '0 0 40px rgba(196,240,58,0.35)' }}>
            Forge
          </span>
        </motion.h1>
        <motion.p variants={item} className="mt-5 max-w-[19rem] text-[17px] leading-snug text-white/65">
          Gründe fiktive Städte und zeichne ihre Liniennetze – von der S-Bahn bis zum Fernverkehr.
        </motion.p>
      </div>

      <div className="mx-auto w-full max-w-md space-y-3 md:mx-0">
        <motion.button
          variants={item}
          whileTap={{ scale: 0.97 }}
          onClick={latest ? onContinue : () => go('new')}
          className="btn-primary flex w-full items-center gap-4 rounded-[26px] p-4 text-left"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0d1300] text-accent">
            <Icon name={latest ? 'play' : 'plus'} size={22} stroke={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold leading-tight">{latest ? 'Weiterspielen' : 'Erste Stadt gründen'}</span>
            <span className="block truncate text-sm font-medium opacity-65">
              {latest ? `${latest.name} · ${latest.doc.size}×${latest.doc.size}` : 'Leere Karte, freie Hand'}
            </span>
          </span>
          <Icon name="arrow" size={22} stroke={2.2} />
        </motion.button>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { v: 'new', icon: 'plus', title: 'Neue Stadt', sub: 'Modus & Größe' },
              { v: 'cities', icon: 'city', title: 'Meine Städte', sub: count ? `${count} gespeichert` : 'Noch keine' },
            ] as { v: View; icon: IconName; title: string; sub: string }[]
          ).map((b) => (
            <motion.button
              key={b.v}
              variants={item}
              whileTap={{ scale: 0.96 }}
              onClick={() => go(b.v)}
              className="glass rounded-[24px] p-4 text-left"
            >
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-white/8">
                <Icon name={b.icon} size={20} />
              </span>
              <span className="block text-[15px] font-bold leading-tight">{b.title}</span>
              <span className="block text-xs text-white/50">{b.sub}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function NewCity({ back }: { back: () => void }) {
  const newCity = useEditor((s) => s.newCity)
  const [name, setName] = useState('')
  const [placeholder] = useState(() => NAMES[Math.floor(Math.random() * NAMES.length)])
  const [mode, setMode] = useState<GameMode>('normal')
  const [size, setSize] = useState(256)

  const modes: { id: GameMode; icon: IconName }[] = [
    { id: 'normal', icon: 'alert' },
    { id: 'creative', icon: 'sparkle' },
  ]

  return (
    <motion.div
      className="relative z-10 flex h-full flex-col px-6 pb-[calc(28px+var(--safe-bottom))] pt-[calc(16px+var(--safe-top))]"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={spring}
    >
      <div className="flex items-center gap-3">
        <BackButton onClick={back} />
        <h2 className="text-2xl font-bold tracking-tight">Neue Stadt</h2>
      </div>

      <div className="mx-auto mt-8 w-full max-w-md flex-1 space-y-6 overflow-y-auto">
        <div>
          <div className="eyebrow mb-2">Name</div>
          <input className="field w-full text-lg font-semibold" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <div className="eyebrow mb-2">Spielmodus</div>
          <div className="grid grid-cols-2 gap-3">
            {modes.map((m) => {
              const active = mode === m.id
              return (
                <motion.button
                  key={m.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setMode(m.id)}
                  className={`card relative rounded-[24px] p-4 text-left transition-colors ${active ? '!border-accent/70' : ''}`}
                  style={active ? { boxShadow: '0 0 0 1px rgba(196,240,58,0.4), 0 14px 40px -12px rgba(196,240,58,0.35)' } : undefined}
                >
                  <span className={`mb-3 grid h-10 w-10 place-items-center rounded-full ${active ? 'bg-accent text-accent-ink' : 'bg-white/8'}`}>
                    <Icon name={m.icon} size={20} />
                  </span>
                  <span className="block text-base font-bold">{MODE_INFO[m.id].label}</span>
                  <span className="mt-1 block text-xs leading-snug text-white/55">{MODE_INFO[m.id].text}</span>
                </motion.button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="eyebrow mb-2">Kartengröße</div>
          <Segmented value={size} onChange={setSize} options={MAP_SIZES.map((m) => ({ value: m.size, label: m.label, sub: `${m.size}×${m.size}` }))} />
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => newCity(name.trim() || placeholder, mode, size)}
        className="btn-primary mx-auto mt-4 flex w-full max-w-md items-center justify-center gap-2 rounded-[22px] py-4 text-lg"
      >
        Stadt gründen <Icon name="arrow" size={20} stroke={2.4} />
      </motion.button>
    </motion.div>
  )
}

function Thumb({ doc }: { doc: CityDoc }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) renderThumb(ref.current, doc, 132, 96)
  }, [doc])
  return <canvas ref={ref} className="h-[96px] w-[132px] shrink-0 rounded-2xl" />
}

function Cities({ items, back, onOpen, refresh }: { items: Saved[]; back: () => void; onOpen: (d: CityDoc) => void; refresh: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function importFile(file: File) {
    try {
      const doc = importCityJson(await file.text())
      await saveCity(doc)
      refresh()
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen')
    }
  }

  return (
    <motion.div
      className="relative z-10 flex h-full flex-col px-6 pb-[calc(20px+var(--safe-bottom))] pt-[calc(16px+var(--safe-top))]"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={spring}
    >
      <div className="flex items-center gap-3">
        <BackButton onClick={back} />
        <h2 className="flex-1 text-2xl font-bold tracking-tight">Meine Städte</h2>
        <button className="btn-soft flex items-center gap-2 rounded-full px-4 py-3 text-sm" onClick={() => (location.hash = '#fahrzeuge')}>
          <Icon name="cube" size={17} /> Fahrzeuge
        </button>
        <button className="btn-soft flex items-center gap-2 rounded-full px-4 py-3 text-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={17} /> Import
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mx-auto mt-6 w-full max-w-md flex-1 space-y-3 overflow-y-auto pb-4">
        {items.length === 0 && <p className="mt-10 text-center text-white/50">Noch keine Städte gespeichert.</p>}
        <AnimatePresence initial={false}>
          {items.map((c, i) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.05 } }}
              exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
              className="card flex items-center gap-3 rounded-[26px] p-2.5"
            >
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-80" onClick={() => onOpen(c.doc)}>
                <Thumb doc={c.doc} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{c.name}</span>
                  <span className="block text-xs text-white/50">
                    {c.doc.mode === 'normal' ? 'Normal' : 'Kreativ'} · {c.doc.size}²
                  </span>
                  <span className="block text-xs text-white/50">
                    {Object.keys(c.doc.stations).length} Stationen · {Object.keys(c.doc.lines).length} Linien
                  </span>
                  <span className="mt-1 block text-[11px] text-white/35">{ago(c.updatedAt)}</span>
                </span>
              </button>
              <div className="flex flex-col gap-2 pr-1">
                <button
                  className="btn-soft grid h-10 w-10 place-items-center rounded-full"
                  aria-label="Exportieren"
                  onClick={() => downloadBlob(new Blob([exportCityJson(c.doc)], { type: 'application/json' }), `${c.name}.lineforge.json`)}
                >
                  <Icon name="download" size={17} />
                </button>
                {confirm === c.id ? (
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full bg-red-500/90 text-white"
                    aria-label="Wirklich löschen"
                    onClick={async () => {
                      await useAuth.getState().removeCity(c.id)
                      setConfirm(null)
                      refresh()
                    }}
                  >
                    <Icon name="check" size={18} />
                  </button>
                ) : (
                  <button className="btn-soft grid h-10 w-10 place-items-center rounded-full text-red-300" aria-label="Löschen" onClick={() => setConfirm(c.id)}>
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default function Menu() {
  const openCity = useEditor((s) => s.openCity)
  const [view, setView] = useState<View>('home')
  const [saved, setSaved] = useState<Saved[]>([])

  const refresh = () => void listCityDocs().then(setSaved)
  const tick = useAuth((s) => s.ownerTick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [tick])

  return (
    <div className="menu-flat absolute inset-0 overflow-hidden bg-night">
      <MenuBackdrop dim={view !== 'home'} />
      <AnimatePresence mode="wait" initial>
        {view === 'home' && <Home key="home" latest={saved[0]} count={saved.length} go={setView} onContinue={() => saved[0] && openCity(saved[0].doc)} />}
        {view === 'new' && <NewCity key="new" back={() => setView('home')} />}
        {view === 'cities' && <Cities key="cities" items={saved} back={() => setView('home')} onOpen={openCity} refresh={refresh} />}
      </AnimatePresence>
    </div>
  )
}
