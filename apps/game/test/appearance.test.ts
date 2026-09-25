import type { BuildTable } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  type Appearance,
  buildOf,
  CREATION_ORDER,
  CREATION_SETTINGS,
  EYES,
  FACES,
  faceOf,
  HAIR_COLOURS,
  HAIR_STYLES,
  HAIR_VARIANTS,
  HERO_APPEARANCE,
  hairColourOf,
  hairOf,
  KNOB_SETTINGS,
  type Making,
  makingPick,
  makingRows,
  makingTitle,
  SKINS,
  scaleOf,
  setKnob,
  startMaking,
  turned,
} from '../src/appearance.ts'
import { SEX } from '../src/equipment.ts'

/**
 * What a character looks like — see `apps/game/src/appearance.ts`.
 *
 * The part names this makes are held to a real wardrobe by
 * `apps/game/test/looks.test.ts`; this is about the knobs themselves.
 */

const look = (over: Partial<Appearance> = {}): Appearance => ({ ...HERO_APPEARANCE, ...over })

/** Ten pairs, the two sexes' rows differing, as the cartridge's do. */
const TABLE: BuildTable = {
  offset: 0,
  builds: [
    { height: 3768, width: 4255 },
    { height: 3637, width: 4136 },
    { height: 3850, width: 4014 },
    { height: 4132, width: 3891 },
    { height: 3870, width: 3764 },
    { height: 3768, width: 4177 },
    { height: 3641, width: 4091 },
    { height: 3809, width: 3973 },
    { height: 4132, width: 3891 },
    { height: 3768, width: 3764 },
  ],
}

describe('turning a knob', () => {
  it('goes round rather than off the end', () => {
    expect(turned(look({ face: FACES - 1 }), 'face', 1).face).toBe(0)
    expect(turned(look({ face: 0 }), 'face', -1).face).toBe(FACES - 1)
    expect(turned(look({ sex: SEX.male }), 'sex', 1).sex).toBe(SEX.female)
    expect(turned(look({ sex: SEX.female }), 'sex', 1).sex).toBe(SEX.male)
  })

  it('knows how many of each there are', () => {
    const counts: [keyof Appearance, number][] = [
      ['face', FACES],
      ['hair', HAIR_STYLES],
      ['hairVariant', HAIR_VARIANTS.length],
      ['hairColour', HAIR_COLOURS],
      ['skin', SKINS],
      ['eyes', EYES],
    ]
    for (const [knob, count] of counts) {
      expect(turned(look({ [knob]: count - 1 }), knob, 1)[knob], knob).toBe(0)
    }
  })

  it('changes one knob and leaves the rest alone', () => {
    const before = look({ hair: 3, face: 9, skin: 2 })
    const after = turned(before, 'hair', 1)
    expect(after).toEqual({ ...before, hair: 4 })
  })
})

describe('the parts a look names', () => {
  it('names a face by its number', () => {
    expect(faceOf(look({ face: 6 }))).toBe('p_f006')
    expect(faceOf(look({ face: 23 }))).toBe('p_f023')
  })

  it('names hair as a style, a shape and a colour', () => {
    // **The style's model number is ten times the style**, because a style
    // owns a band of ten and the colours are the band's texture files.
    expect(hairOf(look({ hair: 0, hairVariant: 0 }))).toBe('p_h000a')
    expect(hairOf(look({ hair: 7, hairVariant: 2 }))).toBe('p_h070c')
    expect(hairOf(look({ hair: 23, hairVariant: 4 }))).toBe('p_h230e')
    expect(hairColourOf(look({ hair: 7, hairColour: 3 }))).toBe('p_h073a')
    expect(hairColourOf(look({ hair: 0, hairColour: 0 }))).toBe('p_h000a')
  })

  it('falls back inside the band where the wardrobe is short', () => {
    // The high styles' bands are not full — 210, 216, 220 and a few more,
    // not 211 to 215. A colour with no file becomes the style's own rather
    // than a name nothing will load.
    const has = (name: string) => name === 'p_h210a' || name === 'p_h230a'
    expect(hairColourOf(look({ hair: 21, hairColour: 4 }), has)).toBe('p_h210a')
    // And a variant a style has not got becomes its first.
    expect(hairOf(look({ hair: 23, hairVariant: 4 }), has)).toBe('p_h230a')
    // Where the wardrobe does have it, it is used.
    expect(hairOf(look({ hair: 23, hairVariant: 4 }), () => true)).toBe('p_h230e')
  })
})

describe('the build', () => {
  it('picks from the sex’s own row of five', () => {
    expect(buildOf(look({ sex: SEX.male, build: 0 }), TABLE)).toEqual({ height: 3768, width: 4255 })
    expect(buildOf(look({ sex: SEX.female, build: 0 }), TABLE)).toEqual({
      height: 3768,
      width: 4177,
    })
  })

  it('is nothing where the table did not read, which leaves the figure alone', () => {
    expect(buildOf(look(), undefined)).toBeUndefined()
    expect(scaleOf(undefined)).toEqual({ height: 1, width: 1 })
  })

  it('scales in fx16’s 4096ths', () => {
    const scale = scaleOf(buildOf(look({ sex: SEX.male, build: 0 }), TABLE))
    expect(scale.height).toBeCloseTo(3768 / 4096, 5)
    expect(scale.width).toBeCloseTo(4255 / 4096, 5)
  })

  it('moves with the sex, because the row does', () => {
    const male = scaleOf(buildOf(look({ sex: SEX.male, build: 4 }), TABLE))
    const female = scaleOf(buildOf(look({ sex: SEX.female, build: 4 }), TABLE))
    expect(male.height).not.toBeCloseTo(female.height, 5)
  })
})

