import { readFileSync } from 'node:fs'
import { WORLD_SCALE } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { actorLookOf, packMotions } from '../src/actors.ts'
import { EventPlayer } from '../src/event.ts'
import { load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM
/** Erinn's morning, which a new game opens on. */
const MORNING = 2130

describe.skipIf(!romPath)('the morning, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('plays to its end, a message at a time, and leaves the Hero up and out of bed', () => {
    const here = load(rom, { map: 'M01M10' })
    const script = here.eventScript(MORNING)
    if (!script) throw new Error('no script for the morning')
    const player = new EventPlayer(script, WORLD_SCALE)
    let frames = 0
    while (player.tick() && frames < 5000) {
      frames++
      if (player.stage.message !== undefined) player.dismiss()
    }
    expect(player.finished).toBe(true)
    // Every message it shows is one of its own, each once.
    const own = new Set(here.eventMessages(MORNING).map((m) => m.id))
    expect(player.stage.shown.length).toBeGreaterThan(0)
    expect(player.stage.shown.every((id) => own.has(id))).toBe(true)
    expect(new Set(player.stage.shown).size).toBe(player.stage.shown.length)
    // The Hero is set down off the bed, lower than they lay.
    const hero = player.stage.actors.get(0)
    if (!hero) throw new Error('no Hero')
    expect(hero.y).toBeLessThan(0.05)
    expect(player.stage.camera?.target).toBeDefined()
  })

  it('reads the look of everyone the morning names, with the motions it plays', () => {
    const here = load(rom, { map: 'M01M10' })
    const script = here.eventScript(MORNING)
    if (!script) throw new Error('no script for the morning')
    const player = new EventPlayer(script, WORLD_SCALE)
    const played = new Map<number, Set<string>>()
    for (let frames = 0; player.tick() && frames < 5000; frames++) {
      if (player.stage.message !== undefined) player.dismiss()
      for (const [id, actor] of player.stage.actors) {
        if (actor.motion) played.set(id, (played.get(id) ?? new Set()).add(actor.motion))
      }
    }
    for (const [id, actor] of player.stage.actors) {
      const motions = played.get(id) ?? new Set()
      if (id === 0) {
        // The Hero's motions come from their packs, or are the figure's own.
        const packed = actor.packs.flatMap((pack) => [...packMotions(rom, pack).keys()])
        const figure = [...here.figure.motions.keys()]
        for (const motion of motions) expect([...packed, ...figure], motion).toContain(motion)
        continue
      }
      if (!actor.model) throw new Error(`character ${id} has no model`)
      const look = actorLookOf(rom, actor.model, actor.packs)
      expect(look, actor.model).toBeDefined()
      for (const motion of motions) expect(look?.motions.has(motion), motion).toBe(true)
    }
  })
})
