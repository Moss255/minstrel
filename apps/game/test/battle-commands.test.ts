import { type Fighter, startBattle } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import {
  type Arms,
  type Asked,
  armsKinds,
  armsOfKind,
  backCommand,
  chooseCommand,
  commandsOf,
  type Entry,
  examinePages,
  FOLLOW_ORDERS,
  inBackLine,
  MISC_ROWS,
  monsterGroups,
  moveCommand,
  openCommands,
  PARTY_ROWS,
} from '../src/battle-commands.ts'

const fighter = (name: string, side: 'party' | 'foes'): Fighter => ({
  name,
  side,
  maxHp: 30,
  maxMp: 10,
  attack: 10,
  defence: 5,
  agility: 5,
  shield: false,
  exp: 1,
  gold: 1,
})
const state = startBattle(
  [
    fighter('Hero', 'party'),
    fighter('Mage', 'party'),
    fighter('slime', 'foes'),
    fighter('slime', 'foes'),
    fighter('dracky', 'foes'),
  ],
  true,
)
const heal: Entry = {
  action: 30,
  name: 'Heal',
  cost: 2,
  side: 2,
  reach: 2,
  command: (target) => ({ kind: 'item', item: 0, target }),
}
const frizz: Entry = {
  action: 9,
  name: 'Frizz',
  cost: 2,
  side: 1,
  reach: 2,
  command: (target) => ({ kind: 'attack', target }),
}
const member = (fighter: number, over: Partial<Asked> = {}): Asked => ({
  fighter,
  name: fighter === 0 ? 'Hero' : 'Mage',
  tactic: FOLLOW_ORDERS,
  own: fighter === 0,
  guest: false,
  spells: [],
  abilities: [],
  items: [],
  ...over,
})
const two = [member(0), member(1, { spells: [frizz, heal] })]
const fight = (c = openCommands(two)) => chooseCommand(state, c)

describe('the command phase, as overlay 0 runs it', () => {
  it('opens on the party menu and asks each member in turn after Fight', () => {
    const open = openCommands(two)
    expect(open.step).toEqual({ at: 'party', cursor: 0 })
    expect(PARTY_ROWS).toEqual(['fight', 'examine', 'flee', 'misc'])
    const first = fight()
    expect(first.step).toEqual({ at: 'member', member: 0, cursor: 0 })
    // Defend is done at once, and the next member is asked.
    const defended = chooseCommand(state, moveCommand(state, first, 0, 2))
    expect(defended.step).toEqual({ at: 'member', member: 1, cursor: 0 })
    expect(commandsOf(defended).get(0)).toEqual({ kind: 'defend' })
  })

  it('walks the two-column grid row by row: Attack, Abilities / Spells, Items / Defend, Coup', () => {
    const c = fight()
    expect(moveCommand(state, c, 1, 0).step).toMatchObject({ cursor: 3 })
    expect(moveCommand(state, c, 0, 1).step).toMatchObject({ cursor: 1 })
    expect(moveCommand(state, c, 1, 2).step).toMatchObject({ cursor: 5 })
    expect(moveCommand(state, c, 0, -1).step).toMatchObject({ cursor: 2 })
  })

  it('chooses a monster one by one, group by group, and an ally for a heal', () => {
    const attack = chooseCommand(state, fight())
    expect(attack.step).toMatchObject({ at: 'monster', cursor: 0 })
    expect(monsterGroups(state)).toEqual([
      { first: 2, count: 2 },
      { first: 4, count: 1 },
    ])
    const onDracky = chooseCommand(state, moveCommand(state, attack, 2, 0))
    expect(commandsOf(onDracky).get(0)).toEqual({ kind: 'attack', target: 4 })
    // The Mage's Spells, then Heal, then whom.
    const spells = chooseCommand(state, moveCommand(state, onDracky, 0, 1))
    expect(spells.step).toMatchObject({ at: 'list', list: 'spells' })
    const ally = chooseCommand(state, moveCommand(state, spells, 0, 1))
    expect(ally.step).toMatchObject({ at: 'ally' })
    const healed = chooseCommand(state, ally)
    expect(healed.step).toEqual({ at: 'done' })
    expect(commandsOf(healed).get(1)).toEqual({ kind: 'item', item: 0, target: 0 })
  })

  it('says a member knows no spells, and goes back to the one before with B, their choice dropped', () => {
    const c = fight()
    const none = chooseCommand(state, moveCommand(state, c, 0, 1))
    expect(none.step).toMatchObject({ at: 'say', say: { number: 30023, str2: 30021 } })
    expect(chooseCommand(state, none).step).toMatchObject({ at: 'member', member: 0 })
    const second = chooseCommand(state, moveCommand(state, c, 0, 2))
    const back = backCommand(state, second)
    expect(back.step).toEqual({ at: 'member', member: 0, cursor: 0 })
    expect(back.chosen.size).toBe(0)
    expect(backCommand(state, back).step).toEqual({ at: 'party', cursor: 0 })
  })

  it('flees as a party, and leaves one not following orders unasked', () => {
    const fled = chooseCommand(state, moveCommand(state, openCommands(two), 0, 2))
    expect(fled.step).toEqual({ at: 'done' })
    expect([...commandsOf(fled).values()]).toEqual([{ kind: 'flee' }, { kind: 'flee' }])
    const mercy = openCommands([member(0), member(1, { tactic: 0 })])
    const one = chooseCommand(state, moveCommand(state, chooseCommand(state, mercy), 0, 2))
    expect(one.step).toEqual({ at: 'done' })
    expect(commandsOf(one).has(1)).toBe(false)
  })

  it('sets a tactic from Misc., for anyone but the player’s own, and opens the party menu again', () => {
    const misc = chooseCommand(state, moveCommand(state, openCommands(two), 0, 3))
    const tactics = chooseCommand(state, misc)
    expect(tactics.step).toEqual({ at: 'tactics', cursor: 0 })
    const grid = chooseCommand(state, tactics)
    expect(grid.step).toEqual({ at: 'tactic', who: 1, cursor: FOLLOW_ORDERS })
    const set = chooseCommand(state, moveCommand(state, grid, -1, -2))
    expect(set.tactics.get(1)).toBe(0)
    expect(set.step).toEqual({ at: 'party', cursor: 0 })
  })
})

