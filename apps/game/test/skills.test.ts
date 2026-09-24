import type { SkillPanel, VocationTrees } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import type { Member } from '../src/companion.ts'
import { HERO_VOCATION_NUMBER } from '../src/hero.ts'
import {
  buy,
  climbable,
  POOL_MOST,
  panelsHeld,
  saidOf,
  spend,
  spentIn,
  TREE_MOST,
  treesOf,
  treeView,
} from '../src/skills.ts'

/**
 * The skill trees, as a character climbs them — see `apps/game/src/skills.ts`.
 *
 * The panels here are made up rather than read: fixtures may hold no cartridge
 * bytes, and what this is about is the *spending*, which is ours. The shapes
 * are the cartridge's, and `tools/harness/test/skills.test.ts` is what holds
 * them to it.
 */

const panel = (over: Partial<SkillPanel>): SkillPanel => ({
  id: 0,
  tree: 1,
  cost: 10,
  action: 0,
  grants: 2,
  amount: 0,
  fieldAction: 0,
  unknown_7: 0,
  message: 2,
  ...over,
})

/** A tree of four: three that rise, and the eleventh's zero. */
const SWORD: SkillPanel[] = [
  panel({ id: 0, cost: 3, grants: 1, message: 1 }),
  panel({ id: 1, cost: 7, grants: 2, amount: 10, message: 2 }),
  panel({ id: 2, cost: 100, grants: 4, message: 5 }),
  panel({ id: 3, cost: 0, grants: 1, message: 1 }),
]
const FAITH: SkillPanel[] = [panel({ id: 4, tree: 16, cost: 8, grants: 6, amount: 10, message: 4 })]
const PANELS = [...SWORD, ...FAITH]

const WORDS = {
  trees: new Map([
    [1, 'Sword Skill'],
    [16, 'Faith'],
  ]),
  panels: new Map([
    [0, 'Dragon Slash'],
    [1, 'Attack+10'],
    [2, 'Omnivocational Swordmaster'],
    [3, 'Gigagash'],
    [4, 'Natural Strength+10'],
  ]),
  said: new Map([
    [1, '<Cap><ACTOR> learns <str_2>!'],
    [2, '<Cap><ACTOR><1>s <str_3> when equipped with <str_2> increases by <val_1>!'],
    [4, '<Cap><ACTOR><1>s <str_2> increases by <val_1>!'],
    [5, '<Cap><ACTOR> becomes able to equip <str_2> regardless of vocation!'],
    [101, 'a sword'],
    [202, 'attack'],
    [206, 'strength'],
  ]),
}

/** A member with nothing but what these functions read. */
const someone = (over: Partial<Member> = {}): Member => ({
  attnpc: undefined,
  hp: undefined,
  mp: undefined,
  exp: new Map(),
  vocation: HERO_VOCATION_NUMBER,
  held: new Set([HERO_VOCATION_NUMBER]),
  appearance: undefined,
  look: undefined,
  sex: undefined,
  name: undefined,
  gains: {},
  outfits: new Map(),
  skillPool: 0,
  treePoints: new Map(),
  revocations: new Map(),
  ...over,
})

/** Two vocations of the ARM9 table's shape: four weapon trees then their own. */
const TREES: VocationTrees = {
  offset: 0,
  rows: [
    [1, 2, 9, 10, 15],
    [4, 6, 3, 13, 16],
  ],
}

describe('the five trees a vocation may spend in', () => {
  it('is the ARM9 table’s row, its own tree last', () => {
    expect(treesOf(TREES, 1)).toEqual([1, 2, 9, 10, 15])
    expect(treesOf(TREES, 2)).toEqual([4, 6, 3, 13, 16])
  })

  it('is empty for a vocation the table has no row for, and with no table at all', () => {
    expect(treesOf(TREES, 3)).toEqual([])
    expect(treesOf(undefined, 1)).toEqual([])
  })
})

