import { readFileSync } from 'node:fs'
import type { StaffRoll, StaffRollLine } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { FADE_FRAMES, lineX, readRollFiles, StaffRollRun, scrollStep } from '../src/staff-roll.ts'

const line = (group: number, gap: number, align = 0): StaffRollLine => ({
  group,
  gap,
  flags: 12 | (align << 4) | (15 << 7),
  size: 12,
  align,
  colour: 15,
  text: 'x',
})

/** Frames from `811` until the scroll's clock starts: steps 0 to 4, the fade's start, and its 30. */
const SET_UP = 5 + 1 + FADE_FRAMES

function runFor(run: StaffRollRun, frames: number): void {
  for (let i = 0; i < frames; i++) run.tick()
}

describe('the staff roll', () => {
  it('moves speed pixels a frame, through the game’s float sums', () => {
    expect(scrollStep(1, 1)).toBe(4096)
    expect(scrollStep(2, 0.86)).toBe(
      Math.trunc(Math.fround(Math.fround(2 * Math.fround(0.86)) * 4096)),
    )
    expect(scrollStep(2, Math.fround(0.86))).toBe(7045)
  })

  it('places a line by its alignment', () => {
    expect(lineX(0, 50)).toBe(0)
    expect(lineX(1, 51)).toBe(102)
    expect(lineX(2, 50)).toBe(70)
    expect(lineX(3, 50)).toBe(136)
  })

  it('keeps its stopwatch at 0 through the set-up and its fade, then counts from 811', () => {
    const run = new StaffRollRun({ speed: 1, room: 0, lines: [] })
    runFor(run, 6)
    expect(run.darkness).toBe(1)
    runFor(run, SET_UP - 7)
    expect(run.state).toBe(0)
    expect(run.darkness).toBeCloseTo(1 / FADE_FRAMES)
    run.tick()
    expect(run.state).toBe(1)
    expect(run.stopwatch).toBe(0)
    expect(run.darkness).toBe(0)
    // Its clock's first frame: it moves on, and the stopwatch reads the time since 811.
    run.tick()
    expect(run.stopwatch).toBe(Math.floor(((SET_UP + 1) * 1000) / 60))
  })

  it('moves on every other frame, and puts what it drew on the screen the frame after', () => {
    const run = new StaffRollRun({ speed: 1, room: 0, lines: [] })
    runFor(run, SET_UP + 1)
    expect([run.scrolled, run.shown]).toEqual([1, 0])
    run.tick()
    expect([run.scrolled, run.shown]).toEqual([1, 1])
    run.tick()
    expect([run.scrolled, run.shown]).toEqual([3, 1])
    run.tick()
    expect(run.shown).toBe(3)
  })

  it('places a new group once the scroll is within a screen of it, and a group’s lines together', () => {
    const roll: StaffRoll = {
      speed: 1,
      room: 4,
      lines: [line(1, 200), line(2, 30, 2), line(2, 30, 3), line(3, 13)],
    }
    const run = new StaffRollRun(roll)
    const until = (count: number) => {
      while (run.placed.length < count) run.tick()
      return run.scrolled
    }
    // 200 wants a scroll of 8 — 192 + 8 — and the scroll goes 2 at a move.
    expect(until(1)).toBe(9)
    // 230 wants 38; the second group's two lines come together, either side of 128.
    expect(until(2)).toBe(39)
    expect(run.placed.map((p) => [p.y, p.x])).toEqual([
      [200, 0],
      [230, 120],
      [230, 136],
    ])
    expect(until(4)).toBe(51)
    expect(run.placed.at(-1)?.y).toBe(243)
    expect(run.state).toBe(2)
    // It runs out once the last is 16 px off the top: a scroll of 259.
    while (run.state === 2) run.tick()
    expect(run.scrolled).toBe(259)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the staff roll, on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('rolls 470 lines at 0.86 px a frame, and has run out before ev29373 stops it at 268,550 ms', () => {
    const { roll, fonts } = readRollFiles(rom)
    expect(roll?.speed).toBeCloseTo(0.86, 5)
    expect(roll?.lines).toHaveLength(470)
    expect(fonts.every((font) => font !== undefined)).toBe(true)
    const run = new StaffRollRun(roll, fonts)
    let ranOut: number | undefined
    while (run.stopwatch < 268_550) {
      run.tick()
      if (ranOut === undefined && run.state === 3) ranOut = run.stopwatch
    }
    expect(run.placed).toHaveLength(470)
    // About 265 s of scroll and the set-up's half second; ev29373 waits three seconds more.
    expect(ranOut).toBeGreaterThan(264_000)
    expect(ranOut).toBeLessThan(268_550)
    // Every line inside the screen's width; the two columns either side of 128.
    for (const { line: l, x } of run.placed) {
      expect(x).toBeGreaterThanOrEqual(0)
      if (l.align === 2) expect(x).toBeLessThan(120)
    }
  })
})
