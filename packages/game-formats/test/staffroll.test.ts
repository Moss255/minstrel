import { describe, expect, it } from 'vitest'
import { readStaffRoll } from '../src/staffroll.ts'
import { buildTable } from './fixture.ts'

/** A line's flags: size in bits 0–3, alignment 4–5, colour 7–10. */
const flags = (size: number, align: number, colour: number) => size | (align << 4) | (colour << 7)
/** Three integers and a string: two bits of type each, 1 1 1 0. */
const LINE_TYPES = 0x15

describe('the staff roll', () => {
  const strings = ['Company', 'Role', 'A Name', 'B Name', 'Over']
  const at = (i: number) => strings.slice(0, i).reduce((o, s) => o + s.length + 1, 0)
  const line = (group: number, f: number, gap: number, text: number) => ({
    tag: 0x65,
    type: LINE_TYPES,
    values: [group, f, gap, at(text)],
  })

  it('reads the speed, the room and each line, its flags taken apart', () => {
    const roll = readStaffRoll(
      buildTable(
        [
          { tag: 0x66, type: 2, floats: [0.75] },
          { tag: 0x64, type: 1, values: [4] },
          line(1, flags(12, 1, 15), 209, 0),
          line(2, flags(10, 1, 5), 37, 1),
          // Two names side by side: one group, ending at 120 and beginning at 136.
          line(3, flags(12, 2, 15), 23, 2),
          line(3, flags(12, 3, 15), 23, 3),
          // Past the room made, as the roll drops it.
          line(4, flags(12, 1, 15), 13, 4),
        ],
        strings,
      ),
    )
    expect(roll.speed).toBe(0.75)
    expect(roll.room).toBe(4)
    expect(roll.lines.map((l) => l.text)).toEqual(['Company', 'Role', 'A Name', 'B Name'])
    expect(roll.lines[1]).toMatchObject({ group: 2, gap: 37, size: 10, align: 1, colour: 5 })
    expect(roll.lines.slice(2).map((l) => [l.group, l.align])).toEqual([
      [3, 2],
      [3, 3],
    ])
  })

  it('keeps a speed of 1 and no lines until the file says otherwise', () => {
    const roll = readStaffRoll(buildTable([line(1, flags(12, 1, 15), 13, 0)], strings))
    expect(roll).toEqual({ speed: 1, room: 0, lines: [] })
  })

  it('throws on a file that is not a table', () => {
    expect(() => readStaffRoll(new Uint8Array(8))).toThrow()
  })
})
