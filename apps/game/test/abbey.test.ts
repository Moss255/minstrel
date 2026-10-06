import { readFileSync } from 'node:fs'
import { outcomeOf } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  abbeyOpen,
  abbeyText,
  FLAG_OPEN,
  FLAG_REVOCATION,
  medalSaid,
  vocationSaid,
} from '../src/abbey.ts'
import { VOCATION_FLAG } from '../src/companion.ts'
import { allTriggers } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

const fill = { target: 'Ava', sex: 'f' as const, solo: false }

describe('Jack of Alltrades’ lines, filled as the Abbey fills them', () => {
  it('chooses by the party’s size, the target’s sex and the vocation’s first letter', () => {
    // The tags' shapes as `str_dam` 2, 11 and 12 have them.
    expect(
      abbeyText('Do you<IF_SOLO><ELSE_NOT_SOLO> or one of your number<ENDIF_SOLO> wish?', fill),
    ).toBe('Do you or one of your number wish?')
    expect(
      abbeyText('Do you<IF_SOLO><ELSE_NOT_SOLO> or one of your number<ENDIF_SOLO> wish?', {
        ...fill,
        solo: true,
      }),
    ).toBe('Do you wish?')
    expect(
      abbeyText(
        'would <IF_TARGET_M>he<IF_TARGET_F>she<IF_TARGET_N>it<ENDIF_TARGET_MFN> like',
        fill,
      ),
    ).toBe('would she like')
    const becoming =
      'becoming <IF_VOWEL_VOCATION>an<ELSE_CONSONANT_VOCATION>a<ENDIF_VOWEL_VOCATION> <str_2>'
    expect(
      abbeyText(becoming, { ...fill, chosen: 'armamentalist', articleOf: 'armamentalist' }),
    ).toBe('becoming an armamentalist')
    expect(abbeyText(becoming, { ...fill, chosen: 'priest', articleOf: 'priest' })).toBe(
      'becoming a priest',
    )
  })

  it('names the member, the vocations and the medal, and breaks the line where it says to', () => {
    expect(
      abbeyText('<Cap><TARGET> would like the path of the <str_2>.\\nIs this correct?', {
        ...fill,
        chosen: 'mage',
      }),
    ).toBe('<Cap>Ava would like the path of the mage.\nIs this correct?')
    expect(abbeyText('a novice <str_3> once more', { ...fill, current: 'thief' })).toBe(
      'a novice thief once more',
    )
    expect(abbeyText('receives <str_4>.', { ...fill, medal: 'a Noscar' })).toBe(
      'receives a Noscar.',
    )
  })

  it('numbers a vocation’s name and its medal as `str_dam` does', () => {
    expect(vocationSaid(1)).toBe(36)
    expect(vocationSaid(12)).toBe(47)
    expect(medalSaid(11)).toBe(63)
  })
})

describe('whether the Abbey is open to a change', () => {
  it('is by the game’s own flag, and by nothing else', () => {
    expect(abbeyOpen((bit) => bit === FLAG_OPEN)).toBe(true)
    expect(abbeyOpen(() => false)).toBe(false)
  })
})

describe.skipIf(!romPath)('what sets the Abbey’s three flags, on the cartridge', () => {
  it('is three actions of the records: 223 at 6.5, 231 with the credits, 160 by a quest cleared', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const setters = new Map<number, Set<number>>()
    for (const { triggers } of allTriggers(rom))
      for (const trigger of triggers)
        for (const flag of outcomeOf(trigger).globals) {
          const maps = setters.get(flag) ?? new Set<number>()
          maps.add(trigger.map)
          setters.set(flag, maps)
        }
    // `ev26510`'s outcome in the Tower of Trades, map 9008.
    expect([...(setters.get(FLAG_OPEN) ?? [])]).toEqual([9008])
    // The credits' record in the Realm of the Mighty, map 4403.
    expect([...(setters.get(FLAG_REVOCATION) ?? [])]).toEqual([4403])
    // The six advanced vocations, each where its quest is handed in.
    const where = [7, 8, 9, 10, 11, 12].map((v) => [...(setters.get(VOCATION_FLAG + v) ?? [])])
    expect(where).toEqual([[4202], [4201], [201], [405], [219], [7700]])
  })
})
