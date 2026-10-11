import { describe, expect, it } from 'vitest'
import { back, choose, type MenuContext, menuSelect, moveCursor, panelLines } from '../src/menu.ts'
import {
  countDefeated,
  countDropped,
  type DefeatedList,
  defeatedRestored,
  defeatedSaved,
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
      monsters: {
        title: 'Defeated Monster List',
        byNumber: 'By Number',
        byName: 'By Name',
        unknown: '?????????',
        rows: {
          number: monsterRows(list, names, 'number'),
          name: monsterRows(list, names, 'name'),
        },
        drops: () => ['Medicinal herb', 'Slime earring'],
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
    expect(menuSelect(monsters, context).records).toEqual({ at: 'monsters', by: 'name' })
    expect(back(monsters)).toMatchObject({ panel: 'records', records: { at: 'top' }, row: 0 })
  })

  it('opens the Quest List from the Records, and goes back to them', () => {
    const quests = choose(moveCursor(top, 1, context), context).state
    expect(quests).toMatchObject({ panel: 'quests', fromRecords: 1 })
    expect(quests && back(quests)).toMatchObject({ panel: 'records', row: 1 })
  })
})
