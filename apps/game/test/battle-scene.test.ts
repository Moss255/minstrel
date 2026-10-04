import { readGrammar } from '@minstrel/game-formats'
import type { Fighter } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import {
  ACTION_SAYS,
  BATTLE_SAYS,
  type BattleItem,
  type BattleSpell,
  battleBack,
  battleChoose,
  battleMenu,
  battleMove,
  beginBattle,
  COUP_COLOURS,
  foeWaysOf,
  labelsOf,
  withPages,
} from '../src/battle-scene.ts'
import type { Named } from '../src/battle-text.ts'

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 30,
  maxMp: 6,
  attack: 14,
  defence: 8,
  agility: 9,
  shield: false,
  exp: 0,
  gold: 0,
}
const blob = (hp = 8): Fighter => ({
  name: 'blob',
  side: 'foes',
  maxHp: hp,
  maxMp: 0,
  attack: 9,
  defence: 6,
  agility: 5,
  shield: false,
  exp: 2,
  gold: 3,
})

/**
 * Go on through every message until there is something to choose, or it is
 * over — the round's lists offered as its command phase opens.
 */
function untilChoice(
  scene: ReturnType<typeof beginBattle>,
  items: readonly BattleItem[] = [],
  spells: readonly BattleSpell[] = [],
) {
  let now = scene
  while (now.phase === 'telling') now = battleChoose(now, { items, spells })
  return now
}
const rows = (scene: ReturnType<typeof beginBattle>) => battleMenu(scene)?.rows
/** Fight, from the party menu: the first member's commands. */
const fight = (scene: ReturnType<typeof beginBattle>) => battleChoose(scene)
/** A member's command by its place in the grid, row by row: Attack, Abilities / Spells, Items / Defend, Coup. */
const at = (scene: ReturnType<typeof beginBattle>, dx: number, dy: number) =>
  battleMove(scene, dx, dy)

