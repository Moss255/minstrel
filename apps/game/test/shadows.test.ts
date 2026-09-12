import { readFileSync } from 'node:fs'
import { measureBounds } from '@minstrel/nitro-gfx'
import { WORLD_SCALE } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { shadowPieces } from '../src/shadows.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)(
  'the shadow under characters, on a real cartridge',
  { timeout: 60_000 },
  () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

    it('reads a flat square, and lies one centred under each pair of feet', () => {
      const room = load(rom, { map: 'M01M07' })
      const shadow = room.shadow
      if (!shadow) throw new Error('no shadow model')
      const feet = [
        { x: 1, y: 0.5, z: -2 },
        { x: -3, y: 0, z: 4 },
      ]
      const pieces = shadowPieces(shadow, feet, () => undefined)
      expect(pieces).toHaveLength(feet.length * shadow.shapes.length)
      for (const [i, at] of feet.entries()) {
        const box = measureBounds(
          pieces
            .slice(i * shadow.shapes.length, (i + 1) * shadow.shapes.length)
            .map((p) => p.geometry),
        )
        expect((box.minX + box.maxX) / 2).toBeCloseTo(at.x, 6)
        expect((box.minZ + box.maxZ) / 2).toBeCloseTo(at.z, 6)
        // Flat, just above the ground, and 1.13 of the files' units across.
        expect(box.maxY - box.minY).toBeCloseTo(0, 6)
        expect(box.minY).toBeGreaterThan(at.y)
        expect(box.minY - at.y).toBeLessThan(0.01)
        expect((box.maxX - box.minX) / WORLD_SCALE).toBeCloseTo(1.125, 2)
      }
    })

    it('opens the opening background from the archive that holds its models', () => {
      const opening = load(rom, { map: 'M01M12' })
      expect(opening.archive.endsWith('.amdj')).toBe(true)
      expect(opening.map.pieces.length).toBeGreaterThan(0)
    })
  },
)
