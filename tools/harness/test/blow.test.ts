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

  it('names the two all-or-nothing blows the resolver flips a coin for', () => {
    // `func_ov024_021eb5d0` takes `NextRandomMax(2) == 0` in place of the
    // critical roll for actions 0x48 and 0x70, read before their names were.
    expect(byId.get(0x48)?.name).toBe('Thunder Thrust')
    expect(byId.get(0x70)?.name).toBe('Hatchet Man')
  })

  it('spoils only blows with the status that spoils sight', () => {
    const spoilt = [...byId.values()].filter((a) => a.spoiltBySight)
    expect(spoilt.length).toBe(110)
    // Every one can be dodged: it is blows this touches, never a spell or an item.
    expect(spoilt.every((a) => a.evadable)).toBe(true)
    expect(byId.get(1)?.spoiltBySight).toBe(true)
    for (const id of [30, 236, 246]) expect(byId.get(id)?.spoiltBySight).toBe(false)
  })

  it('leaves the plain attack’s accuracy at a hundred, so it lands and still spends its draw', () => {
    expect(byId.get(1)?.accuracyMode).not.toBe(1)
    expect([...byId.values()].filter((a) => a.accuracyMode === 1).length).toBe(202)
  })

  it('sends most damage through no handler, and each skill through its own', () => {
    const all = [...byId.values()]
    expect(all.filter((a) => a.damageHandler === 0).length).toBe(570)
    expect(byId.get(1)?.damageHandler).toBe(0)
    // The table has 67 slots, and no action names one past it.
    expect(Math.max(...all.map((a) => a.damageHandler))).toBeLessThan(67)
    // The cartridge names what the handlers are for.
    expect(all.filter((a) => a.damageHandler === 1).map((a) => a.name)).toEqual(['Dragon Slash'])
    expect(
      all
        .filter((a) => a.damageHandler === 45)
        .map((a) => a.name)
        .sort(),
    ).toEqual(['Hatchet Man', 'Thunder Thrust'])
  })

  it('sorts actions into kinds, and 1 is what does damage', () => {
    const all = [...byId.values()]
    // The only kind the final-damage function tests for, and the halving is its.
    expect(all.filter((a) => a.kind === 1).length).toBe(242)
    for (const id of [1, 9, 63]) expect(byId.get(id)?.kind).toBe(1) // Attack, Frizz, Dragon Slash
    // Defending is no kind at all, and what heals is another.
    expect(byId.get(3)?.kind).toBe(0)
    for (const id of [30, 236]) expect(byId.get(id)?.kind).toBe(2)
  })

  it('caps what a spell can deal by its rank, and the plain attack not at all', () => {
    expect(byId.get(1)?.damageCap).toBe(0)
    expect([9, 10, 11].map((id) => byId.get(id)?.damageCap)).toEqual([999, 1999, 2999]) // Frizz's three
    expect([30, 31, 32].map((id) => byId.get(id)?.damageCap)).toEqual([999, 1999, 2999]) // Heal's three
    expect([...byId.values()].filter((a) => a.damageCap > 0).length).toBe(211)
  })

  it('lets blows work on a metal body and spells not', () => {
    for (const id of [1, 63, 64]) expect(byId.get(id)?.worksOnMetal).toBe(true)
    for (const id of [9, 12, 18, 21, 67]) expect(byId.get(id)?.worksOnMetal).toBe(false)
    expect([...byId.values()].filter((a) => a.worksOnMetal).length).toBe(208)
  })

  it('names the actions the final-damage function singles out by number', () => {
    // 0x40 and 0x7E deal 1 or 2 to a metal body; 0x1B gets no 0-or-1; 0xAF
    // has a quarter of what it dealt kept — the recoil, by its name.
    expect([0x40, 0x7e, 0x1b, 0xaf].map((id) => byId.get(id)?.name)).toEqual([
      'Metal Slash',
      'Metalicker',
      'Kamikazee',
      'Double-Edged Slash',
    ])
  })

  it('scales the spells by might and the heals by mending, between what their records say', () => {
    // Read by `GetAttackBaseDamage`: bits 16–17 of `+0x18` at 2, a number
    // named at `+0x10`, and the two tens at the top of `+0x04`.
    for (const id of [9, 12, 18, 21]) {
      expect(byId.get(id), String(id)).toMatchObject({ amountScales: true, scalesBy: 'might' })
    }
    expect(byId.get(9)?.scaleRange).toEqual({ lo: 50, hi: 999 }) // Frizz
    expect(byId.get(16)?.scaleRange).toEqual({ lo: 100, hi: 999 }) // Crackle
    expect(byId.get(30)).toMatchObject({
      amountScales: true,
      scalesBy: 'mending',
      scaleRange: { lo: 50, hi: 999 },
    })
    // The herb names no number, so its amount is drawn between its least and
    // most — the same 35 — and then spread: two draws.
    expect(byId.get(236)?.scalesBy).toBeUndefined()
    // The plain Attack carries the 2 as well and **has no range**, so the game
    // never gets as far as looking: its damage is the blow's own.
    expect(byId.get(1)).toMatchObject({ amountScales: true, scalesBy: undefined, range: 0 })
  })

  it('rolls a spell’s critical at half the rate of a blow’s', () => {
    // 50 hundredths of `CalculateCritRate`'s two in a hundred: one in a
    // hundred to a deftness of 150, which is the reference's 100 in 10,000.
    for (const id of [9, 12, 18, 30]) expect(byId.get(id)?.criticalPercent).toBe(50)
    // And nothing at all on an item.
    expect(byId.get(236)?.criticalPercent).toBe(0)
  })

  it('gives a monster’s change of state the chance the reference found in play', () => {
    // `+0x14` bits 0–6, read by the accuracy roll for a monster using an action
    // whose accuracy scales. The reference has Kasap and Deceleratle at 75 and
    // Sweet Breath at 25, from play; these are them.
    const chance = (id: number) => byId.get(id)?.foeChance
    expect([44, 48, 228].map(chance)).toEqual([75, 75, 25])
    for (const id of [44, 48, 228]) expect(byId.get(id)?.accuracyMode, String(id)).toBe(1)
    // And two the reference has not, which ours had at Sweet Breath's 25.
    expect([53, 54].map(chance)).toEqual([37, 50]) // Snooze, Kasnooze
    // What raises lands every time: its accuracy does not scale.
    for (const id of [41, 42, 45, 46]) expect(byId.get(id)?.accuracyMode, String(id)).not.toBe(1)
    // A breath can be dodged and a spell cannot.
    expect(byId.get(228)?.evadable).toBe(true)
    expect(byId.get(44)?.evadable).toBe(false)
  })

  it('moves a level by what the record says', () => {
    const levels = (id: number) => byId.get(id)?.levels
    // Buff, Sap, Oomph, Blunt, Accelerate, Decelerate.
    expect([41, 43, 49, 50, 45, 47].map(levels)).toEqual([1, -1, 2, -2, 1, -1])
  })

  it('hangs a rider on the blows that have one, at its own chance', () => {
    const rider = (id: number) => [byId.get(id)?.rider, byId.get(id)?.foeChance]
    expect(byId.get(1)?.rider).toBe(0)
    // Poison: Toxic Dagger, and Venomissile at the reference's poison attack's 12.
    expect(rider(75)).toEqual([4, 50])
    expect(rider(295)).toEqual([4, 12])
    // Defence down a level: Helm Splitter.
    expect(rider(109)).toEqual([8, 75])
    expect(byId.get(109)?.riderLevels).toBe(-1)
    // None past the table's 22 slots.
    expect(Math.max(...[...byId.values()].map((a) => a.rider))).toBeLessThan(0x17)
  })

  it('has the reference’s poison attack poisoning 12 times in 100, in its own record', () => {
    // Action 275, unnamed: the rider that poisons, a level of it, at 12.
    expect(byId.get(275)).toMatchObject({ rider: 4, foeChance: 12, riderLevels: 1, kind: 1 })
  })

  it('names the element of what an action deals, and the element its landing is resisted by', () => {
    const deals = (id: number) => byId.get(id)?.element
    // The plain Attack 8; Frizz, Crack, Woosh, Bang 1 to 4; Zam 6.
    expect([1, 9, 12, 18, 21, 13].map(deals)).toEqual([8, 1, 2, 3, 4, 6])
    // The breaths are their spells' elements.
    expect([226, 267].map(deals)).toEqual([1, 2])
    const lands = (id: number) => byId.get(id)?.landingElement
    // Kasap, Deceleratle, Snooze, Sweet Breath, Poison Breath, Fuddle, Dazzle.
    expect([44, 48, 53, 228, 229, 51, 59].map(lands)).toEqual([19, 20, 10, 10, 16, 13, 9])
    // A blow with a rider is resisted by the rider's: Toxic Dagger's poison,
    // Helm Splitter's fall in defence.
    expect([75, 109].map(lands)).toEqual([16, 19])
  })
})
