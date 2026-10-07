import { readFileSync } from 'node:fs'
import { ActionEffect, ActionReach } from '@minstrel/game-formats'
import { SKILL_SCALES } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { battleSpellOf, blowOf, partyChangeOf, stanceOf } from '../src/battle-scene.ts'
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

    it('rides 232’s tension step, Rake ’n’ Break’s clear, Conjury Conductor’s fall and Caster Sugar’s mending', () => {
      expect(blowOf(action(232))?.rider).toEqual({
        slot: 9,
        chance: { party: 100, foe: 100 },
        levels: -1,
      })
      expect(blowOf(action(101))?.rider?.slot).toBe(12)
      expect(blowOf(action(128))?.rider).toMatchObject({ slot: 13, levels: -1 })
      expect(partyChangeOf(action(190))?.rider).toEqual({ slot: 21, levels: 1 })
    })

    it('plays Eyes on Me and Whistle as provocations, and reads what provokes each monster', () => {
      expect(partyChangeOf(action(194))?.change.kind).toBe('eyes')
      expect(partyChangeOf(action(147))?.change.kind).toBe('whistle')
      expect(partyChangeOf(action(179))?.change).toEqual({ kind: 'fource', chance: 100, sort: 3 })
      // The heals are family 5 and Zing's 12, which the resolver asks.
      expect([30, 31, 32, 33, 34].map((id) => action(id).rolls?.family)).toEqual([5, 5, 5, 5, 5])
      expect(partyChangeOf(action(38))?.family).toBe(12)
      // `+0x24`: 94 monsters are provoked by Whistle at 75 and Eyes on Me at 100.
      const pairs = [...here.monsterBattle.values()].map((m) => JSON.stringify(m.provokedBy))
      expect(pairs.filter((p) => p === '[[17,75],[18,100]]')).toHaveLength(94)
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

    it('plays Alma Mater', () => {
      expect(partyChangeOf(action(152))?.change.kind).toBe('alma')
    })

    it('plays Holy Impregnable', () => {
      expect(partyChangeOf(action(139))?.change.kind).toBe('holy')
    })

    it('plays Tap Dance and Immense Defence as levels, by their records’ +0x30', () => {
      expect(partyChangeOf(action(803))).toMatchObject({
        change: { kind: 'evasion', by: 2 },
        side: 'own',
      })
      expect(partyChangeOf(action(136))?.change).toEqual({ kind: 'shield', by: 2, chance: 100 })
    })

    it('plays Disruptive Wave as the clear of everything magical', () => {
      expect(partyChangeOf(action(189))).toMatchObject({
        change: { kind: 'dispel' },
        side: 'other',
        reach: 'all',
      })
    })

    it('plays Mens Sana as the clear of what is unfortunate', () => {
      expect(partyChangeOf(action(162))?.change).toEqual({ kind: 'sound', chance: 100 })
    })

    it('plays H-Pathy and M-Pathy as the user’s own HP and MP shared, by their ranges', () => {
      expect(partyChangeOf(action(183))).toMatchObject({
        change: { kind: 'pathy', gives: 'hp' },
        reach: 'one',
        side: 'own',
      })
      const m = partyChangeOf(action(184))?.change
      expect(m).toMatchObject({ kind: 'pathy', gives: 'mp' })
      expect(m && 'amount' in m ? m.amount.party : undefined).toMatchObject({ min: 15, max: 55 })
    })

    it('plays Bounce, Magic Mirror and Reverse Cycle, and reads what a wall of light turns back', () => {
      expect(partyChangeOf(action(55))?.change.kind).toBe('bounce')
      expect(partyChangeOf(action(137))?.change.kind).toBe('bounce')
      expect(partyChangeOf(action(104))?.change.kind).toBe('reverse')
      // Frizz and Buff carry the flag, the Attack does not. Heal carries it
      // too, but is aimed at its own side, so nothing turns it back.
      expect(action(13).rolls?.reflectable).toBe(true)
      expect(partyChangeOf(action(41))?.reflectable).toBe(true)
      expect(action(30).rolls?.reflectable).toBe(true)
      expect(action(1).rolls?.reflectable).toBe(false)
    })

    it('takes up the six stances as the round begins, by the table at 0x02182e24', () => {
      expect(stanceOf(action(96))).toEqual({ stance: 4, cost: 8 })
      expect(stanceOf(action(135))).toEqual({ stance: 2, cost: 3 })
      expect(stanceOf(action(138))).toEqual({ stance: 5, cost: 12 })
      expect(stanceOf(action(146))).toEqual({ stance: 6, cost: 0 })
      expect(stanceOf(action(185))).toEqual({ stance: 7, cost: 0 })
      expect(stanceOf(action(182))).toEqual({ stance: 8, cost: 0 })
      // Pincushion: taken up as the round begins, a status of its own.
      expect(stanceOf(action(476))).toEqual({ stance: 0, cost: 0 })
      // Defend and Blockenspiel are stance 1, played by their own commands.
      expect(action(134).rolls?.atRoundStart).toBe(true)
      expect(stanceOf(action(134))).toBeUndefined()
      // The plain Attack is countered and covered; Zam covered only; Heal neither.
      expect(action(1).rolls).toMatchObject({ counterable: true, coverable: true })
      expect(action(13).rolls).toMatchObject({ counterable: false, coverable: true })
      expect(action(30).rolls).toMatchObject({ counterable: false, coverable: false })
    })

    it('rouses by every blow and attack, by no spell or breath — `+0x10` bit 11', () => {
      const rousing = [...here.actions.values()].filter((a) => a.rolls?.rouses)
      expect(rousing.length).toBe(154)
      // All of kind 1, and none a spell or a breath (`+0x10` bits 0 and 2).
      expect(rousing.every((a) => a.rolls?.kind === 1 && !a.rolls.spell && !a.rolls.breath)).toBe(
        true,
      )
      for (const id of [1, 2, 230, 231, 232, 273, 274, 275])
        expect(action(id).rolls?.rouses).toBe(true)
      expect(blowOf(action(63))?.rouses).toBe(true)
      // Frizz, Zam, Gigaslash: no.
      for (const id of [9, 13, 67]) expect(action(id).rolls?.rouses).toBe(false)
    })

    it('rides Hypnowhip’s confusion, and Sobering Slap’s coming to one’s senses', () => {
      expect(blowOf(action(85))?.rider?.slot).toBe(10)
      expect(partyChangeOf(action(171))?.rider).toEqual({ slot: 19, levels: 0 })
    })

    it('rides Morale Masher’s rider 14 on its blow', () => {
      expect(blowOf(action(149))?.rider?.slot).toBe(14)
    })

    it('plays Eye for Trouble as a monster marked', () => {
      expect(partyChangeOf(action(166))).toMatchObject({ change: { kind: 'note' }, side: 'other' })
    })

    it('plays Half-Inch as a pocket picked', () => {
      expect(partyChangeOf(action(165))).toMatchObject({
        change: { kind: 'steal' },
        side: 'other',
        reach: 'one',
      })
    })

    it('plays Soothe Sayer as its rider 9 and the watch ended', () => {
      expect(partyChangeOf(action(198))).toMatchObject({
        change: { kind: 'soothe' },
        side: 'other',
      })
    })

    it('plays Fuddle as confusion', () => {
      expect(partyChangeOf(action(51))).toMatchObject({
        change: { kind: 'confuse' },
        side: 'other',
        reach: 'group',
      })
    })

    it('plays Twocus Pocus as its status, its holder’s spells cast twice', () => {
      expect(partyChangeOf(action(533))).toMatchObject({ change: { kind: 'twocus' } })
    })

    it('strikes 3 of them as the Attack now, where 76 were', () => {
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
        if (!spell && !blowOf(a) && !partyChangeOf(a) && !stanceOf(a) && !psyche) attack++
      }
      expect(attack).toBe(3)
    })
  },
)
