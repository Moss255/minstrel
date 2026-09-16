import type { AttendingCharacter } from '@minstrel/game-formats'
import type { Fighter } from '@minstrel/sim'
import type { Cue } from './battle-scene.ts'
import type { Named } from './battle-text.ts'

/**
 * The party beside the Hero: who goes along and when, the fighter each is, and
 * how they are drawn. What is read is `attnpc`'s — FORMAT.md, "Attending
 * characters" — and the events' own records, which bring each in and send them
 * away; what is ours is said so below.
 *
 * Nothing here is any one character's: whoever goes along takes the next place
 * after the Hero, in battle and in the field, up to {@link PARTY_MOST}.
 */

/** The most a party holds, the Hero among them: the game's four — not read from its data here. */
export const PARTY_MOST = 4

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
 */
export function partyAfter(
  party: ReadonlySet<number>,
  outcome: { readonly joins: readonly number[]; readonly leaves: boolean },
): Set<number> {
  const next = outcome.leaves ? new Set<number>() : new Set(party)
  for (const arg of outcome.joins) next.add(joinerOf(arg))
  return next
}

/**
 * Who goes along, in their places after the Hero: those in the party, by their
 * number, in the table's order, and no more than the party holds beside the
 * Hero. Which place each takes — the table's order — is ours.
 */
export function companionsAt(
  attending: readonly AttendingCharacter[],
  party: ReadonlySet<number>,
): AttendingCharacter[] {
  return attending.filter((who) => party.has(who.id)).slice(0, PARTY_MOST - 1)
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
  numbersOf?: (
    id: number,
  ) => { readonly attack: number; readonly defence: number; readonly agility?: number } | undefined,
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
    shield: who.shield !== undefined,
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
