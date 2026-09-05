import { describe, expect, it } from 'vitest'
import { blend, identity, multiply, transformPoint } from '../src/matrix.ts'
import { readNode } from '../src/node.ts'
import { RenderOp, readRenderCommands, resolveMatrices } from '../src/render.ts'

/** Assemble a node record from flags and payload words. */
function node(flags: number, firstRotationCell: number, payload: number[]): Uint8Array {
  const out = new Uint8Array(4 + payload.length * 2)
  const view = new DataView(out.buffer)
  view.setUint16(0, flags, true)
  view.setUint16(2, firstRotationCell, true)
  payload.forEach((v, i) => {
    view.setUint16(4 + i * 2, v & 0xffff, true)
  })
  return out
}
const fx32 = (v: number) => [Math.round(v * 4096) & 0xffff, (Math.round(v * 4096) >> 16) & 0xffff]
const ONE = 4096

describe('matrix', () => {
  it('multiplies in the order that applies the right operand first', () => {
    const translate = identity()
    translate[12] = 10
    const scale = identity()
    scale[0] = 2
    // translate * scale: scale, then translate.
    expect(transformPoint(multiply(translate, scale), 1, 0, 0)).toEqual([12, 0, 0])
    // scale * translate: translate, then scale.
    expect(transformPoint(multiply(scale, translate), 1, 0, 0)).toEqual([22, 0, 0])
  })

  it('blends matrices componentwise by weight', () => {
    const a = identity()
    a[12] = 0
    const b = identity()
    b[12] = 10
    const mixed = blend([a, b], [0.5, 0.5])
    expect(mixed[12]).toBeCloseTo(5)
    expect(mixed[0]).toBeCloseTo(1)
  })
})

describe('readNode', () => {
  it('reads a node with no transform as four bytes and the identity', () => {
    const { node: n, size } = readNode(node(0x0007, 0x1000, []), 0, 0, 'root')
    expect(size).toBe(4)
    expect(Array.from(n.local)).toEqual(Array.from(identity()))
  })

  it('reads a translation', () => {
    const data = node(0x0007 & ~0x01, 0, [...fx32(1.5), ...fx32(-2), ...fx32(0.25)])
    const { node: n, size } = readNode(data, 0, 0, 'bone')
    expect(size).toBe(16)
    expect(n.local[12]).toBeCloseTo(1.5)
    expect(n.local[13]).toBeCloseTo(-2)
    expect(n.local[14]).toBeCloseTo(0.25)
  })

  it('takes a full rotation as eight cells plus one from the header word', () => {
    // Identity rotation written the long way: [0][0] in the header, then the
    // other eight in row-major order.
    const data = node(0x0005, ONE, [0, 0, 0, ONE, 0, 0, 0, ONE])
    const { node: n, size } = readNode(data, 0, 0, 'bone')
    // 4 header + 8 cells * 2 bytes = 20, not the 22 nine cells would need.
    expect(size).toBe(20)
    expect(Array.from(n.local)).toEqual(Array.from(identity()))
  })

  it('builds a pivot rotation that is orthonormal with determinant one', () => {
    // Pivot index 4 (cell [1][1]), a = cos, b = sin of 30 degrees.
    const a = Math.round(Math.cos(Math.PI / 6) * ONE)
    const b = Math.round(Math.sin(Math.PI / 6) * ONE)
    const { node: n } = readNode(node(0x0005 | 0x08 | (4 << 4), 0, [a, b]), 0, 0, 'pivot')
    const m = n.local
    const col = (c: number) => [m[c * 4] as number, m[c * 4 + 1] as number, m[c * 4 + 2] as number]
    const dot = (x: number[], y: number[]) =>
      (x[0] as number) * (y[0] as number) +
      (x[1] as number) * (y[1] as number) +
      (x[2] as number) * (y[2] as number)
    for (const c of [0, 1, 2]) expect(Math.sqrt(dot(col(c), col(c)))).toBeCloseTo(1, 3)
    expect(dot(col(0), col(1))).toBeCloseTo(0, 3)
    expect(dot(col(0), col(2))).toBeCloseTo(0, 3)
    // The pivot cell of an even-parity index is +1.
    expect(m[5]).toBeCloseTo(1)
  })

  it('gives an odd-parity pivot cell the negative sign a rotation requires', () => {
    // Index 1 is [0][1]; row + col is odd, so the cell must be -1 for the
    // determinant to come out +1.
    const { node: n } = readNode(node(0x0005 | 0x08 | (1 << 4), 0, [ONE, 0]), 0, 0, 'pivot')
    expect(n.local[4]).toBeCloseTo(-1)
  })

  it('applies scale to the rotation columns', () => {
    const data = node(0x0003, 0, [
      ...fx32(2),
      ...fx32(3),
      ...fx32(4),
      ...fx32(0.5),
      ...fx32(1 / 3),
      ...fx32(0.25),
    ])
    const { node: n, size } = readNode(data, 0, 0, 'scaled')
    expect(size).toBe(28)
    expect(n.local[0]).toBeCloseTo(2)
    expect(n.local[5]).toBeCloseTo(3)
    expect(n.local[10]).toBeCloseTo(4)
  })
})

