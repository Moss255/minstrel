import type { BattleRng } from './rng.ts'

/**
 * A fighter's changes of state in battle. What is translated from
 * DQIX/BattleEmulator (MIT — see `damage.ts`), which reproduces the game's
 * code, and what is the game's own, read since:
 *
 * - **defence and agility levels**, −2 to +2, multiplying the stat by 0.25,
 *   0.5, 1, 1.5 and 2 — the game's own multipliers, and the product **rounded
 *   half up** as its `RoundUp` does (see {@link levelled});
 * - **how a level runs down — the game's** (read 6 October 2026, task 18;
 *   `docs/readings/T18-handlers.md` §10): a count set with it — {@link
 *   LEVEL_COUNTS} — less one on each of its **holder's own action passes**
 *   (`func_ov000_021599f4`), and at 0 a second count of 4; from then, on each
 *   of the holder's passes, that count less one and a draw of the battle's,
 *   `R(100) / 100`, against a table by it — the level clears where the table
 *   is above the draw (`func_ov000_0215858c`). See {@link countDown} and
 *   {@link runDown};
 * - **sleep** for {@link SLEEP_TURNS} turns, a turn off on each of the
 *   sleeper's own, then waking on it by 37, 62, 87 and 100 in 100 — its
 *   `sleepTable`;
 * - **poison** taking a sixteenth of maximum HP, `maxHp >> 4`, at every round's
 *   end.
 *
 * The reference keeps them for its one player; the battle gives them to every
 * fighter alike — see `battle.ts` for that and the rest that is ours.
 */

export interface Level {
  /** From −2 to +2. */
  readonly level: number
  /**
   * Its count — the status's byte at `+0x5c` and on (attack's `+0x6e`):
   * its holder's action passes left before it may wear off. See
   * {@link countDown}.
   */
  readonly turns: number
  /**
   * Its second count, once the first is out — the byte `0x23` further on
   * (attack's `+0x91`): 0 until then, and the wear-off table's index after
   * each pass takes one off. See {@link runDown}.
   */
  readonly wearing?: number
}

