import type { Outfit } from '@minstrel/actor'
import {
  armsFor,
  type LevelRow,
  type LevelTable,
  levelAt,
  type PresetOutfit,
  partName,
} from '@minstrel/game-formats'
import type { Equipped, Slot } from './equipment.ts'

/**
 * The Hero's numbers: their vocation's level table, where their experience
 * puts them in it, and what seeds have added.
 *
 * **The Hero is a Minstrel, and `level6` is the Minstrel's.** The cartridge has
 * thirteen level tables, `level0` to `level12`, one to a vocation in the order
 * the status screen names them — Guardian first, Minstrel seventh (FORMAT.md,
 * "Level tables"). The code that gives the Hero their vocation is not read;
 * what settles it is a witness. A published guide says the Hero "starts the
 * main game as a minstrel", and its Minstrel attribute table agrees with
 * `level6` at all 72 values it gives and its spell list with the spell table's
 * 6; `level0`, the Guardian's, agrees at 2. The Minstrel is 6 in all three
 * places that number vocations: the level tables, the field menu's names
 * (`str_tm` 2100 on) and the spell table.
 */
export const HERO_VOCATION = 'Minstrel'
/** The Minstrel's number — see above. */
export const HERO_VOCATION_NUMBER = 6
/** Where every vocation's level table lives: `level0` to `level12`, one each. */
export const LEVELS_FOLDER = '/data/prm/level'
/** Where the field menu's names for the vocations begin in `str_tm`: 2100 the Guardian. */
export const VOCATION_WORDS = 2100

/**
 * The gold the Hero starts the slice with: 180 — **seen, not read**. A let's
 * play of the European release shows 180 at 2.1 before any fight or chest,
 * and again at the shop before the first cupboard's ten coins; nothing found
 * on the cartridge gives a new game's purse. Whether the prologue before the
 * slice hands any over is not seen.
 */
export const STARTING_GOLD = 180

/** The copper sword's item id: `d_w004`, its icon, and Ivor's weapon in `attnpc`. */
export const COPPER_SWORD = 20004

/**
 * What the Hero wears: the celestial suit, the celestial stockings and the
 * celestial shoes, and no headgear.
 *
 * **Seen, not read.** A let's play of the European release shows the
 * equipment screen at level 1 so — those three, the copper sword, and
 * nothing on the head, arms or shield arm. They were chosen for the slice on
 * 14 September 2026 before that, from the items' own words (`itemexpl`): the
 * shoes are "well-suited to apprenticing Celestrians". No table, script or
 * save found puts them on the Hero — the three ids are never listed together
 * anywhere on the cartridge. The game's own presets dress a Minstrel otherwise
 * (FORMAT.md, "Character presets").
 */
export const HERO_OUTFIT = { armour: 13007, legwear: 16215, footwear: 17120 } as const

/**
 * What the Hero has on when the slice opens: the copper sword and
 * {@link HERO_OUTFIT}, and nothing else — **seen, not read**, in the same
 * let's play, whose Defence of 14 at level 1 is resilience 8 and the three
 * pieces' 2 each. The sword was the tester's word first, 15 September 2026.
 * Nothing found on the cartridge lists what a new game starts with.
 */
export const STARTING_EQUIPMENT: Equipped = new Map<Slot, number>([
  ['weapon', COPPER_SWORD],
  ['body', HERO_OUTFIT.armour],
  ['legs', HERO_OUTFIT.legwear],
  ['feet', HERO_OUTFIT.footwear],
])

/**
 * The Hero's face, `p_f006` — the face the character presets give the man of
 * every vocation. That a preset's second 90xx value names a face is INFERRED
 * (FORMAT.md, "Character presets"); that the Hero has a man's face is ours:
 * the slice does not say, and the face is the player's to make in a character
 * creation the slice leaves out.
 */
export const HERO_FACE = 'p_f006'

/**
 * The Hero's hair — **ours**: style 00 in its variant `a`, in colour 0. The
 * player chooses hair at character creation, which the slice leaves out
 * ("Preset appearance — no character creation"), so a fixed choice is the
 * slice's own and not a gap. Hair is a style (`p_h<ss>0<v>.nsbmd`, 24 styles in
 * variants `a` to `e`) coloured by a texture file (`p_h<ss><c>a.nsbtx`, up to
 * ten colours to a style). FORMAT.md, "Character parts".
 */
export const HERO_HAIR = { model: 'p_h000a', colour: 'p_h000a' } as const

/** The Hero dressed, part by part — see {@link HERO_OUTFIT}. */
export function heroOutfit(): Outfit {
  const part = (id: number | undefined): string => {
    const name = id === undefined ? undefined : partName(id)
    if (!name) throw new Error(`item ${id} is worn as no part`)
    return name
  }
  return {
    body: part(HERO_OUTFIT.armour),
    legs: part(HERO_OUTFIT.legwear),
    face: HERO_FACE,
    hair: HERO_HAIR.model,
    // No gloves, so the arms are the body's own.
    textures: [part(armsFor(HERO_OUTFIT.armour)), part(HERO_OUTFIT.footwear), HERO_HAIR.colour],
  }
}

