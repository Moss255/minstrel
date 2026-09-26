import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readMedalRewards } from '../src/medals.ts'

/** Pairs as the overlay lays them out: `(u16 medals, u16 item)`, little-endian. */
const pairs = (list: readonly (readonly [number, number])[]) =>
  list.flatMap(([medals, item]) => [medals & 0xff, medals >> 8, item & 0xff, item >> 8])

// Shaped like the reference cartridge's, with made-up items.
const exchanges = [3, 5, 8, 10, 15, 20].map((m, i) => [m, 20000 + i] as const)
const milestones = [4, 8, 13, 18, 25, 32, 40, 50, 62, 80].map((m, i) => [m, 12000 + i] as const)

describe('the mini medal tables', () => {
  it('finds the six exchanges and ten milestones among other bytes', () => {
    const overlay = Uint8Array.from([
      ...new Array(30).fill(0xee),
      ...pairs(exchanges),
      ...pairs(milestones),
      0,
      0,
    ])
    const read = readMedalRewards(overlay)
    expect(read.exchanges).toHaveLength(6)
    expect(read.exchanges[0]).toEqual({ medals: 3, item: 20000 })
    expect(read.milestones.map((m) => m.medals)).toEqual([4, 8, 13, 18, 25, 32, 40, 50, 62, 80])
    expect(read.milestones[9]).toEqual({ medals: 80, item: 12009 })
  })

  it('refuses bytes without them, rather than reading anything', () => {
    const falling = [...milestones].reverse()
    expect(() =>
      readMedalRewards(Uint8Array.from([...pairs(exchanges), ...pairs(falling)])),
    ).toThrow(GameFormatError)
    expect(() => readMedalRewards(new Uint8Array(64))).toThrow(GameFormatError)
  })
})
