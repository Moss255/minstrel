import { fromInt, fx32 } from '@vesper/fixed'
import type { CollisionMesh } from '@vesper/game-formats'
import { createCollisionWorld, PERSON } from '@vesper/sim'
import { describe, expect, it } from 'vitest'
import {
  applyStyle,
  cameraEye,
  DS_ASPECT,
  DS_VERTICAL_FOV,
  followCamera,
  frustumAt,
  INDOORS,
  moveRelativeToCamera,
  OUTDOORS,
  perspective,
  updateFollowCamera,
  viewMatrix,
} from '../src/camera.ts'

describe('framing', () => {
  const reference = frustumAt(1, DS_ASPECT)

  it('matches the hardware exactly at the hardware aspect', () => {
    expect(reference.halfHeight).toBeCloseTo(Math.tan(DS_VERTICAL_FOV / 2), 10)
    expect(reference.halfWidth / reference.halfHeight).toBeCloseTo(DS_ASPECT, 10)
  })

  it('never shows less than the hardware did, at any aspect', () => {
    // The invariant the whole rule exists for: whatever shape the window is,
    // everything the DS would have drawn is still on screen.
    for (const aspect of [0.5, 0.75, 1, 4 / 3, 1.5, 16 / 9, 21 / 9, 4]) {
      const view = frustumAt(1, aspect)
      expect(view.halfWidth).toBeGreaterThanOrEqual(reference.halfWidth - 1e-9)
      expect(view.halfHeight).toBeGreaterThanOrEqual(reference.halfHeight - 1e-9)
    }
  })

  it('widens rather than cropping, above the hardware aspect', () => {
    const wide = frustumAt(1, 16 / 9)
    expect(wide.halfHeight).toBeCloseTo(reference.halfHeight, 10)
    expect(wide.halfWidth).toBeGreaterThan(reference.halfWidth)
  })

  it('heightens rather than cropping, below it', () => {
    const tall = frustumAt(1, 1)
    expect(tall.halfWidth).toBeCloseTo(reference.halfWidth, 10)
    expect(tall.halfHeight).toBeGreaterThan(reference.halfHeight)
  })

  it('scales with depth', () => {
    const near = frustumAt(1, DS_ASPECT)
    const far = frustumAt(10, DS_ASPECT)
    expect(far.halfWidth / near.halfWidth).toBeCloseTo(10, 6)
    expect(far.halfHeight / near.halfHeight).toBeCloseTo(10, 6)
  })
})

describe('perspective', () => {
  it('puts a point at the edge of the frustum on the edge of the screen', () => {
    const aspect = 16 / 9
    const near = 0.1
    const far = 100
    const projection = perspective(aspect, near, far)
    const depth = 5
    const { halfWidth, halfHeight } = frustumAt(depth, aspect)

    // A point on the right edge, at -depth along the view axis, must land at
    // clip x == w.
    const x = (projection[0] as number) * halfWidth
    const w = depth
    expect(x / w).toBeCloseTo(1, 6)
    const y = (projection[5] as number) * halfHeight
    expect(y / w).toBeCloseTo(1, 6)
  })

  it('maps the near and far planes to the ends of the depth range', () => {
    const projection = perspective(DS_ASPECT, 1, 100)
    const at = (z: number) => {
      const clip = (projection[10] as number) * -z + (projection[14] as number)
      return clip / z
    }
    expect(at(1)).toBeCloseTo(-1, 6)
    expect(at(100)).toBeCloseTo(1, 6)
  })
})

const at = (x: number, y: number, z: number) => ({
  x: fromInt(x),
  y: fromInt(y),
  z: fromInt(z),
})