describe('Examine and Line-Up', () => {
  const party = () => openCommands([member(0), member(1)])
  const to = (c: ReturnType<typeof party>, row: number) => ({
    ...c,
    step: { at: 'party' as const, cursor: row },
  })

  it('says a page for each monster in a state worth telling, and comes back free', () => {
    const tense = {
      ...state,
      fighters: state.fighters.map((f, i) =>
        i === 2
          ? { ...f, states: { ...f.states, tension: 2 } }
          : i === 4
            ? { ...f, states: { ...f.states, sleep: 1 } }
            : f,
      ),
    }
    // Line 58 "considerably raised", the sleeping dracky's 7; the slime in between says nothing.
    expect(examinePages(tense, () => 0)).toEqual([
      { line: 58, monster: 2 },
      { line: 7, monster: 4 },
    ])
    let c = chooseCommand(tense, to(party(), PARTY_ROWS.indexOf('examine')))
    expect(c.step.at).toBe('examine')
    c = chooseCommand(tense, chooseCommand(tense, c))
    expect(c.step).toEqual({ at: 'party', cursor: PARTY_ROWS.indexOf('examine') })
    expect(c.chosen.size).toBe(0)
  })

  it('says one general line of the highest-level monster when none is in a state', () => {
    const levelled = {
      ...state,
      fighters: state.fighters.map((f, i) => (i === 4 ? { ...f, level: 9 } : f)),
    }
    // Several monsters: 2 "sizing up", 3 "preparing to attack", by the world's coin.
    expect(examinePages(levelled, () => 40)).toEqual([{ line: 2, monster: 4 }])
    expect(examinePages(levelled, () => 41)).toEqual([{ line: 3, monster: 4 }])
  })

  it('puts a member in the Back Line and back, and stays in the list', () => {
    let c = chooseCommand(state, to(party(), PARTY_ROWS.indexOf('misc')))
    c = { ...c, step: { at: 'misc', cursor: MISC_ROWS.indexOf('lineUp') } }
    c = chooseCommand(state, c)
    expect(c.step).toEqual({ at: 'lineUp', cursor: 0 })
    c = moveCommand(state, c, 0, 1)
    c = chooseCommand(state, c)
    expect(inBackLine(c, member(1))).toBe(true)
    expect(c.step.at).toBe('lineUp')
    c = chooseCommand(state, c)
    expect(inBackLine(c, member(1))).toBe(false)
    expect(backCommand(state, c).step).toEqual({ at: 'misc', cursor: MISC_ROWS.indexOf('lineUp') })
  })
})

describe('Equipment', () => {
  const sword = (item: number, attack: number) => ({
    item,
    kind: 0,
    name: `sword ${item}`,
    named: { name: `sword ${item}` },
    attack,
    defence: 0,
    agility: 0,
  })
  const spear = { ...sword(20500, 9), kind: 1, name: 'spear', named: { name: 'spear' } }
  const armed = (arms: Arms) =>
    openCommands([member(0, { arms }), member(1, { guest: true, arms: { bag: [] } })])
  const toEquipment = (c: ReturnType<typeof armed>) =>
    chooseCommand(state, { ...c, step: { at: 'misc', cursor: MISC_ROWS.indexOf('equipment') } })

  it('offers the kinds the bag holds and the one in hand, ascending', () => {
    const arms: Arms = { inHand: sword(20000, 5), bag: [spear, sword(20001, 7)] }
    expect(armsKinds(arms)).toEqual([0, 1])
    expect(armsOfKind(arms, 0).map((w) => w.item)).toEqual([20000, 20001])
  })

  it('puts the chosen weapon on, the old one in the bag, and comes back to Misc. free', () => {
    // The guest is never asked, so there is no choosing whom.
    let c = toEquipment(armed({ inHand: sword(20000, 5), bag: [sword(20001, 7)] }))
    expect(c.step).toEqual({ at: 'armsKind', member: 0, cursor: 0 })
    c = chooseCommand(state, c)
    c = moveCommand(state, c, 0, 1)
    c = chooseCommand(state, c)
    expect(c.armed).toEqual([{ fighter: 0, from: sword(20000, 5), to: sword(20001, 7) }])
    expect(c.members[0]?.arms?.inHand?.item).toBe(20001)
    expect(c.members[0]?.arms?.bag.map((w) => w.item)).toEqual([20000])
    expect(c.step.at === 'say' && c.step.say.number).toBe(20)
    expect(chooseCommand(state, c).step).toEqual({
      at: 'misc',
      cursor: MISC_ROWS.indexOf('equipment'),
    })
    expect(c.chosen.size).toBe(0)
  })

  it('takes off the weapon in hand, and says so when there is nothing to carry', () => {
    let c = toEquipment(armed({ inHand: sword(20000, 5), bag: [] }))
    c = chooseCommand(state, chooseCommand(state, c))
    expect(c.armed).toEqual([{ fighter: 0, from: sword(20000, 5), to: undefined }])
    expect(c.step.at === 'say' && c.step.say.number).toBe(22)
    const none = toEquipment(armed({ bag: [] }))
    expect(none.step.at === 'say' && none.step.say.number).toBe(35)
  })
})