export interface States {
  /** Turns of sleep left, counted as the reference does — to 0 and past it; undefined awake. */
  readonly sleep: number | undefined
  readonly poisoned: boolean
  /**
   * **Envenomated** — the stronger poison, status `+0x22` low bits at 2 where
   * plain poison is 1 (`func_02088560`, `func_02088624`): what a poison rider
   * or kind 6 with levels above 0 gives — Toxic Dagger, Venom Mist, the poison
   * attack 275. **It is the one a battle tolls** (`func_ov000_0215a23c`); see
   * {@link poisonDamage}.
   */
  readonly envenomed?: boolean
  readonly defence: Level
  readonly agility: Level
  /**
   * Its attack's level, −2 to +2 — status `+0x58` bits 0–2, which Oomph,
   * Blunt and their like move (kind 3, `func_ov024_021db5ec`). None is level 0.
   */
  readonly attack?: Level
  /** Its tension's level, 0 to 4 — see `tension.ts`; none when not given. */
  readonly tension?: number
  /**
   * Its magical might's and magical mending's levels, −2 to +2 — status
   * `+0x58` bits 12–14 and 15–17, which Channel Anger and Caster Sugar (kind
   * 42, `func_ov024_021df284`) and Care Prayer (kind 38, `021dee84`) move;
   * the stat is worked out again from it (`UpdateCombatantMagicalMight`,
   * `…Mending`) — see {@link buffedMagic}. None is level 0.
   */
  readonly might?: Level
  readonly mending?: Level
  /**
   * Its **resistance to spells** and **to breaths**, −2 to +2 — status
   * `+0x58` bits 18–20, set with flag `+0x14` bit 16 (Wizard Ward and Spooky
   * Aura, kind 22, `func_ov024_021dd968`), and bits 21–23 with bit 17
   * (Insulate, Insulatle, Mind Over Matter, kind 23, `021ddaa0`). The final
   * damage multiplies a spell, and a breath, by {@link wardMultiplier} of it
   * (`func_ov024_021e6a90`, `0x021e7534`–`0x021e75c8`). None is level 0.
   */
  readonly spells?: Level
  readonly breaths?: Level
  /**
   * **Fizzled** — status `+0x14` bit 8, with a count of 6 at `+0x60`
   * (Antimagic, kind 16, `func_020888a4`): its spells are put out as action
   * 914, "tries to cast … but can't cast spells at the moment"
   * (`func_ov024_021eaa50`, `0x021eacc4`–`0x021ead08`). Kept as a level of
   * 1 so it runs down as the levels do — **ours**; see `battle.ts`.
   */
  readonly fizzled?: Level
  /**
   * **Vanished** — status `+0x14` bit 27, with a count of 5 at `+0x62`
   * (Vanish, kind 54, `func_ov024_021e093c`; `func_02088994`): a monster's
   * weighted pick halves its holder's weight — after the total is made, so
   * the draw can fall past every weight and the pick go to the even draw
   * after it (`func_ov000_02154f30`, `0x021550ac`–`0x021550c0`). Runs down by
   * the second table, its line `0x1c9` (`func_ov000_0215858c`,
   * `0x0215892c`–`0x021589bc`).
   */
  readonly vanished?: Level | undefined
  /**
   * **Dazzled** — status `+0x14` bit 6, with a count of 4 at `+0x5f`, and
   * its sort at `+0x22` bits 6–8 (`func_02088854`; kind 19,
   * `func_ov024_021dd534`, Flower Power and Scandal Eyes): kept as its
   * `level`, the record's `+0x30` — 1 hallucinating, 2 dazzled, 3 sand, 4
   * ink, by the lines it picks (`func_ov024_021e9198`). An action its holder
   * takes that sight spoils (`+0x10` bit 3) throws a die of eight after its
   * accuracy, and misses on five faces (`func_ov000_02156648`,
   * `0x02156a90`–`0x02156ac8`). Runs down by the second table, its line
   * `0x1c7` (`func_ov000_0215858c`, `0x02158764`–`0x021587f4`).
   */
  readonly dazzled?: Level | undefined
  /**
   * **A decoy against one blow** — status `+0x14` bit 20, **Schizofanic**
   * (kind 36, `func_ov024_021dec50`; `func_02088a94`), or bit 21, **Mist Me**
   * (kind 55, `021e0a50`; `02088adc`), each clearing the other, with no
   * count. The accuracy roll, before any draw of its own, misses an action a
   * shield may block (`+0x10` bit 6) at its holder, and the decoy goes —
   * flagged 8 and `func_02088aa8`, or `0x10` and `02088af0`
   * (`func_ov000_02156648`, `0x02156714`–`0x02156788`).
   */
  readonly decoy?: 'schizofanic' | 'mist' | undefined
  /**
   * **Rotstopper** — status `+0x14` bit 29, with a count of 4 at `+0x64`
   * (kind 40, `func_ov024_021df0f0`; `func_02088a34`): what a monster of
   * family 8 deals its holder is halved, after the resistance and before the
   * wards (`func_ov024_021e6a90`, `0x021e74f8`–`0x021e7530`; the family by
   * `func_ov000_02156068` with 8 and 0). Runs down by the second table, its
   * line `0x1d8` (`func_ov000_0215858c`, `0x02158a5c`–`0x02158aec`).
   */
  readonly rotstop?: Level | undefined
  /**
   * **Alma Mater** — status `+0x14` bit 22, with a count of 6 at `+0x67`
   * (kind 39, `func_ov024_021deff8`; `func_02088b14`): the heavenly
   * protection. Whack, Thwack, Kathwack and Kamikazee (the list at
   * `data_ov024_021fe6e0`: 24 to 27; `func_ov024_021ea78c`) landed on its
   * holder, or the death rider, leave them 1 HP, say `0xc8` "…'s heavenly
   * protection keeps the reaper at bay for now", and it goes
   * (`func_02088b34`; kind 17 `0x021dd0a8`–`0x021dd124`, rider 20
   * `0x021e46f4`–`0x021e4760`). Runs down by the first table, its line
   * `0x1cb` (`func_ov000_0215858c`, `0x02158b8c`–`0x02158c1c`).
   */
  readonly alma?: Level | undefined
  /**
   * **Paralysed** — status `+0x14` bit 3, with a count of 3 at `+0x5c`
   * (`func_0208826c`, rider 11): its holder cannot act
   * (`func_ov000_02156038`). The count goes a pass less on each of their
   * action passes, and at 0 its second, at `+0x7f`, starts at 4
   * (`func_ov000_021599f4`); then at each of their turns' starts that count
   * less one and the turn-start draw against `0x02182ad4` free them, action
   * 900 in their action's place (`func_ov000_0215833c`, `0x021583a8`–
   * `0x02158404`). Tingle frees them (`func_020882dc`).
   */
  readonly paralysed?: Level | undefined
  /**
   * **0 Zone** — status `+0x18` bit 9, with a count of 5 at `+0x78` (kind 68,
   * `func_ov024_021e1580`; `func_020890d4`): no MP is asked of its holder's
   * actions (`func_ov024_021eadfc`, read by `func_ov024_021eaa50` at
   * `0x021eabd8`). Kept as a level of 1, to run down as the game runs it.
   */
  readonly zeroZone?: Level
  /**
   * **Rough 'n' Tumble** — status `+0x18` bit 10, with a count of 5 at
   * `+0x79` (kind 70, `func_ov024_021e1824`; `func_02089124`). What it does
   * is read by `func_ov000_02156404`'s callers — see `battle.ts`. Kept as a
   * level of 1.
   */
  readonly tumble?: Level
  /**
   * **A lost turn coming** — status `+0x14` bit 19, its kind at `+0x22` bits
   * 2–5 (`func_02088474`): 2 knocked off their feet, 3 Pratfall's, 4 a
   * dance's, 5 terror. Set by rider 1 (`func_ov024_021e2bd0`) and kind 10's
   * handler (`021dc0b8`); its holder cannot act (`func_ov000_02155f9c`), so
   * their next turn is lost, and the run-down after it clears it
   * (`func_ov000_0215767c` sets `+0x3b` bit 1, `0215858c` reads it at
   * `0x021585d4`).
   */
  readonly stunned?: number | undefined
  /**
   * **Watched** by a Paladin's Knight Watch — status `+0x18` bit 12, the
   * watcher at `+0x2e` and a count at `+0x7e` (`func_02088e48`): a monster's
   * weighted pick takes the watcher, with no draw, while they stand
   * (`func_ov000_02154f30`, `0x02154f9c`–`0x02154fb8`). Its count runs down
   * on its own passes and it goes as the count runs out, or at once when the
   * watcher is down (`func_ov000_0215858c`, `0x0215861c`–`0x02158760`).
   */
  readonly watched?: { readonly by: number; readonly turns: number } | undefined
  /**
   * **Right as Rain** — status `+0x14` bit 31, with a count of 6 at `+0x69`
   * (kind 48, `func_ov024_021e01b8`; `func_02088bb4`): at the round's end its
   * holder, standing in the party, gets back the larger of 10 and half their
   * level (`func_ov000_0215a23c`, `0x0215a314`–`0x0215a33c`). Runs down at
   * the round's end — see {@link roundRunDown}.
   */
  readonly rain?: Level | undefined
  /**
   * **Focus Pocus** — status `+0x14` bit 30, with a count of 6 at `+0x68`
   * (kind 78, `func_ov024_021e268c`; `func_02088b64`): at the round's end its
   * holder, standing in the party, gets back the larger of 3 and a tenth of
   * their level in MP (`0x0215a43c`–`0x0215a468`). Runs down at the round's
   * end.
   */
  readonly focus?: Level | undefined
}

