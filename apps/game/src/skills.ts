import {
  GRANTS,
  GRANTS_ABILITY,
  GSKL_STAT_NOUN,
  GSKL_WEAPON_NOUN,
  panelsOfTree,
  type SkillPanel,
  TREES_A_VOCATION,
  type VocationTrees,
} from '@minstrel/game-formats'
import type { Member } from './companion.ts'

/**
 * The skill trees, as a character climbs them.
 *
 * The data has been read since 24 September 2026 — `/data/prm/skilltable.bin`
 * holds 287 panels, 26 trees of 11, and the ARM9 holds which five trees each
 * vocation may spend in — and nothing spent a point. This is the model the
 * skill screen is built on.
 *
 * **The game's own arrangement**, from the character record (see
 * `docs/party-and-vocations.md`): the pool is **one per character**, at
 * `+0xF4`, and the points spent are **per tree**, 27 bytes at `+0xF6` each
 * 0 to 100. Neither is a vocation's, so neither is touched by changing
 * vocation or by revocation — a Warrior who learnt Sword keeps it as a Mage,
 * and the Mage may spend in Sword too if the Mage's five trees include it.
 */

/**
 * The most that may be put into one tree.
 *
 * The record's bytes run 0 to 100, and the menu refuses a point that would
 * take the tree past it: `ov013 0x02186344: cmp r1, #0x64 / beq` and
 * `0x02186354: cmp r0, #0x64 / bge`.
 */
export const TREE_MOST = 100

/**
 * The most skill points a character may hold unspent: **2,600**.
 *
 * `ov023 0x021f0c68` loads `0x00000A28` and clamps a level's award to the
 * headroom under it before adding, and the seed path at `0x02084df4` uses the
 * same number. 2,600 is 200 × 13 — the whole of one level table's column 10,
 * once for each of the thirteen vocations — which is a good sign the reading
 * is right rather than a coincidence.
 */
export const POOL_MOST = 2600

/**
 * The five trees a vocation may spend in, in the table's own order: four
 * weapon, shield or fisticuffs trees and, last, the vocation's own.
 *
 * Empty when the table did not read — which leaves the skill screen saying so
 * rather than offering trees nobody can check.
 */
export function treesOf(trees: VocationTrees | undefined, vocation: number): number[] {
  const row = trees?.rows[vocation - 1]
  return row ? [...row].slice(0, TREES_A_VOCATION) : []
}

/**
 * One panel as the screen shows it: what it is called, what it costs, and
 * whether this character has it.
 */
export interface SkillStep {
  readonly panel: SkillPanel
  /** Its short label — `sta_skl`, the menu's own word; its id where that did not read. */
  readonly name: string
  /** Whether the points already in the tree reach it. */
  readonly bought: boolean
  /** What buying it would cost from the pool: nothing once it is bought. */
  readonly toBuy: number
  /**
   * Whether it can be bought at all. **The eleventh panel of every tree
   * cannot** — see {@link climbable}.
   */
  readonly buyable: boolean
  /** The sentence it says when it is bought, its nouns filled in — see {@link saidOf}. */
  readonly says: string | undefined
}

/**
 * The words a skill screen needs: `str_sklc`'s tree names, `sta_skl`'s panel
 * labels, `str_gskl`'s sentences, and a way to name the ability an action is —
 * which lives in `skl_art`, a file away from all three.
 */
export interface SkillWords {
  readonly trees: ReadonlyMap<number, string>
  readonly panels: ReadonlyMap<number, string>
  readonly said: ReadonlyMap<number, string>
  /** What an action is called, by its number; undefined where nothing names it. */
  readonly abilityOf?: ((action: number) => string | undefined) | undefined
}

/** A tree as the screen shows it. */
export interface SkillTreeView {
  readonly tree: number
  /** Its name — `str_sklc`, which numbers the trees exactly as the panels do. */
  readonly name: string
  /** Points put into it so far, 0 to {@link TREE_MOST}. */
  readonly spent: number
  readonly steps: readonly SkillStep[]
}

/**
 * The panels of a tree that points can reach: **all but the eleventh**.
 *
 * Every tree has a panel whose cost reads 0, and it is not a free starter. In
 * all twenty-six trees it is **last** in the file, after the hundred-point
 * one, and it holds the tree's marquee ability — Sword's Gigagash, Shield's
 * Critical Hit Guard, Courage's Auto Counter.
 *
 * **Read 24 September 2026, and it is settled: the game never reaches it.**
 * The ownership walk at `0x0209a678` goes through a tree's eleven records in
 * file order, counting while the points *exceed* the cost and taking one more
 * if they equal it, then **stopping**:
 *
 * ```
 * 0209a6d4  cmp   r0, r8, lsr #25   ; points vs this panel's cost
 * 0209a6dc  bhi   #0x209a6ec        ; more: count it and go on
 * 0209a6e0  cmp   r0, r8
 * 0209a6e4  addeq r1, r1, #1        ; equal: count it and stop
 * ```
 *
 * The tenth costs exactly 100 and a tree's points are capped at 100, so the
 * walk always stops there. The skill menu agrees from the other side: it
 * draws **ten** entries a tree, `ov013 0x02187b64: cmp r7, #0xa`.
 *
 * So the eleventh is unreachable by design. **What, if anything, grants it is
 * still not established** — no code found reads it — but it is certainly not
 * points, and treating its zero as a price would hand every character
 * Gigagash for nothing.
 */
