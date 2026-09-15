import { NitroSndError } from './errors.ts'

/**
 * The header every Nitro sound file shares — SSEQ, SBNK, SWAR, SWAV, STRM:
 *
 *   0x00  char[4]  stamp
 *   0x04  u16      byte-order mark, 0xFEFF
 *   0x06  u16      version
 *   0x08  u32      file size
 *   0x0C  u16      header size, 0x10
 *   0x0E  u16      block count
 *   0x10  char[4]  'DATA'
 *   0x14  u32      DATA block size
 *
 * Reference: Gota7, *Nitro Studio 2* specifications (sequence, bank, wave),
 * https://gota7.github.io/NitroStudio2/specs/ — the "Sound File Header" and
 * "Data Block" each file opens with.
 */
export const DATA_BLOCK = 0x10

export function u8(d: Uint8Array, at: number, what: string): number {
  if (at + 1 > d.length) throw new NitroSndError(`${what}: read past end`, at)
  return d[at] as number
}

export function u16(d: Uint8Array, at: number, what: string): number {
  if (at + 2 > d.length) throw new NitroSndError(`${what}: read past end`, at)
  return (d[at] as number) | ((d[at + 1] as number) << 8)
}

export function u32(d: Uint8Array, at: number, what: string): number {
  if (at + 4 > d.length) throw new NitroSndError(`${what}: read past end`, at)
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

export function stampAt(d: Uint8Array, at: number): string {
  let out = ''
  for (let i = 0; i < 4 && at + i < d.length; i++) {
    const c = d[at + i] as number
    out += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.'
  }
  return out
}

/** Check a sound file's stamp, byte order and DATA block; answer the DATA block's size. */
export function checkSoundFile(data: Uint8Array, stamp: string): number {
  if (stampAt(data, 0) !== stamp) {
    throw new NitroSndError(`not ${stamp}: stamp is '${stampAt(data, 0)}'`, 0)
  }
  const bom = u16(data, 0x04, `${stamp}.bom`)
  if (bom !== 0xfeff)
    throw new NitroSndError(`${stamp} byte-order mark is 0x${bom.toString(16)}`, 4)
  const size = u32(data, 0x08, `${stamp}.size`)
  if (size > data.length) {
    throw new NitroSndError(`${stamp} declares ${size} bytes but ${data.length} are present`, 8)
  }
  if (stampAt(data, DATA_BLOCK) !== 'DATA') {
    throw new NitroSndError(
      `${stamp} has no DATA block at 0x10: '${stampAt(data, DATA_BLOCK)}'`,
      0x10,
    )
  }
  const blockSize = u32(data, DATA_BLOCK + 4, `${stamp}.data.size`)
  if (DATA_BLOCK + blockSize > size) {
    throw new NitroSndError(`${stamp} DATA block of ${blockSize} bytes runs past the file`, 0x14)
  }
  return blockSize
}
