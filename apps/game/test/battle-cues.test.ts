import type { Fighter } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { battleChoose, beginBattle, withPages } from '../src/battle-scene.ts'

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 30,
  maxMp: 6,
  attack: 30,
  defence: 8,
  agility: 60,
  shield: false,
  exp: 0,
  gold: 0,
}
const blob = (hp: number): Fighter => ({
  name: 'blob',
  side: 'foes',
  maxHp: hp,
  maxMp: 0,
  attack: 9,
  defence: 1,
  agility: 1,
  shield: false,
  exp: 2,
  gold: 3,
})

describe('what the monsters do while the battle is told', () => {
  it('has every monster appear on the first page', () => {
    const scene = beginBattle([hero, blob(8), blob(8)], 1n, { canFlee: true })
    expect(scene.cues).toHaveLength(scene.pages.length)
    expect(scene.cues[0]).toEqual([
      { fighter: 1, motion: 'appear' },
      { fighter: 2, motion: 'appear' },
    ])
  })

  it('has a monster that is hit take it, and one that falls, fall — page for page', () => {
    let scene = beginBattle([hero, blob(999), blob(1)], 5n, { canFlee: true })
    while (scene.phase === 'telling') scene = battleChoose(scene)
    // Attack, which asks whom; then the second blob, which falls to anything.
    const targeting = battleChoose(scene)
    expect(targeting.phase).toBe('target')
    const played = battleChoose({ ...targeting, cursor: 1 })
    expect(played.cues).toHaveLength(played.pages.length)
    const all = played.cues.flat()
    expect(all).toContainEqual({ fighter: 2, motion: 'damage' })
    expect(all).toContainEqual({ fighter: 2, motion: 'death' })
    // The blob that struck back, if it lived to, strikes in its own page.
    for (const cue of all) expect(['attack', 'damage', 'death']).toContain(cue.motion)
    // Told a page at a time, the cues go with them; added pages bring none.
    const next = battleChoose(played)
    expect(next.cues).toEqual(played.cues.slice(1))
    const told = withPages(played, ['more'])
    expect(told.cues.at(-1)).toEqual([])
  })
})