/**
 * Where a weapon and a shield are carried: in the hands in battle, on the back
 * otherwise. INFERRED, from a let's play — the Hero holds the copper sword in
 * battle, Ivor his sword and pot lid, and outside battle the Hero's sword lies
 * across the back, grip up over the right shoulder and blade down to the left hip,
 * with a shield upright at the left side, both flat against the back whatever
 * the legs do — and from the rig: the hands are the forearms, `arm1R` and
 * `arm1L`, and the back is `usiro`, Japanese for behind, the rig's one bone
 * that is no limb: behind the shoulders, moving with the trunk and not the
 * hips, so what hangs there stays flat against the back through the run.
 */
export type Carry = 'hands' | 'back'

/** The bones a weapon and a shield hang from, carried each way — see {@link Carry}. */
export const CARRY_BONES: Readonly<
  Record<Carry, { readonly weapon: string; readonly shield: string }>
> = {
  hands: { weapon: 'arm1R', shield: 'arm1L' },
  back: { weapon: 'usiro', shield: 'usiro' },
}

/**
 * How a weapon and a shield sit on the back — **ours**, matched to the let's
 * play; the game's own is in its code. A matrix in `usiro`'s space, column by
 * column as the DS keeps one: where the part's x, y and z go, then where its
 * origin goes. The rig faces +z with its left at +x; `usiro` sits at
 * (0, 13, −2) of a 23-unit figure, behind the shoulders, so the hips are four
 * units below it.
 *
 * A weapon is modelled along +z from its guard, its grip behind, its guard
 * across x and its flat in y: on the back the blade runs from under the right
 * shoulder down to the left hip, about 60° below level, flat against the back,
 * its guard a little right of the spine, level with the bone and 1.2 behind
 * it, clear of the back — so the grip stands up over the right shoulder, as
 * the let's play shows from behind and in front. A shield is modelled along the forearm — long in x, its
 * face in y — and stands upright behind the left hip, face outward.
 */
const BLADE_X = Math.cos((60 * Math.PI) / 180)
const BLADE_Y = -Math.sin((60 * Math.PI) / 180)
export const BACK_TURNS: { readonly weapon: Float32Array; readonly shield: Float32Array } = {
  // x → across the blade in the back's plane, y → out from the back, z → down and to the left.
  weapon: Float32Array.of(
    -BLADE_Y,
    BLADE_X,
    0,
    0,
    0,
    0,
    1,
    0,
    BLADE_X,
    BLADE_Y,
    0,
    0,
    -1.5,
    0.5,
    -1.2,
    1,
  ),
  // x → up, y → backward, z → across; the origin behind the left hip.
  shield: Float32Array.of(0, 1, 0, 0, 0, 0, -1, 0, -1, 0, 0, 0, 2.5, -3.5, -0.5, 1),
}

/**
 * What the Hero shows where a slot is empty: the underclothes. INFERRED from
 * the parts alone: of the cartridge's 192 body models, 79 legwear models and
 * 89 footwear textures, 36, 2 and 2 have no item behind their number, and
 * **090 is the one number all three lists share** — `p_b090`, `p_p090`,
 * `p_r090` — a body, legs and feet made as a set for no item to put on. Not
 * seen in the game; a slot whose bare part is missing keeps what the Hero
 * starts in, {@link HERO_OUTFIT}.
 */
export const BARE_OUTFIT = { armour: 13090, legwear: 16090, footwear: 17090 } as const

/**
 * The Hero dressed in what they wear and wield: each worn piece's part by its
 * item's number (`partName`), the gloves' arms or else the body's own, the
 * headgear on the head, and the weapon and shield carried as {@link Carry}
 * says. `has` says which parts and texture files the cartridge holds: an item
 * with none — an accessory, a knife — is not drawn. A slot with nothing in it
 * shows the underclothes, {@link BARE_OUTFIT}, as the rig needs a body and
 * legs.
 */
