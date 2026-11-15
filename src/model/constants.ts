import type { OperatorId, StationType } from './types'

export const MAP_SIZE = 256
export const MAP_SIZES = [
  { label: 'Klein', size: 128 },
  { label: 'Mittel', size: 256 },
  { label: 'Groß', size: 384 },
  { label: 'Riesig', size: 512 },
]

/**
 * Operators only describe the kind of service (line weight, badge shape, label).
 * Colours are chosen freely per line.
 */
export const OPERATORS: Record<
  OperatorId,
  { label: string; short: string; width: number; badgeRadius: number; prefix: string }
> = {
  sbahn: { label: 'S-Bahn', short: 'S', width: 6, badgeRadius: 99, prefix: 'S' },
  ubahn: { label: 'U-Bahn', short: 'U', width: 6, badgeRadius: 4, prefix: 'U' },
  tram: { label: 'Straßenbahn', short: 'T', width: 4, badgeRadius: 8, prefix: 'M' },
  regional: { label: 'Nahverkehr', short: 'R', width: 4.5, badgeRadius: 2, prefix: 'RB' },
  fernverkehr: { label: 'Fernverkehr', short: 'F', width: 7.5, badgeRadius: 2, prefix: 'ICE' },
}

export const STATION_TYPES: Record<StationType, { label: string; hint: string }> = {
  standard: { label: 'Bahn-Haltestelle', hint: 'S-Bahn, U-Bahn, Nah- und Fernverkehr; mit zwei Linien wird daraus ein Umsteigebahnhof' },
  interchange: { label: 'Umsteigebahnhof', hint: 'Mehrere Linien halten hier' },
  tramstop: { label: 'Tram-Haltestelle', hint: 'Kleine Haltestelle der Straßenbahn' },
  hauptbahnhof: { label: 'Hauptbahnhof', hint: 'Zentraler Knoten der Stadt' },
  airport: { label: 'Flughafen', hint: 'Liegt auf dem Flughafengelände' },
}

/** Free line colour palette (works on dark and light backgrounds). */
export const LINE_COLORS = [
  '#ff5470',
  '#ff8a3d',
  '#ffc233',
  '#a6e03c',
  '#27c46b',
  '#17c3b2',
  '#3db8ff',
  '#5b7cff',
  '#9a6bff',
  '#e055c4',
  '#ff7aa2',
  '#b8c0cc',
]
