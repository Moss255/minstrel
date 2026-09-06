import { describe, expect, it } from 'vitest'
import { type Box, covered, occluders, occludes } from '../src/occlusion.ts'

const box = (
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Box => ({ minX, minY, minZ, maxX, maxY, maxZ })

/**
 * A room four units square with a roof on it and a storey above that, and a
 * character standing on the floor in the middle of it.
 */
const floor = box(-2, -0.05, -2, 2, 0, 2)
const roof = box(-2, 2, -2, 2, 2.2, 2)
const upstairs = box(-2, 2.2, -2, 2, 3, 2)
const nearWall = box(-2, 0, 1.9, 2, 2, 2)
const farWall = box(-2, 0, -2, 2, 2, -1.9)

const character: [number, number, number] = [0, 0.8, 0]

/** The indoor camera: three units back at 45 degrees, so it is over the roof. */
const steep: [number, number, number] = [0, 2.9, 2.12]
/** The outdoor one: further back and shallower, so it looks at the near wall. */
const shallow: [number, number, number] = [0, 2, 5]

describe('what stands in the way', () => {
  it('takes the roof off the building it is looking into', () => {
    expect(occludes(roof, steep, character)).toBe(true)
  })

  it('takes away the wall on the camera side', () => {
    expect(occludes(nearWall, shallow, character)).toBe(true)
  })

  it('leaves the wall behind the character alone', () => {
    expect(occludes(farWall, shallow, character)).toBe(false)
    expect(occludes(farWall, steep, character)).toBe(false)
  })

  it('leaves the floor it is standing on alone', () => {
    expect(occludes(floor, steep, character)).toBe(false)
    expect(occludes(floor, shallow, character)).toBe(false)
  })

  it('leaves terrain the camera looks across alone', () => {
    // The one that matters. A single piece of ground spanning a whole map, with
    // a hill in it taller than the character: the camera is inside its box and
    // so is the character, so a plain segment-versus-box test deletes the
    // world. The segment has to *leave* the box for it to be in the way.
    const terrain = box(-60, -1, -60, 60, 6, 60)
    expect(occludes(terrain, shallow, character)).toBe(false)
    expect(occludes(terrain, steep, character)).toBe(false)
  })

  it('leaves a near wall the camera is looking over alone', () => {
    // Steeply enough down and the wall is not in the way at all, which is why
    // the game tilts the camera down indoors rather than only culling.
    expect(occludes(nearWall, steep, character)).toBe(false)
  })

  it('ignores what is behind the camera', () => {
    expect(occludes(box(-1, 0, 8, 1, 4, 10), shallow, character)).toBe(false)
  })

  it('ignores what is off to one side', () => {
    expect(occludes(box(20, 0, -1, 24, 4, 1), shallow, character)).toBe(false)
  })
})

describe('a wall the character is pressed against', () => {
  it('does not flicker as they lean on it', () => {
    // Standing right at a wall, the exit point is all but on top of the
    // character; without the clearance the piece would blink in and out with
    // rounding as they moved a few thousandths of a unit.
    const wall = box(-2, 0, 0.95, 2, 2, 1)
    for (let i = 0; i <= 20; i++) {
      const at: [number, number, number] = [0, 0.8, 0.9 + i * 0.001]
      expect(occludes(wall, shallow, at, 0.25)).toBe(false)
    }
  })
})

describe('a camera inside the geometry', () => {
  it('hides the piece it is sitting in', () => {
    expect(occludes(upstairs, steep, character)).toBe(true)
  })
})

describe('a degenerate view', () => {
  it('hides nothing when the camera is on the character', () => {
    expect(occludes(roof, character, character)).toBe(false)
  })
})

describe('occluders', () => {
  it('names the pieces to leave out, in order', () => {
    expect(occluders([floor, upstairs, roof, farWall], steep, character)).toEqual([1, 2])
  })

  it('leaves everything drawn when the view is clear', () => {
    expect(occluders([floor, farWall], shallow, character)).toEqual([])
  })

  it('is happy with nothing to draw', () => {
    expect(occluders([], shallow, character)).toEqual([])
  })
})

describe('what counts as indoors', () => {
  it('sees the roof over the character', () => {
    expect(covered([floor, roof, nearWall], character, 0.2)).toBe(true)
  })

  it('sees open sky where there is no roof', () => {
    expect(covered([floor, nearWall, farWall], character, 0.2)).toBe(false)
  })

  it('does not mistake a hill for a ceiling', () => {
    // The failure that would make every outdoor map read as indoors: terrain
    // whose box reaches up into a hill somewhere else on the map. Its floor is
    // below the feet, so it is ground, not a roof.
    const terrain = box(-60, -1, -60, 60, 6, 60)
    expect(covered([terrain], character, 0.2)).toBe(false)
  })

  it('needs the roof to be over this particular spot', () => {
    const elsewhere = box(20, 2, 20, 24, 2.2, 24)
    expect(covered([elsewhere], character, 0.2)).toBe(false)
  })

  it('leaves headroom, so a low arch counts and a hat brim does not', () => {
    const justAbove = box(-2, 0.85, -2, 2, 0.9, 2)
    expect(covered([justAbove], character, 0.2)).toBe(false)
    expect(covered([justAbove], character, 0.02)).toBe(true)
  })
})
