import { NitroFsError } from '@vesper/nitrofs'

/**
 * Turn a cartridge filename into one that is safe to create on a host
 * filesystem, reversibly.
 *
 * Cartridge names are bytes and are not constrained to anything: they may hold
 * path separators, control characters, or — as on this project's reference
 * cartridge — Shift-JIS bytes. Writing them out verbatim risks escaping the
 * output directory or producing names the host rejects.
 *
 * Every byte outside a conservative safe set becomes `%XX`, so the mapping is
 * unambiguous and can be undone. A name that needed escaping is reported, and
 * the extractor records its original bytes in the manifest.
 */

const SAFE = /^[A-Za-z0-9._@+-]$/

export interface SafeName {
  /** The name as written to disk. */
  readonly safe: string
  /** True when anything had to be escaped. */
  readonly escaped: boolean
  /** Lowercase hex of the original bytes, present only when escaped. */
  readonly originalHex: string | undefined
}

export function toSafeName(name: string): SafeName {
  let safe = ''
  let escaped = false

  for (let i = 0; i < name.length; i++) {
    const char = name[i] as string
    const code = name.charCodeAt(i)
    if (code > 0xff) {
      throw new NitroFsError(`name '${name}' is not a byte string at index ${i}`)
    }
    if (SAFE.test(char) && char !== '%') {
      safe += char
    } else {
      safe += `%${code.toString(16).padStart(2, '0').toUpperCase()}`
      escaped = true
    }
  }

  // '.' and '..' are legal cartridge names but not usable as directory entries.
  if (safe === '.' || safe === '..' || safe === '') {
    safe = safe.replace(/\./g, '%2E')
    if (safe === '') safe = '%00'
    escaped = true
  }

  let originalHex: string | undefined
  if (escaped) {
    originalHex = ''
    for (let i = 0; i < name.length; i++) {
      originalHex += name.charCodeAt(i).toString(16).padStart(2, '0')
    }
  }

  return { safe, escaped, originalHex }
}

/** Apply {@link toSafeName} to every segment of a `/`-separated cartridge path. */
export function toSafePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => toSafeName(segment).safe)
    .join('/')
}
