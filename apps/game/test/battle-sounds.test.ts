import { readFileSync } from 'node:fs'
import { effectOf } from '@minstrel/audio'
import { scanCartridge } from '@minstrel/cartridge'
import { readSdat } from '@minstrel/nitro-snd'
import { describe, expect, it } from 'vitest'

/**
 * The battle's sounds on a real cartridge: each number the action scripts and
 * the presenter ask of the battle's own archive, 101 of `se_btl.sdat`, is a
 * filled entry there (FORMAT.md, "The action scripts", "Sound"). Local-only:
 * skipped without a dump, and nothing it reads is committed.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the battle sounds on a real cartridge', { timeout: 120_000 }, () => {
  it('finds the swing, the hit, the start sounds, a death and the magic sound in archive 101', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const leaf = [...scanCartridge(rom, { pathFilter: '/data/sound/se_btl.sdat' })].find((l) =>
      l.path.toLowerCase().endsWith('se_btl.sdat'),
    )
    expect(leaf).toBeDefined()
    const sdat = readSdat(leaf?.bytes ?? new Uint8Array())
    // The Hero's swing and hit (`70 40`, `70 85`); the start sounds 7 and 8; the hit
    // sound 30 and the party's 31; a monster lying dead, 50; a magic motion's, 100.
    for (const sound of [40, 85, 7, 8, 30, 31, 50, 100]) {
      expect(effectOf(sdat, 101, sound), `sound ${sound}`).toBeDefined()
    }
  })
})
