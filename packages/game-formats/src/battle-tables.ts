import { GameFormatError } from './errors.ts'

/**
 * The weights a monster's six ways are drawn by — the tables in the ARM9
 * binary, unpacked. See FORMAT.md, "Battle weight tables".
 *
 * A run of tables of six bytes each summing to 256, the first the even table
 * `43 42 43 43 42 43` that the reference battle emulator gives every ordinary
 * monster, the second `68 58 48 38 27 17`, the falling one it gives its own
 * boss. The run is found by the even table and read to its end; on the
 * reference cartridge there are four.
 */
export const WAYS = 6
export const WEIGHT_TOTAL = 256
export const EVEN_TABLE: readonly number[] = [43, 42, 43, 43, 42, 43]

export interface WeightTables {
  /** Where the run begins in the bytes it was found in. */
  readonly offset: number
  /** Each table's six weights, in 256, in the order they lie. */
  readonly tables: readonly (readonly number[])[]
}

function sumsTo256(bytes: Uint8Array, at: number): boolean {
  let sum = 0
  for (let i = 0; i < WAYS; i++) {
    const v = bytes[at + i] as number
    if (v === 0) return false
    sum += v
  }
  return sum === WEIGHT_TOTAL
}

/** Find the run by its even table and read every table that follows it; throws when the even table is nowhere. */
export function readWeightTables(bytes: Uint8Array): WeightTables {
  for (let at = 0; at + WAYS <= bytes.length; at++) {
    let even = true
    for (let i = 0; i < WAYS && even; i++) even = bytes[at + i] === EVEN_TABLE[i]
    if (!even) continue
    const tables: number[][] = []
    for (let next = at; next + WAYS <= bytes.length && sumsTo256(bytes, next); next += WAYS) {
      tables.push([...bytes.subarray(next, next + WAYS)])
    }
    if (tables.length >= 2) return { offset: at, tables }
  }
  throw new GameFormatError(
    'no battle weight tables: the even table 43 42 43 43 42 43 is nowhere',
    0,
  )
}
