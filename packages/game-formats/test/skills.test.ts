import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  GRANTS_ABILITY,
  panelsBought,
  panelsOfTree,
  readSkillTable,
  SKILL_PANEL_TAG,
} from '../src/skills.ts'

/**
 * A synthetic `skilltable.bin`. Fixtures may not hold cartridge bytes, so the
 * layout is built here from `FORMAT.md`, "The tagged data table" and
 * "Vocation skill trees".
 */
const KIND_NUMBER = 1

function build(records: { tag: number; values: number[]; kinds?: number[] }[]): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.values.length
    const kindBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + kindBytes) / 4) * 4
    const kinds = new Uint8Array(header - 3)
    for (let i = 0; i < count; i++) {
      const kind = record.kinds?.[i] ?? KIND_NUMBER
      kinds[i >> 2] = (kinds[i >> 2] as number) | ((kind & 3) << ((i & 3) * 2))
    }
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count)
    for (const byte of kinds) body.push(byte)
    for (const v of record.values) push32(v)
  }
  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(4, 16 + body.length, true)
  out.set(Uint8Array.from(body), 16)
  return out
}

/** One panel: id, tree, cost, action, grants, amount, fieldAction, 7, message. */
const panel = (over: Partial<Record<number, number>> = {}) => {
  const values = [0, 1, 3, 63, GRANTS_ABILITY, 0, 0, 0, 1]
  for (const [at, v] of Object.entries(over)) values[Number(at)] = v as number
  return { tag: SKILL_PANEL_TAG, values }
}

describe('readSkillTable', () => {
  it('reads a panel’s tree, cost and what it gives', () => {
    const [read] = readSkillTable(
      build([panel({ 0: 5, 1: 3, 2: 22, 3: 0, 4: 3, 5: 3, 6: 0, 7: 9, 8: 3 })]),
    )
    expect(read).toEqual({
      id: 5,
      tree: 3,
      cost: 22,
      action: 0,
      grants: 3,
      amount: 3,
      fieldAction: 0,
      unknown_7: 9,
      message: 3,
    })
  })

  it('climbs a tree cheapest first, whatever order the file is in', () => {
    // The file is not sorted by cost within a tree on the cartridge either.
    const panels = readSkillTable(
      build([
        panel({ 0: 2, 1: 1, 2: 13 }),
        panel({ 0: 0, 1: 1, 2: 3 }),
        panel({ 0: 9, 1: 2, 2: 5 }),
        panel({ 0: 1, 1: 1, 2: 7 }),
      ]),
    )
    expect(panelsOfTree(panels, 1).map((p) => p.cost)).toEqual([3, 7, 13])
    expect(panelsOfTree(panels, 2).map((p) => p.id)).toEqual([9])
    expect(panelsOfTree(panels, 99)).toEqual([])
  })

  it('counts what a number of points in a tree has bought', () => {
    const panels = readSkillTable(
      build([panel({ 0: 0, 2: 3 }), panel({ 0: 1, 2: 7 }), panel({ 0: 2, 2: 13 })]),
    )
    expect(panelsBought(panels, 1, 0)).toEqual([])
    expect(panelsBought(panels, 1, 7).map((p) => p.id)).toEqual([0, 1])
    expect(panelsBought(panels, 1, 100)).toHaveLength(3)
  })

  it('refuses a table with no panels, a short record, or a value of the wrong kind', () => {
    expect(() => readSkillTable(build([{ tag: 0x64, values: [1] }]))).toThrow(/no skill panels/)
    expect(() => readSkillTable(build([{ tag: SKILL_PANEL_TAG, values: [1, 2, 3] }]))).toThrow(
      /has 3 values, not 9/,
    )
    // A cost that is a string offset rather than an integer.
    const wrong = build([{ ...panel(), kinds: [1, 1, 0, 1, 1, 1, 1, 1, 1] }])
    expect(() => readSkillTable(wrong)).toThrow(GameFormatError)
    expect(() => readSkillTable(wrong)).toThrow(/a cost of kind 0/)
  })
})
