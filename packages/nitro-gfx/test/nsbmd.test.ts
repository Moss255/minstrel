import { describe, expect, it } from 'vitest'
import { readDict } from '../src/dict.ts'
import { NitroGfxError } from '../src/errors.ts'
import { isNsbmd, measureBounds, readNsbmd } from '../src/nsbmd.ts'
import { buildNsbmd, triangleList } from './fixture.ts'

const simple = () =>
  buildNsbmd([
    {
      name: 'model0',
      objects: ['bone0', 'bone1'],
      materials: ['mat0'],
      shapes: [{ name: 'polygon0', displayList: triangleList() }],
    },
  ])

describe('readNsbmd', () => {
  it('reads the container header and its blocks', () => {
    const nsbmd = readNsbmd(simple())
    expect(nsbmd.version).toBe(2)
    expect(nsbmd.blocks.map((b) => b.stamp)).toEqual(['MDL0'])
    expect(nsbmd.block('MDL0')?.size).toBeGreaterThan(0)
    expect(nsbmd.block('TEX0')).toBeUndefined()
  })

  it('enumerates models, objects, materials and shapes by name', () => {
    const model = readNsbmd(simple()).models[0]
    expect(model?.name).toBe('model0')
    expect(model?.objects.map((o) => o.name)).toEqual(['bone0', 'bone1'])
    expect(model?.materials.map((m) => m.name)).toEqual(['Mat_mat0_'])
    expect(model?.textureNames).toEqual(['mat0'])
    expect(model?.paletteNames).toEqual(['mat0_pl'])
    expect(model?.shapes.map((s) => s.name)).toEqual(['polygon0'])
    expect(model?.numObjects).toBe(2)
  })

  it('decodes a shape into geometry', () => {
    const model = readNsbmd(simple()).models[0]
    if (!model) throw new Error('fixture has no model')
    const geometry = model.geometry(0)
    expect(geometry.vertices).toHaveLength(3)
    expect(geometry.indices).toEqual([0, 1, 2])
  })

  it('reads the position scale', () => {
    const nsbmd = readNsbmd(
      buildNsbmd([
        { name: 'scaled', upScale: 8, shapes: [{ name: 's', displayList: triangleList() }] },
      ]),
    )
    expect(nsbmd.models[0]?.upScale).toBe(8)
  })

  it('resolves the bounding box as origin plus extents', () => {
    const ONE = 1 << 12
    const nsbmd = readNsbmd(
      buildNsbmd([{ name: 'boxed', box: [ONE, ONE, ONE, ONE, ONE, ONE], shapes: [] }]),
    )
    const bounds = nsbmd.models[0]?.bounds
    // Origin 1.0 with extent 1.0 gives a far corner of 2.0, not 1.0.
    expect(bounds?.minX).toBeCloseTo(1)
    expect(bounds?.maxX).toBeCloseTo(2)
  })

  it('holds several models in one container', () => {
    const nsbmd = readNsbmd(
      buildNsbmd([
        { name: 'first', shapes: [{ name: 'a', displayList: triangleList() }] },
        { name: 'second', shapes: [{ name: 'b', displayList: triangleList() }] },
      ]),
    )
    expect(nsbmd.models.map((m) => m.name)).toEqual(['first', 'second'])
    expect(nsbmd.model('second')?.geometry(0).vertices).toHaveLength(3)
  })

  it('handles a model with no shapes', () => {
    const model = readNsbmd(buildNsbmd([{ name: 'empty', shapes: [] }])).models[0]
    expect(model?.numShapes).toBe(0)
    expect(model?.shapes).toEqual([])
  })
})

describe('measureBounds', () => {
  it('measures decoded geometry', () => {
    const model = readNsbmd(simple()).models[0]
    if (!model) throw new Error('fixture has no model')
    const bounds = measureBounds([model.geometry(0)])
    expect(bounds.minX).toBeCloseTo(0)
    expect(bounds.maxX).toBeCloseTo(1)
    expect(bounds.maxZ).toBeCloseTo(1)
  })

  it('returns a zero box for no geometry', () => {
    expect(measureBounds([])).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 })
  })
})

