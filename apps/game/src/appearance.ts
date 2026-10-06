import {
  BUILD_ONE,
  BUILDS_A_SEX,
  type Build,
  type BuildTable,
  buildFor,
} from '@minstrel/game-formats'
import { SEX } from './equipment.ts'

/**
 * What a character looks like — the knobs character creation turns.
 *
 * **The knob set is the game's own**, read from overlay 15's debug viewer,
 * whose labels are `[Gender] [Face] [Eye Colour] [Skin Colour] [Hairstyle]
 * [Hair Colour]`, then seven equipment slots, then `[Build]`. Equipment is a
 * member's, not an appearance's — see `Member.outfits` — so this is the other
 * seven.
 *
 * **Where the game keeps them** is the character record's `+0x160`–`+0x17B`
 * block, which is the live struct's `+0x488` copied whole: ten equipment
 * slots, the sex in `+0x174` bit 0, two colour fields in the rest of that
 * byte, a third in `+0x175`, and the build as two `fx16` at `+0x178`. **The
 * face and the hair are slots h2 and h3**, `+0x164` and `+0x166`, each an
 * item — faces 9020–9033, hairs 9000–9013 — drawn as the item's model for the
 * sex (`CharaParts_GetPartNumbers`, read 4 October 2026); an earlier reading
 * here put the face at `+0x01` bits 0–3, which is something else. See
 * `docs/party-and-vocations.md`.
 *
 * **Three of the seven cannot be drawn here**, and say so below rather than
 * being left out: nothing in `render` swaps a palette.
 */

/** How many faces there are: `p_f000` to `p_f023` on the cartridge. */
export const FACES = 24

/**
 * The hair styles, by the model number each begins at — `p_h000`, `p_h010`,
 * … `p_h230`, 24 of them. A style's shape is `p_h<style><variant>.nsbmd` and
 * its colour a texture `p_h<style + colour>a.nsbtx`, which is why the two are
 * separate fields here and separate files there. See FORMAT.md, "Character
 * parts".
 */
export const HAIR_STYLES = 24
/** Variants `a` to `e` of a style's shape; style 010 alone has an `f`. */
export const HAIR_VARIANTS = 'abcde'
/** Colours within a style: the ten texture files of its band. */
export const HAIR_COLOURS = 10

/** How many values the colour fields hold — 3 bits, 4 bits and 4 bits. */
export const SKINS = 8
export const EYES = 16

/** What a character looks like. Every field is a choice somebody made. */
export interface Appearance {
  /** Which sex — see `SEX` in `equipment.ts`. It decides the build row and what they may wear. */
  readonly sex: number
  /** Which face, 0 to {@link FACES} − 1: `p_f000` on. */
  readonly face: number
  /** Which hair style, 0 to {@link HAIR_STYLES} − 1; the model number is ten times it. */
  readonly hair: number
  /** Which shape of that style, 0 to 4: the `a` to `e` of the model's name. */
  readonly hairVariant: number
  /** Which colour of that style, 0 to {@link HAIR_COLOURS} − 1: the texture within its band. */
  readonly hairColour: number
  /** Which of the five builds for their sex — see `readBuildTable`. */
  readonly build: number
  /**
   * The skin colour, 0 to 7 — the appearance block's `+0x174` bits 1–3, which
   * the game applies to **every** body part. **Drawn** on the face and on
   * every worn part that takes it — see `skin.ts`.
   */
  readonly skin: number
  /**
   * The eye colour — `+0x174` bits 4–7, used only on the face. Eight on the
   * cartridge's table, as creation's 4×2 grid offers. **Drawn** — see `skin.ts`.
   *
   * **Which field is which is read from the game's code**, 27 September 2026:
   * `func_020730e0` hands the face's recolour the skin from bits 1–3, the eye
   * colour from bits 4–7 and the hair colour from the next byte's low four.
   */
  readonly eyes: number
}

/** The Hero's own look, until character creation chooses one. */
export const HERO_APPEARANCE: Appearance = {
  sex: SEX.male,
  // `p_f004`, face 9024, the face the presets give the man of every vocation —
  // `HERO_FACE`.
  face: 4,
  hair: 0,
  hairVariant: 0,
  hairColour: 0,
  // The middle build, which is the one the two sexes share.
  build: 3,
  skin: 0,
  eyes: 0,
}

const wrap = (value: number, count: number) => ((value % count) + count) % count

/**
 * The order character creation asks in — overlay 9's own thirteen-step table
 * at `0x0218ab9c`, one screen a knob:
 *
 * **sex → figure → hair → hair colour → face → skin colour → eye colour →
 * name.**
 *
 * Five options for the figure, ten each for hair, hair colour and face, eight
 * each for the two colours — which is the same set and the same counts this
 * file holds, arrived at from the parts on the cartridge rather than from the
 * screens. The names of the three colour knobs are INFERRED from the file
 * basenames (`sc`, `ec`, `hc`); the *order* is the step chain and is not.
 *
 * `build` is the game's "figure"; the name is not asked for here yet.
 */
