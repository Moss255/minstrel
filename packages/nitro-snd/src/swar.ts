import { NitroSndError } from './errors.ts'
import { checkSoundFile, DATA_BLOCK, u8, u16, u32 } from './header.ts'

/**
 * SWAR — a wave archive, and the waves in it.
 *
 * After the common header, the DATA block holds 32 reserved bytes, then at
 * `0x38` the wave count and at `0x3C` one `u32` absolute offset per wave.
 * Each wave is a 12-byte info block and then its samples — a SWAV without its
 * file header. Reference: Gota7, *Nitro Studio 2* wave and wave-archive
 * specifications; fincs's FeOS Sound System, `SWAVINFO` in `sbnkswar.h`.
 *
 * The info block:
 *
 *   +0x00  u8   format: 0 PCM8, 1 PCM16, 2 IMA-ADPCM
 *   +0x01  u8   loops
 *   +0x02  u16  sample rate
 *   +0x04  u16  timer: 16756991 / sample rate, the ARM7 clock over the rate
 *   +0x06  u16  loop start, in 32-bit words of sample data
 *   +0x08  u32  length after the loop start, in words
 */
export const WaveFormat = { Pcm8: 0, Pcm16: 1, Adpcm: 2 } as const

export interface Wave {
  readonly format: 0 | 1 | 2
  readonly loops: boolean
  readonly sampleRate: number
  /** The DS channel timer for the wave's own rate — see the header. */
  readonly timer: number
  /** In words: multiply by 4 for bytes. */
  readonly loopStart: number
  readonly loopLength: number
  /** The sample data, exactly `(loopStart + loopLength) * 4` bytes. */
  readonly data: Uint8Array
}

export interface Swar {
  readonly waves: readonly Wave[]
}

/** The ARM7 clock the timer field divides: 33.513982 MHz over 2. */
export const ARM7_CLOCK = 16756991

export function isSwar(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x53 && data[1] === 0x57 && data[2] === 0x41 && data[3] === 0x52
  )
}

export function readWave(data: Uint8Array, at: number): Wave {
  const format = u8(data, at, 'swav.format')
  if (format > 2) throw new NitroSndError(`swav format ${format} is not PCM8, PCM16 or ADPCM`, at)
  const loops = u8(data, at + 1, 'swav.loops') !== 0
  const sampleRate = u16(data, at + 2, 'swav.sampleRate')
  const timer = u16(data, at + 4, 'swav.timer')
  const loopStart = u16(data, at + 6, 'swav.loopStart')
  const loopLength = u32(data, at + 8, 'swav.loopLength')
  const bytes = (loopStart + loopLength) * 4
  const start = at + 12
  if (start + bytes > data.length) {
    throw new NitroSndError(`swav of ${bytes} sample bytes runs past the end`, at + 8)
  }
  return {
    format: format as 0 | 1 | 2,
    loops,
    sampleRate,
    timer,
    loopStart,
    loopLength,
    data: data.subarray(start, start + bytes),
  }
}

export function readSwar(data: Uint8Array): Swar {
  checkSoundFile(data, 'SWAR')
  const count = u32(data, DATA_BLOCK + 0x28, 'swar.count')
  const table = DATA_BLOCK + 0x2c
  if (table + count * 4 > data.length) {
    throw new NitroSndError(
      `swar declares ${count} waves, past the end of the file`,
      DATA_BLOCK + 0x28,
    )
  }
  const waves: Wave[] = []
  for (let i = 0; i < count; i++) {
    const offset = u32(data, table + i * 4, `swar.wave[${i}]`)
    if (offset < table + count * 4 || offset + 12 > data.length) {
      throw new NitroSndError(
        `swar wave ${i} at 0x${offset.toString(16)} is outside the file`,
        table + i * 4,
      )
    }
    waves.push(readWave(data, offset))
  }
  return { waves }
}

/**
 * IMA-ADPCM as the DS decodes it — GBATEK, "DS Sound Notes", *IMA-ADPCM*.
 *
 * The first four bytes are the initial PCM16 value (bits 0–15) and table
 * index (bits 16–22); each nibble after that, low nibble first, moves the
 * value by an eighth of the table entry plus the entry's quarter, half and
 * whole for each set bit of the low three, subtracting when bit 3 is set.
 * The value clamps to ±0x7FFF and the index to 0–88.
 */
export const ADPCM_TABLE: readonly number[] = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
  80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
  544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
  2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
]
const ADPCM_INDEX: readonly number[] = [-1, -1, -1, -1, 2, 4, 6, 8]

/** A wave's samples as signed 16-bit PCM, and where its loop runs in them. */
export interface DecodedWave {
  readonly samples: Int16Array
  /** The first sample of the loop, when the wave loops. */
  readonly loopStart: number
  readonly loops: boolean
  readonly sampleRate: number
  readonly timer: number
}

export function decodeWave(wave: Wave): DecodedWave {
  const { data } = wave
  let samples: Int16Array
  let loopStart: number
  if (wave.format === WaveFormat.Pcm8) {
    samples = new Int16Array(data.length)
    for (let i = 0; i < data.length; i++) samples[i] = ((data[i] as number) << 24) >> 16
    loopStart = wave.loopStart * 4
  } else if (wave.format === WaveFormat.Pcm16) {
    samples = new Int16Array(data.length >> 1)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (((data[2 * i] as number) | ((data[2 * i + 1] as number) << 8)) << 16) >> 16
    }
    loopStart = wave.loopStart * 2
  } else {
    // Two samples a byte after the four-byte header.
    const count = Math.max(0, (data.length - 4) * 2)
    samples = new Int16Array(count)
    let value = (((data[0] as number) | ((data[1] as number) << 8)) << 16) >> 16
    let index = Math.min(88, (data[2] as number) & 0x7f)
    for (let i = 0; i < count; i++) {
      const byte = data[4 + (i >> 1)] as number
      const nibble = i & 1 ? byte >> 4 : byte & 0xf
      const step = ADPCM_TABLE[index] as number
      let diff = step >> 3
      if (nibble & 1) diff += step >> 2
      if (nibble & 2) diff += step >> 1
      if (nibble & 4) diff += step
      if (nibble & 8) {
        value -= diff
        if (value < -0x7fff) value = -0x7fff
      } else {
        value += diff
        if (value > 0x7fff) value = 0x7fff
      }
      index += ADPCM_INDEX[nibble & 7] as number
      if (index < 0) index = 0
      else if (index > 88) index = 88
      samples[i] = value
    }
    // The loop start counts words of the file, header included: its samples
    // begin eight nibbles in — Gota7, "IMA-ADPCM: offset × 2 − 8".
    loopStart = Math.max(0, wave.loopStart * 8 - 8)
  }
  return { samples, loopStart, loops: wave.loops, sampleRate: wave.sampleRate, timer: wave.timer }
}
