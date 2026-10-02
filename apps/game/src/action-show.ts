import type { ActionScript, ActionSection } from '@minstrel/game-formats'
import { sectionsFor } from '@minstrel/game-formats'
import type { BattleEvent, BattleState } from '@minstrel/sim'
import type { ActionContext } from './action-player.ts'
import { MONSTER_BASE } from './action-player.ts'
import type { ActionResults, ShownResult } from './action-reactions.ts'

/**
 * **A battle event, as the action the game would show** — which script it
 * plays and what its results are (FORMAT.md, "The action scripts").
 *
 * The battle here is the simulation's, and it hands back events, not the
 * game's action records. So this is where **ours** lives: which of the game's
 * action numbers an event is, and which of the presenter's result flags each
 * outcome carries. Every choice is marked.
 */

/** The game's own action numbers for what the simulation tells without one (`actdt`, read 1 October 2026). */
export const ACTIONS = {
  attack: 1,
  defend: 3,
  /** "Flee" again — **ours** for a monster running away; which the game's monsters use is not read. */
  monsterFlee: 917,
} as const

/** The battle's object index for a fighter: the party 0–3, the monsters from `0xc0` (`func_ov000_0215ec1c`). */
export function objectOf(state: BattleState, fighter: number): number {
  const party = state.fighters.filter((f) => f.side === 'party').length
  return fighter < party ? fighter : MONSTER_BASE + (fighter - party)
}

/**
 * **The result flags each outcome carries** — the numbers the presenter tests
 * (`func_ov025_021d8c30`), read from where overlay 0 and 24 write them
 * (`func_ov000_02159eac`, and `func_ov000_0215a004` as HP is taken), 1
 * October 2026: a blow that lands {1}; one that kills {1, 2}, anything set
 * before it wiped (`0x0215a060`); a miss, nothing dealt or a blow stopped {4};
 * dodged {4, 5}; blocked by a shield {4, 6}; a heal {37}, its amount the HP
 * restored negated, and nothing at all when there was nothing to heal; Defend
 * and Flee none. **Which of the simulation's outcomes is which is ours**,
 * though each is the same outcome by name.
 */
export const FLAG = {
  damage: 1,
  killed: 2,
  missed: 4,
  dodged: 5,
  blocked: 6,
  recovered: 37,
  /** Tension raised, shown as its number (`func_ov024_021dc93c`, `0x021dccf0`). */
  tension: 35,
  /** The maximum reached (`0x021dcd08`). */
  most: 7,
} as const

/** What a blow, or a spell that harms, came to — see {@link FLAG}. */
function blowFlags(amount: number, killed: boolean, dodged = false, blocked = false): number[] {
  if (dodged) return [FLAG.missed, FLAG.dodged]
  if (blocked) return [FLAG.missed, FLAG.blocked]
  if (amount <= 0) return [FLAG.missed]
  return killed ? [FLAG.damage, FLAG.killed] : [FLAG.damage]
}

const result = (
  flags: number[],
  amount: number,
  critical: boolean,
  lines: string[],
): ShownResult => ({
  flags: new Set(flags),
  amount,
  critical,
  lines,
})

/**
 * **The action an event shows**: its number, who acts and who is acted on,
 * and the results, each with the lines of the page that say it. `lines` is
 * the page split at its line breaks; `defeated` lists those the action killed
 * whose own page follows, so their death is shown in this action as the game
 * shows it, their line after their result's.
 */
