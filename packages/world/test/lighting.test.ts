import { describe, expect, it } from 'vitest'
import { lightingOf } from '../src/assemble.ts'

/**
 * A map ships its lit pieces twice, once for day and once for night, and the
 * suffix on the resource stem is what says which. Building both draws a village
 * whose windows are lit and unlit at the same time.
 */
describe('lightingOf', () => {
  it("reads the village's two copies", () => {
    expect(lightingOf('M01M00L1')).toBe('day')
    expect(lightingOf('M01M00N1')).toBe('night')
  })

  it('reads every suffix the cartridge uses', () => {
    // L1..L6 and N1..N6 appear; L1 and N1 are much the commonest.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(lightingOf(`C01M00L${n}`), `L${n}`).toBe('day')
      expect(lightingOf(`C01M00N${n}`), `N${n}`).toBe('night')
    }
  })

  it('is case-insensitive, because the manifest and the archive disagree', () => {
    expect(lightingOf('m01m00n1')).toBe('night')
    expect(lightingOf('m01m00l1')).toBe('day')
  })

  it('leaves a piece with no suffix in both', () => {
    // The terrain everything stands on, the doorways, the water.
    expect(lightingOf('M01M0000')).toBeUndefined()
    expect(lightingOf('M01M0003')).toBeUndefined()
    expect(lightingOf('M01A0000')).toBeUndefined()
  })

  it('does not mistake the other lettered suffixes for a lighting', () => {
    // `D` is a doorway, `E` and `S` are other things again, and a map that lost
    // its doorways to a lighting filter would have ten sealed buildings.
    expect(lightingOf('M01M00D1')).toBeUndefined()
    expect(lightingOf('M01M00DA')).toBeUndefined()
    expect(lightingOf('M01M00E1')).toBeUndefined()
    expect(lightingOf('M01A00S1')).toBeUndefined()
  })

  it('needs the digit, not just the letter', () => {
    expect(lightingOf('SOMETHINGN')).toBeUndefined()
    expect(lightingOf('L')).toBeUndefined()
  })
})
