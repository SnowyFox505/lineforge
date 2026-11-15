import { create } from 'zustand'

/**
 * The accent colour of the app (default: neon lime). It is stored as CSS variables, so everything that uses
 * `accent` (buttons, tabs, "Forge" on the start screen, sliders ...) follows; the logo keeps its own colours.
 */
export interface Preset {
  id: string
  label: string
  hex: string
}

/** Colours that were checked on the dark UI: the dark text on them and them as text on the dark background both stay readable. */
export const PRESETS: Preset[] = [
  { id: 'lime', label: 'Limette', hex: '#c4f03a' },
  { id: 'aqua', label: 'Aqua', hex: '#35d8ff' },
  { id: 'sun', label: 'Sonne', hex: '#ffa83a' },
  { id: 'pink', label: 'Pink', hex: '#ff6fae' },
]

export const DEFAULT_ACCENT = PRESETS[0].hex
const KEY = 'lineforge-accent'
/** Text on top of an accent colour */
export const ACCENT_INK = '#0d1300'

// --- colour maths -----------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')

export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  h = (h * 60 + 360) % 360
  return [h, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Relative luminance (WCAG) 0..1 */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * A colour for the hue slider: full colour, but light enough that it is readable as text on the dark background
 * and that the dark text on top of it is readable too (blue needs to be lighter than yellow for that).
 */
export function accentFromHue(hue: number): string {
  const h = ((hue % 360) + 360) % 360
  for (let l = 0.5; l <= 0.84; l += 0.01) {
    const hex = hslToHex(h, 0.9, l)
    if (luminance(hex) >= 0.36) return hex
  }
  return hslToHex(h, 0.9, 0.84)
}

export const hueOf = (hex: string) => Math.round(rgbToHsl(hexToRgb(hex))[0])

/** Lighter and darker variants for gradients */
export function shades(hex: string): { hi: string; lo: string } {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  return { hi: hslToHex(h, Math.min(1, s), Math.min(0.92, l + 0.07)), lo: hslToHex(h, Math.min(1, s + 0.03), Math.max(0.3, l - 0.09)) }
}

// --- gradients ----------------------------------------------------------------------------------

/** Two colours that blend into each other (buttons, active tabs and so on). Both stay readable like the single colours. */
export interface GradientPreset {
  id: string
  label: string
  a: string
  b: string
}

export const GRADIENTS: GradientPreset[] = [
  { id: 'lagoon', label: 'Lagune', a: '#c4f03a', b: '#35d8ff' },
  { id: 'sunset', label: 'Sonnenuntergang', a: '#ffa83a', b: '#ff6fae' },
  { id: 'ocean', label: 'Ozean', a: '#35d8ff', b: accentFromHue(270) },
  { id: 'berry', label: 'Beere', a: '#ff6fae', b: accentFromHue(275) },
]

/** The fill of buttons and active controls: a vertical sheen for one colour, a diagonal blend for two */
export function accentFill(hex: string, hex2: string | null): string {
  if (hex2) return `linear-gradient(135deg, ${hex}, ${hex2})`
  const { hi, lo } = shades(hex)
  return `linear-gradient(180deg, ${hi}, ${lo})`
}

// --- light and dark -----------------------------------------------------------------------------

/** What the person chose: follow the device, or always dark / always light */
export type Mode = 'auto' | 'dark' | 'light'
export type Scheme = 'dark' | 'light'

/** The page colour behind everything in each scheme (the light one is also the background of light panels) */
export const SCHEME_BG: Record<Scheme, string> = { dark: '#06080c', light: '#eef1f5' }

const MODE_KEY = 'lineforge-mode'
const ACCENT2_KEY = 'lineforge-accent2'

const systemScheme = (): Scheme => (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
export const resolveScheme = (mode: Mode): Scheme => (mode === 'auto' ? systemScheme() : mode)

/**
 * The accent as text colour: on the dark background the accent itself, on the light one the same hue made
 * darker until it can be read (lime text on white would vanish).
 */
export function accentText(hex: string, scheme: Scheme): string {
  if (scheme === 'dark') return hex
  const [h, s] = rgbToHsl(hexToRgb(hex))
  for (let l = 0.5; l >= 0.12; l -= 0.01) {
    const c = hslToHex(h, Math.max(0.55, s * 0.9), l)
    if (contrast(c, '#ffffff') >= 4.6) return c
  }
  return '#1b2430'
}

// --- applying -----------------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i

export function applyTheme(hex: string, hex2: string | null, scheme: Scheme) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const root = el.style
  const { hi, lo } = shades(hex)
  root.setProperty('--color-accent', hex)
  root.setProperty('--accent', hex)
  root.setProperty('--accent-hi', hi)
  root.setProperty('--accent-lo', lo)
  root.setProperty('--accent-2', hex2 ?? hex)
  root.setProperty('--accent-fill', accentFill(hex, hex2))
  root.setProperty('--accent-text', accentText(hex, scheme))
  root.setProperty('--accent-rgb', hexToRgb(hex).join(', '))
  root.setProperty('--color-accent-ink', ACCENT_INK)
  el.dataset.theme = scheme
  el.style.colorScheme = scheme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SCHEME_BG[scheme])
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode: the choice is just not remembered
  }
}

function stored(): string {
  const v = read(KEY)
  return v && HEX.test(v) ? v : DEFAULT_ACCENT
}

function storedAccent2(): string | null {
  const v = read(ACCENT2_KEY)
  return v && HEX.test(v) ? v : null
}

function storedMode(): Mode {
  const v = read(MODE_KEY)
  return v === 'dark' || v === 'light' || v === 'auto' ? v : 'dark'
}

interface ThemeState {
  accent: string
  /** the second colour of a gradient, or null for a single colour */
  accent2: string | null
  mode: Mode
  /** what `mode` means right now */
  scheme: Scheme
  /** sets and remembers the colour; without a second colour the gradient is switched off */
  setAccent: (hex: string, hex2?: string | null) => void
  setMode: (mode: Mode) => void
}

const initialMode = storedMode()

export const useTheme = create<ThemeState>((set, get) => ({
  accent: stored(),
  accent2: storedAccent2(),
  mode: initialMode,
  scheme: resolveScheme(initialMode),
  setAccent: (hex, hex2 = null) => {
    if (!HEX.test(hex)) return
    const second = hex2 && HEX.test(hex2) ? hex2 : null
    applyTheme(hex, second, get().scheme)
    write(KEY, hex)
    write(ACCENT2_KEY, second)
    set({ accent: hex, accent2: second })
  },
  setMode: (mode) => {
    const scheme = resolveScheme(mode)
    applyTheme(get().accent, get().accent2, scheme)
    write(MODE_KEY, mode)
    set({ mode, scheme })
  },
}))

/** The accent for code that paints on canvases (read again at every redraw). */
export function getAccent(): { hex: string; rgb: string } {
  const hex = useTheme.getState().accent
  return { hex, rgb: hexToRgb(hex).join(',') }
}

{
  const s = useTheme.getState()
  applyTheme(s.accent, s.accent2, s.scheme)
  // "automatic" follows the device while the app is open
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      const t = useTheme.getState()
      if (t.mode === 'auto') t.setMode('auto')
    })
  }
}
