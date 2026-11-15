/**
 * Size of everything on the rails (trains, tracks, platforms, station roofs) relative to the design size those were
 * modelled in. The city's houses and streets are not scaled: they stay as they are, so a train fits between the
 * houses and a tram into a street. Positions and distances on the map are not scaled either.
 */
export const RAIL = 0.27

/**
 * A tram runs inside a street, so it is shrunk further: its two tracks, the car and its stops have to fit into a street.
 * The design sizes stay the same.
 */
export const TRAM = 0.17

/** Scale of everything on the rails of an operator (see `RAIL`, `TRAM`) */
export const railOf = (operator: string): number => (operator === 'tram' ? TRAM : RAIL)
