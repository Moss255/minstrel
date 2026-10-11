import { readFileSync } from 'node:fs'
import { readTilePlacements } from '@minstrel/game-formats'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { type NitroFs, readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { floorTiles, grottoFloor } from '@minstrel/sim'
import { beforeAll, describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **A grotto's pieces, on the cartridge**: each of the five environments'
 * `Z0nM01.amdj` holds the 18 tile pieces, and its `Z0nM01.ambl` the `.bpos`
 * of their places — see `packages/sim/src/grotto/tiles.ts`.
 */
describe.skipIf(!romPath)('a grotto’s tile pieces, on the cartridge', () => {
  let fs: NitroFs
  const members = (path: string): Map<string, Uint8Array> => {
    const file = [...walkFiles(fs.root)].find((f) => f.path === path)
    if (!file) throw new Error(`${path} is not in this cartridge`)
    const out = new Map<string, Uint8Array>()
    for (const m of readNarc(fs.read(file)).entries()) {
      out.set(String(m.name ?? m.index), isLz10(m.data) ? decompressLz10(m.data) : m.data)
    }
    return out
  }

  beforeAll(() => {
    fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
  })

  it('names in each environment’s places the eighteen pieces its archive holds', () => {
    for (let environment = 1; environment <= 5; environment++) {
      const code = `Z0${environment}M01`
      const pieces = [...members(`/data/map/${code}.amdj`).keys()]
        .filter((name) => name.endsWith('.nsbmd') && /^Z0\dM[A-Z]\d\dA\.nsbmd$/.test(name))
        .map((name) => name.slice(4, 8))
      const bpos = [...members(`/data/map/${code}.ambl`)].find(([name]) => name.endsWith('.bpos'))
      expect(bpos, code).toBeDefined()
      const named = readTilePlacements((bpos as [string, Uint8Array])[1]).map((k) => k.name)
      expect(named.sort(), code).toEqual([...pieces].sort())
      expect(named, code).toHaveLength(18)
    }
  })

  it('finds each piece the tiles name at the number the game walks to — the archive backwards', () => {
    // `func_020196fc` walks the map's pieces by number; the reverse of the
    // archive's order gives every name the switch prints its number.
    for (let environment = 1; environment <= 5; environment++) {
      const code = `Z0${environment}M01`
      const pieces = [...members(`/data/map/${code}.amdj`).keys()]
        .filter((name) => /^Z0\dM[A-Z]\d\dA\.nsbmd$/.test(name))
        .map((name) => name.slice(4, 8))
        .sort()
        .reverse()
      const seen = new Map<string, number>()
      for (let seed = 0; seed < 4096; seed += 61) {
        for (const tile of floorTiles(grottoFloor(seed, 1 + (seed % 16))))
          seen.set(tile.name, tile.kind)
      }
      for (const [name, kind] of seen) expect(pieces[kind], `${code} ${name}`).toBe(name)
    }
  })
})
