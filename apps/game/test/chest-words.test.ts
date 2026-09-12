import { readFileSync } from 'node:fs'
import { RANDOM_MONSTER, type Treasure } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { renderLine } from '../src/talk.ts'
import { CHEST_WAS_REALLY, chestMonsterLine, findInside } from '../src/treasure.ts'

describe("a chest that is a monster, in the game's words", () => {
  // Synthetic stand-ins for the system strings: the shape, not the cartridge's text.
  const system = new Map([
    [CHEST_WAS_REALLY, 'Alas, the box was <str_1>!'],
    [46, 'a box<1>s bite'],
    [47, 'an ogre'],
  ])

  it("puts the monster's phrase into the chest's own message", () => {
    expect(chestMonsterLine('box<1>s bite', 38, system)).toBe('Alas, the box was a box’s bite!')
    expect(chestMonsterLine('ogre', 39, system)).toBe('Alas, the box was an ogre!')
  })

  it('falls back to our words when the phrase or the message is missing', () => {
    expect(chestMonsterLine('troll', 40, system)).toBe('The chest was really a monster — troll!')
    expect(chestMonsterLine(undefined, 40, system)).toBe(
      'The chest was really a monster — number 40 in the monster list!',
    )
    expect(chestMonsterLine('ogre', 39, new Map())).toBe('The chest was really a monster — ogre!')
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)("the chest's words on a real cartridge", { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('says every chest monster the chest tables hold in the game’s own message', () => {
    const room = load(rom, { map: 'M01M08' })
    const sentence = room.systemStrings.get(CHEST_WAS_REALLY)
    if (!sentence) throw new Error('no chest message')
    const rows = room.randoms.get('randTBox') ?? []
    const monsters = rows.filter((row) => row.kind === RANDOM_MONSTER)
    expect(monsters.length).toBeGreaterThan(0)
    for (const row of monsters) {
      // A roll that lands on this row: the weights before it in its rank.
      let roll = 0
      for (const other of rows) {
        if (other.rank !== row.rank) continue
        if (other === row) break
        roll += other.weight
      }
      const chest = {
        index: 1,
        unknown_0: row.rank,
        kind: 0x40,
        position: { x: 0, y: 0, z: 0 },
        facing: 0,
        unknown_2: undefined,
        record: {
          tag: 0x67,
          type: 0,
          offset: 0,
          values: new Uint32Array(),
          floats: new Float32Array(),
          kinds: new Uint8Array(),
        },
      } satisfies Treasure
      const found = findInside(
        chest,
        room.randoms,
        room.itemNames,
        roll,
        room.monsterNames,
        room.systemStrings,
      )
      const opening = renderLine(sentence.slice(0, sentence.indexOf('<str_1>'))).pages[0]?.text
      expect(found.text.startsWith(opening ?? '?'), found.text).toBe(true)
      expect(found.text).not.toContain('monster list')
    }
  })
})
