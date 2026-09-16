import { ascii, asciiLossy } from '@minstrel/nitrofs'

/**
 * Which cartridge this is. The slice was read against one dump — the
 * European release, whose header's game code is `YDQP` — and every reading
 * in this repository was measured on it, so a dump that differs is said so
 * before anything is read from it. The bytes are hashed here, on this
 * machine, and never leave it; nothing of the cartridge is kept in the code
 * but the hash, the size and the four-letter code.
 */
export const REFERENCE = {
  sha1: 'ff761d349709f329c8ac4bd0023fdce21861e8a1',
  size: 268_435_456,
  gameCode: 'YDQP',
} as const

export type Verdict =
  /** The dump the slice was built against, byte for byte. */
  | 'reference'
  /** The same title by its game code, but not that dump: another region's, a trimmed or patched one. */
  | 'same-title'
  /** Some other cartridge, or not a cartridge at all. */
  | 'other'

export interface CartridgeIdentity {
  readonly sha1: string
  readonly size: number
  /** The header's title and game code, where the bytes have a header; empty otherwise. */
  readonly title: string
  readonly gameCode: string
  readonly verdict: Verdict
}

/** The SHA-1 of the bytes, in lower-case hex, by the platform's own digest. */
export async function sha1Of(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Identify a dump: its hash, its size, its header, and how it stands to the reference. */
export async function identifyCartridge(bytes: Uint8Array): Promise<CartridgeIdentity> {
  // The header's title at 0x000 and game code at 0x00C, as `parseRomHeader`
  // reads them (nitrofs' FORMAT.md, the cartridge header); read alone here,
  // so a file that is not a cartridge is identified rather than refused.
  let title = ''
  let gameCode = ''
  if (bytes.length >= 0x10) {
    title = asciiLossy(bytes, 0, 12).replace(/\0+$/, '').trim()
    try {
      gameCode = ascii(bytes, 0x0c, 4, 'header.gameCode')
    } catch {
      gameCode = ''
    }
  }
  const sha1 = await sha1Of(bytes)
  const verdict: Verdict =
    sha1 === REFERENCE.sha1 && bytes.length === REFERENCE.size
      ? 'reference'
      : gameCode === REFERENCE.gameCode
        ? 'same-title'
        : 'other'
  return { sha1, size: bytes.length, title, gameCode, verdict }
}

/** Bytes as a person reads them: `256 MiB`. */
export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MiB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`
  return `${bytes} bytes`
}

/** One line saying what was checked and what it is. */
export function describeIdentity(id: CartridgeIdentity): string {
  const what = id.title ? `${id.title} (${id.gameCode})` : 'no cartridge header'
  const hash = `sha1 ${id.sha1.slice(0, 12)}…, ${humanSize(id.size)}`
  switch (id.verdict) {
    case 'reference':
      return `${what} — the reference dump, ${hash}`
    case 'same-title':
      return `${what} — the same title but not the reference dump (${hash}): what was read here may differ`
    case 'other':
      return `${what} — not the title this plays (${hash}); expect nothing to work`
  }
}
