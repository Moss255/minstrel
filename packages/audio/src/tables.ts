/**
 * The tables the DS's sound driver plays by.
 *
 * Three are the BIOS's own, which the driver reads with SWI 1Ah–1Ch and which
 * follow formulas exactly — checked entry for entry against a BIOS dump
 * (DeSmuME's `bios.cpp`): the sine and pitch tables to the last bit, the
 * volume table on 721 of its 724 entries. The rest are the driver's, taken
 * from fincs's FeOS Sound System (`fssdata.c`, WTFPL, "adapted from
 * VGMTrans"), which reproduces the SDK's envelope conversions.
 */

/** The pitch table: 768 steps to the octave, `round(2^(i/768) × 65536) − 65536`. */
export const PITCH_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(768)
  for (let i = 0; i < 768; i++) table[i] = Math.round(2 ** (i / 768) * 65536) - 65536
  return table
})()

/** The driver's loudness unit: 723 steps of 0.1 dB from silence to full. */
export const AMPL_K = 723

/**
 * The volume table: a decibel curve, 0.1 dB a step, over 724 entries, folded
 * into four bands the channel's volume divider unfolds — `/16` below 483, `/4`
 * below 603, `/2` below 663, whole above. `min(127, round(128 × 10^((i−723)/200)
 * × divider))`; the BIOS has 126 where that gives 127 at 602, 662 and 722, one
 * under each band's top, and those three are set so here.
 */
export const VOLUME_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(724)
  for (let i = 0; i < 724; i++) {
    table[i] = Math.min(127, Math.round(128 * 10 ** ((i - 723) / 200) * volumeDivider(i)))
  }
  for (const i of [602, 662, 722]) table[i] = 126
  return table
})()

/** The divider the driver sets beside the table's value — see {@link VOLUME_TABLE}. */
export function volumeDivider(loudness: number): number {
  if (loudness < AMPL_K - 240) return 16
  if (loudness < AMPL_K - 120) return 4
  if (loudness < AMPL_K - 60) return 2
  return 1
}

/** A quarter wave of sine in 32 steps, ±127 — the driver's LFO. */
const SINE_QUARTER: readonly number[] = [
  0, 6, 12, 19, 25, 31, 37, 43, 49, 54, 60, 65, 71, 76, 81, 85, 90, 94, 98, 102, 106, 109, 112, 115,
  117, 120, 122, 123, 125, 126, 126, 127, 127,
]

/** The LFO's value at a phase of 0–127. */
export function sine(phase: number): number {
  const p = ((phase % 128) + 128) % 128
  if (p < 32) return SINE_QUARTER[p] as number
  if (p < 64) return SINE_QUARTER[64 - p] as number
  if (p < 96) return -(SINE_QUARTER[p - 64] as number) || 0
  return -(SINE_QUARTER[128 - p] as number) || 0
}

/** An attack value's per-tick multiplier over 255 — the envelope climbs by this fraction of what is left. */
export function attackRate(attack: number): number {
  const lut = [
    0x00, 0x01, 0x05, 0x0e, 0x1a, 0x26, 0x33, 0x3f, 0x49, 0x54, 0x5c, 0x64, 0x6d, 0x74, 0x7b, 0x7f,
    0x84, 0x89, 0x8f,
  ]
  const a = attack & 0x80 ? 0 : attack
  return a >= 0x6d ? (lut[0x7f - a] as number) : 0xff - a
}

/** A decay or release value's per-tick fall, in loudness with seven fractional bits. */
export function fallRate(fall: number): number {
  const f = fall & 0x80 ? 0 : fall
  if (f === 0x7f) return 0xffff
  if (f === 0x7e) return 0x3c00
  if (f < 0x32) return ((f << 1) + 1) & 0xffff
  return Math.floor(0x1e00 / (0x7e - f)) & 0xffff
}

const SUSTAIN_LUT: readonly number[] = [
  -32768, -722, -721, -651, -601, -562, -530, -503, -480, -460, -442, -425, -410, -396, -383, -371,
  -360, -349, -339, -330, -321, -313, -305, -297, -289, -282, -276, -269, -263, -257, -251, -245,
  -239, -234, -229, -224, -219, -214, -210, -205, -201, -196, -192, -188, -184, -180, -176, -173,
  -169, -165, -162, -158, -155, -152, -149, -145, -142, -139, -136, -133, -130, -127, -125, -122,
  -119, -116, -114, -111, -109, -106, -103, -101, -99, -96, -94, -91, -89, -87, -85, -82, -80, -78,
  -76, -74, -72, -70, -68, -66, -64, -62, -60, -58, -56, -54, -52, -50, -49, -47, -45, -43, -42,
  -40, -38, -36, -35, -33, -31, -30, -28, -27, -25, -23, -22, -20, -19, -17, -16, -14, -13, -11,
  -10, -8, -7, -6, -4, -3, -1, 0,
]

/** A 0–127 level — a sustain, a volume, a velocity — as loudness below full: the driver's quadratic curve. */
export function loudness(level: number): number {
  return SUSTAIN_LUT[level & 0x80 ? 0 : level] as number
}

/** The driver's own generator, a linear congruence: deterministic, and not the game's. */
export class Random {
  private seed = 0x12345678
  next(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed >>> 16
  }
}