describe('following', () => {
  it('converges on the character rather than snapping to it', () => {
    const camera = followCamera()
    updateFollowCamera(camera, at(0, 0, 0), 0)
    const start = camera.focus[0] as number

    updateFollowCamera(camera, at(10, 0, 0), 1 / 60)
    const afterOne = camera.focus[0] as number
    expect(afterOne).toBeGreaterThan(start)
    expect(afterOne).toBeLessThan(10)
  })

  it('gets there in the end', () => {
    const camera = followCamera()
    for (let i = 0; i < 300; i++) updateFollowCamera(camera, at(10, 0, 4), 1 / 60)
    expect(camera.focus[0]).toBeCloseTo(10, 3)
    expect(camera.focus[2]).toBeCloseTo(4, 3)
  })

  it('lags by the same amount whatever the frame rate', () => {
    // A camera closing a fixed fraction per *frame* would be tighter at 120Hz
    // than at 30Hz, and the game would feel different on a better machine.
    const run = (fps: number) => {
      const camera = followCamera()
      updateFollowCamera(camera, at(0, 0, 0), 0)
      for (let i = 0; i < fps; i++) updateFollowCamera(camera, at(10, 0, 0), 1 / fps)
      return camera.focus[0] as number
    }
    expect(run(120)).toBeCloseTo(run(30), 2)
    expect(run(60)).toBeCloseTo(run(30), 2)
  })

  it('looks above the feet, not at them', () => {
    const camera = followCamera()
    updateFollowCamera(camera, at(0, 0, 0), 0)
    expect(camera.focus[1]).toBeCloseTo(camera.height, 6)
  })

  it('holds the pitch between its limits', () => {
    const camera = followCamera()
    camera.pitch = 99
    updateFollowCamera(camera, at(0, 0, 0), 0)
    expect(camera.pitch).toBe(camera.maxPitch)
    camera.pitch = -99
    updateFollowCamera(camera, at(0, 0, 0), 0)
    expect(camera.pitch).toBe(camera.minPitch)
  })

  it('sits at its full distance when nothing is in the way', () => {
    const camera = followCamera()
    updateFollowCamera(camera, at(0, 0, 0), 0)
    expect(camera.actualDistance).toBe(camera.distance)
  })
})

describe('the view matrix', () => {
  it('puts the camera behind its focus', () => {
    const camera = followCamera()
    camera.yaw = 0
    camera.pitch = 0
    updateFollowCamera(camera, at(0, 0, 0), 0)
    const view = viewMatrix(camera)

    // The focus, seen from the camera, is straight ahead at the boom's length.
    const focus = camera.focus as [number, number, number]
    const z =
      (view[2] as number) * focus[0] +
      (view[6] as number) * focus[1] +
      (view[10] as number) * focus[2] +
      (view[14] as number)
    expect(z).toBeCloseTo(-camera.actualDistance, 6)
  })

  it('keeps the horizon level however far it turns', () => {
    const camera = followCamera()
    updateFollowCamera(camera, at(0, 0, 0), 0)
    for (const yaw of [0, 1, 2, 3, 5]) {
      camera.yaw = yaw
      const view = viewMatrix(camera)
      // The camera's right vector never tilts out of the horizontal plane.
      // Column-major, so its y component is element 4, not element 1.
      expect(view[4]).toBeCloseTo(0, 6)
    }
  })
})

