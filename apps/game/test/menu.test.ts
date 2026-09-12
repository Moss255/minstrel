import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import { HERO_VOCATION, standing } from '../src/hero.ts'
import { back, choose, MENU_COMMANDS, moveCursor, openMenu, panelLines } from '../src/menu.ts'

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
    expect(status).toEqual({ state: { cursor: 1, panel: 'status' }, talk: false })
  })

  it('keeps its place while a panel is open, and goes back a step at a time', () => {
    const panel = choose(moveCursor(openMenu(), 2)).state
    if (!panel) throw new Error('no panel')
    expect(moveCursor(panel, 1)).toBe(panel)
    expect(choose(panel).state).toBe(panel)
    const menu = back(panel)
    expect(menu).toEqual({ cursor: 2, panel: undefined })
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
})
