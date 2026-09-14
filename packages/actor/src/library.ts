import {
  type Animation,
  isNsbca,
  isNsbmd,
  isNsbtx,
  type Model,
  readNsbca,
  readNsbmd,
  readNsbtx,
  type TextureSet,
} from '@minstrel/nitro-gfx'

/**
 * The parts a character is assembled from, and the motions that drive them.
 *
 * A character on this cartridge is not a model but a set of them: several
 * pieces, each an NSBMD carrying the same fourteen-bone rig — `waist`, `chest`,
 * `arm0L`, `head`, `leg1R` and so on — drawn together and posed by one
 * animation. The motions live apart from the parts, in a pack of their own.
 */

/**
 * Which archive holds the character parts, and what each part is called.
 *
 * `chara_pc.gp2` holds 796 parts, named by the item each one is — the letter
 * is the item's category and the number its id's last three digits (see
 * `partName` in `@minstrel/game-formats`): 192 `p_b` bodies (armour), 79 `p_p`
 * legs (legwear), 142 `p_m` headgear, 35 `p_s` shields and 200 `p_w` weapons,
 * with 121 `p_h` hair and 24 `p_f` faces. **Only the bodies and legs carry the
 * shared fourteen-bone rig**, 274 parts of the 796. Those pose themselves.
 *
 * The rest carry a single bone of their own and sit at the origin until
 * something puts them on the figure. That is why a character built from the
 * rigged parts alone has no head: a body and a pair of legs end at the neck.
 */
export const CHARACTER_PARTS = /\/chara_pc\.gp2\/(p_[a-z]+\w*)\.nsbmd$/

/**
 * The texture files beside the parts, which dress them.
 *
 * Arms (`p_a`), gloves (`p_g`), footwear (`p_r`) and hair colours (`p_h`) are
 * not models: each is an NSBTX holding one texture, **named alike across the
 * files of its kind** — `p_a000_00` in 254 of the 255 arms and gloves,
 * `p_r000_00` in all 89 footwear, `p_h<style>0a_00` in each style's colours. The body binds
 * the first, the legs the second, a hair model the third; which file supplies
 * it is what the character wears. See `Figure.textures`.
 */
export const CHARACTER_TEXTURES = /\/chara_pc\.gp2\/(p_[a-z]+\w*)\.nsbtx$/

/** Where the motion packs live. */
export const MOTION_ARCHIVE = '/chara_mp.gp2/'

/**
 * The family of motion packs a character draws on.
 *
 * **One character's motions are spread across a family of packs**, not held in
 * one. The `.bcfg` beside a part names `mp0200ne`, and that pack holds exactly
 * one animation: `walk`. Standing is in `mp0200n` and `mp0200f`; `smile` is in
 * `mp0200b`, attacking in `mp0200be`, using an item in `mp0200bi`, casting in
 * `mp0200bm`. Of the cartridge's 136 packs, 56 carry a `stand` and 13 a `walk`,
 * and **not one carries both** — so a reader that takes the pack the config
 * names and stops has a character that can walk and cannot stand still.
 *
 * The family is the pack name without its trailing suffix.
 */
export const MOTION_FAMILY = 'mp0200'

/** The rig's bone count, when no motion has been read to say otherwise. */
export const RIG_BONES = 14

/** Every part, texture file and motion a walk of the cartridge turned up. */
export interface Library {
  readonly parts: ReadonlyMap<string, Model>
  /** The texture files that dress the parts, by name — see {@link CHARACTER_TEXTURES}. */
  readonly textures: ReadonlyMap<string, TextureSet>
  /**
   * Every animation of a given name, one per pack that carries it.
   *
   * **A name does not identify a motion.** The family carries four animations
   * called `stand` or `walk` between its packs, and three of them are `stand`:
   * `mp0200n` and `mp0200f` hold an eight-frame one each, and `mp0200n2` a
   * sixteen-frame one that lifts the whole figure 7.5% of its own height off
   * the floor. Keeping only the last one read picks between them by archive
   * order, which is how the character came to stand in the air. They are all
   * kept, and something that can measure them chooses — see `dressFigure`.
   */
  readonly motions: ReadonlyMap<string, readonly Animation[]>
}

/** A library being filled in as the cartridge is walked. */
export interface LibraryBuilder extends Library {
  /**
   * Offer one leaf, keeping it if it is a part, a texture file or a motion.
   *
   * **This observes; it does not claim.** A part carries its own textures — the
   * body's `a_b000_00` and `a_b000_01` are inside `p_b000.nsbmd` itself — so a
   * caller that treats a part as handled and stops cataloguing it loses the
   * textures that draw it, and the character comes out untextured with only the
   * few materials that happen to bind a texture from some other file. Whatever
   * a caller does with the return of its own `classify`, every part must still
   * reach the catalogue.
   */
  offer(path: string, bytes: Uint8Array): void
}

export function library(family = MOTION_FAMILY): LibraryBuilder {
  const parts = new Map<string, Model>()
  const textures = new Map<string, TextureSet>()
  const motions = new Map<string, Animation[]>()

  return {
    parts,
    textures,
    motions,
    offer(path, bytes) {
      const named = CHARACTER_PARTS.exec(path)
      if (named && isNsbmd(bytes)) {
        try {
          const part = readNsbmd(bytes).models[0]
          if (part?.numShapes) parts.set(named[1] as string, part)
        } catch {
          // A part that will not read simply is not drawn.
        }
        return
      }

      const file = CHARACTER_TEXTURES.exec(path)
      if (file && isNsbtx(bytes)) {
        try {
          textures.set(file[1] as string, readNsbtx(bytes))
        } catch {
          // A texture file that will not read cannot dress anyone.
        }
        return
      }

      if (!isNsbca(bytes) || !path.includes(MOTION_ARCHIVE)) return
      const archive = path.slice(0, path.lastIndexOf('/'))
      const pack = archive.slice(archive.lastIndexOf('/') + 1)
      if (!pack.startsWith(family)) return
      try {
        // Every pack of the family, not only the one a config names: the
        // motions are spread across them. Every animation of a name is kept,
        // not just the last read, because the packs disagree about what a name
        // means and archive order is no way to settle it.
        for (const motion of readNsbca(bytes).animations) {
          const list = motions.get(motion.name)
          if (list) list.push(motion)
          else motions.set(motion.name, [motion])
        }
      } catch {
        // A pack that will not read leaves its motions absent.
      }
    },
  }
}
