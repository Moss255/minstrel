import type { Script, ScriptRoutine } from '@minstrel/game-formats'
import { DEGREE_IN_RADIANS, fovOfHalfDegrees } from '@minstrel/render'
import type { ScriptRef, ScriptThread, ScriptValue } from '@minstrel/script'
import { OP, PUSH_FLOAT, PUSH_INT } from '@minstrel/script'
import { describe, expect, it } from 'vitest'
import {
  CAPTION_PLAIN,
  EventPlayer,
  EventStage,
  FACE_BUTTONS,
  SCENE_FLAGS,
  sceneMotion,
  storyBit,
} from '../src/event.ts'

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

  it('plays a motion once and goes on to the one named next, or holds its last frame', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    const motions = new Map([
      ['talk', { frameCount: 10 }],
      ['stand', { frameCount: 4 }],
    ])
    const find = (name: string) => motions.get(name)
    // As Ivor talks on Erinn's doorstep: `talk` once, then `stand`.
    stage.host.call(210, [1, 'talk', 1], t)
    stage.host.call(224, [1, 'stand'], t)
    const ivor = stage.actors.get(1)
    if (!ivor) throw new Error('no character 1')
    expect(ivor.once).toBe(true)
    expect(sceneMotion(find, ivor, 5, 60)).toEqual({ motion: motions.get('talk'), frame: 5 })
    expect(sceneMotion(find, ivor, 12, 60)).toEqual({ motion: motions.get('stand'), frame: 2 })
    // With nothing named after it, its last frame holds.
    stage.host.call(210, [1, 'talk', 17], t)
    expect(sceneMotion(find, ivor, 40, 60)?.frame).toBe(9)
    // Without the bit, round and round.
    stage.host.call(210, [1, 'talk', 16], t)
    expect(ivor.once).toBe(false)
    expect(sceneMotion(find, ivor, 13, 60)?.frame).toBe(3)
  })

  it('answers whether the scene carries straight on from a conversation', () => {
    const stage = new EventStage(1)
    const { thread: t, written } = thread()
    stage.host.call(560, [ref(3)], t)
    expect(written.get(3)).toBe(0)
    stage.afterTalk = true
    stage.host.call(560, [ref(3)], t)
    expect(written.get(3)).toBe(1)
    expect(stage.unhandled.has(560)).toBe(false)
  })

  it('fades the screen to black and back over so many frames', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // As `ev02510` opens: to black over 12 frames, then back over 16.
    stage.host.call(101, [12], t)
    for (let i = 0; i < 6; i++) stage.advance()
    expect(stage.darkness).toBeCloseTo(0.5)
    for (let i = 0; i < 6; i++) stage.advance()
    expect(stage.darkness).toBe(1)
    stage.host.call(121, [16], t)
    for (let i = 0; i < 16; i++) stage.advance()
    expect(stage.darkness).toBe(0)
    expect(stage.unhandled.has(101) || stage.unhandled.has(121)).toBe(false)
  })

  it('moves where the camera looks from where it looks now, with no angle of its own unless given one', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.looking = [0, 0, 0]
    // As `ev02500` does: a new shot, then only a move of where it looks.
    stage.host.call(300, [], t)
    stage.host.call(321, [0, 0, -4, 80], t)
    for (let i = 0; i < 40; i++) stage.advance()
    expect(stage.camera?.target?.[2]).toBeCloseTo(-2)
    expect(stage.cameraAngled).toBe(false)
    // One given its angle has its own.
    stage.host.call(310, [0, 1, 2], t)
    expect(stage.cameraAngled).toBe(true)
  })

  it('fades a character in and out in the DS’s 32 steps, and draws one from a sprite sheet', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // As the Hexagon's figure appears on `ev02500`: a sheet, next to nothing,
    // then whole — 31 — over 90 frames.
    stage.host.call(566, [3, 'n012g.spr', 1], t)
    stage.host.call(219, [1, 1], t)
    expect(stage.actors.get(1)).toMatchObject({ sprite: 'n012g', opacity: 1 })
    stage.host.call(220, [1, 31, 90], t)
    for (let i = 0; i < 45; i++) stage.advance()
    expect(stage.actors.get(1)?.opacity).toBeCloseTo(16)
    for (let i = 0; i < 45; i++) stage.advance()
    expect(stage.actors.get(1)?.opacity).toBe(31)
    // A fade given no frames is at once; a value past the top is whole.
    stage.host.call(220, [1, 0], t)
    expect(stage.actors.get(1)?.opacity).toBe(0)
    stage.host.call(219, [1, 255], t)
    expect(stage.actors.get(1)?.opacity).toBe(31)
    expect(stage.unhandled.has(219) || stage.unhandled.has(220)).toBe(false)
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
    expect(stage.camera).toEqual({ target: [1, 2, 3], yaw: 1.5, roll: 0, rise: 1.5, distance: 2 })
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
    // 809 is not read; 731 was, and is the sound archives being given back.
    expect(stage.host.call(809, [], t)).toBe(0)
    stage.host.call(809, [], t)
    expect(stage.unhandled.get(809)).toBe(2)
  })

  it('hides and shows a character, and hangs one on another', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(566, [2, 'chara_sub/s017f02.chr', 10], t)
    stage.host.call(570, [10, 0], t)
    stage.host.call(571, [10, 0], t)
    stage.host.call(235, [10, 1, 'head'], t)
    const face = stage.actors.get(10)
    expect(face?.hidden).toBe(true)
    expect(face?.hungOn).toEqual({ parent: 1, bone: 'head' })
    expect(face?.placed).toBe(false)
    stage.host.call(570, [10, 1], t)
    expect(face?.hidden).toBe(false)
    expect(stage.unhandled.size).toBe(0)
  })

  it('loads a scene’s sound archive, plays out of it, and gives it back', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // 726 **loads** archive 261 — it plays nothing, which is what this engine
    // had it doing until the game's own handler was read.
    stage.host.call(726, [261], t)
    expect(stage.sounds).toEqual([])
    // 728 plays one of that archive's own sounds.
    stage.host.call(728, [3], t)
    stage.host.call(720, [55], t)
    // 730 loads a second archive and 732 plays out of that one.
    stage.host.call(730, [364], t)
    stage.host.call(732, [1], t)
    stage.host.call(729, [0, 16], t)
    stage.host.call(727, [], t)
    // With the scene's archive given back, a play falls to the base archive.
    stage.host.call(728, [5], t)
    expect(stage.sounds).toEqual([
      { kind: 'effect', index: 261, slot: 3 },
      { kind: 'jingle', index: 55 },
      { kind: 'effect', index: 364, slot: 1 },
      { kind: 'stop', index: 0 },
      { kind: 'effect', index: 100, slot: 5 },
    ])
    expect(stage.unhandled.size).toBe(0)
  })

  it('plays a sound of the base archive, and hands back a handle — 712', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(712, [7, ref(3)], t)
    expect(stage.sounds).toEqual([{ kind: 'effect', index: 100, slot: 7 }])
    expect(written.get(3)).toBe(0)
  })

  it('keeps which blip a line is spoken with — 554', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.talkPitch).toBe(0)
    stage.host.call(554, [1], t)
    expect(stage.talkPitch).toBe(1)
  })

  it('stops what a character is playing — 222', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(210, [1, 'walk'], t)
    expect(stage.actors.get(1)?.motion).toBe('walk')
    stage.host.call(222, [1], t)
    expect(stage.actors.get(1)?.motion).toBeUndefined()
  })

  it('answers a look-up of a character it does not keep — 595 and 596', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(595, [ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.host.call(596, [4, ref(2), ref(3)], t)
    // The game's own answer for a name it does not find.
    expect(written.get(2)).toBe(-1)
    expect(written.get(3)).toBe(2)
  })
})

