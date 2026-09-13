import { readFileSync } from 'node:fs'
import { ActionEffect } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { ACTION_SAYS, BATTLE_SAYS, RESULT_SAYS } from '../src/battle-scene.ts'
import { type Named, tellBattle } from '../src/battle-text.ts'
import { load } from '../src/load.ts'
import { MENU_SAYS } from '../src/menu.ts'

const romPath = process.env.MINSTREL_TEST_ROM
/** The medicinal herb's id, as the item names and the tools table give it. */
const HERB = 0x55f0
/** The chimaera wing's field action, as the tools table names it. */
const CHIMAERA_WING = 261

describe.skipIf(!romPath)(
  'items and the battle’s words on a real cartridge',
  { timeout: 120_000 },
  () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

    it('heals with a medicinal herb in the field and in battle, 35 give or take 5', () => {
      const here = load(rom, { map: 'M01' })
      const use = here.itemUses.get(HERB)
      for (const effect of [use?.field, use?.battle]) {
        expect(effect).toMatchObject({
          action: 255,
          effect: ActionEffect.RestoresHp,
          range: { base: 35, spread: 5 },
        })
      }
      // What is used only outside battle has no battle action.
      const wing = [...here.itemUses.values()].find((u) => u.field?.action === CHIMAERA_WING)
      expect(wing).toBeDefined()
      expect(wing?.battle).toBeUndefined()
    })

    it('has every message the battle and the menu tell, and renders each with no tag left over', () => {
      const here = load(rom, { map: 'M01' })
      const words = here.battleWords
      const slime = here.monsterCodes.get('z000a')
      if (!slime) throw new Error('no slime')
      expect(slime.plural).not.toBe(slime.name)
      expect(slime.grammar.indefinite).toBe(101)
      const monster: Named = { name: slime.name, plural: slime.plural, grammar: slime.grammar }
      const herb = here.itemWords.get(HERB)
      if (!herb) throw new Error('no herb')
      const hero: Named = { name: 'Hero', gender: 0 }
      const telling = {
        actor: hero,
        target: monster,
        leader: hero,
        item: { name: herb.singular, plural: herb.plural, grammar: herb.grammar },
        monsters: [monster, monster],
        values: { val_1: 2, val_2: 1, str_1: 'Hero' },
      }
      const check = (file: ReadonlyMap<number, string>, numbers: Record<string, number>) => {
        for (const [what, number] of Object.entries(numbers)) {
          const template = file.get(number)
          expect(template, what).toBeDefined()
          const said = tellBattle(template ?? '', telling, words.articles)
          expect(said.unhandled, what).toEqual([])
          expect(said.text, what).not.toMatch(/[<>]/)
        }
      }
      check(words.battle, BATTLE_SAYS)
      check(words.actions, ACTION_SAYS)
      check(words.results, RESULT_SAYS)
      check(here.menuWords, MENU_SAYS)
      for (const command of [30001, 30004, 30006, 30008])
        expect(words.menu.get(command)).toBeDefined()
    })
  },
)
