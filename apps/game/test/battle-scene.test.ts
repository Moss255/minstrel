import { readGrammar } from '@minstrel/game-formats'
import type { Fighter } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import {
  ACTION_SAYS,
  BATTLE_COMMANDS,
  BATTLE_SAYS,
  type BattleSpell,
  battleBack,
  battleChoose,
  battleMove,
  battleRows,
  beginBattle,
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

/** Go on through every message until there is something to choose, or it is over. */
function untilChoice(scene: ReturnType<typeof beginBattle>) {
  let now = scene
  while (now.phase === 'telling') now = battleChoose(now)
  return now
}

describe('a battle scene', () => {
  it('opens on the monsters appearing, then the commands', () => {
    const scene = beginBattle([hero, blob(), blob()], 1n, { canFlee: true })
    expect(scene.phase).toBe('telling')
    expect(scene.pages).toEqual(['2 blobs appear!'])
    expect(labelsOf(scene.state)).toEqual(['Hero', 'blob A', 'blob B'])
    const choosing = untilChoice(scene)
    expect(choosing.phase).toBe('command')
    expect(battleRows(choosing)).toEqual([...BATTLE_COMMANDS])
    expect(battleMove(choosing, -1).cursor).toBe(BATTLE_COMMANDS.length - 1)
  })

  it('asks whom to fight when more than one monster stands, and goes back a step', () => {
    const choosing = untilChoice(beginBattle([hero, blob(), blob()], 1n, { canFlee: true }))
    const targeting = battleChoose(choosing)
    expect(targeting.phase).toBe('target')
    expect(battleRows(targeting)).toEqual(['blob A', 'blob B'])
    expect(battleBack(targeting).phase).toBe('command')
    const played = battleChoose(battleMove(targeting, 1))
    expect(played.phase).toBe('telling')
    expect(played.state.round).toBe(1)
    expect(played.pages.some((page) => page.startsWith('Hero attacks!'))).toBe(true)
  })

  it('fights a lone monster straight away, and ends when it is beaten', () => {
    let scene = untilChoice(beginBattle([hero, blob(1)], 3n, { canFlee: true }))
    for (let round = 0; round < 20 && scene.phase === 'command'; round++) {
      scene = untilChoice(battleChoose(scene))
    }
    expect(scene.phase).toBe('over')
    expect(scene.state.outcome).toBe('won')
  })

  it('tells what it is given to tell after the battle, then is over', () => {
    let scene = untilChoice(beginBattle([hero, blob(1)], 3n, { canFlee: true }))
    for (let round = 0; round < 20 && scene.phase === 'command'; round++) {
      const next = battleChoose(scene)
      scene = next.state.outcome === 'won' ? withPages(next, ['Hero gains 2 experience.']) : next
      scene = untilChoice(scene)
    }
    expect(scene.phase).toBe('over')
  })

  it('carries the party’s wounds in, and says when there is no running', () => {
    const scene = beginBattle([hero, blob()], 1n, { canFlee: false, hp: new Map([[0, 7]]) })
    expect(scene.state.fighters[0]?.hp).toBe(7)
    const fled = battleChoose(battleMove(untilChoice(scene), BATTLE_COMMANDS.indexOf('Flee')))
    expect(fled.pages[0]).toBe('Hero tries to run, but there is no escape!')
  })

  it('offers the bag’s items, and uses the one chosen on the Hero', () => {
    const herb = { id: 0x55f0, name: { name: 'herb' }, count: 2, heal: { base: 35, spread: 5 } }
    const scene = untilChoice(
      beginBattle([hero, blob()], 1n, { canFlee: true, hp: new Map([[0, 5]]) }),
    )
    const items = BATTLE_COMMANDS.indexOf('Items')
    const empty = battleChoose(battleMove(scene, items))
    expect(empty.pages).toEqual(['Hero has nothing to use.'])
    const offered = battleChoose(battleMove(scene, items), [herb])
    expect(offered.phase).toBe('item')
    expect(battleRows(offered)).toEqual(['herb ×2'])
    expect(battleBack(offered).phase).toBe('command')
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
  const spells = BATTLE_COMMANDS.indexOf('Spells')

  it('turns a monster’s six words into its ways, an attack where the battle cannot yet', () => {
    const herb: BattleSpell = { ...heal, opening: 'use', name: { name: 'herb' } }
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
    expect(ways.known.get(44)).toMatchObject({ name: { name: 'Kasap' }, opening: 'cast' })
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
      known: new Map([[44, { name: { name: 'Kasap' }, message: 0, opening: 'cast' as const }]]),
    })
    const played = battleChoose(untilChoice(scene))
    expect(played.pages).toContain("Blob casts Kasap!\nHero's defence falls.")
  })

  it('tells a monster running away, and it is gone with what it was worth', () => {
    const runner = {
      ...blob(40),
      acts: Array.from({ length: 6 }, () => ({ kind: 'flee' as const })),
    }
    const played = battleChoose(untilChoice(beginBattle([hero, runner], 1n, { canFlee: true })))
    expect(played.pages).toContain('Blob runs away!')
    expect(played.state.outcome).toBe('won')
    expect(played.cues.flat()).toContainEqual({ fighter: 1, motion: 'flee' })
  })

  it('tells a monster using its own herb on itself when hurt', () => {
    // A herb costs nothing: the blob has no MP.
    const herb: BattleSpell = {
      ...heal,
      spell: { ...heal.spell, action: 236, cost: 0 },
      opening: 'use',
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
    const scene = untilChoice(beginBattle([hero, blob(40), blob(40)], 1n, { canFlee: true }))
    expect(battleChoose(battleMove(scene, spells)).pages).toEqual([
      'Hero doesn’t know any battle spells yet.',
    ])
    const offered = battleChoose(battleMove(scene, spells), [], [crack, heal])
    expect(offered.phase).toBe('spell')
    expect(battleRows(offered)).toEqual(['Crack — 3 MP', 'Heal — 2 MP'])
    expect(battleBack(offered).phase).toBe('command')
  })

  it('casts a spell at the monster chosen, and spends its MP', () => {
    const scene = untilChoice(beginBattle([hero, blob(40), blob(40)], 1n, { canFlee: true }))
    const targeting = battleChoose(battleChoose(battleMove(scene, spells), [], [crack, heal]))
    expect(targeting.phase).toBe('target')
    expect(battleRows(targeting)).toEqual(['blob A', 'blob B'])
    const cast = battleChoose(battleMove(targeting, 1))
    const event = cast.events.find((e) => e.kind === 'spell')
    expect(event).toMatchObject({ kind: 'spell', action: 12, short: false, hits: [{ target: 2 }] })
    expect(cast.state.fighters[0]?.mp).toBe(3)
    expect(cast.pages.some((page) => page.startsWith('Hero casts Crack!\nBlob B takes'))).toBe(true)
  })

  it('heals the Hero with a spell straight away, and says when the MP are not there', () => {
    const scene = untilChoice(
      beginBattle([hero, blob(40)], 1n, { canFlee: true, hp: new Map([[0, 5]]) }),
    )
    const offered = battleChoose(battleMove(scene, spells), [], [crack, heal])
    const healed = battleChoose(battleMove(offered, 1))
    const event = healed.events.find((e) => e.kind === 'spell')
    expect(event).toMatchObject({ kind: 'spell', action: 30, hits: [{ target: 0 }] })
    expect(healed.state.fighters[0]?.mp).toBe(4)
    const poor = untilChoice(
      beginBattle([hero, blob(40)], 1n, { canFlee: true, mp: new Map([[0, 1]]) }),
    )
    const short = battleChoose(battleChoose(battleMove(poor, spells), [], [crack]))
    expect(short.pages[0]).toBe('Hero casts Crack!\nNot enough MP!')
    expect(short.state.fighters[0]?.mp).toBe(1)
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
    expect(battleRows(untilChoice(one))[0]).toBe('Hit')
    // A command with no word of its own keeps ours.
    expect(battleRows(untilChoice(one))[1]).toBe('Spells')
  })

  it('tells a round in them, the monster by its article and letter', () => {
    const scene = untilChoice(
      beginBattle([hero, blob(), blob()], 1n, {
        canFlee: true,
        words,
        names: [...names, names[1] as Named],
      }),
    )
    const played = battleChoose(battleChoose(scene))
    expect(
      played.pages.some((page) => /^Hero swings\.\nThe blob A (loses \d+|is out)\./.test(page)),
    ).toBe(true)
  })
})