describe('an engine function the host has not got', () => {
  it('is answered with 0, counted, and kept with what it was handed', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.host.call(804, [7, 1.5, 'hello'], t)).toBe(0)
    stage.host.call(804, [9], t)
    const call = stage.unreadCalls.get(804)
    expect(call?.calls).toBe(2)
    // The signatures are `docs/event-scripts.md`'s: integer, float, string.
    expect([...(call?.shapes ?? [])].sort()).toEqual(['i', 'ifs'])
    expect(call?.examples[0]).toEqual([7, 1.5, 'hello'])
    // The count it kept before stands beside it, for whatever reads that.
    expect(stage.unhandled.get(804)).toBe(2)
  })

  it('keeps a few argument lists and no more, however often it is called', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    for (let i = 0; i < 50; i++) stage.host.call(804, [i], t)
    const call = stage.unreadCalls.get(804)
    expect(call?.calls).toBe(50)
    expect(call?.examples.length).toBeLessThanOrEqual(4)
  })

  it('says so the first time, and only the first time', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    const said: number[] = []
    stage.onUnread = (call) => said.push(call.fn)
    stage.host.call(804, [1], t)
    stage.host.call(804, [2], t)
    stage.host.call(843, [], t)
    expect(said).toEqual([804, 843])
  })

  it('stops the run instead, where the run is there to find them', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.strict = true
    expect(() => stage.host.call(804, [7], t)).toThrow(/engine function 804 is not read/)
  })

  it('says nothing for a function the host answers', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.onUnread = () => {
      throw new Error('206 is read')
    }
    stage.host.call(206, [1, 8, 0.8, 16], t)
    expect(stage.unreadCalls.size).toBe(0)
  })
})

describe('a waypoint path — the game’s 214 to 217', () => {
  /** Build a path for character 1 and set it going. */
  const walk = (
    stage: EventStage,
    points: readonly (readonly [number, number, number])[],
    speed: number,
  ) => {
    const { thread: t } = thread()
    stage.host.call(214, [1], t)
    for (const [x, y, z] of points) stage.host.call(216, [1, x, y, z], t)
    stage.host.call(215, [1, speed], t)
    stage.host.call(217, [1], t)
  }

  it('gathers points, keeps sixteen of them, and drops the rest as the game does', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(214, [1], t)
    for (let i = 0; i < 22; i++) stage.host.call(216, [1, i, 0, 0], t)
    expect(stage.actors.get(1)?.path.points).toHaveLength(16)
    expect(stage.actors.get(1)?.path.points[15]).toEqual([15, 0, 0])
  })

  it('starts the character at the first point and walks it to the last', () => {
    const stage = new EventStage(1)
    walk(
      stage,
      [
        [0, 0, 0],
        [3, 0, 4],
      ],
      10,
    )
    const actor = stage.actors.get(1)
    expect(actor).toMatchObject({ x: 0, y: 0, z: 0 })
    // Five units at a speed of ten: half a second, thirty frames.
    expect(actor?.path.frames).toBe(30)
    for (let i = 0; i < 30; i++) stage.advance()
    expect(actor?.x).toBeCloseTo(3, 6)
    expect(actor?.z).toBeCloseTo(4, 6)
    expect(actor?.path.started).toBeUndefined()
  })

  it('is busy while it walks, as 204 reports', () => {
    const stage = new EventStage(1)
    walk(
      stage,
      [
        [0, 0, 0],
        [0, 0, 10],
      ],
      5,
    )
    expect(stage.busy(1)).toBe(true)
    for (let i = 0; i < stage.actors.get(1)!.path.frames; i++) stage.advance()
    expect(stage.busy(1)).toBe(false)
  })

  it('faces the way the path is going', () => {
    const stage = new EventStage(1)
    walk(
      stage,
      [
        [0, 0, 0],
        [0, 0, 10],
      ],
      5,
    )
    stage.advance()
    // Straight along +z, which is a facing of 0 in the Hero's own convention.
    expect(stage.actors.get(1)?.facing).toBeCloseTo(0, 3)
    const other = new EventStage(1)
    walk(
      other,
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
      5,
    )
    other.advance()
    expect(other.actors.get(1)?.facing).toBeCloseTo(Math.PI / 2, 3)
  })

  it('curves through its points rather than cutting corners', () => {
    // ev02810 bobs a character in place: x and z held, y stepped up and down.
    const stage = new EventStage(1)
    walk(
      stage,
      [
        [0, 0.28, 0],
        [0, 0.58, 0],
        [0, 0.18, 0],
        [0, 0.28, 0],
      ],
      2,
    )
    const actor = stage.actors.get(1)
    const heights: number[] = []
    for (let i = 0; i < (actor?.path.frames ?? 0); i++) {
      stage.advance()
      heights.push(actor?.y ?? 0)
    }
    expect(Math.max(...heights)).toBeGreaterThan(0.5)
    expect(Math.min(...heights)).toBeLessThan(0.25)
  })

  it('takes its points at the stage’s scale, as 206 does', () => {
    const stage = new EventStage(1 / 8)
    const { thread: t } = thread()
    stage.host.call(214, [1], t)
    stage.host.call(216, [1, 8, 8, 16], t)
    expect(stage.actors.get(1)?.path.points[0]).toEqual([1, 1, 2])
  })

  it('says nothing about them being unread any more', () => {
    const stage = new EventStage(1)
    walk(
      stage,
      [
        [0, 0, 0],
        [1, 0, 1],
      ],
      5,
    )
    for (const fn of [214, 215, 216, 217]) expect(stage.unreadCalls.has(fn)).toBe(false)
  })
})

describe('the scene’s field of view — the game’s 532', () => {
  it('takes the half-angle in degrees and keeps the whole field in radians', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.fov).toBeUndefined()
    // 15 is what 1,668 of its 2,477 calls pass: a vertical field of 30° —
    // by the game's own degree, `0x47/4096`, which is 0.68% short of π/180.
    stage.host.call(532, [15], t)
    expect(stage.fov).toBe(30 * DEGREE_IN_RADIANS)
    // It takes a float as readily as an integer.
    stage.host.call(532, [12.5], t)
    expect(stage.fov).toBe(25 * DEGREE_IN_RADIANS)
    expect(stage.unreadCalls.has(532)).toBe(false)
  })
})

