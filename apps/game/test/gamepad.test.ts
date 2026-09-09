import { afterEach, describe, expect, it, vi } from 'vitest'
import { axesFrom, forgetCentres, lastSearch, readSticks, STANDARD_AXES } from '../src/gamepad.ts'

/**
 * The pad is read through `navigator`, which does not exist under Node, so the
 * tests put one there. That is also the first thing worth checking: a build
 * running anywhere without the API must not throw.
 */
type Pad = {
  connected: boolean
  mapping: string
  axes: number[]
  id?: string
  buttons?: { value: number }[]
}

function withPads(input: (Pad | null)[]): void {
  // A real pad always reports these, so a fixture without them is not a pad.
  const pads = input.map((p) => (p ? { id: 'a pad', buttons: [], ...p } : p))
  // `navigator` is read-only on the global under Node, so it is stubbed rather
  // than assigned.
  vi.stubGlobal('navigator', { getGamepads: () => pads })
}

afterEach(() => {
  vi.unstubAllGlobals()
  forgetCentres()
})

const standard = (axes: number[]): Pad => ({
  connected: true,
  mapping: 'standard',
  axes,
  buttons: [],
})

describe('with no pad', () => {
  it('reads as absent when the browser has no gamepad API', () => {
    vi.stubGlobal('navigator', {})
    expect(readSticks().connected).toBe(false)
  })

  it('reads as absent when nothing is plugged in', () => {
    withPads([null, null])
    expect(readSticks()).toMatchObject({ connected: false, forward: 0, right: 0 })
  })

  it('ignores a pad that is listed but disconnected', () => {
    withPads([{ connected: false, mapping: 'standard', axes: [0, -1, 0, 0] }])
    expect(readSticks().connected).toBe(false)
  })

  it('still reads a pad that does not claim the standard mapping', () => {
    // Refusing them means a pad the browser does not recognise does nothing at
    // all, which is worse than reading it at the usual places.
    withPads([{ connected: true, mapping: '', axes: [0, -1, 0, 0] }])
    expect(readSticks()).toMatchObject({ connected: true, forward: 1 })
  })

  it('prefers a pad the browser recognises over one it does not', () => {
    withPads([{ connected: true, mapping: '', axes: [1, 0, 0, 0] }, standard([0, -1, 0, 0])])
    expect(readSticks()).toMatchObject({ forward: 1, right: 0 })
  })
})

describe('the movement stick', () => {
  it('reads up as forward, because sticks report up as negative', () => {
    withPads([standard([0, -1, 0, 0])])
    expect(readSticks().forward).toBeCloseTo(1, 5)
    withPads([standard([0, 1, 0, 0])])
    expect(readSticks().forward).toBeCloseTo(-1, 5)
  })

  it('reads right as right', () => {
    withPads([standard([1, 0, 0, 0])])
    expect(readSticks().right).toBeCloseTo(1, 5)
  })

  it('ignores a stick resting off centre', () => {
    withPads([standard([0.15, -0.1, 0, 0])])
    expect(readSticks()).toMatchObject({ forward: 0, right: 0 })
  })

  it('takes the deadzone from the distance, not from each axis', () => {
    // Two axes each inside the limit but together well outside it. Testing them
    // separately would let a diagonal through that neither axis asked for.
    withPads([standard([0.18, -0.18, 0, 0])])
    const s = readSticks()
    expect(Math.hypot(s.forward, s.right)).toBeGreaterThan(0)
  })

  it('starts from nothing at the edge of the deadzone rather than jumping', () => {
    // Without rescaling, a stick a hair past the limit would walk at a fifth of
    // full speed the instant it crossed.
    withPads([standard([0, -0.21, 0, 0])])
    expect(readSticks().forward).toBeLessThan(0.05)
  })

  it('reaches full push at the edge of the stick', () => {
    withPads([standard([0, -1, 0, 0])])
    expect(readSticks().forward).toBeCloseTo(1, 5)
  })

  it('never asks for more than full push, however far a stick over-reads', () => {
    // Some pads report past 1 on a diagonal.
    withPads([standard([1, -1, 0, 0])])
    const s = readSticks()
    expect(Math.hypot(s.forward, s.right)).toBeLessThanOrEqual(1.000001)
  })

  it('keeps the direction the stick is pointing', () => {
    withPads([standard([0.6, -0.6, 0, 0])])
    const s = readSticks()
    expect(s.forward).toBeCloseTo(s.right, 5)
  })
})

