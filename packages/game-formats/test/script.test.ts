import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { OP_RETURN, readScript, SCRIPT_MAGIC } from '../src/script.ts'

type Op = [op: number, a: number, b: number]

/**
 * Build an event script. Fixtures may not contain cartridge bytes, so the layout
 * is implemented here from `FORMAT.md`: the header, a table of sections, one
 * shared routine, then each section's routine, then strings.
 */
function build(options: {
  shared: { params: number; locals: number; code: Op[] }
  sections: { id: number; code: (strings: number) => Op[] }[]
  strings?: string
  corrupt?: (view: DataView) => void
}): Uint8Array {
  const tableStart = 0x40
  const base = tableStart + options.sections.length * 8
  const routineSize = (code: Op[]) => 0x38 + code.length * 12
  const sharedAt = base
  const sharedSize = routineSize(options.shared.code)
  const sectionAt: number[] = []
  let at = sharedAt + sharedSize
  // The strings go last, so their offset is known once the code's size is.
  const codes = options.sections.map((s) => s.code(0))
  for (const code of codes) {
    sectionAt.push(at)
    at += routineSize(code)
  }
  const stringsAt = at
  const text = options.strings ?? ''
  const out = new Uint8Array(stringsAt + text.length + 1)
  const view = new DataView(out.buffer)
  view.setUint32(0x00, SCRIPT_MAGIC, true)
  view.setUint32(0x04, sharedSize, true)
  view.setUint32(0x08, base, true)
  view.setUint32(0x0c, tableStart, true)
  view.setUint32(0x10, options.sections.length, true)
  view.setUint32(0x18, 3, true)
  const routine = (where: number, params: number, locals: number, code: Op[]) => {
    view.setUint32(where, where - base + 0x38, true)
    view.setUint32(where + 0x08, locals, true)
    view.setUint32(where + 0x0c, params, true)
    for (let p = 0; p < params; p++) view.setUint32(where + 0x10 + p * 4, 1, true)
    code.forEach(([op, a, b], i) => {
      view.setUint32(where + 0x38 + i * 12, op, true)
      view.setUint32(where + 0x3c + i * 12, a, true)
      view.setUint32(where + 0x40 + i * 12, b, true)
    })
  }
  routine(sharedAt, options.shared.params, options.shared.locals, options.shared.code)
  options.sections.forEach((s, i) => {
    view.setUint32(tableStart + i * 8, s.id, true)
    view.setUint32(tableStart + i * 8 + 4, sectionAt[i] as number, true)
    // A string operand is an offset from the code base, as a jump's is.
    routine(sectionAt[i] as number, 0, 0, s.code(stringsAt - base))
  })
  for (let i = 0; i < text.length; i++) out[stringsAt + i] = text.charCodeAt(i)
  options.corrupt?.(view)
  return out
}

const wait: { params: number; locals: number; code: Op[] } = {
  params: 1,
  locals: 1,
  code: [
    [3, 1, 0],
    [OP_RETURN, 0, 0],
  ],
}

describe('readScript', () => {
  it('reads the sections, a routine header and its code to the return', () => {
    const script = readScript(
      build({
        shared: wait,
        sections: [
          {
            id: 100,
            code: (strings) => [
              [3, 3, strings],
              [0x14, 1, 0],
              [3, 1, 30],
              [0x13, 0, 0],
              [4, 0, 0],
              [3, 1, 0],
              [OP_RETURN, 0, 0],
            ],
          },
          { id: 200, code: () => [[OP_RETURN, 0, 0]] },
        ],
        strings: 'stand',
      }),
    )
    expect(script.base).toBe(0x50)
    expect(script.unknown_0x18).toBe(3)
    expect(script.sections.map((s) => s.id)).toEqual([100, 200])
    const main = script.sections[0]?.routine
    expect(main?.code.map((i) => i.op)).toEqual([3, 0x14, 3, 0x13, 4, 3, OP_RETURN])
    expect(main?.code[2]).toMatchObject({ op: 3, a: 1, b: 30 })
    const called = script.routineAt(main?.code[3]?.b ?? -1)
    expect(called).toMatchObject({ params: 1, locals: 1, at: script.base })
    expect(called.unknown_0x10.slice(0, 2)).toEqual([1, 0])
    expect(new TextDecoder().decode(script.stringAt(main?.code[0]?.b ?? -1))).toBe('stand')
  })

  it('refuses what is not a script', () => {
    const bytes = build({ shared: wait, sections: [] })
    bytes[0] = 0x58
    expect(() => readScript(bytes)).toThrow(/not an SB2/)
    expect(() => readScript(new Uint8Array(0x20))).toThrow(GameFormatError)
  })

  it('refuses a routine that does not carry its own offset', () => {
    const bytes = build({
      shared: wait,
      sections: [{ id: 100, code: () => [[OP_RETURN, 0, 0]] }],
      corrupt: (view) => view.setUint32(view.getUint32(0x44, true), 0x1234, true),
    })
    expect(() => readScript(bytes)).toThrow(/own entry address/)
  })

  it('refuses a routine with no return before the end', () => {
    const bytes = build({
      shared: wait,
      sections: [{ id: 100, code: () => [[3, 1, 5]] }],
    })
    expect(() => readScript(bytes)).toThrow(/runs off the end/)
  })

  it('refuses a string outside the file', () => {
    const script = readScript(build({ shared: wait, sections: [] }))
    expect(() => script.stringAt(1 << 20)).toThrow(/outside/)
  })
})
