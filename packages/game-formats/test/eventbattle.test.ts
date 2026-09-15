import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readEventBattles } from '../src/eventbattle.ts'

/** An event battle file built in code: each record an index, up to three monsters with counts, and two more words. */
function file(records: { index: number; foes: [number, number][]; tail?: [number, number] }[]) {
  const bytes = new Uint8Array(16 + records.length * 44)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, records.length, true)
  view.setUint32(4, bytes.length, true)
  records.forEach((record, r) => {
    const at = 16 + r * 44
    view.setUint32(at, 0x55090064, true)
    view.setUint32(at + 4, 0xffff0155, true)
    view.setUint32(at + 8, record.index, true)
    for (let s = 0; s < 3; s++) {
      const foe = record.foes[s]
      view.setUint32(at + 12 + s * 8, foe ? foe[0] : 0xffffffff, true)
      view.setUint32(at + 16 + s * 8, foe ? foe[1] : 0, true)
    }
    view.setUint32(at + 36, record.tail?.[0] ?? 0, true)
    view.setUint32(at + 40, record.tail?.[1] ?? 0, true)
  })
  return bytes
}

describe('event battles', () => {
  it('reads each record’s index, its monsters and counts, and the words after', () => {
    const battles = readEventBattles(
      file([
        {
          index: 26,
          foes: [
            [290, 1],
            [292, 1],
            [290, 1],
          ],
          tail: [23, 30116],
        },
        { index: 2, foes: [[300, 1]], tail: [24, 30215] },
      ]),
    )
    expect(battles).toEqual([
      {
        index: 26,
        foes: [
          { monster: 290, count: 1 },
          { monster: 292, count: 1 },
          { monster: 290, count: 1 },
        ],
        unknown_0x24: 23,
        unknown_0x28: 30116,
      },
      { index: 2, foes: [{ monster: 300, count: 1 }], unknown_0x24: 24, unknown_0x28: 30215 },
    ])
  })

  it('throws on a short file, a size that does not match, and a record without its tag', () => {
    expect(() => readEventBattles(new Uint8Array(8))).toThrow(GameFormatError)
    const good = file([{ index: 2, foes: [[300, 1]] }])
    const sized = good.slice()
    new DataView(sized.buffer).setUint32(4, 999, true)
    expect(() => readEventBattles(sized)).toThrow(/head says 999/)
    const untagged = good.slice()
    new DataView(untagged.buffer).setUint32(16, 0, true)
    expect(() => readEventBattles(untagged)).toThrow(/tag/)
    const counted = good.slice()
    new DataView(counted.buffer).setUint32(0, 5, true)
    expect(() => readEventBattles(counted)).toThrow(/past the end/)
  })
})
