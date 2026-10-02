import type { BattleRng } from './rng.ts'

/**
 * **The abilities' blows** — the damage handlers the battle's resolver calls
 * on each pass (`func_ov024_021da55c`, the table at `0x021ff1e0`, by the
 * action's `+0x18` bits 18–26), the hit codes that make one blow several
 * passes, and the steps after. Read 2 October 2026 (USA; `docs/conformance.md`,
 * "The abilities' handlers").
 *
 * A handler takes the whole number `GetAttackBaseDamage` made — whose draws are
 * spent first, whether the handler uses it or not — and returns a whole number,
 * truncated (`_ffix`), which then goes on through the falloff and
 * `CalculateFinalDamage`: tension, the critical (whose value is the handler's
 * output), the resistance, and the rest. Every float here is the game's
 * single precision, one operation at a time.
 */

/** A monster's body, as the handlers ask it (`func_ov000_02156068`): its family, 0–15, and whether it is metal. */
export interface Body {
  readonly family?: number | undefined
  readonly metal?: boolean | undefined
}

/** What a handler reads of the one striking and the one struck. */
export interface HandlerScene {
  /** The striker's level (`CalculateTensionBonus`'s), its deftness, its unbuffed attack, its HP. */
  readonly level: number
  readonly deftness: number
  readonly attack: number
  readonly hp: number
  /** One of the party: the family handlers never fire against them, Wolf Whistle only from them. */
  readonly party: boolean
  /** The one struck: its body (monsters only), its HP, whether poisoned, asleep. */
  readonly target: Body & {
    readonly party: boolean
    readonly hp: number
    readonly poisoned: boolean
    readonly asleep: boolean
  }
  /** How many passes the action makes — the resolver's `r11`. */
  readonly passes: number
}

/** What a handler came to: the number, and what it leaves for the steps after. */
export interface Handled {
  readonly damage: number
  /** Body Slam's recoil, set by its handler (`battle + 0x8e38`). */
  readonly recoil?: number
}

const f = Math.fround

/** The family each family handler multiplies against, and by how much — §2.1 of the read. */
const FAMILY = new Map<number, { readonly family: number; readonly by: number }>([
  [1, { family: 2, by: 1.5 }], // Dragon Slash
  [10, { family: 1, by: 1.5 }], // Cattle Prod
  [12, { family: 3, by: 1.5 }], // Fly Swat
  [16, { family: 11, by: 1.25 }], // Lashings of Love
  [18, { family: 8, by: 1.5 }], // Deliverance
  [20, { family: 7, by: 1.5 }], // Can Opener
  [22, { family: 12, by: 1.5 }], // Water Slaughterer
  [23, { family: 5, by: 1.5 }], // Poplar Toppler
  [26, { family: 6, by: 1.5 }], // Monster Masher
  [28, { family: 0, by: 1.5 }], // Ooze Bruiser
  [30, { family: 4, by: 1.5 }], // Flutter Disaster
  [32, { family: 10, by: 1.5 }], // Wind Sickles
])

/** The flat multipliers — §2.2 — and the handlers used only by monsters that are one. */
const FLAT = new Map<number, number>([
  [3, 1.25], // Miracle Slash
  [6, 2.5],
  [7, 1.25], // Twin Dragon Lash
  [9, 0.75], // Falcon Slash, Mercurial Thrust, Hardclaw
  [11, 0.5], // Pressure Pointer, Multithrust, Fan Dango, Rain of Pain, Blockenspiel, Multifists
  [19, f(0.3)], // Crushed Ice, Firebird Throw, Have a Ball
  [24, f(1.3)], // Parallax
  [25, f(1.2)], // Bagsy Last, Clap Trap
  [27, f(0.8)], // Power Throw
  [33, 1.5], // Knuckle Sandwich, Blind Man's Biff
  [36, 1.5], // Double-Edged Slash
  [38, f(0.7)],
])

/** The handlers that only pass the number on — what makes them theirs is a step after. */
const PLAIN = new Set([0, 14, 31, 37])

/** Thunder Thrust and Hatchet Man's handler. */
export const THRUST_HANDLER = 45

/** Whether the battle can play a handler — every one a skill panel's ability uses, and the flat. */
export function handlerKnown(slot: number): boolean {
  return (
    PLAIN.has(slot) ||
    FAMILY.has(slot) ||
    FLAT.has(slot) ||
    [2, 13, 15, 17, 21, 29, 34, 35, 43, THRUST_HANDLER, 65].includes(slot)
  )
}

/**
 * **A handler, on one pass** — the code at each slot, read one by one. The
 * draws are the battle's own. Undefined for a slot not played here.
 */
