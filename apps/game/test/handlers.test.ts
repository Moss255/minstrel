import { readFileSync } from 'node:fs'
import { ActionEffect, ActionReach } from '@minstrel/game-formats'
import { SKILL_SCALES } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { battleSpellOf, blowOf, partyChangeOf } from '../src/battle-scene.ts'
import { type Loaded, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Task 18 on the cartridge** — how the battle plays every action the 26
 * skill trees teach and every spell the six starting vocations learn
 * (`docs/readings/T18-handlers.md`). Before the task, 76 of them were struck
 * as the Attack.
 */
describe.skipIf(!romPath)(
  'the abilities’ and spells’ handlers, on a real cartridge',
  { timeout: 120_000 },
  () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
    const here = romPath ? load(rom, { map: 'M01M07' }) : (undefined as unknown as Loaded)
    const action = (id: number) => {
      const a = here.actions.get(id)
      if (!a) throw new Error(`no action ${id}`)
      return a
    }

    it('plays Sap as a fall of defence, landing by the party’s might between 75 and 100', () => {
      expect(partyChangeOf(action(43))).toMatchObject({
        change: { kind: 'defence', by: -1 },
        side: 'other',
        reach: 'one',
        element: 19,
        accuracy: { min: 75, max: 100, scales: { by: 'might' } },
      })
      expect(partyChangeOf(action(49))?.change).toEqual({ kind: 'attack', by: 2, chance: 100 })
      expect(partyChangeOf(action(46))).toMatchObject({
        change: { kind: 'agility' },
        reach: 'group',
      })
    })

    it('raises with Zing by its own lo and hi, 180 and 849, and Kazing with a half', () => {
      expect(partyChangeOf(action(38))?.change).toEqual({
        kind: 'revive',
        chance: 100,
        share: { lo: 180, hi: 849 },
      })
      expect(partyChangeOf(action(39))?.change).toMatchObject({ share: 0.5 })
    })

    it('reads the record’s lines: Whack’s fail and kill, Zing’s raising', () => {
      expect(action(24).lines).toEqual({ done: [0, 0], failed: [621, 27], killed: [8, 69] })
      expect(action(38).lines.done).toEqual([32, 32])
      expect(action(1).lines).toEqual({ done: [2, 5], failed: [4, 7], killed: [8, 9] })
    })

    it('rides Toxic Dagger’s envenomation — its levels 1 — and Hit the Hay’s sleep on their blows', () => {
      expect(blowOf(action(75))?.rider).toEqual({
        slot: 4,
        chance: { party: 50, foe: 50 },
        levels: 1,
      })
      expect(blowOf(action(87))?.rider?.slot).toBe(7)
    })

    it('scales the six of the game’s table by its numbers, each record saying it scales', () => {
      for (const id of [67, 68, 74, 102, 114, 144]) {
        expect(action(id).range?.party.scales).toEqual(SKILL_SCALES.get(id))
      }
      // Gigaslash's own range stays the record's: 160 to 360, give or take 20.
      expect(action(67).range?.party).toMatchObject({ min: 160, max: 360 })
    })

    it('plays the levels of might, mending and the resistances, and Wave of Relief', () => {
      expect(partyChangeOf(action(60))).toMatchObject({
        change: { kind: 'breaths', by: 1 },
        side: 'own',
      })
      expect(partyChangeOf(action(156))?.change).toMatchObject({ kind: 'spells' })
      expect(partyChangeOf(action(155))).toMatchObject({
        change: { kind: 'spells' },
        side: 'other',
      })
      const aura = partyChangeOf(action(155))?.change
      expect(aura && 'by' in aura ? aura.by : 0).toBeLessThan(0)
      expect(partyChangeOf(action(151))?.change).toMatchObject({ kind: 'mending' })
      expect(partyChangeOf(action(158))?.change).toMatchObject({ kind: 'might' })
      expect(partyChangeOf(action(154))?.change).toEqual({ kind: 'relieve', chance: 100 })
      // Antimagic and Tingle; a spell carries what Fizzle stops.
      expect(partyChangeOf(action(81))).toMatchObject({ change: { kind: 'fizzle' }, side: 'other' })
      expect(partyChangeOf(action(36))).toMatchObject({
        change: { kind: 'unparalyse' },
        magic: true,
      })
      expect(partyChangeOf(action(43))?.magic).toBe(true)
      // The flags the wards read: Frizz a spell, Heal a spell, Fire Breath (226) a breath.
      expect(action(13).rolls?.spell).toBe(true)
      expect(action(30).rolls?.spell).toBe(true)
      expect(action(1).rolls?.spell).toBe(false)
      expect(action(226).rolls?.breath).toBe(true)
    })

    it('gives Right as Rain and Focus Pocus as statuses of the round’s end', () => {
      expect(partyChangeOf(action(188))).toMatchObject({ change: { kind: 'rain' }, side: 'own' })
      expect(partyChangeOf(action(157))).toMatchObject({ change: { kind: 'focus' }, reach: 'one' })
    })

    it('dazzles with Flower Power and Scandal Eyes by their sorts, and plays Vanish', () => {
      expect(partyChangeOf(action(103))?.change).toEqual({ kind: 'dazzle', chance: 100, sort: 1 })
      expect(partyChangeOf(action(191))?.change).toEqual({ kind: 'dazzle', chance: 100, sort: 2 })
      expect(partyChangeOf(action(199))?.change.kind).toBe('vanish')
      // The plain Attack's sight can be spoilt; Heal's cannot.
      expect(action(1).rolls?.spoiltBySight).toBe(true)
      expect(action(30).rolls?.spoiltBySight).toBe(false)
    })

    it('gives Schizofanic’s and Mist Me’s decoys', () => {
      expect(partyChangeOf(action(106))?.change.kind).toBe('schizofanic')
      expect(partyChangeOf(action(200))?.change.kind).toBe('mist')
    })

    it('plays Rotstopper', () => {
      expect(partyChangeOf(action(153))).toMatchObject({
        change: { kind: 'rotstop' },
        reach: 'all',
      })
    })

    it('strikes 33 of them as the Attack now, where 76 were', () => {
      const ids = new Set<number>()
      for (const p of here.skillPanels) if (p.action) ids.add(p.action)
      for (const s of here.spellTable?.learnt ?? [])
        if (s.vocation >= 1 && s.vocation <= 6) ids.add(s.action)
      let attack = 0
      for (const id of ids) {
        const a = here.actions.get(id)
        if (!a || (a.usableIn & 2) === 0 || (a.list !== 1 && a.list !== 2)) continue
        const spell =
          battleSpellOf(a) ??
          (a.reach === ActionReach.Actor && a.effect === ActionEffect.RestoresHp
            ? battleSpellOf({ ...a, reach: ActionReach.One })
            : undefined)
        const psyche = a.rolls?.kind === 15 && (a.reach === ActionReach.Actor || a.reach === 8)
        if (!spell && !blowOf(a) && !partyChangeOf(a) && !psyche) attack++
      }
      expect(attack).toBe(33)
    })
  },
)
