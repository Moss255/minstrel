import type { AttendingCharacter } from '@minstrel/game-formats'
import { blockChance, type Fighter } from '@minstrel/sim'
import type { Cue } from './battle-scene.ts'
import type { Named } from './battle-text.ts'
import { type Equipped, NOTHING_EQUIPPED } from './equipment.ts'
import { type Gains, HERO_VOCATION_NUMBER, type Standing } from './hero.ts'
import { equippedOf, equippedRecord, type SaveMember } from './save.ts'

/**
 * The party beside the Hero: who goes along and when, the fighter each is, and
 * how they are drawn. What is read is `attnpc`'s — FORMAT.md, "Attending
 * characters" — and the events' own records, which bring each in and send them
 * away; what is ours is said so below.
 *
 * Nothing here is any one character's: whoever goes along takes the next place
 * after the Hero, in battle and in the field, up to {@link PARTY_MOST}.
 */

/**
 * The most a party holds, the Hero among them.
 *
 * **Four, and the game's own shape** — read 24 September 2026, see
 * `docs/party-and-vocations.md`. The game keeps an ordered byte array of
 * character indices at `+0x397c` off its state and the count at `+0x3980`,
 * which leaves exactly the four bytes `+0x397c`–`+0x397f` for the slots. That
 * the four is a bound rather than what happens to fit is INFERRED: no check
 * against 4 has been found.
 */
export const PARTY_MOST = 4

/**
 * A place in the party — **the Hero is one of them, and they are first.**
 *
 * This used to be a set of companions beside a Hero made of loose variables,
 * which is not the game's shape and cost more than it looks: the trail buffers
 * were sized `PARTY_MOST - 1`, only the Hero had experience, equipment or
 * magic, and a companion had nothing but hit points. Every one of those is a
 * consequence of the Hero standing outside the list.
 *
 * The game puts the leader in slot 0 of the same array as everyone else, and
 * `0x0200fddc` — the function the message system asks who a speaker should
 * turn to face — is simply "slot 0". So the Hero is member 0 here.
 */
export interface Member {
  /**
   * Their number in `attnpc`. **The Hero has none**: they are in no table of
   * attending characters, which is exactly what makes them the Hero here.
   */
  readonly attnpc: number | undefined
  /** Hit points between battles; undefined is whole. */
  hp: number | undefined
  /** Magic between battles; undefined is whole. */
  mp: number | undefined
  /**
   * Their experience, **by vocation** — see {@link expOf}.
   *
   * **The game keeps thirteen**, one per vocation, and thirteen levels beside
   * them: the character record has `exp[v]` at `+0x1C` four bytes apart and
   * `level[v]` at `+0x02` one byte apart, both written by the same
   * thirteen-iteration loop at `0x02086450`, and `GetExperience`
   * (ov023 `0x021eea98`) reads `exp[current vocation]`.
   *
   * So changing vocation does not re-read one number against another table.
   * It changes an index, and what the old vocation had sits untouched until
   * they change back. This was a single number until 24 September 2026, which
   * would have quietly ruined Alltrades. See `docs/party-and-vocations.md`.
   */
  exp: Map<number, number>
  /**
   * Which vocation they are, by its number — `HERO_VOCATION_NUMBER` is the
   * Minstrel's 6. It picks which of their thirteen levels is theirs now.
   */
  vocation: number
  /**
   * Every vocation they have ever been, this one included.
   *
   * The game keeps this as a bitmask at the character record's `+0x54`, set
   * by the same function that writes the vocation — so it is not bookkeeping
   * anyone added, it is part of what changing vocation *is*. What reads it is
   * not established; it is kept because the game keeps it.
   */
  held: Set<number>
  /**
   * Which ready-made character they were made from, by its place in
   * `charapreset.bin` — see `readCharacterPresets`.
   *
   * **Undefined means the Hero's own look**, dressed from what they wear.
   * Character creation is what fills this in properly; until it does, a
   * preset is the whole of a created character's appearance, and choosing
   * one is choosing a face, a body and clothes together rather than
   * separately.
   */
  appearance: number | undefined
  /**
   * What they are called, where somebody chose. **A created character's name
   * is the player's**, given at the Quester's Rest; the Hero's and a story
   * companion's come from elsewhere, so both leave this undefined.
   */
  name: string | undefined
  /** What seeds have added, for good — see `hero.ts`. */
  gains: Gains
  /**
   * What they wear, **by vocation** — see {@link wornBy}.
   *
   * The game keeps eight equipment slot ids per vocation, at
   * `live+0x4A4 + (v - 1) * 16`, and changing vocation stows the outgoing
   * one's set and brings back the incoming one's. So a Warrior's armour waits
   * where it was while they are a Mage, exactly as their level does.
   *
   * Indexed from `v - 1` there because **zero is not a vocation** — see
   * {@link isVocation}. Here it is keyed by the vocation itself.
   */
  outfits: Map<number, Equipped>
}

