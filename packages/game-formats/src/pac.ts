import { GameFormatError } from './errors.ts'

/**
 * `.pac` — a plain pack of named files: the palettes, characters and cells of
 * the 2D screens, and some models and effects. Established by observation; the
 * evidence is in `FORMAT.md`, "`.pac`".
 *
 * An entry is a 0x50-byte head, then its data:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[0x40]` | the name, to a NUL; what follows it is left over, `unknown` |
 * | `+0x40` | `u32` | the head's size, 0x50 |
 * | `+0x44` | `u32` | the data's size |
 * | `+0x48` | `u32` | from this entry to the next: head and data, rounded up to 16 |
 * | `+0x4C` | `u32` | `unknown_0x4c` |
 *
 * The chain ends on a head of 0x50 zero bytes, or on one whose size and next
 * are both `0xFFFFFFFF`.
 */

const HEAD = 0x50
const NAME = 0x40
const ENDS = 0xffffffff

export interface PacMember {
  readonly name: string
  readonly data: Uint8Array
  /** The entry's 0x50-byte head as it stands, its unknowns included. */
  readonly head: Uint8Array
}

export interface Pac {
  readonly members: readonly PacMember[]
  /** Where the end marker's head ends. */
  readonly end: number
}

/** Whether these bytes start as a pack's first entry would. */
export function isPac(data: Uint8Array): boolean {
  if (data.length < HEAD) return false
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(NAME, true) === HEAD
}

export function readPac(data: Uint8Array): Pac {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const members: PacMember[] = []
  let at = 0
  for (;;) {
    if (at + HEAD > data.length) {
      throw new GameFormatError(`pack runs out at 0x${at.toString(16)} before its end marker`, at)
    }
    const head = data.subarray(at, at + HEAD)
    const headSize = view.getUint32(at + NAME, true)
    const size = view.getUint32(at + NAME + 4, true)
    const next = view.getUint32(at + NAME + 8, true)
    if (head.every((byte) => byte === 0) || (size === ENDS && next === ENDS)) {
      return { members, end: at + HEAD }
    }
    if (headSize !== HEAD) {
      throw new GameFormatError(
        `pack entry says its head is ${headSize} bytes, not 0x50`,
        at + NAME,
      )
    }
    if (at + HEAD + size > data.length) {
      throw new GameFormatError(
        `pack entry's ${size} bytes run past the pack's ${data.length}`,
        at + NAME + 4,
      )
    }
    if (next < HEAD + size) {
      throw new GameFormatError(
        `pack entry's next, 0x${next.toString(16)}, falls inside its own data`,
        at + NAME + 8,
      )
    }
    let name = ''
    for (let i = at; i < at + NAME && data[i] !== 0; i++)
      name += String.fromCharCode(data[i] as number)
    members.push({ name, data: data.subarray(at + HEAD, at + HEAD + size), head })
    at += next
  }
}
