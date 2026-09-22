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

    it('takes an item’s field action only when it is its own, which leaves the books none', () => {
      const here = load(rom, { map: 'M01' })
      for (const [id, use] of here.itemUses) {
        const name = here.itemWords.get(id)?.singular ?? ''
        if (use.field) expect(use.field.name, name).toBe(name)
      }
      // The books are among the tools whose names are titles, `<6>…<9>`: the
      // 23 skill books, whose numbers land on actions, and seven that name none.
      const books = [...here.itemWords].filter(
        ([id, words]) => here.goods.get(id)?.table === 't' && words.singular.startsWith('<6>'),
      )
      expect(books.length).toBeGreaterThanOrEqual(23)
      for (const [id, words] of books)
        expect(here.itemUses.get(id)?.field, words.singular).toBeUndefined()
      // What the herb, the seeds and the wing do is theirs.
      const own = [...here.itemUses.values()].filter((use) => use.field).length
      expect(own).toBeGreaterThanOrEqual(30)
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
        action: { name: 'Heal' },
        monsters: [monster, monster],
        values: { val_1: 2, val_2: 1, str_1: 'Hero', str_2: 'Heal' },
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
      // The drop's two lines read as the game writes them — see `dropsWon`.
      const chest = tellBattle(
        words.results.get(RESULT_SAYS.dropsChest) ?? '',
        telling,
        words.articles,
      )
      expect(chest.text).toContain('drops a treasure chest')
      expect(chest.text).toContain(slime.name)
      const holds = tellBattle(
        words.results.get(RESULT_SAYS.chestHolds) ?? '',
        telling,
        words.articles,
      )
      expect(holds.text).toContain(`It contains a ${herb.singular}`)
      expect(holds.text).toContain('in the bag')

      check(words.battle, BATTLE_SAYS)
      check(words.actions, ACTION_SAYS)
      check(words.results, RESULT_SAYS)
      check(here.menuWords, MENU_SAYS)
      for (const command of [30001, 30004, 30006, 30008])
        expect(words.menu.get(command)).toBeDefined()
    })
  },
)
