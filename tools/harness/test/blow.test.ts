import { readFileSync } from 'node:fs'
import { type Action, readActions } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { beforeAll, describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * What an action's record says about how a blow with it is resolved — three
 * fields read from the code that reads them (`docs/conformance.md`, "The
 * resolver of a blow"), and held here to the cartridge: a reading of a flag is
 * only as good as the actions that turn out to carry it.
 */
describe.skipIf(!romPath)('how a blow is resolved, on a real cartridge', () => {
  const byId = new Map<number, Action>()

  beforeAll(() => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    for (const file of walkFiles(fs.root)) {
      if (!/actdt_[ab]\.gp2$/i.test(file.path)) continue
      const raw = fs.read(file)
      if (!isGpc(raw)) continue
      const gpc = readGpc(raw)
      for (const member of gpc.members) {
        if (!/actdt_[ab]_en\.nat$/i.test(member.name)) continue
        const stored = gpc.read(member)
        for (const action of readActions(isLz10(stored) ? decompressLz10(stored) : stored)) {
          if (!byId.has(action.id)) byId.set(action.id, action)
        }
      }
    }
  })

  it('lets the plain attack be dodged and blocked, at the whole critical chance', () => {
    const attack = byId.get(1)
    expect(attack).toMatchObject({ evadable: true, blockable: true, alwaysCritical: false })
    // A hundred hundredths: the two in a hundred stands as it is.
    expect(attack?.criticalPercent).toBe(100)
  })

  it('lets nobody dodge a herb, or a monster running away', () => {
    expect(byId.get(236)).toMatchObject({ evadable: false, blockable: false })
    expect(byId.get(225)).toMatchObject({ evadable: false, blockable: false })
  })

  it('makes a sure critical of eighteen blows, the two the block roll singles out among them', () => {
    // The critical roll hands back 1 without a draw when `+0x08` bit 29 is set.
    // `func_ov000_02156e30` names 0xF4 and 0xF5, and both carry it.
    const sure = [...byId.values()].filter((a) => a.alwaysCritical)
    expect(sure.length).toBe(18)
    expect(sure.map((a) => a.id)).toEqual(expect.arrayContaining([244, 245]))
    // **The cartridge names the witness**: the skill whose whole point is a
    // critical that cannot fail is one of them.
    expect(sure.find((a) => a.id === 505)?.name).toBe('Critical Claim')
    // Fifteen of the rest are a second copy of each attacking spell, Frizz to
    // Kaboom — INFERRED: the spell as it is when it goes haywire.
    expect(sure.filter((a) => a.id >= 246 && a.id <= 467).map((a) => a.name)).toEqual(
      expect.arrayContaining(['Frizz', 'Crack', 'Kaboom']),
    )
  })

  it('has the counts the flags were read with', () => {
    const all = [...byId.values()]
    expect(all.length).toBe(681)
    expect(all.filter((a) => a.evadable).length).toBe(156)
    expect(all.filter((a) => a.blockable).length).toBe(162)
    // A blow that can be dodged and one that can be blocked are mostly the same blows.
    expect(all.filter((a) => a.evadable && a.blockable).length).toBe(130)
  })
})