export const NO_STATES: States = {
  sleep: undefined,
  poisoned: false,
  defence: { level: 0, turns: 0 },
  agility: { level: 0, turns: 0 },
}

/**
 * **The count a level is set with** — what each setter stores at its byte
 * (USA ARM9): attack 5 at `+0x6e` (`func_020877c0`),
 * defence 6 at `+0x6f` (`func_020878b4`, `0x02087900`), agility 6 at `+0x70`,
 * charm 6 at `+0x71`, magical might 5 at `+0x72`, mending 5 at `+0x73`, the
 * resistance to spells 5 at `+0x74`, to breaths 5 at `+0x75` (`func_02087e6c`); Fizzle 6 at
 * `+0x60` (`func_020888a4`); dazzle 4 at `+0x5f` (`func_02088854`); Vanish 5 at `+0x62` (`func_02088994`); Rotstopper 4 at `+0x64` (`func_02088a34`); Alma Mater 6 at `+0x67` (`func_02088b14`); 0 Zone 5 at `+0x78` (`func_020890d4`), Rough 'n'
 * Tumble 5 at `+0x79` (`func_02089124`); paralysis 3 at `+0x5c`
 * (`func_0208826c`). Every setter stores its second count 0 beside it.
 */
export const LEVEL_COUNTS = {
  attack: 5,
  defence: 6,
  agility: 6,
  might: 5,
  mending: 5,
  spells: 5,
  breaths: 5,
  fizzled: 6,
  dazzled: 4,
  vanished: 5,
  rotstop: 4,
  alma: 6,
  zeroZone: 5,
  tumble: 5,
  paralysed: 3,
} as const

