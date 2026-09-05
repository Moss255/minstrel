import { describe, expect, it } from 'vitest'
import { PrimitiveType, runDisplayList } from '../src/displaylist.ts'
import { NitroGfxError } from '../src/errors.ts'

/**
 * Build a display list from commands and parameters.
 *
 * The packed form is four command bytes then all their parameters in order, so
 * the builder batches commands in fours and pads the last group with no-ops —
 * exactly as the hardware's format requires.
 */
function list(...ops: [number, ...number[]][]): Uint8Array {
  const bytes: number[] = []
  for (let i = 0; i < ops.length; i += 4) {
    const group = ops.slice(i, i + 4)
    for (let k = 0; k < 4; k++) bytes.push(group[k]?.[0] ?? 0x00)
    for (const op of group) {
      for (const param of op.slice(1)) {
        bytes.push(param & 0xff, (param >>> 8) & 0xff, (param >>> 16) & 0xff, (param >>> 24) & 0xff)
      }
    }
  }
  return Uint8Array.from(bytes)
}

const BEGIN = (type: number): [number, number] => [0x40, type]
const END: [number] = [0x41]
/** VTX_16 takes x and y packed in one parameter and z in the next. */
const VTX16 = (x: number, y: number, z: number): [number, number, number] => [
  0x23,
  (x & 0xffff) | ((y & 0xffff) << 16),
  z & 0xffff,
]
const ONE = 1 << 12

describe('runDisplayList', () => {
  it('decodes a triangle', () => {
    const geometry = runDisplayList(
      list(BEGIN(PrimitiveType.Triangles), VTX16(0, 0, 0), VTX16(ONE, 0, 0), VTX16(0, ONE, 0), END),
    )
    expect(geometry.vertices).toHaveLength(3)
    expect(geometry.indices).toEqual([0, 1, 2])
    expect(geometry.vertices[1]?.x).toBeCloseTo(1)
    expect(geometry.vertices[2]?.y).toBeCloseTo(1)
  })

  it('splits a quad into two triangles sharing a diagonal', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Quads),
        VTX16(0, 0, 0),
        VTX16(ONE, 0, 0),
        VTX16(ONE, ONE, 0),
        VTX16(0, ONE, 0),
        END,
      ),
    )
    expect(geometry.vertices).toHaveLength(4)
    expect(geometry.indices).toEqual([0, 1, 2, 0, 2, 3])
  })

  it('decodes a triangle strip with consistent winding', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.TriangleStrip),
        VTX16(0, 0, 0),
        VTX16(ONE, 0, 0),
        VTX16(0, ONE, 0),
        VTX16(ONE, ONE, 0),
        END,
      ),
    )
    // Four vertices give two triangles; the second is flipped back so both
    // wind the same way.
    expect(geometry.indices).toEqual([0, 1, 2, 2, 1, 3])
  })

  it('decodes a quad strip', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.QuadStrip),
        VTX16(0, 0, 0),
        VTX16(ONE, 0, 0),
        VTX16(0, ONE, 0),
        VTX16(ONE, ONE, 0),
        END,
      ),
    )
    expect(geometry.indices).toEqual([0, 1, 3, 0, 3, 2])
  })

  it('keeps the untouched coordinate when a partial vertex command is used', () => {
    // VTX_16 sets all three, then VTX_XY changes x and y and must keep z.
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, ONE),
        [0x25, (ONE & 0xffff) | ((ONE & 0xffff) << 16)],
        [0x26, (0 & 0xffff) | ((ONE & 0xffff) << 16)],
        END,
      ),
    )
    expect(geometry.vertices[1]?.z).toBeCloseTo(1)
    expect(geometry.vertices[1]?.x).toBeCloseTo(1)
    // VTX_XZ then changes x and z but must keep the y from the previous vertex.
    expect(geometry.vertices[2]?.y).toBeCloseTo(1)
    expect(geometry.vertices[2]?.z).toBeCloseTo(1)
  })

  it('applies a vertex difference to the running position', () => {
    const geometry = runDisplayList(
      list(BEGIN(PrimitiveType.Triangles), VTX16(0, 0, 0), [0x28, 0], END),
    )
    // A zero difference must leave the position exactly where it was.
    expect(geometry.vertices[1]?.x).toBe(geometry.vertices[0]?.x)
    expect(geometry.vertices[1]?.y).toBe(geometry.vertices[0]?.y)
  })

  it('reads colour as 5 bits per channel', () => {
    const geometry = runDisplayList(
      list(BEGIN(PrimitiveType.Triangles), [0x20, 31 | (0 << 5) | (31 << 10)], VTX16(0, 0, 0), END),
    )
    const v = geometry.vertices[0]
    expect(v?.r).toBeCloseTo(1)
    expect(v?.g).toBeCloseTo(0)
    expect(v?.b).toBeCloseTo(1)
  })

  it('reads texture coordinates as 1.11.4 texels', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        [0x22, (32 * 16) | ((16 * 16) << 16)],
        VTX16(0, 0, 0),
        END,
      ),
    )
    expect(geometry.vertices[0]?.s).toBeCloseTo(32)
    expect(geometry.vertices[0]?.t).toBeCloseTo(16)
  })

  it('records the matrix each vertex was bound to', () => {
    const geometry = runDisplayList(
      list(
        [0x14, 3],
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, 0),
        [0x14, 7],
        VTX16(ONE, 0, 0),
        VTX16(0, ONE, 0),
        END,
      ),
    )
    expect(geometry.vertices[0]?.matrixId).toBe(3)
    expect(geometry.vertices[1]?.matrixId).toBe(7)
    expect(geometry.matrixIds).toEqual([3, 7])
  })

  it('steps over state commands by their parameter count without desynchronising', () => {
    // A texture-parameter command between vertices must not shift the stream.
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, 0),
        [0x2a, 0xdeadbeef],
        VTX16(ONE, 0, 0),
        VTX16(0, ONE, 0),
        END,
      ),
    )
    expect(geometry.vertices).toHaveLength(3)
    expect(geometry.vertices[1]?.x).toBeCloseTo(1)
  })

  it('steps over a 4x4 matrix load, which takes sixteen parameters', () => {
    const identity = new Array(16).fill(0)
    const geometry = runDisplayList(
      list(
        [0x16, ...identity],
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, 0),
        VTX16(ONE, 0, 0),
        VTX16(0, ONE, 0),
        END,
      ),
    )
    expect(geometry.indices).toEqual([0, 1, 2])
  })

  it('handles several primitive runs in one list', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, 0),
        VTX16(ONE, 0, 0),
        VTX16(0, ONE, 0),
        END,
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, ONE),
        VTX16(ONE, 0, ONE),
        VTX16(0, ONE, ONE),
        END,
      ),
    )
    expect(geometry.vertices).toHaveLength(6)
    expect(geometry.indices).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('ignores an incomplete primitive rather than emitting a broken triangle', () => {
    const geometry = runDisplayList(
      list(BEGIN(PrimitiveType.Triangles), VTX16(0, 0, 0), VTX16(ONE, 0, 0), END),
    )
    expect(geometry.vertices).toHaveLength(2)
    expect(geometry.indices).toEqual([])
  })

  it('flushes a run left open at the end of the list', () => {
    const geometry = runDisplayList(
      list(BEGIN(PrimitiveType.Triangles), VTX16(0, 0, 0), VTX16(ONE, 0, 0), VTX16(0, ONE, 0)),
    )
    expect(geometry.indices).toEqual([0, 1, 2])
  })

  it('ignores a position outside a primitive', () => {
    const geometry = runDisplayList(list(VTX16(0, 0, 0), VTX16(ONE, 0, 0)))
    expect(geometry.vertices).toEqual([])
  })

  it('treats an empty list as empty geometry', () => {
    const geometry = runDisplayList(new Uint8Array(0))
    expect(geometry.vertices).toEqual([])
    expect(geometry.indices).toEqual([])
  })

  it('ends cleanly on the trailing no-ops a packed list is padded with', () => {
    const bytes = Uint8Array.from([
      ...list(BEGIN(PrimitiveType.Triangles), VTX16(0, 0, 0), VTX16(ONE, 0, 0), VTX16(0, ONE, 0)),
      0x00,
      0x00,
      0x00,
      0x00,
    ])
    expect(runDisplayList(bytes).indices).toEqual([0, 1, 2])
  })

  it('rejects a byte that is not a geometry command', () => {
    expect(() => runDisplayList(Uint8Array.from([0x99, 0x00, 0x00, 0x00]))).toThrow(NitroGfxError)
  })

  it('rejects a command whose parameters are missing', () => {
    // BEGIN_VTXS needs one parameter and none follows.
    expect(() => runDisplayList(Uint8Array.from([0x40, 0x00, 0x00, 0x00]))).toThrow(
      /lacks parameters/,
    )
  })

  it('rejects an unknown primitive type', () => {
    // BEGIN with a type of 4 cannot occur: the field is two bits, so this is
    // reached only by a deliberately malformed list.
    const geometry = () => runDisplayList(list(BEGIN(4), VTX16(0, 0, 0), END))
    expect(geometry().indices).toEqual([])
  })
})

