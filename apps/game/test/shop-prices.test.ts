import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { buyPrice } from '../src/services.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/** What a let's play of the European release shows the village shop asking, item by item. */
const ASKED: Readonly<Record<string, number>> = {
  'medicinal herb': 8,
  'antidotal herb': 10,
  'chimaera wing': 25,
  'copper sword': 150,
  'soldiers sword': 240,
  'leather whip': 95,
  'feather fan': 110,
  'pot lid': 40,
  'leather shield': 90,
  bandana: 45,
  'plain clothes': 30,
  'wayfarers clothes': 70,
  'leather armour': 180,
  'cotton gloves': 50,
  'boxer shorts': 30,
  'cotton trousers': 80,
  sandals: 18,
  'leather shoes': 40,
}

describe.skipIf(!romPath)(
  'the village shop’s prices, on a real cartridge',
  { timeout: 120_000 },
  () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

    it('asks for each of its items what the game shows it asking', () => {
      const here = load(rom, { map: 'M01' })
      const shop = here.shops.get(32)
      if (!shop) throw new Error('no shop 32')
      const idOf = new Map(
        [...here.itemNames].map(([id, name]) => [name.replace(/<[^>]*>/g, '').toLowerCase(), id]),
      )
      for (const [name, asked] of Object.entries(ASKED)) {
        const id = idOf.get(name)
        expect(id, name).toBeDefined()
        expect(shop.items, name).toContain(id)
        expect(buyPrice(shop, here.goods.get(id ?? 0)?.price ?? 0), name).toBe(asked)
      }
    })
  },
)
