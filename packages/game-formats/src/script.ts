import { GameFormatError } from './errors.ts'

/**
 * An event script: the `.stb`, magic `SB2`, inside each `/data/event/ev#####.gp2`.
 *
 * Established by observation; the evidence is in `FORMAT.md`, "Event scripts".
 * This reads the structure — the header, the sections, and the routines they
 * and the shared block are made of, each as a run of three-word instructions to
 * its return. **What an instruction does is the script engine's business**, not
 * this parser's: an opcode and its two arguments are handed over as they are.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | `SB2\0` |
 * | `+0x04` | `u32` | size of the block of routines every event carries |
 * | `+0x08` | `u32` | end of the section table, and **where code addresses count from** |
 * | `+0x0C` | `u32` | start of the section table |
 * | `+0x10` | `u32` | number of sections |
 * | `+0x18` | `u32` | `unknown_0x18` |
 * | table | `u32[2]` each | a section's number, then its routine's file offset |
 *
 * A routine is a 14-word header and then its code:
 *
 * | offset | meaning |
 * |---|---|
 * | `+0x00` | the address of its first instruction, counted from the code base — which is how a routine is recognised |
 * | `+0x04` | `unknown_0x04`, zero wherever seen |
 * | `+0x08` | how many local variables it has, its parameters among them |
 * | `+0x0C` | how many parameters it takes |
 * | `+0x10` .. `+0x37` | `unknown_0x10`: a 1 per parameter where there are any |
 * | `+0x38` | instructions, three `u32`s each — an opcode and two arguments — to `0x0F` |
 */

/** `SB2\0`, read as a little-endian word. */
export const SCRIPT_MAGIC = 0x00324253
/** A routine's header: its first instruction is this far in. */
export const ROUTINE_HEADER = 0x38
/** The instruction that ends a routine. */
export const OP_RETURN = 0x0f

export interface ScriptInstruction {
  /** File offset of the instruction. */
  readonly at: number
  readonly op: number
  readonly a: number
  readonly b: number
}

export interface ScriptRoutine {
  /** File offset of its header. */
  readonly at: number
  readonly unknown_0x04: number
  /** How many local variables it has, its parameters among them. */
  readonly locals: number
  /** How many values a call hands it, into its first locals. */
  readonly params: number
  /** Header words `+0x10` to `+0x37`, as stored. */
  readonly unknown_0x10: readonly number[]
  /** Its instructions, the return included. */
  readonly code: readonly ScriptInstruction[]
}

export interface ScriptSection {
  /** The section's number: 100, 200 or 300 on nearly every event. */
  readonly id: number
  readonly routine: ScriptRoutine
}

export interface Script {
  readonly sharedSize: number
  /** Where code addresses count from: a jump's or a call's target is an offset from here. */
  readonly base: number
  readonly unknown_0x18: number
  readonly sections: readonly ScriptSection[]
  /** The routine whose header is at `base + address`: what a call names. */
  routineAt(address: number): ScriptRoutine
  /**
   * The bytes of the NUL-terminated string at a file offset, which is what a
   * string operand names. Left undecoded: motion and model names are ASCII,
   * the developers' notes Shift-JIS.
   */
  stringAt(offset: number): Uint8Array
}

/** Parse an event script. */
export function readScript(bytes: Uint8Array): Script {
  if (bytes.length < 0x40) {
    throw new GameFormatError(`script is ${bytes.length} bytes, shorter than its header`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u32 = (at: number, what: string): number => {
    if (at < 0 || at + 4 > bytes.length) {
      throw new GameFormatError(`script ${what}: read at 0x${at.toString(16)} is past the end`, at)
    }
    return view.getUint32(at, true)
  }
  if (u32(0, 'magic') !== SCRIPT_MAGIC) throw new GameFormatError('not an SB2 script', 0)

  const sharedSize = u32(0x04, 'shared size')
  const base = u32(0x08, 'table end')
  const tableStart = u32(0x0c, 'table start')
  const count = u32(0x10, 'section count')
  if (tableStart + count * 8 > bytes.length) {
    throw new GameFormatError(
      `script's ${count} sections from 0x${tableStart.toString(16)} run past the end`,
      0x10,
    )
  }

  const routines = new Map<number, ScriptRoutine>()
  const routine = (at: number): ScriptRoutine => {
    const known = routines.get(at)
    if (known) return known
    if (u32(at, 'routine header') !== at - base + ROUTINE_HEADER) {
      throw new GameFormatError(
        `no routine at 0x${at.toString(16)}: it does not carry its own entry address`,
        at,
      )
    }
    const code: ScriptInstruction[] = []
    for (let pc = at + ROUTINE_HEADER; ; pc += 12) {
      if (pc + 12 > bytes.length) {
        throw new GameFormatError(
          `routine at 0x${at.toString(16)} runs off the end before its return`,
          pc,
        )
      }
      const op = view.getUint32(pc, true)
      code.push({ at: pc, op, a: view.getUint32(pc + 4, true), b: view.getUint32(pc + 8, true) })
      if (op === OP_RETURN) break
    }
    const found: ScriptRoutine = {
      at,
      unknown_0x04: u32(at + 0x04, 'routine'),
      locals: u32(at + 0x08, 'routine'),
      params: u32(at + 0x0c, 'routine'),
      unknown_0x10: Array.from({ length: 10 }, (_, i) => u32(at + 0x10 + i * 4, 'routine')),
      code,
    }
    routines.set(at, found)
    return found
  }

  const sections: ScriptSection[] = []
  for (let i = 0; i < count; i++) {
    sections.push({
      id: u32(tableStart + i * 8, 'section'),
      routine: routine(u32(tableStart + i * 8 + 4, 'section')),
    })
  }

  return {
    sharedSize,
    base,
    unknown_0x18: u32(0x18, 'header'),
    sections,
    routineAt: (address) => routine(base + address),
    stringAt: (offset) => {
      if (offset < 0 || offset >= bytes.length) {
        throw new GameFormatError(
          `string at 0x${offset.toString(16)} is outside the script`,
          offset,
        )
      }
      const end = bytes.indexOf(0, offset)
      if (end < 0)
        throw new GameFormatError(`string at 0x${offset.toString(16)} has no end`, offset)
      return bytes.subarray(offset, end)
    },
  }
}
