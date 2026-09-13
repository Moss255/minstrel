import { type Catalogue, catalogue, scanCartridge } from '@minstrel/cartridge'
import { type Animation, type Model, readNsbmd } from '@minstrel/nitro-gfx'
import { floorOf } from './cast.ts'

/**
 * How an event's characters look: a model out of `/data/chara_sub`, and the
 * motions it is handed — its own, in the archive beside the model, and those
 * of the packs the event loads for it: `/data/event_lv5/ev02010s016.chr` for
 * Erinn in the morning, with `cyotto_loop`, `kiki` and the rest. A script names
 * both without the leading `/data/`. See `event.ts`.
 *
 * A pack's motions have as many bones as its character's model: Erinn's 12 to
 * her model's 12, and the Hero's pack's 14 to the Hero's figure's 14.
 */

export interface ActorLook {
  readonly model: Model
  /** Its motions by name: its own, then its packs', a pack's winning. */
  readonly motions: ReadonlyMap<string, Animation>
  /** Its own textures, which the map's catalogue does not hold. */
  readonly catalogue: Catalogue
  /**
   * How far its feet are off its origin, measured standing — the rule the
   * map's cast uses, once for the model rather than once for each motion, so
   * a character who crouches or lies down goes down rather than being lifted.
   */
  readonly floor: number
}

const looksRead = new WeakMap<Uint8Array, Map<string, ActorLook | undefined>>()
const packsRead = new WeakMap<Uint8Array, Map<string, ReadonlyMap<string, Animation>>>()

/** A file a script names, as the cartridge walk leaves it: the file, or the files inside it. */
function leavesOf(rom: Uint8Array, file: string) {
  const path = `/data/${file}`.toLowerCase()
  return [...scanCartridge(rom, { pathFilter: `/data/${file}` })].filter((leaf) => {
    const at = leaf.path.toLowerCase()
    return at === path || at.startsWith(`${path}/`)
  })
}

function animationsOf(cat: Catalogue): Map<string, Animation> {
  const motions = new Map<string, Animation>()
  for (const list of cat.animations.values()) {
    for (const animation of list) motions.set(animation.name, animation)
  }
  return motions
}

/** The motions in a pack, by name; empty when it will not read. Kept once read. */
export function packMotions(rom: Uint8Array, file: string): ReadonlyMap<string, Animation> {
  let byFile = packsRead.get(rom)
  if (!byFile) {
    byFile = new Map()
    packsRead.set(rom, byFile)
  }
  const already = byFile.get(file)
  if (already) return already
  let motions: ReadonlyMap<string, Animation> = new Map()
  try {
    motions = animationsOf(catalogue(leavesOf(rom, file)))
  } catch {
    // A pack that will not read hands its character nothing.
  }
  byFile.set(file, motions)
  return motions
}

/** An event character's look; undefined when its model will not read. Kept once read. */
export function actorLookOf(
  rom: Uint8Array,
  model: string,
  packs: readonly string[],
): ActorLook | undefined {
  let byKey = looksRead.get(rom)
  if (!byKey) {
    byKey = new Map()
    looksRead.set(rom, byKey)
  }
  const key = [model, ...packs].join('|')
  if (byKey.has(key)) return byKey.get(key)
  let look: ActorLook | undefined
  try {
    const cat = catalogue(leavesOf(rom, model))
    const leaf = cat.models[0]
    const read = leaf ? readNsbmd(leaf.bytes).models[0] : undefined
    if (read) {
      const motions = animationsOf(cat)
      for (const pack of packs)
        for (const [name, motion] of packMotions(rom, pack)) motions.set(name, motion)
      look = { model: read, motions, catalogue: cat, floor: floorOf(read, motions.get('stand')) }
    }
  } catch {
    look = undefined
  }
  byKey.set(key, look)
  return look
}
