/**
 * **The combo chain** — `func_ov024_021ea584`, read 1 October 2026 (USA;
 * `docs/conformance.md`, "The combo"). The battle keeps the side of the last
 * blow, its action, its target, its turn and a count (`battle + 0x8e82`,
 * `+0x8e52`, `+0x8e50`, `+0x8e58`, `+0x8e83`), stepped once for each target
 * an action reaches, before its accuracy is rolled:
 *
 * - an action whose blows do not chain resets it (`func_ov000_0215cd80`);
 * - another side starts the count again; the same side from **another turn**
 *   adds one, the same turn leaves it;
 * - another action, or another target, starts it again.
 *
 * And a miss, a dodge, a block, or a blow that comes to less than one resets
 * it. So two of the party striking one monster in a round make a combo of 1;
 * the blow is multiplied by the combo table (`comboMultiplier`).
 *
 * Nothing read resets it at a round's end. **Ours**: a turn is a fighter's
 * action in a round, numbered by the round and the fighter.
 */
export interface Chain {
  readonly side: 'party' | 'foes' | undefined
  readonly count: number
  readonly action: number
  readonly target: number
  readonly turn: number
}

export const NO_CHAIN: Chain = { side: undefined, count: 0, action: 0, target: -1, turn: -1 }

/** The reset (`func_ov000_0215cd80`): no side, no count, no action, no turn — the last target kept. */
export function brokenChain(chain: Chain): Chain {
  return { side: undefined, count: 0, action: 0, target: chain.target, turn: -1 }
}

/** One step of the chain for a target an action reaches. */
export function chainStep(
  chain: Chain,
  blow: {
    readonly combos: boolean
    readonly side: 'party' | 'foes'
    readonly action: number
    readonly target: number
    readonly turn: number
  },
): Chain {
  if (!blow.combos) return brokenChain(chain)
  let count = chain.count
  if (chain.side !== blow.side) count = 0
  else if (chain.turn !== blow.turn) count += 1
  if (blow.action !== chain.action) count = 0
  if (blow.target !== chain.target) count = 0
  return { side: blow.side, count, action: blow.action, target: blow.target, turn: blow.turn }
}
