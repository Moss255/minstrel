import { NitroSndError } from './errors.ts'
import { checkSoundFile, DATA_BLOCK, u32 } from './header.ts'

/**
 * SSEQ — a sequence: the command stream a player runs.
 *
 * After the common header (`header.ts`), the DATA block holds at `+0x08` the
 * absolute offset of the command stream, which runs to the end of the block.
 * The commands themselves are interpreted by a player, not here; what this
 * reads is where they start. Reference: Gota7, *Nitro Studio 2* sequence
 * specification.
 */
export interface Sseq {
  /** The command stream, from its first byte to the end of the DATA block. */
  readonly commands: Uint8Array
  /** Where the stream begins in the file — jump and call targets are relative to it. */
  readonly dataOffset: number
}

export function isSseq(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x53 && data[1] === 0x53 && data[2] === 0x45 && data[3] === 0x51
  )
}

export function readSseq(data: Uint8Array): Sseq {
  const blockSize = checkSoundFile(data, 'SSEQ')
  const dataOffset = u32(data, DATA_BLOCK + 8, 'sseq.dataOffset')
  const end = DATA_BLOCK + blockSize
  if (dataOffset < DATA_BLOCK + 12 || dataOffset > end) {
    throw new NitroSndError(
      `sseq command stream at 0x${dataOffset.toString(16)} is outside its DATA block`,
      DATA_BLOCK + 8,
    )
  }
  return { commands: data.subarray(dataOffset, end), dataOffset }
}
