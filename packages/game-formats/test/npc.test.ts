import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { PLACEMENT_SCALE } from '../src/mapmanifest.ts'
import {
  isNpcList,
  isNpcPlacements,
  NPC_KIND,
  npcSubMap,
  placeNpcs,
  readNpcList,
  readNpcPlacements,
} from '../src/npc.ts'

/**
 * Fixtures are built here, never taken from a cartridge.
 *
 * A cast list is the shared tagged table: a 16-byte header, records of
 * `u16` tag / `u8` count / `u8` type, then a string table. A placement file is
 * a stream of variable-length blocks found by their two-word signature.
 */
function buildList(
  entries: { id: number; kind: number; name?: string }[],
  options: { values?: number } = {},
): Uint8Array {
  const names = entries.map((e) => e.name).filter((n): n is string => n !== undefined)
  const offsets = new Map<string, number>()
  let at = 0
  for (const n of names) {
    if (!offsets.has(n)) {
      offsets.set(n, at)
      at += n.length + 1
    }
  }
  const stringSize = at
  // Two bits of type per value, padded to a word: five values need an
  // eight-byte header, and fewer than four need only four.
  const count = options.values ?? 5
  const RECORD_HEADER = Math.ceil((3 + Math.ceil(count / 4)) / 4) * 4
  const records = entries.length * (RECORD_HEADER + count * 4)
  const stringOffset = 16 + records
  const out = new Uint8Array(stringOffset + stringSize)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0, true)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringSize, true)
  view.setUint32(12, offsets.size, true)

  let cursor = 16
  for (const entry of entries) {
    view.setUint16(cursor, 3, true) // tag
    out[cursor + 2] = count
    out[cursor + 3] = 0 // the first type byte; the second is left zero
    const at = cursor + RECORD_HEADER
    const words = [
      entry.id,
      entry.kind,
      0xffffffff,
      entry.name === undefined ? 0xffffffff : (offsets.get(entry.name) as number),
      0,
    ]
    for (let i = 0; i < count; i++) view.setUint32(at + i * 4, words[i] ?? 0, true)
    cursor += RECORD_HEADER + count * 4
  }
  let sat = stringOffset
  for (const [name] of offsets) {
    for (let i = 0; i < name.length; i++) out[sat + i] = name.charCodeAt(i)
    sat += name.length + 1
  }
  return out
}

function buildPlacements(
  blocks: {
    id: number
    x: number
    y: number
    z: number
    facing: number
    pad?: number
    /** `area x 100 + sub-map`; the village's own maps run 1100 to 1109. */
    map?: number
  }[],
): Uint8Array {
  const size = blocks.reduce((n, b) => n + 32 + (b.pad ?? 0), 0)
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let at = 0
  for (const b of blocks) {
    view.setUint32(at, 0xa5060003, true)
    view.setUint32(at + 4, 0xffffff0a, true)
    view.setUint32(at + 8, b.map ?? 1100, true)
    view.setUint32(at + 12, b.id, true)
    view.setFloat32(at + 16, b.x, true)
    view.setFloat32(at + 20, b.y, true)
    view.setFloat32(at + 24, b.z, true)
    view.setFloat32(at + 28, b.facing, true)
    at += 32 + (b.pad ?? 0)
  }
  return out
}

/** The village's opening entries, as the cartridge orders them. */
const VILLAGE = [
  { id: 1, kind: NPC_KIND.SPRITE, name: 'n003a' },
  { id: 7, kind: NPC_KIND.MODEL, name: 's017' },
  { id: 93, kind: 1 },
]

