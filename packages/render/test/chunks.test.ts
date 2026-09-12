import { describe, expect, it } from 'vitest'
import {
  type Box,
  boxOfTriangles,
  cellsOf,
  keepTriangles,
  occludedChunks,
} from '../src/occlusion.ts'

const at = (x: number, z: number, y = 0) => ({ x, y, z })

// Two triangles sharing an edge either side of x = 1, and a third far off.
const shape = {
  vertices: [
    at(0.2, 0.2),
    at(0.9, 0.2),
    at(0.9, 0.9, 2),
    at(1.8, 0.5),
    at(5.5, 5.5),
    at(5.9, 5.5),
    at(5.5, 5.9),
  ],
  indices: [0, 1, 2, 1, 3, 2, 4, 5, 6],
}

describe('cellsOf', () => {
  it('puts each triangle in the square its middle falls in', () => {
    // The second triangle's middle is at x = 1.2, so it has a square of its own.
    expect(cellsOf(shape, 1)).toEqual([[0], [1], [2]])
  })

  it('keeps a shape that fits one square in one chunk', () => {
    expect(cellsOf(shape, 10)).toEqual([[0, 1, 2]])
  })

  it('refuses a square that is no size', () => {
    expect(() => cellsOf(shape, 0)).toThrow(RangeError)
  })
})

describe('boxOfTriangles', () => {
  it('measures only the triangles asked about', () => {
    expect(boxOfTriangles(shape, [0, 1])).toEqual({
      minX: 0.2,
      minY: 0,
      minZ: 0.2,
      maxX: 1.8,
      maxY: 2,
      maxZ: 0.9,
    })
  })
})

describe('keepTriangles', () => {
  it("drops the hidden chunks' triangles and keeps the rest in order", () => {
    const chunks = cellsOf(shape, 1)
    expect(keepTriangles(shape.indices, chunks, [1])).toEqual([0, 1, 2, 4, 5, 6])
    expect(keepTriangles(shape.indices, chunks, [])).toEqual(shape.indices)
    expect(keepTriangles(shape.indices, chunks, [0, 1, 2])).toEqual([])
  })
})

const box = (minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 2): Box => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
})

describe('occludedChunks', () => {
  // The camera at z = 0 looks along +z at a character at z = 10.
  const eye: [number, number, number] = [0, 1, 0]
  const focus: [number, number, number] = [0, 1, 10]

  it('hides only the chunk of a long shape that is in the way', () => {
    // A long wall across the view at z = 4..5, in three chunks along x.
    const wall = box(-6, 6, 4, 5)
    const chunks = [box(-6, -2, 4, 5), box(-2, 2, 4, 5), box(2, 6, 4, 5)]
    expect(occludedChunks([wall], chunks, [0, 0, 0], eye, focus)).toEqual([1])
  })

  it('leaves the ground the character stands on alone, even a chunk of it in the way', () => {
    // The ground's box holds the character, so it is not in the way; a hillock
    // of it between them is, taken alone, and must still not go.
    const ground = box(-10, 10, -10, 20, 0, 1.5)
    const hillock = box(-1, 1, 4, 6, 0, 1.5)
    expect(occludedChunks([ground], [hillock], [0], eye, focus)).toEqual([])
  })

  it('never hides a shape marked exempt', () => {
    const wall = box(-6, 6, 4, 5)
    expect(occludedChunks([wall], [wall], [0], eye, focus, 0.25, [true])).toEqual([])
  })
})
