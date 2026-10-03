import type { ActionCommand } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  type ActionContext,
  BLEND_MS,
  EFFECT_BASE,
  effectFileOf,
  MONSTER_BASE,
  PASS_MS,
  type StageFighter,
  startAction,
  type Timings,
} from '../src/action-player.ts'

/** Two fighters on a stage, the Hero and a slime, written here — no cartridge. */
function stage(gapZ: number): StageFighter[] {
  const hero: StageFighter = {
    index: 0,
    x: 0,
    z: gapZ / 2,
    facing: Math.PI,
    radius: 0.5,
    height: 1.8,
    size: 1,
    grid: { x: 0, z: 3, facing: Math.PI },
    row: { x: 0, z: 2.5, facing: Math.PI },
    alive: true,
    visible: true,
    motion: 'stand',
    motionAt: 0,
    turnRate: 0x324 / 4096,
  }
  const slime: StageFighter = {
    ...hero,
    index: MONSTER_BASE,
    z: -gapZ / 2,
    facing: 0,
    radius: 0.8,
    height: 0.8,
    grid: { x: 0, z: -3, facing: 0 },
    row: { x: 0, z: -2.5, facing: 0 },
  }
  return [hero, slime]
}

const CONTEXT: ActionContext = { action: 1, actors: [0], targets: [{ receivers: [MONSTER_BASE] }] }

/** Every motion a second long, every effect half a second. */
const TIMINGS: Timings = {
  motionMs: (_, name) => (name === 'none' ? undefined : 1000),
  effectMs: () => 500,
}

function passes(run: ReturnType<typeof startAction>, n: number) {
  for (let i = 0; i < n; i++) run.pass(PASS_MS)
}

describe('an action script, played', () => {
  it('waits on 8 for its milliseconds, then goes on', () => {
    const run = startAction(
      [
        { tag: 8, ms: 100 },
        { tag: 3, who: 7, name: 'magic', flags: 1, fx: 0 },
      ] as ActionCommand[],
      CONTEXT,
      stage(6),
      TIMINGS,
    )
    passes(run, 6)
    expect(run.fighters.get(0)?.motion).toBe('stand')
    passes(run, 2)
    expect(run.fighters.get(0)?.motion).toBe('magic')
    expect(run.scriptDone).toBe(true)
  })

  it('skips the step in when the two are more than 2 apart, and steps in when nearer', () => {
    const blow: ActionCommand[] = [
      { tag: 9, id: 3, type: 2, bound: 2, ints: [] },
      { tag: 77, gap: 0.75 },
      { tag: 10, id: 3 },
      { tag: 3, who: 7, name: 'attack1a', flags: 1, fx: 0 },
    ]
    // Far apart, as on the grid: no step in — straight into the blow.
    const far = startAction(blow, CONTEXT, stage(6), TIMINGS)
    far.pass(PASS_MS)
    expect(far.fighters.get(0)?.motion).toBe('attack1a')
    expect(far.fighters.get(0)?.z).toBe(3)
    // Within 2 edge to edge: it runs in, a pass at a time, before the blow.
    const near = startAction(blow, CONTEXT, stage(2.5), TIMINGS)
    near.pass(PASS_MS)
    expect(near.fighters.get(0)?.motion).toBe('run')
    passes(near, 40)
    expect(near.fighters.get(0)?.motion).toBe('attack1a')
    expect(near.fighters.get(0)?.z ?? 0).toBeLessThan(2.5 / 2)
  })

  it('lunges to the gap edge to edge over its stretch of the motion, and is not waited on', () => {
    const run = startAction(
      [
        { tag: 3, who: 7, name: 'attack1a', flags: 1, fx: 0 },
        { tag: 5, from: 0.06, to: 0.33, gap: 0.25 },
        { tag: 26, who: 7, point: 0.61 },
      ],
      CONTEXT,
      stage(6),
      TIMINGS,
    )
    passes(run, 70)
    const hero = run.fighters.get(0)
    const slime = run.fighters.get(MONSTER_BASE)
    if (!hero || !slime) throw new Error('missing')
    expect(Math.abs(hero.z - slime.z) - 0.25 - 0.4).toBeCloseTo(0.25, 2)
    expect(run.scriptDone).toBe(true)
  })

  it('waits on 26 for a motion to be so far through — never in the pass the motion began', () => {
    const run = startAction(
      [
        { tag: 3, who: 7, name: 'attack1a', flags: 1, fx: 0 },
        { tag: 26, who: 7, point: 0 },
        { tag: 22, who: 7, show: false },
      ],
      CONTEXT,
      stage(6),
      TIMINGS,
    )
    run.pass(PASS_MS)
    expect(run.fighters.get(0)?.visible).toBe(true)
    run.pass(PASS_MS)
    expect(run.fighters.get(0)?.visible).toBe(false)
  })

  it('plays an effect on the one acting into its slot, and lets it go when its motion ends', () => {
    const run = startAction(
      [
        { tag: 30, id: 100, number: 3000500 },
        { tag: 21, id: 100, slot: 0, motion: '0', flags: 1, overlay: false },
      ],
      CONTEXT,
      stage(6),
      TIMINGS,
    )
    run.pass(PASS_MS)
    const effect = run.effects[0]
    expect(effect?.file).toBe('effect/eb0500.chr')
    expect(effect?.host).toBe(0)
    expect(effect?.handle).toBe(EFFECT_BASE)
    passes(run, 31)
    expect(run.effects[0]).toBeUndefined()
  })

  it('puts the two squared up, 6 and their mean radius apart, facing each other', () => {
    const run = startAction([{ tag: 79, mode: 2, who: 1, face: true }], CONTEXT, stage(6), TIMINGS)
    run.pass(PASS_MS)
    const hero = run.fighters.get(0)
    const slime = run.fighters.get(MONSTER_BASE)
    expect(Math.abs((hero?.z ?? 0) - (slime?.z ?? 0))).toBeCloseTo(0.25 + 6 + 0.4, 5)
    expect(hero?.facing).toBeCloseTo(Math.PI, 5)
    expect(slime?.facing).toBeCloseTo(0, 5)
  })

  it('names an effect file by its number', () => {
    expect(effectFileOf(3000500)).toBe('effect/eb0500.chr')
    expect(effectFileOf(2002310)).toBe('effect/et2310.chr')
    expect(effectFileOf(1000012)).toBe('effect/em0012.chr')
    expect(effectFileOf(5007000)).toBe('effect/z007000.chr')
    expect(effectFileOf(0)).toBeUndefined()
  })
})