describe('staging a scene’s cast — the game’s 502 to 508, 203, 205 and 212', () => {
  it('keeps what 506 queued, and 508 drops it', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(506, ['chara/p_hero.chr', 'chara_sub/s016.chr'], t)
    expect(stage.queued).toEqual(['chara/p_hero.chr', 'chara_sub/s016.chr'])
    // A second 506 replaces the list, as the game resets its count.
    stage.host.call(506, ['chara/p_other.chr'], t)
    expect(stage.queued).toEqual(['chara/p_other.chr'])
    stage.host.call(508, [], t)
    expect(stage.queued).toEqual([])
  })

  it('answers 507 that nothing is still loading, which is what ends the spin', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(506, ['chara/p_hero.chr'], t)
    stage.host.call(507, [ref(4)], t)
    expect(written.get(4)).toBe(0)
  })

  it('has nothing to do for the VRAM partition, and says so by not counting it', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(502, [3, 1], t)
    stage.host.call(503, [3], t)
    for (const fn of [502, 503, 506, 507, 508]) expect(stage.unreadCalls.has(fn)).toBe(false)
  })

  it('points a character at a display entry with 205, and unbinds it with 203', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(200, ['chara_sub/s017.chr', -3], t)
    stage.host.call(202, [2, -3, 1], t)
    expect(stage.actors.get(2)?.model).toBe('chara_sub/s017.chr')
    // 205 points character 2 at display entry 2, which is where it already is.
    stage.host.call(205, [2, 2], t)
    expect(stage.actors.get(2)?.model).toBe('chara_sub/s017.chr')
    // 203 takes it off again, and stops whatever it was doing.
    stage.host.call(214, [2], t)
    stage.host.call(216, [2, 1, 0, 1], t)
    stage.host.call(215, [2, 5], t)
    stage.host.call(217, [2], t)
    expect(stage.busy(2)).toBe(true)
    stage.host.call(203, [2], t)
    expect(stage.actors.get(2)?.model).toBeUndefined()
    expect(stage.busy(2)).toBe(false)
  })

  it('destroys a slot’s model with 212, and undresses whoever wore it', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(200, ['chara_sub/s017.chr', -3], t)
    stage.host.call(202, [2, -3, 1], t)
    stage.host.call(212, [-3], t)
    expect(stage.actors.get(2)?.model).toBeUndefined()
    // And the slot is gone, so a later binding finds nothing.
    stage.host.call(202, [4, -3, 1], t)
    expect(stage.actors.get(4)?.model).toBeUndefined()
  })
})

describe('the seven the next town wanted', () => {
  it('makes a character wait, and busy while it does — 218', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(218, [1, 5], t)
    expect(stage.busy(1)).toBe(true)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.busy(1)).toBe(false)
    // A wait of nothing is over before it starts.
    stage.host.call(218, [1, 0], t)
    expect(stage.busy(1)).toBe(false)
  })

  it('hands back where a character is and which way it faces — 543 and 544', () => {
    const stage = new EventStage(1 / 8)
    const { written, thread: t } = thread()
    stage.host.call(206, [1, 8, 16, 24], t)
    stage.host.call(208, [1, 0, Math.PI / 2, 0], t)
    stage.host.call(543, [1, ref(1), ref(2), ref(3)], t)
    // The script's own units, which is what 206 was given.
    expect(written.get(1)).toBeCloseTo(8, 6)
    expect(written.get(2)).toBeCloseTo(16, 6)
    expect(written.get(3)).toBeCloseTo(24, 6)
    stage.host.call(544, [1, ref(4), ref(5), ref(6)], t)
    // Degrees, as the game's angles are.
    expect(written.get(5)).toBeCloseTo(90, 6)
    expect(written.get(4)).toBe(0)
  })

  it('hands back the time of day, which is the engine’s own — 597', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.timeOfDay = 2
    stage.host.call(597, [ref(7)], t)
    expect(written.get(7)).toBe(2)
  })

  it('says the Hero is a man — 800', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(800, [ref(8)], t)
    expect(written.get(8)).toBe(1)
  })

  it('opens a door placement and closes it again — 540 and 563', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(540, [3, 7], t)
    stage.host.call(585, [4, 1], t)
    expect([...stage.doorsOpened].sort()).toEqual(['3,7', '4,1'])
    stage.host.call(563, [3, 7], t)
    expect([...stage.doorsOpened]).toEqual(['4,1'])
  })

  it('counts none of them as unread any more', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(9, [], t)
    stage.host.call(218, [1, 1], t)
    stage.host.call(540, [1, 1], t)
    stage.host.call(544, [1, ref(1)], t)
    stage.host.call(563, [1, 1], t)
    stage.host.call(597, [ref(2)], t)
    stage.host.call(800, [ref(3)], t)
    expect([...stage.unreadCalls.keys()]).toEqual([])
  })
})

describe('the camera shakes, and the rest of the 300s', () => {
  /** A shot to shake: a target, and an angle so the camera is the scene's own. */
  const shot = (stage: EventStage) => {
    const { thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 10], t)
    return t
  }

  it('moves the view on and off over four frames, and does not fade — 317', () => {
    const stage = new EventStage(1)
    const t = shot(stage)
    stage.host.call(317, [0.2, 0, 0.14, 12], t)
    const seen: number[] = []
    for (let i = 0; i < 12; i++) {
      stage.advance()
      seen.push(stage.camera?.target?.[0] ?? 0)
    }
    // On, nothing, off, nothing — and the same size throughout, the game's own
    // decay never reaching the camera.
    expect(seen.slice(0, 4).map((x) => Math.round(x * 100) / 100)).toEqual([0.2, 0, -0.2, 0])
    expect(seen.slice(4, 8).map((x) => Math.round(x * 100) / 100)).toEqual([0.2, 0, -0.2, 0])
    expect(Math.max(...seen)).toBeCloseTo(0.2, 6)
  })

  it('puts the view back when it is over, and leaves it where it was', () => {
    const stage = new EventStage(1)
    const t = shot(stage)
    stage.host.call(317, [1, 0, 0, 4], t)
    for (let i = 0; i < 6; i++) stage.advance()
    expect(stage.shake).toBeUndefined()
    expect(stage.camera?.target).toEqual([0, 0, 0])
  })

  it('shakes for ever on a count below zero', () => {
    const stage = new EventStage(1)
    const t = shot(stage)
    stage.host.call(317, [1, 0, 0, -1], t)
    for (let i = 0; i < 100; i++) stage.advance()
    expect(stage.shake).toBeDefined()
  })

  it('says whether the camera still has work — 301', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 10], t)
    stage.host.call(301, [ref(1)], t)
    expect(written.get(1)).toBe(0)
    // A shake counts as work, as it does in the game's own queues.
    stage.host.call(317, [1, 0, 0, 10], t)
    stage.host.call(301, [ref(2)], t)
    expect(written.get(2)).toBe(1)
  })

  it('moves what the camera looks at — 305', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 10], t)
    stage.host.call(305, [10, 0, 0, 10], t)
    for (let i = 0; i < 10; i++) stage.advance()
    expect(stage.camera?.target?.[0]).toBeCloseTo(10, 6)
  })
})