/** The kinds of count {@link LEVEL_COUNTS} names. */
export type Counted = keyof typeof LEVEL_COUNTS

/**
 * **The two wear-off tables**, by the second count after it has taken one
 * off (`func_ov000_0215858c`): `0x02182ad4` — 1.0, 0.875, 0.75, 0.625 — and
 * `0x02182bd4` — 1.0, 0.875, 0.625, 0.375 — each with a fifth word of
 * `0x0000ffff`, a float a shade above nothing that a second count never
 * reaches (it starts at 4 and is taken one from before it is looked up).
 */
const DENORMAL = Math.fround(9.183409485952689e-41)
export const WEAR_TABLE = [1, 0.875, 0.75, 0.625, DENORMAL].map(Math.fround)
export const WEAR_TABLE_SLOW = [1, 0.875, 0.625, 0.375, DENORMAL].map(Math.fround)

/**
 * Which table each runs down by, and what its second count starts at
 * (`data_ov000_02182efc`, read by `func_ov000_021599f4`): the levels and
 * Fizzle 4, by the first table — but the resistance to spells by the second
 * (its block, `0x02159428` on); 0 Zone and Rough 'n' Tumble 1, by the second, so they
 * go on the pass after their count runs out, a draw spent all the same.
 */
export const WEAR_OF: Readonly<Record<Counted, { table: readonly number[]; start: number }>> = {
  attack: { table: WEAR_TABLE, start: 4 },
  defence: { table: WEAR_TABLE, start: 4 },
  agility: { table: WEAR_TABLE, start: 4 },
  might: { table: WEAR_TABLE, start: 4 },
  mending: { table: WEAR_TABLE, start: 4 },
  spells: { table: WEAR_TABLE_SLOW, start: 4 },
  breaths: { table: WEAR_TABLE, start: 4 },
  fizzled: { table: WEAR_TABLE, start: 4 },
  dazzled: { table: WEAR_TABLE_SLOW, start: 4 },
  vanished: { table: WEAR_TABLE_SLOW, start: 4 },
  rotstop: { table: WEAR_TABLE_SLOW, start: 4 },
  alma: { table: WEAR_TABLE, start: 4 },
  zeroZone: { table: WEAR_TABLE_SLOW, start: 1 },
  tumble: { table: WEAR_TABLE_SLOW, start: 1 },
  // Not run down after a pass but at the turn's start — see `States.paralysed`.
  paralysed: { table: WEAR_TABLE, start: 4 },
}
/**
 * **The statuses the round's end runs down** — `func_ov000_02157e1c`, which
 * the round's end calls after the regaining and the toll
 * (`func_ov000_0215e6e8`, `0x0215e7dc`–`0x0215e7f4`), each with the count its
 * setter stores: Focus Pocus 6 at `+0x68` (`func_02088b64`), Right as Rain 6
 * at `+0x69` (`func_02088bb4`). Their second counts start at 4 and go by the
 * first table.
 */
export const ROUND_COUNTS = { focus: 6, rain: 6 } as const
export type RoundCounted = keyof typeof ROUND_COUNTS

/**
 * **A status wearing off at the round's end** — one block of
 * `func_ov000_02157e1c` (Focus Pocus's at `0x02157f30`–`0x02157fd4`), which
 * differs from the run-down after a pass: **a draw `R(100) / 100` for every
 * holder, made first**, whichever count is running; then, with the second
 * count running, that count less one and cleared where the table by it is
 * above the draw; else the first count less one, and at 0 the second set to
 * 4. `draw` is that draw, made by the caller.
 */
