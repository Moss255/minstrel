import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { NO_ITEM, PRESET_COUNT_TAG, PRESET_TAG, readCharacterPresets } from '../src/presets.ts'

/**
 * A synthetic `charapreset.bin`. Fixtures may not hold cartridge bytes, so the
 * layout is built here from `FORMAT.md`, "The tagged data table" and
 * "Character presets".
 *
 * Unlike `table.test.ts`'s builder this one writes the **kind bits**, which is
 * the whole point here: a preset's 102 values are integers but for one string
 * and two floats, and reading them by their kinds rather than by position is
 * what keeps the reader honest.
 */
const KIND_STRING = 0
const KIND_NUMBER = 1
const KIND_FLOAT = 2

interface Value {
  readonly kind: number
  readonly value: number
}
const int = (value: number): Value => ({ kind: KIND_NUMBER, value })
const float = (value: number): Value => ({ kind: KIND_FLOAT, value })
const str = (offset: number): Value => ({ kind: KIND_STRING, value: offset })

function build(records: { tag: number; values: Value[] }[], strings: string[] = []): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.values.length
    const kindBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + kindBytes) / 4) * 4
    // The kind bits begin at byte 3 of the record — the same byte the reader
    // also calls `type`, two bits per value, low pair first.
    const kinds = new Uint8Array(header - 3)
    for (const [i, v] of record.values.entries()) {
      kinds[i >> 2] = (kinds[i >> 2] as number) | ((v.kind & 3) << ((i & 3) * 2))
    }
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count)
    for (const byte of kinds) body.push(byte)
    for (const v of record.values) {
      if (v.kind === KIND_FLOAT) {
        const buf = new DataView(new ArrayBuffer(4))
        buf.setFloat32(0, v.value, true)
        push32(buf.getUint32(0, true))
      } else push32(v.value)
    }
  }
  const stringBytes: number[] = []
  for (const s of strings) {
    for (let i = 0; i < s.length; i++) stringBytes.push(s.charCodeAt(i) & 0xff)
    stringBytes.push(0)
  }
  const stringOffset = 16 + body.length
  const out = new Uint8Array(stringOffset + stringBytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0, true)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringBytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(Uint8Array.from(body), 16)
  out.set(Uint8Array.from(stringBytes), stringOffset)
  return out
}

/** One preset's 102 values, with the named ones set and the rest plausible. */
function preset(over: Partial<Record<number, Value>> = {}): Value[] {
  const values: Value[] = []
  for (let i = 0; i < 102; i++) values.push(int(i < 75 ? NO_ITEM : 0))
  values[76] = str(0)
  values[90] = float(1)
  values[91] = float(1)
  for (const [at, v] of Object.entries(over)) values[Number(at)] = v as Value
  return values
}

const file = (presets: Value[][], strings: string[], count = presets.length) =>
  build(
    [
      { tag: PRESET_COUNT_TAG, values: [int(count)] },
      ...presets.map((values) => ({ tag: PRESET_TAG, values })),
    ],
    strings,
  )

describe('readCharacterPresets', () => {
  it('reads what a preset is dressed in, and its sex and proportions', () => {
    const warrior = preset({
      78: int(9006),
      79: int(13001),
      80: int(16001),
      81: int(15001),
      82: int(17001),
      83: int(12001),
      84: int(20004),
      85: int(21296),
      86: int(0),
      87: int(14001),
      90: float(1),
      91: float(0.95),
    })
    const [read] = readCharacterPresets(file([warrior], ['ナイン']))
    expect(read?.index).toBe(0)
    expect(read?.outfit).toEqual({
      face: 9006,
      armour: 13001,
      legwear: 16001,
      gloves: 15001,
      footwear: 17001,
      headgear: 12001,
      weapon: 20004,
      shield: 21296,
      arms: 14001,
    })
    expect(read?.sex).toBe(0)
    // Single precision, so 0.95 comes back as the float32 nearest it.
    expect(read?.proportions[0]).toBe(1)
    expect(read?.proportions[1]).toBeCloseTo(0.95, 6)
  })

  it('carries the name as bytes rather than pretending to decode it', () => {
    // **These names are Shift-JIS**, alone among the strings this package
    // reads, and the table turns each byte into one character. That is
    // lossless and it is not text, so the reader hands it over as it is.
    const bytes = [0x83, 0x69, 0x83, 0x43, 0x83, 0x93]
    const name = String.fromCharCode(...bytes)
    const [read] = readCharacterPresets(file([preset()], [name]))
    expect(read?.name).toBe(name)
    expect([...(read?.name ?? '')].map((c) => c.charCodeAt(0))).toEqual(bytes)
  })

  it('keeps the values it has not read rather than dropping them', () => {
    // The rule this package is held to: an unknown region is carried through
    // as opaque, not skipped. 75 item ids and ten trailing values.
    const [read] = readCharacterPresets(file([preset({ 75: int(64), 77: int(9024) })], ['x']))
    expect(read?.unknown_items).toHaveLength(75)
    expect(read?.unknown_items.every((id) => id === NO_ITEM)).toBe(true)
    expect(read?.unknown_75).toBe(64)
    expect(read?.unknown_77).toBe(9024)
    expect(read?.unknown_92).toHaveLength(10)
  })

  it('reads more than one, in the file’s order', () => {
    const presets = [preset({ 86: int(0) }), preset({ 86: int(1) }), preset({ 86: int(0) })]
    const read = readCharacterPresets(file(presets, ['a']))
    expect(read.map((p) => p.index)).toEqual([0, 1, 2])
    expect(read.map((p) => p.sex)).toEqual([0, 1, 0])
  })

  it('refuses a file whose count and records disagree', () => {
    // **Saying so beats dressing somebody in whatever was there.**
    expect(() => readCharacterPresets(file([preset()], ['a'], 29))).toThrow(
      /say there are 29 of them and hold 1/,
    )
  })

  it('refuses a record of the wrong length, and a value of the wrong kind', () => {
    const short = build(
      [
        { tag: PRESET_COUNT_TAG, values: [int(1)] },
        { tag: PRESET_TAG, values: preset().slice(0, 50) },
      ],
      ['a'],
    )
    expect(() => readCharacterPresets(short)).toThrow(/has 50 values, not 102/)
    // A face that is a float where the file should have an integer.
    const wrong = file([preset({ 78: float(1.5) })], ['a'])
    expect(() => readCharacterPresets(wrong)).toThrow(GameFormatError)
    expect(() => readCharacterPresets(wrong)).toThrow(/a face of kind 2, not 1/)
  })

  it('refuses a file with no count record at all', () => {
    const none = build([{ tag: PRESET_TAG, values: preset() }], ['a'])
    expect(() => readCharacterPresets(none)).toThrow(/0 count records/)
  })
})