describe('a battle scene', () => {
  it('opens on the monsters appearing, then the commands', () => {
    const scene = beginBattle([hero, blob(), blob()], 1n, { canFlee: true })
    expect(scene.phase).toBe('telling')
    expect(scene.pages).toEqual(['2 blobs appear!'])
    expect(labelsOf(scene.state)).toEqual(['Hero', 'blob A', 'blob B'])
    const choosing = untilChoice(scene)
    expect(choosing.phase).toBe('command')
    // The party menu first, then the member's six commands, two to a row.
    expect(rows(choosing)).toEqual(['fight', 'examine', 'flee', 'misc'])
    expect(battleMenu(battleMove(choosing, 0, -1))?.cursor).toBe(3)
    expect(rows(fight(choosing))).toEqual([
      'attack',
      'abilities',
      'spells',
      'items',
      'defend',
      // Greyed: not ready for it.
      { text: 'coup', colour: COUP_COLOURS.greyed },
    ])
  })

  it('asks whom to fight when more than one monster stands, and goes back a step', () => {
    const choosing = fight(untilChoice(beginBattle([hero, blob(), blob()], 1n, { canFlee: true })))
    const targeting = battleChoose(choosing)
    expect(targeting.commanding?.step.at).toBe('monster')
    // One line for the two of a kind, the cursor on the first of them.
    expect(rows(targeting)).toEqual([{ text: 'Blob', right: '× 2', at: 118 }])
    expect(battleBack(targeting).commanding?.step.at).toBe('member')
    const played = battleChoose(battleMove(targeting, 0, 1))
    expect(played.phase).toBe('telling')
    expect(played.state.round).toBe(1)
    expect(played.pages.some((page) => page.startsWith('Hero attacks!'))).toBe(true)
  })

  it('fights a lone monster straight away, and ends when it is beaten', () => {
    let scene = untilChoice(beginBattle([hero, blob(1)], 3n, { canFlee: true }))
    for (let round = 0; round < 20 && scene.phase === 'command'; round++) {
      scene = untilChoice(battleChoose(fight(scene)))
    }
    expect(scene.phase).toBe('over')
    expect(scene.state.outcome).toBe('won')
  })

  it('tells what it is given to tell after the battle, then is over', () => {
    let scene = untilChoice(beginBattle([hero, blob(1)], 3n, { canFlee: true }))
    for (let round = 0; round < 20 && scene.phase === 'command'; round++) {
      const next = battleChoose(fight(scene))
      scene = next.state.outcome === 'won' ? withPages(next, ['Hero gains 2 experience.']) : next
      scene = untilChoice(scene)
    }
    expect(scene.phase).toBe('over')
  })

  it('carries the party’s wounds in, and says when there is no running', () => {
    const scene = beginBattle([hero, blob()], 1n, { canFlee: false, hp: new Map([[0, 7]]) })
    expect(scene.state.fighters[0]?.hp).toBe(7)
    const fled = battleChoose(battleMove(untilChoice(scene), 0, 2))
    expect(fled.pages[0]).toBe('Hero tries to run, but there is no escape!')
  })

  it('offers the bag’s items, and uses the one chosen on the Hero', () => {
    const herb = { id: 0x55f0, name: { name: 'herb' }, count: 2, heal: { base: 35, spread: 5 } }
    const opened = beginBattle([hero, blob()], 1n, { canFlee: true, hp: new Map([[0, 5]]) })
    const empty = battleChoose(at(fight(untilChoice(opened)), 1, 1))
    expect(empty.commanding?.step).toMatchObject({ at: 'say', say: { number: 30024 } })
    const offered = battleChoose(at(fight(untilChoice(opened, [herb])), 1, 1))
    expect(offered.commanding?.step).toMatchObject({ at: 'list', list: 'items' })
    expect(rows(offered)).toEqual(['herb'])
    expect(battleBack(offered).commanding?.step.at).toBe('member')
    const used = battleChoose(offered)
    const event = used.events.find((e) => e.kind === 'item')
    expect(event).toMatchObject({ kind: 'item', item: 0x55f0 })
    const healed = event?.kind === 'item' ? (event.healed ?? 0) : 0
    expect(healed).toBeGreaterThanOrEqual(25)
    expect(used.pages.some((page) => page.includes(`Hero recovers ${healed} HP.`))).toBe(true)
  })

  const crack: BattleSpell = {
    spell: { action: 12, cost: 3, does: 'harm', reach: 'one', amount: { base: 30, spread: 5 } },
    name: { name: 'Crack' },
    message: 2,
  }
  const heal: BattleSpell = {
    spell: { action: 30, cost: 2, does: 'heal', reach: 'one', amount: { base: 35, spread: 5 } },
    name: { name: 'Heal' },
    message: 22,
  }
  /** The Spells command: the grid's second row, on the left. */
  const spellsOf = (scene: ReturnType<typeof beginBattle>) => battleChoose(at(fight(scene), 0, 1))

  it('turns a monster’s six words into its ways, an attack where the battle cannot yet', () => {
    const herb: BattleSpell = { ...heal, opening: 70, name: { name: 'herb' } }
    const ways = foeWaysOf([1, 225, 236, 41, 1, 1], (action) => (action === 236 ? herb : undefined))
    expect(ways.acts.map((a) => a.kind)).toEqual([
      'attack',
      'flee',
      'spell',
      'attack',
      'attack',
      'attack',
    ])
    expect([...ways.known.keys()]).toEqual([236])
  })

  it('turns a monster’s Kasap, poison attack and Buff into changes of state at their own reach', () => {
    const actionOf = (id: number) => ({
      action: id,
      name: id === 44 ? 'Kasap' : 'Buff',
      effect: 0,
      message: 0,
      opening: 46,
      cost: 3,
      reach: id === 44 ? 4 : 2,
      range: undefined,
    })
    const ways = foeWaysOf([44, 275, 41], () => undefined, actionOf)
    expect(ways.acts).toEqual([
      {
        kind: 'change',
        changing: {
          action: 44,
          cost: 3,
          reach: 'group',
          change: { kind: 'defence', by: -1, chance: 75 },
          side: 'other',
        },
      },
      { kind: 'attack', poison: 12 },
      {
        kind: 'change',
        changing: {
          action: 41,
          cost: 3,
          reach: 'one',
          change: { kind: 'defence', by: 1, chance: 100 },
          side: 'own',
        },
      },
    ])
    expect(ways.known.get(44)).toMatchObject({ name: { name: 'Kasap' }, opening: 46 })
  })

  it('takes a change’s chance, levels and dodging from the action’s record where it has one', () => {
    // What the game's rolls read — see `Castable.rolls`. Snooze's chance is its
    // own 37 and not the table's 25; a breath can be dodged and a spell cannot;
    // an action whose accuracy does not scale lands every time, whatever its
    // chance field holds; and the poison attack's chance is its rider's.
    const rolls = {
      foeChance: 0,
      chanceIsAccuracy: true,
      evadable: false,
      haywire: false,
      levels: 0,
      rider: 0,
    }
    const records = new Map([
      [53, { ...rolls, foeChance: 37, haywire: true }],
      [228, { ...rolls, foeChance: 25, evadable: true }],
      [41, { ...rolls, chanceIsAccuracy: false, foeChance: 9, levels: 1 }],
      [275, { ...rolls, foeChance: 40, rider: 4 }],
    ])
    const actionOf = (id: number) => ({
      action: id,
      name: 'x',
      effect: 1,
      message: 0,
      opening: 0,
      cost: 0,
      reach: 2,
      range: undefined,
      rolls: records.get(id) ?? rolls,
    })
    const changing = (id: number) => {
      const [way] = foeWaysOf([id], () => undefined, actionOf).acts
      return way?.kind === 'change' ? way.changing : way
    }
    expect(changing(53)).toMatchObject({
      change: { kind: 'sleep', chance: 37 },
      evadable: false,
      haywire: true,
    })
    expect(changing(228)).toMatchObject({ change: { kind: 'sleep', chance: 25 }, evadable: true })
    expect(changing(41)).toMatchObject({ change: { kind: 'defence', by: 1, chance: 100 } })
    expect(changing(275)).toEqual({ kind: 'attack', poison: 40 })
  })

  it('tells a monster’s change of state on the Hero', () => {
    const kasap = {
      kind: 'change' as const,
      changing: {
        action: 44,
        cost: 0,
        change: { kind: 'defence' as const, by: -1, chance: 100 },
        reach: 'group' as const,
        side: 'other' as const,
      },
    }
    const beakon = { ...blob(40), acts: Array.from({ length: 6 }, () => kasap) }
    const scene = beginBattle([hero, beakon], 1n, {
      canFlee: true,
      known: new Map([[44, { name: { name: 'Kasap' }, message: 0, opening: 46 }]]),
    })
    const played = battleChoose(fight(untilChoice(scene)))
    expect(played.pages).toContain("Blob casts Kasap!\nHero's defence falls.")
  })

  it('tells a monster running away, and it is gone with what it was worth', () => {
    const runner = {
      ...blob(40),
      acts: Array.from({ length: 6 }, () => ({ kind: 'flee' as const })),
    }
    const played = battleChoose(
      fight(untilChoice(beginBattle([hero, runner], 1n, { canFlee: true }))),
    )
    expect(played.pages).toContain('Blob runs away!')
    expect(played.state.outcome).toBe('won')
    expect(played.cues.flat()).toContainEqual({ fighter: 1, motion: 'flee' })
  })

  it('tells a monster using its own herb on itself when hurt', () => {
    // A herb costs nothing: the blob has no MP.
    const herb: BattleSpell = {
      ...heal,
      spell: { ...heal.spell, action: 236, cost: 0 },
      opening: 70,
      name: { name: 'herb' },
    }
    const healer = {
      ...blob(40),
      acts: Array.from({ length: 6 }, () => ({ kind: 'spell' as const, spell: herb.spell })),
    }
    let scene = untilChoice(
      beginBattle([hero, healer], 1n, { canFlee: true, known: new Map([[236, herb]]) }),
    )
    let told: string | undefined
    for (let round = 0; round < 6 && !told && scene.phase === 'command'; round++) {
      const played = battleChoose(scene)
      told = played.pages.find((page) => page.startsWith('Blob uses a herb.'))
      scene = untilChoice(played)
    }
    expect(told).toMatch(/^Blob uses a herb\.\nBlob recovers \d+ HP\.$/)
  })

  it('offers the spells the Hero knows, or says there are none', () => {
    const opened = beginBattle([hero, blob(40), blob(40)], 1n, { canFlee: true })
    expect(spellsOf(untilChoice(opened)).commanding?.step).toMatchObject({
      at: 'say',
      say: { number: 30023, str2: 30021 },
    })
    const offered = spellsOf(untilChoice(opened, [], [crack, heal]))
    expect(offered.commanding?.step).toMatchObject({ at: 'list', list: 'spells' })
    // Names only: the cost is in the box beside the list (`func_ov000_02178d28`).
    expect(rows(offered)).toEqual(['Crack', 'Heal'])
    expect(battleBack(offered).commanding?.step.at).toBe('member')
  })

  it('casts a spell at the monster chosen, and spends its MP', () => {
    const scene = untilChoice(
      beginBattle([hero, blob(40), blob(40)], 1n, { canFlee: true }),
      [],
      [crack, heal],
    )
    const targeting = battleChoose(spellsOf(scene))
    expect(targeting.commanding?.step.at).toBe('monster')
    // One line for the two of a kind, the cursor on the first of them.
    expect(rows(targeting)).toEqual([{ text: 'Blob', right: '× 2', at: 118 }])
    const cast = battleChoose(battleMove(targeting, 0, 1))
    const event = cast.events.find((e) => e.kind === 'spell')
    expect(event).toMatchObject({ kind: 'spell', action: 12, short: false, hits: [{ target: 2 }] })
    expect(cast.state.fighters[0]?.mp).toBe(3)
    expect(cast.pages.some((page) => page.startsWith('Hero casts Crack!\nBlob B takes'))).toBe(true)
  })

  it('heals the Hero with a spell straight away, and says when the MP are not there', () => {
    const scene = untilChoice(
      beginBattle([hero, blob(40)], 1n, { canFlee: true, hp: new Map([[0, 5]]) }),
      [],
      [crack, heal],
    )
    const healed = battleChoose(battleMove(spellsOf(scene), 0, 1))
    const event = healed.events.find((e) => e.kind === 'spell')
    expect(event).toMatchObject({ kind: 'spell', action: 30, hits: [{ target: 0 }] })
    expect(healed.state.fighters[0]?.mp).toBe(4)
    // Too little MP is said as it is chosen (`str_btl` 30020), and nothing is cast.
    const poor = untilChoice(
      beginBattle([hero, blob(40)], 1n, { canFlee: true, mp: new Map([[0, 1]]) }),
      [],
      [crack],
    )
    const short = battleChoose(spellsOf(poor))
    expect(short.commanding?.step).toMatchObject({ at: 'say', say: { number: 30020 } })
    expect(short.state.fighters[0]?.mp).toBe(1)
  })

  const companion: Fighter = { ...hero, name: 'Ivor', maxMp: 0, attack: 15, agility: 16 }

  it('fights beside a companion who acts by themselves', () => {
    const scene = untilChoice(beginBattle([hero, companion, blob(999)], 3n, { canFlee: true }))
    // Attack, at the one monster, straight away; the companion is handed nothing.
    const played = battleChoose(fight(scene))
    expect(played.events.some((e) => e.kind === 'attack' && e.actor === 1)).toBe(true)
    expect(played.pages.some((page) => page.startsWith('Ivor attacks!'))).toBe(true)
  })

  it('goes on while either stands, and is lost when both have fallen', () => {
    const deadly: Fighter = { ...blob(999), attack: 999 }
    let now = battleChoose(
      fight(untilChoice(beginBattle([hero, companion, deadly], 3n, { canFlee: true }))),
    )
    // One blow a round fells one of them at most.
    expect(now.state.outcome).toBe('ongoing')
    for (let round = 0; round < 10 && now.state.outcome === 'ongoing'; round++) {
      now = battleChoose(fight(untilChoice(now)))
    }
    expect(now.state.outcome).toBe('lost')
    expect(now.state.fighters.slice(0, 2).map((f) => f.hp)).toEqual([0, 0])
  })

  it('asks whom to heal when someone stands beside the Hero, and heals the one chosen', () => {
    const scene = untilChoice(
      beginBattle([hero, companion, blob(40)], 1n, { canFlee: true, hp: new Map([[1, 5]]) }),
      [],
      [crack, heal],
    )
    const asking = battleChoose(battleMove(spellsOf(scene), 0, 1))
    expect(asking.commanding?.step.at).toBe('ally')
    expect(rows(asking)).toEqual(['Hero', 'Ivor'])
    const healed = battleChoose(battleMove(asking, 0, 1))
    expect(healed.events.find((e) => e.kind === 'spell')).toMatchObject({
      action: 30,
      hits: [{ target: 1 }],
    })
  })
})

