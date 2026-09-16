import { describe, expect, it } from 'vitest'
import { ActionEffect, ActionReach, readActionRanges, readActions } from '../src/actions.ts'
import { GameFormatError } from '../src/errors.ts'

/** An action table built in code, from `FORMAT.md`: the head word, 60-byte records, then the strings. */
function actions(
  records: {
    id: number
    name: string
    plural: string
    range?: number
    effect?: number
    cost?: number
    message?: number
    opening?: number
    reach?: number
  }[],
) {
  const strings: number[] = []
  const offset = (text: string) => {
    const at = strings.length
    for (const c of text) strings.push(c.charCodeAt(0))
    strings.push(0)
    return at
  }
  const head = 4 + records.length * 60
  const out = new Uint8Array(head + 200)
  const view = new DataView(out.buffer)
  for (const [
    r,
    { id, name, plural, range = 0, effect = 0, cost = 0, message = 0, opening = 0, reach = 0 },
  ] of records.entries()) {
    const at = 4 + r * 60
    view.setUint32(at, offset(name), true)
    // The number's upper bits are other things; they must not leak into it.
    view.setUint32(at + 4, (0xf9c32000 | id) >>> 0, true)
    view.setUint32(at + 8, ((0x08 << 24) | (range << 14) | 0x0e00 | cost) >>> 0, true)
    // The message's lower neighbours likewise: the opening under it, then a neighbour.
    view.setUint32(at + 0x20, ((message << 20) | (opening << 10) | 0x2e) >>> 0, true)
    // Whom it reaches in the high nibble, a neighbour in the low.
    out[at + 0x17] = (reach << 4) | 6
    view.setUint32(at + 0x24, (0x01617c00 | effect) >>> 0, true)
    view.setUint32(at + 0x34, offset(plural), true)
  }
  const bytes = new Uint8Array(head + strings.length)
  bytes.set(out.subarray(0, head))
  bytes.set(strings, head)
  new DataView(bytes.buffer).setUint32(0, ((strings.length << 12) | records.length) >>> 0, true)
  return bytes
}

/** A range table built in code: a count, then 8-byte records. */
function ranges(
  records: [index: number, spread: number, base: number, second: number, peak: number][],
) {
  const out = new Uint8Array(4 + records.length * 8)
  const view = new DataView(out.buffer)
  view.setUint32(0, records.length, true)
  for (const [r, [index, spread, base, second, peak]] of records.entries()) {
    out[4 + r * 8] = index
    out[5 + r * 8] = spread
    view.setUint32(8 + r * 8, (peak << 20) | (second << 10) | base, true)
  }
  return out
}

describe('the action table', () => {
  it('reads each action: its number, name, plural and range', () => {
    const [heal, herb] = readActions(
      actions([
        { id: 30, name: 'Heal', plural: '', range: 0x10 },
        {
          id: 255,
          name: 'medicinal herb',
          plural: 'medicinal herbs',
          range: 0x31,
          effect: ActionEffect.RestoresHp,
        },
      ]),
    )
    expect(heal).toMatchObject({ id: 30, name: 'Heal', range: 0x10, effect: 0 })
    expect(herb?.effect).toBe(ActionEffect.RestoresHp)
    expect(herb).toMatchObject({ id: 255, name: 'medicinal herb', plural: 'medicinal herbs' })
    expect(herb?.range).toBe(0x31)
    expect(herb?.raw).toHaveLength(60)
  })

  it('reads what an action costs and what it says', () => {
    const [heal, burst, seed] = readActions(
      actions([
        { id: 30, name: 'Heal', plural: '', cost: 2, message: 22, opening: 46 },
        { id: 28, name: 'Magic Burst', plural: '', cost: 255, message: 2, opening: 46 },
        { id: 262, name: 'seed of life', plural: '', message: 157, opening: 70 },
      ]),
    )
    expect(heal).toMatchObject({ cost: 2, message: 22, opening: 46 })
    expect(burst).toMatchObject({ cost: 255, message: 2, opening: 46 })
    expect(seed).toMatchObject({ cost: 0, message: 157, opening: 70 })
  })

  it('reads whom an action reaches', () => {
    const [crack, woosh, boom] = readActions(
      actions([
        { id: 12, name: 'Crack', plural: '', reach: ActionReach.One },
        { id: 18, name: 'Woosh', plural: '', reach: ActionReach.Group },
        { id: 22, name: 'Boom', plural: '', reach: ActionReach.All },
      ]),
    )
    expect([crack?.reach, woosh?.reach, boom?.reach]).toEqual([2, 4, 3])
  })

  it('refuses a head word that does not describe the file, or an offset mid-string', () => {
    const table = actions([{ id: 1, name: 'Attack', plural: '' }])
    expect(() => readActions(table.subarray(0, table.length - 1))).toThrow(GameFormatError)
    const shifted = table.slice()
    new DataView(shifted.buffer).setUint32(4, 2, true)
    expect(() => readActions(shifted)).toThrow(/does not start a string/)
    expect(() => readActions(new Uint8Array(2))).toThrow(GameFormatError)
  })
})

describe('the range table', () => {
  it('reads each range: its spread, base and peak, by index', () => {
    const read = readActionRanges(
      ranges([
        [0x10, 5, 35, 35, 160],
        [0x31, 5, 35, 35, 35],
      ]),
    )
    expect(read.get(0x10)).toEqual({
      index: 0x10,
      spread: 5,
      base: 35,
      party: 35,
      peak: 160,
    })
    expect(read.get(0x31)?.peak).toBe(35)
  })

  it('refuses a count that does not describe the file', () => {
    expect(() => readActionRanges(ranges([[1, 2, 3, 4, 5]]).subarray(0, 11))).toThrow(
      GameFormatError,
    )
  })
})
