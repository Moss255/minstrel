import { readFileSync } from 'node:fs'
import { fixedShotFor, readFixedShots } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { overlayOf } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('overlay 26’s fixed shots on the cartridge', () => {
  it('are 47: the hexagoon’s first, key 0 once, Corvus’s last form’s three at the end', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const code = overlayOf(rom, 26)
    expect(code).toBeDefined()
    const shots = readFixedShots(code as Uint8Array)
    expect(shots).toHaveLength(47)
    expect(shots[0]?.key).toBe(0x101)
    expect(shots.filter((s) => s.key === 0)).toHaveLength(1)
    expect(shots.slice(-3).map((s) => s.key)).toEqual([0x115, 0x115, 0x115])
    // The hexagoon's: the eye at (0, 1.06, 2.27) looking at (0, 1.08, 0).
    const hex = fixedShotFor(shots, [0x101], 300, 0)
    expect(hex?.eye.map((v) => Math.round((v / 4096) * 100) / 100)).toEqual([0, 1.06, 2.27])
    expect(hex?.look.map((v) => Math.round((v / 4096) * 100) / 100)).toEqual([0, 1.08, 0])
  })
})