export function roundRunDown(
  level: Level,
  table: readonly number[],
  draw: number,
): { level: Level; wore: boolean } {
  if (level.level === 0) return { level, wore: false }
  if (level.wearing) {
    const wearing = level.wearing - 1
    if ((table[wearing] as number) > draw) return { level: { level: 0, turns: 0 }, wore: true }
    return { level: { level: level.level, turns: 0, wearing }, wore: false }
  }
  if (level.turns <= 0) return { level, wore: false }
  const turns = level.turns - 1
  return {
    level: turns === 0 ? { level: level.level, turns: 0, wearing: 4 } : { ...level, turns },
    wore: false,
  }
}

/**
 * **What Right as Rain gives back at the round's end** — the larger of 10
 * and half its holder's level in their vocation (`func_0202053c`), the half
 * an arithmetic shift (`0x0215a328`–`0x0215a33c`). **Focus Pocus's** — the
 * larger of 3 and a tenth, the division truncated (`_s32_div_f`,
 * `0x0215a450`–`0x0215a468`).
 */
export const rainHp = (level: number): number => Math.max(10, level >> 1)
export const focusMp = (level: number): number => Math.max(3, Math.trunc(level / 10))

/** How long sleep holds before its sleeper may wake — the reference's Sweet Breath. */
export const SLEEP_TURNS = 2

/**
 * Each level's multiplier — the game's `CalculateDefenceBuffMultiplier` and
 * the agility one beside it (`src/Combat/Main/BasicAttackCalculation.cpp`):
 * half again a level up, and going down a half at −1 and a quarter at −2.
 * Worked in the game's floats, as `docs/conformance.md` says these are.
 */
function multiplier(level: number): number {
  return level >= 0
    ? Math.fround(1 + Math.fround(level * 0.5))
    : Math.fround(1 + Math.fround(Math.fround((level + 1) * 0.25) - 0.5))
}
/** Waking, in 100, as the turns run past — `sleepTable`. */
const WAKE = [37, 62, 87, 100]

/**
 * A stat at a level: its value times the level's multiplier, **rounded half
 * up** — the game's `RoundUp` (`0.5f + x`, truncated), which it applies to a
 * stat after its multiplier and before the blow is worked out. It was
 * truncated here, the reference's way, which is a point low on every odd
 * half: a defence of 41 at −1 is 21 to the game and was 20 to us.
 */
export function levelled(value: number, level: number): number {
  const level2 = Math.max(-2, Math.min(2, level))
  return Math.trunc(Math.fround(0.5 + Math.fround(Math.fround(value) * multiplier(level2))))
}

/**
 * **An attack at its level** — `UpdateCombatantAttack` (decompiled,
 * `src/Combat/Overlay_0/UpdateCombatantBuffs.cpp`): the base times
 * `CalculateAttackBuffMultiplier`, `1 + 0.25 × level` — a quarter a level,
 * not defence's half — **truncated** to a whole number, and at most 999 for
 * one of the party.
 */
export function buffedAttack(value: number, level: number, party: boolean): number {
  const f = Math.fround
  const multiplier = f(1 + f(0.25 * Math.max(-2, Math.min(2, level))))
  const buffed = Math.trunc(f(multiplier * f(value))) & 0xffff
  return party && buffed > 999 ? 999 : buffed
}

/**
 * **Magical might or mending at its level** — `UpdateCombatantMagicalMight`
 * and `UpdateCombatantMagicalMending` (decompiled,
 * `src/Combat/Overlay_0/UpdateCombatantBuffs.cpp`): the base times
 * `1 + 0.5 × level` (`CalculateMagicalMightBuffMultiplier`, `…Mending…`, in
 * `src/Combat/Main/BasicAttackCalculation.cpp`), truncated to the stat's
 * sixteen bits, and at most 999 — for anyone, the code asks no side.
 */
export function buffedMagic(value: number, level: number): number {
  const f = Math.fround
  const multiplier = f(1 + f(0.5 * Math.max(-2, Math.min(2, level))))
  const buffed = Math.trunc(f(multiplier * f(value))) & 0xffff
  return buffed > 999 ? 999 : buffed
}

