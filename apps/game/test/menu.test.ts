import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import { SLOTS } from '../src/equipment.ts'
import { HERO_VOCATION, standing } from '../src/hero.ts'
import {
  back,
  choose,
  ITEM_ACTIONS,
  labelOf,
  MENU_COMMANDS,
  MENU_WORDS,
  type MenuContext,
  moveCursor,
  openMenu,
  panelLines,
} from '../src/menu.ts'

const at = (cursor: number) => ({ member: 0, cursor, panel: undefined, row: 0, picking: undefined })

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
      skillPoints: 0,
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

  it('lists the whole party on the status panel, and reads one of them at a time', () => {
    // **Only the Hero used to have numbers, so only the Hero was shown.** Now
    // every place has a vocation, experience and equipment of its own, so the
    // panel lists them and the row chooses whose block to read.
    const row = (level: number, exp: number, maxHp: number) => ({
      level,
      exp,
      strength: 9,
      resilience: 8,
      agility: 7,
      deftness: 6,
      charm: 5,
      magicalMight: 4,
      magicalMending: 3,
      maxHp,
      maxMp: 2,
      skillPoints: 0,
    })
    const hero = { levels: [row(1, 0, 20)], unknown: [] }
    const other = { levels: [row(1, 0, 33)], unknown: [] }
    const context: MenuContext = {
      hero: 'Hero',
      map: 'C01',
      stage: undefined,
      party: [
        { name: 'Hero', standing: standing(hero, 0), hp: 12 },
        { name: 'Ivor', standing: standing(other, 0), hp: undefined },
      ],
    }
    const first = panelLines('status', context, { row: 0, picking: undefined })
    expect(first[0]).toBe('▸ Hero — level 1 · HP 12/20')
    expect(first[1]).toBe('  Ivor — level 1 · HP 33/33')
    expect(first[2]).toContain('Hero —')
    expect(first[4]).toBe('HP 12/20 · MP 2/2')

    // The second row reads Ivor's, and his are not the Hero's.
    const second = panelLines('status', context, { row: 1, picking: undefined })
    expect(second[0]).toBe('  Hero — level 1 · HP 12/20')
    expect(second[1]).toBe('▸ Ivor — level 1 · HP 33/33')
    expect(second[2]).toContain('Ivor —')
    expect(second[4]).toBe('HP 33/33 · MP 2/2')

    // **A member with no vocation says so by saying nothing** — `attnpc` has
    // no vocation column, so a story companion's line names none rather than
    // borrowing the Hero's.
    const noVocation = panelLines(
      'status',
      {
        ...context,
        party: [{ name: 'Ivor', standing: { ...standing(other, 0), vocation: undefined } }],
      },
      { row: 0, picking: undefined },
    )
    expect(noVocation[0]).toBe('Ivor — level 1')

    // A party of one is listed no differently from how it always was.
    const alone = panelLines('status', { ...context, party: [context.party?.[0] as never] })
    expect(alone[0]).toContain('Hero —')
  })

  it('shows the equipment and spells of whoever the attributes panel chose', () => {
    // **The bag is the party's; the equipment is not.** Until this, the equip
    // and spells panels were the Hero's whatever was selected, so three
    // quarters of a party of four could not be dressed or read.
    const context: MenuContext = {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      itemName: (id) => (id === 20004 ? 'copper sword' : 'pot lid'),
      party: [
        {
          name: 'Hero',
          equipped: new Map([['weapon', 20004]]),
          spells: [{ action: 1, name: 'Heal', cost: 2, field: true }],
        },
        {
          name: 'Ivor',
          equipped: new Map([['shield', 21296]]),
          spells: [{ action: 2, name: 'Frizz', cost: 3, field: false }],
        },
      ],
    }
    const equipFor = (member: number) =>
      panelLines('equip', context, { member, row: -1, picking: undefined }).join(' | ')
    expect(equipFor(0)).toContain('copper sword')
    expect(equipFor(0)).not.toContain('pot lid')
    expect(equipFor(1)).toContain('pot lid')
    expect(equipFor(1)).not.toContain('copper sword')
    // With more than one in the party the panel says whose it is.
    expect(equipFor(1)).toContain('Ivor:')

    const spellsFor = (member: number) =>
      panelLines('spells', context, { member, row: -1, picking: undefined }).join(' | ')
    expect(spellsFor(0)).toContain('Heal')
    expect(spellsFor(1)).toContain('Frizz')
    // Frizz is not a field spell, so Ivor has nothing to cast out here.
    expect(spellsFor(1)).toContain('No spells to cast here')
  })

  it('carries the chosen member from the attributes panel to the others', () => {
    const party = [{ name: 'Hero' }, { name: 'Ivor' }, { name: 'Erinn' }]
    const context: MenuContext = { hero: 'Hero', map: undefined, stage: undefined, party }
    const panel = { ...openMenu(), panel: 'status' as const, row: 0 }
    // Moving down the attributes panel is choosing who the menu is about.
    expect(moveCursor(panel, 1, context).member).toBe(1)
    expect(moveCursor(panel, -1, context).member).toBe(2)
  })

  it('moves between the party on the status panel, and not when there is one', () => {
    const party = [{ name: 'Hero' }, { name: 'Ivor' }, { name: 'Erinn' }]
    const context: MenuContext = { hero: 'Hero', map: undefined, stage: undefined, party }
    const panel = { ...openMenu(), panel: 'status' as const, row: 0 }
    expect(moveCursor(panel, 1, context).row).toBe(1)
    expect(moveCursor(panel, -1, context).row).toBe(2)
    const one = { ...context, party: [{ name: 'Hero' }] }
    expect(moveCursor(panel, 1, one)).toBe(panel)
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
    // An item chosen offers what can be done with it.
    const acting = choose(next, context).state
    if (!acting?.acting) throw new Error('no uses offered')
    expect(acting.acting).toEqual({ item: 0x55f4, row: 1 })
    expect(panelLines('items', context, acting).slice(-4)).toEqual([
      'What would you like to do?',
      '▶ Use',
      '   Discard',
      '   Cancel',
    ])
    const used = choose(acting, context)
    expect(used.use).toBe(0x55f4)
    expect(used.state).toMatchObject({ panel: 'items', row: 1, acting: undefined })
    expect(choose(moveCursor(acting, 1, context), context).discard).toBe(0x55f4)
    const cancelled = choose(moveCursor(acting, -1, context), context)
    expect(cancelled).toMatchObject({ state: { acting: undefined, row: 1 } })
    expect(cancelled.use ?? cancelled.discard).toBeUndefined()
    expect(back(acting)).toMatchObject({ panel: 'items', acting: undefined, row: 1 })
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
      skillPoints: 0,
    }
    const lines = panelLines('status', {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      standing: standing({ levels: [row], unknown: [] }, 0),
      hp: 12,
    })
    expect(lines[2]).toBe('HP 12/20 · MP 2/2')
    const spent = panelLines('status', {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      standing: standing({ levels: [row], unknown: [] }, 0),
      mp: 1,
      words: new Map([[MENU_WORDS.mp, 'MP']]),
    })
    expect(spent[2]).toBe('HP 20/20 · MP 1/2')
  })

  it('names its commands and an item’s uses in the game’s words, where it has them', () => {
    const words = new Map([
      [MENU_WORDS.attributes, 'Attributes!'],
      [MENU_WORDS.use, 'Use!'],
    ])
    expect(MENU_COMMANDS.map((c) => labelOf(c, words))).toEqual([
      'Talk',
      'Attributes!',
      'Items',
      'Equipment',
      'Spells & Abilities',
      // **The game's own name for the skill screen**, `str_tm` 4003 —
      // "Allocate Skill Points", which is what the field menu calls it.
      'Allocate Skill Points',
      // The Krak Pot's is ours: `str_ren` is what the pot says once it is
      // open, and no `str_tm` entry names it in the menu.
      'Alchemy',
      // And the appearance screen's is ours twice over — the game makes
      // characters at the Observatory and the Quester's Rest, not from a
      // menu at all. See `appearance.ts`.
      'Appearance',
    ])
    expect(labelOf(ITEM_ACTIONS[0] as (typeof ITEM_ACTIONS)[number], words)).toBe('Use!')
  })

  it('says the bag is empty when it holds no items', () => {
    const lines = panelLines('items', {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      bag: EMPTY_BAG,
    })
    expect(lines).toEqual(['0 gold coins', 'The bag is currently empty.'])
  })
})

