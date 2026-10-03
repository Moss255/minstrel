import { describe, expect, it } from 'vitest'
import { fpsLine, fpsMeter, resetFps, tickFps } from '../src/fps-meter.ts'

describe('the frame-rate meter', () => {
  it('gives the rate over the last second, and its worst frame', () => {
    const meter = fpsMeter()
    for (let i = 0; i < 120; i++) tickFps(meter, 1000 / 60)
    expect(fpsLine(meter)).toBe('60 fps · worst 16.7 ms\nno drops')
    // Only the last second is kept.
    expect(meter.frames.length).toBeLessThanOrEqual(61)
  })

  it('counts a single long frame, and forgets it on a reset', () => {
    const meter = fpsMeter()
    for (let i = 0; i < 30; i++) tickFps(meter, 1000 / 60)
    tickFps(meter, 80)
    expect(fpsLine(meter)).toContain('1 over 33 ms, longest 80 ms')
    resetFps(meter)
    expect(fpsLine(meter)).toContain('no drops')
    // The worst of the last second is still the long frame.
    expect(fpsLine(meter)).toContain('worst 80.0 ms')
  })

  it('takes no time as no frame', () => {
    const meter = fpsMeter()
    tickFps(meter, 0)
    expect(meter.frames).toHaveLength(0)
  })
})