/**
 * A member whose numbers come from a vocation's level table rather than being
 * fixed: **the Hero, and anyone created**.
 *
 * This was `isHero` for about an hour, and it was wrong in a way that would
 * have been expensive later. The Hero is not a different kind of thing from a
 * recruit — in this game the Hero is *made*, at the Observatory the slice
 * cuts, and the three who join at the Quester's Rest are made the same way.
 * All four have no `attnpc` number, so "has no number" cannot mean "is the
 * Hero".
 *
 * **The Hero is member 0, by position**, which is how the game has it: the
 * function the message system asks who a speaker should face is literally
 * "slot 0" — see `docs/party-and-vocations.md`.
 */
export const levelsUp = (member: Member): boolean => member.attnpc === undefined

/**
 * The experience a member has in a vocation — none until they earn some.
 *
 * Their current vocation's unless another is asked for, which is what
 * Alltrades needs: a character who changes back finds what they left.
 */
export const expOf = (member: Member, vocation = member.vocation): number =>
  member.exp.get(vocation) ?? 0

/**
 * What a member wears in a vocation — nothing, until they put something on as
 * that vocation. Theirs now unless another is asked for.
 *
 * **A vocation they have never been wears nothing**, which is what the game
 * does: the incoming vocation's block is empty the first time, and what it
 * holds is what goes on. Somebody taking up a new trade arrives in their
 * underclothes and has to dress again.
 */
export const wornBy = (member: Member, vocation = member.vocation): Equipped =>
  member.outfits.get(vocation) ?? NOTHING_EQUIPPED

/** Put something on, in the vocation they are — see {@link wornBy}. */
export function wear(member: Member, worn: Equipped): void {
  member.outfits.set(member.vocation, worn)
}

/**
 * The six vocations Alltrades offers from the start, by number.
 *
 * Read from the list builder, ov003 `0x02156054`, which writes 1 to 6 into
 * the list with no gate of any kind: `mov r2, #1` … `cmp r2, #7 / blo`.
 * In the level tables' numbering those are Warrior, Priest, Mage, Martial
 * Artist, Thief and Minstrel — the six a game begins with, which is a good
 * independent check on that numbering.
 */
export const VOCATIONS_ALWAYS: readonly number[] = [1, 2, 3, 4, 5, 6]

/**
 * The other six, **in the order the Abbey lists them**, which is not numeric:
 * Gladiator, Paladin, Armamentalist, Ranger, Sage, Luminary. Read from the
 * table at ov003 `0x0217f304`, terminated by a zero.
 */
export const VOCATIONS_UNLOCKED: readonly number[] = [7, 9, 8, 12, 10, 11]

/**
 * The story flag that unlocks one of {@link VOCATIONS_UNLOCKED}: its number
 * plus this. `add r2, r8, #0x3f` then `add r2, r2, #0x1100` — so vocation 7 is
 * flag `0x1146`.
 *
 * **Whether this host's story flags are numbered the same way is not
 * established.** Ours come from the trigger files' own flag words; these are
 * the game's own event-flag ids, read from a different place.
 */
export const VOCATION_FLAG = 0x113f

/**
 * Whether a number is a vocation somebody can be. **Zero is not** — the
 * Abbey's bounds check rejects it (`cmp r1, #0 / ble fail; cmp r1, #0xd /
 * blt ok`, ov003 `0x02155e14`), though it is what the game writes when it
 * creates the Hero. In the level tables' numbering zero is the Guardian,
 * which is what the Hero is before the game rather than a trade to take up.
 */