export function outfitOf(equipped: Equipped, carry: Carry, has: (name: string) => boolean): Outfit {
  const worn = (slot: Slot): { readonly id: number; readonly name: string } | undefined => {
    const id = equipped.get(slot)
    const name = id === undefined ? undefined : partName(id)
    return id !== undefined && name !== undefined && has(name) ? { id, name } : undefined
  }
  const part = (id: number) => ({ id, name: partName(id) as string })
  const underneath = (id: number, fallback: number) => {
    const found = part(id)
    return has(found.name) ? found : part(fallback)
  }
  const body = worn('body') ?? underneath(BARE_OUTFIT.armour, HERO_OUTFIT.armour)
  const legs = worn('legs') ?? underneath(BARE_OUTFIT.legwear, HERO_OUTFIT.legwear)
  const feet = worn('feet') ?? underneath(BARE_OUTFIT.footwear, HERO_OUTFIT.footwear)
  const bare = armsFor(body.id)
  const arms = worn('arms')?.name ?? (bare === undefined ? undefined : partName(bare))
  const head = worn('head')
  const weapon = worn('weapon')
  const shield = worn('shield')
  const bones = CARRY_BONES[carry]
  const turned = (turn: Float32Array) => (carry === 'back' ? { turn } : {})
  return {
    body: body.name,
    legs: legs.name,
    face: HERO_FACE,
    hair: HERO_HAIR.model,
    ...(head ? { headgear: head.name } : {}),
    textures: [arms, feet.name, HERO_HAIR.colour].filter(
      (name): name is string => name !== undefined && has(name),
    ),
    attached: [
      ...(weapon ? [{ part: weapon.name, bone: bones.weapon, ...turned(BACK_TURNS.weapon) }] : []),
      ...(shield ? [{ part: shield.name, bone: bones.shield, ...turned(BACK_TURNS.shield) }] : []),
    ],
  }
}

/** What a seed can raise — see `SEED_GAINS` in `use.ts`. */
export type GainStat =
  | 'maxHp'
  | 'maxMp'
  | 'strength'
  | 'deftness'
  | 'agility'
  | 'resilience'
  | 'magicalMight'
  | 'magicalMending'
  | 'charm'
  | 'skillPoints'

export const GAIN_STATS: readonly GainStat[] = [
  'maxHp',
  'maxMp',
  'strength',
  'deftness',
  'agility',
  'resilience',
  'magicalMight',
  'magicalMending',
  'charm',
  'skillPoints',
]

/** What seeds have added, for good, to the level table's numbers. */
export type Gains = Readonly<Partial<Record<GainStat, number>>>

/** Gains with one more. */
export function gain(gains: Gains, stat: GainStat, amount: number): Gains {
  return { ...gains, [stat]: (gains[stat] ?? 0) + amount }
}

/** A level's numbers with what seeds have added. Skill points are not a level's. */
export function withGains(row: LevelRow, gains: Gains): LevelRow {
  const plus = (stat: GainStat, value: number) => value + (gains[stat] ?? 0)
  return {
    ...row,
    maxHp: plus('maxHp', row.maxHp),
    maxMp: plus('maxMp', row.maxMp),
    strength: plus('strength', row.strength),
    deftness: plus('deftness', row.deftness),
    agility: plus('agility', row.agility),
    resilience: plus('resilience', row.resilience),
    magicalMight: plus('magicalMight', row.magicalMight),
    magicalMending: plus('magicalMending', row.magicalMending),
    charm: plus('charm', row.charm),
  }
}

/** Where the Hero stands: their vocation, their level, and the next one. */
export interface Standing {
  /**
   * The vocation's name. **Undefined where there is none to give**: a story
   * companion's numbers come from `attnpc`, which has no vocation column at
   * all — see `docs/party-and-vocations.md`.
   */
  readonly vocation: string | undefined
  readonly exp: number
  /** This level's numbers, with the seeds' gains. */
  readonly level: LevelRow
  /** The next level, or undefined at the last. */
  readonly next: LevelRow | undefined
}

export function standing(table: LevelTable, exp: number, gains: Gains = {}): Standing {
  const level = levelAt(table, exp)
  // Levels count from 1, so the row after level n is at index n.
  return {
    vocation: HERO_VOCATION,
    exp,
    level: withGains(level, gains),
    next: table.levels[level.level],
  }
}

/**
 * The experience a level stands at — a **testing aid, ours**.
 *
 * The level is clamped to the table, and what comes back is that level's own
 * threshold. Moving the experience rather than the level is what keeps the two
 * consistent: everything else asks {@link levelAt} what level the Hero is, so
 * a level set on its own would be forgotten by the next question, and the
 * menu's "level n at m experience" would read against it.
 *
 * The table's thresholds rise but are not required to rise strictly, so a
 * level sharing its threshold with a later one lands on the later. Callers
 * report what {@link standing} then says rather than what they asked for.
 */
export function expAtLevel(table: LevelTable, level: number): number {
  const clamped = Math.max(1, Math.min(table.levels.length, Math.trunc(level)))
  return (table.levels[clamped - 1] as LevelRow).exp
}

/** The experience for the level `by` along from the one this much experience stands at. */
export function expLevelledBy(table: LevelTable, exp: number, by: number): number {
  return expAtLevel(table, levelAt(table, exp).level + by)
}

/** A number a level table gives, which is every seed's stat but the skill points. */
type LevelStat = Exclude<GainStat, 'skillPoints'>

