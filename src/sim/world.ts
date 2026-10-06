/**
 * The world, as it was when it all lived here: what this module exported now lives in the modules below, and is
 * re-exported so older imports keep working. The simulation imports from the modules themselves.
 *   core.ts       bounds, footprints and doors, distances, blueprints, counts, settlements, news and history
 *   worldgen.ts   generating the map, and choosing where settlements start
 *   towns.ts      the options a new game is made with, the new state, founding a settlement
 *   buildings.ts  placing, turning, lifting, finishing and demolishing buildings and bridges
 *   terrain.ts    saplings, worn paths and paving
 *   seasons.ts    the season, and whether a settlement's winter store is on track
 */
export { inB, FACING, dims, door, front, beside, hypot, ctr, distAB, distBB, add, bp, villagers, hasBuilt, countBuilt, chronicle, emit, nearestTown, townOf } from './core.ts';
export { clearSite, neighbourSite } from './worldgen.ts';
export { type WorldOptions, createState, foundTown } from './towns.ts';
export { placeProblem, canPlace, lift, turnBuilding, placeBuilding, placeBridge, completeSite, demolish } from './buildings.ts';
export { saplings, plant, worn, tread, paveLevel, pave, unpave } from './terrain.ts';
export { type Season, seasonOf, storesOnTrack } from './seasons.ts';
export { learningAt, reads } from './people.ts';
export { newLedger } from './trade.ts';
export { foodsOf } from './production.ts';