describe('readNpcList', () => {
  it('reads a cast, its ids and its kinds', () => {
    const entries = readNpcList(buildList(VILLAGE))
    expect(entries.map((e) => e.id)).toEqual([1, 7, 93])
    expect(entries.map((e) => e.kind)).toEqual([NPC_KIND.SPRITE, NPC_KIND.MODEL, 1])
    expect(entries.map((e) => e.name)).toEqual(['n003a', 's017', undefined])
  })

  it('leaves a record with no string offset unnamed rather than guessing', () => {
    // 317 records on the cartridge carry `0xFFFFFFFF` here. Resolving that as
    // an offset would name every one of them after the first string.
    const entries = readNpcList(buildList(VILLAGE))
    expect(entries[2]?.name).toBeUndefined()
  })

  it('carries the whole record for what the fields do not cover', () => {
    // The `0xFFFFFF01` that used to lead every one of these was never a value:
    // it was the record's second type byte followed by three of `0xFF` padding,
    // read as a word because the header was assumed to be four bytes.
    expect(Array.from(readNpcList(buildList(VILLAGE))[0]?.values ?? [])).toEqual([
      1,
      NPC_KIND.SPRITE,
      0xffffffff,
      0,
      0,
    ])
  })

  it('throws on a record too short to be a character', () => {
    // Two values where a character needs four: no room for the name offset.
    expect(() => readNpcList(buildList(VILLAGE, { values: 2 }))).toThrow(/fewer than the 4/)
  })
})

describe('npcSubMap', () => {
  it('gives the area its own exterior, which is zero', () => {
    expect(npcSubMap('M01', 'M01')).toBe(0)
    expect(npcSubMap('F', 'F')).toBe(0)
  })

  it('takes the digits a sub-map code ends with', () => {
    expect(npcSubMap('M01', 'M01M04')).toBe(4)
    expect(npcSubMap('M01', 'M01M09')).toBe(9)
    expect(npcSubMap('X04', 'X04M24')).toBe(24)
  })

  it('copes with an area whose sub-maps are not spelled with an M', () => {
    // The fields are `F.npc`, and its maps are `F01`, not `FM01`.
    expect(npcSubMap('F', 'F01')).toBe(1)
    expect(npcSubMap('F', 'F63')).toBe(63)
  })

  it('is undefined for a code outside the area, so it is not read as zero', () => {
    expect(npcSubMap('M01', 'M02M01')).toBeUndefined()
    expect(npcSubMap('M01', 'S07')).toBeUndefined()
  })

  it('does not mind the case either side', () => {
    expect(npcSubMap('m01', 'M01M04')).toBe(4)
    expect(npcSubMap('M01', 'm01m04')).toBe(4)
  })
})

describe('readNpcPlacements', () => {
  const blocks = [
    { id: 1, x: -0.72, y: -1.05, z: 3.44, facing: Math.PI / 2 },
    { id: 7, x: 5.47, y: -1.05, z: 1.74, facing: 0.66 },
  ]

  it('divides the position by the placement scale, as map placements are', () => {
    const read = readNpcPlacements(buildPlacements(blocks))
    expect(read[0]?.x).toBeCloseTo(-0.72 / PLACEMENT_SCALE, 5)
    expect(read[0]?.y).toBeCloseTo(-1.05 / PLACEMENT_SCALE, 5)
    expect(read[0]?.z).toBeCloseTo(3.44 / PLACEMENT_SCALE, 5)
  })

  it('reads which map of the area each character stands in', () => {
    // A cast list is the whole area's, and the coordinates do not separate its
    // maps: an interior is its own little map about its own origin, so an
    // innkeeper at (0.1, -0.1) is over the floor of every other interior too.
    // This word is what tells them apart — `1104` is `M01M04`, the stable.
    const read = readNpcPlacements(
      buildPlacements([
        { ...(blocks[0] as (typeof blocks)[number]), map: 1100 },
        { ...(blocks[1] as (typeof blocks)[number]), map: 1104 },
      ]),
    )
    expect(read.map((p) => p.map)).toEqual([1100, 1104])
    expect(read.map((p) => (p.map as number) % 100)).toEqual([0, 4])
  })

  it('leaves the facing angle alone, because it is already radians', () => {
    const read = readNpcPlacements(buildPlacements(blocks))
    expect(read[0]?.facing).toBeCloseTo(Math.PI / 2, 5)
    expect(read[1]?.facing).toBeCloseTo(0.66, 5)
  })

  it('finds blocks that are not the same length as each other', () => {
    // The gaps between real blocks run from 76 to 924 bytes, so they cannot be
    // walked by stride: only the signature says where one begins.
    const read = readNpcPlacements(
      buildPlacements([
        { ...(blocks[0] as (typeof blocks)[number]), pad: 44 },
        { ...(blocks[1] as (typeof blocks)[number]), pad: 892 },
      ]),
    )
    expect(read.map((p) => p.id)).toEqual([1, 7])
  })

  it('is not fooled by the first marker word alone', () => {
    const data = buildPlacements(blocks)
    const view = new DataView(data.buffer)
    view.setUint32(4, 0, true) // signature's second word gone
    expect(readNpcPlacements(data).map((p) => p.id)).toEqual([7])
  })

  it('reads nothing from a file with no blocks', () => {
    expect(readNpcPlacements(new Uint8Array(64))).toEqual([])
  })

  it('throws when a block is cut off by the end of the file', () => {
    // Long enough for the second block's signature to be found, too short for
    // the four floats behind it — the case that would otherwise read garbage.
    const data = buildPlacements(blocks).subarray(0, 52)
    expect(() => readNpcPlacements(data)).toThrow(GameFormatError)
    expect(() => readNpcPlacements(data)).toThrow(/runs past the end/)
  })
})