describe('climbing a tree', () => {
  it('leaves out the eleventh panel, whose zero is not a price', () => {
    expect(climbable(PANELS, 1).map((one) => one.id)).toEqual([0, 1, 2])
  })

  it('spends into the tree, not onto the panel', () => {
    const member = someone({ skillPool: 20 })
    // Reaching the 7-point panel from nothing costs 7 …
    expect(buy(member, 1, SWORD[1] as SkillPanel)).toBe(7)
    expect(member.skillPool).toBe(13)
    expect(spentIn(member, 1)).toBe(7)
    // … and the 3-point one below it came with it, so it cannot be bought.
    expect(buy(member, 1, SWORD[0] as SkillPanel)).toBeUndefined()
    expect(member.skillPool).toBe(13)
  })

  it('will not spend what the pool has not got, nor on the eleventh', () => {
    const member = someone({ skillPool: 20 })
    // The hundred-point panel is 100 away and the pool holds 20.
    expect(buy(member, 1, SWORD[2] as SkillPanel)).toBeUndefined()
    expect(buy(member, 1, SWORD[3] as SkillPanel)).toBeUndefined()
    expect(member.skillPool).toBe(20)
    expect(spentIn(member, 1)).toBe(0)
  })

  it('refuses a panel that is not of the tree it is offered to', () => {
    const member = someone({ skillPool: 100 })
    expect(buy(member, 1, FAITH[0] as SkillPanel)).toBeUndefined()
  })

  it('puts points in one at a time, which is what the game’s screen does', () => {
    const member = someone({ skillPool: 5 })
    expect(spend(member, 1, 1)).toBe(1)
    expect(spend(member, 1, 1)).toBe(1)
    expect(spentIn(member, 1)).toBe(2)
    expect(member.skillPool).toBe(3)
  })

  it('gives what it can when the pool or the ceiling is short', () => {
    const member = someone({ skillPool: 4 })
    // The pool runs out first.
    expect(spend(member, 1, 10)).toBe(4)
    expect(member.skillPool).toBe(0)
    expect(spend(member, 1, 1)).toBe(0)
    // And a tree stops at a hundred, however much is in the pool.
    const rich = someone({ skillPool: POOL_MOST, treePoints: new Map([[1, 98]]) })
    expect(spend(rich, 1, 50)).toBe(2)
    expect(spentIn(rich, 1)).toBe(TREE_MOST)
    expect(spend(rich, 1, 1)).toBe(0)
  })
})

describe('the tree as the screen shows it', () => {
  it('names it, counts what is in it, and says what each panel needs', () => {
    const member = someone({ skillPool: 30, treePoints: new Map([[1, 7]]) })
    const view = treeView(member, 1, PANELS, WORDS)
    expect(view.name).toBe('Sword Skill')
    expect(view.spent).toBe(7)
    expect(view.steps.map((step) => [step.name, step.bought, step.toBuy, step.buyable])).toEqual([
      ['Dragon Slash', true, 0, true],
      ['Attack+10', true, 0, true],
      ['Omnivocational Swordmaster', false, 93, true],
      // The eleventh: neither bought nor buyable, and nothing to go.
      ['Gigagash', false, 0, false],
    ])
  })

  it('falls back to numbers where a word did not read', () => {
    const view = treeView(someone(), 16, PANELS, { ...WORDS, trees: new Map(), panels: new Map() })
    expect(view.name).toBe('skill tree 16')
    expect(view.steps[0]?.name).toBe('panel 4')
  })
})

describe('what a panel says when it is bought', () => {
  it('puts the weapon noun, the stat noun and the amount in', () => {
    // `<str_2>` is the weapon noun where the message wants one …
    expect(saidOf(SWORD[2] as SkillPanel, WORDS.said)).toBe(
      '<Cap><ACTOR> becomes able to equip a sword regardless of vocation!',
    )
    // … the stat noun where there is no weapon noun for that tree …
    expect(saidOf(FAITH[0] as SkillPanel, WORDS.said)).toBe(
      '<Cap><ACTOR><1>s strength increases by 10!',
    )
    // … and both, with the amount, where the message wants all three.
    expect(saidOf(SWORD[1] as SkillPanel, WORDS.said)).toBe(
      '<Cap><ACTOR><1>s attack when equipped with a sword increases by 10!',
    )
  })

  it('names the ability rather than the weapon on “learns”', () => {
    // Without it the sentence reads "Hero learns a sword!", which is what the
    // screen said the first time it was looked at.
    expect(saidOf(SWORD[0] as SkillPanel, WORDS.said, 'Dragon Slash')).toBe(
      '<Cap><ACTOR> learns Dragon Slash!',
    )
    // Only on the panels that grant an ability: the weapon noun still wins
    // where the message is about wielding one.
    expect(saidOf(SWORD[2] as SkillPanel, WORDS.said, 'Dragon Slash')).toBe(
      '<Cap><ACTOR> becomes able to equip a sword regardless of vocation!',
    )
  })

  it('says nothing where the message did not read', () => {
    expect(saidOf(SWORD[0] as SkillPanel, new Map())).toBeUndefined()
  })
})

describe('what a character holds', () => {
  it('is every tree they have spent in, not only the five they may spend in now', () => {
    // Spent as a Warrior in Sword, and now a Priest whose trees do not include
    // it: the points are per tree and the pool per character, so what was
    // learnt is still learnt.
    const member = someone({
      vocation: 2,
      treePoints: new Map([
        [1, 7],
        [16, 8],
      ]),
    })
    expect(
      panelsHeld(member, PANELS)
        .map((one) => one.id)
        .sort(),
    ).toEqual([0, 1, 4])
  })
})
