import { readFileSync } from 'node:fs'
import type { Script } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { commentCandidatesOf, HEADER_ENTRY, runComment } from '../src/comments.ts'
import { commentEntryOf } from '../src/load.ts'

/** A section 100 of instructions written here — op, a, b — and nothing else of a script. */
const scriptOf = (code: [number, number, number][]): Script =>
  ({
    sections: [
      { id: 100, routine: { code: code.map(([op, a, b], i) => ({ at: i * 12, op, a, b })) } },
    ],
  }) as unknown as Script

const call = (routine: number): [number, number, number] => [0x13, 0, routine]
const push = (v: number): [number, number, number] => [0x03, 1, v]
const add: [number, number, number] = [0x06, 0, 0]
const invoke: [number, number, number] = [0x15, 2, 0]

describe('Stella’s comment scripts', () => {
  it('find each candidate: its test, its line, and its bit when it has one', () => {
    const script = scriptOf([
      call(92),
      ...[push(50), push(0), add, push(2001), invoke],
      ...[push(50), push(2), add, push(59), invoke],
      call(952),
      ...[push(50), push(0), add, push(2003), invoke],
      [0x0f, 0, 0],
    ])
    expect(commentCandidatesOf(script)).toEqual([
      { routine: 92, line: 2001, bit: 59 },
      { routine: 952, line: 2003 },
    ])
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('Stella’s header comment, on a real cartridge', () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const run = (facts: { storySoFar: number; battles: number; heard: number; shown: number[] }) => {
    const header = commentEntryOf(rom, HEADER_ENTRY)
    if (!header) throw new Error('no header')
    const out = runComment(header.script, {
      ...facts,
      victories: 0,
      wipeouts: 0,
      fleeTries: 0,
      flees: 0,
      member: () => undefined,
      companions: 0,
      played: 0,
      held: () => 0,
      party: [],
      gold: 0,
      banked: 0,
      allExp: 0,
      shown: (bit) => facts.shown.includes(bit),
    })
    return 'line' in out ? header.lines.get(out.line)?.[0] : out
  }

  it('greets first, then waits on a few battles, as its tests say', () => {
    expect(run({ storySoFar: 20, battles: 0, heard: 0, shown: [] })).toMatch(/^So<,> like I said/)
    expect(run({ storySoFar: 20, battles: 0, heard: 0, shown: [0] })).toMatch(
      /^Sorry<,> you haven<1>t got enough seasoning/,
    )
    expect(run({ storySoFar: 20, battles: 5, heard: 1, shown: [0, 3] })).toMatch(
      /^That<1>s it<,> keep up the good work/,
    )
  })

  it('gives a page’s own comment by the records’ counts: wipe-outs, time played', () => {
    const page = commentEntryOf(rom, 13)
    if (!page) throw new Error('no entry 13')
    const facts = {
      storySoFar: 13,
      battles: 3,
      heard: 1,
      victories: 3,
      wipeouts: 0,
      fleeTries: 0,
      flees: 0,
      played: 30,
      companions: 0,
      party: [{ hp: 20, vocation: 6 }],
      gold: 100,
      banked: 0,
      allExp: 5000,
      held: () => 0,
      member: () => ({ hp: 20, mp: 5, vocation: 6, level: 12, exp: 5000 }),
      // Its first two, given once, already given.
      shown: (bit: number) => bit === 59 || bit === 60,
    }
    const line = (over: Partial<typeof facts>) => {
      const out = runComment(page.script, { ...facts, ...over })
      return 'line' in out ? page.lines.get(out.line)?.[0] : undefined
    }
    expect(line({})).toMatch(/^You still haven<1>t been wiped out once/)
    expect(line({ wipeouts: 2 })).toMatch(/^Will you stop getting wiped out/)
    expect(line({ played: 600 })).toMatch(/^You<1>ve spent a lot of time down here/)
  })
})
