import { describe, expect, it } from 'vitest'
import {
  type Box,
  boxOfTriangles,
  CROWDING_FLOOR,
  cellsOf,
  clearDistance,
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

describe('clearDistance', () => {
  const focus: [number, number, number] = [0, 1, 0]

  it('leaves the camera where it wants to be when nothing is between', () => {
    const eye: [number, number, number] = [0, 1, 10]
    expect(clearDistance([box(-1, 1, 20, 21)], focus, eye, 10)).toBe(10)
  })

  it('pulls in short of the nearest thing between', () => {
    // A wall across the view at z = 4..5, the camera wanting to be at z = 10.
    const eye: [number, number, number] = [0, 1, 10]
    // It is entered four tenths of the way along, so four units, less the margin.
    expect(clearDistance([box(-6, 6, 4, 5)], focus, eye, 10, 0.1)).toBeCloseTo(3.9, 6)
  })

  it('ignores a box that holds what it is looking at', () => {
    // **The ground the character stands on, and the wall they are against.**
    // Both hold the focus, neither is between, and pulling in for either would
    // put the camera in their back — which is what `ev03030` needed.
    const eye: [number, number, number] = [0, 1, 10]
    const ground = box(-10, 10, -10, 20, 0, 1.5)
    expect(clearDistance([ground], focus, eye, 10)).toBe(10)
  })

  it('does not pull closer than the floor, however near the obstruction', () => {
    // **Coffinwell's `ev04010`.** A wall right in front of the eye pulled the
    // camera to a fifth of the distance it asked for, and the back of the
    // Hero's head filled the frame. Below the floor there is nothing useful
    // left to do with the camera, so it stops and lets the wall clip.
    const eye: [number, number, number] = [0, 1, 10]
    // Past `occludes`' clearance, so it counts, but still right in the eye.
    const rightThere = box(-6, 6, 0.5, 0.6)
    expect(clearDistance([rightThere], focus, eye, 10)).toBeCloseTo(CROWDING_FLOOR, 6)
  })

  it('never pushes the camera out to reach the floor', () => {
    // A shot that wants to be closer than the floor is asking for a close-up,
    // not being crowded into one. The floor must not become a minimum.
    const eye: [number, number, number] = [0, 1, 0.3]
    const wanted = CROWDING_FLOOR / 2
    expect(clearDistance([box(-6, 6, 0.1, 0.2)], focus, eye, wanted)).toBeLessThanOrEqual(wanted)
  })

  it('puts the floor where a figure fills a third of the frame', () => {
    // The arithmetic the default is, so a change to it reads as a decision
    // rather than a number moving: PERSON.height over twice the tangent of
    // half the DS's vertical field, over the share of the frame allowed.
    const height = 0.18
    const fov = (50 * Math.PI) / 180
    expect(CROWDING_FLOOR).toBeCloseTo(height / (2 * Math.tan(fov / 2) * (1 / 3)), 9)
    // And the shots that prompted it fall the right side of it.
    expect(0.353).toBeLessThan(CROWDING_FLOOR) // ev04010, unusable
    expect(0.98).toBeGreaterThan(CROWDING_FLOOR) // ev04020, fine
  })

  it('takes the nearest of several', () => {
    const eye: [number, number, number] = [0, 1, 10]
    const far = box(-6, 6, 8, 9)
    const near = box(-6, 6, 2, 3)
    expect(clearDistance([far, near], focus, eye, 10, 0)).toBeCloseTo(2, 6)
  })

  it('leaves a wall the character is pressed against alone', () => {
    // **`occludes`' own clearance rule, and it is right here too.** A wall a
    // hair from the focus has not got open air past it, so it does not count
    // as in the way — otherwise the camera would be dragged onto the
    // character's nose every time they stood against something.
    const eye: [number, number, number] = [0, 1, 10]
    expect(clearDistance([box(-6, 6, 0.01, 0.02)], focus, eye, 10, 0, [], 1)).toBe(10)
  })

  it('never pulls in for a shape marked exempt', () => {
    const eye: [number, number, number] = [0, 1, 10]
    expect(clearDistance([box(-6, 6, 4, 5)], focus, eye, 10, 0.1, [true])).toBe(10)
  })
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

  it('hides the chunk the camera is inside, whatever its shape says', () => {
    // **The case a Stornway scene found.** A long wall, with the character
    // pressed against it and the camera behind — so the wall's box holds both
    // the eye and the focus, the segment never leaves it, and by the rule
    // above the shape is not in the way at all. Nothing was hidden, and the
    // view was the inside of the masonry.
    //
    // A chunk the camera is *inside* is a different thing from a chunk in the
    // way: there is no view past it to protect, so it goes regardless.
    const wall = box(-6, 6, -2, 2, 0, 4)
    const chunks = [box(-6, -2, -2, 2, 0, 4), box(-2, 2, -2, 2, 0, 4), box(2, 6, -2, 2, 0, 4)]
    const inside: [number, number, number] = [0, 1, -1]
    const ahead: [number, number, number] = [0, 1, 1]
    expect(occludedChunks([wall], chunks, [0, 0, 0], inside, ahead)).toEqual([1])
  })

  it('still leaves the ground alone when the camera is above it, not in it', () => {
    // The fix must not take the terrain with it. The camera at y = 1 is over
    // the ground, whose box tops out at 1.5 — but it is not *in* any chunk of
    // it that matters, and the hillock stays.
    const ground = box(-10, 10, -10, 20, 0, 1.5)
    const hillock = box(-1, 1, 4, 6, 0, 1.5)
    expect(occludedChunks([ground], [hillock], [0], eye, focus)).toEqual([])
  })

  it('never hides a shape marked exempt', () => {
    const wall = box(-6, 6, 4, 5)
    expect(occludedChunks([wall], [wall], [0], eye, focus, 0.25, [true])).toEqual([])
  })
})
