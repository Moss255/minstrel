import { NitroFsError } from './errors.ts'

/**
 * Bounds-checked little-endian accessors over a `Uint8Array`.
 *
 * Every read validates its own range so that a truncated or corrupt image
 * produces a `NitroFsError` naming the offset, rather than `undefined` or a
 * silently wrong value. This is deliberately not a `DataView` wrapper: the
 * callers here work in absolute image offsets, and keeping one representation
 * avoids an entire class of base-offset bugs.
 */

export function checkRange(data: Uint8Array, offset: number, length: number, what: string): void {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new NitroFsError(`${what}: non-integer or negative offset ${offset}`)
  }
  if (!Number.isInteger(length) || length < 0) {
    throw new NitroFsError(`${what}: non-integer or negative length ${length}`, offset)
  }
  if (offset + length > data.length) {
    throw new NitroFsError(
      `${what}: reads ${length} bytes at 0x${offset.toString(16)}, past end of ${data.length}-byte image`,
      offset,
    )
  }
}

export function u8(data: Uint8Array, offset: number, what = 'u8'): number {
  checkRange(data, offset, 1, what)
  return data[offset] as number
}

export function u16(data: Uint8Array, offset: number, what = 'u16'): number {
  checkRange(data, offset, 2, what)
  return (data[offset] as number) | ((data[offset + 1] as number) << 8)
}

export function u32(data: Uint8Array, offset: number, what = 'u32'): number {
  checkRange(data, offset, 4, what)
  return (
    ((data[offset] as number) |
      ((data[offset + 1] as number) << 8) |
      ((data[offset + 2] as number) << 16) |
      ((data[offset + 3] as number) << 24)) >>>
    0
  )
}

/**
 * Decode a fixed-length field as ASCII, stopping at the first NUL.
 *
 * NitroFS filenames and the cartridge header's text fields are ASCII by
 * specification. This decodes by hand rather than via `TextDecoder` both
 * because the package must make no encoding assumptions (in-game text uses
 * game-specific encodings and is decoded elsewhere) and because a byte >= 0x80
 * here means the structure is misparsed and should be reported, not mojibake'd.
 */
export function ascii(data: Uint8Array, offset: number, length: number, what = 'ascii'): string {
  checkRange(data, offset, length, what)
  let out = ''
  for (let i = 0; i < length; i++) {
    const c = data[offset + i] as number
    if (c === 0) break
    if (c < 0x20 || c > 0x7e) {
      throw new NitroFsError(
        `${what}: byte 0x${c.toString(16).padStart(2, '0')} at index ${i} is not printable ASCII`,
        offset + i,
      )
    }
    out += String.fromCharCode(c)
  }
  return out
}

/**
 * Decode a run of bytes as a byte-transparent string: each byte becomes the
 * code unit of the same value (i.e. Latin-1). The mapping is lossless and
 * reversible via {@link byteStringToBytes}, so a name decoded this way can
 * still be compared and looked up exactly.
 *
 * NitroFS filenames are *bytes*, not text. They are usually ASCII, but nothing
 * enforces it: this project's reference cartridge ships two names containing
 * Shift-JIS bytes (see `FORMAT.md`). Interpreting them as text would need an
 * encoding this package deliberately does not assume, and rejecting them would
 * make two real archives unreadable — so they are carried through untouched.
 */
export function byteString(
  data: Uint8Array,
  offset: number,
  length: number,
  what = 'byteString',
): string {
  checkRange(data, offset, length, what)
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(data[offset + i] as number)
  return out
}

/** Inverse of {@link byteString}. Throws if a code unit is outside 0..255. */
export function byteStringToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code > 0xff) throw new NitroFsError(`'${text}' is not a byte string at index ${i}`)
    out[i] = code
  }
  return out
}

/** Same as {@link ascii} but replaces unprintable bytes instead of throwing. */
export function asciiLossy(data: Uint8Array, offset: number, length: number): string {
  checkRange(data, offset, length, 'asciiLossy')
  let out = ''
  for (let i = 0; i < length; i++) {
    const c = data[offset + i] as number
    if (c === 0) break
    out += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.'
  }
  return out
}

/** Coerce the accepted input types to a `Uint8Array` view. Never copies. */
export function asBytes(source: Uint8Array | ArrayBuffer | DataView): Uint8Array {
  if (source instanceof Uint8Array) return source
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
}
