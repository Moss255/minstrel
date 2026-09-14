import type { AttendingCharacter } from '@minstrel/game-formats'
import type { Fighter } from '@minstrel/sim'
import type { Cue } from './battle-scene.ts'
import type { Stage } from './load.ts'

/**
 * Ivor beside the Hero: when he goes along, the fighter he is, and how he is
 * drawn. What is read is `attnpc`'s — FORMAT.md, "Attending characters" — and
 * what is ours is said so below.
 */

/** Ivor's number in `attnpc`. */
export const IVOR = 2

/**
 * Whether Ivor goes along at a story stage — **ours**: over 2.2, the stage his
 * events leave the village and reach the landslide at, and 2.3, his return,
 * whose events still treat him as the party's (`566(10, 1)`). How the game adds
 * him to the party and takes him away is not found.
 */
export function alongAt(stage: Stage | undefined): boolean {
  return stage !== undefined && stage.major === 2 && (stage.minor === 2 || stage.minor === 3)
}

/**
 * The fighter an attending character is, from its numbers — whose reading is
 * INFERRED, see `readAttendingCharacters`. Its attack and defence are
 * **stand-ins**, as the Hero's are: its strength and resilience, since where
 * equipment keeps its numbers is not found.
 */
export function companionFighter(who: AttendingCharacter): Fighter {
  return {
    name: who.name,
    side: 'party',
    maxHp: who.numbers.maxHp,
    maxMp: who.numbers.maxMp,
    attack: who.numbers.strength,
    defence: who.numbers.resilience,
    agility: who.numbers.agility,
    shield: who.shield !== undefined,
    exp: 0,
    gold: 0,
  }
}

/**
 * Where its look is: the model the table names, `chara_sub/s<nnn>.chr`, and
 * the battle packs beside it — `b` (damage, death, guard …) and `be` (its
 * attacks) — suffixed as the Hero's are in `chara_mp`.
 */
export function companionLook(who: AttendingCharacter): { model: string; packs: string[] } {
  const stem = `chara_sub/s${String(who.model).padStart(3, '0')}`
  return { model: `${stem}.chr`, packs: [`${stem}b.chr`, `${stem}be.chr`] }
}

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
