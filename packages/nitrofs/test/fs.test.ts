import { describe, expect, it } from 'vitest'
import { NitroFsError } from '../src/errors.ts'
import { ROOT_DIR_ID, walkDirs, walkFiles } from '../src/fnt.ts'
import { readNitroFs } from '../src/fs.ts'
import { buildRom, type FixtureDir, fill } from './fixture.ts'

const tree: FixtureDir = {
  name: '',
  files: [{ name: 'boot.bin', data: fill(16, 1) }],
  dirs: [
    {
      name: 'data',
      files: [
        { name: 'map01.bin', data: fill(64, 2) },
        { name: 'map02.bin', data: fill(0, 3) },
      ],
      dirs: [{ name: 'model', files: [{ name: 'hero.nsbmd', data: fill(256, 4) }] }],
    },
    { name: 'sound', files: [{ name: 'bgm.sdat', data: fill(32, 5) }] },
  ],
}

describe('readNitroFs', () => {
  it('reconstructs the directory tree', () => {
    const fs = readNitroFs(buildRom(tree))

    expect(fs.root.path).toBe('/')
    expect(fs.root.id).toBe(ROOT_DIR_ID)
    expect(fs.root.dirs.map((d) => d.name)).toEqual(['data', 'sound'])
    expect(fs.root.files.map((f) => f.name)).toEqual(['boot.bin'])

    const data = fs.dir('/data')
    expect(data?.dirs.map((d) => d.path)).toEqual(['/data/model'])
    expect(fs.file('/data/model/hero.nsbmd')?.size).toBe(256)
  })

  it('round-trips every file body', () => {
    const rom = buildRom(tree)
    const fs = readNitroFs(rom)

    const expected = new Map([
      ['/boot.bin', fill(16, 1)],
      ['/data/map01.bin', fill(64, 2)],
      ['/data/map02.bin', fill(0, 3)],
      ['/data/model/hero.nsbmd', fill(256, 4)],
      ['/sound/bgm.sdat', fill(32, 5)],
    ])

    for (const [path, contents] of expected) {
      expect(Array.from(fs.read(path)), path).toEqual(Array.from(contents))
    }
    expect([...walkFiles(fs.root)].map((f) => f.path).sort()).toEqual([...expected.keys()].sort())
  })

  it('returns zero-copy views into the source buffer', () => {
    const rom = buildRom(tree)
    const fs = readNitroFs(rom)
    const view = fs.read('/data/map01.bin')

    expect(view.buffer).toBe(rom.buffer)
    rom[view.byteOffset] = (view[0] as number) ^ 0xff
    expect(view[0]).toBe(rom[view.byteOffset])
  })

  it('numbers files consecutively after the overlays', () => {
    const rom = buildRom(tree, {
      overlays: [{ data: fill(8, 10) }, { data: fill(8, 11) }],
    })
    const fs = readNitroFs(rom)

    expect(fs.arm9Overlays).toHaveLength(2)
    expect(fs.arm9Overlays.map((o) => o.fileId)).toEqual([0, 1])
    expect(fs.arm9Overlays[0]?.compressed).toBe(false)
    // Overlays hold FAT slots 0 and 1, so the first *named* file is ID 2.
    expect(fs.file('/boot.bin')?.id).toBe(2)
    expect(Array.from(fs.read(0))).toEqual(Array.from(fill(8, 10)))
    expect(fs.fat).toHaveLength(fs.files.length + 2)
  })

  it('reads a file by ID, by path and by entry alike', () => {
    const fs = readNitroFs(buildRom(tree))
    const file = fs.file('/sound/bgm.sdat')
    if (!file) throw new Error('fixture file missing')

    expect(Array.from(fs.read(file.id))).toEqual(Array.from(fs.read(file.path)))
    expect(Array.from(fs.read(file))).toEqual(Array.from(fs.read(file.path)))
  })

  it('normalises lookup paths', () => {
    const fs = readNitroFs(buildRom(tree))
    for (const path of [
      '/data/model/hero.nsbmd',
      'data/model/hero.nsbmd',
      '/data//model/hero.nsbmd',
    ]) {
      expect(fs.file(path)?.name, path).toBe('hero.nsbmd')
    }
    expect(fs.dir('/data/')?.path).toBe('/data')
  })

  it('exposes the ARM binaries', () => {
    const arm9 = fill(0x80, 90)
    const fs = readNitroFs(buildRom(tree, { arm9 }))
    expect(Array.from(fs.readArm9())).toEqual(Array.from(arm9))
  })

  it('enumerates directories', () => {
    const fs = readNitroFs(buildRom(tree))
    expect([...walkDirs(fs.root)].map((d) => d.path)).toEqual([
      '/',
      '/data',
      '/data/model',
      '/sound',
    ])
    expect(fs.dir('/data/model')?.parentId).toBe(fs.dir('/data')?.id)
  })
})

