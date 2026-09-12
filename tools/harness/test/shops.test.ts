import { readFileSync } from 'node:fs'
import { readItemTable, readShops } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The shop table and the item tables, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed. The
 * fixtures in `packages/game-formats/test/shops.test.ts` and `itemtable.test.ts`
 * are built in code.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('shops on a real cartridge', { timeout: 60_000 }, () => {
  it('reads 37 shops, and every item any of them sells has a price', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const prices = new Map<number, number>()
    let shops: ReturnType<typeof readShops> = []
    for (const file of walkFiles(fs.root)) {
      if (file.path === '/data/bin/menu/shopdata1.bin') shops = readShops(fs.read(file))
      if (!/^\/data\/prm\/itemdt_[a-z]\.gp2$/.test(file.path)) continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (!/_en\.nat$/.test(member.name)) continue
        for (const item of readItemTable(archive.read(member))) prices.set(item.id, item.price)
      }
    }
    expect(shops).toHaveLength(37)
    expect(new Set(shops.map((shop) => shop.id)).size).toBe(37)
    const sold = new Set(shops.flatMap((shop) => shop.items))
    expect(sold.size).toBeGreaterThan(300)
    for (const id of sold) expect(prices.get(id), `item ${id}`).toBeGreaterThan(0)
    // The village shopkeeper's `<SHOP=32>`: a full shop, at the ordinary rate.
    const village = shops.find((shop) => shop.id === 32)
    expect(village?.items).toHaveLength(18)
    expect(village?.rate).toBe(100)
  })
})
