import { describe, expect, it } from 'vitest'
import type { Slot } from '../src/equipment.ts'
import { BACK_TURNS, outfitOf, STARTING_EQUIPMENT } from '../src/hero.ts'

/** Every part and texture file there is, as far as these tests ask. */
const everything = () => true

describe('what the Hero is drawn wearing', () => {
  it('is the starting kit, with the sword on the back, turned to lie across it', () => {
    const outfit = outfitOf(STARTING_EQUIPMENT, 'back', everything)
    expect(outfit).toMatchObject({ body: 'p_b007', legs: 'p_p215' })
    // The suit's own arms and the shoes, as textures.
    expect(outfit.textures).toEqual(expect.arrayContaining(['p_a007', 'p_r120']))
    expect(outfit.attached).toEqual([{ part: 'p_w004', bone: 'usiro', turn: BACK_TURNS.weapon }])
  })

  it('holds the weapon and the shield in the hands, as they are modelled', () => {
    const worn = new Map<Slot, number>([...STARTING_EQUIPMENT, ['shield', 21296]])
    expect(outfitOf(worn, 'hands', everything).attached).toEqual([
      { part: 'p_w004', bone: 'arm1R' },
      { part: 'p_s296', bone: 'arm1L' },
    ])
  })

  it('draws gloves and headgear when they are worn, and nothing for an accessory', () => {
    const worn = new Map<Slot, number>([
      ...STARTING_EQUIPMENT,
      ['arms', 15000],
      ['head', 12001],
      ['accessory', 24001],
    ])
    const outfit = outfitOf(worn, 'back', everything)
    expect(outfit.textures).toContain('p_g000')
    expect(outfit.textures).not.toContain('p_a007')
    expect(outfit.headgear).toBe('p_m001')
  })

  it('shows the underclothes in an empty slot, and leaves out a part the cartridge lacks', () => {
    const worn = new Map<Slot, number>([['weapon', 20004]])
    const outfit = outfitOf(worn, 'hands', (name) => name !== 'p_w004')
    expect(outfit).toMatchObject({ body: 'p_b090', legs: 'p_p090' })
    expect(outfit.textures).toContain('p_r090')
    expect(outfit.attached).toEqual([])
  })

  it('keeps the starting piece where the cartridge has no underclothes', () => {
    const worn = new Map<Slot, number>()
    const outfit = outfitOf(worn, 'hands', (name) => !/090$/.test(name))
    expect(outfit).toMatchObject({ body: 'p_b007', legs: 'p_p215' })
    expect(outfit.textures).toContain('p_r120')
  })
})