export function climbable(panels: readonly SkillPanel[], tree: number): SkillPanel[] {
  return panelsOfTree(panels, tree).filter((panel) => panel.cost > 0)
}

/**
 * The sentence a panel says when it is bought, from `str_gskl` with its nouns
 * put in.
 *
 * **INFERRED, and consistent with all 287**: the weapon noun is
 * `100 + the tree`, the stat noun `200 + what it grants`, and `<val_1>` the
 * amount. What `<str_2>` takes depends on the message:
 *
 * - "…**learns** `<str_2>`!" — message 1, and every message-1 panel grants an
 *   ability. `<str_2>` is **the ability's own name**, which is not in this
 *   file: it is `skl_art` keyed by the panel's action. Hand it in as
 *   `ability`, or the sentence reads "Hero learns a sword!".
 * - "…when equipped with `<str_2>`", "…able to equip `<str_2>` regardless of
 *   vocation" — the weapon noun.
 * - "…`<str_2>` increases by `<val_1>`" — the stat noun, where the tree has no
 *   weapon of its own.
 *
 * The remaining markup — `<Cap>`, `<ACTOR>`, `<1>` — is left to the caller's
 * own message machinery.
 */
export function saidOf(
  panel: SkillPanel,
  said: ReadonlyMap<number, string>,
  ability?: string | undefined,
): string | undefined {
  const template = said.get(panel.message)
  if (template === undefined) return undefined
  const weapon = said.get(GSKL_WEAPON_NOUN + panel.tree)
  const stat = said.get(GSKL_STAT_NOUN + panel.grants)
  const learns = panel.grants === GRANTS_ABILITY
  return template
    .replaceAll('<val_1>', String(panel.amount))
    .replaceAll(
      '<str_2>',
      (learns ? ability : undefined) ?? weapon ?? stat ?? GRANTS[panel.grants] ?? '',
    )
    .replaceAll('<str_3>', stat ?? '')
}

/** What a character has put into a tree. */
export const spentIn = (member: Member, tree: number): number => member.treePoints.get(tree) ?? 0

/** A tree as the skill screen shows it for one character — see {@link SkillTreeView}. */
export function treeView(
  member: Member,
  tree: number,
  panels: readonly SkillPanel[],
  words: SkillWords,
): SkillTreeView {
  const spent = spentIn(member, tree)
  // Climbed cheapest first, with the eleventh last — which is where the file
  // itself puts it, after the hundred-point panel. `panelsOfTree` sorts by
  // cost, and a cost that is not a price sorts to the front.
  const ladder = [...climbable(panels, tree), ...panelsOfTree(panels, tree).filter((p) => !p.cost)]
  const steps = ladder.map((panel) => {
    const buyable = panel.cost > 0
    const bought = buyable && spent >= panel.cost
    return {
      panel,
      name: words.panels.get(panel.id) ?? `panel ${panel.id}`,
      bought,
      toBuy: bought || !buyable ? 0 : panel.cost - spent,
      buyable,
      says: saidOf(panel, words.said, words.abilityOf?.(panel.action)),
    }
  })
  return { tree, name: words.trees.get(tree) ?? `skill tree ${tree}`, spent, steps }
}

/**
 * Put points into a tree, taking them from the character's pool.
 *
 * **This is what spending is.** The game's screen adds and removes one point
 * at a time (`ov013 0x02186398` and `0x021862e4`) against three guards — the
 * pool must be above zero, the tree must not already be at 100, and the total
 * must stay below 100 — and on leaving it writes `tree += added` and
 * `pool -= added` (`ov013 0x02184c8c`). A panel is not bought; it is **had
 * once the tree's total reaches its cost**.
 *
 * Returns what went in: everything asked for, or as much as the pool and the
 * ceiling allowed, and 0 when neither had anything to give.
 */
export function spend(member: Member, tree: number, points: number): number {
  if (points <= 0) return 0
  const already = spentIn(member, tree)
  const put = Math.min(points, member.skillPool, TREE_MOST - already)
  if (put <= 0) return 0
  member.treePoints.set(tree, already + put)
  member.skillPool -= put
  return put
}

/**
 * Put in enough to reach a panel — pressing the game's own `+` until it
 * lights, in one go.
 *
 * So reaching Falcon Slash at 58 with 42 already in Sword costs 16, and
 * Attack+20 at 42 came with the points on the way. Undefined when the pool
 * will not cover it, when the panel is already had, or when it is the
 * eleventh, which no number of points reaches — see {@link climbable}.
 */
export function buy(member: Member, tree: number, panel: SkillPanel): number | undefined {
  if (panel.tree !== tree || panel.cost <= 0 || panel.cost > TREE_MOST) return undefined
  const cost = panel.cost - spentIn(member, tree)
  if (cost <= 0 || cost > member.skillPool) return undefined
  return spend(member, tree, cost)
}

/**
 * The panels a character has, across every tree — what a skill screen totals
 * and what a battle would read to know their abilities.
 *
 * **Every tree they have ever spent in**, not only their vocation's five: the
 * points are kept per tree and the pool per character, so what was learnt as a
 * Warrior is still learnt as a Mage. Whether the *ability* is usable in a
 * vocation that cannot hold the weapon is a separate question and not read.
 */
export function panelsHeld(member: Member, panels: readonly SkillPanel[]): SkillPanel[] {
  const held: SkillPanel[] = []
  for (const [tree, spent] of member.treePoints) {
    for (const panel of climbable(panels, tree)) if (panel.cost <= spent) held.push(panel)
  }
  return held
}
