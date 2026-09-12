import {
  RANDOM_GOLD,
  RANDOM_ITEM,
  RANDOM_MONSTER,
  type RandomTreasure,
  type Treasure,
} from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import type { Vertex } from '@minstrel/nitro-gfx'
import { renderLine, type Talker } from './talk.ts'

/**
 * Treasure: what is inside, opening it, remembering that it is open, and a
 * marker to find what has no model yet.
 *
 * **What is inside** is read — see {@link findInside}: chests name their item,
 * some hold gold, and the rest draw from the random tables.
 *
 * **The marker is not the game's.** Chests are drawn with their own models (see
 * `chests.ts`) and pots and barrels with their sprites (see `pots.ts`); any
 * other treasure with a position — the village has none — is a small cube, gold
 * while it is shut and grey once opened.
 *
 * **Nor are the words.** The cartridge's own text for opening a treasure has
 * not been found; the box says which treasure was opened and what was in it,
 * in our words.
 */

/** A marker's side, as a share of a person's height — a choice, to be seen from the camera. */
export const TREASURE_MARKER = 0.3

/** What an opened treasure is remembered by: its game-wide number, or failing that, where it is. */
export function treasureKey(map: string, slot: number, treasure: Treasure): string {
  return treasure.index === undefined ? `${map}/${slot}` : `#${treasure.index}`
}

/**
 * The treasures that can be walked up to, as talk targets, so that reach and
 * facing are the same as for talking. Each one's `id` is its place in `treasures`.
 */
export function treasureTargets(treasures: readonly Treasure[]): Talker[] {
  const targets: Talker[] = []
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    if (at) targets.push({ id: slot, name: 'treasure', x: at.x, z: at.z })
  }
  return targets
}

/** The nearest treasure with a position, and how far away it is, for saying where to look. */
export function nearestTreasure(
  treasures: readonly Treasure[],
  at: { readonly x: number; readonly z: number },
): { treasure: Treasure; distance: number } | undefined {
  let best: { treasure: Treasure; distance: number } | undefined
  for (const treasure of treasures) {
    const p = treasure.position
    if (!p) continue
    const distance = Math.hypot(p.x - at.x, p.z - at.z)
    if (!best || distance < best.distance) best = { treasure, distance }
  }
  return best
}

/**
 * Which random-treasure table each kind draws from, by its rank — INFERRED.
 * `randTBox` has ranks 1 to 5 and kind `0x40`'s values are 1 to 5; `randTTT`
 * has 1 to 20, and its weights come to less than 100, which leaves pots,
 * barrels and cabinets a chance of nothing — their values run 0 to 20.
 * `randTD`, ranks 1 to 10, is no treasure's the village has.
 */
export const DRAWN_FROM: ReadonlyMap<number, string> = new Map([
  [0x10, 'randTTT'],
  [0x20, 'randTTT'],
  [0x30, 'randTTT'],
  [0x40, 'randTBox'],
])

/** What opening a treasure turned up: the words for the box, and a note on where they came from. */
export interface Found {
  readonly text: string
  readonly note: string
}

/**
 * The game's own dice are not reproduced, so a draw is made with a stand-in:
 * a number from 0 to 99 fixed by the treasure's own number, the same each time.
 */
export function standInRoll(treasure: Treasure): number {
  return ((treasure.index ?? 0) * 61 + 17) % 100
}

/** The row of a rank a roll from 0 to 99 lands on, by weight; undefined past the weights, which is nothing. */
export function drawRow(
  rows: readonly RandomTreasure[],
  rank: number,
  roll: number,
): RandomTreasure | undefined {
  let reached = 0
  for (const row of rows) {
    if (row.rank !== rank) continue
    reached += row.weight
    if (roll < reached) return row
  }
  return undefined
}

/**
 * What is inside a treasure, from its first value's low half and its kind:
 *
 * - kinds `0x8` and `0x9`: an item, by the id the item names use — every one of
 *   their 142 records names an item;
 * - kind `0x4`: gold, the amount itself — 50 to 5,000, INFERRED;
 * - kinds `0x10`, `0x20`, `0x30` and `0x40`: a rank to draw from a random table,
 *   see {@link DRAWN_FROM}; 0 is nothing;
 * - kind `0x0`: 0 on all six, nothing.
 */
