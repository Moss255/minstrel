import { describe, expect, it } from 'vitest'
import { NitroSndError } from '../src/errors.ts'
import { isSdat, RECORD_KIND_NAMES, RecordKind, readSdat } from '../src/sdat.ts'
import { buildSdat, stamped } from './fixture.ts'

const archive = () =>
  buildSdat({
    sequences: [
      { name: 'BG_001', data: stamped('SSEQ', 64, 1), bankId: 0, volume: 100 },
      { name: 'BG_002', data: stamped('SSEQ', 48, 2), bankId: 1, volume: 90 },
    ],
    banks: [
      {
        name: 'BANK_BG_001',
        data: stamped('SBNK', 32, 3),
        waveArchiveIds: [0, 0xffff, 0xffff, 0xffff],
      },
      {
        name: 'BANK_BG_002',
        data: stamped('SBNK', 40, 4),
        waveArchiveIds: [1, 0xffff, 0xffff, 0xffff],
      },
    ],
    waveArchives: [
      { name: 'WAVE_BG_001', data: stamped('SWAR', 128, 5) },
      { name: 'WAVE_BG_002', data: stamped('SWAR', 96, 6) },
    ],
    players: [{ name: 'PLAYER_0', data: Uint8Array.from([0x10, 0x00, 0x00, 0x00]) }],
  })

describe('readSdat', () => {
  it('reads the container header', () => {
    const sdat = readSdat(archive())
    expect(sdat.version).toBe(0x0100)
    expect(sdat.hasSymbols).toBe(true)
    expect(sdat.files).toHaveLength(6)
  })

  it('names every resource from the symbol block', () => {
    const sdat = readSdat(archive())
    expect(sdat.sequences.map((r) => r.name)).toEqual(['BG_001', 'BG_002'])
    expect(sdat.banks.map((r) => r.name)).toEqual(['BANK_BG_001', 'BANK_BG_002'])
    expect(sdat.waveArchives.map((r) => r.name)).toEqual(['WAVE_BG_001', 'WAVE_BG_002'])
  })

  it('resolves every file id to the stamp its record kind implies', () => {
    const sdat = readSdat(archive())
    const expected: [typeof sdat.sequences, string][] = [
      [sdat.sequences, 'SSEQ'],
      [sdat.banks, 'SBNK'],
      [sdat.waveArchives, 'SWAR'],
    ]
    for (const [list, stamp] of expected) {
      for (const record of list) {
        const bytes = sdat.read(record)
        expect(String.fromCharCode(...bytes.subarray(0, 4)), record.name).toBe(stamp)
      }
    }
  })

  it('round-trips file contents', () => {
    const sdat = readSdat(archive())
    expect(Array.from(sdat.read(sdat.sequences[0] as never))).toEqual(
      Array.from(stamped('SSEQ', 64, 1)),
    )
  })

  it('follows a sequence to its bank and wave archives', () => {
    const sdat = readSdat(archive())
    const sequence = sdat.record('BG_002')
    if (!sequence) throw new Error('fixture is missing BG_002')

    const info = sdat.sequenceInfo(sequence)
    expect(info.bankId).toBe(1)
    expect(info.volume).toBe(90)

    const bank = sdat.banks[info.bankId]
    if (!bank) throw new Error('bank missing')
    expect(bank.name).toBe('BANK_BG_002')

    const waves = sdat.bankInfo(bank).waveArchiveIds.filter((id) => id !== 0xffff)
    expect(waves).toEqual([1])
    expect(sdat.waveArchives[waves[0] as number]?.name).toBe('WAVE_BG_002')
  })

  it('does not read a file id from a record kind that has none', () => {
    // A player record starts with something that is not a FAT index; reading it
    // as one yields a small integer that looks plausible and is meaningless.
    const sdat = readSdat(archive())
    const players = sdat.records[RecordKind.Player]
    expect(players?.[0]?.name).toBe('PLAYER_0')
    expect(players?.[0]?.fileId).toBeUndefined()
  })

  it('works without a symbol block, by index', () => {
    const sdat = readSdat(
      buildSdat({
        sequences: [{ data: stamped('SSEQ', 32, 7) }],
        banks: [{ data: stamped('SBNK', 16, 8) }],
        waveArchives: [{ data: stamped('SWAR', 16, 9) }],
        withoutSymbols: true,
      }),
    )
    expect(sdat.hasSymbols).toBe(false)
    expect(sdat.sequences).toHaveLength(1)
    expect(sdat.sequences[0]?.name).toBeUndefined()
    expect(String.fromCharCode(...sdat.read(0).subarray(0, 4))).toBe('SSEQ')
  })

  it('returns zero-copy views', () => {
    const bytes = archive()
    expect(readSdat(bytes).read(0).buffer).toBe(bytes.buffer)
  })

  it('exposes a name for each record kind', () => {
    expect(RECORD_KIND_NAMES[RecordKind.Sequence]).toBe('sequence')
    expect(RECORD_KIND_NAMES[RecordKind.WaveArchive]).toBe('waveArchive')
    expect(RECORD_KIND_NAMES).toHaveLength(8)
  })

  it('handles an archive with no resources', () => {
    const sdat = readSdat(buildSdat({}))
    expect(sdat.files).toEqual([])
    expect(sdat.sequences).toEqual([])
  })
})

describe('isSdat', () => {
  it('recognises the stamp without validating the body', () => {
    expect(isSdat(archive())).toBe(true)
    expect(isSdat(Uint8Array.from([0x53, 0x44, 0x41, 0x54, 0xff]))).toBe(true)
    expect(isSdat(new Uint8Array(8))).toBe(false)
  })
})

describe('readSdat on malformed input', () => {
  it('rejects a buffer that is not an SDAT', () => {
    expect(() => readSdat(new Uint8Array(64))).toThrow(/not an SDAT/)
  })

  it('rejects a big-endian byte-order mark', () => {
    const data = archive()
    new DataView(data.buffer).setUint16(0x04, 0xfffe, true)
    expect(() => readSdat(data)).toThrow(/byte-order mark/)
  })

  it('rejects a declared size larger than the buffer', () => {
    const data = archive()
    new DataView(data.buffer).setUint32(0x08, data.length + 4096, true)
    expect(() => readSdat(data)).toThrow(/only \d+ are present/)
  })

  it('rejects a missing FAT block', () => {
    const data = archive()
    new DataView(data.buffer).setUint32(0x20, 0, true)
    expect(() => readSdat(data)).toThrow(/missing its INFO or FAT/)
  })

  it('rejects a FAT block with the wrong stamp', () => {
    const data = archive()
    const fatOffset = new DataView(data.buffer).getUint32(0x20, true)
    data.set([0x58, 0x58, 0x58, 0x58], fatOffset)
    expect(() => readSdat(data)).toThrow(/FAT block has stamp/)
  })

  it('rejects a file range past the end of the archive', () => {
    const data = archive()
    const fatOffset = new DataView(data.buffer).getUint32(0x20, true)
    new DataView(data.buffer).setUint32(fatOffset + 12 + 4, 0x7fff_0000, true)
    expect(() => readSdat(data)).toThrow(/past the/)
  })

  it('reports an unknown file id rather than returning empty bytes', () => {
    const sdat = readSdat(archive())
    expect(() => sdat.read(999)).toThrow(/outside the/)
    expect(sdat.record('nope')).toBeUndefined()
  })

  it('rejects a truncated archive', () => {
    expect(() => readSdat(archive().subarray(0, 0x20))).toThrow(NitroSndError)
  })
})
