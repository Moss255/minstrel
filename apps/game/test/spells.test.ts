import { readFileSync } from 'node:fs'
import { ActionEffect, spellsLearnt } from '@minstrel/game-formats'
import { BattleRng } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { battleSpellOf, foeSpellOf, foeWaysOf } from '../src/battle-scene.ts'
import { HERO_VOCATION, HERO_VOCATION_NUMBER, VOCATION_WORDS } from '../src/hero.ts'
import { type Loaded, load } from '../src/load.ts'
import { SEED_GAINS, useOn } from '../src/use.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('spells and items, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  // Read only when there is a cartridge: the body runs to collect the tests even when they skip.
  const here = romPath ? load(rom, { map: 'M01M07' }) : (undefined as unknown as Loaded)

  it('has the Minstrel learn Heal at 3, and eight more by 36', () => {
    const table = here.spellTable
    if (!table) throw new Error('no spell table')
    const learnt = spellsLearnt(table, HERO_VOCATION_NUMBER, 99).map((spell) => [
      here.actions.get(spell.action)?.name,
      spell.level,
    ])
    expect(learnt).toEqual([
      ['Heal', 3],
      ['Crack', 8],
      ['Evac', 10],
      ['Woosh', 12],
      ['Crackle', 16],
      ['Midheal', 21],
      ['Zing', 24],
      ['Swoosh', 30],
      ['Kaswoosh', 36],
    ])
    expect(spellsLearnt(table, HERO_VOCATION_NUMBER, 2)).toEqual([])
    // The same number names the Minstrel in the field menu's words.
    expect(here.menuWords.get(VOCATION_WORDS + HERO_VOCATION_NUMBER)).toBe(HERO_VOCATION)
  })

  it('never has a vocation learn at a lower level than the record before, nor past 99', () => {
    const table = here.spellTable
    if (!table) throw new Error('no spell table')
    const last = new Map<number, number>()
    for (const spell of table.learnt) {
      expect(spell.level).toBeGreaterThanOrEqual(last.get(spell.vocation) ?? 1)
      expect(spell.level).toBeLessThanOrEqual(99)
      last.set(spell.vocation, spell.level)
    }
    expect([...last.keys()].sort((a, b) => a - b)).toEqual([2, 3, 5, 6, 8, 9, 10, 11, 12])
  })

  it('costs Heal 2 MP and casts it outside battle, but not Crack', () => {
    expect(here.actions.get(30)).toMatchObject({
      name: 'Heal',
      cost: 2,
      field: true,
      message: 22,
      effect: ActionEffect.RestoresHp,
    })
    expect(here.actions.get(12)).toMatchObject({ name: 'Crack', cost: 3, field: false })
  })

  it('has each seed’s message name the number it raises', () => {
    const named: Record<string, string> = {
      maxHp: 'maximum HP',
      maxMp: 'maximum MP',
      strength: 'strength',
      deftness: 'deftness',
      agility: 'agility',
      resilience: 'resilience',
      magicalMight: 'magical might',
      magicalMending: 'magical mending',
      charm: 'charm',
      skillPoints: 'skill point',
    }
    for (const [message, stat] of SEED_GAINS) {
      expect(here.battleWords.actions.get(message), stat).toContain(named[stat])
    }
    // The nine seeds and the pretty betsy, one action each. (The Sage's
    // Scripture names the seed of magic's too, but a book's actions are not its
    // own — see `itemUsesOf`.)
    const seeds = new Set(
      [...here.itemUses.values()].flatMap((use) =>
        use.field && SEED_GAINS.has(use.field.message) ? [use.field.action] : [],
      ),
    )
    expect(seeds.size).toBe(10)
  })

  it('casts in battle what heals or deals damage, at the party’s amounts and reach', () => {
    const table = here.spellTable
    if (!table) throw new Error('no spell table')
    const cast = spellsLearnt(table, HERO_VOCATION_NUMBER, 99).flatMap((learnt) => {
      const action = here.actions.get(learnt.action)
      const found = action && battleSpellOf(action)
      if (!found) return []
      const { does, reach, cost, amount } = found.spell
      return [[found.name.name, does, reach, cost, amount?.base, amount?.spread]]
    })
    // The reference's own Heal, Crack, Woosh and Crackle are 35, 30, 16 and 50.
    expect(cast).toEqual([
      ['Heal', 'heal', 'one', 2, 35, 5],
      ['Crack', 'harm', 'one', 3, 30, 5],
      ['Woosh', 'harm', 'group', 3, 16, 8],
      ['Crackle', 'harm', 'group', 8, 50, 8],
      ['Midheal', 'heal', 'one', 4, 85, 10],
      ['Swoosh', 'harm', 'group', 8, 40, 15],
      ['Kaswoosh', 'harm', 'group', 26, 130, 50],
    ])
  })

  it('gives monsters their six ways: the slime flees, the archer uses a herb, Hexagoon strikes all', () => {
    const items = new Map(
      [...here.itemWords.values()].map((w) => [
        w.singular,
        { name: w.singular, plural: w.plural, grammar: w.grammar },
      ]),
    )
    const waysOf = (code: string) => {
      const number = here.monsterCodes.get(code)?.number
      const words = number === undefined ? [] : (here.monsterBattle.get(number)?.actions ?? [])
      return foeWaysOf(words, (id) => {
        const action = here.actions.get(id)
        return action && foeSpellOf(action, items.get(action.name))
      })
    }
    expect(waysOf('z000a').acts.map((a) => a.kind)).toEqual([
      'attack',
      'flee',
      'attack',
      'attack',
      'flee',
      'attack',
    ])
    const archer = waysOf('z005a')
    expect(archer.acts.map((a) => a.kind)).toEqual([
      'attack',
      'attack',
      'flee',
      'flee',
      'spell',
      'attack',
    ])
    expect(archer.known.get(236)).toMatchObject({
      opening: 'use',
      spell: { does: 'heal', reach: 'one', amount: { base: 35, spread: 5 } },
    })
    expect(waysOf('b003a').known.get(546)).toMatchObject({
      opening: 'none',
      spell: { does: 'harm', reach: 'all', amount: { base: 6, spread: 1 } },
    })
  })

  it('restores MP with magic water, all of it with the elfin elixir, and raises HP with a seed', () => {
    const byName = (name: string) =>
      [...here.itemUses].find(([id]) => here.itemWords.get(id)?.singular === name)?.[1].field
    const vitals = { hp: 10, maxHp: 30, mp: 0, maxMp: 50 }
    const water = byName('magic water')
    const elixir = byName('elfin elixir')
    const seed = byName('seed of life')
    if (!water || !elixir || !seed) throw new Error('an item is missing')
    const watered = useOn(water, vitals, new BattleRng(1n))
    expect(watered).toMatchObject({ kind: 'mp', message: 106 })
    expect(watered.kind === 'mp' && watered.amount).toBeGreaterThanOrEqual(30)
    expect(watered.kind === 'mp' && watered.amount).toBeLessThanOrEqual(36)
    expect(useOn(elixir, vitals, new BattleRng(1n))).toMatchObject({ kind: 'mp', mp: 50 })
    expect(useOn(seed, vitals, new BattleRng(1n))).toEqual({
      kind: 'gain',
      stat: 'maxHp',
      amount: 3,
      message: 157,
    })
  })
})