describe('a change of motion, blended as the game blends it', () => {
  const still: ActionCommand[] = [{ tag: 8, ms: 2000 }] as ActionCommand[]

  it('holds the new motion still while the one left fades over 200 ms', () => {
    const run = startAction(still, CONTEXT, stage(6), TIMINGS)
    const hero = run.fighters.get(0)
    run.hooks.setMotion(0, 'run', 0x10)
    expect(hero?.blend).toMatchObject({ from: 'stand', weight: 1, left: BLEND_MS })
    passes(run, 6)
    expect(hero?.motionAt).toBe(0)
    expect(hero?.blend?.weight).toBeLessThan(1)
    expect(hero?.blend?.weight).toBeGreaterThan(0)
    passes(run, 12)
    expect(hero?.blend).toBeUndefined()
    expect(hero?.motionAt).toBeGreaterThan(0)
  })

  it('blends nothing without flag 0x10, and cuts one short on a second', () => {
    const run = startAction(still, CONTEXT, stage(6), TIMINGS)
    const hero = run.fighters.get(0)
    run.hooks.setMotion(0, 'run', 1)
    expect(hero?.blend).toBeUndefined()
    run.hooks.setMotion(0, 'guard', 0x10)
    run.hooks.setMotion(0, 'stand', 0x10)
    expect(hero?.blend).toBeUndefined()
  })

  it('leaves the motion playing alone unless flag 8 restarts it', () => {
    const run = startAction(still, CONTEXT, stage(6), TIMINGS)
    const hero = run.fighters.get(0)
    run.hooks.setMotion(0, 'magic', 1)
    passes(run, 6)
    const at = hero?.motionAt ?? 0
    run.hooks.setMotion(0, 'magic', 1)
    expect(hero?.motionAt).toBe(at)
    run.hooks.setMotion(0, 'magic', 9)
    expect(hero?.motionAt).toBe(0)
  })

  it('never blends a scripted motion in: tag 3 cuts any blend', () => {
    const run = startAction(
      [{ tag: 3, who: 7, name: 'attack1a', flags: 1, fx: 0 }] as ActionCommand[],
      CONTEXT,
      [
        {
          ...(stage(6)[0] as StageFighter),
          blend: { from: 'run', at: 0, loops: true, weight: 1, left: 200 },
        },
        stage(6)[1] as StageFighter,
      ],
      TIMINGS,
    )
    run.pass(PASS_MS)
    expect(run.fighters.get(0)).toMatchObject({ motion: 'attack1a', blend: undefined })
  })
})
