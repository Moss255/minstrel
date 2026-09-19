import { readFileSync } from 'node:fs'
import { textureFor } from '@minstrel/cartridge'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { shadowPieces } from '../src/shadows.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * The round shadow is a **white** blob on a material whose diffuse is black,
 * and the polygon is drawn in that diffuse with the texture modulating it. Read
 * without the material's colour it is a pale disc under everyone, which is what
 * it was until the diffuse was read — see `ModelMaterial.diffuse`.
 */
describe.skipIf(!romPath)('the round shadow on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('is a white texture drawn black', () => {
    const room = load(rom, { map: 'M01' })
    const model = room.shadow
    expect(model, 'no shadow model in the icon archive').toBeDefined()
    const shadow = model as NonNullable<typeof model>

    const material = shadow.materials[0]
    expect(material?.texture).toBe('shadow')
    // The material says black, and says to take the vertex colour from it.
    expect(material?.diffuse).toEqual([0, 0, 0])
    expect(material?.setVertexColour).toBe(true)

    const pieces = shadowPieces(shadow, [{ x: 0, y: 0, z: 0 }], (m) =>
      textureFor(room.catalogue, m),
    )
    expect(pieces.length).toBeGreaterThan(0)
    const piece = pieces[0] as (typeof pieces)[number]
    expect(piece.tint, 'the tint must reach the piece, or it draws white').toEqual([0, 0, 0])

    // And the texture itself is white throughout, its alpha doing the shape.
    const pixels = piece.pixels as Uint8Array
    expect(pixels).toBeDefined()
    let alphas = 0
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255)
      expect(pixels[i + 1]).toBe(255)
      expect(pixels[i + 2]).toBe(255)
      if ((pixels[i + 3] as number) > 0) alphas++
    }
    // A soft disc: most of the square carries some alpha, none of it is opaque.
    expect(alphas).toBeGreaterThan(100)
    expect(Math.max(...[...pixels].filter((_, i) => i % 4 === 3))).toBeLessThan(255)
  })
})
