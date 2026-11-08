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

// --- applying -----------------------------------------------------------------------------------

export function applyAccent(hex: string) {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  const { hi, lo } = shades(hex)
  root.setProperty('--color-accent', hex)
  root.setProperty('--accent', hex)
  root.setProperty('--accent-hi', hi)
  root.setProperty('--accent-lo', lo)
  root.setProperty('--accent-rgb', hexToRgb(hex).join(', '))
  root.setProperty('--color-accent-ink', ACCENT_INK)
}

function stored(): string {
  try {
    const v = localStorage.getItem(KEY)
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

interface ThemeState {
  accent: string
  /** sets and remembers the colour; `save: false` is for values that come from the cloud */
  setAccent: (hex: string) => void
}

export const useTheme = create<ThemeState>((set) => ({
  accent: stored(),
  setAccent: (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return
    applyAccent(hex)
    try {
      localStorage.setItem(KEY, hex)
    } catch {
      // private mode: the colour is just not remembered
    }
    set({ accent: hex })
  },
}))

/** The accent for code that paints on canvases (read again at every redraw). */
export function getAccent(): { hex: string; rgb: string } {
  const hex = useTheme.getState().accent
  return { hex, rgb: hexToRgb(hex).join(',') }
}

applyAccent(useTheme.getState().accent)