describe('the look stick', () => {
  it('is read from the right-hand axes', () => {
    withPads([standard([0, 0, 1, 0])])
    expect(readSticks().lookX).toBeCloseTo(1, 5)
    withPads([standard([0, 0, 0, 1])])
    expect(readSticks().lookY).toBeCloseTo(1, 5)
  })

  it('has its own deadzone, so a resting stick does not drift the camera', () => {
    withPads([standard([0, 0, 0.1, 0.1])])
    expect(readSticks()).toMatchObject({ lookX: 0, lookY: 0 })
  })

  it('does not move the character', () => {
    withPads([standard([0, 0, 1, 1])])
    expect(readSticks()).toMatchObject({ forward: 0, right: 0 })
  })
})

describe('reporting what the pad is', () => {
  it('passes back every axis, so an unusual layout can be found by looking', () => {
    withPads([{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0, 0.5, -0.5] }])
    expect(readSticks().axes).toEqual([0, 0, 0, 0, 0.5, -0.5])
  })

  it('passes back every button value, since a stick may report as one', () => {
    withPads([
      {
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: [{ value: 0 }, { value: 0.5 }, { value: 1 }],
      },
    ])
    expect(readSticks().buttons).toEqual([0, 0.5, 1])
  })

  it('passes back the pad name and its mapping', () => {
    withPads([{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], id: 'a pad' }])
    expect(readSticks()).toMatchObject({ id: 'a pad', mapping: 'standard' })
  })
})

describe('moving the sticks to other axes', () => {
  it('reads the look stick wherever it is told to', () => {
    // Some drivers put the right stick on 3 and 4 rather than 2 and 3, which is
    // a stick that does nothing at all under the standard indices.
    // One axis at a time: pushing both corners at once is clamped to a stick's
    // length, which is right but says nothing about where the axes are.
    withPads([{ connected: true, mapping: 'standard', axes: [0, 0, 0, 1, 0, 0] }])
    expect(readSticks().lookX).toBe(0)
    expect(readSticks({ moveX: 0, moveY: 1, lookX: 3, lookY: 4 }).lookX).toBeCloseTo(1, 5)

    withPads([{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0, -1, 0] }])
    expect(readSticks({ moveX: 0, moveY: 1, lookX: 3, lookY: 4 }).lookY).toBeCloseTo(-1, 5)
  })

  it('reads an axis map from a query string', () => {
    expect(axesFrom('0,1,3,4')).toEqual({ moveX: 0, moveY: 1, lookX: 3, lookY: 4 })
  })

  it('falls back to the standard layout for anything it cannot use', () => {
    for (const bad of [null, '', '1,2', '0,1,2,x', '0,1,2,3,4', '-1,1,2,3']) {
      expect(axesFrom(bad), JSON.stringify(bad)).toEqual(STANDARD_AXES)
    }
  })
})

