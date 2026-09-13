import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import { SLOTS } from '../src/equipment.ts'
import { HERO_VOCATION, standing } from '../src/hero.ts'
import {
  back,
  choose,
  MENU_COMMANDS,
  type MenuContext,
  moveCursor,
  openMenu,
  panelLines,
} from '../src/menu.ts'

const at = (cursor: number) => ({ cursor, panel: undefined, row: 0, picking: undefined })

describe('the main menu', () => {
  it('opens on the first command and chooses round and round', () => {
    const menu = openMenu()
    expect(MENU_COMMANDS[menu.cursor]?.id).toBe('talk')
    expect(moveCursor(menu, -1).cursor).toBe(MENU_COMMANDS.length - 1)
    expect(moveCursor(menu, MENU_COMMANDS.length + 1).cursor).toBe(1)
  })

  it('closes to talk, and opens a panel for anything else', () => {
    expect(choose(openMenu())).toEqual({ state: undefined, talk: true })
    const status = choose(moveCursor(openMenu(), 1))
    expect(status).toEqual({ state: { ...at(1), panel: 'status' }, talk: false })
  })

  it('keeps its place while a panel is open, and goes back a step at a time', () => {
    const panel = choose(moveCursor(openMenu(), 2)).state
    if (!panel) throw new Error('no panel')
    expect(moveCursor(panel, 1)).toBe(panel)
    expect(choose(panel).state).toBe(panel)
    const menu = back(panel)
    expect(menu).toEqual(at(2))
    expect(menu && back(menu)).toBeUndefined()
  })

  it('says who and where on the status panel, and that the numbers did not load', () => {
    const lines = panelLines('status', { hero: 'Hero', map: 'M01M07', stage: '2.1' })
    expect(lines[0]).toBe('Hero')
    expect(lines[1]).toContain('M01M07')
    expect(lines.join(' ')).toContain('not read')
    expect(panelLines('talk', { hero: 'Hero', map: undefined, stage: undefined })).toEqual([])
  })

  it("shows the Hero's level and numbers, and the next level's threshold", () => {
    const row = (level: number, exp: number) => ({
      level,
      exp,
      strength: 9,
      resilience: 8,
      agility: 7,
      deftness: 6,
      charm: 5,
      magicalMight: 4,
      magicalMending: 3,
      maxHp: 20,
      maxMp: 2,
      unknown_10: 0,
    })
    const table = { levels: [row(1, 0), row(2, 17)], unknown: [] }
    const lines = panelLines('status', {
      hero: 'Hero',
      map: 'M01M07',
      stage: undefined,
      standing: standing(table, 0),
    })
    expect(lines[0]).toBe(`Hero — ${HERO_VOCATION}, level 1`)
    expect(lines[1]).toBe('Exp. 0, level 2 at 17')
    expect(lines[2]).toBe('HP 20/20 · MP 2/2')
    expect(lines[3]).toBe('Strength 9 · Resilience 8 · Agility 7 · Deftness 6 · Charm 5')
    expect(standing(table, 99).next).toBeUndefined()
  })

  it('lists the bag on the items panel, naming each item', () => {
    const bag = take(take(EMPTY_BAG, { gold: 20 }), { item: 0x55f0 })
    const context = { hero: 'Hero', map: undefined, stage: undefined, bag }
    expect(panelLines('items', { ...context, itemName: () => 'herb' })).toEqual([
      '20 gold coins',
      'herb',
    ])
    expect(panelLines('items', context)[1]).toBe('item 0x55f0')
  })

  it('chooses an item on the items panel to use, and says what came of it', () => {
    const bag = take(take(EMPTY_BAG, { item: 0x55f0 }), { item: 0x55f4 })
    const context: MenuContext = {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      bag,
      itemName: (id) => (id === 0x55f0 ? 'herb' : 'antidote'),
    }
    const panel = choose(moveCursor(openMenu(), 2)).state
    if (panel?.panel !== 'items') throw new Error('no items panel')
    const next = moveCursor(panel, 1, context)
    expect(next.row).toBe(1)
    expect(choose(next, context).use).toBe(0x55f4)
    expect(panelLines('items', context, { ...next, said: ['Hero uses an antidote.'] })).toEqual([
      '0 gold coins',
      '   herb',
      '▶ antidote',
      'Hero uses an antidote.',
    ])
  })

  it('shows the Hero’s wounds on the status panel', () => {
    const row = {
      level: 1,
      exp: 0,
      strength: 9,
      resilience: 8,
      agility: 7,
      deftness: 6,
      charm: 5,
      magicalMight: 4,
      magicalMending: 3,
      maxHp: 20,
      maxMp: 2,
      unknown_10: 0,
    }
    const lines = panelLines('status', {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      standing: standing({ levels: [row], unknown: [] }, 0),
      hp: 12,
    })
    expect(lines[2]).toBe('HP 12/20 · MP 2/2')
  })
})

describe('the equip panel', () => {
  const sword = 20004
  const shield = 21291
  const context: MenuContext = {
    hero: 'Hero',
    map: undefined,
    stage: undefined,
    bag: take(take(EMPTY_BAG, { item: sword }), { item: shield }),
    equipped: new Map(),
    itemName: (id) => (id === sword ? 'sword' : 'shield'),
    tableOf: (id) => (id === sword ? 'w' : 's'),
  }
  const equipPanel = () => {
    const opened = choose(moveCursor(openMenu(), 3)).state
    if (opened?.panel !== 'equip') throw new Error('no equip panel')
    return opened
  }

  it('lists the slots, then what the bag holds for the one chosen', () => {
    const panel = equipPanel()
    expect(panelLines('equip', context, panel)[0]).toBe('▶ Weapon: —')
    expect(moveCursor(panel, -1, context).row).toBe(SLOTS.length - 1)
    const picking = choose(panel, context).state
    expect(picking?.picking).toBe('weapon')
    expect(panelLines('equip', context, picking)).toEqual(['Weapon:', '▶ (nothing)', '   sword'])
    // Nothing and the sword: two rows to go round.
    expect(picking && moveCursor(picking, 2, context).row).toBe(0)
  })

  it('asks to put on the chosen item, and goes back to the slot it came from', () => {
    const picking = choose(equipPanel(), context).state
    if (!picking) throw new Error('no choices')
    const taken = choose(moveCursor(picking, 1, context), context)
    expect(taken.equip).toEqual({ slot: 'weapon', item: sword })
    expect(taken.state).toMatchObject({ panel: 'equip', picking: undefined, row: 0 })
    expect(choose(picking, context).equip).toEqual({ slot: 'weapon', item: undefined })
    expect(back(picking)).toMatchObject({ panel: 'equip', picking: undefined })
  })
})
