import type { Fighter } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import {
  BATTLE_COMMANDS,
  battleBack,
  battleChoose,
  battleMove,
  battleRows,
  beginBattle,
  labelsOf,
  withPages,
} from '../src/battle-scene.ts'

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
    const fled = battleChoose(battleMove(untilChoice(scene), 2))
    expect(fled.pages[0]).toBe('Hero tries to run, but there is no escape!')
  })
})