export const isVocation = (vocation: number): boolean =>
  Number.isInteger(vocation) && vocation >= 1 && vocation <= 12

/**
 * What Alltrades would offer, in its own order: the six, then whichever of
 * the other six their flag has been set for.
 *
 * `unlocked` is asked for the game's flag id, {@link VOCATION_FLAG} plus the
 * vocation — see the caution there. Nothing is filtered out for being the
 * vocation somebody already has: **the builder does not do that**, and what
 * it builds is handed to the setter unfiltered.
 */
export function vocationsOffered(unlocked: (flag: number) => boolean): number[] {
  return [
    ...VOCATIONS_ALWAYS,
    ...VOCATIONS_UNLOCKED.filter((vocation) => unlocked(VOCATION_FLAG + vocation)),
  ]
}

/**
 * Change a member's vocation, as Alltrades Abbey would.
 *
 * **Almost nothing happens**, and that is the point of having read the data
 * shape first. Experience and level are already per vocation, so changing is
 * moving an index: what they had as a Warrior waits where it was, and a
 * vocation they have never been starts at no experience, which is level one.
 * The game's own setter does exactly this and one thing more — it ORs the
 * bit in the "has been held" mask — so this does too.
 *
 * Skill points are deliberately untouched. They are **one pool per
 * character**, not a vocation's, and the points already spent are per tree;
 * neither belongs to the vocation being left.
 *
 * **What the Abbey asks is read now** (ov003 `0x0215582c`, reached through
 * the same service dispatcher the shop and the inn use, service 46): nothing.
 * There is no level requirement, nothing consults the "has held" mask, and
 * the vocation somebody already has is not excluded. What may be chosen is
 * {@link vocationsOffered}; this refuses only what is not a vocation at all.
 *
 * **Equipment comes with them**, because it is kept per vocation too — see
 * {@link Member.outfits}. Changing stows nothing and restores nothing: what
 * the vocation wears is simply what that vocation's set holds, which is
 * empty the first time anybody takes a trade up.
 *
 * The one thing the Abbey does that this does not is **drop to the bag
 * whatever the new vocation may not wear**. Ours keeps it; see
 * `docs/party-and-vocations.md`.
 */
export function changeVocation(member: Member, vocation: number): Member | undefined {
  if (!isVocation(vocation)) return undefined
  member.held.add(member.vocation)
  member.held.add(vocation)
  member.vocation = vocation
  return member
}

/**
 * The party as a save keeps it, and back — see `SaveMember` in `save.ts`.
 *
 * These live here rather than in `main.ts` so that the round trip can be
 * tested at all. It is the phase's done-when — "can be saved and loaded" —
 * and it was two anonymous blocks in a four-thousand-line module.
 *
 * The one asymmetry is deliberate: a save writes `null` for the Hero's
 * `attnpc` because JSON has no `undefined`, and reads it back as `undefined`
 * because that is what "is in no table" means in the running game.
 */
export function partySaved(members: readonly Member[]): SaveMember[] {
  return members.map((member) => ({
    attnpc: member.attnpc ?? null,
    // Kept as pairs, the way the bag's items are — JSON has no integer keys.
    exp: [...member.exp].sort((a, b) => a[0] - b[0]),
    hp: member.hp ?? null,
    mp: member.mp ?? null,
    vocation: member.vocation,
    ...(member.appearance === undefined ? {} : { appearance: member.appearance }),
    ...(member.name === undefined ? {} : { name: member.name }),
    ...(member.held.size === 0 ? {} : { held: [...member.held].sort((a, b) => a - b) }),
    gains: member.gains,
    // Each vocation's, the way the experiences are kept.
    outfits: [...member.outfits]
      .sort((a, b) => a[0] - b[0])
      .map(([vocation, worn]) => [vocation, equippedRecord(worn)] as const),
  }))
}

