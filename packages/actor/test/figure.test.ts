import type { Model, TextureSet } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'
import { dressFigure } from '../src/figure.ts'
import type { Library } from '../src/library.ts'

/**
 * Stand-ins for parts and texture files. Choosing a figure asks only which
 * part is which and what a file's textures are called, so a part here is a
 * name and a texture file a list of names; nothing is drawn.
 */
const part = (name: string) => ({ name }) as unknown as Model
const textureFile = (...names: string[]) =>
  ({ textures: names.map((name) => ({ name })) }) as unknown as TextureSet

function lib(): Library {
  return {
    parts: new Map(
      ['p_b007', 'p_p215', 'p_f006', 'p_h000a', 'p_m200'].map((name) => [name, part(name)]),
    ),
    textures: new Map([
      ['p_a007', textureFile('p_a000_00')],
      ['p_r120', textureFile('p_r000_00')],
      ['p_h000a', textureFile('p_h000a_00')],
    ]),
    motions: new Map(),
  }
}

describe('dressing a figure', () => {
  it('draws the body and legs on the rig, and hangs the face, hair and headgear from the head', () => {
    const library = lib()
    const figure = dressFigure(library, {
      body: 'p_b007',
      legs: 'p_p215',
      face: 'p_f006',
      hair: 'p_h000a',
      headgear: 'p_m200',
    })
    expect(figure.rigged).toEqual([library.parts.get('p_b007'), library.parts.get('p_p215')])
    expect(figure.attachments).toEqual([
      { model: library.parts.get('p_f006'), bone: 'head' },
      { model: library.parts.get('p_h000a'), bone: 'head' },
      { model: library.parts.get('p_m200'), bone: 'head' },
    ])
  })

  it('takes its texture files before any other texture of the same name', () => {
    const library = lib()
    const figure = dressFigure(library, {
      body: 'p_b007',
      legs: 'p_p215',
      textures: ['p_a007', 'p_r120', 'p_h000a'],
    })
    expect(figure.textures.get('p_a000_00')).toEqual({
      set: library.textures.get('p_a007'),
      name: 'p_a000_00',
    })
    expect(figure.textures.get('p_r000_00')?.set).toBe(library.textures.get('p_r120'))
    expect(figure.textures.get('p_h000a_00')?.set).toBe(library.textures.get('p_h000a'))
    expect(figure.attachments).toEqual([])
  })

  it('refuses a part or a texture file the cartridge does not have, naming it', () => {
    expect(() => dressFigure(lib(), { body: 'p_b999', legs: 'p_p215' })).toThrow(/p_b999/)
    expect(() => dressFigure(lib(), { body: 'p_b007', legs: 'p_p215', face: 'p_f099' })).toThrow(
      /p_f099/,
    )
    expect(() =>
      dressFigure(lib(), { body: 'p_b007', legs: 'p_p215', textures: ['p_a999'] }),
    ).toThrow(/p_a999/)
  })
})
