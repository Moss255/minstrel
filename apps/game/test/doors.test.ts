import type { MapTransition } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { DOOR_REACH, doorAt, doorGate, doorTaken, inDoorway } from '../src/doors.ts'

/** A doorway a unit wide and a quarter deep, facing down the z axis. */
function door(over: Partial<MapTransition> = {}): MapTransition {
  return {
    tag: 0x72,
    to: 'M01M01',
    x: 0,
    y: 0,
    z: 0,
    width: 1,
    height: 2,
    depth: 0.25,
    angle: 0,
    arriveX: 10,
    arriveY: 0,
    arriveZ: 10,
    arriveFacing: 0,
    ...over,
  }
}

describe('standing in a doorway', () => {
  it('is true at the middle of it', () => {
    expect(inDoorway(door(), 0, 0)).toBe(true)
  })

  it('reads the size as the whole width, not a half-extent', () => {
    // Measured against the doorway models the triggers guard: the village's
    // nine are 0.193 tall against a stored 0.250, a trigger 1.3x its own door.
    // Read as half, a trigger would stand 0.50 tall — two and a half doors.
    expect(inDoorway(door(), 0.4, 0, 0)).toBe(true)
    expect(inDoorway(door(), 0.6, 0, 0)).toBe(false)
  })

  it('opens as the character touches it rather than at its centre', () => {
    expect(inDoorway(door(), 0.5 + DOOR_REACH / 2, 0)).toBe(true)
  })

  it('is false well outside it', () => {
    expect(inDoorway(door(), 4, 0)).toBe(false)
    expect(inDoorway(door(), 0, 4)).toBe(false)
  })

  it('turns with the doorway', () => {
    // The same box a quarter turn round: what was along its width is now along
    // its depth, so a point that was inside is outside.
    const turned = door({ angle: Math.PI / 2 })
    expect(inDoorway(turned, 0.4, 0, 0)).toBe(false)
    expect(inDoorway(turned, 0, 0.4, 0)).toBe(true)
  })

  it('ignores how tall the doorway says it is', () => {
    // The stored height is 2 raw units on almost every doorway — a nominal
    // height, not a measurement — so a character on a step is still in the door.
    expect(inDoorway(door({ height: 0 }), 0, 0)).toBe(true)
  })

  it('picks the doorway the character is in, out of several', () => {
    const doors = [door({ to: 'A', x: 8 }), door({ to: 'B' }), door({ to: 'C', x: -8 })]
    expect(doorAt(doors, 0, 0)?.to).toBe('B')
    expect(doorAt(doors, 8, 0)?.to).toBe('A')
    expect(doorAt(doors, 4, 0)).toBeUndefined()
  })

  it('is half as wide as it would be read as a half-extent', () => {
    // The bug this fixes, stated as the difference it makes: a doorway whose
    // stored width is 1 reaches 0.5 to either side, not 1. In an interior the
    // wrong reading put a trigger most of the way across the room.
    const wide = door({ width: 4, depth: 4 })
    expect(inDoorway(wide, 1.9, 0, 0)).toBe(true)
    expect(inDoorway(wide, 2.1, 0, 0)).toBe(false)
  })

  it('finds nothing in a map with no doorways', () => {
    expect(doorAt([], 0, 0)).toBeUndefined()
  })
})

describe('the gate that stops a doorway firing twice', () => {
  /**
   * The bug it exists for: 681 of the cartridge's 1,149 arrivals land inside a
   * doorway of the map they arrive in, because you come out where you would go
   * back in. Firing on arrival bounces the character between two maps forever.
   */
  it('does not fire on the doorway the character was put down in', () => {
    const gate = doorGate()
    const doors = [door()]
    expect(doorTaken(gate, doors, 0, 0)).toBeUndefined()
    expect(doorTaken(gate, doors, 0, 0)).toBeUndefined()
  })

  it('arms as soon as the character steps clear', () => {
    const gate = doorGate()
    const doors = [door()]
    expect(doorTaken(gate, doors, 0, 0)).toBeUndefined()
    expect(doorTaken(gate, doors, 4, 0)).toBeUndefined()
    expect(doorTaken(gate, doors, 0, 0)?.to).toBe('M01M01')
  })

  it('fires straight away for a character put down away from any doorway', () => {
    const gate = doorGate()
    const doors = [door()]
    // The usual case: spawned in the open, then walks into a door.
    expect(doorTaken(gate, doors, 9, 9)).toBeUndefined()
    expect(doorTaken(gate, doors, 0, 0)?.to).toBe('M01M01')
  })

  it('will not fire a second doorway the character was already standing in', () => {
    // Two doorways overlapping where the character lands: leaving one is not
    // leaving the other, so nothing fires until they are clear of both.
    const gate = doorGate()
    const doors = [door({ to: 'A' }), door({ to: 'B', width: 6 })]
    expect(doorTaken(gate, doors, 0, 0)).toBeUndefined()
    expect(doorTaken(gate, doors, 2, 0)).toBeUndefined()
    expect(doorTaken(gate, doors, 8, 0)).toBeUndefined()
    expect(doorTaken(gate, doors, 2, 0)?.to).toBe('B')
  })

  it('starts closed, so a character put down in a doorway stays put', () => {
    expect(doorGate().armed).toBe(false)
  })
})

describe('a doorway indoors', () => {
  /**
   * An indoor map is built an eighth larger than it looks, so its own
   * coordinates shrink to put a character in it — but **the doorway's volume
   * does not**, because it is already in the character's space.
   *
   * Measured on the 154 doorways that have a doorway model standing at them,
   * which is the one ruler in the character's space whatever the map does: a
   * trigger is 1.42x its door's width outdoors and 1.49x indoors when left
   * alone, against 0.19x when scaled with the map.
   */
  const INDOORS = 1 / 8

  /** What `load` does to a doorway of an indoor map. */
  const asLoaded = (d: MapTransition) => ({ ...d, x: d.x * INDOORS, z: d.z * INDOORS })

  it('keeps a volume the character can walk into', () => {
    // The character is 0.44 of their own height across. A trigger scaled with
    // the map would be 0.13 to 0.43 — narrower than they are.
    const inn = asLoaded(door({ x: 8, z: 8, width: 0.31, depth: 0.19 }))
    expect(inn.width).toBeCloseTo(0.31, 5)
    expect(inn.depth).toBeCloseTo(0.19, 5)
  })

  it('stands where the shrunken map puts it', () => {
    const inn = asLoaded(door({ x: 8, z: 8 }))
    expect(inn.x).toBeCloseTo(1, 5)
    expect(inn.z).toBeCloseTo(1, 5)
  })

  it("opens across its own width, not the map's", () => {
    const inn = asLoaded(door({ x: 8, z: 8, width: 0.4, depth: 0.4 }))
    // Half of 0.4 either side of (1, 1), so 0.19 out is in and 0.3 is not.
    expect(inDoorway(inn, 1.19, 1, 0)).toBe(true)
    expect(inDoorway(inn, 1.3, 1, 0)).toBe(false)
  })
})
