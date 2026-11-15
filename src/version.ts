/** Version of this app (from package.json) and the id of this build (changes with every deploy; 'dev' while developing). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
export const APP_BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev'

/** The stage of the game, shown next to the version number. Drop it when the base game (normal mode) is solid. */
export const APP_STAGE = 'Beta'

/** "0.8.0" -> [0, 8, 0] */
export function parseVersion(v: string): number[] {
  return v.split('.').map((p) => parseInt(p, 10) || 0)
}

/** < 0 when a is older than b, 0 when equal, > 0 when newer. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}