describe('placeNpcs', () => {
  it('joins a character to its placement by id, not by position in the list', () => {
    const entries = readNpcList(buildList(VILLAGE))
    // Deliberately the other order: the ids are what join them.
    const placements = readNpcPlacements(
      buildPlacements([
        { id: 7, x: 8, y: 0, z: 0, facing: 0 },
        { id: 1, x: 16, y: 0, z: 0, facing: 0 },
      ]),
    )
    const joined = placeNpcs(entries, placements)
    expect(joined.map((j) => j.entry.name)).toEqual(['n003a', 's017'])
    expect(joined[0]?.placement.x).toBeCloseTo(2, 5)
    expect(joined[1]?.placement.x).toBeCloseTo(1, 5)
  })

  it('leaves out a character the file does not place', () => {
    // There are fewer placements than names on every archive, never more,
    // which is what you would expect if events place the rest.
    const entries = readNpcList(buildList(VILLAGE))
    const joined = placeNpcs(
      entries,
      readNpcPlacements(buildPlacements([{ id: 1, x: 0, y: 0, z: 0, facing: 0 }])),
    )
    expect(joined).toHaveLength(1)
    expect(joined[0]?.entry.name).toBe('n003a')
  })

  it('ignores a placement that names no character', () => {
    const entries = readNpcList(buildList(VILLAGE))
    expect(
      placeNpcs(
        entries,
        readNpcPlacements(buildPlacements([{ id: 999, x: 0, y: 0, z: 0, facing: 0 }])),
      ),
    ).toEqual([])
  })
})

describe('the cheap checks', () => {
  it('accepts a real cast list and a real placement file', () => {
    expect(isNpcList(buildList(VILLAGE))).toBe(true)
    expect(isNpcPlacements(buildPlacements([{ id: 1, x: 0, y: 0, z: 0, facing: 0 }]))).toBe(true)
  })

  it('does not mistake one for the other', () => {
    // `isDataTable` says yes to a placement file — its string offset happens to
    // equal its length — which is exactly the trap this avoids.
    expect(isNpcPlacements(buildList(VILLAGE))).toBe(false)
    expect(isNpcList(buildPlacements([{ id: 1, x: 0, y: 0, z: 0, facing: 0 }]))).toBe(false)
  })

  it('rejects rubbish without throwing', () => {
    expect(isNpcList(new Uint8Array(8))).toBe(false)
    expect(isNpcPlacements(new Uint8Array(8))).toBe(false)
  })
})
