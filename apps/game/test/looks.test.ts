import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  type Appearance,
  FACES,
  faceOf,
  HAIR_COLOURS,
  HAIR_STYLES,
  HAIR_VARIANTS,
  HERO_APPEARANCE,
  hairColourOf,
  hairOf,
} from '../src/appearance.ts'
import { SEX } from '../src/equipment.ts'
import { type Loaded, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Every look a player could choose, against a real wardrobe.**
 *
 * `appearance.test.ts` proves the *names* are built the way the files are
 * named. This asks the question after it: whether every combination of the
 * knobs lands on a part that is actually there — which is what stops
 * character creation offering a choice that comes up bald.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed.
 */
describe.skipIf(!romPath)('every look a player could choose', { timeout: 120_000 }, () => {
  let loaded: Loaded
  let has: (name: string) => boolean

  beforeAll(() => {
    loaded = load(new Uint8Array(readFileSync(romPath as string)), { map: 'M01' })
    has = (name: string) => loaded.wardrobe.parts.has(name) || loaded.wardrobe.textures.has(name)
  }, 120_000)

  const look = (over: Partial<Appearance>): Appearance => ({ ...HERO_APPEARANCE, ...over })

  it('has all twenty-four faces', () => {
    for (let face = 0; face < FACES; face++) {
      expect(has(faceOf(look({ face }))), `face ${face}`).toBe(true)
    }
    // And no twenty-fifth, which is what fixes the count at 24 rather than
    // leaving it a number somebody chose.
    expect(has('p_f024')).toBe(false)
  })

  it('has every hair style in its first shape', () => {
    for (let hair = 0; hair < HAIR_STYLES; hair++) {
      expect(has(hairOf(look({ hair, hairVariant: 0 }))), `style ${hair}`).toBe(true)
    }
    expect(has('p_h240a')).toBe(false)
  })

  it('gives every style’s shape and colour a part that is there', () => {
    // The fallbacks are the point: the high bands are not full, so a naive
    // reading would name files the cartridge has not got. Nothing this
    // offers should miss.
    let fellBack = 0
    for (let hair = 0; hair < HAIR_STYLES; hair++) {
      for (let hairVariant = 0; hairVariant < HAIR_VARIANTS.length; hairVariant++) {
        const name = hairOf(look({ hair, hairVariant }), has)
        expect(has(name), `style ${hair} shape ${hairVariant}`).toBe(true)
        if (name !== hairOf(look({ hair, hairVariant }))) fellBack++
      }
      for (let hairColour = 0; hairColour < HAIR_COLOURS; hairColour++) {
        const name = hairColourOf(look({ hair, hairColour }), has)
        expect(has(name), `style ${hair} colour ${hairColour}`).toBe(true)
        if (name !== hairColourOf(look({ hair, hairColour }))) fellBack++
      }
    }
    // **How many fall back is worth pinning**, because it says how much of
    // the choice is real: 120 shapes and 240 colours are offered, and 33 of
    // those 360 are the band's own because the cartridge has no file for that
    // corner — the high styles' bands being the short ones.
    expect(fellBack).toBe(33)
  })

  it('reads the build table off this cartridge', () => {
    expect(loaded.buildTable).toBeDefined()
    expect(loaded.buildTable?.builds).toHaveLength(10)
  })

  it('leaves the Hero looking as the slice has them', () => {
    // The look this defaults to must be the one the slice already drew, or
    // every existing screenshot changes underneath us.
    expect(faceOf(HERO_APPEARANCE)).toBe('p_f006')
    expect(hairOf(HERO_APPEARANCE, has)).toBe('p_h000a')
    expect(hairColourOf(HERO_APPEARANCE, has)).toBe('p_h000a')
    expect(HERO_APPEARANCE.sex).toBe(SEX.male)
  })
})