/** The party a save holds, ready to play. */
export function partyRestored(kept: readonly SaveMember[]): Member[] {
  return kept.map((member) => ({
    attnpc: member.attnpc ?? undefined,
    hp: member.hp ?? undefined,
    mp: member.mp ?? undefined,
    exp: new Map(member.exp),
    // A save from before vocations were a member's has none, and everyone in
    // it was the Minstrel the Hero is — see `HERO_VOCATION_NUMBER`.
    vocation: member.vocation ?? HERO_VOCATION_NUMBER,
    appearance: member.appearance,
    name: member.name,
    held: new Set(member.held ?? []),
    gains: { ...member.gains },
    outfits: new Map(member.outfits.map(([vocation, worn]) => [vocation, equippedOf(worn)])),
  }))
}

/** Ivor's number in `attnpc`. */
export const IVOR = 2

/**
 * The attending character an event's `205` brings, by their number in
 * `attnpc`: its argument counts the table's places from 0, and the numbers
 * from 1 — `205:1` is Ivor. INFERRED, see `OP_JOIN` in `@minstrel/game-formats`.
 */
export function joinerOf(arg: number): number {
  return arg + 1
}

/**
 * The party after an event: whoever its record sends away gone, then whoever
 * it brings in — see `OP_LEAVE` and `OP_JOIN`. Ivor joins as his call ends
 * (`ev02210`), goes on ahead at the pass (`ev22591`), joins again at the
 * landslide (`ev02350`) and goes home with his father (`ev02400`). No record
 * does both, so which comes first is ours.
 *
 * **`attnpc`'s five are all temporary.** Ivor is along for one stretch and
 * gone for good once the slice returns to Angel Falls; the others are the
 * same shape of thing. A party that stays four is made of *created*
 * characters recruited at the Quester's Rest, which is a different mechanism
 * that happens to fill the same slots — see `docs/party-and-vocations.md`.
 *
 * **The Hero is member 0 and never leaves.** A record that sends the party
 * away sends away everyone behind them.
 *
 * `joining` makes the member for someone arriving, so that this stays about
 * the roster and knows nothing about hit points or equipment. Whoever is
 * already here keeps the place — and the state — they had, which is the point
 * of ordering the party rather than rebuilding it: Ivor rejoining at the
 * landslide is the same Ivor who left at the pass.
 */
export function partyAfter(
  members: readonly Member[],
  outcome: { readonly joins: readonly number[]; readonly leaves: boolean },
  joining: (attnpc: number) => Member,
): Member[] {
  const next = outcome.leaves ? members.slice(0, 1) : [...members]
  for (const arg of outcome.joins) {
    const id = joinerOf(arg)
    if (!next.some((member) => member.attnpc === id)) next.push(joining(id))
  }
  return next.slice(0, PARTY_MOST)
}

/**
 * Who goes along, in their places after the Hero: the attending character for
 * each member after the first, in the party's own order.
 *
 * **The order is the party's, not the table's.** It used to be the table's,
 * marked "ours" because nothing said otherwise; now that the party is an
 * ordered list it is the order people joined in, which is the order the
 * game's own slots would hold them in. With one companion the two agree, so
 * nothing in the slice can tell them apart.
 *
 * A member whose number is in no table is left out rather than guessed at.
 */
export function companionsAt(
  attending: readonly AttendingCharacter[],
  members: readonly Member[],
): AttendingCharacter[] {
  return members
    .slice(1)
    .flatMap((member) => attending.filter((who) => who.id === member.attnpc).slice(0, 1))
}

/**
 * An attending character's own numbers, in the shape a level table's row has
 * so that the menu can show them the same way.
 *
 * **A story companion does not level.** Their numbers are `attnpc`'s — Ivor is
 * level 3 with 25 hit points there, and `companionFighter` already fights with
 * them. Reading one against a level table instead gives the Hero's numbers
 * under somebody else's name.
 *
 * Their experience is not in `attnpc` and neither is a next level, because
 * they gain neither. **Nor is a vocation**: the record carries a level, nine
 * stats, a weapon and a shield and nothing that names one of the thirteen, so
 * the vocation is undefined rather than guessed — see
 * `docs/party-and-vocations.md`.
 */
