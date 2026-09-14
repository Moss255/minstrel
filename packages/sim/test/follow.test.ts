import { fx32 } from '@minstrel/fixed'
import { describe, expect, it } from 'vitest'
import { SimError } from '../src/errors.ts'
import { createFollower, recordLeader, resetFollower } from '../src/field/follow.ts'

const at = (x: number, z: number, y = 0) => ({ x: fx32(x), y: fx32(y), z: fx32(z) })
const where = (f: { x: number; z: number }) => [f.x, f.z]

describe('a follower', () => {
  it('waits where it started until the leader is its delay ahead, then walks their steps', () => {
    const follower = createFollower(3, at(0, 0))
    expect(recordLeader(follower, at(10, 0))).toBe(false)
    expect(recordLeader(follower, at(20, 0))).toBe(false)
    expect(recordLeader(follower, at(30, 0))).toBe(false)
    expect(where(follower)).toEqual([0, 0])
    // Three moving ticks behind, on the points the leader stood on.
    expect(recordLeader(follower, at(40, 5))).toBe(true)
    expect(where(follower)).toEqual([10, 0])
    recordLeader(follower, at(50, 10))
    expect(where(follower)).toEqual([20, 0])
  })

  it('stands still while the leader does, and goes on from there', () => {
    const follower = createFollower(2, at(0, 0))
    for (const x of [10, 20, 30]) recordLeader(follower, at(x, 0))
    expect(where(follower)).toEqual([10, 0])
    for (let tick = 0; tick < 50; tick++) expect(recordLeader(follower, at(30, 0))).toBe(false)
    expect(where(follower)).toEqual([10, 0])
    recordLeader(follower, at(30, 10))
    expect(where(follower)).toEqual([20, 0])
  })

  it('comes back to the leader on arriving somewhere, with no trail behind', () => {
    const follower = createFollower(2, at(0, 0))
    for (const x of [10, 20, 30, 40]) recordLeader(follower, at(x, 0))
    resetFollower(follower, at(500, 500))
    expect(where(follower)).toEqual([500, 500])
    expect(recordLeader(follower, at(510, 500))).toBe(false)
    expect(where(follower)).toEqual([500, 500])
  })

  it('refuses a delay that is not a whole number of ticks', () => {
    expect(() => createFollower(0, at(0, 0))).toThrow(SimError)
    expect(() => createFollower(2.5, at(0, 0))).toThrow(SimError)
  })
})
