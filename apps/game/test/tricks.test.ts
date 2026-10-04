import { describe, expect, it } from 'vitest'
import {
  type Performance,
  startPerformance,
  stepPerformance,
  type TrickMotions,
  trickPack,
  trickShape,
  tricksFor,
} from '../src/tricks.ts'

// Bow one motion of 1,000 ms; Sit three of 100, 200 and 300.
const motions = (trick: number): TrickMotions | undefined =>
  trick === 1
    ? { shape: 'once', ms: () => 1000 }
    : trick === 10
      ? { shape: 'inLoopOut', ms: (phase) => ({ in: 100, loop: 200, out: 300, sigusa: 0 })[phase] }
      : undefined

describe('a party trick, performed', () => {
  it('starts a slot’s trick, or Down’s four in order with the empty left out', () => {
    const slots = [12, 2, undefined, 10, undefined, 15, 1]
    expect(tricksFor(slots, 'up')).toEqual([12])
    expect(tricksFor(slots, 'left')).toEqual([2])
    expect(tricksFor(slots, 'right')).toEqual([])
    expect(tricksFor(slots, 'down')).toEqual([10, 15, 1])
    expect(trickPack(2, false)).toBe('chara/sg02m.chr')
    expect(trickPack(25, true)).toBe('chara/sg25w.chr')
  })

  it('plays what the motion table names: sigusa, or in, loop and out', () => {
    expect(trickShape(['sigusa'])).toBe('once')
    expect(trickShape(['in', 'loop', 'out'])).toBe('inLoopOut')
    expect(trickShape([])).toBeUndefined()
  })

  it('holds a lone trick’s loop until a button, and plays it once in a sequence', () => {
    const alone = startPerformance([10], 0, motions) as Performance
    let p: Performance | 'done' = stepPerformance(alone, 150, false, motions)
    expect(p).toMatchObject({ phase: 'loop', since: 150 })
    p = stepPerformance(p as Performance, 5000, false, motions)
    expect(p).toMatchObject({ phase: 'loop' })
    p = stepPerformance(p as Performance, 5001, true, motions)
    expect(p).toMatchObject({ phase: 'out' })
    expect(stepPerformance(p as Performance, 5400, false, motions)).toBe('done')

    let seq: Performance | 'done' = startPerformance([10, 1], 0, motions) as Performance
    for (const at of [100, 300, 600]) seq = stepPerformance(seq as Performance, at, false, motions)
    expect(seq).toMatchObject({ index: 1, phase: 'sigusa', since: 600 })
    expect(stepPerformance(seq as Performance, 1600, false, motions)).toBe('done')
  })

  it('passes over a trick whose pack will not read', () => {
    const p = startPerformance([1, 99], 0, motions) as Performance
    expect(stepPerformance(p, 1000, false, motions)).toBe('done')
  })
})
