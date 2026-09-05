import { NitroGfxError } from './errors.ts'

/** Bounds-checked little-endian accessors. Every read names the field it failed on. */

export function checkRange(data: Uint8Array, offset: number, length: number, what: string): void {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(length) || length < 0) {
    throw new NitroGfxError(`${what}: bad range ${offset}+${length}`)
  }
  if (offset + length > data.length) {
    throw new NitroGfxError(
      `${what}: reads ${length} bytes at 0x${offset.toString(16)}, past end of ${data.length}-byte buffer`,
      offset,
    )
  }
}

export function u8(d: Uint8Array, at: number, what = 'u8'): number {
  checkRange(d, at, 1, what)
  return d[at] as number
}

export function u16(d: Uint8Array, at: number, what = 'u16'): number {
  checkRange(d, at, 2, what)
  return (d[at] as number) | ((d[at + 1] as number) << 8)
}

export function u32(d: Uint8Array, at: number, what = 'u32'): number {
  checkRange(d, at, 4, what)
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

/**
 * Read a fixed-length Nitro resource name.
 *
 * Names are 16 bytes, NUL-padded. They are bytes rather than text — see the
 * same note in `@vesper/nitrofs` — so they are decoded byte-transparently and
 * trimmed at the first NUL.
 */
export function resourceName(d: Uint8Array, at: number, length = 16): string {
  checkRange(d, at, length, 'resourceName')
  let out = ''
  for (let i = 0; i < length; i++) {
    const c = d[at + i] as number
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out
}
