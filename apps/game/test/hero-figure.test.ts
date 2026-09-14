import { readFileSync } from 'node:fs'
import { textureFor } from '@minstrel/cartridge'
import { describe, expect, it } from 'vitest'
import { HERO_FACE, HERO_HAIR, heroOutfit } from '../src/hero.ts'
import { load } from '../src/load.ts'

describe("the Hero's outfit", () => {
  it('is the celestial suit, stockings and shoes, part by part, with the arms of the suit', () => {
    expect(heroOutfit()).toEqual({
      body: 'p_b007',
      legs: 'p_p215',
      face: HERO_FACE,
      hair: HERO_HAIR.model,
      textures: ['p_a007', 'p_r120', HERO_HAIR.colour],
    })
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the Hero, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('is drawn in the parts the outfit names, dressed from its own texture files', () => {
    const here = load(rom, { map: 'M01M10' })
    const [body, legs] = here.figure.rigged
    if (!body || !legs) throw new Error('the Hero has no body or legs')
    // A body names its arms' material after its own number, and legs their own.
    const arms = body.materials.find((material) => material.name === 'p_a007_00')
    expect(arms).toBeDefined()
    expect(legs.materials.map((material) => material.name)).toContain('p_p215_00')
    // Face and hair, hung from the head.
    expect(here.figure.attachments.map((attached) => attached.bone)).toEqual(['head', 'head'])

    // The arms, shoes and hair colour come from the files the outfit names.
    for (const name of ['p_a000_00', 'p_r000_00', 'p_h000a_00']) {
      expect(here.figure.textures.get(name), name).toBeDefined()
    }
    const drawn = arms && textureFor(here.catalogue, arms, here.figure.textures)
    expect(drawn?.pixels.length).toBe((drawn?.width ?? 0) * (drawn?.height ?? 0) * 4)
  })
})
