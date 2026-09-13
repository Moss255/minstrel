import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { parseMarkup, readEventMessages, readTableMessages } from '../src/events.ts'

/**
 * Fixtures are built here, never taken from a cartridge.
 *
 * An event's text file is a tagged data table — see `table.ts` — whose records
 * each carry a message's number and the offset of its string.
 */
interface Field {
  readonly value: number
  /** 0 a string offset, 1 an integer. */
  readonly kind: 0 | 1
}

const int = (value: number): Field => ({ value, kind: 1 })
const text = (offset: number): Field => ({ value: offset, kind: 0 })

function build(records: { tag: number; fields: Field[] }[], strings: string[]): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.fields.length
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    const bits = new Uint8Array(header - 3)
    for (const [i, f] of record.fields.entries()) {
      bits[i >> 2] = (bits[i >> 2] as number) | (f.kind << ((i & 3) * 2))
    }
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count, ...bits)
    for (const f of record.fields) push32(f.value)
  }
  const stringBytes: number[] = []
  for (const s of strings) {
    for (let i = 0; i < s.length; i++) stringBytes.push(s.charCodeAt(i) & 0xff)
    stringBytes.push(0)
  }
  const stringOffset = 16 + body.length
  const out = new Uint8Array(stringOffset + stringBytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringBytes.length, true)
  // The table counts only strings with something in them.
  view.setUint32(12, strings.filter((s) => s !== '').length, true)
  out.set(body, 16)
  out.set(stringBytes, stringOffset)
  return out
}

const message = (id: number, at: number) => ({ tag: 0x64, fields: [int(id), text(at)] })
const NONE = 0xffffffff

describe('readEventMessages', () => {
  it('reads each message as its number and what it says, in file order', () => {
    // Written for the test: the cartridge's own text never belongs in a fixture.
    const first = '*: Rest well<,> traveller.'
    const second = '*: The road east is long.'
    const bytes = build(
      [message(100, 0), message(101, NONE), message(102, first.length + 1)],
      [first, second],
    )
    expect(readEventMessages(bytes)).toEqual([
      { id: 100, text: first },
      { id: 101, text: undefined },
      { id: 102, text: second },
    ])
  })

  it('reads a message pointing at an empty string as saying nothing, not as missing', () => {
    // 'a' then an empty string: the terminator at offset 2 is where it points.
    const bytes = build([message(100, 2)], ['a', ''])
    expect(readEventMessages(bytes)).toEqual([{ id: 100, text: '' }])
  })

  it('reads an empty file as an event with nothing to say', () => {
    expect(readEventMessages(new Uint8Array(0))).toEqual([])
  })

  it('refuses a record that is not a message', () => {
    expect(() =>
      readEventMessages(build([{ tag: 0x65, fields: [int(1), text(0)] }], ['a'])),
    ).toThrow(GameFormatError)
    // The right tag, but a number where the string should be.
    expect(() =>
      readEventMessages(build([{ tag: 0x64, fields: [int(1), int(0)] }], ['a'])),
    ).toThrow(GameFormatError)
  })

  it('refuses a string offset that lands inside a string', () => {
    expect(() => readEventMessages(build([message(100, 1)], ['hello']))).toThrow(GameFormatError)
  })
})

describe('readTableMessages', () => {
  it('reads the messages under one tag, leaving the table’s other records alone', () => {
    // Written for the test, in the shape of the battle results' file: a
    // record or two that are not messages, then the messages under their tag.
    const won = 'You win.'
    const lost = 'You lose.'
    const bytes = build(
      [
        { tag: 0x65, fields: [int(0)] },
        { tag: 0x64, fields: [int(20)] },
        { tag: 0x67, fields: [int(1), text(0)] },
        { tag: 0x67, fields: [int(20), text(won.length + 1)] },
      ],
      [won, lost],
    )
    expect(readTableMessages(bytes, 0x67)).toEqual([
      { id: 1, text: won },
      { id: 20, text: lost },
    ])
  })

  it('refuses a record of the tag that is not a message', () => {
    expect(() =>
      readTableMessages(build([{ tag: 0x67, fields: [int(1), int(0)] }], ['a']), 0x67),
    ).toThrow(GameFormatError)
  })
})

describe('parseMarkup', () => {
  it('splits text from a tag and its arguments', () => {
    expect(parseMarkup('<ALL_RECOVER=1,1,999>*: Rest well, traveller.')).toEqual([
      { kind: 'tag', name: 'ALL_RECOVER', args: ['1', '1', '999'] },
      { kind: 'text', text: '*: Rest well, traveller.' },
    ])
  })

  it('reads the two characters backslash and n as a line break', () => {
    expect(parseMarkup('Mind the step<,> or you may\\ntrip on it!')).toEqual([
      { kind: 'text', text: 'Mind the step' },
      { kind: 'tag', name: ',', args: [] },
      { kind: 'text', text: ' or you may' },
      { kind: 'break' },
      { kind: 'text', text: 'trip on it!' },
    ])
  })

  it('carries an accent as the tag it is written as', () => {
    expect(parseMarkup("Cr<`e>me br<^u>l<'e>e")).toEqual([
      { kind: 'text', text: 'Cr' },
      { kind: 'tag', name: '`e', args: [] },
      { kind: 'text', text: 'me br' },
      { kind: 'tag', name: '^u', args: [] },
      { kind: 'text', text: 'l' },
      { kind: 'tag', name: "'e", args: [] },
      { kind: 'text', text: 'e' },
    ])
  })

  it('reads an empty message as nothing', () => {
    expect(parseMarkup('')).toEqual([])
  })

  it('refuses markup that is opened and not closed, or closed and not opened', () => {
    expect(() => parseMarkup('Hello <HERO')).toThrow(GameFormatError)
    expect(() => parseMarkup('<IF_MALE<HERO>')).toThrow(GameFormatError)
    expect(() => parseMarkup('Hello > there')).toThrow(GameFormatError)
  })
})
