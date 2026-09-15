import { describe, expect, it } from 'vitest'
import { NitroSndError } from '../src/errors.ts'
import { InstrumentType, noteFor, readSbnk } from '../src/sbnk.ts'
import { readSseq } from '../src/sseq.ts'
import { decodeWave, readSwar, WaveFormat } from '../src/swar.ts'
import { buildSbnk, buildSseq, buildSwar, encodeAdpcm } from './sound-fixture.ts'

describe('readSseq', () => {
  it('finds the command stream where the DATA block says', () => {
    const sseq = readSseq(buildSseq([0xfe, 0x01, 0x00, 0x3c, 0x7f, 0x30, 0xff]))
    expect(sseq.dataOffset).toBe(0x1c)
    expect([...sseq.commands.subarray(0, 7)]).toEqual([0xfe, 0x01, 0x00, 0x3c, 0x7f, 0x30, 0xff])
  })

  it('refuses another stamp, a bad byte order and a stream outside its block', () => {
    expect(() => readSseq(buildSbnk([]))).toThrow(NitroSndError)
    const bad = buildSseq([0xff])
    bad[4] = 0
    expect(() => readSseq(bad)).toThrow(/byte-order/)
    const far = buildSseq([0xff])
    far[0x18] = 0xff
    expect(() => readSseq(far)).toThrow(/outside/)
  })
})

describe('readSbnk', () => {
  const bank = () =>
    buildSbnk([
      { kind: 'note', note: { wave: 3, archive: 0, baseNote: 60, attack: 120, pan: 40 } },
      { kind: 'empty' },
      {
        kind: 'drums',
        low: 36,
        high: 38,
        notes: [
          { wave: 0, archive: 1, baseNote: 36 },
          { type: 0, wave: 0, archive: 0, baseNote: 0 },
          { wave: 2, archive: 1, baseNote: 38 },
        ],
      },
      {
        kind: 'split',
        keys: [59, 71, 127],
        notes: [
          { wave: 4, archive: 0, baseNote: 48 },
          { wave: 5, archive: 0, baseNote: 60 },
          { type: 2, wave: 3, archive: 0, baseNote: 69 },
        ],
      },
    ])

  it('reads single notes, drum sets and key splits', () => {
    const { instruments } = readSbnk(bank())
    expect(instruments).toHaveLength(4)
    expect(instruments[0]).toMatchObject({
      kind: 'note',
      note: { source: 'pcm', wave: 3, archive: 0, baseNote: 60, attack: 120, pan: 40 },
    })
    expect(instruments[1]).toEqual({ kind: 'empty' })
    expect(instruments[2]).toMatchObject({ kind: 'drums', low: 36, high: 38 })
    expect(instruments[3]).toMatchObject({ kind: 'split', keys: [59, 71, 127] })
  })

  it('answers the note for a key, and none outside a set or past a split', () => {
    const { instruments } = readSbnk(bank())
    const drums = instruments[2] as Parameters<typeof noteFor>[0]
    expect(noteFor(drums, 36)?.wave).toBe(0)
    expect(noteFor(drums, 37)).toBeUndefined()
    expect(noteFor(drums, 38)?.wave).toBe(2)
    expect(noteFor(drums, 39)).toBeUndefined()
    const split = instruments[3] as Parameters<typeof noteFor>[0]
    expect(noteFor(split, 0)?.wave).toBe(4)
    expect(noteFor(split, 59)?.wave).toBe(4)
    expect(noteFor(split, 60)?.wave).toBe(5)
    expect(noteFor(split, 100)).toMatchObject({ source: 'psg', wave: 3 })
    expect(noteFor(instruments[1] as Parameters<typeof noteFor>[0], 60)).toBeUndefined()
  })

  it('refuses an instrument that points outside the file, and an unknown type', () => {
    const bad = buildSbnk([{ kind: 'note', note: { wave: 0, archive: 0, baseNote: 60 } }])
    bad[0x3d] = 0xff
    bad[0x3e] = 0xff
    expect(() => readSbnk(bad)).toThrow(/outside/)
    const odd = buildSbnk([{ kind: 'note', note: { wave: 0, archive: 0, baseNote: 60 } }])
    odd[0x3c] = 9
    expect(() => readSbnk(odd)).toThrow(/unknown type/)
    expect(InstrumentType.Drums).toBe(16)
  })
})

describe('readSwar and decodeWave', () => {
  it('reads each wave’s info and decodes PCM8 and PCM16', () => {
    const swar = readSwar(
      buildSwar([
        { format: WaveFormat.Pcm8, sampleRate: 16000, data: [0, 64, 0x80, 0xc0] },
        {
          format: WaveFormat.Pcm16,
          sampleRate: 22050,
          loops: true,
          loopStart: 1,
          data: [0x00, 0x10, 0x00, 0xf0, 0xff, 0x7f, 0x00, 0x80],
        },
      ]),
    )
    expect(swar.waves).toHaveLength(2)
    expect(swar.waves[0]).toMatchObject({ format: 0, loops: false, sampleRate: 16000, timer: 1047 })
    expect([...decodeWave(swar.waves[0] as never).samples]).toEqual([0, 16384, -32768, -16384])
    const second = decodeWave(swar.waves[1] as never)
    expect([...second.samples]).toEqual([4096, -4096, 32767, -32768])
    expect(second).toMatchObject({ loops: true, loopStart: 2 })
  })

  it('decodes ADPCM back to within a step of what was encoded', () => {
    // A slope the coder can follow from its starting step: 600 a sample at most,
    // against a step of 876 at index 50.
    const wanted = Array.from({ length: 64 }, (_, i) => Math.round(Math.sin(i / 10) * 6000))
    const swar = readSwar(
      buildSwar([{ format: WaveFormat.Adpcm, sampleRate: 32768, data: encodeAdpcm(wanted, 50) }]),
    )
    const { samples } = decodeWave(swar.waves[0] as never)
    expect(samples.length).toBeGreaterThanOrEqual(64)
    let worst = 0
    for (let i = 1; i < 64; i++)
      worst = Math.max(worst, Math.abs((samples[i] as number) - (wanted[i] as number)))
    expect(worst).toBeLessThan(900)
  })

  it('refuses a wave past the end and a format it does not know', () => {
    const bad = buildSwar([{ format: 0, sampleRate: 8000, data: [1, 2, 3, 4] }])
    bad[0x3c + 4 + 8] = 0xff
    expect(() => readSwar(bad)).toThrow(/past the end/)
    const odd = buildSwar([{ format: 0, sampleRate: 8000, data: [1, 2, 3, 4] }])
    odd[0x40] = 3
    expect(() => readSwar(odd)).toThrow(/not PCM8/)
  })
})
