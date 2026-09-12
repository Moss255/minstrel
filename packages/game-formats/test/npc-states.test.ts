import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readNpcStates } from '../src/npc.ts'

/** Little-endian words, one after another from `at`. */
function setWords(view: DataView, at: number, words: readonly number[]): void {
  for (const [k, word] of words.entries()) view.setUint32(at + 4 * k, word, true)
}

/**
 * One placement block, built in code: its header, a record with a position, a
 * word of something neither form describes, and a record without a position.
 */
function blockWithStates(): Uint8Array {
  const out = new Uint8Array(32 + 60 + 4 + 44)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0xa5060003, true)
  view.setUint32(4, 0xffffff0a, true)
  view.setUint32(8, 1100, true)
  view.setUint32(12, 7, true)

  let at = 32
  view.setUint32(at, 0x550d0005, true)
  view.setUint32(at + 4, 0xff02a955, true)
  setWords(view, at + 8, [2, 6, 1, 2, 6, 5, 1])
  view.setUint32(at + 0x24, 1106, true)
  view.setUint32(at + 0x28, 7, true)
  view.setFloat32(at + 0x2c, -3.25, true)
  view.setFloat32(at + 0x30, 0.5, true)
  view.setFloat32(at + 0x34, -3, true)
  view.setFloat32(at + 0x38, 1.5, true)

  at += 60
  view.setUint32(at, 0x12345678, true)

  at += 4
  view.setUint32(at, 0x55090005, true)
  view.setUint32(at + 4, 0xffff0155, true)
  setWords(view, at + 8, [2, 7, 1, 19, 99, 1, 0])
  view.setUint32(at + 0x24, 1100, true)
  view.setUint32(at + 0x28, 7, true)
  return out
}

describe('readNpcStates', () => {
  it('reads every record after the header, with a position or without', () => {
    const states = readNpcStates(blockWithStates())
    expect(states).toHaveLength(2)

    const [placed, unplaced] = states
    expect(placed).toMatchObject({ block: 0, offset: 32, map: 1106, id: 7 })
    expect(Array.from(placed?.unknown_0x08 ?? [])).toEqual([2, 6, 1, 2, 6, 5, 1])
    expect(placed?.position).toEqual({ x: -3.25, y: 0.5, z: -3, facing: 1.5 })

    // The word between them is neither form, and is stepped over.
    expect(unplaced).toMatchObject({ block: 0, offset: 96, map: 1100, id: 7 })
    expect(unplaced?.position).toBeUndefined()
  })

  it('reads nothing from a block with no records after its header', () => {
    expect(readNpcStates(blockWithStates().subarray(0, 32))).toEqual([])
  })

  it('refuses a record that runs past the end of its block', () => {
    expect(() => readNpcStates(blockWithStates().subarray(0, 72))).toThrow(GameFormatError)
  })
})
