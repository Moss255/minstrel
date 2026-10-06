import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  FAMILY_BONUS_FIELDS,
  ITEM_EXPERIENCE_BONUS,
  RESISTANCE_ELEMENTS,
  readItemBattleParams,
  weaponElement,
  wornResistances,
} from '../src/itembattle.ts'

/** Built in code, from FORMAT.md: a count word, then 44-byte records. */
function build(
  items: { id: number; resistances?: readonly number[]; flags?: number }[],
): Uint8Array {
  const out = new Uint8Array(4 + items.length * 0x2c)
  const view = new DataView(out.buffer)
  view.setUint32(0, items.length, true)
  for (const [r, item] of items.entries()) {
    const at = 4 + r * 0x2c
    for (const [i, value] of (item.resistances ?? []).entries()) view.setInt8(at + 0x14 + i, value)
    view.setInt16(at + 0x28, item.id, true)
    view.setUint32(at, item.flags ?? 0, true)
    // A neighbour either side, which must not leak into the twenty.
    out[at + 0x13] = 0x7f
  }
  return out
}

describe('what a worn thing does in a battle', () => {
  it('reads each record: its item, and the twenty numbers it adds to a resistance', () => {
    const [first, second] = readItemBattleParams(
      build([{ id: 12170, resistances: [0, 0, 0, -30, 0, 0, 0, -30] }, { id: 20004 }]),
    )
    expect(first?.id).toBe(12170)
    expect(first?.resistances).toHaveLength(20)
    expect(first?.resistances[3]).toBe(-30)
    expect(first?.resistances[7]).toBe(-30)
    expect(second?.id).toBe(20004)
    expect(second?.resistances.every((value) => value === 0)).toBe(true)
    expect(first?.raw).toHaveLength(0x2c)
  })

  it('reads each record’s flags, the experience bonus among them', () => {
    const [shoes, sandals] = readItemBattleParams(
      build([{ id: 17189, flags: ITEM_EXPERIENCE_BONUS | 1 }, { id: 17406 }]),
    )
    expect((shoes?.flags ?? 0) & ITEM_EXPERIENCE_BONUS).toBe(ITEM_EXPERIENCE_BONUS)
    expect(sandals?.flags).toBe(0)
  })

  it('reads a weapon’s killer bonus for each of the twelve families, six signed bits in tenths', () => {
    const bytes = build([{ id: 20111 }])
    const view = new DataView(bytes.buffer)
    // Every field 10 — no bonus — then family 3 at 12 and family 9 at −5.
    const set = (family: number, value: number) => {
      const [word, low] = FAMILY_BONUS_FIELDS[family - 1] as readonly [number, number]
      const at = 4 + word
      const old = view.getUint32(at, true)
      view.setUint32(at, (old & ~(0x3f << low)) | ((value & 0x3f) << low), true)
    }
    for (let family = 1; family <= 12; family++) set(family, 10)
    set(3, 12)
    set(9, -5)
    const [sword] = readItemBattleParams(bytes)
    expect(sword?.familyTenths).toEqual([10, 10, 12, 10, 10, 10, 10, 10, -5, 10, 10, 10])
    // The twelve fields are apart, and none reaches the resistances at +0x14.
    const bits = new Set(
      FAMILY_BONUS_FIELDS.flatMap(([word, low]) =>
        Array.from({ length: 6 }, (_, i) => word * 8 + low + i),
      ),
    )
    expect(bits.size).toBe(72)
    expect(Math.max(...bits)).toBeLessThan(0x14 * 8)
    expect(sword?.resistances.every((value) => value === 0)).toBe(true)
  })

  it('reads a weapon’s element from flags bits 23–25, nothing standing for the plain Attack’s', () => {
    expect(weaponElement(0)).toBe(8)
    expect(weaponElement(1 << 23)).toBe(1)
    expect(weaponElement((5 << 23) | ITEM_EXPERIENCE_BONUS | 1)).toBe(5)
    expect(weaponElement(7 << 23)).toBe(7)
    expect(weaponElement(1 << 26)).toBe(8)
  })

  it('takes the count from the head’s low twelve bits, as the game masks it', () => {
    const bytes = build([{ id: 1 }])
    new DataView(bytes.buffer).setUint32(0, 0x7000 | 1, true)
    expect(readItemBattleParams(bytes)).toHaveLength(1)
  })

  it('refuses a head cut short, and records that run past the end', () => {
    expect(() => readItemBattleParams(new Uint8Array(2))).toThrow(GameFormatError)
    expect(() => readItemBattleParams(build([{ id: 1 }]).subarray(0, 30))).toThrow(GameFormatError)
    expect(readItemBattleParams(build([]))).toEqual([])
  })

  it('sums what is worn onto a hundred, and never below nothing', () => {
    const fire = [25, ...Array(19).fill(0)]
    const colder = [-50, ...Array(19).fill(0)]
    expect(wornResistances([])[0]).toBe(100)
    expect(wornResistances([fire])[0]).toBe(125)
    expect(wornResistances([fire, colder])[0]).toBe(75)
    expect(wornResistances([colder, colder, colder])[0]).toBe(0)
  })

  it('leaves the plain attack’s element and the last alone, as the game’s loop does', () => {
    const every = Array(20).fill(-100)
    const resisted = wornResistances([every])
    // Elements 8 and 22 are not among the twenty, so they stay whole.
    expect(resisted[7]).toBe(100)
    expect(resisted[21]).toBe(100)
    expect(RESISTANCE_ELEMENTS).not.toContain(8)
    expect(resisted.filter((value) => value === 0)).toHaveLength(20)
  })
})
