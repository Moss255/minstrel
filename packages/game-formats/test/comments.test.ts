import { describe, expect, it } from 'vitest'
import { readCommentLines, readCommentTable } from '../src/comments.ts'
import { GameFormatError } from '../src/errors.ts'
import { buildTable } from './fixture.ts'

const offsets = (strings: string[]) => (i: number) =>
  strings.slice(0, i).reduce((o, s) => o + s.length + 1, 0)

describe('Stella’s comments', () => {
  it('reads the table: each entry’s number and its three files, passing over one with none', () => {
    const strings = ['data/scenario/cmtB13.gp2', 'B13_<LG>.bin', 'data/scenario/cmtB13.stb']
    const at = offsets(strings)
    const table = readCommentTable(
      buildTable(
        [
          { tag: 0x66, type: 1, values: [152] },
          // An integer and three strings: 1 0 0 0, two bits a value.
          { tag: 0x67, type: 0x01, values: [1, at(0), at(1), at(2)] },
          { tag: 0x67, type: 0x01, values: [147, 0xffffffff, 0xffffffff, 0xffffffff] },
        ],
        strings,
      ),
    )
    expect([...table.keys()]).toEqual([1])
    expect(table.get(1)).toEqual({
      number: 1,
      archive: 'data/scenario/cmtB13.gp2',
      member: 'B13_<LG>.bin',
      script: 'data/scenario/cmtB13.stb',
    })
  })

  it('reads an entry’s lines, the man’s and the woman’s, by number', () => {
    const strings = ['Keep up the goodish work!', 'Keep it up, missy!']
    const at = offsets(strings)
    const lines = readCommentLines(
      buildTable([{ tag: 0x67, type: 0x01, values: [2003, at(0), at(1)] }], strings),
    )
    expect(lines.get(2003)).toEqual(['Keep up the goodish work!', 'Keep it up, missy!'])
    // A woman's line alone: −1 for the man's.
    const hers = readCommentLines(
      buildTable([{ tag: 0x67, type: 0x01, values: [117, 0xffffffff, at(1)] }], strings),
    )
    expect(hers.get(117)).toEqual([undefined, 'Keep it up, missy!'])
    expect(() =>
      readCommentLines(buildTable([{ tag: 0x67, type: 0x01, values: [2003, at(0)] }], strings)),
    ).toThrow(GameFormatError)
  })
})
