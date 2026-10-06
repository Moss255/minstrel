import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { fixedShotFor, readFixedShots } from '../src/fixedshots.ts'

/** A synthetic overlay: some words, then the table — `keys`, each with its eye and look — then −1. */
function overlay(keys: readonly number[], before = 3): Uint8Array {
  const out = new Uint8Array(before * 4 + keys.length * 28 + 4 + 8)
  const view = new DataView(out.buffer)
  for (let i = 0; i < before; i++) view.setInt32(i * 4, -2 - i, true)
  for (const [r, key] of keys.entries()) {
    const at = before * 4 + r * 28
    view.setInt32(at, key, true)
    for (let k = 0; k < 6; k++) view.setInt32(at + 4 + 4 * k, (r + 1) * 0x100 + k, true)
  }
  view.setInt32(before * 4 + keys.length * 28, -1, true)
  return out
}

const keys = [
  0x101,
  0x102,
  0x114,
  0,
  ...Array.from({ length: 36 }, (_, i) => 0x116 + i),
  0x115,
  0x115,
  0x115,
]

describe('the fixed shots', () => {
  it('finds the table by its shape and reads each key, eye and look-at', () => {
    const shots = readFixedShots(overlay(keys))
    expect(shots).toHaveLength(keys.length)
    expect(shots[0]).toEqual({
      key: 0x101,
      eye: [0x100, 0x101, 0x102],
      look: [0x103, 0x104, 0x105],
    })
    expect(shots[3]?.key).toBe(0)
  })

  it('throws when no run has the shape — too short, or not ended by −1', () => {
    expect(() => readFixedShots(overlay(keys.slice(0, 10)))).toThrow(GameFormatError)
    const broken = overlay(keys)
    new DataView(broken.buffer).setInt32(12 + keys.length * 28, 7, true)
    expect(() => readFixedShots(broken)).toThrow(/runs have the table's shape/)
  })

  it('takes the first that holds: a kind in the fight, key 0 for monster 801 alone', () => {
    const shots = readFixedShots(overlay(keys))
    expect(fixedShotFor(shots, [1, 0x102], undefined, 0)?.key).toBe(0x102)
    expect(fixedShotFor(shots, [1, 2], undefined, 0)).toBeUndefined()
    expect(fixedShotFor(shots, [0], 801, 0)).toBe(shots[3])
    expect(fixedShotFor(shots, [0], 800, 0)).toBeUndefined()
    // Corvus's first form is found before key 0: the table's order decides.
    expect(fixedShotFor(shots, [0x114], 801, 0)?.key).toBe(0x114)
  })

  it('picks among the last form’s three by the round, mod 3', () => {
    const shots = readFixedShots(overlay(keys))
    const first = keys.indexOf(0x115)
    expect(fixedShotFor(shots, [0x115], undefined, 0)).toBe(shots[first])
    expect(fixedShotFor(shots, [0x115], undefined, 4)).toBe(shots[first + 1])
    expect(fixedShotFor(shots, [0x115], undefined, 5)).toBe(shots[first + 2])
  })
})