describe('the worklist head, read from the cartridge', () => {
  it('moves a character to a point without turning it — 211', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(206, [0, 0, 0, 0], t)
    stage.host.call(208, [0, 0, 1.5, 0], t)
    stage.host.call(211, [0, 10, 0, 0, 10], t)
    for (let i = 0; i < 5; i++) stage.advance()
    const actor = stage.actors.get(0)
    expect(actor?.x).toBeCloseTo(5, 6)
    // The queued command holds a point and a count, so the facing is untouched.
    expect(actor?.facing).toBeCloseTo(1.5, 6)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(actor?.x).toBeCloseTo(10, 6)
  })

  it('puts it there at once without a count — 211', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(206, [0, 0, 0, 0], t)
    stage.host.call(211, [0, 3, 4, 5], t)
    const actor = stage.actors.get(0)
    expect([actor?.x, actor?.y, actor?.z]).toEqual([3, 4, 5])
    expect(actor?.walk).toBeUndefined()
  })

  it('fades the bottom screen apart from the top — 105, 120, 121', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(120, [10], t)
    for (let i = 0; i < 10; i++) stage.advance()
    expect(stage.subDarkness).toBeCloseTo(1, 6)
    expect(stage.darkness).toBe(0)
    // 121 is the even half of its pair: it passes 0 whatever level it is given.
    stage.host.call(121, [0, -16], t)
    expect(stage.darkness).toBe(0)
    // 105 takes the level the scene gives it.
    stage.host.call(105, [0, -8], t)
    expect(stage.subDarkness).toBeCloseTo(0.5, 6)
  })

  it('blacks both screens on 101, which is SetBrightness', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(101, [0], t)
    expect(stage.darkness).toBe(1)
    expect(stage.subDarkness).toBe(1)
  })

  it('takes the top screen apart from the bottom — 106, 107', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(107, [0], t)
    expect(stage.darkness).toBe(1)
    expect(stage.subDarkness).toBe(0)
    stage.host.call(106, [0], t)
    expect(stage.darkness).toBe(0)
  })

  it('holds a locked screen against every later set — 112, 117', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // Lock both screens black.
    stage.host.call(112, [0], t)
    expect(stage.darkness).toBe(1)
    expect([...stage.brightnessLocked].sort()).toEqual(['sub', 'top'])
    // A plain set does nothing at all while the lock holds.
    stage.host.call(100, [0], t)
    expect(stage.darkness).toBe(1)
    expect(stage.subDarkness).toBe(1)
    // Unlocking sets in the same breath.
    stage.host.call(117, [0], t)
    expect(stage.darkness).toBe(0)
    expect([...stage.brightnessLocked]).toEqual([])
    stage.host.call(100, [0], t)
    expect(stage.darkness).toBe(0)
  })

  it('locks one screen without touching the other — 115, 113', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(115, [0], t)
    expect([...stage.brightnessLocked]).toEqual(['top'])
    stage.host.call(105, [0], t)
    expect(stage.subDarkness).toBe(1)
    stage.host.call(101, [0], t)
    // The top is locked, so `101` reaches only the bottom.
    expect(stage.darkness).toBe(0)
    expect(stage.subDarkness).toBe(1)
  })

  it('keeps the colour a scene puts over the screen — 102, 103', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(103, [31, 0, 16, 20], t)
    expect(stage.tint).toEqual({
      red: 31,
      green: 0,
      blue: 16,
      coefficient: 31,
      frames: 20,
      start: 0,
    })
    // 102 names no colour and asks for 1, not 31.
    stage.host.call(102, [8], t)
    expect(stage.tint).toEqual({ coefficient: 1, frames: 8, start: 0 })
  })

  it('keeps the display swap, which is not brightness — 108, 109, 110', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.screensSwapped).toBe(false)
    stage.host.call(110, [], t)
    expect(stage.screensSwapped).toBe(true)
    stage.host.call(108, [], t)
    expect(stage.screensSwapped).toBe(false)
    stage.host.call(108, [], t)
    expect(stage.screensSwapped).toBe(true)
    stage.host.call(109, [], t)
    expect(stage.screensSwapped).toBe(false)
    // None of the three is counted as unread.
    expect([...stage.unhandled.keys()]).toEqual([])
  })

  it('moves the look-at point and the orbit together — 322', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 10], t)
    stage.host.call(322, [10, 0, 0, Math.PI / 2, 3, 20, 10], t)
    for (let i = 0; i < 10; i++) stage.advance()
    expect(stage.camera?.target?.[0]).toBeCloseTo(10, 6)
    expect(stage.camera?.yaw).toBeCloseTo(Math.PI / 2, 6)
    expect(stage.camera?.distance).toBeCloseTo(20, 6)
  })

  it('turns the yaw the way its eighth number says — 322', () => {
    const turn = (dir: number) => {
      const stage = new EventStage(1)
      const { thread: t } = thread()
      stage.host.call(303, [0, 0, 0], t)
      stage.host.call(310, [0, 1, 10], t)
      // Three quarters of a turn forward, a quarter back.
      stage.host.call(322, [0, 0, 0, (3 * Math.PI) / 2, 1, 10, 4, dir], t)
      stage.advance()
      return stage.camera?.yaw ?? 0
    }
    // -1 takes the short way, which is backwards; 1 is forced forwards.
    expect(turn(-1)).toBeCloseTo(-Math.PI / 8, 6)
    expect(turn(1)).toBeCloseTo((3 * Math.PI) / 8, 6)
  })

  it('gives the camera back after a count — 328', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 10], t)
    stage.host.call(328, [5], t)
    stage.host.call(301, [ref(1)], t)
    expect(written.get(1)).toBe(1)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.camera).toBeUndefined()
    stage.host.call(301, [ref(2)], t)
    expect(written.get(2)).toBe(0)
  })

  it('fades the music out over a count, 30 by default — 721', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(721, [], t)
    stage.host.call(721, [0], t)
    expect(stage.sounds).toEqual([
      { kind: 'stopMusic', index: 0, frames: 30 },
      { kind: 'stopMusic', index: 0, frames: 0 },
    ])
  })

  it('answers the seven empty sound functions rather than counting them — 703 to 709', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    for (let id = 703; id <= 709; id++) expect(stage.host.call(id, [], t)).toBe(1)
    expect([...stage.unhandled.keys()]).toEqual([])
  })
})

