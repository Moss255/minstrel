/**
 * Container signature sniffing.
 *
 * This is deliberately *not* a parser: it reads the first few bytes of a file
 * and reports which published container format the signature belongs to. It
 * never interprets struct fields, so it cannot invent a layout. Anything it
 * does not recognise is reported as unknown, with its leading bytes shown, so
 * that unidentified formats stay visible instead of being quietly bucketed.
 *
 * Signatures are from the Nintendo DS file-format references:
 *  - GBATEK, "DS Files"
 *  - the Nintendo DS file formats wiki (NSBMD/NSBTX/NSBCA, NARC, SDAT, NCLR
 *    and friends, NFTR)
 *  - the Nitro SDK compression header, documented in GBATEK under
 *    "BIOS Decompression Functions"
 *
 * Nintendo's Nitro containers store their magic as a four-character stamp that
 * is byte-reversed for some families ('RLCN' on disk is the NCLR palette
 * format); both spellings are listed where that applies.
 */

export interface Signature {
  /** Four-character stamp as it appears on disk. */
  readonly magic: string
  /** Conventional name and file extension. */
  readonly label: string
  readonly category: SignatureCategory
}

export type SignatureCategory =
  | 'model'
  | 'texture'
  | 'animation'
  | 'archive'
  | 'graphics'
  | 'audio'
  | 'font'
  | 'compressed'
  | 'unknown'

const SIGNATURES: readonly Signature[] = [
  { magic: 'BMD0', label: 'NSBMD model', category: 'model' },
  { magic: 'BTX0', label: 'NSBTX texture', category: 'texture' },
  { magic: 'BCA0', label: 'NSBCA joint animation', category: 'animation' },
  { magic: 'BTP0', label: 'NSBTP texture-pattern animation', category: 'animation' },
  { magic: 'BTA0', label: 'NSBTA texture-SRT animation', category: 'animation' },
  { magic: 'BMA0', label: 'NSBMA material animation', category: 'animation' },
  { magic: 'BVA0', label: 'NSBVA visibility animation', category: 'animation' },

  { magic: 'NARC', label: 'NARC archive', category: 'archive' },
  { magic: 'CRAN', label: 'NARC archive (reversed stamp)', category: 'archive' },

  { magic: 'SDAT', label: 'SDAT sound archive', category: 'audio' },
  { magic: 'SSEQ', label: 'SSEQ sequence', category: 'audio' },
  { magic: 'SSAR', label: 'SSAR sequence archive', category: 'audio' },
  { magic: 'SBNK', label: 'SBNK instrument bank', category: 'audio' },
  { magic: 'SWAR', label: 'SWAR wave archive', category: 'audio' },
  { magic: 'STRM', label: 'STRM stream', category: 'audio' },

  { magic: 'RLCN', label: 'NCLR palette', category: 'graphics' },
  { magic: 'RGCN', label: 'NCGR character graphics', category: 'graphics' },
  { magic: 'RCSN', label: 'NSCR screen', category: 'graphics' },
  { magic: 'RECN', label: 'NCER cell', category: 'graphics' },
  { magic: 'RNAN', label: 'NANR cell animation', category: 'graphics' },
  { magic: 'RNCN', label: 'NCEC / NMCR multi-cell', category: 'graphics' },

  { magic: 'RTFN', label: 'NFTR font', category: 'font' },
]

const BY_MAGIC = new Map(SIGNATURES.map((s) => [s.magic, s]))

/**
 * Nitro compression header: high nibble of byte 0 selects the codec, and the
 * following three bytes are the decompressed size, little-endian. Only the
 * codecs named in GBATEK are listed; an unrecognised nibble is not guessed at.
 */
const COMPRESSION: ReadonlyMap<number, string> = new Map([
  [0x10, 'LZ77 (LZ10)'],
  [0x11, 'LZ77 (LZ11)'],
  [0x24, 'Huffman, 4-bit'],
  [0x28, 'Huffman, 8-bit'],
  [0x30, 'run-length'],
])

export interface Identification {
  readonly category: SignatureCategory
  readonly label: string
  /** Printable rendering of the first four bytes, for unknown files. */
  readonly leadingBytes: string
  /** Declared decompressed size, when the file carries a compression header. */
  readonly decompressedSize?: number
}

function printableStamp(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < 4 && i < data.length; i++) {
    const c = data[i] as number
    out += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.'
  }
  return out
}

function hexStamp(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < 4 && i < data.length; i++) {
    out += (data[i] as number).toString(16).padStart(2, '0')
  }
  return out
}

/** Identify a file from its leading bytes. Reads at most the first four. */
export function identify(data: Uint8Array): Identification {
  const leadingBytes = `${printableStamp(data)} ${hexStamp(data)}`.trim()

  if (data.length === 0) {
    return { category: 'unknown', label: 'empty', leadingBytes: '' }
  }
  if (data.length >= 4) {
    const stamp = printableStamp(data)
    const known = BY_MAGIC.get(stamp)
    if (known) return { category: known.category, label: known.label, leadingBytes }

    const codec = COMPRESSION.get(data[0] as number)
    if (codec !== undefined) {
      const size =
        ((data[1] as number) | ((data[2] as number) << 8) | ((data[3] as number) << 16)) >>> 0
      // A zero declared size is how the Nitro header signals "size follows in a
      // 32-bit extension"; treat a nonsensical value as "not actually compressed"
      // rather than asserting a codec we cannot back up.
      if (size > 0) {
        return {
          category: 'compressed',
          label: `${codec}, ${size} bytes decompressed`,
          leadingBytes,
          decompressedSize: size,
        }
      }
    }
  }
  return { category: 'unknown', label: 'unidentified', leadingBytes }
}

export { SIGNATURES }