describe('readRenderCommands', () => {
  const stream = (...bytes: number[]) => Uint8Array.from(bytes)

  it('reads a node-description command and its flag parameters', () => {
    const commands = readRenderCommands(stream(0x26, 2, 1, 0, 5, RenderOp.End), 0, 6)
    expect(commands[0]?.op).toBe(RenderOp.NodeDescription)
    expect(commands[0]?.params).toEqual([2, 1, 0, 5])
    expect(commands[1]?.op).toBe(RenderOp.End)
  })

  it('reads a blend command whose length depends on its term count', () => {
    const commands = readRenderCommands(
      stream(RenderOp.NodeMix, 3, 2, 1, 1, 0x80, 2, 2, 0x80, RenderOp.End),
      0,
      10,
    )
    expect(commands[0]?.params).toEqual([3, 2, 1, 1, 0x80, 2, 2, 0x80])
    expect(commands[1]?.op).toBe(RenderOp.End)
  })

  it('stops at the end opcode and ignores what follows', () => {
    const commands = readRenderCommands(stream(RenderOp.End, 0x99, 0x99), 0, 3)
    expect(commands).toHaveLength(1)
  })

  it('rejects an unknown opcode', () => {
    expect(() => readRenderCommands(stream(0x1f, 0), 0, 2)).toThrow(/is not known/)
  })

  it('rejects a stream with no end opcode', () => {
    expect(() => readRenderCommands(stream(RenderOp.Nop, RenderOp.Nop), 0, 2)).toThrow(
      /without an End/,
    )
  })
})

describe('resolveMatrices', () => {
  const bone = (name: string, index: number, tx: number) => {
    const local = identity()
    local[12] = tx
    return { index, name, flags: 0, local }
  }

  it('composes a child transform onto its parent', () => {
    const nodes = [bone('root', 0, 1), bone('child', 1, 2)]
    const commands = readRenderCommands(
      Uint8Array.from([0x26, 0, 0, 0, 0, 0x26, 1, 0, 0, 1, RenderOp.End]),
      0,
      11,
    )
    const matrices = resolveMatrices(commands, nodes)
    // Slot 0 holds the root at x = 1; slot 1 holds the child at 1 + 2.
    expect(matrices[0]?.[12]).toBeCloseTo(1)
    expect(matrices[1]?.[12]).toBeCloseTo(3)
  })

  it('leaves unassigned slots at the identity', () => {
    const matrices = resolveMatrices(readRenderCommands(Uint8Array.from([RenderOp.End]), 0, 1), [])
    expect(Array.from(matrices[7] as Float32Array)).toEqual(Array.from(identity()))
    expect(matrices).toHaveLength(32)
  })

  it('blends slots by weight, where 0x100 is one', () => {
    const nodes = [bone('a', 0, 0), bone('b', 1, 10)]
    const commands = readRenderCommands(
      Uint8Array.from([
        0x26,
        0,
        0,
        0,
        0,
        0x26,
        1,
        0,
        0,
        1,
        RenderOp.NodeMix,
        2,
        2,
        0,
        0,
        0x80,
        1,
        1,
        0x80,
        RenderOp.End,
      ]),
      0,
      20,
    )
    const matrices = resolveMatrices(commands, nodes)
    // Half of x = 0 and half of x = 10.
    expect(matrices[2]?.[12]).toBeCloseTo(5)
  })
})