describe('what the creation screens offer', () => {
  it('asks in overlay 9’s own order', () => {
    // sex → figure → hair → hair colour → face → skin colour → eye colour,
    // which is its thirteen-step table; the name is asked after and is not
    // built. `build` is the game's "figure".
    expect(CREATION_ORDER).toEqual(['sex', 'build', 'hair', 'hairColour', 'face', 'skin', 'eyes'])
  })

  it('offers what the grids offer, which is not always the field’s range', () => {
    // **Two of them differ**, and that is the point of having both tables:
    // the cartridge has 24 hair styles and the screen offers ten; the
    // eye-colour field is four bits and the screen is a 4×2 grid of eight.
    expect(CREATION_SETTINGS.hair).toBe(10)
    expect(KNOB_SETTINGS.hair).toBe(HAIR_STYLES)
    expect(CREATION_SETTINGS.eyes).toBe(8)
    expect(KNOB_SETTINGS.eyes).toBe(EYES)
    // And where they agree, they agree.
    for (const knob of ['sex', 'build', 'hairColour', 'skin'] as const) {
      expect(CREATION_SETTINGS[knob], knob).toBe(KNOB_SETTINGS[knob])
    }
  })

  it('never offers a setting the field cannot hold', () => {
    for (const knob of CREATION_ORDER) {
      expect(CREATION_SETTINGS[knob], knob).toBeLessThanOrEqual(KNOB_SETTINGS[knob])
    }
  })
})

describe('setting a knob outright', () => {
  it('is what choosing a grid cell does, and wraps what is out of range', () => {
    expect(setKnob(look(), 'face', 11).face).toBe(11)
    expect(setKnob(look(), 'face', FACES).face).toBe(0)
    expect(setKnob(look(), 'face', -1).face).toBe(FACES - 1)
  })
})

describe('the Hero’s own look', () => {
  it('is the face and hair the slice fixed, and the shared build', () => {
    // `p_f006` is `HERO_FACE` and `p_h000a` is `HERO_HAIR` — the choices the
    // slice made because it cuts the prologue that would ask.
    expect(faceOf(HERO_APPEARANCE)).toBe('p_f006')
    expect(hairOf(HERO_APPEARANCE)).toBe('p_h000a')
    // Build 3 is the one both sexes share, so it says nothing about them.
    expect(buildOf(HERO_APPEARANCE, TABLE)).toEqual(
      buildOf({ ...HERO_APPEARANCE, sex: SEX.female }, TABLE),
    )
  })
})

/**
 * The creation walk, which both the Hero's own screens and Patty's step 4
 * run — see `Making`. The walk is the thing tested here; who is being made
 * is the caller's business.
 */
describe('the creation walk', () => {
  const walk = (answers: readonly number[]) => {
    let making: Making = startMaking()
    const seen: string[] = []
    for (const answer of answers) {
      seen.push(makingTitle(making))
      const picked = makingPick(making, answer)
      if ('made' in picked) return { seen, made: picked.made }
      making = picked.next
    }
    return { seen, made: undefined }
  }

  it("asks one knob a screen, in the game's order", () => {
    const { seen } = walk(CREATION_ORDER.map(() => 0))
    expect(seen).toHaveLength(CREATION_ORDER.length)
    expect(seen[0]).toBe('Gender — 1 of 7')
    expect(seen.at(-1)).toBe(`Eye Colour — ${CREATION_ORDER.length} of ${CREATION_ORDER.length}`)
  })

  it('offers exactly what the screen offers, not what the field holds', () => {
    let making: Making = startMaking()
    for (const knob of CREATION_ORDER) {
      expect(makingRows(making)).toHaveLength(CREATION_SETTINGS[knob])
      const picked = makingPick(making, 0)
      if ('next' in picked) making = picked.next
    }
    // The two that differ: the cartridge has more hair and more eye colours
    // than the screens put on offer.
    expect(CREATION_SETTINGS.hair).toBeLessThan(KNOB_SETTINGS.hair)
    expect(CREATION_SETTINGS.eyes).toBeLessThan(KNOB_SETTINGS.eyes)
  })

  it('names the part a choice names, and counts where there is no part', () => {
    const rows = makingRows(startMaking())
    expect(rows).toEqual(['Male', 'Female'])
    const face = { look: HERO_APPEARANCE, at: CREATION_ORDER.indexOf('face') }
    expect(makingRows(face)[0]).toBe('p_f000')
    const skin = { look: HERO_APPEARANCE, at: CREATION_ORDER.indexOf('skin') }
    expect(makingRows(skin)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('keeps every answer, and is done after the last', () => {
    const answers = [1, 2, 3, 4, 5, 6, 7]
    const { made } = walk(answers)
    expect(made).toBeDefined()
    for (const [at, knob] of CREATION_ORDER.entries()) {
      expect(made?.[knob]).toBe(answers[at])
    }
  })

  it('has nothing to ask past the last knob', () => {
    const past: Making = { look: HERO_APPEARANCE, at: CREATION_ORDER.length }
    expect(makingRows(past)).toEqual([])
    expect(makingTitle(past)).toBe('Nothing is being made.')
    expect(makingPick(past, 0)).toEqual({ made: HERO_APPEARANCE })
  })
})
