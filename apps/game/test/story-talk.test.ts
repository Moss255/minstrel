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
    // The label's own line first, and the event once it is read.
    const first = pickLine({ ...asking, triggers: [chooses, leads] })
    expect(said(first)).toBe('*: Before.')
    expect(first?.kind === 'line' && first.after.map((a) => [a.outcome.event, a.answer])).toEqual([
      [2350, undefined],
    ])
    // Where no line holds for the label, nothing is said, and nothing runs
    // after — as the game's talk ends when its script finds no line.
    const unlabelled = { ...asking, lines: asking.lines.filter((l) => l.text !== '*: Before.') }
    expect(pickLine({ ...unlabelled, triggers: [chooses, leads] })?.kind).toBe('record')
    expect(pickLine({ ...asking, lines: [], triggers: [chooses, leads] })?.kind).toBe('record')
    // Without the talk record, the label's own line, and nothing after.
    const alone = pickLine({ ...asking, triggers: [chooses] })
    expect(said(alone)).toBe('*: Before.')
    expect(alone?.kind === 'line' && alone.after).toEqual([])
    // A talk record for another label leads nowhere.
    const other = trigger(
      [
        [6, 8],
        [11, 193],
        [119, 2350],
      ],
      1,
    )
    const elsewhere = pickLine({ ...asking, triggers: [chooses, other] })
    expect(elsewhere?.kind === 'line' && elsewhere.after).toEqual([])
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
    expect(first).toMatchObject({ kind: 'event', event: 2430 })
    expect(first?.kind === 'event' && first.record.marks).toEqual([7])
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

  it('lets the character’s own records choose before a talk record, which plays their label', () => {
    // Patty's, in the file's order: the talk record with no condition sits
    // second, and would otherwise answer every time.
    const triggers = [
      trigger([
        [6, 8],
        [5, 6],
        [118, 8],
        [192, 0],
      ]),
      trigger(
        [
          [6, 8],
          [11, 192],
          [119, 2535],
        ],
        1,
      ),
      trigger([
        [6, 8],
        [4, 6],
        [118, 8],
        [193, 0],
      ]),
      trigger(
        [
          [6, 8],
          [11, 193],
          [16, 0],
          [119, 22510],
        ],
        1,
      ),
    ]
    // Each label's own line first, and its event once read — the fight on Yes.
    const before = pickLine({ ...asking, triggers })
    expect(before?.kind === 'line' && before.after.map((a) => [a.outcome.event, a.answer])).toEqual(
      [[2535, undefined]],
    )
    const after = pickLine({ ...asking, triggers, flags: new Set([6]) })
    expect(after?.kind === 'line' && after.after.map((a) => [a.outcome.event, a.answer])).toEqual([
      [22510, 0],
    ])
  })

  it('asks with the label of the talk box the Hero stands in, as a thing to examine is', () => {
    const triggers = [
      trigger(
        [
          [6, 8],
          [11, 80],
          [5, 0],
          [119, 2500],
        ],
        1,
      ),
    ]
    // As the Hexagon's inscription: its box asks with 80, its line is 96, in
    // the same group of 80, and the event plays once it is read.
    const lines = [line([1, 99, 96], '*: The inscription.')]
    const first = pickLine({ ...asking, lines, triggers, box: 80 })
    expect(said(first)).toBe('*: The inscription.')
    expect(first?.kind === 'line' && first.after.map((a) => a.outcome.event)).toEqual([2500])
    const again = pickLine({ ...asking, lines, triggers, box: 80, flags: new Set([0]) })
    expect(again?.kind === 'line' && again.after).toEqual([])
    // Not from its box, nothing holds for label 0.
    expect(pickLine({ ...asking, lines, triggers })).toBeUndefined()
  })

  it('holds a record to the story’s step when it names one', () => {
    const triggers = [
      trigger([
        [6, 8],
        [35, 1],
        [118, 8],
        [192, 0],
      ]),
      trigger([
        [6, 8],
        [35, 4],
        [118, 8],
        [194, 0],
      ]),
      trigger(
        [
          [6, 8],
          [11, 194],
          [16, 0],
          [119, 2530],
        ],
        1,
      ),
      trigger([
        [6, 8],
        [35, 5],
        [118, 8],
        [193, 0],
      ]),
    ]
    const lines = [...asking.lines, line([1, 1, 194], '*: Shall I?')]
    expect(said(pickLine({ ...asking, lines, triggers, step: 1 }))).toBe('*: Before.')
    // Its question read first, the switch's scene only on Yes — see `OP_ANSWER_IS`.
    const asked = pickLine({ ...asking, lines, triggers, step: 4 })
    expect(said(asked)).toBe('*: Shall I?')
    expect(asked?.kind === 'line' && asked.after.map((a) => [a.outcome.event, a.answer])).toEqual([
      [2530, 0],
    ])
    expect(said(pickLine({ ...asking, lines, triggers, step: 5 }))).toBe('*: After.')
  })

  it('goes on where a talk record says once its line is read, waiting for the answer it names', () => {
    const triggers = [
      trigger([
        [6, 8],
        [118, 8],
        [193, 0],
      ]),
      trigger(
        [
          [6, 8],
          [11, 193],
          [16, 0],
          [177, 0],
          [1, 0],
          [133, 1110],
          [2130, 0],
        ],
        1,
      ),
    ]
    const choice = pickLine({ ...asking, triggers })
    expect(said(choice)).toBe('*: After.')
    const after = choice?.kind === 'line' ? choice.after : []
    expect(after.map((a) => a.answer)).toEqual([0])
    expect(after[0]?.outcome.onward).toEqual({ map: 1110, event: 2130 })
  })

  it('hands on a talk with someone else rather than taking their label', () => {
    const triggers = [
      trigger([
        [6, 8],
        [118, 9],
        [193, 0],
      ]),
    ]
    const choice = pickLine({ ...asking, triggers })
    expect(choice?.kind).toBe('record')
    expect(choice?.kind === 'record' && choice.record.talk).toEqual({ character: 9, label: 193 })
  })
})
