import type { Script, ScriptInstruction, ScriptRoutine } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  EventRun,
  OP,
  PUSH_FLOAT,
  PUSH_INT,
  PUSH_STRING,
  SCOPE_EVENT,
  SCOPE_LOCAL,
  ScriptError,
  type ScriptHost,
  ScriptThread,
  type ScriptValue,
} from '../src/vm.ts'

/** An instruction; a jump may name a label, `'L1'`, for the builder to turn into an address. */
type Op = [op: number, a?: number | string, b?: number]

const BASE = 0x100

/**
 * A script built in memory. Fixtures may not contain cartridge bytes, so each
 * routine is laid out as `FORMAT.md` describes — a 0x38-byte header, then
 * three-word instructions — with addresses counted from a made-up base.
 */
function assemble(
  routines: { params?: number; locals?: number; code: Op[] }[],
  sections: { id: number; routine: number }[] = [{ id: 100, routine: 0 }],
  strings: Record<number, string> = {},
): Script {
  let at = BASE
  const built: ScriptRoutine[] = routines.map(({ params = 0, locals = 0, code }) => {
    const start = at
    const place = (i: number) => start + 0x38 + i * 12
    const labels = new Map<string, number>()
    code.forEach(([op, a], i) => {
      if (op === OP.LABEL) labels.set(`L${a}`, place(i) - BASE)
    })
    const instructions: ScriptInstruction[] = code.map(([op, a = 0, b = 0], i) => {
      const resolved = typeof a === 'string' ? labels.get(a) : a
      if (resolved === undefined) throw new Error(`no label ${a}`)
      return { at: place(i), op, a: resolved, b }
    })
    at = place(code.length)
    return { at: start, unknown_0x04: 0, locals, params, unknown_0x10: [], code: instructions }
  })
  return {
    sharedSize: 0,
    base: BASE,
    unknown_0x18: 0,
    sections: sections.map((s) => ({ id: s.id, routine: built[s.routine] as ScriptRoutine })),
    routineAt: (address) => {
      const found = built.find((r) => r.at === BASE + address)
      if (!found) throw new Error(`no routine at ${address}`)
      return found
    },
    stringAt: (offset) => new TextEncoder().encode(strings[offset] ?? ''),
  }
}

const int = (n: number): Op => [OP.PUSH, PUSH_INT, n >>> 0]
const float = (f: number): Op => {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, f, true)
  return [OP.PUSH, PUSH_FLOAT, view.getUint32(0, true)]
}
const local = (i: number): Op => [OP.LOAD, i, SCOPE_LOCAL]
const refLocal = (i: number): Op => [OP.REF, i, SCOPE_LOCAL]

/**
 * Invoke engine function `id` with values, each one op or a run of ops that
 * leaves one value — written as the cartridge writes it, the number as a sum.
 */
const engine = (id: number, ...values: (Op | Op[])[]): Op[] => [
  int(Math.floor(id / 100) * 100),
  int(id % 100),
  [OP.ADD],
  ...values.flatMap((value) => (typeof value[0] === 'number' ? [value as Op] : (value as Op[]))),
  [OP.INVOKE, values.length + 1],
]

function recorder(answers: Record<number, ScriptValue> = {}) {
  const calls: { id: number; args: readonly ScriptValue[] }[] = []
  const notes: string[] = []
  const host: ScriptHost = {
    call: (id, args) => {
      calls.push({ id, args })
      return answers[id]
    },
    note: (text) => notes.push(text),
  }
  return { host, calls, notes }
}

/** Run a script's first section to its end; how many frames it waited for. */
function run(script: Script, host: ScriptHost): number {
  const thread = new ScriptThread(script, script.sections[0]?.routine as ScriptRoutine, host)
  let frames = 0
  while (thread.step()) frames++
  return frames
}