describe("the towns' shared set, read from the cartridge", () => {
  it('clamps the volume to 0..127 and ramps it — 715', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.volume).toBe(127)
    stage.host.call(715, [999], t)
    expect(stage.volume).toBe(127)
    stage.host.call(715, [-5], t)
    expect(stage.volume).toBe(0)
    stage.host.call(715, [100, 10], t)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.volume).toBeCloseTo(50, 6)
  })

  it('hides and shows a placed thing — 574', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(574, [3, 7, 0], t)
    expect(stage.placements.get('3,7')?.hidden).toBe(true)
    // Anything but zero shows it: the flag bit is cleared, not set.
    stage.host.call(574, [3, 7, 2], t)
    expect(stage.placements.get('3,7')?.hidden).toBe(false)
  })

  it('moves, turns and sizes the same record — 575, 576, 577', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(575, [3, 7, 1, 2, 3], t)
    stage.host.call(576, [3, 7, 4.9], t)
    stage.host.call(577, [3, 7, 0.5, 0, -0.5], t)
    stage.host.call(574, [3, 7, 0], t)
    // One record, found the same way by all four.
    expect(stage.placements.size).toBe(1)
    expect(stage.placements.get('3,7')).toEqual({
      hidden: true,
      position: [1, 2, 3],
      half: 4,
      vector: [0.5, 0, -0.5],
    })
  })

  it('reads a story flag, clear until one is set — 603', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(603, [42, ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.flags.add(42)
    stage.host.call(603, [42, ref(2)], t)
    expect(written.get(2)).toBe(1)
  })

  it('answers which choice was picked — 558', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(558, [ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.choice = 2
    stage.host.call(558, [ref(2)], t)
    expect(written.get(2)).toBe(2)
  })

  it('folds a monster into the game-object slots — 233', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(233, ['m001', -1], t)
    stage.host.call(233, ['m002', -0x20], t)
    expect([...stage.monsters]).toEqual([
      [0xa0, 'm001'],
      [0xbf, 'm002'],
    ])
  })

  it('keeps the battle a scene asks for, -1 when it names none — 547', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(547, [4], t)
    expect(stage.battleFrom).toEqual({ placement: 4, battle: -1 })
    stage.host.call(547, [4, 12], t)
    expect(stage.battleFrom).toEqual({ placement: 4, battle: 12 })
  })

  it('drops a placed sprite, ignoring its second number — 573', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(573, [9, 1], t)
    expect([...stage.spritesDropped]).toEqual([9])
  })
})

describe('what a scene declares, and the rest of the clusters', () => {
  it('gathers every mask it is given, keeping the top five bits clear — 568', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.host.call(568, [1, 4, 0x20], t)).toBe(1)
    expect(stage.sceneFlags).toBe(0x25)
    // It ORs, never clears, and it is variadic — a call with nothing is legal.
    stage.host.call(568, [2], t)
    stage.host.call(568, [], t)
    expect(stage.sceneFlags).toBe(0x27)
    // The top five bits are the game's count of spawned characters, not flags.
    stage.host.call(568, [0xffffffff], t)
    expect(stage.sceneFlags).toBe(SCENE_FLAGS)
  })

  it('sets and clears raw masks in the game’s own word — 512', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(512, [0x408, 1], t)
    expect(stage.gameFlags).toBe(0x408)
    stage.host.call(512, [0x8, 0], t)
    expect(stage.gameFlags).toBe(0x400)
  })

  it('banks the camera in degrees, by the game’s own degree — 327', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(327, [90], t)
    expect(stage.camera?.roll).toBeCloseTo(90 * DEGREE_IN_RADIANS, 12)
    // Wrapped to a turn, as `fix32ReduceAngle0To2Pi` wraps the game's.
    stage.host.call(327, [-90], t)
    expect(stage.camera?.roll).toBeCloseTo(2 * Math.PI - 90 * DEGREE_IN_RADIANS, 6)
  })

  it('keeps the bone camera a scene installs, and gives it back — 572, 531', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(572, [4, 'cam_eye', 'cam_at'], t)
    expect(stage.boneCamera).toEqual({ placement: 4, eye: 'cam_eye', at: 'cam_at' })
    stage.host.call(531, [], t)
    expect(stage.boneCamera).toBeUndefined()
  })

  it('waits out a one-shot motion where it can be told how long — 213', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(210, [0, 'bow', 1], t)
    // With nobody to say how long, the wait is over at once.
    stage.host.call(213, [0], t)
    expect(stage.busy(0)).toBe(false)
    stage.motionFrames = (motion) => (motion === 'bow' ? 12 : undefined)
    stage.host.call(213, [0], t)
    expect(stage.busy(0)).toBe(true)
    for (let i = 0; i < 12; i++) stage.advance()
    expect(stage.busy(0)).toBe(false)
  })

  it('does not wait on a motion that goes round and round — 213', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.motionFrames = () => 12
    // 210 without bit 1 loops for ever; the game would hold the channel for ever.
    stage.host.call(210, [0, 'walk', 0], t)
    stage.host.call(213, [0], t)
    expect(stage.busy(0)).toBe(false)
  })

  it('arms a tune and then starts it — 713, 714', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // Either shape: the two-argument one throws its first number away.
    expect(stage.host.call(713, [99, 42], t)).toBe(1)
    expect(stage.musicArmed).toBe(42)
    expect(stage.host.call(713, [7], t)).toBe(1)
    expect(stage.musicArmed).toBe(7)
    // A negative number fails and arms nothing.
    expect(stage.host.call(713, [-1], t)).toBe(0)
    expect(stage.musicArmed).toBe(7)
    expect(stage.sounds).toEqual([])
    stage.volume = 10
    stage.host.call(714, [], t)
    expect(stage.sounds).toEqual([{ kind: 'music', index: 7 }])
    expect(stage.volume).toBe(127)
  })

  it('answers the jingle and the wireless with no, which lets a scene on — 725, 801', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(725, [ref(1)], t)
    stage.host.call(801, [ref(2)], t)
    expect([written.get(1), written.get(2)]).toEqual([0, 0])
    stage.jingleBusy = true
    stage.host.call(725, [ref(3)], t)
    expect(written.get(3)).toBe(1)
  })

  it('answers the five more inert sound numbers — 716 to 719, 724', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    for (const id of [716, 717, 718, 719, 724]) expect(stage.host.call(id, [], t)).toBe(1)
    expect([...stage.unhandled.keys()]).toEqual([])
  })

  it('dresses the message as a caption, and 400 puts it back — 409 to 414', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(400, [3], t)
    expect(stage.caption).toEqual(CAPTION_PLAIN)
    stage.host.call(410, [], t)
    stage.host.call(411, [], t)
    stage.host.call(413, [], t)
    stage.host.call(414, [], t)
    stage.host.call(409, [90], t)
    expect(stage.caption).toEqual({
      framed: false,
      centred: true,
      glyphs: 'outline',
      silent: true,
      hold: 90,
    })
    // 412 is 414's alternative, not its companion.
    stage.host.call(412, [], t)
    expect(stage.caption.glyphs).toBe('shadow')
    // The next message resets every one of them, as the show routine does.
    stage.host.call(400, [4], t)
    expect(stage.caption).toEqual(CAPTION_PLAIN)
  })

  it('closes the message — 401', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(400, [3], t)
    stage.host.call(405, [ref(1)], t)
    expect(written.get(1)).toBe(1)
    stage.host.call(401, [], t)
    stage.host.call(405, [ref(2)], t)
    expect(written.get(2)).toBe(0)
  })
})

