import {
  CONTAINER,
  containerOf,
  contentsOf,
  openedFlag,
  RANDOM_GOLD,
  RANDOM_ITEM,
  RANDOM_MONSTER,
  type RandomTreasure,
  type Treasure,
} from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import type { Vertex } from '@minstrel/nitro-gfx'
import type { Takings } from './bag.ts'
import { DEFAULT_CONTEXT, renderLine, type Talker } from './talk.ts'

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
 * **Which random-treasure table a container draws from**, by its rank —
 * `LootableContainerManager::LoadZoneContainers` (US `0x0207bd34`,
 * decompiled): a blue chest from `randTBox`, a pot, a barrel or a cupboard
 * from `randTTT`. A red chest is not drawn. `randTD` is the grottoes' (task 19).
 */
export const DRAWN_FROM: ReadonlyMap<number, string> = new Map([
  [CONTAINER.pot, 'randTTT'],
  [CONTAINER.barrel, 'randTTT'],
  [CONTAINER.cupboard, 'randTTT'],
  [CONTAINER.blueChest, 'randTBox'],
])

/**
 * **A roll for every drawn container, as the map is loaded** — the game draws
 * each one's contents at every load of the map, below 100
 * (`LootDistribution::Sample`, `func_02032370(100)`), so what a pot holds is
 * new each time the map is entered. By slot. **Ours**: the draws are the
 * caller's, not the game's "A table".
 */
export function rollsAtLoad(
  treasures: readonly Treasure[],
  below: (n: number) => number,
): Map<number, number> {
  const rolls = new Map<number, number>()
  for (const [slot, treasure] of treasures.entries()) {
    if (DRAWN_FROM.has(containerOf(treasure))) rolls.set(slot, below(100))
  }
  return rolls
}

/**
 * What an opened treasure is remembered by: **its flag** — a red chest's
 * `0x212 + id`, anything else's `0x79e + id` (see `openedFlag`), set in the
 * game-wide bank. The second kind all come back when play begins.
 */
export function treasureKey(treasure: Treasure): number {
  return openedFlag(treasure)
}

/**
 * What opening a treasure turned up: the words for the box, a note on where they
 * came from, and what goes into the bag.
 */
export interface Found {
  readonly text: string
  readonly note: string
  readonly takings: Takings
}

/**
 * A roll for a treasure when none was drawn at the map's load: a number from 0
 * to 99 fixed by its id. **Ours** — a stand-in for tests and for treasure
 * outside a loaded map.
 */
export function standInRoll(treasure: Treasure): number {
  return (treasure.id * 61 + 17) % 100
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
 * What is inside a treasure, from its first value's low half and its kind, as
 * `LootManager_CreateContainer` reads them:
 *
 * - a red chest holds what its kind's bits 2–3 say (`contentsOf`): an item by
 *   its id (every one of the 142 names an item), gold by its amount, or
 *   nothing;
 * - anything else holds what the roll draws at its rank from its table — see
 *   {@link DRAWN_FROM}; past the weights, or rank 0, nothing.
 */
export function findInside(
  treasure: Treasure,
  randoms: ReadonlyMap<string, readonly RandomTreasure[]>,
  names: ReadonlyMap<number, string>,
  roll = standInRoll(treasure),
  /** Monster names by number, for a chest that is a monster — see `readMonsterList`. */
  monsters: ReadonlyMap<number, string> = new Map(),
  /** The engine's own messages, for the chest's words — see `readSystemStrings`. */
  system: ReadonlyMap<number, string> = new Map(),
): Found {
  const value = treasure.packed & 0xffff
  const item = (id: number) => {
    const name = names.get(id)
    return name === undefined ? `item 0x${id.toString(16)}` : renderName(name)
  }
  const red = containerOf(treasure) === CONTAINER.redChest
  if (red && contentsOf(treasure) === RANDOM_ITEM) {
    return {
      text: `Inside: ${item(value)}.`,
      note: `item 0x${value.toString(16)}`,
      takings: { item: value },
    }
  }
  if (red && contentsOf(treasure) === RANDOM_GOLD) {
    return { text: `Inside: ${value} gold coins.`, note: `${value} gold`, takings: { gold: value } }
  }
  const table = DRAWN_FROM.get(containerOf(treasure))
  if (table === undefined || value === 0) {
    return {
      text: 'There is nothing inside.',
      note: `kind 0x${treasure.kind.toString(16)}, value ${value}`,
      takings: {},
    }
  }
  const rows = randoms.get(table) ?? []
  const total = rows.filter((row) => row.rank === value).reduce((sum, row) => sum + row.weight, 0)
  const row = drawRow(rows, value, roll)
  const odds = `rank ${value} of ${table}, roll ${roll} of 100 against weights coming to ${total}`
  if (!row) return { text: 'There is nothing inside.', note: `${odds}: nothing`, takings: {} }
  if (row.kind === RANDOM_MONSTER) {
    // There is no battle yet, so nothing comes of it.
    return {
      text: `${chestMonsterLine(monsters.get(row.value), row.value, system)}\nThere are no battles yet.`,
      note: `${odds}: weight ${row.weight}, monster ${row.value}`,
      takings: {},
    }
  }
  const note = `${odds}: weight ${row.weight}`
  if (row.kind === RANDOM_ITEM) {
    return { text: `Inside: ${item(row.value)}.`, note, takings: { item: row.value } }
  }
  if (row.kind === RANDOM_GOLD) {
    return { text: `Inside: ${row.value} gold coins.`, note, takings: { gold: row.value } }
  }
  return {
    text: `Inside: something not read (a kind-${row.kind} draw, ${row.value}).`,
    note,
    takings: {},
  }
}

/** The system string a chest that is a monster says — "…really `<str_1>`!" — by its number. */
export const CHEST_WAS_REALLY = 42

/**
 * What a chest that is a monster says: the game's own message, with the
 * monster's phrase in it — the system string that is "a" or "an" and the
 * monster's name — when both read; our words, naming it or numbering it, when
 * they do not.
 */
export function chestMonsterLine(
  name: string | undefined,
  number: number,
  system: ReadonlyMap<number, string>,
): string {
  const phrase =
    name === undefined
      ? undefined
      : [...system.values()].find((text) => text === `a ${name}` || text === `an ${name}`)
  const sentence = system.get(CHEST_WAS_REALLY)
  if (phrase !== undefined && sentence?.includes('<str_1>')) {
    return renderLine(sentence, { ...DEFAULT_CONTEXT, values: { str_1: renderName(phrase) } })
      .pages.map((page) => page.text)
      .join(' ')
  }
  const who = name === undefined ? `number ${number} in the monster list` : renderName(name)
  return `The chest was really a monster — ${who}!`
}

/** An item name's markup — `veteran<1>s helm` — as the text box would show it. */
export function renderName(name: string): string {
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
  return `You open ${which}.\nWhat is inside is not read yet: its first value is ${hex(treasure.packed)}.`
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
