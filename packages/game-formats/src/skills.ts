import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * `/data/prm/skilltable.bin` — what a skill point buys.
 *
 * A loose tagged data table (FORMAT.md, "The tagged data table") of **287
 * `0x66` records of nine integers**: twenty-six trees of eleven panels each,
 * and one record outside them all. The trees are the ones
 * `readVocationTrees` numbers — fourteen weapon and shield trees, then one of
 * a vocation's own per vocation, `str_sklc` 15 to 26.
 *
 * **Where this was:** the ARM9 carries a per-tag handler table for the file
 * immediately before its path string, and the `0x66` handler reads exactly
 * nine values into a twelve-byte record. That is where the nine fields and
 * their widths come from rather than from counting bytes here.
 *
 * **The joint witness.** `/data/prm/sklname.gp2` is a separate file naming the
 * same panels, and its tree and cost agree with this one on **all 287**, as
 * does its "grants an ability" flag against {@link GRANTS_ABILITY}. Two files
 * written by different hands agreeing everywhere is better evidence than any
 * amount of staring at one.
 */

export const SKILL_PANEL_TAG = 0x66
const PANEL_VALUES = 9
/** A value's kind when it is an integer — see `TableRecord.kinds`. */
const KIND_NUMBER = 1

/** Panels to a tree, and trees: 26 × 11, and one record belonging to neither. */
export const PANELS_A_TREE = 11
export const SKILL_TREES = 26

/**
 * What a panel gives, by {@link SkillPanel.grants}.
 *
 * **INFERRED** — the numbers are read, the names are not. Each value appears
 * with exactly one `str_gskl` message, and the message says what it does;
 * these names are those messages read, not a table in the game.
 *
 * `0` means the message is the whole of it — Auto MP Recovery, Critical Hit
 * Guard, Auto Counter and the rest, which have no amount and no stat.
 */
export const GRANTS_ABILITY = 1
export const GRANTS: Readonly<Record<number, string>> = {
  0: 'what its message says',
  1: 'an ability',
  2: 'attack',
  3: 'critical hit rate',
  4: 'the tree’s weapon whatever the vocation',
  5: 'shield block chance',
  6: 'strength',
  7: 'resilience',
  8: 'agility',
  9: 'deftness',
  10: 'charm',
  11: 'maximum HP',
  12: 'maximum MP',
  13: 'MP absorption',
  14: 'evasion',
  15: 'magical mending',
  16: 'magical might',
  17: 'spell critical rate',
}

/** Where the weapon nouns and the stat nouns begin in `str_gskl` — INFERRED. */
export const GSKL_WEAPON_NOUN = 100
export const GSKL_STAT_NOUN = 200

export interface SkillPanel {
  /** Its number, 0 to 286, which is how `sklname` and `sta_skl` name it. */
  readonly id: number
  /** Its tree, 1 to 26 — `str_sklc` 14 + this. Zero on the one odd record. */
  readonly tree: number
  /**
   * The skill points it costs. Rising within a tree — **but each tree's
   * eleventh panel costs nothing**, and what unlocks it is not established.
   * It is not the hundred-point reward: that is a panel of its own.
   */
  readonly cost: number
  /** The action it teaches, or 0 where it teaches none. */
  readonly action: number
  /** What it gives — see {@link GRANTS}. */
  readonly grants: number
  /** How much of it: the `<val_1>` of the message. */
  readonly amount: number
  /**
   * A second action, on exactly ten panels — all of them abilities usable out
   * of a battle, and equal to {@link action} on eight of the ten.
   * **INFERRED**: the ability's field form. Not confirmed from the game.
   */
  readonly fieldAction: number
  /**
   * A second 0-to-286 index, eleven to a tree like {@link id} but ordering
   * the trees differently. **Not established**; the game keeps both.
   */
  readonly unknown_7: number
  /** The `str_gskl` message shown when it is bought, 1 to 23. */
  readonly message: number
}

function integer(record: TableRecord, at: number, what: string): number {
  if (record.kinds[at] !== KIND_NUMBER) {
    throw new GameFormatError(
      `skill panel at 0x${record.offset.toString(16)} has ${what} of kind ${String(record.kinds[at])}, not an integer`,
      record.offset,
    )
  }
  return record.values[at] as number
}

/** Read the skill panels, in the file's own order. */
export function readSkillTable(data: Uint8Array): SkillPanel[] {
  const table = readDataTable(data)
  const rows = table.withTag(SKILL_PANEL_TAG)
  if (rows.length === 0) throw new GameFormatError('no skill panels in this table')
  return rows.map((record) => {
    if (record.values.length !== PANEL_VALUES) {
      throw new GameFormatError(
        `skill panel at 0x${record.offset.toString(16)} has ${record.values.length} values, not ${PANEL_VALUES}`,
        record.offset,
      )
    }
    return {
      id: integer(record, 0, 'an id'),
      tree: integer(record, 1, 'a tree'),
      cost: integer(record, 2, 'a cost'),
      action: integer(record, 3, 'an action'),
      grants: integer(record, 4, 'what it grants'),
      amount: integer(record, 5, 'an amount'),
      fieldAction: integer(record, 6, 'a second action'),
      unknown_7: integer(record, 7, 'value 7'),
      message: integer(record, 8, 'a message'),
    }
  })
}

/** The panels of one tree, cheapest first — the ladder as it is climbed. */
export function panelsOfTree(panels: readonly SkillPanel[], tree: number): SkillPanel[] {
  return panels.filter((panel) => panel.tree === tree).sort((a, b) => a.cost - b.cost)
}

/**
 * What a character has bought in a tree, given what they have spent in it:
 * every panel whose cost it covers.
 *
 * **Ours, and the obvious reading**: a tree's panels have rising costs and the
 * game spends into a tree rather than onto a panel, so the points in a tree
 * are a high-water mark. The eleventh panel costs nothing and so is always
 * included, which is very likely wrong — see {@link SkillPanel.cost}.
 */
export function panelsBought(panels: readonly SkillPanel[], tree: number, spent: number) {
  return panelsOfTree(panels, tree).filter((panel) => panel.cost <= spent)
}