export function attendingStanding(who: AttendingCharacter): Standing {
  const n = who.numbers
  return {
    vocation: undefined,
    exp: 0,
    next: undefined,
    level: {
      level: who.level,
      exp: 0,
      strength: n.strength,
      resilience: n.resilience,
      agility: n.agility,
      deftness: n.deftness,
      charm: n.charm,
      magicalMight: n.magicalMight,
      magicalMending: n.magicalMending,
      maxHp: n.maxHp,
      maxMp: n.maxMp,
      skillPoints: 0,
    },
  }
}

/** The gender the game's own text gives a character, where it is known: Ivor's "He's got something or other he wants to talk about" (`ev02130`). */
const GENDERS: ReadonlyMap<number, number> = new Map([[IVOR, 0]])

/** How the battle's words name one: by name, with their gender where it is known. */
export function companionNamed(who: AttendingCharacter): Named {
  const gender = GENDERS.get(who.id)
  return gender === undefined ? { name: who.name } : { name: who.name, gender }
}

/**
 * The fighter an attending character is, from its numbers — whose reading is
 * INFERRED, see `readAttendingCharacters`. Its attack, defence and agility are
 * its strength, resilience and agility plus what its own weapon and shield
 * add, by `numbersOf` — the equipment's numbers read, the adding **ours**, as
 * the Hero's is; without `numbersOf`, its own alone.
 */
export function companionFighter(
  who: AttendingCharacter,
  numbersOf?: (id: number) =>
    | {
        readonly attack: number
        readonly defence: number
        readonly agility?: number
        readonly block?: number
      }
    | undefined,
): Fighter {
  const worn = [who.weapon, who.shield].map((id) =>
    id === undefined ? undefined : numbersOf?.(id),
  )
  const adds = (stat: 'attack' | 'defence' | 'agility') =>
    worn.reduce((sum, numbers) => sum + (numbers?.[stat] ?? 0), 0)
  return {
    name: who.name,
    side: 'party',
    maxHp: who.numbers.maxHp,
    maxMp: who.numbers.maxMp,
    attack: who.numbers.strength + adds('attack'),
    defence: who.numbers.resilience + adds('defence'),
    agility: who.numbers.agility + adds('agility'),
    // What a spell's amount may scale by — `attnpc`'s own, INFERRED as the rest are.
    might: who.numbers.magicalMight,
    mending: who.numbers.magicalMending,
    shield: who.shield !== undefined,
    // The game's, from what is worn — `blockChance`. Only with `numbersOf`.
    ...(numbersOf
      ? {
          block: blockChance(
            who.shield !== undefined,
            worn.map((numbers) => numbers?.block ?? 0),
          ),
        }
      : {}),
    exp: 0,
    gold: 0,
    // `attnpc`'s level, INFERRED — Ivor's 3 — for a monster to weigh before it runs.
    level: who.level,
  }
}

/**
 * The name of its model, `s<nnn>` — the name a map's cast gives the same
 * character where one stands there: Ivor's 17 is `s017`, placed in Erinn's
 * house at 2.2, and Erinn's 16 is `s016`, placed there too.
 */
export function companionModel(who: AttendingCharacter): string {
  return `s${String(who.model).padStart(3, '0')}`
}

/**
 * Where its look is: the model the table names, `chara_sub/s<nnn>.chr`, and
 * the battle packs beside it — `b` (damage, death, guard …) and `be` (its
 * attacks) — suffixed as the Hero's are in `chara_mp`.
 */
export function companionLook(who: AttendingCharacter): { model: string; packs: string[] } {
  const stem = `chara_sub/${companionModel(who)}`
  return { model: `${stem}.chr`, packs: [`${stem}b.chr`, `${stem}be.chr`] }
}

/**
 * How far behind the one before them each walks in the field, in the Hero's
 * moving ticks — **ours**: a third of a second at a walk, which at three of
 * the Hero's heights a second is one height back. See `follow.ts` in
 * `@minstrel/sim`.
 */
export const FOLLOW_TICKS = 20

/**
 * Which of its own motions a cue plays — **ours**, by name: the first of its
 * two attacks, and its stand for appearing and running, which it does not do.
 */
export const COMPANION_MOTIONS: Readonly<Record<Cue['motion'], string>> = {
  appear: 'stand',
  attack: 'attack1a',
  damage: 'damage',
  death: 'death',
  flee: 'stand',
}
