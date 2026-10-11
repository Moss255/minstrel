import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { itemDefsOf } from '../src/load.ts'
import { back, choose, type MenuContext, menuSelect, moveCursor, panelLines } from '../src/menu.ts'
import {
  COMPLETION_WHOLES,
  completion,
  countDefeated,
  countDropped,
  type DefeatedList,
  defeatedRestored,
  defeatedSaved,
  itemRows,
  monsterRows,
} from '../src/records.ts'

const names = new Map([
  [1, 'Slime'],
  [2, 'She-slime'],
  [4, 'Dracky'],
  [776, 'a boss'],
])

describe('the Defeated Monster List', () => {
  it('counts each one beaten, held at 999, and each drop, held at 99 — numbers 1 to 308 only', () => {
    const list: DefeatedList = new Map()
    countDefeated(list, [4, 1, 1, 776])
    expect(list.get(1)?.count).toBe(2)
    expect(list.has(776)).toBe(false)
    countDefeated(list, Array(1200).fill(4))
    expect(list.get(4)?.count).toBe(999)
    for (let i = 0; i < 120; i++) countDropped(list, 1, true)
    countDropped(list, 1, false)
    expect(list.get(1)?.drops).toEqual([1, 99])
  })

  it('lists every number by number, those defeated by name, and comes back from a save', () => {
    const list: DefeatedList = new Map()
    countDefeated(list, [4, 1])
    expect(monsterRows(list, names, 'number').map((r) => r.name)).toEqual([
      'Slime',
      undefined,
      'Dracky',
    ])
    expect(monsterRows(list, names, 'name').map((r) => r.number)).toEqual([4, 1])
    expect(defeatedRestored(defeatedSaved(list))).toEqual(list)
  })
})

describe('the Battle Records’ lists', () => {
  const list: DefeatedList = new Map()
  countDefeated(list, [1, 1])
  countDropped(list, 1, false)
  const context: MenuContext = {
    hero: 'Hero',
    map: undefined,
    stage: undefined,
    quests: [{ name: 'A quest', text: 'Its text', cleared: false }],
    records: {
      title: 'Battle Records',
      summary: ['Accolades Earnt: 0'],
      listTitle: 'Accolades Earnt',
      empty: 'This list is currently empty.',
      accolades: [],
      lists: [
        { id: 'monsters', label: 'Defeated Monster List' },
        { id: 'quests', label: 'Quest List' },
        { id: 'accolades', label: 'Accolades Earnt' },
      ],
      tables: {
        monsters: {
          title: 'Defeated Monster List',
          orders: ['By Number', 'By Name'],
          unknown: '?????????',
          rows: [monsterRows(list, names, 'number'), monsterRows(list, names, 'name')],
          detail: (row) => [
            (row.drops?.[0] ?? 0) > 0 ? `Medicinal herb ×${row.drops?.[0]}` : '?????????',
            '?????????',
          ],
        },
      },
    },
  }
  const top = {
    member: 0,
    cursor: 0,
    panel: 'records' as const,
    records: { at: 'top' as const },
    row: 0,
    picking: undefined,
  }

  it('opens on the summary and its lists, and a list from them', () => {
    expect(panelLines('records', context, top).slice(-3)).toEqual([
      '▶ Defeated Monster List',
      '   Quest List',
      '   Accolades Earnt',
    ])
    const monsters = choose(top, context).state
    if (!monsters) throw new Error('no list')
    expect(panelLines('records', context, monsters)).toEqual([
      'Defeated Monster List — By Number',
      '▶ 001 Slime ×2',
      '   002 ?????????',
      '   004 ?????????',
      '',
      'Medicinal herb ×1',
      '?????????',
    ])
    // SELECT turns the order; B goes back to the menu, on the list's row.
    expect(menuSelect(monsters, context).records).toEqual({ at: 'monsters', order: 1, from: 0 })
    expect(back(monsters)).toMatchObject({ panel: 'records', records: { at: 'top' }, row: 0 })
  })

  it('opens the Quest List from the Records, and goes back to them', () => {
    const quests = choose(moveCursor(top, 1, context), context).state
    expect(quests).toMatchObject({ panel: 'quests', fromRecords: 1 })
    expect(quests && back(quests)).toMatchObject({ panel: 'records', row: 1 })
  })
})

describe('the Wardrobe and the Item List', () => {
  it('list each table’s items by list number, the unfound unnamed, and the found by name', () => {
    const defs = new Map([
      [20004, { kind: 0, listNumber: 2 }],
      [20000, { kind: 0, listNumber: 1 }],
      [22000, { kind: 8, listNumber: 945 }],
      [22001, { kind: 9, listNumber: 1090 }],
      [1000, { kind: 11, listNumber: 0 }],
    ])
    const found = (n: number) => n === 2 || n === 1090
    const name = (id: number) => ({ 20004: 'Copper sword', 22001: 'Agate of evolution' })[id] ?? '?'
    expect(itemRows(defs, 'wardrobe', found, name, 'number')).toEqual([
      { number: 1, name: undefined, item: 20000 },
      { number: 2, name: 'Copper sword', item: 20004 },
    ])
    expect(itemRows(defs, 'items', found, name, 'name').map((r) => r.item)).toEqual([22001])
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the list numbers, on a real cartridge', () => {
  it('number 1,176 items once each: the equipment 1 to 944, then the rest', () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
    const defs = itemDefsOf(rom)
    const numbered = [...defs.values()].filter((d) => d.listNumber > 0)
    const numbers = numbered.map((d) => d.listNumber).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: 1176 }, (_, i) => i + 1))
    const equipment = numbered.filter((d) => d.kind <= 7).map((d) => d.listNumber)
    expect(Math.min(...equipment)).toBe(1)
    expect(Math.max(...equipment)).toBe(944)
    expect(equipment).toHaveLength(944)
  })
})

describe('the completions', () => {
  it('are the share of a whole, truncated, and 1 where something is counted but rounds to nothing', () => {
    expect(completion(0, COMPLETION_WHOLES.monsters)).toBe(0)
    expect(completion(1, COMPLETION_WHOLES.monsters)).toBe(1)
    expect(completion(154, COMPLETION_WHOLES.monsters)).toBe(50)
    expect(completion(944, COMPLETION_WHOLES.wardrobe)).toBe(100)
    expect(completion(5, COMPLETION_WHOLES.items)).toBe(2)
  })
})
