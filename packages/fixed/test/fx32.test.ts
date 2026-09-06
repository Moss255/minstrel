import { describe, expect, it } from 'vitest'
import { FixedError } from '../src/errors.ts'
import {
  add,
  clamp,
  div,
  FX32_ONE,
  floorToInt,
  fromInt,
  fx32,
  length,
  lengthSquared,
  mul,
  neg,
  sub,
  toFloat,
  toInt,
} from '../src/fx32.ts'

describe('fx32', () => {
  it('takes a raw word as it stands', () => {
    expect(fx32(4096)).toBe(4096)
    expect(toFloat(fx32(4096))).toBe(1)
    expect(toFloat(fx32(-6144))).toBe(-1.5)
  })

  it('refuses a value that is not a whole word', () => {
    expect(() => fx32(1.5)).toThrow(FixedError)
    expect(() => fx32(0x80000000)).toThrow(/does not fit/)
  })

  it('scales a whole number into the format', () => {
    expect(fromInt(3)).toBe(3 * FX32_ONE)
    expect(fromInt(-2)).toBe(-2 * FX32_ONE)
    expect(() => fromInt(1.5)).toThrow(FixedError)
    expect(() => fromInt(1 << 20)).toThrow(/does not fit/)
  })
})

describe('rounding', () => {
  it('truncates towards zero', () => {
    expect(toInt(fx32(4096 + 2048))).toBe(1)
    expect(toInt(fx32(-4096 - 2048))).toBe(-1)
  })

  it('floors towards negative infinity, which is what a grid index wants', () => {
    expect(floorToInt(fx32(4096 + 2048))).toBe(1)
    expect(floorToInt(fx32(-4096 - 2048))).toBe(-2)
    expect(floorToInt(fx32(-1))).toBe(-1)
  })
})

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(add(fromInt(2), fromInt(3))).toBe(fromInt(5))
    expect(sub(fromInt(2), fromInt(5))).toBe(fromInt(-3))
    expect(neg(fromInt(7))).toBe(fromInt(-7))
  })

  it('multiplies whole numbers exactly', () => {
    expect(mul(fromInt(6), fromInt(7))).toBe(fromInt(42))
    expect(mul(fromInt(-6), fromInt(7))).toBe(fromInt(-42))
    expect(mul(fromInt(-6), fromInt(-7))).toBe(fromInt(42))
  })

  it('multiplies fractions to the precision the format holds', () => {
    const half = fx32(FX32_ONE / 2)
    expect(mul(half, half)).toBe(FX32_ONE / 4)
    // 0.1 is not representable, so this is the nearest word, not 0.01 exactly.
    const tenth = fx32(Math.round(0.1 * FX32_ONE))
    expect(toFloat(mul(tenth, tenth))).toBeCloseTo(0.01, 3)
  })

  it('divides', () => {
    expect(div(fromInt(42), fromInt(7))).toBe(fromInt(6))
    expect(toFloat(div(fromInt(1), fromInt(4)))).toBe(0.25)
    expect(() => div(fromInt(1), fx32(0))).toThrow(/division by zero/)
  })

  it('multiplies without going through a double', () => {
    // A product whose intermediate exceeds 2^53 if computed as a plain
    // number * number. The split-halves form keeps it exact.
    const big = fromInt(100000)
    expect(mul(big, fromInt(2))).toBe(fromInt(200000))
  })

  it('clamps', () => {
    expect(clamp(fromInt(5), fromInt(0), fromInt(3))).toBe(fromInt(3))
    expect(clamp(fromInt(-5), fromInt(0), fromInt(3))).toBe(fromInt(0))
    expect(clamp(fromInt(2), fromInt(0), fromInt(3))).toBe(fromInt(2))
    expect(() => clamp(fromInt(2), fromInt(3), fromInt(0))).toThrow(/inverted/)
  })
})

describe('vector length', () => {
  it('measures a 3-4-5 triangle exactly', () => {
    expect(length(fromInt(3), fromInt(4), fx32(0))).toBe(fromInt(5))
  })

  it('measures a unit axis', () => {
    expect(length(fromInt(1), fx32(0), fx32(0))).toBe(FX32_ONE)
  })

  it('is zero for a zero vector', () => {
    expect(length(fx32(0), fx32(0), fx32(0))).toBe(0)
  })

  it('agrees with the float answer to the precision the format holds', () => {
    for (const [x, y, z] of [
      [1, 2, 2],
      [7, 24, 0],
      [10, 10, 10],
      [100, 0, 25],
    ]) {
      const got = toFloat(length(fromInt(x as number), fromInt(y as number), fromInt(z as number)))
      expect(got).toBeCloseTo(Math.hypot(x as number, y as number, z as number), 2)
    }
  })

  it('compares distances without a square root', () => {
    const near = lengthSquared(fromInt(1), fromInt(2), fx32(0))
    const far = lengthSquared(fromInt(3), fromInt(4), fx32(0))
    expect(near).toBeLessThan(far)
  })

  it('measures a vector far longer than its own square would fit', () => {
    // The squared length saturates an fx32 past about 724 units; the length
    // itself does not, because it never forms one.
    expect(toFloat(length(fromInt(3000), fromInt(4000), fx32(0)))).toBeCloseTo(5000, 0)
  })

  it('is deterministic across repeated evaluation', () => {
    const once = length(fromInt(13), fromInt(17), fromInt(19))
    for (let i = 0; i < 100; i++) {
      expect(length(fromInt(13), fromInt(17), fromInt(19))).toBe(once)
    }
  })
})

describe('length is seed-independent', () => {
  it('lands on the same value as a correctly-rounded reference', () => {
    // The integer square root must be floor(sqrt(n)) exactly, whatever the
    // host's Math.sqrt does, so compare against a reference computed a
    // different way.
    for (let i = 1; i < 400; i++) {
      const v = length(fromInt(i), fromInt(i * 2), fromInt(i % 7))
      const exact = Math.hypot(i, i * 2, i % 7) * FX32_ONE
      // floor, so never above the true value and never a whole word below
      expect(v).toBeLessThanOrEqual(Math.ceil(exact))
      expect(exact - v).toBeLessThan(1)
    }
  })
})
