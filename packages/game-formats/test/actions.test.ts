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
    evadable?: boolean
    blockable?: boolean
    alwaysCritical?: boolean
    criticalPercent?: number
    kind?: number
    damageCap?: number
    worksOnMetal?: boolean
    mode?: number
    scalesBy?: 'might' | 'mending'
    scale?: [lo: number, hi: number]
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
    {
      id,
      name,
      plural,
      range = 0,
      effect = 0,
      cost = 0,
      message = 0,
      opening = 0,
      reach = 0,
      evadable = false,
      blockable = false,
      alwaysCritical = false,
      criticalPercent = 0,
      kind = 0,
      damageCap = 0,
      worksOnMetal = false,
      mode = 3,
      scalesBy,
      scale,
    },
  ] of records.entries()) {
    const at = 4 + r * 60
    view.setUint32(at, offset(name), true)
    // The number's upper bits are other things; they must not leak into it.
    view.setUint32(
      at + 4,
      (scale ? (scale[1] << 22) | (scale[0] << 12) | id : 0xf9c32000 | id) >>> 0,
      true,
    )
    view.setUint32(
      at + 8,
      (((alwaysCritical ? 1 : 0) << 29) | (0x08 << 24) | (range << 14) | 0x0e00 | cost) >>> 0,
      true,
    )
    // Bits 5 and 6 among neighbours that must not leak into them.
    view.setUint32(
      at + 0x10,
      (0x00ff3b98 |
        (evadable ? 0x20 : 0) |
        (blockable ? 0x40 : 0) |
        (worksOnMetal ? 0x1000000 : 0) |
        (scalesBy === 'might' ? 0x4000 : scalesBy === 'mending' ? 0x8000 : 0)) >>>
        0,
      true,
    )
    // The message's lower neighbours likewise: the opening under it, then a neighbour.
    view.setUint32(at + 0x20, ((message << 20) | (opening << 10) | 0x2e) >>> 0, true)
    // Whom it reaches in the high nibble, a neighbour in the low.
    // The critical multiplier in bits 21 to 27 of the same word as the reach.
    view.setUint32(at + 0x14, ((criticalPercent & 0x7f) << 21) >>> 0, true)
    out[at + 0x17] = (reach << 4) | ((out[at + 0x17] as number) & 0x0f)
    // The kind between neighbours on both sides; the cap under others.
    view.setUint32(at + 0x18, (0xfffcf01f | (mode << 16) | (kind << 5)) >>> 0, true)
    view.setUint32(at + 0x1c, (0xffffc000 | damageCap) >>> 0, true)
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
    // The spread is ten bits over the index, with a neighbour above it.
    view.setUint32(4 + r * 8, (0xfffc0000 | (spread << 8) | index) >>> 0, true)
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

  it('reads whether a blow may be dodged or blocked, and a critical that needs no roll', () => {
    const [attack, herb, sure] = readActions(
      actions([
        {
          id: 1,
          name: 'Attack',
          plural: '',
          evadable: true,
          blockable: true,
          criticalPercent: 100,
        },
        { id: 236, name: 'herb', plural: '' },
        {
          id: 244,
          name: 'sure',
          plural: '',
          evadable: true,
          blockable: true,
          alwaysCritical: true,
          reach: 3,
          criticalPercent: 127,
        },
      ]),
    )
    expect(attack).toMatchObject({ evadable: true, blockable: true, alwaysCritical: false })
    expect(attack?.criticalPercent).toBe(100)
    expect(herb).toMatchObject({ evadable: false, blockable: false, alwaysCritical: false })
    expect(sure).toMatchObject({ evadable: true, blockable: true, alwaysCritical: true })
    // The multiplier and the reach share a word and do not leak into each other.
    expect(sure?.criticalPercent).toBe(127)
    expect(sure?.reach).toBe(3)
    // And the range beside the always-critical bit is untouched by it.
    expect(sure?.range).toBe(0)
  })

  it('reads an action’s kind, the most it can deal, and whether it works on metal', () => {
    const [attack, slash, heal] = readActions(
      actions([
        { id: 1, name: 'Attack', plural: '', kind: 1 },
        { id: 64, name: 'slash', plural: '', kind: 1, damageCap: 0x3fff, worksOnMetal: true },
        { id: 30, name: 'Heal', plural: '', kind: 0x7f },
      ]),
    )
    expect(attack).toMatchObject({ kind: 1, damageCap: 0, worksOnMetal: false })
    expect(slash).toMatchObject({ kind: 1, damageCap: 0x3fff, worksOnMetal: true })
    // All seven bits, and none of the neighbours'.
    expect(heal).toMatchObject({ kind: 0x7f, damageCap: 0, worksOnMetal: false })
  })

  it('reads how an amount scales: whether, by what, and between what', () => {
    const [frizz, heal, herb] = readActions(
      actions([
        { id: 9, name: 'Frizz', plural: '', mode: 2, scalesBy: 'might', scale: [50, 999] },
        { id: 30, name: 'Heal', plural: '', mode: 2, scalesBy: 'mending', scale: [50, 1023] },
        { id: 236, name: 'herb', plural: '' },
      ]),
    )
    expect(frizz).toMatchObject({
      amountScales: true,
      scalesBy: 'might',
      scaleRange: { lo: 50, hi: 999 },
    })
    expect(heal).toMatchObject({
      amountScales: true,
      scalesBy: 'mending',
      scaleRange: { lo: 50, hi: 1023 },
    })
    expect(frizz?.id).toBe(9)
    expect(herb).toMatchObject({ amountScales: false, scalesBy: undefined })
  })

  it('reads a range’s spread as ten bits', () => {
    expect(readActionRanges(ranges([[7, 0x2a5, 9, 14, 99]])).get(7)).toEqual({
      index: 7,
      spread: 0x2a5,
      base: 9,
      party: 14,
      peak: 99,
    })
  })
})
