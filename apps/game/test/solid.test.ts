import { FX32_ONE, fx32 } from '@minstrel/fixed'
import { type CharacterState, PERSON } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { standClear } from '../src/player.ts'

/** Reported from play: the Hero walked straight through a chest. */
const at = (x: number, z: number): CharacterState => ({
  x: fx32(Math.round(x * FX32_ONE)),
  y: fx32(0),
  z: fx32(Math.round(z * FX32_ONE)),
  fallSpeed: fx32(0),
  grounded: true,
})
const chest = { x: 0, z: 0, radius: Math.round(0.05 * FX32_ONE) }
const reach = chest.radius + PERSON.radius

describe('standing clear of a chest', () => {
  it('leaves someone outside it where they are', () => {
    const outside = at(1, 0)
    expect(standClear(outside, [chest])).toBe(outside)
  })

  it('puts someone who stepped into it back on its edge, the way they came in', () => {
    const cleared = standClear(at(0.03, 0), [chest])
    expect(cleared.x).toBe(reach)
    expect(cleared.z).toBe(0)
  })

  it('keeps them the same distance off along a slant', () => {
    const cleared = standClear(at(0.02, 0.02), [chest])
    expect(Math.hypot(cleared.x, cleared.z)).toBeCloseTo(reach, -1)
    expect(cleared.x).toBe(cleared.z)
  })

  it('comes out the same every time — whole fx32 steps', () => {
    const one = standClear(at(0.011, -0.027), [chest])
    const two = standClear(at(0.011, -0.027), [chest])
    expect(one).toEqual(two)
    expect(Number.isInteger(one.x) && Number.isInteger(one.z)).toBe(true)
  })
})
