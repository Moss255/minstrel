import { describe, expect, it } from 'vitest'
import {
  BANK_SAYS,
  bankLimit,
  digitsValue,
  menuLabels,
  newDigits,
  pressDigits,
} from '../src/counter.ts'

describe('Erinn’s counter', () => {
  it('reads its menu out of the line that lists it', () => {
    expect(
      menuLabels(
        '<N=0>Stay at the inn</N>\n<N=1>Canvass for guests</N>\n<N=2>View the guestbook</N>\n<N=3>Leave</N>',
      ),
    ).toEqual(['Stay at the inn', 'Canvass for guests', 'View the guestbook', 'Leave'])
  })
})

describe('the bank', () => {
  it('allows a deposit of the purse’s whole thousands, and refuses a purse under one', () => {
    expect(bankLimit('deposit', 4_500, 0)).toEqual({ most: 4 })
    expect(bankLimit('deposit', 999, 0)).toEqual({ refused: BANK_SAYS.tooPoorToDeposit })
    expect(bankLimit('deposit', 5_000, 999_999_000)).toEqual({ refused: BANK_SAYS.vaultFull })
  })

  it('allows a withdrawal of the banked thousands, as far as the purse will hold', () => {
    expect(bankLimit('withdrawal', 0, 0)).toEqual({ refused: BANK_SAYS.nothingToWithdraw })
    expect(bankLimit('withdrawal', 2_000, 7_500)).toEqual({ most: 7 })
    expect(bankLimit('withdrawal', 9_995_000, 50_000)).toEqual({ most: 4 })
    expect(bankLimit('withdrawal', 9_999_000, 50_000)).toEqual({ refused: BANK_SAYS.purseFull })
  })

  it('sets thousands four digits at a time, held to the most', () => {
    let d = newDigits(1234)
    expect(d.column).toBe(3)
    d = pressDigits(d, 'up')
    expect(digitsValue(d)).toBe(1)
    d = pressDigits(d, 'down')
    d = pressDigits(d, 'down')
    expect(digitsValue(d)).toBe(9)
    // Left past the first column: the most. Right past the last: nothing.
    for (let i = 0; i < 4; i++) d = pressDigits(d, 'left')
    expect(digitsValue(d)).toBe(1234)
    for (let i = 0; i < 4; i++) d = pressDigits(d, 'right')
    expect(digitsValue(d)).toBe(0)
    // Over the most is held to it.
    d = pressDigits(pressDigits(pressDigits(pressDigits(d, 'left'), 'left'), 'left'), 'up')
    d = pressDigits(d, 'up')
    expect(digitsValue(d)).toBe(1234)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM
describe.skipIf(!romPath)('the Quester’s Rest’s counters, on the cartridge', () => {
  it('keeps the keepers over its counters, talked to from their boxes', async () => {
    const { readFileSync } = await import('node:fs')
    const { load } = await import('../src/load.ts')
    const rom = new Uint8Array(readFileSync(romPath as string))
    const cast = load(rom, { map: 'R01M01' }).castAt({ major: 13, minor: 1 }, 1, false, new Set())
    const boxes = new Map(
      cast.standIns.map(({ placement }) => [placement.id, placement.boxes?.map((b) => b.label)]),
    )
    // Erinn's counter and Ginny's bank, each a box of label 80.
    expect(boxes.get(208)).toEqual([80])
    expect(boxes.get(212)).toEqual([80])
  }, 60_000)
})
