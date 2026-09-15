import type { TalkLine, Trigger } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { pickLine } from '../src/talk.ts'

/** A character's record built in code: a map, a span, and its words as operation and argument. */
const trigger = (words: [number, number][], kind = 0): Trigger => ({
  map: 1100,
  from: { major: 2, minor: 1 },
  to: { major: 2, minor: 1 },
  unknown_5: kind,
  values: Uint32Array.from(words.map(([op, arg]) => ((op << 16) | arg) >>> 0)),
  floats: new Float32Array(words.length),
  kinds: new Uint8Array(words.length).fill(1),
  offset: 0x40,
})
const line = (numbers: number[], text: string): TalkLine => ({
  tag: 1,
  unknown_numbers: numbers,
  text,
})
const asking = {
  triggers: [] as Trigger[],
  map: 1100,
  stage: { major: 2, minor: 1 },
  night: false,
  id: 8,
  lines: [
    line([1, 1, 16], '*: Plain.'),
    line([1, 1, 192], '*: Before.'),
    line([1, 1, 193], '*: After.'),
  ],
}
const said = (choice: ReturnType<typeof pickLine>) =>
  choice?.kind === 'line' ? choice.line.text : undefined

describe('talk as the story’s flags stand', () => {
  it('takes the label a character’s own records give for the flags set', () => {
    const triggers = [
      trigger([
        [6, 8],
        [5, 0],
        [118, 8],
        [192, 0],
      ]),
      trigger([
        [6, 8],
        [4, 0],
        [118, 8],
        [193, 0],
      ]),
    ]
    expect(said(pickLine({ ...asking, triggers }))).toBe('*: Before.')
    expect(said(pickLine({ ...asking, triggers, flags: new Set([0]) }))).toBe('*: After.')
  })

  it('runs a character’s event only while its flags hold', () => {
    const triggers = [
      trigger([
        [6, 8],
        [4, 0],
        [5, 1],
        [119, 2220],
      ]),
    ]
    expect(pickLine({ ...asking, triggers })?.kind).toBe('line')
    expect(pickLine({ ...asking, triggers, flags: new Set([0]) })).toMatchObject({
      kind: 'event',
      event: 2220,
    })
    expect(pickLine({ ...asking, triggers, flags: new Set([0, 1]) })?.kind).toBe('line')
  })

  it('runs the event a talk record makes of the label a character’s record chooses', () => {
    const chooses = trigger([
      [6, 8],
      [118, 8],
      [192, 0],
    ])
    const leads = trigger(
      [
        [6, 8],
        [11, 192],
        [119, 2350],
      ],
      1,
    )
    expect(pickLine({ ...asking, triggers: [chooses, leads] })).toMatchObject({
      kind: 'event',
      event: 2350,
    })
    // Without the talk record, the label's own line.
    expect(said(pickLine({ ...asking, triggers: [chooses] }))).toBe('*: Before.')
    // A talk record for another label, or another character, leads nowhere.
    const other = trigger(
      [
        [6, 8],
        [11, 193],
        [119, 2350],
      ],
      1,
    )
    expect(said(pickLine({ ...asking, triggers: [chooses, other] }))).toBe('*: Before.')
  })

  it('plays a first-time event once, by the mark its record sets, and the line after', () => {
    const triggers = [
      trigger([
        [6, 8],
        [3, 7],
        [119, 2430],
        [102, 7],
      ]),
      trigger([
        [6, 8],
        [2, 7],
        [118, 8],
        [193, 0],
      ]),
    ]
    const first = pickLine({ ...asking, triggers, marks: new Set() })
    expect(first).toMatchObject({ kind: 'event', event: 2430, marks: [7] })
    expect(said(pickLine({ ...asking, triggers, marks: new Set([7]) }))).toBe('*: After.')
  })

  it('gives the after-label, not the first-time event, when the Hero has no companion', () => {
    const triggers = [
      trigger([
        [6, 8],
        [86, 0],
        [118, 8],
        [192, 0],
      ]),
      trigger([
        [6, 8],
        [3, 7],
        [119, 2430],
        [102, 7],
      ]),
    ]
    expect(said(pickLine({ ...asking, triggers, marks: new Set(), alone: true }))).toBe(
      '*: Before.',
    )
    expect(pickLine({ ...asking, triggers, marks: new Set(), alone: false })).toMatchObject({
      kind: 'event',
      event: 2430,
    })
  })

  it('does not take another character’s label from a record about someone else', () => {
    const triggers = [
      trigger([
        [6, 8],
        [118, 9],
        [193, 0],
      ]),
    ]
    expect(said(pickLine({ ...asking, triggers }))).toBe('*: Plain.')
  })
})