describe('the free readings — knobs that fell out of the clusters', () => {
  it('answers the window’s three readers with the safe zero — 402, 403, 404', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(400, [1], t)
    for (const [i, id] of [402, 403, 404].entries()) stage.host.call(id, [ref(i)], t)
    expect([written.get(0), written.get(1), written.get(2)]).toEqual([0, 0, 0])
    expect([...stage.unhandled.keys()]).toEqual([])
  })

  it('keeps the window’s other bytes by their offsets — 417 to 421', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.window).toEqual({})
    stage.host.call(417, [], t)
    stage.host.call(418, [7], t)
    stage.host.call(419, [], t)
    stage.host.call(420, [3], t)
    stage.host.call(421, [], t)
    expect(stage.window).toEqual({
      unknown_0x195d: 0x1e,
      unknown_0x19ae: 7,
      unknown_0x19c0: 1,
      unknown_0x19c1: 1,
      unknown_0x19ca: 0,
      // A boolean of its number, not the number.
      unknown_0x19cb: 1,
    })
  })

  it('reads the flag switches the other way up — 536, 833, 581', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // A 0 sets the bit; anything else clears it. Same word 512 pokes.
    stage.host.call(536, [0, 0], t)
    stage.host.call(833, [0], t)
    expect(stage.gameFlags).toBe(0x808)
    stage.host.call(536, [1, 0], t)
    expect(stage.gameFlags).toBe(0xc08)
    stage.host.call(536, [0, 1], t)
    stage.host.call(833, [1], t)
    expect(stage.gameFlags).toBe(0x400)
    // 581 is the same way up, on the placement manager's own word; 582 clears.
    stage.host.call(581, [0], t)
    expect(stage.placementsHeld).toBe(true)
    stage.host.call(582, [], t)
    expect(stage.placementsHeld).toBe(false)
  })

  it('puts a rom path together in the scene’s buffer — 569', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(569, ['ani/dq_kaidan.spr'], t)
    expect(stage.queuedPath).toBe('data/ani/dq_kaidan.spr')
  })
})

describe('the 200s that were not moves at all', () => {
  it('fades the scene’s light over a count, or sets it outright — 578', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.lightScale).toBe(1)
    stage.host.call(578, [0, 10], t)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.lightScale).toBeCloseTo(0.5, 6)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.lightScale).toBe(0)
    // No count, or a count of nothing, sets it there and then.
    stage.host.call(578, [1], t)
    expect(stage.lightScale).toBe(1)
  })

  it('takes 238’s three numbers as a colour, not a place — 238', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(238, [4, 31, 0, 16], t)
    expect(stage.recolours.get(4)).toEqual({ red: 31, green: 0, blue: 16, how: 'add' })
    // The fifth number is how it is applied, and it is 0 — add — by default.
    stage.host.call(238, [4, 1, 2, 3, 2], t)
    expect(stage.recolours.get(4)?.how).toBe('multiply')
    stage.host.call(238, [4, 1, 2, 3, 1], t)
    expect(stage.recolours.get(4)?.how).toBe('fill')
    // A mode the game itself does nothing for is said to be unread, not guessed.
    stage.host.call(238, [4, 1, 2, 3, 9], t)
    expect(stage.recolours.get(4)?.how).toBe('unread')
  })

  it('records an unhanging and a dropped motion pack — 236, 230', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(236, [6], t)
    expect([...stage.detached]).toEqual([6])
    // The package id is 3 when the scene does not say, which is every call.
    stage.host.call(230, [2], t)
    stage.host.call(230, [2, 7], t)
    expect(stage.actors.get(2)?.packsDropped).toEqual([3, 7])
    // A negative number folds onto a monster slot, as 233's does.
    stage.host.call(230, [-1], t)
    expect(stage.actors.get(0xa0)?.packsDropped).toEqual([3])
  })
})

describe('a scene carrying on into another script — the game’s 538', () => {
  /**
   * A script that invokes each engine function in turn and returns — laid out
   * as `FORMAT.md` describes, the way `packages/script/test/vm.test.ts` does
   * it, since a fixture may hold no cartridge bytes.
   */
  const scriptOf = (calls: readonly (readonly [number, readonly number[]])[]): Script => {
    const BASE = 0x100
    const code: [number, number, number][] = []
    const push = (n: number): void => {
      code.push([OP.PUSH, PUSH_INT, n >>> 0])
    }
    for (const [fn, args] of calls) {
      // The cartridge writes an engine number as a sum of its hundreds and the rest.
      push(Math.floor(fn / 100) * 100)
      push(fn % 100)
      code.push([OP.ADD, 0, 0])
      for (const arg of args) {
        if (Number.isInteger(arg)) push(arg)
        else {
          const view = new DataView(new ArrayBuffer(4))
          view.setFloat32(0, arg, true)
          code.push([OP.PUSH, PUSH_FLOAT, view.getUint32(0, true)])
        }
      }
      code.push([OP.INVOKE, args.length + 1, 0])
    }
    code.push([OP.RETURN, 0, 0])
    const routine: ScriptRoutine = {
      at: BASE,
      unknown_0x04: 0,
      locals: 0,
      params: 0,
      unknown_0x10: [],
      code: code.map(([op, a, b], i) => ({ at: BASE + 0x38 + i * 12, op, a, b })),
    }
    return {
      sharedSize: 0,
      base: BASE,
      unknown_0x18: 0,
      sections: [{ id: 100, routine }],
      routineAt: () => routine,
      stringAt: () => new Uint8Array(),
    }
  }

  it('runs on into the script 538 named, keeping the stage', () => {
    const second = scriptOf([[208, [0, 0, 1.25, 0]]])
    const first = scriptOf([
      [206, [0, 5, 0, 0]],
      [538, [77]],
    ])
    const asked: number[] = []
    const player = new EventPlayer(first, 1, undefined, (id) => {
      asked.push(id)
      return id === 77 ? second : undefined
    })
    for (let i = 0; i < 40 && player.tick(); i++);
    expect(asked).toEqual([77])
    expect(player.chain).toEqual([77])
    // The stage carried over: where the first script put the Hero, and the
    // facing the second gave them.
    expect(player.stage.actors.get(0)?.x).toBe(5)
    expect(player.stage.actors.get(0)?.facing).toBeCloseTo(1.25, 6)
  })

  it('ends the scene when nothing can be loaded, or the chain is 0', () => {
    const player = new EventPlayer(scriptOf([[538, [77]]]), 1)
    for (let i = 0; i < 40 && player.tick(); i++);
    expect(player.finished).toBe(true)
    expect(player.chain).toEqual([])
    // A chain of 0 is the game's own "none" — the field is cleared to it.
    const zero = new EventPlayer(scriptOf([[538, [0]]]), 1, undefined, () => scriptOf([]))
    for (let i = 0; i < 40 && zero.tick(); i++);
    expect(zero.chain).toEqual([])
  })

  it('answers the second script a trigger carried, and moves it — 834, 810', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(834, [ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.queuedScript = 91
    // A 1 or 0, not the id.
    stage.host.call(834, [ref(2)], t)
    expect(written.get(2)).toBe(1)
    stage.host.call(810, [], t)
    expect(stage.nextScript).toBe(91)
    expect(stage.queuedScript).toBeUndefined()
  })
})

describe('sprites on the map, and the rest of the cluster', () => {
  it('hands back the first free slot of the 32 — 521, 522', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(521, ['dq_kaidan', ref(1)], t)
    expect(written.get(1)).toBe(0)
    expect(stage.sprites.get(0)).toEqual({
      file: 'data/ani/dq_kaidan.spr',
      allocator: 0,
      // 27 by default, which is the partition 502 and 503 bracket.
      partition: 27,
    })
    stage.host.call(521, ['other.spr', ref(2), 1, 9], t)
    expect(written.get(2)).toBe(1)
    // The suffix is added only where the name has not got one.
    expect(stage.sprites.get(1)?.file).toBe('data/ani/other.spr')
    expect(stage.sprites.get(1)?.partition).toBe(9)
    // Freeing the first leaves it the first free again.
    stage.host.call(522, [0], t)
    stage.host.call(521, ['third', ref(3)], t)
    expect(written.get(3)).toBe(0)
  })

  it('refuses a slot past the 32, and one with nothing in it — 522', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.host.call(522, [32], t)).toBe(0)
    expect(stage.host.call(522, [5], t)).toBe(0)
  })

  it('copies a model into another slot — 228', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(233, ['m001', -1], t)
    expect(stage.host.call(228, [-1, -2], t)).toBe(1)
    expect(stage.monsters.get(0xa1)).toBe('m001')
    // Nothing in the slot to copy.
    expect(stage.host.call(228, [-9, -3], t)).toBe(0)
  })

  it('stops the music and puts the volume back — 738', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(713, [4], t)
    stage.volume = 20
    stage.host.call(738, [], t)
    expect(stage.sounds).toEqual([{ kind: 'stopMusic', index: 0, frames: 0 }])
    expect(stage.musicArmed).toBeUndefined()
    expect(stage.volume).toBe(127)
  })
})

