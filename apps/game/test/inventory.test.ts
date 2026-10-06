import type { ItemDef } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import { CARRIED_MOST, obtain, takeOne, transfer } from '../src/inventory.ts'

const def = (id: number, over: Partial<ItemDef> = {}): ItemDef => ({
  id,
  kind: 8,
  usedUp: true,
  kept: false,
  toBag: false,
  book: false,
  panel: 0,
  skinShades: { man: 0, woman: 0 },
  model: { letter: '\0', man: 0, woman: 0 },
  raw: new Uint8Array(32),
  ...over,
})
const HERB = 22000
const WING = 22010

describe('who carries an item, as the game decides (`func_0207d300`)', () => {
  it('gives an everyday item to the first member with room, then the bag', () => {
    const carried = [Array(CARRIED_MOST).fill(1), [2], []]
    const got = obtain(EMPTY_BAG, { carried }, def(HERB), HERB, 2)
    // The first with room takes as many as fit before the next is asked.
    expect(got.toMembers).toEqual([0, 2, 0])
    expect(carried[1]).toEqual([2, HERB, HERB])
    expect(got.bag.items.size).toBe(0)
    const full = obtain(EMPTY_BAG, { carried: [Array(CARRIED_MOST).fill(1)] }, def(HERB), HERB)
    expect(full.bag.items.get(HERB)).toBe(1)
  })

  it('sends one marked for the bag, equipment and important items to the bag', () => {
    const carried = [[] as number[]]
    expect(
      obtain(EMPTY_BAG, { carried }, def(WING, { toBag: true }), WING).bag.items.get(WING),
    ).toBe(1)
    expect(obtain(EMPTY_BAG, { carried }, def(1, { kind: 0 }), 1).bag.items.get(1)).toBe(1)
    expect(obtain(EMPTY_BAG, { carried }, def(2, { kind: 9 }), 2).bag.items.get(2)).toBe(1)
    expect(carried[0]).toEqual([])
  })

  it('passes over the fallen for a monster’s drop', () => {
    const carried = [[] as number[], [] as number[]]
    obtain(EMPTY_BAG, { carried, fallen: (k) => k === 0 }, def(HERB), HERB, 1, true)
    expect(carried).toEqual([[], [HERB]])
  })

  it('takes one from the bag first, then whoever carries it (`func_02086d88`)', () => {
    const carried = [[HERB, 5]]
    const fromBag = takeOne(take(EMPTY_BAG, { item: HERB }), { carried }, HERB)
    expect(fromBag?.items.get(HERB)).toBeUndefined()
    expect(carried[0]).toEqual([HERB, 5])
    expect(takeOne(EMPTY_BAG, { carried }, HERB)).toBe(EMPTY_BAG)
    expect(carried[0]).toEqual([5])
    expect(takeOne(EMPTY_BAG, { carried }, HERB)).toBeUndefined()
  })

  it('moves an item to an empty row, swaps with a full one, and puts one in the bag', () => {
    const carried = [[HERB, 5], [7]]
    const bag = transfer(
      EMPTY_BAG,
      { carried },
      { owner: 0, slot: 0, item: HERB },
      { owner: 1, slot: 3 },
    )
    expect(carried).toEqual([[5], [7, HERB]])
    expect(bag).toBe(EMPTY_BAG)
    transfer(EMPTY_BAG, { carried }, { owner: 0, slot: 0, item: 5 }, { owner: 1, slot: 0 })
    expect(carried).toEqual([[7], [5, HERB]])
    const bagged = transfer(
      EMPTY_BAG,
      { carried },
      { owner: 1, slot: 1, item: HERB },
      { owner: 'bag', slot: -1 },
    )
    expect(bagged?.items.get(HERB)).toBe(1)
    expect(carried[1]).toEqual([5])
    // From the bag onto an occupied row: the old item goes into the bag.
    const swapped = transfer(
      take(EMPTY_BAG, { item: 9 }),
      { carried },
      { owner: 'bag', slot: -1, item: 9 },
      { owner: 0, slot: 0 },
    )
    expect(carried[0]).toEqual([9])
    expect(swapped?.items.get(7)).toBe(1)
    expect(swapped?.items.get(9)).toBeUndefined()
  })
})
