import type { ScriptRef, ScriptThread, ScriptValue } from '@minstrel/script'
import { describe, expect, it } from 'vitest'
import { EventStage } from '../src/event.ts'

/** A thread that only takes writes through a reference — all the stage asks of one. */
function thread() {
  const written = new Map<number, ScriptValue>()
  const fake = { write: (ref: ScriptRef, value: ScriptValue) => written.set(ref.index, value) }
  return { written, thread: fake as unknown as ScriptThread }
}
const ref = (index: number): ScriptRef => ({ scope: 1, index })

describe('an event’s stage', () => {
  it('puts a character where it is told, in the world, at the stage’s scale', () => {
    const stage = new EventStage(1 / 8)
    const { thread: t } = thread()
    stage.host.call(206, [1, 8, 0.8, 16], t)
    expect(stage.actors.get(1)).toMatchObject({ x: 1, y: 0.1, z: 2 })
  })

  it('dresses a character in the model a slot was loaded with, and its motion packs', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // As the statue scene brings Ivor on: load, add a pack, give it to character 2.
    stage.host.call(200, ['chara_sub/s017.chr', -3], t)
    stage.host.call(229, ['event_lv5/ev22590s017.chr', -3], t)
    stage.host.call(202, [2, -3, 1], t)
    expect(stage.actors.get(2)).toMatchObject({
      model: 'chara_sub/s017.chr',
      packs: ['event_lv5/ev22590s017.chr'],
    })
    // A pack added after goes to whoever wears the slot.
    stage.host.call(229, ['event_lv5/ev01000s017.chr', -3], t)
    expect(stage.actors.get(2)?.packs).toContain('event_lv5/ev01000s017.chr')
    // A slot nothing was loaded into dresses nobody.
    stage.host.call(202, [5, -9, 1], t)
    expect(stage.actors.get(5)?.model).toBeUndefined()
    expect(stage.unhandled.has(200)).toBe(false)
  })

  it('walks a character over so many frames, facing the way it goes, and says when it has arrived', () => {
    const stage = new EventStage(1)
    const { thread: t, written } = thread()
    stage.host.call(206, [1, 0, 0, 0], t)
    stage.host.call(207, [1, 8, 0, 0, 4], t)
    expect(stage.actors.get(1)?.facing).toBeCloseTo(Math.PI / 2, 9)
    stage.advance()
    stage.advance()
    expect(stage.actors.get(1)?.x).toBeCloseTo(4, 9)
    stage.host.call(204, [1, ref(0)], t)
    expect(written.get(0)).toBe(1)
    stage.advance()
    stage.advance()
    expect(stage.actors.get(1)?.x).toBeCloseTo(8, 9)
    stage.host.call(204, [1, ref(0)], t)
    expect(written.get(0)).toBe(0)
  })

  it('turns a character the short way round', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(208, [1, 0, 0.1, 0], t)
    stage.host.call(209, [1, 0, 2 * Math.PI - 0.1, 0, 2, 1], t)
    stage.advance()
    expect(stage.actors.get(1)?.facing).toBeCloseTo(0, 9)
    stage.advance()
    expect(stage.actors.get(1)?.facing).toBeCloseTo(-0.1, 9)
  })

  it('turns one character to face another, the short way round', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // Ivor walks off along −z with the Hero behind him, then turns back to them.
    stage.host.call(206, [0, 0, 0, 1], t)
    stage.host.call(206, [1, 0, 0, 0], t)
    stage.host.call(208, [1, 0, Math.PI, 0], t)
    stage.host.call(221, [1, 0, 2, 1], t)
    stage.advance()
    expect(Math.abs(stage.actors.get(1)?.facing ?? 0)).toBeCloseTo(Math.PI / 2, 9)
    stage.advance()
    expect(Math.cos(stage.actors.get(1)?.facing ?? 0)).toBeCloseTo(1, 9)
    // Towards someone not on stage, nobody turns.
    stage.host.call(221, [1, 7, 2], t)
    expect(stage.actors.get(1)?.turn).toBeUndefined()
    expect(stage.unhandled.has(221)).toBe(false)
  })

  it('knows which of the map’s cast a character is, and walks that one', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // As the Hexagon's figure is led off: character 1 is cast member 204.
    stage.host.call(566, [5, 204, 1], t)
    stage.host.call(206, [1, 0, 0, 0], t)
    stage.host.call(207, [1, 0, 0, 8, 2], t)
    stage.advance()
    stage.advance()
    expect(stage.actors.get(1)).toMatchObject({ cast: 204, z: 8, placed: true })
    // A model named for a character is not a cast member.
    stage.host.call(566, [2, 'chara_sub/s017.chr', 2], t)
    expect(stage.actors.get(2)?.cast).toBeUndefined()
  })

  it('knows who it has put somewhere from who it has only named', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(566, [2, 'chara_sub/s017f02.chr', 10], t)
    stage.host.call(206, [1, 0, 0, 0], t)
    stage.host.call(207, [2, 1, 0, 0, 4], t)
    expect(stage.actors.get(10)?.placed).toBe(false)
    expect(stage.actors.get(1)?.placed).toBe(true)
    expect(stage.actors.get(2)?.placed).toBe(true)
  })

  it('keeps each character’s model, motion packs and the motion it plays', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(566, [0, 0], t)
    stage.host.call(566, [2, 'chara_sub/s001.chr', 1], t)
    stage.host.call(567, ['event_lv5/ev00001s001.chr', 1], t)
    stage.advance()
    stage.host.call(210, [1, 'wave'], t)
    stage.host.call(224, [1, 'stand'], t)
    expect(stage.actors.get(1)).toMatchObject({
      model: 'chara_sub/s001.chr',
      packs: ['event_lv5/ev00001s001.chr'],
      motion: 'wave',
      motionFrom: 1,
      after: 'stand',
    })
  })

  it('shows a message until it is read', () => {
    const stage = new EventStage(1)
    const { thread: t, written } = thread()
    stage.host.call(400, [12], t)
    stage.host.call(405, [ref(2)], t)
    expect(written.get(2)).toBe(1)
    stage.message = undefined
    stage.host.call(405, [ref(2)], t)
    expect(written.get(2)).toBe(0)
    expect(stage.shown).toEqual([12])
  })

  it('aims the camera at a target from a yaw, a rise and a distance, and lets it go on a new shot', () => {
    const stage = new EventStage(1 / 2)
    const { thread: t } = thread()
    stage.host.call(303, [2, 4, 6], t)
    stage.host.call(310, [1.5, 3, 4], t)
    expect(stage.camera).toEqual({ target: [1, 2, 3], yaw: 1.5, rise: 1.5, distance: 2 })
    stage.host.call(300, [], t)
    expect(stage.camera).toBeUndefined()
  })

  it('takes a shot’s yaw, rise and distance from where its camera is, until 310 gives them', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(302, [3, 4, 4], t)
    stage.host.call(303, [0, 0, 0], t)
    expect(stage.camera?.yaw).toBeCloseTo(Math.atan2(3, 4))
    expect(stage.camera?.rise).toBe(4)
    expect(stage.camera?.distance).toBeCloseTo(Math.hypot(3, 4, 4))
    // Once 310 has spoken, the eye no longer decides.
    stage.host.call(310, [0.5, 1, 2], t)
    stage.host.call(302, [9, 9, 9], t)
    expect(stage.camera).toMatchObject({ yaw: 0.5, rise: 1, distance: 2 })
  })

  it('moves the camera over so many frames: both its points, its angle, or where it looks', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 2], t)
    // To look at (4, 0, 0) from 3 up and 4 back: a distance of 5.
    stage.host.call(304, [4, 3, 4, 4, 0, 0, 10], t)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.camera?.target?.[0]).toBeCloseTo(2)
    expect(stage.camera?.distance).toBeCloseTo(3.5)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.camera).toMatchObject({ target: [4, 0, 0], yaw: 0, rise: 3, distance: 5 })
    stage.host.call(311, [Math.PI / 2, 3, 5, 4], t)
    for (let i = 0; i < 4; i++) stage.advance()
    expect(stage.camera?.yaw).toBeCloseTo(Math.PI / 2)
    stage.host.call(321, [4, 0, 8, 2], t)
    stage.advance()
    expect(stage.camera?.target?.[2]).toBeCloseTo(4)
  })

  it('answers what it does not read with nothing, and counts it', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.host.call(720, [55], t)).toBe(0)
    stage.host.call(720, [56], t)
    expect(stage.unhandled.get(720)).toBe(2)
  })
})