export function findInside(
  treasure: Treasure,
  randoms: ReadonlyMap<string, readonly RandomTreasure[]>,
  names: ReadonlyMap<number, string>,
  roll = standInRoll(treasure),
): Found {
  const value = treasure.unknown_0 & 0xffff
  const item = (id: number) => {
    const name = names.get(id)
    return name === undefined ? `item 0x${id.toString(16)}` : renderName(name)
  }
  if (treasure.kind === 0x8 || treasure.kind === 0x9) {
    return { text: `Inside: ${item(value)}.`, note: `item 0x${value.toString(16)}` }
  }
  if (treasure.kind === 0x4) return { text: `Inside: ${value} gold coins.`, note: `${value} gold` }
  const table = DRAWN_FROM.get(treasure.kind)
  if (table === undefined || value === 0) {
    return {
      text: 'There is nothing inside.',
      note: `kind 0x${treasure.kind.toString(16)}, value ${value}`,
    }
  }
  const rows = randoms.get(table) ?? []
  const total = rows.filter((row) => row.rank === value).reduce((sum, row) => sum + row.weight, 0)
  const row = drawRow(rows, value, roll)
  const odds = `rank ${value} of ${table}, roll ${roll} of 100 against weights coming to ${total}`
  if (!row) return { text: 'There is nothing inside.', note: `${odds}: nothing` }
  if (row.kind === RANDOM_MONSTER) {
    // The monster list's names are not read, so it goes by its number; and
    // there is no battle yet, so nothing comes of it.
    return {
      text: `The chest was really a monster — number ${row.value} in the monster list!\nThere are no battles yet.`,
      note: `${odds}: weight ${row.weight}, monster ${row.value}`,
    }
  }
  const what =
    row.kind === RANDOM_ITEM
      ? item(row.value)
      : row.kind === RANDOM_GOLD
        ? `${row.value} gold coins`
        : `something not read (a kind-${row.kind} draw, ${row.value})`
  return { text: `Inside: ${what}.`, note: `${odds}: weight ${row.weight}` }
}

/** An item name's markup — `veteran<1>s helm` — as the text box would show it. */
function renderName(name: string): string {
  return renderLine(name)
    .pages.map((page) => page.text)
    .join(' ')
}

const hex = (value: number) => `0x${value.toString(16).padStart(8, '0')}`

/**
 * What the text box says on opening a treasure — with what was found, when that
 * is known — or on coming back to one already open.
 */
export function treasureText(treasure: Treasure, alreadyOpen: boolean, found?: string): string {
  const which = treasure.index === undefined ? 'this treasure' : `treasure #${treasure.index}`
  if (alreadyOpen) return `You have already opened ${which}.`
  if (found !== undefined) return `You open ${which}.\n${found}`
  return `You open ${which}.\nWhat is inside is not read yet: its first value is ${hex(treasure.unknown_0)}.`
}

const SHUT: readonly [number, number, number] = [1, 0.78, 0.2]
const OPEN: readonly [number, number, number] = [0.45, 0.45, 0.45]

/** A cube's corners, bit 1 for +x, 2 for +y and 4 for +z. */
const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [c & 1 ? 1 : -1, c & 2 ? 1 : 0, c & 4 ? 1 : -1])
/** Its six faces, each drawn both ways round so that it reads from any side. */
const FACES = [
  [0, 2, 6, 4],
  [1, 5, 7, 3],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 1, 3, 2],
  [4, 6, 7, 5],
].flatMap(([a, b, c, d]) => [a, b, c, a, c, d, a, c, b, a, d, c] as number[])

/**
 * A marker on each treasure with a position: a cube of side `size` standing on
 * it, in one piece per colour, since the renderer uploads per piece.
 */
export function treasurePieces(
  treasures: readonly Treasure[],
  isOpen: (treasure: Treasure, slot: number) => boolean,
  size: number,
  /** Treasure drawn some other way — a chest, by its own model. */
  skip: (treasure: Treasure) => boolean = () => false,
): Piece[] {
  const shut = { vertices: [] as Vertex[], indices: [] as number[] }
  const open = { vertices: [] as Vertex[], indices: [] as number[] }
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    if (!at || skip(treasure)) continue
    const opened = isOpen(treasure, slot)
    const into = opened ? open : shut
    const [r, g, b] = opened ? OPEN : SHUT
    const base = into.vertices.length
    for (const [dx, dy, dz] of CORNERS as [number, number, number][]) {
      into.vertices.push({
        x: at.x + (dx * size) / 2,
        y: at.y + dy * size,
        z: at.z + (dz * size) / 2,
        s: 0,
        t: 0,
        r,
        g,
        b,
        matrixId: 0,
      })
    }
    for (const index of FACES) into.indices.push(base + index)
  }
  return [shut, open].flatMap(({ vertices, indices }) =>
    vertices.length === 0 ? [] : [{ geometry: { vertices, indices, matrixIds: [], scales: [] } }],
  )
}
