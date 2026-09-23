import type { ScriptRef, ScriptThread, ScriptValue } from '@minstrel/script'
import { describe, expect, it } from 'vitest'
import { EventStage, sceneMotion } from '../src/event.ts'

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
    // 599 is not read; 731 was, and is the sound archives being given back.
    expect(stage.host.call(599, [], t)).toBe(0)
    stage.host.call(599, [], t)
    expect(stage.unhandled.get(599)).toBe(2)
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
    expect(stage.host.call(713, [7, 1.5, 'hello'], t)).toBe(0)
    stage.host.call(713, [9], t)
    const call = stage.unreadCalls.get(713)
    expect(call?.calls).toBe(2)
    // The signatures are `docs/event-scripts.md`'s: integer, float, string.
    expect([...(call?.shapes ?? [])].sort()).toEqual(['i', 'ifs'])
    expect(call?.examples[0]).toEqual([7, 1.5, 'hello'])
    // The count it kept before stands beside it, for whatever reads that.
    expect(stage.unhandled.get(713)).toBe(2)
  })

  it('keeps a few argument lists and no more, however often it is called', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    for (let i = 0; i < 50; i++) stage.host.call(713, [i], t)
    const call = stage.unreadCalls.get(713)
    expect(call?.calls).toBe(50)
    expect(call?.examples.length).toBeLessThanOrEqual(4)
  })

  it('says so the first time, and only the first time', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    const said: number[] = []
    stage.onUnread = (call) => said.push(call.fn)
    stage.host.call(713, [1], t)
    stage.host.call(713, [2], t)
    stage.host.call(714, [], t)
    expect(said).toEqual([713, 714])
  })

  it('stops the run instead, where the run is there to find them', () => {
    const stage = new EventStage(1)
    const { thread: t } = thread()
    stage.strict = true
    expect(() => stage.host.call(713, [7], t)).toThrow(/engine function 713 is not read/)
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
    // 15 is what 1,668 of its 2,477 calls pass: a vertical field of 30°.
    stage.host.call(532, [15], t)
    expect((stage.fov ?? 0) * (180 / Math.PI)).toBeCloseTo(30, 6)
    // It takes a float as readily as an integer.
    stage.host.call(532, [12.5], t)
    expect((stage.fov ?? 0) * (180 / Math.PI)).toBeCloseTo(25, 6)
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
    expect([...stage.placementsHidden]).toEqual(['3,7'])
    // Anything but zero shows it: the flag bit is cleared, not set.
    stage.host.call(574, [3, 7, 2], t)
    expect([...stage.placementsHidden]).toEqual([])
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
