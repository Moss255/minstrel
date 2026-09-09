import {
  type Animation,
  isNsbca,
  isNsbmd,
  type Model,
  readNsbca,
  readNsbmd,
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
 * `chara_pc.gp2` holds 796 parts whose names say what they are — 192 `p_b`
 * bodies, 200 `p_w` weapons, 142 `p_m`, 121 `p_h` hair, 79 `p_p` legs, 35 `p_s`
 * shoes, 24 `p_f` faces — and **only the bodies and legs carry the shared
 * fourteen-bone rig**, 274 parts of the 796. Those pose themselves.
 *
 * The rest carry a single bone of their own and sit at the origin until
 * something puts them on the figure. That is why a character built from the
 * rigged parts alone has no head: a body and a pair of legs end at the neck.
 */
export const CHARACTER_PARTS = /\/chara_pc\.gp2\/(p_[a-z]+\w*)\.nsbmd$/

/**
 * Which bone an unrigged part hangs from, by what its name says it is.
 *
 * **INFERRED from the naming and confirmed by where it lands.** The rig's `head`
 * bone sits at y 16.27 on a body reaching 16.57, and a face put through it
 * lands at 15.94 to 20.26 — on the neck, at a fifth of the figure's height,
 * which is the proportion this game draws.
 *
 * Shoes (`p_s`) and weapons (`p_w`) are not placed: a shoe belongs to two feet
 * and a weapon to a hand that is holding it, and neither is established.
 */
export const ATTACHMENT_BONES: Record<string, string> = { h: 'head', f: 'head' }

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

/** Every part and motion a walk of the cartridge turned up. */
export interface Library {
  readonly parts: ReadonlyMap<string, Model>
  /**
   * Every animation of a given name, one per pack that carries it.
   *
   * **A name does not identify a motion.** The family carries four animations
   * called `stand` or `walk` between its packs, and three of them are `stand`:
   * `mp0200n` and `mp0200f` hold an eight-frame one each, and `mp0200n2` a
   * sixteen-frame one that lifts the whole figure 7.5% of its own height off
   * the floor. Keeping only the last one read picks between them by archive
   * order, which is how the character came to stand in the air. They are all
   * kept, and something that can measure them chooses — see `chooseFigure`.
   */
  readonly motions: ReadonlyMap<string, readonly Animation[]>
}

/** A library being filled in as the cartridge is walked. */
export interface LibraryBuilder extends Library {
  /**
   * Offer one leaf, keeping it if it is a part or a motion.
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
  const motions = new Map<string, Animation[]>()

  return {
    parts,
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
