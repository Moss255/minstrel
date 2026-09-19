import { readFileSync } from 'node:fs'
import { readMonsterNames } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { beforeAll, describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * `mon_data_<lang>.nat` `+0x0C` and `+0x0E` — a monster's collision radius and
 * height, two of the ten bytes FORMAT.md carried as not established.
 *
 * The reading comes from the code: overlay 17 builds a field monster's
 * `Object3D` at `func_ov017_021a2128` and ends it with
 *
 *     ldrsh r1, [r5, #0xc] ; lsl r1, r1, #2 ; bl Object3D::SetRadius
 *     ldrsh r1, [r5, #0xe] ;                 bl Object3D::SetHeight
 *
 * where `r5` is an entry of the collection at `+0x2F8` of the resident map,
 * which `0x021b5250` fills from `/data/prm/mon_data.gp2/mon_data_<LG>.nat`.
 * The radius is stored in 1024ths and shifted into `fx32`; the height is
 * `fx32` already. Units are the files' own, which `WORLD_SCALE` divides by 8.
 *
 * What makes it more than a plausible offset is that the numbers sort the
 * bestiary by size.
 */
describe.skipIf(!romPath)("a monster's body, in mon_data", () => {
  const STRIDE = 28
  const FIRST = 4
  let rows: { name: string; code: string; radius: number; height: number }[] = []

  beforeAll(() => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let bytes: Uint8Array | undefined
    for (const file of walkFiles(fs.root)) {
      if (!/mon_data\.gp2$/i.test(file.path)) continue
      const raw = fs.read(file)
      if (!isGpc(raw)) continue
      const gpc = readGpc(raw)
      for (const member of gpc.members) {
        if (!/mon_data_en/i.test(member.name)) continue
        const d = gpc.read(member)
        bytes = isLz10(d) ? decompressLz10(d) : d
      }
    }
    if (!bytes) throw new Error('mon_data_en.nat is not in this cartridge')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    rows = readMonsterNames(bytes).map((monster, i) => ({
      name: monster.name,
      code: monster.code,
      // The radius is a count of 1024ths; << 2 makes it fx32.
      radius: (view.getInt16(FIRST + i * STRIDE + 0x0c, true) * 4) / 4096,
      height: view.getInt16(FIRST + i * STRIDE + 0x0e, true) / 4096,
    }))
  })

  it('gives every monster a positive radius and height', () => {
    expect(rows.length).toBe(438)
    expect(rows.every((r) => r.radius > 0 && r.height > 0)).toBe(true)
    // Nothing is wider than the widest thing the game draws, or taller.
    expect(Math.max(...rows.map((r) => r.radius))).toBeLessThan(16)
    expect(Math.max(...rows.map((r) => r.height))).toBeLessThan(16)
  })

  it('sorts the bestiary by size, which is what makes it a body and not an offset', () => {
    const of = (code: string) => rows.find((r) => r.code === code)
    const slime = of('z000a')
    const dracky = of('z007a')
    const lion = of('z081a')
    const dragon = of('b021b')
    const found = `slime ${slime?.radius}, dracky ${dracky?.radius}, alphyn ${lion?.radius}, Greygnarl ${dragon?.radius}`

    expect(slime, found).toBeDefined()
    expect(dragon, found).toBeDefined()
    // A slime is a small ball: as wide as it is tall.
    expect(Math.abs((slime as NonNullable<typeof slime>).radius - 0.8), found).toBeLessThan(0.01)
    expect(Math.abs((slime as NonNullable<typeof slime>).height - 0.8), found).toBeLessThan(0.01)
    // And the order runs slime < dracky < alphyn < Greygnarl, smallest to largest.
    const order = [slime, dracky, lion, dragon].map((r) => (r as { radius: number }).radius)
    expect(order, found).toEqual([...order].sort((a, b) => a - b))
    expect(order[3] as number, found).toBeGreaterThan((order[0] as number) * 8)
  })
})
