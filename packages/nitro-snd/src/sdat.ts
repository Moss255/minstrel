import { NitroSndError } from './errors.ts'

/**
 * SDAT — the Nitro sound archive.
 *
 * References: GBATEK, "DS Files", and the Nintendo DS file formats wiki (SDAT,
 * SSEQ, SBNK, SWAR). Confirmed against this project's reference cartridge,
 * where the header's four blocks tile the file exactly and every record's file
 * id indexes a real FAT entry.
 *
 * Container:
 *
 *   0x00  char[4]  'SDAT'
 *   0x04  u16      byte-order mark, 0xFEFF
 *   0x06  u16      version
 *   0x08  u32      file size
 *   0x0C  u16      header size, 0x40
 *   0x0E  u16      block count, 4
 *   0x10  u32      SYMB offset and size
 *   0x18  u32      INFO offset and size
 *   0x20  u32      FAT  offset and size
 *   0x28  u32      FILE offset and size
 *
 * `SYMB` holds names, `INFO` the records describing each resource, `FAT` the
 * byte ranges, `FILE` the data. SYMB is optional and is stripped from some
 * retail archives; everything still works by index when it is absent.
 */

export const SDAT_MAGIC = 'SDAT'
const LITTLE_ENDIAN_BOM = 0xfeff

/**
 * The eight record lists, in the order their offsets appear in SYMB and INFO.
 * Both blocks use the same order, which is what lets names and records be
 * paired by index.
 */
export const RecordKind = {
  Sequence: 0,
  SequenceArchive: 1,
  Bank: 2,
  WaveArchive: 3,
  Player: 4,
  Group: 5,
  Player2: 6,
  Stream: 7,
} as const

export type RecordKindValue = (typeof RecordKind)[keyof typeof RecordKind]

/**
 * Which record kinds refer to a file.
 *
 * Only these put a FAT index in their leading `u16`. A player, group or
 * player2 record starts with something else — a count, or a player number —
 * and reading it as a file id yields a small integer that happens to index an
 * early file, which looks plausible and is meaningless. Confirmed by
 * observation: across the reference cartridge's three archives, every file id
 * from a kind below resolves to a file whose stamp is the one that kind
 * implies, 1,449 of 1,449; the excluded kinds produce stamps that contradict
 * their type and, in one case, an index past the end of the table.
 */
const REFERENCES_FILE: readonly boolean[] = [
  true, // sequence
  true, // sequenceArchive
  true, // bank
  true, // waveArchive
  false, // player
  false, // group
  false, // player2
  true, // stream
]

export const RECORD_KIND_NAMES: readonly string[] = [
  'sequence',
  'sequenceArchive',
  'bank',
  'waveArchive',
  'player',
  'group',
  'player2',
  'stream',
]

/** A `[start, end)` range within the archive. */
export interface SdatFile {
  readonly id: number
  readonly start: number
  readonly end: number
  readonly size: number
}

/** One entry of one of the eight record lists. */
export interface SdatRecord {
  readonly kind: RecordKindValue
  readonly index: number
  /** From SYMB, when the archive kept its symbols. */
  readonly name: string | undefined
  /**
   * FAT index, read from the record's leading `u16`.
   *
   * `undefined` for an empty record slot — archives leave gaps in the
   * numbering — and for the player, group and player2 kinds, which do not refer
   * to files at all.
   */
  readonly fileId: number | undefined
  /** The record's bytes, for fields this package does not interpret. */
  readonly data: Uint8Array
}

/** A sequence record's playback fields. */
export interface SequenceInfo {
  readonly bankId: number
  readonly volume: number
  readonly channelPressure: number
  readonly polyphonicPressure: number
  readonly playerPriority: number
}

/** A bank record's wave-archive references. */
export interface BankInfo {
  /** Up to four wave archives; 0xFFFF marks an unused slot. */
  readonly waveArchiveIds: readonly number[]
}

export interface Sdat {
  readonly version: number
  /** True when the archive kept its SYMB block. */
  readonly hasSymbols: boolean
  readonly files: readonly SdatFile[]
  /** The eight record lists, indexed by {@link RecordKind}. */
  readonly records: readonly (readonly SdatRecord[])[]
  readonly sequences: readonly SdatRecord[]
  readonly banks: readonly SdatRecord[]
  readonly waveArchives: readonly SdatRecord[]

