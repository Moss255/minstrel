import { describe, expect, it } from 'vitest'
import { adjustTimer } from '../src/channel.ts'
import {
  attackRate,
  fallRate,
  loudness,
  PITCH_TABLE,
  sine,
  VOLUME_TABLE,
  volumeDivider,
} from '../src/tables.ts'

describe('the driver’s tables', () => {
  it('has 768 pitch steps to the octave, from 0 to just under an octave', () => {
    expect(PITCH_TABLE).toHaveLength(768)
    expect(PITCH_TABLE[0]).toBe(0)
    expect(PITCH_TABLE[1]).toBe(0x3b)
    expect(PITCH_TABLE[383]).toBe(0x69b6)
    expect(PITCH_TABLE[767]).toBe(0xff8a)
  })

  it('has a volume table of 724 steps of a tenth of a decibel, in four bands', () => {
    expect(VOLUME_TABLE).toHaveLength(724)
    expect(VOLUME_TABLE[723]).toBe(127)
    expect(VOLUME_TABLE[663]).toBe(64)
    expect(VOLUME_TABLE[662]).toBe(126)
    expect(VOLUME_TABLE[603]).toBe(64)
    expect(VOLUME_TABLE[483]).toBe(32)
    expect(VOLUME_TABLE[0]).toBe(0)
    expect([0, 482, 483, 602, 603, 662, 663, 723].map(volumeDivider)).toEqual([
      16, 16, 4, 4, 2, 2, 1, 1,
    ])
  })

  it('runs the LFO round a sine of 128 steps', () => {
    expect(sine(0)).toBe(0)
    expect(sine(32)).toBe(127)
    expect(sine(64)).toBe(0)
    expect(sine(96)).toBe(-127)
    expect(sine(128)).toBe(0)
  })

  it('converts envelope values as the driver does', () => {
    expect(attackRate(127)).toBe(0)
    expect(attackRate(0x6d)).toBe(0x8f)
    expect(attackRate(0)).toBe(255)
    expect(fallRate(127)).toBe(0xffff)
    expect(fallRate(0x7e)).toBe(0x3c00)
    expect(fallRate(0)).toBe(1)
    expect(fallRate(0x50)).toBe(Math.floor(0x1e00 / 0x2e))
    expect(loudness(127)).toBe(0)
    expect(loudness(64)).toBe(-119)
    expect(loudness(0)).toBe(-32768)
  })

  it('moves a timer by 64ths of a semitone: an octave halves it', () => {
    expect(adjustTimer(1024, 0)).toBe(1024)
    expect(adjustTimer(1024, 768)).toBe(512)
    expect(adjustTimer(1024, -768)).toBe(2048)
    // A semitone up is 2^(1/12) faster.
    expect(adjustTimer(10000, 64)).toBe(Math.floor(10000 / 2 ** (1 / 12)))
    expect(adjustTimer(100, 768 * 8)).toBe(0x10)
  })
})
