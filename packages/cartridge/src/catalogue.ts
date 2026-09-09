import {
  type Animation,
  isNsbca,
  isNsbmd,
  isNsbtx,
  type Model,
  type ModelMaterial,
  readNsbca,
  readNsbmd,
  readTex0,
  type TextureSet,
  textureNameForMaterial,
} from '@minstrel/nitro-gfx'
import type { Leaf } from './scan.ts'

/**
 * What a walk of the cartridge turned up, indexed the ways an asset is asked
 * for.
 *
 * The indexes exist because the cartridge's own references are by *name*, not
 * by path. A material names its texture and does not say which file holds it;
 * an animation names no model at all. So resolving either means having looked
 * at everything first, which is what this holds.
 */
export interface Catalogue {
  /** Every model container found, in walk order. */
  readonly models: readonly Leaf[]
  /**
   * Every texture found, by name, with the set it came from.
   *
   * First one wins. A map's textures are routinely in a different archive from
   * its models, so this is resolved against the whole walk rather than against
   * the archive a model happened to sit in.
   */
  readonly textures: ReadonlyMap<string, { set: TextureSet; name: string }>
  /** Animations by the archive path they were found in. */
  readonly animations: ReadonlyMap<string, readonly Animation[]>
  /**
   * The members of each container, by name, decompressed.
   *
   * Kept because a resource list names siblings by stem and something has to be
   * able to look them up.
   */
  readonly members: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>
  /** Leaves the caller's `classify` did not claim and this did not recognise. */
  readonly other: readonly Leaf[]
}

export interface CatalogueOptions {
  /**
   * Claim a leaf before the catalogue looks at it.
   *
   * Return `true` and the leaf is considered handled and indexed no further.
   * This is the hook for anything title-specific — map descriptors, collision
   * meshes, a character's parts — so that this package stays free of them.
   */
  readonly classify?: (leaf: Leaf) => boolean
}

/** Decoded pixels for one texture, ready to upload. */
export interface DecodedTexture {
  readonly pixels: Uint8Array
  readonly width: number
  readonly height: number
}

/**
 * Build a catalogue from a walk.
 *
 * Errors are swallowed per leaf on purpose: a cartridge of 50,000 members
 * always holds a few this repository cannot yet read, and one of them must not
 * take the other 49,999 with it. What will not read is simply absent, and the
 * counts in the explorer's status line are how that shows up.
 */
export function catalogue(leaves: Iterable<Leaf>, options: CatalogueOptions = {}): Catalogue {
  const models: Leaf[] = []
  const textures = new Map<string, { set: TextureSet; name: string }>()
  const animations = new Map<string, Animation[]>()
  const members = new Map<string, Map<string, Uint8Array>>()
  const other: Leaf[] = []

  for (const leaf of leaves) {
    if (leaf.archive !== '') {
      const name = leaf.path.slice(leaf.path.lastIndexOf('/') + 1)
      let bag = members.get(leaf.archive)
      if (!bag) {
        bag = new Map()
        members.set(leaf.archive, bag)
      }
      bag.set(name, leaf.bytes)
    }

    if (options.classify?.(leaf)) continue

    if (isNsbmd(leaf.bytes)) {
      models.push(leaf)
      indexTextures(leaf.bytes, textures)
      continue
    }
    if (isNsbtx(leaf.bytes)) {
      indexTextures(leaf.bytes, textures)
      continue
    }
    if (isNsbca(leaf.bytes)) {
      try {
        const list = animations.get(leaf.archive) ?? []
        list.push(...readNsbca(leaf.bytes).animations)
        animations.set(leaf.archive, list)
      } catch {
        // An animation container that will not read is not fatal to the walk.
      }
      continue
    }
    other.push(leaf)
  }

  return { models, textures, animations, members, other }
}

/** Index a container's textures by name, if it carries any. */
function indexTextures(
  bytes: Uint8Array,
  into: Map<string, { set: TextureSet; name: string }>,
): void {
  try {
    let set: TextureSet | undefined
    if (isNsbtx(bytes)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const offset = view.getUint32(0x10, true)
      set = readTex0(bytes.subarray(offset, offset + view.getUint32(offset + 4, true)))
    } else {
      set = readNsbmd(bytes).textures
    }
    if (!set) return
    for (const texture of set.textures) {
      if (!into.has(texture.name)) into.set(texture.name, { set, name: texture.name })
    }
  } catch {
    // A container whose textures will not read is not fatal to the walk.
  }
}

/**
 * Decode the texture a material binds, if the walk found it.
 *
 * The material says which texture and which palette. The name heuristic is a
 * fallback only for the few materials that declare neither.
 */
export function textureFor(
  cat: Pick<Catalogue, 'textures'>,
  material: ModelMaterial,
): DecodedTexture | undefined {
  const wanted = material.texture ?? textureNameForMaterial(material.name)
  const found = cat.textures.get(wanted)
  if (!found) return undefined
  const info = found.set.texture(found.name)
  if (!info) return undefined
  try {
    const palette =
      (material.palette === undefined ? undefined : found.set.palette(material.palette)) ??
      found.set.palette(`${info.name}_pl`) ??
      found.set.palettes[info.index]
    return { pixels: found.set.decode(info, palette), width: info.width, height: info.height }
  } catch {
    return undefined
  }
}

/**
 * The animations beside a model that drive the same skeleton.
 *
 * An animation names no model, so the pairing is by proximity and bone count:
 * what was in the same archive, driving the same number of bones.
 */
export function animationsFor(
  cat: Pick<Catalogue, 'animations'>,
  model: Model,
  archive: string,
): Animation[] {
  const list = cat.animations.get(archive) ?? []
  return list.filter((a) => a.boneCount === model.nodes.length)
}