describe('keeping the eye out of the ground', () => {
  // A flat floor at y = 0, ten units square, in the units collision uses.
  const U = 4096
  const floor: CollisionMesh = {
    kind: 3,
    bounds: { minX: -10 * U, minY: 0, minZ: -10 * U, maxX: 10 * U, maxY: 0, maxZ: 10 * U },
    cellSize: U,
    gridX: 1,
    gridZ: 1,
    triangles: [
      {
        vertices: [
          [-10 * U, 0, -10 * U],
          [10 * U, 0, -10 * U],
          [-10 * U, 0, 10 * U],
        ],
        normal: [0, 1, 0],
        attributes: 0,
      },
      {
        vertices: [
          [10 * U, 0, -10 * U],
          [10 * U, 0, 10 * U],
          [-10 * U, 0, 10 * U],
        ],
        normal: [0, 1, 0],
        attributes: 0,
      },
    ],
    cells: [],
    cellTriangles: [],
    trailing: [],
    unknown_0x04: 0,
    unknown_0x1a: 0,
    cell: () => [],
  }
  const world = createCollisionWorld(floor)

  it('leaves a camera well clear of the ground alone', () => {
    const camera = followCamera(OUTDOORS, 1)
    updateFollowCamera(camera, at(0, 0, 0), 0, world, PERSON)
    expect(camera.lift).toBe(0)
  })

  it('raises an eye that would sit under the floor', () => {
    // Looking almost level, so the boom puts the eye below the surface.
    const camera = followCamera(OUTDOORS, 1)
    updateFollowCamera(camera, { x: fromInt(0), y: fromInt(-3), z: fromInt(0) }, 0, world, PERSON)
    expect(camera.lift).toBeGreaterThan(0)
    expect(cameraEye(camera)[1]).toBeGreaterThan(0)
  })

  it('puts the eye back down once the ground is no longer in the way', () => {
    const camera = followCamera(OUTDOORS, 1)
    updateFollowCamera(camera, { x: fromInt(0), y: fromInt(-3), z: fromInt(0) }, 0, world, PERSON)
    expect(camera.lift).toBeGreaterThan(0)
    updateFollowCamera(camera, at(0, 0, 0), 0, world, PERSON)
    expect(camera.lift).toBe(0)
  })

  it('still sits at its full distance — it lifts rather than pulling in', () => {
    const camera = followCamera(OUTDOORS, 1)
    updateFollowCamera(camera, { x: fromInt(0), y: fromInt(-3), z: fromInt(0) }, 0, world, PERSON)
    expect(camera.actualDistance).toBe(camera.distance)
  })
})

describe('a camera with no world', () => {
  it('is happy without one', () => {
    const camera = followCamera()
    expect(() =>
      updateFollowCamera(camera, { x: fx32(0), y: fx32(0), z: fx32(0) }, 1 / 60),
    ).not.toThrow()
  })
})

describe('the camera the game actually uses', () => {
  it('looks down within the range the game does', () => {
    // Between 25 and 40 degrees, depending on context: outdoors nearer the
    // shallow end, indoors nearer the steep one.
    const degrees = (radians: number) => (radians * 180) / Math.PI
    expect(degrees(OUTDOORS.pitch)).toBeGreaterThanOrEqual(25)
    expect(degrees(OUTDOORS.pitch)).toBeLessThanOrEqual(40)
    expect(degrees(INDOORS.pitch)).toBeGreaterThan(degrees(OUTDOORS.pitch))
  })

  it('tucks in closer indoors than out', () => {
    expect(INDOORS.distance).toBeLessThan(OUTDOORS.distance)
    expect(INDOORS.maxPitch).toBeGreaterThan(OUTDOORS.maxPitch)
  })

  it('leaves the character small in the frame', () => {
    // A party of four in a line plus a radius of ground around them: the
    // character should be a small part of the picture, not fill it.
    const camera = followCamera(OUTDOORS, 1)
    const { halfHeight } = frustumAt(camera.distance, 16 / 9)
    // One character height against the visible height at that distance.
    expect(1 / (halfHeight * 2)).toBeLessThan(0.4)
  })

  it('scales its framing with the character', () => {
    const small = followCamera(OUTDOORS, 1)
    const large = followCamera(OUTDOORS, 2)
    expect(large.distance).toBeCloseTo(small.distance * 2, 6)
    expect(large.height).toBeCloseTo(small.height * 2, 6)
  })

  it('re-styles without losing where it is looking', () => {
    const camera = followCamera(OUTDOORS, 1)
    camera.yaw = 1.23
    camera.focus = [3, 4, 5]
    const indoors = applyStyle(camera, INDOORS, 1)
    expect(indoors.yaw).toBe(1.23)
    expect(indoors.focus).toEqual([3, 4, 5])
    expect(indoors.distance).toBe(INDOORS.distance)
  })
})

