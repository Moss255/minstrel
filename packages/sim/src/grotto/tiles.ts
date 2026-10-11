import type { GrottoFloor } from './floor.ts'

/**
 * **A grotto floor's tiles: which piece stands on each, and turned which
 * way** — `func_02019728` (US ARM9), read 11 October 2026. Every one of the
 * 16 × 16 tiles, row by row, takes its piece from its adjacency byte (see
 * `adjacency` in `floor.ts`): a name, the piece of the environment's
 * `Z0nM01.amdj` with that name, and a quarter turn. The tile stands at
 * (x · 8, 0, y · 8) in the game's units, its centre there, turned about y.
 *
 * The names are the pieces' own (`Z01MR04A` is `R04A` in the first
 * environment): `R04A` open all round, `R03A` a corner of rock, `R01A` a side,
 * `R02A` two sides, `R05A` two opposite corners, `D01A`–`D04A` a room's edge
 * with corners, `W01A`–`W04A` corridors, `E01A` a dead end, `F01A` solid.
 *
 * **The piece is found by number**, the game walking its list of the map's
 * pieces that many places (`func_020196fc`): the names this function prints
 * agree with that list in the reverse of the archive's order — `W04A` 0 to
 * `D01A` 17, with `S02A`, `S01A` and `O01A` at 4, 5 and 11, which no tile
 * takes — on all fifteen it names, in all five environments
 * (`tools/harness/test/grotto-tiles.test.ts`). INFERRED for the three it
 * does not.
 *
 * **An adjacency byte the switch does not name** keeps the last tile's name
 * and piece: the name is cleared once, before the first tile (`__clear` at
 * `0x02019764`), and only its cases write it. The turn goes back to none.
 */

/** A tile's piece and turn. */
export interface GrottoTile {
  /** Its kind's name — and its piece's, after the environment's prefix. */
  readonly name: string
  /** The piece's place in the map's list of pieces (`func_020196fc`); see the module. */
  readonly kind: number
  /** Quarter turns about y: 0, 1, 2 or 3 — `0x1921`, `0x3243`, `0x4b65` × 4096 to the radian. */
  readonly turn: number
  readonly x: number
  readonly y: number
}

/** The switch's cases: adjacency bytes, and the kind and name they choose (`0x020197c4`–`0x02019ba4`). */
const KINDS: readonly (readonly [number, string, readonly number[]])[] = [
  [0, 'W04A', [0xab, 0xae, 0xba, 0xea]],
  [1, 'W03A', [0xaa]],
  [2, 'W02A', [0xaf, 0xbe, 0xeb, 0xfa]],
  [3, 'W01A', [0xbb, 0xee]],
  [6, 'R05A', [0x22, 0x88]],
  [7, 'R04A', [0x00]],
  [8, 'R03A', [0x02, 0x08, 0x20, 0x80]],
  [9, 'R02A', [0x3e, 0x8f, 0xe3, 0xf8]],
  [10, 'R01A', [0x0e, 0x38, 0x83, 0xe0]],
  [12, 'F01A', [0xff]],
  [13, 'E01A', [0xbf, 0xef, 0xfb, 0xfe]],
  [14, 'D04A', [0x2a, 0x8a, 0xa2, 0xa8]],
  [15, 'D03A', [0x2e, 0x8b, 0xb8, 0xe2]],
  [16, 'D02A', [0x3a, 0x8e, 0xa3, 0xe8]],
  [17, 'D01A', [0x0a, 0x28, 0x82, 0xa0]],
]

/** The second switch's cases: the quarter turn each byte is given (`0x02019c00`–`0x02019e08`). */
const TURNS: readonly (readonly [number, readonly number[]])[] = [
  [1, [0x02, 0x82, 0x83, 0x88, 0x8a, 0x8e, 0x8f, 0xab, 0xaf, 0xe2, 0xee, 0xef]],
  [2, [0x08, 0x0a, 0x0e, 0x2a, 0x3a, 0x3e, 0x8b, 0xae, 0xbe, 0xbf]],
  [3, [0x20, 0x28, 0x2e, 0x38, 0xa8, 0xba, 0xe8, 0xf8, 0xfa, 0xfe]],
]

const KIND_OF = new Map<number, readonly [number, string]>()
for (const [kind, name, bytes] of KINDS) for (const b of bytes) KIND_OF.set(b, [kind, name])
const TURN_OF = new Map<number, number>()
for (const [turn, bytes] of TURNS) for (const b of bytes) TURN_OF.set(b, turn)

