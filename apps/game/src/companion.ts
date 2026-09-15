import type { AttendingCharacter } from '@minstrel/game-formats'
import type { Fighter } from '@minstrel/sim'
import type { Cue } from './battle-scene.ts'
import type { Named } from './battle-text.ts'
import type { Stage } from './load.ts'

/**
 * The party beside the Hero: who goes along and when, the fighter each is, and
 * how they are drawn. What is read is `attnpc`'s — FORMAT.md, "Attending
 * characters" — and what is ours is said so below.
 *
 * Nothing here is any one character's but the rule for when they go along:
 * whoever does takes the next place after the Hero, in battle and in the
 * field, up to {@link PARTY_MOST}.
 */

/** The most a party holds, the Hero among them: the game's four — not read from its data here. */
export const PARTY_MOST = 4

/** Ivor's number in `attnpc`. */
export const IVOR = 2

/**
 * The story flag at 2.2 after which Ivor goes along. INFERRED: his call on
 * Erinn's doorstep, `ev02210`, ends on the message "Ivor joins the party!" —
 * its last — and its own record sets flag 0; a let's play shows him joining
 * there, and not following before.
 */
export const IVOR_JOINS_FLAG = 0

/**
 * When each attending character goes along, by their number in `attnpc`.
 * Ivor at 2.2 once {@link IVOR_JOINS_FLAG} is set — INFERRED, see there — and
 * over 2.3, his return, whose events still treat him as the party's
 * (`566(10, 1)`): that by stage, **ours**, as the story's flags are the
 * stage's own and the one he joins by is gone at 2.3. How the game takes him
 * away is not found. No other goes along in the slice.
 */
const ALONG: ReadonlyMap<number, (stage: Stage, flags: ReadonlySet<number>) => boolean> = new Map([
  [
    IVOR,
    (stage: Stage, flags: ReadonlySet<number>) =>
      stage.major === 2 && ((stage.minor === 2 && flags.has(IVOR_JOINS_FLAG)) || stage.minor === 3),
  ],
])

/** Whether an attending character goes along at a story stage with these flags set — see {@link ALONG}. */
export function alongAt(
  who: AttendingCharacter,
  stage: Stage | undefined,
  flags: ReadonlySet<number> = new Set(),
): boolean {
  const rule = ALONG.get(who.id)
  return stage !== undefined && (rule?.(stage, flags) ?? false)
}

/**
 * Who goes along at a stage, in their places after the Hero: those whose rule
 * has them along, and any `forced` by number, in the table's order, and no
 * more than the party holds beside the Hero. Which place each takes — the
 * table's order — is ours.
 */
export function companionsAt(
  attending: readonly AttendingCharacter[],
  stage: Stage | undefined,
  forced: readonly number[] = [],
  flags: ReadonlySet<number> = new Set(),
): AttendingCharacter[] {
  return attending
    .filter((who) => forced.includes(who.id) || alongAt(who, stage, flags))
    .slice(0, PARTY_MOST - 1)
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
