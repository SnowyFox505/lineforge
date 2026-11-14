import type { Line } from './types'

/** Does the line stop at the station (it is on the route and not passed through)? */
export function stopsAt(line: Line, stationId: string): boolean {
  return line.stations.includes(stationId) && !line.passes?.includes(stationId)
}

/** Does the line run through the station without stopping? */
export function passesThrough(line: Line, stationId: string): boolean {
  return line.stations.includes(stationId) && !!line.passes?.includes(stationId)
}

/** The stations the line calls at, in order. */
export function stopIds(line: Line): string[] {
  return line.passes?.length ? line.stations.filter((id) => !line.passes!.includes(id)) : line.stations
}
