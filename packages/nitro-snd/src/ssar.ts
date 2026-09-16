import { NitroSndError } from './errors.ts'
import { checkSoundFile, DATA_BLOCK, u8, u16, u32 } from './header.ts'

/**
 * SSAR — a sequence archive: many short sequences sharing one command
 * stream, each with its own bank and volumes. The effect archives are made of
 * these. Reference: Gota7, *Nitro Studio 2* sequence-archive specification.
 *
 * After the common header, the DATA block holds at `0x18` the absolute offset
 * of the command stream — `0x20 + 12 × count` — at `0x1C` the entry count,
 * and from `0x20` one 12-byte entry per sequence: `u32` offset into the
 * stream, `u16` bank, `u8` volume, `u8` channel priority, `u8` player
 * priority, `u8` player, `u16` pad. An empty slot's offset is `0xFFFFFFFF`
 * on the reference cartridge — the specification says 0, but there 0 is a
 * real sequence's offset, the first in the stream.
 */
export interface SsarEntry {
  /** Where the sequence starts in {@link Ssar.commands}. */
  readonly offset: number
  /** The bank, an index into the SDAT's bank list. */
  readonly bank: number
  readonly volume: number
  readonly channelPriority: number
  readonly playerPriority: number
  readonly player: number
}

export interface Ssar {
  /** The shared command stream, from its start to the end of the DATA block. */
  readonly commands: Uint8Array
  /** By slot; `undefined` for an empty slot. */
  readonly entries: readonly (SsarEntry | undefined)[]
}

export function isSsar(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x53 && data[1] === 0x53 && data[2] === 0x41 && data[3] === 0x52
  )
}

export function readSsar(data: Uint8Array): Ssar {
  const blockSize = checkSoundFile(data, 'SSAR')
  const dataOffset = u32(data, DATA_BLOCK + 8, 'ssar.dataOffset')
  const count = u32(data, DATA_BLOCK + 12, 'ssar.count')
  const table = DATA_BLOCK + 16
  const end = DATA_BLOCK + blockSize
  if (table + count * 12 > dataOffset || dataOffset > end) {
    throw new NitroSndError(
      `ssar of ${count} entries has its stream at 0x${dataOffset.toString(16)}, which does not fit`,
      DATA_BLOCK + 8,
    )
  }
  const commands = data.subarray(dataOffset, end)
  const entries: (SsarEntry | undefined)[] = []
  for (let i = 0; i < count; i++) {
    const at = table + i * 12
    const offset = u32(data, at, `ssar.entry[${i}].offset`)
    if (offset === 0xffffffff) {
      entries.push(undefined)
      continue
    }
    if (offset >= commands.length) {
      throw new NitroSndError(`ssar entry ${i} starts at ${offset}, past its stream`, at)
    }
    entries.push({
      offset,
      bank: u16(data, at + 4, 'ssar.entry.bank'),
      volume: u8(data, at + 6, 'ssar.entry.volume'),
      channelPriority: u8(data, at + 7, 'ssar.entry.channelPriority'),
      playerPriority: u8(data, at + 8, 'ssar.entry.playerPriority'),
      player: u8(data, at + 9, 'ssar.entry.player'),
    })
  }
  return { commands, entries }
}