export function actionOf(
  event: BattleEvent,
  state: BattleState,
  lines: readonly string[],
  options: {
    readonly itemAction?: (item: number) => number | undefined
    readonly defeated?: ReadonlyMap<number, readonly string[]>
  } = {},
): { readonly context: ActionContext; readonly results: ActionResults } | undefined {
  const obj = (i: number) => objectOf(state, i)
  const dead = (i: number) => (state.fighters[i]?.hp ?? 1) <= 0
  const tail = (i: number) => options.defeated?.get(i) ?? []
  const foe = (i: number) => state.fighters[i]?.side === 'foes'
  switch (event.kind) {
    case 'attack': {
      const [opening, ...rest] = lines
      const flags = blowFlags(event.damage, dead(event.target), event.dodged, event.blocked)
      return {
        context: {
          action: ACTIONS.attack,
          actors: [obj(event.actor)],
          targets: [{ receivers: [obj(event.target)] }],
        },
        results: {
          opening,
          targets: [
            {
              receiver: obj(event.target),
              results: [
                {
                  ...result(flags, event.damage, event.critical, [...rest, ...tail(event.target)]),
                  ...(event.combo ? { combo: event.combo } : {}),
                },
              ],
            },
          ],
          own: [],
        },
      }
    }
    case 'blow': {
      // The opening, if the action says one, then each pass's lines — a
      // critical's and the hit's — then what came back to the striker, as its
      // own results (list A): HP (37) or MP (34) back, the recoil a blow (1).
      const perHit = event.hits.map((h) => (h.critical && !h.dodged && !h.blocked ? 2 : 1))
      const afterLines =
        (event.regained?.mp ? 1 : 0) + (event.regained?.hp ? 1 : 0) + (event.recoil ? 1 : 0)
      const opens = Math.max(0, lines.length - perHit.reduce((a, b) => a + b, 0) - afterLines)
      let at = opens
      const shown = event.hits.map((hit, k) => {
        const own = lines.slice(at, at + (perHit[k] ?? 1))
        at += perHit[k] ?? 1
        const flags = blowFlags(hit.damage, dead(hit.target), hit.dodged, hit.blocked)
        return {
          receiver: obj(hit.target),
          results: [result(flags, hit.damage, hit.critical, [...own, ...tail(hit.target)])],
        }
      })
      const rest = lines.slice(at)
      const own = [
        ...(event.regained?.mp ? [result([34], -event.regained.mp, false, rest.splice(0, 1))] : []),
        ...(event.regained?.hp
          ? [result([FLAG.recovered], -event.regained.hp, false, rest.splice(0, 1))]
          : []),
        ...(event.recoil
          ? [
              result(
                blowFlags(event.recoil, dead(event.actor)),
                event.recoil,
                false,
                rest.splice(0, 1),
              ),
            ]
          : []),
      ]
      return {
        context: {
          action: event.action,
          actors: [obj(event.actor)],
          targets: shown.map((t) => ({ receivers: [t.receiver] })),
        },
        results: {
          opening: lines.slice(0, opens).join('\n') || undefined,
          targets: shown,
          own,
        },
      }
    }
    case 'spell':
    case 'change': {
      const n = event.short ? 0 : event.hits.length
      const opens = lines.slice(0, lines.length - n)
      const per = lines.slice(lines.length - n)
      const harms =
        event.kind === 'spell' && event.hits.some((h) => foe(h.target) !== foe(event.actor))
      const shown = event.short
        ? []
        : event.hits.map((hit, k) => {
            const amount = 'amount' in hit ? hit.amount : 0
            const flags =
              event.kind === 'change'
                ? []
                : harms
                  ? blowFlags(amount, dead(hit.target))
                  : amount > 0
                    ? [FLAG.recovered]
                    : []
            return {
              receiver: obj(hit.target),
              results: [
                result(flags, harms ? amount : -amount, false, [
                  ...(per[k] !== undefined ? [per[k] as string] : []),
                  ...tail(hit.target),
                ]),
              ],
            }
          })
      return {
        context: {
          action: event.action,
          actors: [obj(event.actor)],
          targets: shown.map((t) => ({ receivers: [t.receiver] })),
        },
        results: { opening: opens.join('\n') || undefined, targets: shown, own: [] },
      }
    }
    case 'item': {
      const [opening, ...rest] = lines
      const action = options.itemAction?.(event.item)
      if (action === undefined) return undefined
      const healed = event.healed ?? 0
      return {
        context: {
          action,
          actors: [obj(event.actor)],
          targets: [{ receivers: [obj(event.target)] }],
        },
        results: {
          opening,
          targets: [
            {
              receiver: obj(event.target),
              results: [result(healed > 0 ? [FLAG.recovered] : [], -healed, false, rest)],
            },
          ],
          own: [],
        },
      }
    }
    case 'flee':
      // The party's flight is no action: overlay 26 settles it as the commands
      // are taken, and state 11 only puts its line up (overlay 23). A monster's is.
      if (!foe(event.actor)) return undefined
      return {
        context: { action: ACTIONS.monsterFlee, actors: [obj(event.actor)], targets: [] },
        results: { opening: lines.join('\n') || undefined, targets: [], own: [] },
      }
    case 'psyche': {
      // One result a step, on the one psyching up: the level reached, or
      // nothing for the coin lost; one empty result when nothing happens.
      const n = Math.max(1, event.steps.length)
      const opens = lines.slice(0, lines.length - n)
      const per = lines.slice(lines.length - n)
      const steps = event.steps.length === 0 ? [0] : event.steps
      return {
        context: {
          action: event.action,
          actors: [obj(event.actor)],
          targets: [{ receivers: [obj(event.actor)] }],
        },
        results: {
          opening: opens.join('\n') || undefined,
          targets: [
            {
              receiver: obj(event.actor),
              results: steps.map((step, k) =>
                result(
                  step === 4 ? [FLAG.tension, FLAG.most] : step > 0 ? [FLAG.tension] : [],
                  Math.max(0, step),
                  false,
                  per[k] !== undefined ? [per[k] as string] : [],
                ),
              ),
            },
          ],
          own: [],
        },
      }
    }
    case 'defend':
    case 'wait': {
      const action = event.kind === 'defend' ? ACTIONS.defend : event.action
      return {
        context: { action, actors: [obj(event.actor)], targets: [] },
        results: { opening: lines.join('\n') || undefined, targets: [], own: [] },
      }
    }
    default:
      return undefined
  }
}

/** What an action's script is chosen from — see {@link scriptFor}. */
export interface ScriptSources {
  /** The one acting's own file: a motion set's, a companion's, a monster's. */
  readonly own: ActionScript | undefined
  /** The action's own `sp%03d.bact`, by the archive its record names, if it has one. */
  readonly skill: ActionScript | undefined
  /** `default.bact`. */
  readonly fallback: ActionScript | undefined
  /** The action's kind (`+0x18` bits 5–11): 12 takes `default.bact`'s 344 when it has no file. */
  readonly kind: number
}

/**
 * **Which section an action plays** (`func_ov025_021dbe10`, `021dc694`):
 * the fighter's own first; for a second blow on the same target its second
 * section keyed 1; then the action's own file's first section, whatever its
 * keys; then `default.bact`'s by the number, or 344 for kind 12.
 */
export function scriptFor(
  action: number,
  sources: ScriptSources,
  secondBlow = false,
): ActionSection | undefined {
  const own = sources.own ? sectionsFor(sources.own, action) : []
  if (secondBlow && action === 1 && own[1]) return own[1]
  if (own[0]) return own[0]
  const first = sources.skill?.sections[0]
  if (first) return first
  const fallback = sources.fallback
  if (!fallback) return undefined
  return (
    sectionsFor(fallback, action)[0] ??
    (sources.kind === 12 ? sectionsFor(fallback, 344)[0] : undefined)
  )
}