/** The numbers a level change is reported by, with the words the result uses. */
export const LEVEL_GAINS: readonly (readonly [string, LevelStat])[] = [
  ['Max HP', 'maxHp'],
  ['Max MP', 'maxMp'],
  ['Strength', 'strength'],
  ['Resilience', 'resilience'],
  ['Agility', 'agility'],
]

/**
 * What a level brought, as the battle's result and the level key both say it:
 * `Max HP +3 · Max MP +1 · …`, signed, so a level given up reads as a loss.
 */
export function levelGainsText(before: LevelRow, after: LevelRow): string {
  return LEVEL_GAINS.map(([label, stat]) => {
    const moved = after[stat] - before[stat]
    return `${label} ${moved < 0 ? '' : '+'}${moved}`
  }).join(' · ')
}

/**
 * The face a preset's value 78 names: `9000` and its number, so `9006` is
 * `p_f006`.
 *
 * **INFERRED** (FORMAT.md, "Character presets"): on all 41 presets in
 * `charapreset.bin` and `presetdt` the value lands on a face file that exists,
 * and it is `f006` on every man's vocation record and `f005` on every woman's.
 * It is kept apart from {@link partName} because that answers "which part is
 * this *item* worn as", and no item is a face.
 */
export function faceName(id: number): string | undefined {
  return Number.isInteger(id) && Math.floor(id / 1000) === 9
    ? `p_f${String(id % 1000).padStart(3, '0')}`
    : undefined
}

/**
 * A character preset, dressed — see `readCharacterPresets`.
 *
 * This is `outfitOf`'s sibling: that one dresses whoever is wearing a set of
 * equipment, this one dresses a ready-made character out of the ids the file
 * gives. **Hair is not among them.** A preset names a face, armour, legwear,
 * gloves, footwear, headgear, a weapon, a shield and the arms, and nothing
 * about hair at all — so the hair here is the Hero's, and **ours**, exactly as
 * it is everywhere else until character creation offers a choice.
 *
 * A part the wardrobe has not got is left out rather than guessed at, which is
 * what `has` is for; a preset naming nothing for a slot uses 0 or
 * `0xFFFFFFFF`, and both fail `partName` or `has` and fall out the same way.
 *
 * **Except the body and legs, which the rig must have**, and there the same
 * rule as {@link outfitOf}: the underclothes, {@link BARE_OUTFIT}. That is not
 * a guess to paper over a gap — **the presets really do name legwear that is
 * not on the cartridge**. Twelve of the twenty-nine want one of `p_p190`,
 * `p_p201`, `p_p101`, `p_p102`, `p_p110` or `p_p112`, and none of the six is
 * in `chara_pc.gp2` or `chara_pd.gp2` while their neighbours — `p_p191`,
 * `p_p200`, `p_p202`, `p_p100`, `p_p103` — are. FORMAT.md notices two of them
 * by hand ("her legwear 16190 naming no item"); the sweep found the rest.
 * So bare legs under a preset's armour is the file's own arrangement, read
 * the way the Hero's slots already are.
 */
export function outfitOfPreset(
  preset: PresetOutfit,
  carry: Carry,
  has: (name: string) => boolean,
): Outfit | undefined {
  const named = (id: number): string | undefined => {
    const name = partName(id)
    return name !== undefined && has(name) ? name : undefined
  }
  // The rig needs a body and legs, so these fall back to the underclothes and
  // then to the Hero's own, exactly as `outfitOf` does for an empty slot.
  const underneath = (id: number, bare: number, fallback: number): string | undefined =>
    named(id) ?? named(bare) ?? named(fallback)
  const body = underneath(preset.armour, BARE_OUTFIT.armour, HERO_OUTFIT.armour)
  const legs = underneath(preset.legwear, BARE_OUTFIT.legwear, HERO_OUTFIT.legwear)
  // Only when even the underclothes are missing is there nothing to dress.
  if (!body || !legs) return undefined
  const face = faceName(preset.face)
  const headgear = named(preset.headgear)
  const weapon = named(preset.weapon)
  const shield = named(preset.shield)
  const bones = CARRY_BONES[carry]
  // Gloves take the arms' place when there are any; otherwise the body's own.
  const arms = named(preset.gloves) ?? named(preset.arms) ?? named(armsFor(preset.armour) ?? 0)
  return {
    body,
    legs,
    ...(face && has(face) ? { face } : {}),
    hair: HERO_HAIR.model,
    ...(headgear ? { headgear } : {}),
    textures: [arms, named(preset.footwear), HERO_HAIR.colour].filter(
      (name): name is string => name !== undefined && has(name),
    ),
    attached: [
      ...(weapon ? [{ part: weapon, bone: bones.weapon }] : []),
      ...(shield ? [{ part: shield, bone: bones.shield }] : []),
    ],
  }
}