describe('the 500s tail, and the day’s own clock', () => {
  it('eases the field of view over a count, and 0 sets it — 580, 532', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(532, [15], t)
    stage.host.call(580, [25, 10], t)
    for (let i = 0; i < 5; i++) stage.advance()
    const half = (fovOfHalfDegrees(15) + fovOfHalfDegrees(25)) / 2
    expect(stage.fov).toBeCloseTo(half, 9)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.fov).toBe(fovOfHalfDegrees(25))
    // A count of nothing sets it there and then, as 532 does.
    stage.host.call(580, [15, 0], t)
    expect(stage.fov).toBe(fovOfHalfDegrees(15))
  })

  it('reads a flag raw where 603 displaces it — 600, 603', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    // Below 0x400 the two agree.
    stage.flags.add(0x100)
    stage.host.call(600, [0x100, ref(1)], t)
    stage.host.call(603, [0x100, ref(2)], t)
    expect([written.get(1), written.get(2)]).toEqual([1, 1])
    // Above it they part: 603 shifts by 1,786 bits, 600 does not.
    stage.flags.add(0x500)
    stage.host.call(600, [0x500, ref(3)], t)
    stage.host.call(603, [0x500, ref(4)], t)
    expect([written.get(3), written.get(4)]).toEqual([1, 0])
    stage.flags.add(storyBit(0x500))
    stage.host.call(603, [0x500, ref(5)], t)
    expect(written.get(5)).toBe(1)
  })

  it('switches a raw mask on a model’s flag word — 509', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(509, [-1, 0x10001, 1], t)
    expect(stage.objectFlags.get(0xa0)).toBe(0x10001)
    stage.host.call(509, [-1, 1, 0], t)
    expect(stage.objectFlags.get(0xa0)).toBe(0x10000)
  })

  it('shows what a character holds, and mounts it — 550, 556', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.actor(1).holdingShown).toBe(true)
    stage.host.call(550, [1, 0], t)
    expect(stage.actor(1).holdingShown).toBe(false)
    stage.host.call(556, [1, 1], t)
    expect(stage.actor(1).weaponDrawn).toBe(true)
  })

  it('stops the day clock on anything but 0 — 579', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.dayClockRunning).toBe(true)
    stage.host.call(579, [1], t)
    expect(stage.dayClockRunning).toBe(false)
    stage.host.call(579, [0], t)
    expect(stage.dayClockRunning).toBe(true)
  })

  it('pins the lighting, and asks for it again — 588, 589, 548, 549', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(588, [2], t)
    expect(stage.timeOfDay).toBe(2)
    expect(stage.relight).toBe(true)
    stage.relight = false
    stage.host.call(589, [], t)
    expect(stage.relight).toBe(true)
    stage.host.call(548, [4], t)
    expect(stage.lightingOverride).toBe(4)
    // 549 reads its one argument and throws it away.
    stage.host.call(549, [9], t)
    expect(stage.lightingOverride).toBe(0)
  })

  it('sets and eases how far a character reaches — 226, 227', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.actor(1).radius).toBe(1)
    stage.host.call(226, [1, 2.5], t)
    expect(stage.actor(1).radius).toBe(2.5)
    stage.host.call(227, [1, 0.5, 10], t)
    for (let i = 0; i < 5; i++) stage.advance()
    expect(stage.actor(1).radius).toBeCloseTo(1.5, 9)
    // A count of nothing writes nothing at all, which is the game's own.
    stage.host.call(227, [1, 9, 0], t)
    expect(stage.actor(1).radius).toBeCloseTo(1.5, 9)
  })

  it('answers the leader, the staff roll and the byte nobody reads — 598, 838, 559', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(598, [ref(1)], t)
    stage.host.call(838, [ref(2)], t)
    expect([written.get(1), written.get(2)]).toEqual([0, 0])
    stage.host.call(559, [7], t)
    expect(stage.unreadByte_0x490).toBe(7)
    expect([...stage.unhandled.keys()]).toEqual([])
  })
})

describe('the lowest ten numbers, which are the player’s own input', () => {
  it('counts the four face buttons held — 0', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(0, [ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.held = 0x0001 | 0x0800
    stage.host.call(0, [ref(2)], t)
    expect(written.get(2)).toBe(2)
    stage.held = 0xffff
    stage.host.call(0, [ref(3)], t)
    // Only the four it tests, not every bit set.
    expect(written.get(3)).toBe(FACE_BUTTONS.length)
  })

  it('answers whether a mask was newly pressed — 1', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.held = 0x0001
    stage.host.call(1, [0x0001, ref(1)], t)
    // Held is not pressed.
    expect(written.get(1)).toBe(0)
    stage.pressed = 0x0001
    stage.host.call(1, [0x0001, ref(2)], t)
    stage.host.call(1, [0x0002, ref(3)], t)
    expect([written.get(2), written.get(3)]).toEqual([1, 0])
  })

  it('draws a number between two bounds, both ends in — 7', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    // The default draws nothing, so a roll is its low bound.
    stage.host.call(7, [3, 8, ref(1)], t)
    expect(written.get(1)).toBe(3)
    // The span handed to the generator covers both ends: high - low + 1.
    const spans: number[] = []
    stage.random = (span) => {
      spans.push(span)
      return span - 1
    }
    stage.host.call(7, [3, 8, ref(2)], t)
    expect(spans).toEqual([6])
    expect(written.get(2)).toBe(8)
  })

  it('leaves a scene waiting on a press waiting, as the game does — 0, 2', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(2, [ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.touching = true
    stage.host.call(2, [ref(2)], t)
    expect(written.get(2)).toBe(1)
    // None of them is counted as unread.
    expect([...stage.unhandled.keys()]).toEqual([])
  })
})

