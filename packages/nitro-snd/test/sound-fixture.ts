/**
 * Builds SSEQ, SBNK and SWAR files in memory, from the published layouts and
 * independently of the readers. No cartridge bytes.
 */

class Bytes {
  data: number[] = []
  get length(): number {
    return this.data.length
  }
  u8(v: number): this {
    this.data.push(v & 0xff)
    return this
  }
  u16(v: number): this {
    this.data.push(v & 0xff, (v >>> 8) & 0xff)
    return this
  }
  u32(v: number): this {
    this.data.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
    return this
  }
  raw(v: ArrayLike<number>): this {
    for (let i = 0; i < v.length; i++) this.data.push(v[i] as number)
    return this
  }
  padTo(n: number): this {
    while (this.data.length < n) this.data.push(0)
    return this
  }
  patch32(at: number, v: number): void {
    this.data[at] = v & 0xff
    this.data[at + 1] = (v >>> 8) & 0xff
    this.data[at + 2] = (v >>> 16) & 0xff
    this.data[at + 3] = (v >>> 24) & 0xff
  }
}

const align4 = (n: number) => (n + 3) & ~3

/** The common header and DATA block stamp; sizes patched at the end. */
function soundFile(stamp: string, body: (b: Bytes) => void): Uint8Array {
  const b = new Bytes()
  for (let i = 0; i < 4; i++) b.u8(stamp.charCodeAt(i))
  b.u16(0xfeff).u16(0x0100).u32(0).u16(0x10).u16(1)
  b.raw([0x44, 0x41, 0x54, 0x41]).u32(0)
  body(b)
  b.padTo(align4(b.length))
  b.patch32(0x08, b.length)
  b.patch32(0x14, b.length - 0x10)
  return Uint8Array.from(b.data)
}

/** An SSEQ whose command stream is `commands`, at the usual 0x1C. */
export function buildSseq(commands: ArrayLike<number>): Uint8Array {
  return soundFile('SSEQ', (b) => {
    b.u32(0x1c)
    b.raw(commands)
  })
}

export interface NoteSpec {
  type?: number
  wave: number
  archive: number
  baseNote: number
  attack?: number
  decay?: number
  sustain?: number
  release?: number
  pan?: number
}

export type InstrumentSpec =
  | { kind: 'empty' }
  | { kind: 'note'; note: NoteSpec }
  | { kind: 'drums'; low: number; high: number; notes: NoteSpec[] }
  | { kind: 'split'; keys: number[]; notes: NoteSpec[] }

function noteBytes(b: Bytes, n: NoteSpec): void {
  b.u16(n.wave)
    .u16(n.archive)
    .u8(n.baseNote)
    .u8(n.attack ?? 127)
    .u8(n.decay ?? 127)
    .u8(n.sustain ?? 127)
    .u8(n.release ?? 127)
    .u8(n.pan ?? 64)
}

export function buildSbnk(instruments: InstrumentSpec[]): Uint8Array {
  return soundFile('SBNK', (b) => {
    b.padTo(0x38)
    b.u32(instruments.length)
    const table = b.length
    for (let i = 0; i < instruments.length; i++) b.u32(0)
    for (const [i, inst] of instruments.entries()) {
      const at = b.length
      let type = 0
      if (inst.kind === 'note') {
        type = inst.note.type ?? 1
        noteBytes(b, inst.note)
      } else if (inst.kind === 'drums') {
        type = 16
        b.u8(inst.low).u8(inst.high)
        for (const n of inst.notes) {
          b.u16(n.type ?? 1)
          noteBytes(b, n)
        }
      } else if (inst.kind === 'split') {
        type = 17
        for (let k = 0; k < 8; k++) b.u8(inst.keys[k] ?? 0)
        for (const n of inst.notes) {
          b.u16(n.type ?? 1)
          noteBytes(b, n)
        }
      }
      const record = type === 0 ? 0 : type | (at << 8)
      b.patch32(table + i * 4, record)
    }
  })
}

export interface WaveSpec {
  format: 0 | 1 | 2
  loops?: boolean
  sampleRate: number
  loopStart?: number
  /** Sample bytes, a multiple of four. */
  data: ArrayLike<number>
}

export function buildSwar(waves: WaveSpec[]): Uint8Array {
  return soundFile('SWAR', (b) => {
    b.padTo(0x38)
    b.u32(waves.length)
    const table = b.length
    for (let i = 0; i < waves.length; i++) b.u32(0)
    for (const [i, w] of waves.entries()) {
      b.patch32(table + i * 4, b.length)
      const words = w.data.length >> 2
      const loopStart = w.loopStart ?? 0
      b.u8(w.format)
        .u8(w.loops ? 1 : 0)
        .u16(w.sampleRate)
        .u16(Math.round(16756991 / w.sampleRate))
        .u16(loopStart)
        .u32(words - loopStart)
      b.raw(w.data)
    }
  })
}

/** Encode PCM16 samples as IMA-ADPCM with the DS's tables, for round-trip tests. */
export function encodeAdpcm(samples: ArrayLike<number>, startIndex = 0): number[] {
  const table = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
    80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
    544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
    2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
  ]
  const indexTable = [-1, -1, -1, -1, 2, 4, 6, 8]
  const out: number[] = []
  let value = samples[0] ?? 0
  let index = startIndex
  out.push(value & 0xff, (value >>> 8) & 0xff, index, 0)
  let byte = 0
  for (let i = 0; i < samples.length; i++) {
    const step = table[index] as number
    let target = (samples[i] as number) - value
    let nibble = 0
    if (target < 0) {
      nibble = 8
      target = -target
    }
    let diff = step >> 3
    if (target >= step) {
      nibble |= 4
      target -= step
      diff += step
    }
    if (target >= step >> 1) {
      nibble |= 2
      target -= step >> 1
      diff += step >> 1
    }
    if (target >= step >> 2) {
      nibble |= 1
      diff += step >> 2
    }
    value += nibble & 8 ? -diff : diff
    value = Math.max(-0x7fff, Math.min(0x7fff, value))
    index = Math.max(0, Math.min(88, index + (indexTable[nibble & 7] as number)))
    if (i & 1) {
      out.push(byte | (nibble << 4))
      byte = 0
    } else byte = nibble
  }
  if (samples.length & 1) out.push(byte)
  while (out.length & 3) out.push(0)
  return out
}