export const CREATION_ORDER: readonly (keyof Appearance)[] = [
  'sex',
  'build',
  'hair',
  'hairColour',
  'face',
  'skin',
  'eyes',
]

/**
 * How many settings each knob has.
 *
 * The game's own counts, from overlay 9's grids: two sexes, five figures, ten
 * each for hair, hair colour and face, eight each for the two colours. The
 * hair *shape* is ours — the game's ten hair options are what this file calls
 * a style, and the `a`–`e` variants are a separate axis the screens do not
 * offer. See `docs/party-and-vocations.md`.
 */
export const KNOB_SETTINGS: Readonly<Record<keyof Appearance, number>> = {
  sex: 2,
  face: FACES,
  hair: HAIR_STYLES,
  hairVariant: HAIR_VARIANTS.length,
  hairColour: HAIR_COLOURS,
  build: BUILDS_A_SEX,
  skin: SKINS,
  eyes: EYES,
}

/**
 * How many settings each knob's **creation screen** offers, which is not
 * always how many the field holds.
 *
 * Read from overlay 9's grids: two sexes, five figures, **ten** hairstyles,
 * ten hair colours, ten faces, **eight** skin colours and **eight** eye
 * colours. Two of those differ from {@link KNOB_SETTINGS}:
 *
 * - the cartridge has **24** hair styles and the screen offers ten — ten a
 *   sex, INFERRED, since the files are `bg_cm_ht_m` and `bg_cm_ht_f`;
 * - the eye-colour field is four bits and so holds sixteen, but the screen is
 *   a 4×2 grid of **eight**.
 *
 * So the screens are a subset, and the appearance panel can still reach the
 * rest. **Which settings the ten hairstyles and faces are is read** — see
 * {@link CREATION_ITEMS}.
 */
export const CREATION_SETTINGS: Readonly<Record<keyof Appearance, number>> = {
  sex: 2,
  build: 5,
  hair: 10,
  hairColour: 10,
  face: 10,
  skin: 8,
  eyes: 8,
  hairVariant: HAIR_VARIANTS.length,
}

/** What a knob is called, in our words — the game's captions are drawn art, not text. */
export const KNOB_NAMES: Readonly<Record<keyof Appearance, string>> = {
  sex: 'Gender',
  build: 'Figure',
  hair: 'Hairstyle',
  hairColour: 'Hair Colour',
  face: 'Face',
  skin: 'Skin Colour',
  eyes: 'Eye Colour',
  hairVariant: 'Hair shape',
}

/**
 * **What creation's ten hairs and ten faces are: items**, `9000 +` and
 * `9020 +` the place each choice is remapped to by sex — overlay 9,
 * `func_ov009_02188b14`, written to slots h3 and h2 at `0x02188a3c`–
 * `0x02188a5c` and `0x02188a04`–`0x02188a14` (read 4 October 2026). The man's
 * hair is the choice itself; the woman's begins with 9006; the man's face
 * begins with 9024, the woman's with 9021. The part drawn is the item's model
 * for the sex — `modelNumber` in `@minstrel/game-formats` — so the man's hairs
 * are `p_h000`–`p_h090` and the woman's `p_h180`, `p_h100`–`p_h150`, `p_h160`,
 * `p_h170`, `p_h190`. Hairs 9010–9013 and faces 9030–9033 are no choice's:
 * the four ready-made characters wear them.
 */
export const CREATION_ITEMS = {
  hair: { base: 9000, man: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], woman: [6, 0, 1, 2, 3, 4, 5, 7, 8, 9] },
  face: { base: 9020, man: [4, 0, 1, 2, 3, 5, 6, 7, 8, 9], woman: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9] },
} as const

/** An item's model number for a sex — given by the caller from `itemdt`, see `modelNumber`. */
export type ModelOf = (item: number, sex: number) => number | undefined

/**
 * The look a creation screen's row sets: for the hair and the face, the
 * model of the item that row is ({@link CREATION_ITEMS}); for anything else,
 * or without the items to ask, the row itself.
 */
function creationSet(look: Appearance, knob: keyof Appearance, row: number, modelOf?: ModelOf) {
  if (modelOf && (knob === 'hair' || knob === 'face')) {
    const items = CREATION_ITEMS[knob]
    const at = (look.sex === SEX.female ? items.woman : items.man)[row]
    const model = at === undefined ? undefined : modelOf(items.base + at, look.sex)
    if (model !== undefined) return setKnob(look, knob, knob === 'hair' ? model / 10 : model)
  }
  return setKnob(look, knob, row)
}

/** An appearance with one knob turned, wrapping round — what a creation screen does. */
export function turned(look: Appearance, knob: keyof Appearance, by: number): Appearance {
  return { ...look, [knob]: wrap(look[knob] + by, KNOB_SETTINGS[knob]) }
}

/** An appearance with one knob set outright — what choosing a grid cell does. */
export function setKnob(look: Appearance, knob: keyof Appearance, to: number): Appearance {
  return { ...look, [knob]: wrap(to, KNOB_SETTINGS[knob]) }
}