describe('the last of the 200s and 300s', () => {
  it('walks a character over the ground, and puts them there at once — 232, 231', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // The floor, which the stage has to be told: a step at x = 5.
    stage.groundAt = (x) => (x < 5 ? 0 : 3)
    stage.host.call(206, [0, 0, 0, 0], t)
    stage.host.call(232, [0, 10, 4, 10], t)
    for (let i = 0; i < 4; i++) stage.advance()
    const actor = stage.actors.get(0)
    expect(actor?.x).toBeCloseTo(4, 6)
    expect(actor?.y).toBe(0)
    for (let i = 0; i < 2; i++) stage.advance()
    // Over the step, and the height came from the floor rather than the start.
    expect(actor?.y).toBe(3)
    // 231 is the same at once, with no count at all.
    stage.host.call(231, [0, 0, 0], t)
    expect([actor?.x, actor?.y, actor?.z]).toEqual([0, 0, 0])
  })

  it('answers whether a cast member is still moving — 234', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(206, [1, 0, 0, 0], t)
    stage.host.call(234, [1, ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.host.call(207, [1, 10, 0, 0, 10], t)
    stage.host.call(234, [1, ref(2)], t)
    expect(written.get(2)).toBe(1)
  })

  it('shows a placed thing, and hangs a model on one — 223, 239, 240', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(223, [4, 0], t)
    expect(stage.placedShown.get(4)).toBe(false)
    stage.host.call(239, [4, 9], t)
    expect(stage.hungOnPlacement.get(4)).toBe(9)
    stage.host.call(240, [4], t)
    expect(stage.hungOnPlacement.has(4)).toBe(false)
  })

  it('follows a character with the camera until it is told not to — 324, 325', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(303, [0, 0, 0], t)
    stage.host.call(310, [0, 1, 10], t)
    stage.host.call(206, [2, 5, 1, 7], t)
    stage.host.call(324, [2, 0, 2, 0], t)
    stage.advance()
    expect(stage.camera?.target).toEqual([5, 3, 7])
    // It keeps following, frame after frame, until 325.
    stage.host.call(206, [2, 8, 1, 7], t)
    stage.advance()
    expect(stage.camera?.target?.[0]).toBe(8)
    stage.host.call(325, [], t)
    stage.host.call(206, [2, 0, 1, 0], t)
    stage.advance()
    expect(stage.camera?.target?.[0]).toBe(8)
  })

  it('shakes about a fixed eye where 317 moves it — 326', () => {
    const eyeOf = (stage: EventStage) => {
      const shot = stage.camera
      if (!shot?.target) return [0, 0, 0]
      const flat = Math.sqrt(Math.max(0, shot.distance ** 2 - shot.rise ** 2))
      return [
        shot.target[0] + Math.sin(shot.yaw) * flat,
        shot.target[1] + shot.rise,
        shot.target[2] + Math.cos(shot.yaw) * flat,
      ]
    }
    const shaken = (id: number) => {
      const stage = new EventStage(1)
      const { thread: t } = thread()
      stage.host.call(303, [0, 0, 0], t)
      stage.host.call(310, [0, 0, 10], t)
      const before = eyeOf(stage)
      stage.host.call(id, [1, 0, 0, 12], t)
      stage.advance()
      return { before, after: eyeOf(stage), target: stage.camera?.target }
    }
    // 317 moves the view without turning it: the eye goes with the look-at.
    const slid = shaken(317)
    expect(slid.target?.[0]).toBeCloseTo(1, 6)
    expect(slid.after[0] as number).toBeCloseTo((slid.before[0] as number) + 1, 6)
    // 326 turns it about where the camera stands: the eye does not move.
    const turned = shaken(326)
    expect(turned.target?.[0]).toBeCloseTo(1, 6)
    expect(turned.after[0] as number).toBeCloseTo(turned.before[0] as number, 6)
    expect(turned.after[2] as number).toBeCloseTo(turned.before[2] as number, 6)
  })
})

describe('the last of the 500s and 700s', () => {
  it('reads five switches the other way up — 536, 581, 833, 591, 735', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    // A 0 switches each one on; anything else switches it off.
    stage.host.call(591, [0], t)
    stage.host.call(735, [0], t)
    expect([stage.zoneBit, stage.musicGated]).toEqual([true, true])
    stage.host.call(591, [1], t)
    stage.host.call(735, [1], t)
    expect([stage.zoneBit, stage.musicGated]).toEqual([false, false])
  })

  it('plays the zone’s own tune, unless it is gated off — 736, 735', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(735, [0], t)
    stage.host.call(736, [], t)
    expect(stage.sounds).toEqual([])
    stage.host.call(735, [1], t)
    stage.host.call(736, [], t)
    expect(stage.sounds).toEqual([{ kind: 'zoneMusic', index: 0 }])
  })

  it('tears the player down and starts on the second slot — 737', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.volume = 5
    stage.host.call(737, [42], t)
    expect(stage.sounds).toEqual([
      { kind: 'stopMusic', index: 0, frames: 0 },
      { kind: 'jingle', index: 42 },
    ])
    expect(stage.volume).toBe(127)
  })

  it('takes a third bone and the object it drags — 552', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.host.call(552, [-1, 'a', 'b', 'c', -2], t)
    expect(stage.boneCamera).toEqual({
      placement: 0xa0,
      eye: 'a',
      at: 'b',
      third: 'c',
      drags: 0xa1,
    })
    // 531 gives it back, as it does 572's.
    stage.host.call(531, [], t)
    expect(stage.boneCamera).toBeUndefined()
  })

  it('reads a bit of the record in hand — 601, 602', () => {
    const stage = new EventStage(1)
    const { written, thread: t } = thread()
    stage.host.call(602, [7, ref(1)], t)
    expect(written.get(1)).toBe(0)
    stage.recordBits.add('0:b:7')
    stage.host.call(602, [7, ref(2)], t)
    // The two fields of a record are kept apart, and so are the five records.
    stage.host.call(601, [7, ref(3)], t)
    stage.record = 1
    stage.host.call(602, [7, ref(4)], t)
    expect([written.get(2), written.get(3), written.get(4)]).toEqual([1, 0, 0])
  })

  it('gates the zone’s two extra passes, and the rest — 599, 805, 557, 583', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    expect(stage.zonePasses).toEqual([1, 1])
    stage.host.call(599, [0], t)
    stage.host.call(805, [2], t)
    expect(stage.zonePasses).toEqual([0, 2])
    stage.riding = true
    stage.host.call(557, [], t)
    expect(stage.riding).toBe(false)
    stage.host.call(583, [0x10c], t)
    // The byte is masked, as the handler masks it.
    expect(stage.fieldEntry).toBe(0x0c)
  })
})
