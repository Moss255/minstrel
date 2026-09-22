import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * `/data/prm/spelltable.bin` — the spell list, and which vocation learns
 * which spell at what level. A tagged data table (see "The tagged data table"
 * in FORMAT.md) of one `0x65`, one `0x64` — the level tables open the same way
 * — 65 `0x66` records and 108 `0x67`. See FORMAT.md, "The spell table".
 *
 * | record | values | reading |
 * |---|---|---|
 * | `0x66` | place, action | the spell list: the action at each place — 0 is Frizz, action 9 |
 * | `0x67` | vocation, place, level | a vocation learning the spell at that place, at that level — confirmed on the Minstrel's |
 *
 * Vocations are numbered as the level tables are, `level0` to `level12`: the
 * Mage, 3, learns Frizz at level 1 and the Priest, 2, Heal; the Warrior, the
 * Martial Artist and the Gladiator, the three with no magical might or mending,
 * learn nothing. The Minstrel's, 6, agree spell for spell and level for level
 * with a published guide's Minstrel page — FORMAT.md; the other vocations'
 * numbers are INFERRED.
 *
 * The `0x64` and `0x65` records are carried, not read.
 */

/** A place in the spell list. */
export const SPELL_TAG = 0x66
/** A vocation learning a spell. */
export const LEARNT_TAG = 0x67

export interface SpellLearnt {
  /** The vocation, numbered as the level tables are — 6 the Minstrel, confirmed; the rest INFERRED. */
  readonly vocation: number
  /** The spell's place in the list. */
  readonly place: number
  /** The action it is — see `readActions`. */
  readonly action: number
  /** The level it is learnt at — confirmed on the Minstrel's nine. */
  readonly level: number
}

export interface SpellTable {
  /** The spell list: the action at each place. */
  readonly list: ReadonlyMap<number, number>
  /** Who learns what, in the file's order. */
  readonly learnt: readonly SpellLearnt[]
  /** The records that are neither — `0x64`, `0x65` — not established. */
  readonly unknown: readonly TableRecord[]
}

function integers(record: TableRecord, count: number, what: string): number[] {
  if (record.values.length !== count || record.kinds.some((kind) => kind !== 1)) {
    throw new GameFormatError(
      `${what} record at 0x${record.offset.toString(16)} is not ${count} integers`,
      record.offset,
    )
  }
  return [...record.values]
}

/** Parse the spell table. */
export function readSpellTable(bytes: Uint8Array): SpellTable {
  const table = readDataTable(bytes)
  const list = new Map<number, number>()
  const unknown: TableRecord[] = []
  const learning: TableRecord[] = []
  for (const record of table.records) {
    if (record.tag === SPELL_TAG) {
      const [place, action] = integers(record, 2, 'spell list') as [number, number]
      if (list.has(place)) {
        throw new GameFormatError(`the spell list has place ${place} twice`, record.offset)
      }
      list.set(place, action)
    } else if (record.tag === LEARNT_TAG) learning.push(record)
    else unknown.push(record)
  }
  const learnt = learning.map((record) => {
    const [vocation, place, level] = integers(record, 3, 'learnt spell') as [number, number, number]
    const action = list.get(place)
    if (action === undefined) {
      throw new GameFormatError(
        `a spell learnt at 0x${record.offset.toString(16)} is at place ${place}, which the list does not have`,
        record.offset,
      )
    }
    return { vocation, place, action, level }
  })
  return { list, learnt, unknown }
}

/** The spells a vocation has learnt by a level, in the order it learns them. */
export function spellsLearnt(table: SpellTable, vocation: number, level: number): SpellLearnt[] {
  return table.learnt
    .filter((spell) => spell.vocation === vocation && spell.level <= level)
    .sort((a, b) => a.level - b.level || a.place - b.place)
}