/** Every tile of a floor, row by row, as `func_02019728` gives them its pieces. */
export function floorTiles(floor: GrottoFloor): GrottoTile[] {
  const out: GrottoTile[] = []
  let kind = 0
  let name = ''
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const bits = floor.adjacency[(y << 4) + x] as number
      const chosen = KIND_OF.get(bits)
      if (chosen) [kind, name] = chosen
      out.push({ name, kind, turn: TURN_OF.get(bits) ?? 0, x, y })
    }
  }
  return out
}

/**
 * A tile kind's nine places turned with the tile (`func_02019f6c`): the 3 × 3
 * grid turned a quarter at a time, and each place's ways to face with it
 * (`func_0201a108`) — bit 0 up, 1 right, 2 down, 3 left.
 */
export function turnPlaces(directions: readonly number[], turn: number): number[] {
  const from =
    turn === 1
      ? [2, 5, 8, 1, 4, 7, 0, 3, 6]
      : turn === 2
        ? [8, 7, 6, 5, 4, 3, 2, 1, 0]
        : turn === 3
          ? [6, 3, 0, 7, 4, 1, 8, 5, 2]
          : undefined
  if (!from) return [...directions]
  return from.map((i) => turnMask((directions[i] as number) & 0xff, turn))
}

/** One place's ways to face, turned: right becomes up a quarter turn on, and so round. */
function turnMask(mask: number, turn: number): number {
  const up = mask & 1
  const right = (mask >> 1) & 1
  const down = (mask >> 2) & 1
  const left = (mask >> 3) & 1
  if (turn === 1) return right | (down << 1) | (left << 2) | (up << 3)
  if (turn === 2) return down | (left << 1) | (up << 2) | (right << 3)
  return left | (up << 1) | (right << 2) | (down << 3)
}

/** Where the nine places stand from a tile's centre, ±8/3 of the game's units (`data_020e6f00`). */
const PLACE_OFFSETS: readonly (readonly [number, number])[] = [
  [-10922, -10922],
  [0, -10922],
  [10922, -10922],
  [-10922, 0],
  [0, 0],
  [10922, 0],
  [-10922, 10922],
  [0, 10922],
  [10922, 10922],
]

/** An object put on a tile: where, in the game's `fx32` units, and the way it faces, 0 up to 3 left (−1 for none). */
export interface TileObject {
  readonly x: number
  readonly z: number
  readonly facing: number
}

/**
 * Put an object on a tile (`GenerateGrottoObjectPositionOrientation`): one of
 * its places with any way to face, by a draw, then one of those ways — down,
 * right or left first, in that order, when `preferFaceDown` — by another. An
 * `R02A`'s corner places stand further out, at ±`0x34cc`. `rand` is the
 * game's own, shared with whatever else draws.
 *
 * A tile with no place at all is answered with nothing: the game would read
 * `-1` as its place and look before its own table there.
 */
export function placeOnTile(
  name: string,
  places: readonly number[],
  tileX: number,
  tileY: number,
  rand: () => number,
  preferFaceDown: boolean,
): TileObject | undefined {
  const valid: number[] = []
  for (let i = 0; i < 9; i++) if (places[i] !== 0) valid.push(i)
  if (valid.length === 0) return undefined
  const position = valid[rand() % valid.length] as number
  const ways: number[] = []
  for (let i = 0; i < 4; i++) if ((((places[position] as number) >> i) & 1) !== 0) ways.push(i)
  let facing: number | undefined
  if (preferFaceDown) facing = [2, 1, 3].find((w) => ways.includes(w))
  if (facing === undefined) {
    // The draw is spent even with no way to face, and the game then answers
    // its table's default, 255 read as a signed `char`: −1 (`data_020e700c`).
    const r = rand()
    facing = ways.length === 0 ? -1 : (ways[r % ways.length] as number)
  }
  let [x, z] = PLACE_OFFSETS[position] as readonly [number, number]
  if (name.includes('R02A')) {
    const corner = (
      {
        0: [-0x34cc, -0x34cc],
        2: [0x34cc, -0x34cc],
        6: [-0x34cc, 0x34cc],
        8: [0x34cc, 0x34cc],
      } as const
    )[position as 0 | 2 | 6 | 8]
    if (corner) [x, z] = corner
  }
  return {
    x: x + Math.trunc(tileX * 8 * 4096),
    z: z + Math.trunc(tileY * 8 * 4096),
    facing,
  }
}
