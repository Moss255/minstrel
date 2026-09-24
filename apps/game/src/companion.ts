import type { AttendingCharacter } from '@minstrel/game-formats'
import { blockChance, type Fighter } from '@minstrel/sim'
import type { Cue } from './battle-scene.ts'
import type { Named } from './battle-text.ts'
import type { Equipped } from './equipment.ts'
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
  exp: number
  /**
   * Which vocation's level table their experience is read against, by its
   * number — `HERO_VOCATION_NUMBER` is the Minstrel's 6. It is a member's and
   * not a constant because Alltrades is the point of this phase.
   */
  vocation: number
  /** What seeds have added, for good — see `hero.ts`. */
  gains: Gains
  equipped: Equipped
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
    exp: member.exp,
    hp: member.hp ?? null,
    mp: member.mp ?? null,
    vocation: member.vocation,
    gains: member.gains,
    equipped: equippedRecord(member.equipped),
  }))
}

/** The party a save holds, ready to play. */
export function partyRestored(kept: readonly SaveMember[]): Member[] {
  return kept.map((member) => ({
    attnpc: member.attnpc ?? undefined,
    hp: member.hp ?? undefined,
    mp: member.mp ?? undefined,
    exp: member.exp,
    // A save from before vocations were a member's has none, and everyone in
    // it was the Minstrel the Hero is — see `HERO_VOCATION_NUMBER`.
    vocation: member.vocation ?? HERO_VOCATION_NUMBER,
    gains: { ...member.gains },
    equipped: equippedOf(member),
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