describe('the script machine', () => {
  it('invokes an engine function by the number it adds up, with constants of each type', () => {
    const script = assemble(
      [{ code: [...engine(206, int(1), float(2.5), [OP.PUSH, PUSH_STRING, 0x40]), [OP.RETURN]] }],
      undefined,
      { 64: 'walk' },
    )
    const { host, calls } = recorder()
    run(script, host)
    expect(calls).toEqual([{ id: 206, args: [1, 2.5, 'walk'] }])
  })

  it('adds, subtracts, negates, ors and stores through a reference', () => {
    const script = assemble([
      {
        locals: 1,
        code: [
          refLocal(0),
          int(10),
          int(3),
          [OP.SUBTRACT],
          [OP.STORE],
          [OP.POP],
          // local 0 = local 0 + 1, as the cartridge counts.
          refLocal(0),
          local(0),
          int(1),
          [OP.ADD],
          [OP.STORE],
          [OP.POP],
          ...engine(101, local(0), [float(1.5), [OP.NEGATE]], [int(4), int(16), [OP.OR]]),
          [OP.RETURN],
        ],
      },
    ])
    const { host, calls } = recorder()
    run(script, host)
    expect(calls.map((c) => c.args)).toEqual([[8, -1.5, 20]])
  })

  it('lets an engine function fill a reference, keeping event variables apart from locals', () => {
    const script = assemble([
      {
        locals: 1,
        code: [
          ...engine(560, refLocal(0)),
          [OP.POP],
          ...engine(561, [OP.REF, 2, SCOPE_EVENT]),
          [OP.POP],
          ...engine(102, local(0), [OP.LOAD, 2, SCOPE_EVENT]),
          [OP.RETURN],
        ],
      },
    ])
    const seen: ScriptValue[][] = []
    const host: ScriptHost = {
      call: (id, args, thread) => {
        seen.push([...args])
        const ref = args[0]
        if (typeof ref === 'object') thread.write(ref, id === 560 ? 5 : 9)
        return 0
      },
    }
    run(script, host)
    expect(seen.at(-1)).toEqual([5, 9])
  })

  it("calls a routine with its parameters, and waits in it as the cartridge's wait does", () => {
    // Routine 0 is shaped like the cartridge's: while n >= 0 { n = n - 1; yield }.
    const script = assemble(
      [
        {
          params: 1,
          locals: 1,
          code: [
            [OP.LABEL, 0],
            local(0),
            int(0),
            [OP.COMPARE, 45],
            [OP.JUMP_IF, 'L1', 0],
            refLocal(0),
            local(0),
            int(1),
            [OP.SUBTRACT],
            [OP.STORE],
            [OP.POP],
            [OP.YIELD],
            [OP.JUMP, 'L0'],
            [OP.LABEL, 1],
            int(0),
            [OP.RETURN],
          ],
        },
        { code: [int(3), [OP.ROUTINE, 0, 0], [OP.POP], ...engine(707), [OP.RETURN]] },
      ],
      [{ id: 100, routine: 1 }],
    )
    const { host, calls } = recorder()
    // n = 3, 2, 1 and 0 each pass the test and wait once.
    expect(run(script, host)).toBe(4)
    expect(calls.map((c) => c.id)).toEqual([707])
  })

  it('compares, short-circuits and nots', () => {
    const script = assemble([
      {
        code: [
          ...engine(909, [int(2), int(2), [OP.COMPARE, 40]]),
          ...engine(909, [int(1), int(2), [OP.COMPARE, 42]]),
          ...engine(909, [int(3), [OP.NOT]]),
          // (0 || 5): the first is false, so it is dropped and the second stands.
          ...engine(909, [int(0), [OP.SHORT_CIRCUIT, 'L0', 1], int(5), [OP.LABEL, 0]]),
          // (7 || …): true, so it jumps past the second, keeping itself.
          ...engine(909, [int(7), [OP.SHORT_CIRCUIT, 'L1', 1], int(5), [OP.LABEL, 1]]),
          [OP.RETURN],
        ],
      },
    ])
    const { host, calls } = recorder()
    run(script, host)
    expect(calls.map((c) => c.args)).toEqual([[1], [1], [0], [5], [7]])
  })

  it('passes a note on, and gives the script what an engine function answers', () => {
    const script = assemble(
      [
        {
          locals: 1,
          code: [
            [OP.PUSH, PUSH_STRING, 0x10],
            [OP.NOTE, 1],
            refLocal(0),
            ...engine(595),
            [OP.STORE],
            [OP.POP],
            ...engine(101, local(0)),
            [OP.RETURN],
          ],
        },
      ],
      undefined,
      { 16: 'a note' },
    )
    const { host, calls, notes } = recorder({ 595: 42 })
    run(script, host)
    expect(notes).toEqual(['a note'])
    expect(calls.at(-1)?.args).toEqual([42])
  })

  it('refuses an invoke of more values than the routine has pushed', () => {
    const script = assemble([{ code: [int(206), [OP.INVOKE, 3], [OP.RETURN]] }])
    expect(() => run(script, recorder().host)).toThrow(/invoke of 3 values/)
  })

  it('stops on an opcode it does not read, saying which and where', () => {
    const script = assemble([{ code: [[0x08], [OP.RETURN]] }])
    expect(() => run(script, recorder().host)).toThrow(ScriptError)
    expect(() => run(script, recorder().host)).toThrow(/opcode 0x8 .*at 0x138/)
  })

  it('stops a script that never waits', () => {
    const script = assemble([{ code: [[OP.LABEL, 0], [OP.JUMP, 'L0'], [OP.RETURN]] }])
    const thread = new ScriptThread(
      script,
      script.sections[0]?.routine as ScriptRoutine,
      recorder().host,
    )
    expect(() => thread.step(1000)).toThrow(/without waiting/)
  })

  it('refuses a jump out of its routine', () => {
    const script = assemble([{ code: [[OP.JUMP, 0x9999], [OP.RETURN]] }])
    expect(() => run(script, recorder().host)).toThrow(/outside its routine/)
  })
})

describe('an event', () => {
  it('runs its sections 200, then 100, then 300, sharing its variables', () => {
    const script = assemble(
      [
        { code: [...engine(100, [OP.LOAD, 0, SCOPE_EVENT]), [OP.POP], [OP.RETURN]] },
        {
          code: [
            [OP.REF, 0, SCOPE_EVENT],
            int(12),
            [OP.STORE],
            [OP.POP],
            ...engine(200),
            [OP.POP],
            [OP.YIELD],
            [OP.RETURN],
          ],
        },
        { code: [...engine(300), [OP.POP], [OP.RETURN]] },
      ],
      [
        { id: 200, routine: 1 },
        { id: 300, routine: 2 },
        { id: 100, routine: 0 },
      ],
    )
    const { host, calls } = recorder()
    const event = new EventRun(script, host)
    let frames = 0
    while (event.step()) frames++
    expect(calls.map((c) => c.id)).toEqual([200, 100, 300])
    expect(calls[1]?.args).toEqual([12])
    expect(frames).toBe(1)
  })
})