describe('a look stick reported as analog buttons', () => {
  /** Four axes and nineteen buttons, the right stick on buttons 6 and 7. */
  const pad = (b6: number, b7: number): Pad => ({
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 19 }, (_, i) =>
      i === 6 ? { value: b6 } : i === 7 ? { value: b7 } : { value: 0 },
    ),
  })
  const look = { ...STANDARD_AXES, lookButtons: [6, 7] as [number, number] }

  it('reads nothing while the stick sits where it was first seen', () => {
    withPads([pad(0.5, 0.5)])
    expect(readSticks(look)).toMatchObject({ lookX: 0, lookY: 0 })
  })

  it('reads both ways from a button resting in the middle', () => {
    withPads([pad(0.5, 0.5)])
    readSticks(look) // the first read is what sets the middle
    withPads([pad(1, 0.5)])
    expect(readSticks(look).lookX).toBeCloseTo(1, 5)
    withPads([pad(0, 0.5)])
    expect(readSticks(look).lookX).toBeCloseTo(-1, 5)
  })

  it('scales each half by its own travel', () => {
    // A button resting at 0.25 has a quarter of its range below and three
    // quarters above; both ends should still reach one.
    withPads([pad(0.25, 0.25)])
    readSticks(look)
    withPads([pad(1, 0.25)])
    expect(readSticks(look).lookX).toBeCloseTo(1, 5)
    withPads([pad(0, 0.25)])
    expect(readSticks(look).lookX).toBeCloseTo(-1, 5)
  })

  it('does not turn a resting button into a camera that spins', () => {
    // The failure this calibration exists to prevent: reading 0 as fully left.
    withPads([pad(0, 0)])
    expect(readSticks(look)).toMatchObject({ lookX: 0, lookY: 0 })
  })

  it('leaves the movement stick on its axes', () => {
    withPads([{ ...pad(0.5, 0.5), axes: [0, -1, 0, 0] }])
    expect(readSticks(look).forward).toBeCloseTo(1, 5)
  })

  it('is off unless the query string asks for it', () => {
    expect(axesFrom(null, null).lookButtons).toBeUndefined()
    expect(axesFrom(null, '6,7').lookButtons).toEqual([6, 7])
    expect(axesFrom('0,1,2,3', '6,7')).toMatchObject({ moveX: 0, lookButtons: [6, 7] })
  })

  it('ignores a button pair it cannot use', () => {
    for (const bad of ['', '6', '6,7,8', 'a,b', '-1,7']) {
      expect(axesFrom(null, bad).lookButtons, JSON.stringify(bad)).toBeUndefined()
    }
  })
})

describe('a pad the browser has not remapped', () => {
  /** What Firefox reports for a HORIPAD S: raw HID order, no standard mapping. */
  const horipad = (b6: number, b7: number, axes = [0, 0, 0, 0]): Pad => ({
    connected: true,
    mapping: '',
    id: '0f0d-00c1-HORI CO.,LTD. HORIPAD S',
    axes,
    buttons: Array.from({ length: 19 }, (_, i) =>
      i === 6 ? { value: b6 } : i === 7 ? { value: b7 } : { value: 0 },
    ),
  })

  it('finds the look stick without being told where it is', () => {
    withPads([horipad(0.5, 0.5)])
    readSticks() // the resting read sets the middle
    withPads([horipad(1, 0.5)])
    expect(readSticks().lookX).toBeCloseTo(1, 5)
  })

  it('still walks from the left stick', () => {
    withPads([horipad(0.5, 0.5, [0, -1, 0, 0])])
    expect(readSticks().forward).toBeCloseTo(1, 5)
  })

  it('leaves the same pad alone once the browser has remapped it', () => {
    // Through Chrome this pad reports the standard mapping, and there buttons 6
    // and 7 are the triggers — taking them as a stick would turn the camera
    // every time one was pulled.
    withPads([{ ...horipad(1, 1), mapping: 'standard' }])
    expect(readSticks()).toMatchObject({ lookX: 0, lookY: 0 })
  })

  it('does not touch a pad it has never heard of', () => {
    withPads([{ ...horipad(1, 1), id: 'some other pad' }])
    expect(readSticks()).toMatchObject({ lookX: 0, lookY: 0 })
  })

  it('gives way to a layout named on the URL', () => {
    // `?axes=` is someone saying they know better, and they do.
    withPads([horipad(1, 1, [0, 0, 1, 0])])
    expect(readSticks(STANDARD_AXES, true).lookX).toBeCloseTo(1, 5)
  })
})

describe('reporting why nothing was found', () => {
  it('says when the browser has no gamepad API at all', () => {
    vi.stubGlobal('navigator', {})
    readSticks()
    expect(lastSearch()).toMatchObject({ available: false, slots: 0, filled: 0 })
  })

  it('counts the empty slots a browser hands back', () => {
    // Chromium returns a fixed set of empty slots until a pad has been used on
    // the page — pressing a button, not merely plugging it in. Without this the
    // case is indistinguishable from a pad that does not work.
    withPads([null, null, null, null])
    readSticks()
    expect(lastSearch()).toMatchObject({ available: true, slots: 4, filled: 0 })
  })

  it('separates a pad that is present but not connected from no pad at all', () => {
    withPads([{ connected: false, mapping: 'standard', axes: [0, 0, 0, 0] }, null])
    readSticks()
    expect(lastSearch()).toMatchObject({ available: true, slots: 2, filled: 1 })
  })
})