  /** Zero-copy view of one file's bytes, by FAT index or record. */
  read(target: number | SdatRecord): Uint8Array
  /** Look up a record by name across every list. */
  record(name: string): SdatRecord | undefined
  /** Decode a sequence record's playback fields. */
  sequenceInfo(record: SdatRecord): SequenceInfo
  /** Decode a bank record's wave-archive references. */
  bankInfo(record: SdatRecord): BankInfo
}

function u16(d: Uint8Array, at: number, what: string): number {
  if (at + 2 > d.length) throw new NitroSndError(`${what}: read past end of archive`, at)
  return (d[at] as number) | ((d[at + 1] as number) << 8)
}

function u32(d: Uint8Array, at: number, what: string): number {
  if (at + 4 > d.length) throw new NitroSndError(`${what}: read past end of archive`, at)
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

function stamp(d: Uint8Array, at: number): string {
  let out = ''
  for (let i = 0; i < 4 && at + i < d.length; i++) {
    const c = d[at + i] as number
    out += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.'
  }
  return out
}

/** Read a NUL-terminated name. Names are bytes; decoded byte-transparently. */
function cstring(d: Uint8Array, at: number): string {
  let out = ''
  for (let i = at; i < d.length; i++) {
    const c = d[i] as number
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out
}

/** Cheap check for the SDAT stamp; does not validate the body. */
export function isSdat(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x53 && data[1] === 0x44 && data[2] === 0x41 && data[3] === 0x54
  )
}

/**
 * Parse an SDAT archive.
 *
 * Returns views into `data`; nothing is copied. A 38 MiB sound archive costs no
 * more than reading its tables.
 */
export function readSdat(data: Uint8Array): Sdat {
  if (!isSdat(data)) {
    throw new NitroSndError(`not an SDAT: stamp is '${stamp(data, 0)}'`, 0)
  }
  const bom = u16(data, 0x04, 'sdat.bom')
  if (bom !== LITTLE_ENDIAN_BOM) {
    throw new NitroSndError(`sdat byte-order mark is 0x${bom.toString(16)}`, 0x04)
  }
  const version = u16(data, 0x06, 'sdat.version')
  const declaredSize = u32(data, 0x08, 'sdat.fileSize')
  if (declaredSize > data.length) {
    throw new NitroSndError(
      `sdat declares ${declaredSize} bytes but only ${data.length} are present`,
      0x08,
    )
  }
  const image = data.subarray(0, declaredSize)

  const symbOffset = u32(image, 0x10, 'sdat.symb.offset')
  const infoOffset = u32(image, 0x18, 'sdat.info.offset')
  const fatOffset = u32(image, 0x20, 'sdat.fat.offset')
  if (infoOffset === 0 || fatOffset === 0) {
    throw new NitroSndError('sdat is missing its INFO or FAT block', 0x18)
  }
  for (const [name, at] of [
    ['INFO', infoOffset],
    ['FAT', fatOffset],
  ] as const) {
    if (at + 8 > image.length) {
      throw new NitroSndError(`sdat ${name} block lies past the end of the archive`, at)
    }
  }

  // --- FAT ---
  // The stamp is 'FAT ' with a trailing space, four characters like the rest.
  const fatStamp = stamp(image, fatOffset)
  if (fatStamp !== 'FAT ') {
    throw new NitroSndError(`sdat FAT block has stamp '${fatStamp}'`, fatOffset)
  }
  const fileCount = u32(image, fatOffset + 8, 'sdat.fat.count')
  const files: SdatFile[] = []
  for (let i = 0; i < fileCount; i++) {
    const at = fatOffset + 12 + i * 16
    const start = u32(image, at, `sdat.fat[${i}].offset`)
    const size = u32(image, at + 4, `sdat.fat[${i}].size`)
    const end = start + size
    if (end > image.length) {
      throw new NitroSndError(
        `sdat file ${i} ends at 0x${end.toString(16)}, past the ${image.length}-byte archive`,
        at,
      )
    }
    files.push({ id: i, start, end, size })
  }

  // --- SYMB, when present ---
  const hasSymbols = symbOffset !== 0 && stamp(image, symbOffset) === 'SYMB'
  const nameLists: (string[] | undefined)[] = new Array(8).fill(undefined)
  if (hasSymbols) {
    for (let kind = 0; kind < 8; kind++) {
      const listOffset = u32(image, symbOffset + 8 + kind * 4, `sdat.symb.list[${kind}]`)
      if (listOffset === 0) continue
      const listAt = symbOffset + listOffset
      const count = u32(image, listAt, `sdat.symb.list[${kind}].count`)
      const names: string[] = []
      for (let i = 0; i < count; i++) {
        const nameOffset = u32(image, listAt + 4 + i * 4, `sdat.symb.name[${kind}][${i}]`)
        names.push(nameOffset === 0 ? '' : cstring(image, symbOffset + nameOffset))
      }
      nameLists[kind] = names
    }
  }

  // --- INFO ---
  const records: SdatRecord[][] = []
  for (let kind = 0; kind < 8; kind++) {
    const listOffset = u32(image, infoOffset + 8 + kind * 4, `sdat.info.list[${kind}]`)
    const list: SdatRecord[] = []
    records.push(list)
    if (listOffset === 0) continue

    const listAt = infoOffset + listOffset
    const count = u32(image, listAt, `sdat.info.list[${kind}].count`)
    // Record extents are not declared; each record runs to the next one's
    // offset, and the last to the end of the list's region. Only the leading
    // u16 file id is interpreted, so an over-long extent costs nothing.
    const offsets: number[] = []
    for (let i = 0; i < count; i++) {
      offsets.push(u32(image, listAt + 4 + i * 4, `sdat.info.record[${kind}][${i}]`))
    }
    for (let i = 0; i < count; i++) {
      const offset = offsets[i] as number
      if (offset === 0) {
        // An empty slot: the archive leaves a gap in the numbering.
        list.push({
          kind: kind as RecordKindValue,
          index: i,
          name: nameLists[kind]?.[i],
          fileId: undefined,
          data: image.subarray(0, 0),
        })
        continue
      }
      const start = infoOffset + offset
      const nextOffset = offsets.slice(i + 1).find((o) => o > offset)
      const end = nextOffset === undefined ? image.length : infoOffset + nextOffset
      const record = image.subarray(start, Math.min(end, image.length))
      const fileId =
        REFERENCES_FILE[kind] && record.length >= 2 ? u16(record, 0, 'record.fileId') : undefined
      list.push({
        kind: kind as RecordKindValue,
        index: i,
        name: nameLists[kind]?.[i],
        fileId,
        data: record,
      })
    }
  }

  const byName = new Map<string, SdatRecord>()
  for (const list of records) {
    for (const record of list) {
      if (record.name) byName.set(record.name, record)
    }
  }

  const read = (target: number | SdatRecord): Uint8Array => {
    const id = typeof target === 'number' ? target : target.fileId
    if (id === undefined) {
      throw new NitroSndError('record has no file')
    }
    const file = files[id]
    if (!file) {
      throw new NitroSndError(`file id ${id} is outside the ${files.length}-entry archive`)
    }
    return image.subarray(file.start, file.end)
  }

  return {
    version,
    hasSymbols,
    files,
    records,
    sequences: records[RecordKind.Sequence] as SdatRecord[],
    banks: records[RecordKind.Bank] as SdatRecord[],
    waveArchives: records[RecordKind.WaveArchive] as SdatRecord[],
    read,
    record: (name) => byName.get(name),
    sequenceInfo: (record) => {
      if (record.data.length < 10) {
        throw new NitroSndError(`sequence record '${record.name ?? record.index}' is too short`)
      }
      return {
        bankId: u16(record.data, 0x04, 'sequence.bankId'),
        volume: record.data[0x06] as number,
        channelPressure: record.data[0x07] as number,
        polyphonicPressure: record.data[0x08] as number,
        playerPriority: record.data[0x09] as number,
      }
    },
    bankInfo: (record) => {
      if (record.data.length < 12) {
        throw new NitroSndError(`bank record '${record.name ?? record.index}' is too short`)
      }
      return {
        waveArchiveIds: [
          u16(record.data, 0x04, 'bank.wave0'),
          u16(record.data, 0x06, 'bank.wave1'),
          u16(record.data, 0x08, 'bank.wave2'),
          u16(record.data, 0x0a, 'bank.wave3'),
        ],
      }
    },
  }
}
