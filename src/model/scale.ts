/**
 * Size of everything on the rails (trains, tracks, platforms, station roofs) relative to the design size those were
 * modelled in. The city's houses and streets stay as they are, so a tram fits into a street and a train is
 * not several times the size of a house. Positions and distances on the map are not scaled.
 */
export const RAIL = 0.42

/**
 * A tram runs inside a street, so it is shrunk further: its two tracks, the car and its stops have to fit into a street
 * (the streets of the map are about a quarter of a cell wide). The design sizes stay the same.
 */
export const TRAM = 0.26

/** Scale of everything on the rails of an operator (see `RAIL`, `TRAM`) */
export const railOf = (operator: string): number => (operator === 'tram' ? TRAM : RAIL)
