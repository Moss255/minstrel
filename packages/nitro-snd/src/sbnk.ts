import { NitroSndError } from './errors.ts'
import { checkSoundFile, DATA_BLOCK, u8, u16, u32 } from './header.ts'

/**
 * SBNK — an instrument bank.
 *
 * After the common header, the DATA block holds 32 reserved bytes, then at
 * `0x38` the instrument count and at `0x3C` one 4-byte record per instrument:
 * a type byte, a `u16` offset (absolute in the file) and a pad byte. An
 * instrument's data is one 10-byte note definition for the single-note types,
 * or a set of them for a drum set or a key split. Reference: Gota7, *Nitro
 * Studio 2* bank specification, and fincs's FeOS Sound System (WTFPL), whose
 * `sbnkswar.h` and `Note_On` read the same layout.
 */

/** What plays a note: a PCM wave, a PSG pulse of a duty, or white noise. */
export type NoteSource = 'pcm' | 'psg' | 'noise'

/** One note's definition, 10 bytes. */
export interface NoteDefinition {
  readonly source: NoteSource
  /** The wave within its archive, or the PSG duty (0–7) — see {@link NoteSource}. */
  readonly wave: number
  /** Which of the bank's up-to-four wave archives holds the wave. */
  readonly archive: number
  /** The key the wave was sampled at, 0–127. */
  readonly baseNote: number
  readonly attack: number
  readonly decay: number
  readonly sustain: number
  readonly release: number
  /** 0–127, 64 centre. */
  readonly pan: number
}

export type Instrument =
  | { readonly kind: 'empty' }
  | { readonly kind: 'note'; readonly note: NoteDefinition }
  /** One definition per key from `low` to `high` inclusive. */
  | {
      readonly kind: 'drums'
      readonly low: number
      readonly high: number
      readonly notes: readonly (NoteDefinition | undefined)[]
    }
  /** Up to eight regions; `keys[i]` is the last key of region `i`. */
  | {
      readonly kind: 'split'
      readonly keys: readonly number[]
      readonly notes: readonly (NoteDefinition | undefined)[]
    }

export interface Sbnk {
  readonly instruments: readonly Instrument[]
}

/** The instrument-record type byte. */
export const InstrumentType = {
  Empty: 0,
  Pcm: 1,
  Psg: 2,
  Noise: 3,
  /** Unused on the reference cartridge; read as a note like PCM. */
  DirectPcm: 4,
  /** "Has note info but zeroed out." */
  Null: 5,
  Drums: 16,
  Split: 17,
} as const

const NOTE_BYTES = 10

export function isSbnk(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x53 && data[1] === 0x42 && data[2] === 0x4e && data[3] === 0x4b
  )
}

function noteAt(data: Uint8Array, at: number, type: number): NoteDefinition | undefined {
  if (type === InstrumentType.Empty || type === InstrumentType.Null) return undefined
  const source: NoteSource =
    type === InstrumentType.Psg ? 'psg' : type === InstrumentType.Noise ? 'noise' : 'pcm'
  return {
    source,
    wave: u16(data, at, 'sbnk.note.wave'),
    archive: u16(data, at + 2, 'sbnk.note.archive'),
    baseNote: u8(data, at + 4, 'sbnk.note.baseNote'),
    attack: u8(data, at + 5, 'sbnk.note.attack'),
    decay: u8(data, at + 6, 'sbnk.note.decay'),
    sustain: u8(data, at + 7, 'sbnk.note.sustain'),
    release: u8(data, at + 8, 'sbnk.note.release'),
    pan: u8(data, at + 9, 'sbnk.note.pan'),
  }
}

export function readSbnk(data: Uint8Array): Sbnk {
  checkSoundFile(data, 'SBNK')
  const count = u32(data, DATA_BLOCK + 0x28, 'sbnk.count')
  const table = DATA_BLOCK + 0x2c
  if (table + count * 4 > data.length) {
    throw new NitroSndError(
      `sbnk declares ${count} instruments, past the end of the file`,
      DATA_BLOCK + 0x28,
    )
  }
  const instruments: Instrument[] = []
  for (let i = 0; i < count; i++) {
    const record = table + i * 4
    const type = u8(data, record, 'sbnk.instrument.type')
    const offset = u16(data, record + 1, 'sbnk.instrument.offset')
    if (type === InstrumentType.Empty) {
      instruments.push({ kind: 'empty' })
      continue
    }
    if (offset < table || offset >= data.length) {
      throw new NitroSndError(
        `sbnk instrument ${i} points at 0x${offset.toString(16)}, outside the file`,
        record + 1,
      )
    }
    if (type === InstrumentType.Drums) {
      const low = u8(data, offset, 'sbnk.drums.low')
      const high = u8(data, offset + 1, 'sbnk.drums.high')
      if (high < low)
        throw new NitroSndError(`sbnk drum set ${i} runs from ${low} down to ${high}`, offset)
      const notes: (NoteDefinition | undefined)[] = []
      for (let k = 0; k <= high - low; k++) {
        const at = offset + 2 + k * (2 + NOTE_BYTES)
        notes.push(noteAt(data, at + 2, u16(data, at, 'sbnk.drums.type')))
      }
      instruments.push({ kind: 'drums', low, high, notes })
    } else if (type === InstrumentType.Split) {
      const keys: number[] = []
      for (let k = 0; k < 8; k++) keys.push(u8(data, offset + k, 'sbnk.split.key'))
      const regions = keys.filter((key) => key !== 0).length
      const notes: (NoteDefinition | undefined)[] = []
      for (let k = 0; k < regions; k++) {
        const at = offset + 8 + k * (2 + NOTE_BYTES)
        notes.push(noteAt(data, at + 2, u16(data, at, 'sbnk.split.type')))
      }
      instruments.push({ kind: 'split', keys: keys.slice(0, regions), notes })
    } else if (type <= InstrumentType.Null) {
      const note = noteAt(data, offset, type)
      instruments.push(note ? { kind: 'note', note } : { kind: 'empty' })
    } else {
      throw new NitroSndError(`sbnk instrument ${i} has unknown type ${type}`, record)
    }
  }
  return { instruments }
}

/**
 * The note definition an instrument plays for a key, or `undefined` for a
 * key it has none for: a drum set outside its range, a key split past its
 * last region. Region `i` of a split holds every key up to `keys[i]`.
 */
export function noteFor(instrument: Instrument, key: number): NoteDefinition | undefined {
  switch (instrument.kind) {
    case 'empty':
      return undefined
    case 'note':
      return instrument.note
    case 'drums':
      return key < instrument.low || key > instrument.high
        ? undefined
        : instrument.notes[key - instrument.low]
    case 'split': {
      const region = instrument.keys.findIndex((last) => key <= last)
      return region < 0 ? undefined : instrument.notes[region]
    }
  }
}
