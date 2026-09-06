import { fromInt, fx32 } from '@vesper/fixed'
import { describe, expect, it } from 'vitest'
import {
  DS_ASPECT,
  DS_VERTICAL_FOV,
  followCamera,
  frustumAt,
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

describe('a camera with no world', () => {
  it('is happy without one', () => {
    const camera = followCamera()
    expect(() =>
      updateFollowCamera(camera, { x: fx32(0), y: fx32(0), z: fx32(0) }, 1 / 60),
    ).not.toThrow()
  })
})
