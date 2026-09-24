import { GameFormatError } from './errors.ts'

/**
 * The builds a character can be made in — the "Build" knob of character
 * creation, and the one part of an appearance that is a *number* rather than a
 * choice of part.
 *
 * **In the ARM9 binary, not in a file** (the binary is BLZ-packed on the
 * cartridge; unpack it first — see `docs/binaries.md` in `minstrel`). It is
 * **ten pairs of `fx16`**, five for each sex, and the game picks one with
 * `sex * 5 + rand(5)`:
 *
 * ```
 * 02010c58  bl   #0x20742fc          ; rand(5)
 * 02010c5c  ldrb r2, [r4, #0x14]     ; the appearance block's +0x14
 * 02010c68  lsr  r2, r2, #0x1f       ; its bit 0: the sex
 * 02010c6c  add  r2, r2, r2, lsl #2  ; sex * 5
 * 02010c74  lsl  r2, r0, #2          ; four bytes a pair
 * 02010c78  ldrsh r0, [r1, r2]
 * 02010c7c  strh r0, [r4, #0x18]     ; -> the record's +0x178
 * 02010c84  ldrsh r1, [r0, #2]
 * 02010c8c  strh r1, [r4, #0x1a]     ; -> the record's +0x17A
 * ```
 *
 * **Which of the pair is which is INFERRED** — the first is read as height and
 * the second as width, because the second falls steadily across each row of
 * five while the first does not, which is what a "slim to broad" row looks
 * like. Nothing in the code names them.
 *
 * Found by its shape, as `readVocationTrees` is, so another build of the game
 * yields it or says it is not there.
 */

/** Builds to a sex, and sexes: the table is 2 × 5 pairs. */
export const BUILDS_A_SEX = 5
export const BUILD_SEXES = 2

/** `fx16`'s one: the scales are around it, 0.888 to 1.039 on the reference. */
export const BUILD_ONE = 4096

/** The window the values are looked for in — generous, and still far from anything else in the image. */
const LOW = 3000
const HIGH = 5000

/** One build: two `fx16` scales on the figure. */
export interface Build {
  /** INFERRED: how tall, in 4096ths. */
  readonly height: number
  /** INFERRED: how broad, in 4096ths. Falls across each row of five. */
  readonly width: number
}

export interface BuildTable {
  /** Where it begins in the bytes it was found in. */
  readonly offset: number
  /** Five builds for sex 0, then five for sex 1 — see {@link buildFor}. */
  readonly builds: readonly Build[]
}

const values = BUILDS_A_SEX * BUILD_SEXES * 2

/**
 * Whether twenty halfwords at `at` are the table.
 *
 * Two tests, and both are needed: the values all sit in a narrow band around
 * `fx16`'s one, and **the second of each pair falls strictly across each row of
 * five**. The band alone matches plenty of the image; the fall is what makes
 * it the table.
 */
function isTable(view: DataView, at: number): boolean {
  const read = (i: number) => view.getInt16(at + i * 2, true)
  for (let i = 0; i < values; i++) {
    const value = read(i)
    if (value < LOW || value > HIGH) return false
  }
  for (let sex = 0; sex < BUILD_SEXES; sex++) {
    for (let i = 1; i < BUILDS_A_SEX; i++) {
      const before = read(sex * BUILDS_A_SEX * 2 + (i - 1) * 2 + 1)
      const after = read(sex * BUILDS_A_SEX * 2 + i * 2 + 1)
      if (after >= before) return false
    }
  }
  return true
}

/**
 * Find the build table in a binary and read it; throws when its shape is
 * nowhere in the bytes.
 *
 * **The first match wins**, and on the reference cartridge there is exactly
 * one — `readBuildTable`'s own test holds it to that, because a second match
 * would mean the shape is not distinctive enough to trust.
 */
export function readBuildTable(bytes: Uint8Array): BuildTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let at = 0; at + values * 2 <= bytes.length; at += 2) {
    if (!isTable(view, at)) continue
    const builds: Build[] = []
    for (let i = 0; i < BUILDS_A_SEX * BUILD_SEXES; i++) {
      builds.push({
        height: view.getInt16(at + i * 4, true),
        width: view.getInt16(at + i * 4 + 2, true),
      })
    }
    return { offset: at, builds }
  }
  throw new GameFormatError('no build table: ten pairs around 4096 whose widths fall in fives', 0)
}

/**
 * One build, by sex and which of the five — the game's own `sex * 5 + n`.
 * Undefined where either is out of range, rather than a build nobody chose.
 */
export function buildFor(table: BuildTable, sex: number, which: number): Build | undefined {
  if (sex < 0 || sex >= BUILD_SEXES) return undefined
  if (!Number.isInteger(which) || which < 0 || which >= BUILDS_A_SEX) return undefined
  return table.builds[sex * BUILDS_A_SEX + which]
}
