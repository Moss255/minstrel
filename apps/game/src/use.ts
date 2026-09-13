import { ActionEffect } from '@minstrel/game-formats'
import { type BattleRng, drawnAmount } from '@minstrel/sim'
import type { GainStat } from './hero.ts'

/**
 * Using an item or casting a spell outside a battle, on the Hero: what comes of
 * it, by what its action says — its effect byte, its range and its message
 * (game-formats' `readActions`, FORMAT.md "Actions").
 *
 * - What restores HP or MP draws its amount as the battle does, the range's
 *   base give or take its spread (`drawnAmount`); **one with no range restores
 *   all there is**, INFERRED from Fullheal and the elfin elixir, the two that
 *   have none. The rise of a spell's amount with magical mending is not modelled.
 * - A seed raises the number its message names: `actmsg` 157 to 166, from
 *   `maximum HP` to `skill points`, by its range's base — INFERRED from the
 *   messages' own words.
 * - What cures poison or brings back the fallen has nothing to do: the Hero is
 *   never poisoned here, and there is no one fallen to raise.
 *
 * **Ours**: when nothing would come of it, an item is kept and a spell's MP is
 * not spent.
 */

/** An action, as far as using it needs — see `ItemEffect` in `load.ts`. */
export interface Usable {
  readonly effect: number
  /** Its message in `actmsg`; 0 for none. */
  readonly message: number
  /** Its cost in MP: {@link ALL_MP} for all there is. */
  readonly cost: number
  readonly range: { readonly base: number; readonly spread: number } | undefined
}

/** The Hero's hit points and MP, now and at most. */
export interface Vitals {
  readonly hp: number
  readonly maxHp: number
  readonly mp: number
  readonly maxMp: number
}

/** A cost that spends all the MP there is: Magic Burst's and Kerplunk's. INFERRED. */
export const ALL_MP = 255

/** The seeds' messages in `actmsg`, and the number each names. INFERRED from their words. */
export const SEED_GAINS: ReadonlyMap<number, GainStat> = new Map([
  [157, 'maxHp'],
  [158, 'maxMp'],
  [159, 'strength'],
  [160, 'deftness'],
  [161, 'agility'],
  [162, 'resilience'],
  [163, 'magicalMight'],
  [164, 'magicalMending'],
  [165, 'charm'],
  [166, 'skillPoints'],
])

export type Outcome =
  | { readonly kind: 'hp'; readonly hp: number; readonly amount: number; readonly message: number }
  | { readonly kind: 'mp'; readonly mp: number; readonly amount: number; readonly message: number }
  | {
      readonly kind: 'gain'
      readonly stat: GainStat
      readonly amount: number
      readonly message: number
    }
  /** It would do nothing now: the Hero is not hurt, not poisoned, not fallen. */
  | { readonly kind: 'noUse' }
  /** What it does is not read. */
  | { readonly kind: 'unknown' }

const restored = (action: Usable, rng: BattleRng, all: number): number =>
  action.range ? drawnAmount(rng, action.range.base, action.range.spread) : all

/** What using an action on the Hero comes to. */
export function useOn(action: Usable, vitals: Vitals, rng: BattleRng): Outcome {
  switch (action.effect) {
    case ActionEffect.RestoresHp: {
      if (vitals.hp >= vitals.maxHp) return { kind: 'noUse' }
      const hp = Math.min(vitals.maxHp, vitals.hp + restored(action, rng, vitals.maxHp))
      return { kind: 'hp', hp, amount: hp - vitals.hp, message: action.message }
    }
    case ActionEffect.RestoresMp: {
      if (vitals.mp >= vitals.maxMp) return { kind: 'noUse' }
      const mp = Math.min(vitals.maxMp, vitals.mp + restored(action, rng, vitals.maxMp))
      return { kind: 'mp', mp, amount: mp - vitals.mp, message: action.message }
    }
    case ActionEffect.CuresPoison:
    case ActionEffect.Revives:
      return { kind: 'noUse' }
  }
  const stat = SEED_GAINS.get(action.message)
  if (stat && action.range) {
    const amount = drawnAmount(rng, action.range.base, action.range.spread)
    return { kind: 'gain', stat, amount, message: action.message }
  }
  return { kind: 'unknown' }
}

/** What casting a spell on the Hero comes to, and the MP left after it. */
export function castOn(
  spell: Usable,
  vitals: Vitals,
  rng: BattleRng,
): { readonly outcome: Outcome | { readonly kind: 'notEnoughMp' }; readonly mp: number } {
  const cost = spell.cost === ALL_MP ? vitals.mp : spell.cost
  if (vitals.mp < cost || (spell.cost === ALL_MP && vitals.mp === 0)) {
    return { outcome: { kind: 'notEnoughMp' }, mp: vitals.mp }
  }
  const outcome = useOn(spell, { ...vitals, mp: vitals.mp - cost }, rng)
  if (outcome.kind === 'noUse' || outcome.kind === 'unknown') return { outcome, mp: vitals.mp }
  return { outcome, mp: outcome.kind === 'mp' ? outcome.mp : vitals.mp - cost }
}