export function handled(
  slot: number,
  d: number,
  scene: HandlerScene,
  rng: BattleRng,
): Handled | undefined {
  if (PLAIN.has(slot)) return { damage: d }
  const family = FAMILY.get(slot)
  if (family) {
    // Against one of the party never (`func_ov000_02156068` → 0).
    const hit = !scene.target.party && scene.target.family === family.family
    return { damage: hit ? Math.trunc(f(f(family.by) * f(d))) : d }
  }
  const by = FLAT.get(slot)
  if (by !== undefined) return { damage: Math.trunc(f(f(by) * f(d))) }
  switch (slot) {
    case 2:
      // Metal Slash, Metalicker: one more against a metal body (`0x021d8a84`).
      return { damage: !scene.target.party && scene.target.metal ? d + 1 : d }
    case 13:
      // Victimiser: half again on the poisoned (or paralysed, not modelled).
      return { damage: scene.target.poisoned ? Math.trunc(f(f(1.5) * f(d))) : d }
    case 15:
      // Persecutter: twice on the asleep (or confused, not modelled).
      return { damage: scene.target.asleep ? Math.trunc(f(f(2) * f(d))) : d }
    case 17:
      // Serpent's Bite: a whole-number doubling (`d << 1`).
      return { damage: d << 1 }
    case 21: {
      // Flailing Nails: a tenth to a half, a draw a hit.
      const r = rng.floatBetween(0.1, 0.5)
      return { damage: Math.trunc(f(f(d) * r)) }
    }
    case 29: {
      // Gigathrow: (2 × level + 125) × 0.85 to 1.15, whatever the base.
      const r = rng.floatBetween(0.85, 1.15)
      const a = f(f(2) * f(scene.level))
      const b = f(f(125) + a)
      return { damage: Math.trunc(f(b * r)) }
    }
    case 34:
      // Miracle Moon: four times the base over one more than the passes.
      return { damage: Math.trunc((d << 2) / (scene.passes + 1)) }
    case 35:
      // Body Slam: 0.8 of the target's HP; the recoil 0.8 of one's own, and 2.
      return {
        damage: Math.trunc(f(f(0.8) * f(scene.target.hp))),
        recoil: Math.trunc(f(f(0.8) * f(scene.hp))) + 2,
      }
    case 43: {
      // Autograph: 2 × level + 30, at most 150, give or take a tenth.
      const a = f(f(2) * f(scene.level))
      let v = f(f(30) + a)
      if (v > 150) v = 150
      const r = rng.floatBetween(-0.1, 0.1)
      return { damage: Math.trunc(f(v + f(v * r))) }
    }
    case THRUST_HANDLER: {
      // Thunder Thrust, Hatchet Man: a coin — lost, nothing; won, the
      // unbuffed attack times 0.95 to 1.05, whatever the base.
      if (rng.below(2) > 0) return { damage: 0 }
      const r = rng.floatBetween(0.95, 1.05)
      return { damage: Math.trunc(f(f(scene.attack) * r)) }
    }
    case 65:
      // Wolf Whistle: half the base and a quarter of deftness — the party's only.
      if (!scene.party) return { damage: d }
      return { damage: Math.trunc(f(f(0.25) * f(scene.deftness))) + Math.trunc(d / 2) }
    default:
      return undefined
  }
}

/**
 * **The passes an action makes** from the targets it reached and its hit code
 * (`+0x1C` bits 14–18): the same targets two or four times over, all of them
 * for the first hit first (`func_ov024_021e8dc0`); or a number of random picks
 * among them, with replacement (`func_ov000_0215fbe0`). The two draws every
 * action makes there — 3 or 4, then 6 to 8 — are the caller's; their values
 * give codes 3 and 11.
 */
export function passesOf(
  targets: readonly number[],
  code: number,
  drawn: { readonly threeOrFour: number; readonly sixToEight: number },
  rng: BattleRng,
): { readonly passes: number[]; readonly random: boolean } {
  const repeats = code === 1 ? 2 : code === 6 ? 4 : code === 9 ? 5 : 1
  if (repeats > 1) {
    const passes: number[] = []
    for (let hit = 0; hit < repeats; hit++) passes.push(...targets)
    return { passes, random: false }
  }
  const picks: Record<number, number> = {
    3: drawn.threeOrFour,
    4: 2,
    5: 4,
    7: 7,
    8: 3,
    10: 1,
    11: drawn.sixToEight,
  }
  const k = picks[code] ?? 0
  if (k === 0 || targets.length === 0) return { passes: [...targets], random: false }
  const passes: number[] = []
  for (let i = 0; i < k; i++) passes.push(targets[rng.below(targets.length)] as number)
  return { passes, random: true }
}

/** The codes whose picks are re-made when their target has fallen (`func_ov000_02154c68`). */
export const RETARGETED = new Set([3, 4, 5, 7, 8, 11])

/** The falloff over the passes, by the pass's place (`func_02074948`, `0x020e88d0`). */
export const FALLOFF = [1, f(0.8), f(0.6), f(0.4), f(0.2)] as const