describe('moving the way the player is looking', () => {
  /** Where a world point lands in the camera's own space. */
  const inView = (camera: ReturnType<typeof followCamera>, p: [number, number, number]) => {
    const view = viewMatrix(camera)
    const at = (row: number) =>
      (view[row] as number) * p[0] +
      (view[row + 4] as number) * p[1] +
      (view[row + 8] as number) * p[2] +
      (view[row + 12] as number)
    return { x: at(0), y: at(1), z: at(2) }
  }

  it('walks into the screen, not out of it', () => {
    // The oracle is the view matrix rather than the sign of a sine: pressing
    // forward must take the character further from the eye and deeper into the
    // picture. Getting this backwards inverts the controls and leaves
    // everything else looking right, which is exactly what happened.
    for (const yaw of [0, 0.7, 1.6, 3, 4.5, 6]) {
      const camera = followCamera(OUTDOORS, 1)
      camera.yaw = yaw
      updateFollowCamera(camera, at(0, 0, 0), 0)
      const step = moveRelativeToCamera(yaw, 1, 0)
      const focus = camera.focus as [number, number, number]
      const before = inView(camera, focus)
      const after = inView(camera, [focus[0] + step.x, focus[1], focus[2] + step.z])
      // Deeper into the screen is more negative z in view space.
      expect(after.z).toBeLessThan(before.z)
      // And further from the camera.
      const eye = cameraEye(camera)
      expect(Math.hypot(focus[0] + step.x - eye[0], focus[2] + step.z - eye[2])).toBeGreaterThan(
        Math.hypot(focus[0] - eye[0], focus[2] - eye[2]),
      )
    }
  })

  it('walks backwards out of the screen', () => {
    for (const yaw of [0, 0.7, 2.2, 5]) {
      const camera = followCamera(OUTDOORS, 1)
      camera.yaw = yaw
      updateFollowCamera(camera, at(0, 0, 0), 0)
      const step = moveRelativeToCamera(yaw, -1, 0)
      const focus = camera.focus as [number, number, number]
      expect(inView(camera, [focus[0] + step.x, focus[1], focus[2] + step.z]).z).toBeGreaterThan(
        inView(camera, focus).z,
      )
    }
  })

  it('strafes right towards the right of the screen', () => {
    for (const yaw of [0, 0.7, 2.2, 5]) {
      const camera = followCamera(OUTDOORS, 1)
      camera.yaw = yaw
      updateFollowCamera(camera, at(0, 0, 0), 0)
      const step = moveRelativeToCamera(yaw, 0, 1)
      const focus = camera.focus as [number, number, number]
      expect(inView(camera, [focus[0] + step.x, focus[1], focus[2] + step.z]).x).toBeGreaterThan(
        inView(camera, focus).x,
      )
    }
  })

  it('strafes left towards the left of the screen', () => {
    const camera = followCamera(OUTDOORS, 1)
    camera.yaw = 0.7
    updateFollowCamera(camera, at(0, 0, 0), 0)
    const step = moveRelativeToCamera(0.7, 0, -1)
    const focus = camera.focus as [number, number, number]
    expect(inView(camera, [focus[0] + step.x, focus[1], focus[2] + step.z]).x).toBeLessThan(
      inView(camera, focus).x,
    )
  })

  it('gives the same speed diagonally as straight on', () => {
    const straight = moveRelativeToCamera(0.7, 1, 0)
    const diagonal = moveRelativeToCamera(0.7, 1, 1)
    expect(Math.hypot(straight.x, straight.z)).toBeCloseTo(1, 9)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 9)
  })

  it('stands still when nothing is pressed', () => {
    expect(moveRelativeToCamera(0.7, 0, 0)).toEqual({ x: 0, z: 0 })
  })
})