/**
 * **What a resistance level leaves of a spell or a breath** — `func_020748d0`
 * (spells) and `func_020748a8` (breaths), the same two lines: `1 + (−0.25 ×
 * level)`, in floats (the literal `0xbe800000` at `0x020748cc` and
 * `0x020748f4`). A level of 2 halves it; −2, which Spooky Aura can bring a
 * monster to, makes it half again.
 */
export function wardMultiplier(level: number): number {
  const f = Math.fround
  return f(1 + f(f(-0.25) * f(level)))
}

/**
 * A level moved by `by`, its count set again and its second cleared, as
 * every setter does (`func_020878b4`) — undefined when it is already at the
 * end it moves toward. A level brought to 0 is cleared (`0x020878e0`).
 */
export function moved(level: Level, by: number, count: number): Level | undefined {
  const next = Math.max(-2, Math.min(2, level.level + by))
  if (next === level.level) return undefined
  return next === 0 ? { level: 0, turns: 0 } : { level: next, turns: count }
}

/**
 * **A status's count, on its holder's pass** — `func_ov000_021599f4`: one
 * less, and at 0 the second count set to its start (`0x02159c14`–
 * `0x02159c30`). No draw. A status not held is left as it is.
 */
export function countDown(level: Level, start: number): Level {
  if (level.level === 0 || level.turns <= 0) return level
  const turns = level.turns - 1
  return turns === 0 ? { level: level.level, turns: 0, wearing: start } : { ...level, turns }
}

/**
 * **A status wearing off, on its holder's pass** — one block of
 * `func_ov000_0215858c` (attack's at `0x02159050`–`0x021590ac`): held, with a
 * second count, that count less one, a draw `R(100) / 100` of the battle's,
 * and cleared where the table by the count is above it. No draw for one
 * whose second count is not running.
 */
export function runDown(
  level: Level,
  table: readonly number[],
  rng: BattleRng,
): { level: Level; wore: boolean } {
  if (level.level === 0 || !level.wearing) return { level, wore: false }
  const wearing = level.wearing - 1
  const draw = Math.fround(Math.fround(rng.below(100)) / 100)
  const wore = (table[wearing] as number) > draw
  return wore
    ? { level: { level: 0, turns: 0 }, wore: true }
    : { level: { level: level.level, turns: 0, wearing }, wore: false }
}

/**
 * **Waking, the game's way** (read 3 October 2026; `func_ov000_0215833c`,
 * `021599f4`): a sleeper's turns are counted from 0 as it falls asleep. Its
 * first sleeping turn has no chance; from the second, the turn-start draw
 * `R(100) / 100` wakes it when under 0.375, then 0.625, 0.875, and at last
 * always (the table at `0x02182bd4`, walked back from 4). `turns` is how many of
 * its sleeping turns have passed.
 */
export const WAKE_TABLE = [1, 0.875, 0.625, 0.375].map(Math.fround)
export function wakes(turns: number, draw: number): boolean {
  if (turns <= 0) return false
  const counter = Math.max(0, 4 - turns)
  return (WAKE_TABLE[counter] as number) > Math.fround(Math.fround(draw) / 100)
}

/** A sleeper's turn: a turn less of sleep, and awake by the reference's odds once it is out. */
export function sleptThrough(
  sleep: number,
  rng: BattleRng,
): { sleep: number | undefined; woke: boolean } {
  const left = sleep - 1
  if (left > 0) return { sleep: left, woke: false }
  const odds = WAKE[Math.min(3, -left)] as number
  return odds >= rng.below(100) ? { sleep: undefined, woke: true } : { sleep: left, woke: false }
}

/**
 * **What envenomation takes at a round's end** — `func_ov000_0215a23c`,
 * `0x0215a5c8`–`0x0215a5f4`: a sixteenth of the most HP, at most 999 and at
 * least 1. Read 6 October 2026, and it corrects what stood here: the toll is
 * envenomation's (`func_02088514`, `+0x22` at 2). **Plain poison takes
 * nothing in a battle** — no code in the ARM9 or any overlay asks for it
 * there but to cure it, to multiply Victimiser's blow, and in the AI; the
 * reference's "poison" is the poison attack 275's, whose record's levels make
 * it envenomation.
 */
export const poisonDamage = (maxHp: number): number => Math.max(1, Math.min(999, maxHp >> 4))