describe('readNitroFs on malformed input', () => {
  const corrupt = (mutate: (rom: Uint8Array, view: DataView) => void) => {
    const rom = buildRom(tree)
    mutate(rom, new DataView(rom.buffer))
    return () => readNitroFs(rom)
  }

  it('rejects a truncated image', () => {
    const rom = buildRom(tree)
    expect(() => readNitroFs(rom.subarray(0, rom.length >> 1))).toThrow(NitroFsError)
  })

  it('rejects a FAT whose size is not a multiple of the entry size', () => {
    expect(corrupt((_, view) => view.setUint32(0x04c, 12, true))).toThrow(/not a multiple of 8/)
  })

  it('rejects a FAT entry that ends before it starts', () => {
    expect(
      corrupt((rom, view) => {
        const fatOffset = view.getUint32(0x048, true)
        void rom
        view.setUint32(fatOffset + 0, 0x1000, true)
        view.setUint32(fatOffset + 4, 0x0800, true)
      }),
    ).toThrow(/ends .* before it starts/)
  })

  it('rejects a FAT entry pointing past the end of the image', () => {
    expect(
      corrupt((_, view) => {
        const fatOffset = view.getUint32(0x048, true)
        view.setUint32(fatOffset + 4, 0x7fff_0000, true)
      }),
    ).toThrow(/past the .*-byte limit/)
  })

  it('rejects a directory count larger than the FNT can hold', () => {
    expect(
      corrupt((_, view) => {
        const fntOffset = view.getUint32(0x040, true)
        view.setUint16(fntOffset + 6, 0xfff, true)
      }),
    ).toThrow(/directory table/)
  })

  it('rejects a directory count of zero', () => {
    expect(
      corrupt((_, view) => {
        const fntOffset = view.getUint32(0x040, true)
        view.setUint16(fntOffset + 6, 0, true)
      }),
    ).toThrow(/zero directories/)
  })

  it('rejects a sub-table offset outside the FNT', () => {
    expect(
      corrupt((_, view) => {
        const fntOffset = view.getUint32(0x040, true)
        view.setUint32(fntOffset + 0, 0x7fff_0000, true)
      }),
    ).toThrow(/past the/)
  })

  it('rejects a sub-directory ID that is not 0xF000-based', () => {
    const rom = buildRom({ name: '', dirs: [{ name: 'sub', files: [] }] })
    const view = new DataView(rom.buffer)
    const fntOffset = view.getUint32(0x040, true)
    const rootSubTable = fntOffset + view.getUint32(fntOffset + 0, true)
    // Root sub-table: [0x83]['s']['u']['b'][id lo][id hi]
    view.setUint16(rootSubTable + 4, 0x1234, true)
    expect(() => readNitroFs(rom)).toThrow(/not 0xF000-based/)
  })

  it('rejects a cyclic directory tree', () => {
    const rom = buildRom({ name: '', dirs: [{ name: 'sub', files: [] }] })
    const view = new DataView(rom.buffer)
    const fntOffset = view.getUint32(0x040, true)
    const rootSubTable = fntOffset + view.getUint32(fntOffset + 0, true)
    // Point 'sub' back at the root, which the walk must detect rather than hang.
    view.setUint16(rootSubTable + 4, 0xf000, true)
    expect(() => readNitroFs(rom)).toThrow(/cycle/)
  })

  it('carries a non-ASCII name through instead of rejecting it', () => {
    // Real cartridges ship names that are not ASCII — this project's reference
    // cartridge has two containing Shift-JIS bytes. Names are bytes, so the
    // walker must preserve them exactly rather than throw or transliterate.
    const rom = buildRom(tree)
    const view = new DataView(rom.buffer)
    const fntOffset = view.getUint32(0x040, true)
    const rootSubTable = fntOffset + view.getUint32(fntOffset + 0, true)
    rom[rootSubTable + 1] = 0x82
    rom[rootSubTable + 2] = 0x94

    const fs = readNitroFs(rom)
    const name = fs.root.files[0]?.name as string
    expect(name.charCodeAt(0)).toBe(0x82)
    expect(name.charCodeAt(1)).toBe(0x94)
    expect(Array.from(fs.read(`/${name}`))).toEqual(Array.from(fill(16, 1)))
  })

  it('rejects an FNT that names more files than the FAT holds', () => {
    expect(corrupt((_, view) => view.setUint32(0x04c, 8, true))).toThrow(/the FAT has only/)
  })

  it('reports an unknown path rather than returning empty bytes', () => {
    const fs = readNitroFs(buildRom(tree))
    expect(fs.file('/nope.bin')).toBeUndefined()
    expect(() => fs.read('/nope.bin')).toThrow(/no such file/)
    expect(() => fs.read(9999)).toThrow(/outside the/)
  })
})