describe('a battle in the game’s words', () => {
  // Messages written for the test in the files' markup, at the numbers the
  // scene reads them by; none is the game's own.
  const words = {
    battle: new Map([
      [
        BATTLE_SAYS.drawsNear,
        '<IF_SING val_1><Cap><INDEF_ART_SGL_M_NAME> shows up<ELSE_NOT_SING><Cap><INDEF_ART_PLR_M_NAME> show up<ENDIF_SING>!',
      ],
    ]),
    actions: new Map<number, string>([
      [ACTION_SAYS.attacks, '<Cap><DEF_ART_ACTOR> swings.'],
      [ACTION_SAYS.takes, '<Cap><DEF_ART_TARGET> loses <val_1>.'],
      [ACTION_SAYS.noDamage, 'Nothing.'],
      [ACTION_SAYS.critical, 'Ouch!'],
      [ACTION_SAYS.defeated, '<Cap><DEF_ART_TARGET> is out.'],
      [ACTION_SAYS.uses, '<Cap><DEF_ART_ACTOR> tries <INDEF_ART_SGL_I_NAME>.'],
      [ACTION_SAYS.healed, 'Better.'],
    ]),
    results: new Map(),
    menu: new Map([[30004, 'Hit']]),
    articles: new Map([
      [1, 'the'],
      [101, 'a'],
      [301, 'some'],
    ]),
  }
  const grammar = readGrammar(0x02041041)
  const names = [{ name: 'Hero' }, { name: 'blob', plural: 'blobs', grammar }]

  it('says the monsters drawing near, and the commands, in the words it is given', () => {
    const one = beginBattle([hero, blob()], 1n, { canFlee: true, words, names })
    expect(one.pages).toEqual(['A blob shows up!'])
    const two = beginBattle([hero, blob(), blob()], 1n, {
      canFlee: true,
      words,
      names: [...names, names[1] as Named],
    })
    expect(two.pages).toEqual(['Some blobs show up!'])
    expect(rows(fight(untilChoice(one)))?.[0]).toBe('Hit')
    // A command with no word of its own keeps ours.
    expect(rows(fight(untilChoice(one)))?.[2]).toBe('spells')
  })

  it('tells a round in them, the monster by its article and letter', () => {
    const scene = untilChoice(
      beginBattle([hero, blob(), blob()], 1n, {
        canFlee: true,
        words,
        names: [...names, names[1] as Named],
      }),
    )
    const played = battleChoose(battleChoose(fight(scene)))
    expect(
      played.pages.some((page) => /^Hero swings\.\nThe blob A (loses \d+|is out)\./.test(page)),
    ).toBe(true)
  })
})
