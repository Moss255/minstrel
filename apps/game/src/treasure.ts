import type { Treasure } from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import type { Vertex } from '@minstrel/nitro-gfx'
import type { Talker } from './talk.ts'

/**
 * Treasure: opening it, remembering that it is open, and a marker to find it by.
 *
 * **The marker is not the game's.** No file on the cartridge found so far is a
 * chest, pot or barrel model — see `FORMAT.md`, "Treasure" — so each treasure
 * with a position is drawn as a small cube, gold while it is shut and grey once
 * it is opened, until the game's own models turn up.
 *
 * **Nor are the words.** What a treasure holds is not read yet, and the
 * cartridge's own text for opening one has not been found; the box says which
 * treasure was opened, by its number, and the value its contents must be in.
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

const hex = (value: number) => `0x${value.toString(16).padStart(8, '0')}`

/** What the text box says on opening a treasure, or on coming back to one already open. */
export function treasureText(treasure: Treasure, alreadyOpen: boolean): string {
  const which = treasure.index === undefined ? 'this treasure' : `treasure #${treasure.index}`
  if (alreadyOpen) return `You have already opened ${which}.`
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
): Piece[] {
  const shut = { vertices: [] as Vertex[], indices: [] as number[] }
  const open = { vertices: [] as Vertex[], indices: [] as number[] }
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    if (!at) continue
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
