import { TRICK_NAMES_FROM } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import { SLOTS } from '../src/equipment.ts'
import { HERO_VOCATION, standing } from '../src/hero.ts'
import {
  back,
  changeCharacter,
  choose,
  ITEM_ACTIONS,
  labelOf,
  MENU_COMMANDS,
  MENU_WORDS,
  type MenuContext,
  type MenuState,
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
    const itemsView = { members: [], bag, kindOf: () => 8 }
    const context = { hero: 'Hero', map: undefined, stage: undefined, bag, itemsView }
    const onBag = {
      ...openMenu(),
      panel: 'items' as const,
      items: { at: 'list' as const, owner: 'bag' as const },
    }
    expect(panelLines('items', { ...context, itemName: () => 'herb' }, onBag)).toEqual([
      'Bag',
      '▶ herb',
    ])
    expect(panelLines('items', context, onBag)[1]).toBe('▶ item 0x55f0')
    // The first level is the purse and the two kinds of item.
    expect(panelLines('items', context)).toEqual(['20 G', '▶ Everyday Items', '   Important Items'])
  })

  it('walks the items as the game lays them out, and uses one from where it is', () => {
    const bag = take(EMPTY_BAG, { item: 0x55f4 })
    const context: MenuContext = {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      bag,
      itemsView: {
        members: [{ name: 'Hero', carried: [0x55f0, 0x55f4] }],
        bag,
        kindOf: () => 8,
      },
      itemName: (id) => (id === 0x55f0 ? 'herb' : 'antidote'),
    }
    const panel = choose(moveCursor(openMenu(), 2)).state
    if (panel?.panel !== 'items') throw new Error('no items panel')
    // Everyday Items, then whose — the Hero, then the Bag.
    expect(panel.items).toEqual({ at: 'kinds' })
    const whose = choose(panel, context).state
    expect(whose?.items).toEqual({ at: 'whose' })
    const heros = choose(whose as NonNullable<typeof whose>, context).state
    expect(heros?.items).toEqual({ at: 'list', owner: 0 })
    expect(panelLines('items', context, heros).slice(1)).toEqual(['▶ herb', '   antidote'])
    // An item chosen offers Use, Transfer, Discard and Cancel.
    const acting = choose(moveCursor(heros as NonNullable<typeof heros>, 1, context), context).state
    expect(acting?.items).toEqual({ at: 'act', held: { owner: 0, slot: 1, item: 0x55f4 } })
    const used = choose(acting as NonNullable<typeof acting>, context)
    expect(used.use).toEqual({ owner: 0, slot: 1, item: 0x55f4 })
    expect(used.state?.items).toEqual({ at: 'list', owner: 0 })
    const discarded = choose(moveCursor(acting as NonNullable<typeof acting>, 2, context), context)
    expect(discarded.discard).toEqual({ owner: 0, slot: 1, item: 0x55f4 })
    // Transfer to the Bag.
    const toWho = choose(
      moveCursor(acting as NonNullable<typeof acting>, 1, context),
      context,
    ).state
    expect(toWho?.items?.at).toBe('toWho')
    const moved = choose(moveCursor(toWho as NonNullable<typeof toWho>, 1, context), context)
    expect(moved.transfer).toEqual({
      held: { owner: 0, slot: 1, item: 0x55f4 },
      to: { owner: 'bag', slot: -1 },
    })
    expect(back(acting as NonNullable<typeof acting>)?.items).toEqual({ at: 'list', owner: 0 })
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
      // **And the trick screen's**, `str_tm` 4004, next to it in the game's
      // Misc. menu: where the B Button's four tricks are chosen.
      'Assign Party Tricks',
      // And the Quest List, `str_tm` 4007, also the Misc. menu's.
      'Quest List',
      // **And that is the whole list.** The Krak Pot and character creation
      // were here and should not have been: the pot is spoken to and
      // creation is its own scene. See `UNLISTED_PANELS` in `menu.ts`.
    ])
    expect(labelOf(ITEM_ACTIONS[0] as (typeof ITEM_ACTIONS)[number], words)).toBe('Use!')
  })

  it('assigns a party trick to one of the four places, and clears it', () => {
    // The tricks the Hero knows, by number, and the places — see `MenuContext.tricks`.
    const context = {
      hero: 'Hero',
      map: undefined,
      stage: undefined,
      tricks: { known: [2, 3], assigned: [undefined, 3, undefined, undefined] },
      words: new Map([
        [MENU_WORDS.tricks, 'Assign Party Tricks'],
        [MENU_WORDS.trickSlots, 'Up'],
        [MENU_WORDS.trickSlots + 1, 'Right'],
        [MENU_WORDS.trickClear, 'Clear'],
        [TRICK_NAMES_FROM + 2, 'Clap'],
        [TRICK_NAMES_FROM + 3, 'Air Punch'],
      ]),
    }
    const open = { ...openMenu(), panel: 'tricks' as const }
    // The four places, the game's words where given, and what each holds.
    expect(panelLines('tricks', context, open)).toEqual([
      'Assign Party Tricks',
      '▶ Up: ------',
      '   Right: Air Punch',
      '   Left: ------',
      '   Down: ------',
    ])
    // A place opens the tricks known and Clear; a trick goes into the place.
    const inSlot = choose(open, context).state as MenuState
    expect(inSlot.slot).toBe(0)
    expect(panelLines('tricks', context, inSlot)).toEqual([
      'Up:',
      '▶ Clap',
      '   Air Punch',
      '   Clear',
    ])
    const taken = choose(inSlot, context)
    expect(taken.assign).toEqual({ slot: 0, trick: 2 })
    expect(taken.state?.slot).toBeUndefined()
    // Clear is the row after the last trick; the cursor wraps over it.
    const atClear = moveCursor({ ...inSlot, row: 2 }, 0, context)
    expect(choose(atClear, context).assign).toEqual({ slot: 0, trick: undefined })
    expect(moveCursor({ ...inSlot, row: 2 }, 1, context).row).toBe(0)
    // Going back from a place returns to it in the list.
    expect(back({ ...inSlot, slot: 1 })?.row).toBe(1)
  })

  it('says the bag is empty when it holds no items', () => {
    const itemsView = { members: [], bag: EMPTY_BAG, kindOf: () => 8 }
    const onBag = {
      ...openMenu(),
      panel: 'items' as const,
      items: { at: 'list' as const, owner: 'bag' as const },
    }
    const lines = panelLines(
      'items',
      { hero: 'Hero', map: undefined, stage: undefined, bag: EMPTY_BAG, itemsView },
      onBag,
    )
    expect(lines).toEqual(['Bag', 'The bag is currently empty.'])
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

  it('changes character with L and R, round the party, keeping the slot', () => {
    const party = {
      ...context,
      party: [
        { name: 'Hero', equipped: new Map([['weapon', sword]]) },
        { name: 'Ivor', equipped: new Map() },
        { name: 'Aggie', equipped: new Map() },
      ],
    } as MenuContext
    const onShield = moveCursor(equipPanel(), 1, party)
    const next = changeCharacter(onShield, 1, party)
    expect(next.member).toBe(1)
    expect(next.row).toBe(1)
    expect(panelLines('equip', party, next)[0]).toBe('Ivor:')
    // Round from the first to the last.
    expect(changeCharacter(onShield, -1, party).member).toBe(2)
    // Not while a slot's choices are open, nor with one in the party.
    const picking = choose(onShield, party).state
    if (!picking) throw new Error('no choices')
    expect(changeCharacter(picking, 1, party)).toBe(picking)
    expect(changeCharacter(onShield, 1, context)).toBe(onShield)
    // Nor on another panel.
    expect(changeCharacter(openMenu(), 1, party).member).toBe(0)
  })
})
