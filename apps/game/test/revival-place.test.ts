import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { afterBattle, mapStart, readTriggers } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Where a party wiped out comes round**, on the cartridge — read 6 October
 * 2026, `docs/readings/T12-travel.md`: at the map's start point, its
 * `.bmbl`'s `0x6E` (`func_0201d494`), and in the map a set battle's `180`
 * names when it has one.
 */
describe.skipIf(!romPath)('where a wiped-out party comes round', () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("stands them at the church's start point", () => {
    const starts = new Map<string, ReturnType<typeof mapStart>>()
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/map/' })) {
      if (!leaf.path.endsWith('.bmbl')) continue
      starts.set(leaf.path, mapStart(leaf.bytes))
    }
    // One on every `.bmbl`.
    expect(starts.size).toBe(667)
    expect([...starts.values()].every((s) => s !== undefined)).toBe(true)
    // Angel Falls' church, the new game's revival map, 1106.
    const church = starts.get('/data/map/M01M06.ambl/M01M0600.bmbl')
    expect(church?.x).toBe(0)
    expect(church?.y).toBeCloseTo(0.15, 4)
    expect(church?.z).toBeCloseTo(-2.64, 4)
    expect(church?.facing).toBeCloseTo(3.14, 2)
  })

  it('wakes the Magmaroo’s and Gortress’s losers where their 180 says', () => {
    const triggers = (area: string) => {
      for (const leaf of scanCartridge(rom, { pathFilter: `/data/scenario/trigger${area}.bin` }))
        return readTriggers(leaf.bytes)
      return []
    }
    // Battle 14 lost on the Magmaroo's summit: Upover's church, 2309.
    expect(afterBattle(triggers('D16'), 14, false, 8612)?.revival).toBe(2309)
    // Battle 16 lost in Gortress: its exterior, 5700.
    expect(afterBattle(triggers('S07'), 16, false, 5704)?.revival).toBe(5700)
  })
})