describe('the spells panel', () => {
  const spells = [
    { action: 30, name: 'Heal', cost: 2, field: true },
    { action: 12, name: 'Crack', cost: 3, field: false },
    { action: 31, name: 'Midheal', cost: 4, field: true },
  ]
  const context: MenuContext = { hero: 'Hero', map: undefined, stage: undefined, spells }
  const spellsPanel = () => {
    const opened = choose(moveCursor(openMenu(), 4)).state
    if (opened?.panel !== 'spells') throw new Error('no spells panel')
    return opened
  }

  it('lists what can be cast here as rows, and what cannot after them', () => {
    expect(panelLines('spells', context, spellsPanel())).toEqual([
      '▶ Heal — 2 MP',
      '   Midheal — 4 MP',
      '   Crack — 3 MP, in battle',
    ])
  })

  it('casts the chosen spell, choosing only among those that can be cast here', () => {
    const panel = spellsPanel()
    expect(choose(panel, context).cast).toBe(30)
    expect(choose(moveCursor(panel, 1, context), context).cast).toBe(31)
    expect(moveCursor(panel, 2, context).row).toBe(0)
  })

  it('says when there is nothing to cast, and when the table did not read', () => {
    const none = { ...context, spells: [], noSpells: 'Hero doesn’t know any non-battle spells!' }
    expect(panelLines('spells', none)).toEqual(['Hero doesn’t know any non-battle spells!'])
    expect(choose(spellsPanel(), none).cast).toBeUndefined()
    expect(panelLines('spells', { ...context, spells: undefined })[0]).toContain('did not load')
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
