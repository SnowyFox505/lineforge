/**
 * The scale of the world. One map cell is `METERS_PER_CELL` metres wide, and everything that has a real size
 * (streets, houses, trains, platforms) is given in metres and turned into cells with `cells()`.
 *
 * Why 8 m: the street gaps between the building lots are 0.7 to 1.2 cells wide and the houses 1.5 to 3 cells, which
 * are a side street, a main street and a block of flats at 8 m per cell. A cell is also small enough that a
 * 70 m train is only 9 cells long (the stops of a normal city are 10 to 100 cells apart) and big enough that a
 * 128 x 128 map is a whole town (about 1 km).
 */
export const METERS_PER_CELL = 8

/** Metres to cells */
export const cells = (metres: number): number => metres / METERS_PER_CELL

/**
 * Rails, trains, platforms and station roofs are modelled at a "design size" in which a train is 0.36 wide
 * and a car 1.95 long. That corresponds to a 3 m wide, 17 m long car, so one design unit is this many metres.
 */
export const DESIGN_UNIT_M = 8.3

/** Size of everything on the rails relative to the design size, so that a car has its real size in cells. */
export const RAIL = DESIGN_UNIT_M / METERS_PER_CELL

/**
 * A tram runs inside a street: its tracks, stops and car are a little slimmer than heavy rail (a tram is 2.4 m
 * wide, a train 3 m), so the two tracks and the car stay inside a main street.
 */
export const TRAM = RAIL * 0.88

/** Scale of everything on the rails of an operator (see `RAIL`, `TRAM`) */
export const railOf = (operator: string): number => (operator === 'tram' ? TRAM : RAIL)

/** Real width of the streets in cells (the paved part, from kerb to kerb): side street, main street, avenue. */
export const STREET_FINE = cells(5)
export const STREET_MINOR = cells(6)
export const STREET_MAJOR = cells(9)
export const STREET_AVENUE = cells(14)
