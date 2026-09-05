import { checkRange, resourceName, u8, u16 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'

/**
 * The Nitro resource dictionary — the "3D info list" that indexes models,
 * bones, materials, shapes and textures alike.
 *
 * Layout, as documented on the Nintendo DS file formats wiki (NSBMD) and
 * confirmed by arithmetic against every model on this project's reference
 * cartridge — the declared section size always lands exactly on the end of the
 * name table:
 *
 *   +0x00  u8   revision / dummy, 0
 *   +0x01  u8   entry count
 *   +0x02  u16  total section size, from the start of this dictionary
 *   +0x04  u16  size of the patricia header, 8: the two sizes and the constant
 *   +0x06  u16  size of the whole patricia section, measured from +0x00
 *   +0x08  u32  constant
 *   +0x0C  ..   count * 4 bytes of patricia-tree nodes, used for name lookup
 *               by the hardware; not needed to enumerate, so carried opaquely
 *   then   u16  size of one data item
 *          u16  size of the data section
 *          ..   count * itemSize bytes of data
 *   then   ..   count * 16 bytes of names
 *
 * The tree nodes are skipped rather than parsed: enumeration in order is all
 * this package needs, and the order of the data and name arrays already gives
 * it. The region is not reinterpreted, only stepped over by its declared size.
 */

export interface DictEntry {
  readonly name: string
  /** The entry's raw data bytes, `itemSize` long. */
  readonly data: Uint8Array
}

export interface Dict {
  readonly entries: readonly DictEntry[]
  /** Bytes from the dictionary start to the end of the name table. */
  readonly size: number
  readonly itemSize: number
}

/** Parse a dictionary starting at `at`. */
export function readDict(d: Uint8Array, at: number, what = 'dict'): Dict {
  checkRange(d, at, 4, `${what} header`)
  const count = u8(d, at + 1, `${what}.count`)
  const size = u16(d, at + 2, `${what}.size`)

  // Step over the patricia section by its declared size, which is measured
  // from the dictionary's own start. Cross-checked against its parts: the
  // 4-byte dictionary header, the patricia header, and one 4-byte node per
  // entry. The two agree on every model on the reference cartridge, which is
  // what establishes that the size is relative to `at` and not to `at + 4`.
  const patriciaHeaderSize = u16(d, at + 4, `${what}.patricia.headerSize`)
  const patriciaSectionSize = u16(d, at + 6, `${what}.patricia.sectionSize`)
  const expected = 4 + patriciaHeaderSize + count * 4
  if (patriciaSectionSize !== expected) {
    throw new NitroGfxError(
      `${what}: patricia section declares ${patriciaSectionSize} bytes but its header of ${patriciaHeaderSize} and ${count} nodes need ${expected}`,
      at + 6,
    )
  }
  const dataHeader = at + patriciaSectionSize

  const itemSize = u16(d, dataHeader, `${what}.itemSize`)
  const dataSectionSize = u16(d, dataHeader + 2, `${what}.dataSectionSize`)
  const dataStart = dataHeader + 4
  const namesStart = dataStart + count * itemSize

  if (dataSectionSize !== 4 + count * itemSize) {
    throw new NitroGfxError(
      `${what}: data section declares ${dataSectionSize} bytes but ${count} items of ${itemSize} need ${4 + count * itemSize}`,
      dataHeader + 2,
    )
  }
  checkRange(d, dataStart, count * itemSize, `${what} data`)
  checkRange(d, namesStart, count * 16, `${what} names`)

  const end = namesStart + count * 16
  if (end - at !== size) {
    throw new NitroGfxError(
      `${what}: declares ${size} bytes but its contents occupy ${end - at}`,
      at + 2,
    )
  }

  const entries: DictEntry[] = []
  for (let i = 0; i < count; i++) {
    entries.push({
      name: resourceName(d, namesStart + i * 16),
      data: d.subarray(dataStart + i * itemSize, dataStart + (i + 1) * itemSize),
    })
  }

  return { entries, size, itemSize }
}
