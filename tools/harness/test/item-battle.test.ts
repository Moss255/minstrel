import { readFileSync } from 'node:fs'
import { readItemBattleParams, weaponElement } from '@minstrel/game-formats'
import { readNitroFs } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * `itembtlprm.nat` on a real cartridge: the weapons' killer bonuses by family
 * and their elements, as the party's damage forecast reads them
 * (`func_ov024_021fa7ec`; `docs/readings/T17-ai.md` §2b).
 *
 * Local-only: skipped without a dump, and the assertions are about the
 * file's shape — counts and ranges — not its contents.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)(
  'equipment battle parameters on a real cartridge',
  { timeout: 60_000 },
  () => {
    it('holds ten — no bonus — for every family on most records, and a little more on a few', () => {
      const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
      const records = readItemBattleParams(fs.read('/data/prm/itembtlprm.nat'))
      const none = records.filter((r) => r.familyTenths.every((t) => t === 10))
      const empty = records.filter((r) => r.familyTenths.every((t) => t === 0))
      const bonus = records.filter((r) => r.familyTenths.some((t) => t > 10))
      expect(none).toHaveLength(928)
      expect(empty).toHaveLength(245)
      expect(none.length + empty.length + bonus.length).toBe(records.length)
      // A bonus is a tenth or two over whole, never a cut, on the records seen.
      const values = new Set(bonus.flatMap((r) => r.familyTenths))
      expect([...values].every((t) => t >= 10 && t <= 20)).toBe(true)
      // 23 weapons carry an element, 1 to 5; the rest the plain Attack's.
      const elemental = records.filter((r) => weaponElement(r.flags) !== 8)
      expect(elemental).toHaveLength(23)
      expect(new Set(elemental.map((r) => weaponElement(r.flags)))).toEqual(
        new Set([1, 2, 3, 4, 5]),
      )
    })
  },
)