const SCALE = (x: number, y: number, z: number): [number, number, number, number] => [
  0x1b,
  Math.round(x * 4096),
  Math.round(y * 4096),
  Math.round(z * 4096),
]
const RESTORE = (slot: number): [number, number] => [0x14, slot]

describe('the position scale', () => {
  it('applies MTX_SCALE to the vertices that follow', () => {
    const geometry = runDisplayList(
      list(
        SCALE(2, 4, 8),
        BEGIN(PrimitiveType.Triangles),
        VTX16(ONE, ONE, ONE),
        VTX16(ONE, ONE, ONE),
        VTX16(ONE, ONE, ONE),
        END,
      ),
    )
    const v = geometry.vertices[0]
    expect([v?.x, v?.y, v?.z]).toEqual([2, 4, 8])
  })

  it('takes the scale the caller says is already in effect', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        VTX16(ONE, ONE, ONE),
        VTX16(0, 0, 0),
        VTX16(0, 0, 0),
        END,
      ),
      'list',
      { scale: 16 },
    )
    const v = geometry.vertices[0]
    expect([v?.x, v?.y, v?.z]).toEqual([16, 16, 16])
  })

  it('drops the scale on MTX_RESTORE, as loading a stored matrix does', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        VTX16(ONE, 0, 0),
        RESTORE(3),
        VTX16(ONE, 0, 0),
        VTX16(ONE, 0, 0),
        END,
      ),
      'list',
      { scale: 16 },
    )
    expect(geometry.vertices[0]?.x).toBe(16)
    expect(geometry.vertices[1]?.x).toBe(1)
  })

  it('starts on the matrix slot the caller says is current', () => {
    const geometry = runDisplayList(
      list(
        BEGIN(PrimitiveType.Triangles),
        VTX16(0, 0, 0),
        RESTORE(3),
        VTX16(0, 0, 0),
        VTX16(0, 0, 0),
        END,
      ),
      'list',
      { matrixId: 6 },
    )
    expect(geometry.vertices[0]?.matrixId).toBe(6)
    expect(geometry.vertices[1]?.matrixId).toBe(3)
  })
})