describe('isNsbmd', () => {
  it('recognises the stamp without validating the body', () => {
    expect(isNsbmd(simple())).toBe(true)
    expect(isNsbmd(Uint8Array.from([0x42, 0x4d, 0x44, 0x30, 0xff]))).toBe(true)
    expect(isNsbmd(new Uint8Array(8))).toBe(false)
  })
})

describe('readNsbmd on malformed input', () => {
  it('rejects a buffer that is not an NSBMD', () => {
    expect(() => readNsbmd(new Uint8Array(64))).toThrow(/not an NSBMD/)
  })

  it('rejects a big-endian byte-order mark', () => {
    const data = simple()
    new DataView(data.buffer).setUint16(0x04, 0xfffe, true)
    expect(() => readNsbmd(data)).toThrow(/byte-order mark/)
  })

  it('rejects a declared size larger than the buffer', () => {
    const data = simple()
    new DataView(data.buffer).setUint32(0x08, data.length + 4096, true)
    expect(() => readNsbmd(data)).toThrow(/only \d+ are present/)
  })

  it('rejects a block offset outside the container', () => {
    const data = simple()
    new DataView(data.buffer).setUint32(0x10, 0x7fff_0000, true)
    expect(() => readNsbmd(data)).toThrow(NitroGfxError)
  })

  it('rejects a truncated container', () => {
    expect(() => readNsbmd(simple().subarray(0, 0x18))).toThrow(NitroGfxError)
  })
})

describe('readDict', () => {
  it('rejects a dictionary whose declared size does not match its contents', () => {
    const data = simple()
    // The MDL0 dictionary starts at 0x14 + 8.
    new DataView(data.buffer).setUint16(0x14 + 8 + 2, 0x99, true)
    expect(() => readNsbmd(data)).toThrow(/declares \d+ bytes but/)
  })

  it('rejects a patricia section size inconsistent with its entry count', () => {
    const data = simple()
    new DataView(data.buffer).setUint16(0x14 + 8 + 6, 0x40, true)
    expect(() => readNsbmd(data)).toThrow(/patricia section declares/)
  })

  it('rejects a dictionary that runs past its buffer', () => {
    expect(() => readDict(new Uint8Array(6), 0)).toThrow(NitroGfxError)
  })
})

describe("a material's colour", () => {
  it('reads the diffuse out of its own record, and the vertex-colour bit', () => {
    // Black with bit 15 set, which is what the round shadow's material carries.
    const black = buildNsbmd([{ name: 'm', materials: ['a'], materialDiffAmb: [0x8000] }])
    const one = readNsbmd(black).models[0]?.materials[0]
    expect(one?.diffuse).toEqual([0, 0, 0])
    expect(one?.setVertexColour).toBe(true)

    // White, the default, and what all but 82 of the cartridge's carry.
    const white = readNsbmd(buildNsbmd([{ name: 'm', materials: ['a'] }]))
    expect(white.models[0]?.materials[0]?.diffuse).toEqual([1, 1, 1])

    // A colour in between, channel by channel: BGR555, red 31 green 0 blue 15.
    const mixed = buildNsbmd([
      { name: 'm', materials: ['a'], materialDiffAmb: [(15 << 10) | (0 << 5) | 31] },
    ])
    const rgb = readNsbmd(mixed).models[0]?.materials[0]?.diffuse
    expect(rgb?.[0]).toBeCloseTo(1, 5)
    expect(rgb?.[1]).toBeCloseTo(0, 5)
    expect(rgb?.[2]).toBeCloseTo(15 / 31, 5)
    // Bit 15 clear this time.
    expect(readNsbmd(mixed).models[0]?.materials[0]?.setVertexColour).toBe(false)
  })
})
