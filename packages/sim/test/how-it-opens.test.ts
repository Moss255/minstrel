import { describe, expect, it } from 'vitest'
import { DropRng } from '../src/battle/drops.ts'
import { FACING_CONE, facingOff, howItOpens } from '../src/battle/opening.ts'

/**
 * How a fight opens — the game's `func_ov017_021970a0`. A generator that draws
 * a given number lets each arm be read off exactly.
 */
const drawing = (value: number) => ({ below: () => value }) as unknown as DropRng

describe('how a fight opens', () => {
  it('measures the cone the game measures: 49.48° either way', () => {
    expect((FACING_CONE * 180) / Math.PI).toBeCloseTo(49.48, 2)
  })

  it('works out how far one is from looking at the other', () => {
    const at = { x: 0, z: 0, facing: 0 }
    // Facing 0 looks towards +z, the Hero's own convention.
    expect(facingOff(at, { x: 0, z: 10 })).toBeCloseTo(0, 6)
    expect(facingOff(at, { x: 10, z: 0 })).toBeCloseTo(Math.PI / 2, 6)
    expect(facingOff(at, { x: 0, z: -10 })).toBeCloseTo(Math.PI, 6)
    expect(facingOff({ ...at, facing: Math.PI }, { x: 0, z: -10 })).toBeCloseTo(0, 6)
  })

  it('gives the party the round where the monster’s back was turned', () => {
    const met = { theirs: Math.PI, ours: 0, deftness: 20 }
    // 12 + 20/20 = 13 in a hundred.
    expect(howItOpens(drawing(12), met)).toBe('monstersSitOut')
    expect(howItOpens(drawing(13), met)).toBe('even')
  })

  it('never surprises the party where the monster’s back was turned', () => {
    const met = { theirs: Math.PI, ours: Math.PI, deftness: 999 }
    // The monster's turned back is looked at first, so this cannot be an ambush.
    expect(howItOpens(drawing(99), met)).toBe('even')
  })

  it('lets the monsters have the round where they came from behind, at twelve', () => {
    const met = { theirs: 0, ours: Math.PI, deftness: 999 }
    expect(howItOpens(drawing(11), met)).toBe('partySitsOut')
    expect(howItOpens(drawing(12), met)).toBe('even')
  })

  it('meeting face to face, two in a hundred either way, and deftness only for the party', () => {
    const met = { theirs: 0, ours: 0, deftness: 0 }
    expect(howItOpens(drawing(1), met)).toBe('monstersSitOut')
    // The first draw fails, the second lands: the party is surprised instead.
    const rng = { below: (() => { let n = 0; return () => (n++ === 0 ? 50 : 1) })() } as unknown as DropRng
    expect(howItOpens(rng, met)).toBe('partySitsOut')
    expect(howItOpens(drawing(50), met)).toBe('even')
  })

  it('climbs with deftness, face to face', () => {
    const met = { theirs: 0, ours: 0, deftness: 400 }
    // 2 + 400/20 = 22 in a hundred.
    expect(howItOpens(drawing(21), met)).toBe('monstersSitOut')
    expect(howItOpens(drawing(22), met)).not.toBe('monstersSitOut')
  })
})