/** The face part an appearance names: `p_f006`. */
export const faceOf = (look: Appearance): string => `p_f${String(look.face).padStart(3, '0')}`

/**
 * The hair model an appearance names: `p_h010c` is style 1, variant `c`.
 *
 * **The game's letter is the headgear's** — `hairLetter` in `hero.ts` —
 * and a caller that knows what is worn gives it as `letter`; the
 * `hairVariant` knob is ours, for looking at the shapes.
 *
 * Style 010 is the only one with a sixth variant, so a variant past what a
 * style has falls back to its first rather than naming a file that is not
 * there — `has` decides, and this keeps the name inside the band.
 */
export function hairOf(look: Appearance, has?: (name: string) => boolean, letter?: string): string {
  const style = String(look.hair * 10).padStart(3, '0')
  const wanted = `p_h${style}${letter ?? HAIR_VARIANTS[look.hairVariant] ?? 'a'}`
  return !has || has(wanted) ? wanted : `p_h${style}a`
}

/**
 * The hair-colour texture an appearance names: the style's band plus the
 * colour, `p_h013a` for style 1 colour 3.
 *
 * The high styles' bands are not full — the cartridge has textures for 000 to
 * 200 and then only 210, 216, 220, 226, 230, 234 — so a colour with no file
 * falls back to the band's own, which is the style in its first colour.
 */
export function hairColourOf(look: Appearance, has?: (name: string) => boolean): string {
  const wanted = `p_h${String(look.hair * 10 + look.hairColour).padStart(3, '0')}a`
  return !has || has(wanted) ? wanted : `p_h${String(look.hair * 10).padStart(3, '0')}a`
}

/**
 * The build an appearance names, as a scale on the figure — or undefined where
 * the table did not read, which leaves the figure its own size.
 */
export function buildOf(look: Appearance, table: BuildTable | undefined): Build | undefined {
  return table ? buildFor(table, look.sex, look.build) : undefined
}

/** A build as a pair of multipliers, `fx16`'s 4096 being one. */
export function scaleOf(build: Build | undefined): { height: number; width: number } {
  return build
    ? { height: build.height / BUILD_ONE, width: build.width / BUILD_ONE }
    : { height: 1, width: 1 }
}

/**
 * A character part-made: the look so far, and which of {@link CREATION_ORDER}
 * is being asked.
 *
 * **One screen a knob**, which is how overlay 9 does it: its thirteen-step
 * table is a step per knob, each laying out a grid and reading one choice.
 * The walk is the same one whoever is being made — the game runs overlay 9
 * both for the Hero, from scene 21, and for a recruit, from Patty's step 4 —
 * so it lives here rather than in either caller.
 */
export interface Making {
  readonly look: Appearance
  readonly at: number
}

/** The first screen, with nothing yet chosen. */
export const startMaking = (look: Appearance = HERO_APPEARANCE): Making => ({ look, at: 0 })

/** The knob a step asks, or undefined once every one has been answered. */
export const knobAt = (at: number): keyof Appearance | undefined => CREATION_ORDER[at]

/**
 * The heading over a creation screen.
 *
 * **Ours.** Overlay 9's captions are drawn art rather than text, so there is
 * no string to read for them; what the screen *is* asking comes from
 * {@link KNOB_NAMES}, and the count from the step chain.
 */
export function makingTitle(making: Making): string {
  const knob = knobAt(making.at)
  return knob
    ? `${KNOB_NAMES[knob]} — ${making.at + 1} of ${CREATION_ORDER.length}`
    : 'Nothing is being made.'
}

/**
 * What the settings of the knob being asked show, one a row.
 *
 * The part a choice names where there is one — a face and a hair style are
 * files on the cartridge and can be named; a skin or eye colour is a palette
 * swap nothing here reads, so those count instead.
 */
export function makingRows(making: Making, modelOf?: ModelOf): string[] {
  const knob = knobAt(making.at)
  if (!knob) return []
  return Array.from({ length: CREATION_SETTINGS[knob] }, (_, at) => {
    const look = creationSet(making.look, knob, at, modelOf)
    if (knob === 'sex') return at === SEX.female ? 'Female' : 'Male'
    if (knob === 'face') return faceOf(look)
    if (knob === 'hair') return hairOf(look)
    if (knob === 'hairColour') return hairColourOf(look)
    return `${at + 1}`
  })
}

/**
 * Answering the knob being asked: the next screen, or the finished look once
 * the last of {@link CREATION_ORDER} has been answered.
 */
export function makingPick(
  making: Making,
  row: number,
  modelOf?: ModelOf,
): { made: Appearance } | { next: Making } {
  const knob = knobAt(making.at)
  if (!knob) return { made: making.look }
  const look = creationSet(making.look, knob, row, modelOf)
  const at = making.at + 1
  return at >= CREATION_ORDER.length ? { made: look } : { next: { look, at } }
}
