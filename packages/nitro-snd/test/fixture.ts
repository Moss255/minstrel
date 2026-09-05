/**
 * Builds valid SDAT archives in memory.
 *
 * Fixtures may not contain cartridge bytes, so the layout is implemented here
 * from the published description, independently of the reader.
 */

export interface FixtureResource {
  name?: string
  /** Contents; the first four bytes are usually a stamp such as `SSEQ`. */
  data: Uint8Array
}

export interface SdatFixture {
  sequences?: (FixtureResource & { bankId?: number; volume?: number })[]
  banks?: (FixtureResource & { waveArchiveIds?: number[] })[]
  waveArchives?: FixtureResource[]
  /** Players carry no file reference; included to prove they are not read as one. */
  players?: { name?: string; data: Uint8Array }[]
  /** Omit the SYMB block, as some retail archives do. */
  withoutSymbols?: boolean
}

const align4 = (n: number) => (n + 3) & ~3

export function stamped(stamp: string, length: number, seed: number): Uint8Array {
  const out = new Uint8Array(Math.max(length, 4))
  for (let i = 0; i < 4; i++) out[i] = stamp.charCodeAt(i)
  let x = seed + 1
  for (let i = 4; i < out.length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

class Bytes {
  data: number[] = []
  get length(): number {
    return this.data.length
  }
  u8(v: number): this {
    this.data.push(v & 0xff)
    return this
  }
  u16(v: number): this {
    this.data.push(v & 0xff, (v >>> 8) & 0xff)
    return this
  }
  u32(v: number): this {
    this.data.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
    return this
  }
  raw(v: ArrayLike<number>): this {
    for (let i = 0; i < v.length; i++) this.data.push(v[i] as number)
    return this
  }
  padTo(n: number): this {
    while (this.data.length < n) this.data.push(0)
    return this
  }
}

/** Assemble an SDAT: SYMB names, INFO records, FAT ranges and the FILE data. */
export function buildSdat(fixture: SdatFixture): Uint8Array {
  const sequences = fixture.sequences ?? []
  const banks = fixture.banks ?? []
  const waveArchives = fixture.waveArchives ?? []
  const players = fixture.players ?? []

  // Files, in the order sequences, banks, wave archives.
  const resources = [...sequences, ...banks, ...waveArchives]
  const fileCount = resources.length

  // --- INFO: eight lists, each a count then per-record offsets ---
  const lists: { records: number[][]; names: (string | undefined)[] }[] = [
    {
      records: sequences.map((s, i) => {
        const r = new Bytes()
        r.u16(i)
          .u16(0)
          .u16(s.bankId ?? 0)
          .u8(s.volume ?? 100)
          .u8(0)
          .u8(0)
          .u8(2)
          .u16(0)
        return r.data
      }),
      names: sequences.map((s) => s.name),
    },
    { records: [], names: [] },
    {
      records: banks.map((b, i) => {
        const r = new Bytes()
        r.u16(sequences.length + i).u16(0)
        const ids = b.waveArchiveIds ?? [0]
        for (let k = 0; k < 4; k++) r.u16(ids[k] ?? 0xffff)
        return r.data
      }),
      names: banks.map((b) => b.name),
    },
    {
      records: waveArchives.map((_, i) => {
        const r = new Bytes()
        r.u16(sequences.length + banks.length + i).u16(0)
        return r.data
      }),
      names: waveArchives.map((w) => w.name),
    },
    { records: players.map((p) => Array.from(p.data)), names: players.map((p) => p.name) },
    { records: [], names: [] },
    { records: [], names: [] },
    { records: [], names: [] },
  ]

  const info = new Bytes()
  info.raw([0x49, 0x4e, 0x46, 0x4f]) // 'INFO'
  info.u32(0) // size, patched
  const infoListOffsetAt = info.length
  for (let i = 0; i < 8; i++) info.u32(0)
  info.padTo(0x40)

  const infoListOffsets: number[] = []
  const recordOffsets: number[][] = []
  for (const list of lists) {
    if (list.records.length === 0) {
      infoListOffsets.push(0)
      recordOffsets.push([])
      continue
    }
    infoListOffsets.push(info.length)
    info.u32(list.records.length)
    const patchAt = info.length
    for (let i = 0; i < list.records.length; i++) info.u32(0)
    const offsets: number[] = []
    for (const record of list.records) {
      offsets.push(info.length)
      info.raw(record)
      info.padTo(align4(info.length))
    }
    recordOffsets.push(offsets)
    offsets.forEach((offset, i) => {
      const at = patchAt + i * 4
      info.data[at] = offset & 0xff
      info.data[at + 1] = (offset >>> 8) & 0xff
      info.data[at + 2] = (offset >>> 16) & 0xff
      info.data[at + 3] = (offset >>> 24) & 0xff
    })
  }
  infoListOffsets.forEach((offset, i) => {
    const at = infoListOffsetAt + i * 4
    info.data[at] = offset & 0xff
    info.data[at + 1] = (offset >>> 8) & 0xff
    info.data[at + 2] = (offset >>> 16) & 0xff
    info.data[at + 3] = (offset >>> 24) & 0xff
  })
  info.padTo(align4(info.length))
  const infoSize = info.length
  info.data[4] = infoSize & 0xff
  info.data[5] = (infoSize >>> 8) & 0xff
  info.data[6] = (infoSize >>> 16) & 0xff
  info.data[7] = (infoSize >>> 24) & 0xff

  // --- SYMB: same eight lists, of name offsets ---
  const symb = new Bytes()
  if (!fixture.withoutSymbols) {
    symb.raw([0x53, 0x59, 0x4d, 0x42]) // 'SYMB'
    symb.u32(0)
    const symbListOffsetAt = symb.length
    for (let i = 0; i < 8; i++) symb.u32(0)
    symb.padTo(0x40)

    const symbListOffsets: number[] = []
    const namePatches: { at: number; text: string | undefined }[] = []
    for (const list of lists) {
      if (list.names.length === 0) {
        symbListOffsets.push(0)
        continue
      }
      symbListOffsets.push(symb.length)
      symb.u32(list.names.length)
      for (const text of list.names) {
        namePatches.push({ at: symb.length, text })
        symb.u32(0)
      }
    }
    for (const patch of namePatches) {
      if (patch.text === undefined) continue
      const offset = symb.length
      for (let i = 0; i < patch.text.length; i++) symb.u8(patch.text.charCodeAt(i))
      symb.u8(0)
      symb.data[patch.at] = offset & 0xff
      symb.data[patch.at + 1] = (offset >>> 8) & 0xff
      symb.data[patch.at + 2] = (offset >>> 16) & 0xff
      symb.data[patch.at + 3] = (offset >>> 24) & 0xff
    }
    symbListOffsets.forEach((offset, i) => {
      const at = symbListOffsetAt + i * 4
      symb.data[at] = offset & 0xff
      symb.data[at + 1] = (offset >>> 8) & 0xff
      symb.data[at + 2] = (offset >>> 16) & 0xff
      symb.data[at + 3] = (offset >>> 24) & 0xff
    })
    symb.padTo(align4(symb.length))
    const symbSize = symb.length
    symb.data[4] = symbSize & 0xff
    symb.data[5] = (symbSize >>> 8) & 0xff
    symb.data[6] = (symbSize >>> 16) & 0xff
    symb.data[7] = (symbSize >>> 24) & 0xff
  }

  // --- layout ---
  const headerSize = 0x40
  const symbOffset = symb.length > 0 ? headerSize : 0
  const infoOffset = headerSize + symb.length
  const fatOffset = infoOffset + infoSize
  const fatSize = 12 + fileCount * 16
  const fileOffset = fatOffset + align4(fatSize)

  const fat = new Bytes()
  fat.raw([0x46, 0x41, 0x54, 0x20]) // 'FAT '
  fat.u32(fatSize)
  fat.u32(fileCount)
  let cursor = fileOffset + 16
  const placements: { at: number; data: Uint8Array }[] = []
  for (const resource of resources) {
    fat.u32(cursor).u32(resource.data.length).u32(0).u32(0)
    placements.push({ at: cursor, data: resource.data })
    cursor = align4(cursor + resource.data.length)
  }
  fat.padTo(align4(fat.length))

  const total = cursor
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out.set([0x53, 0x44, 0x41, 0x54], 0) // 'SDAT'
  view.setUint16(0x04, 0xfeff, true)
  view.setUint16(0x06, 0x0100, true)
  view.setUint32(0x08, total, true)
  view.setUint16(0x0c, headerSize, true)
  view.setUint16(0x0e, 4, true)
  view.setUint32(0x10, symbOffset, true)
  view.setUint32(0x14, symb.length, true)
  view.setUint32(0x18, infoOffset, true)
  view.setUint32(0x1c, infoSize, true)
  view.setUint32(0x20, fatOffset, true)
  view.setUint32(0x24, fat.length, true)
  view.setUint32(0x28, fileOffset, true)
  view.setUint32(0x2c, total - fileOffset, true)

  if (symb.length > 0) out.set(Uint8Array.from(symb.data), symbOffset)
  out.set(Uint8Array.from(info.data), infoOffset)
  out.set(Uint8Array.from(fat.data), fatOffset)
  out.set([0x46, 0x49, 0x4c, 0x45], fileOffset) // 'FILE'
  view.setUint32(fileOffset + 4, total - fileOffset, true)
  view.setUint32(fileOffset + 8, fileCount, true)
  for (const placement of placements) out.set(placement.data, placement.at)

  return out
}
