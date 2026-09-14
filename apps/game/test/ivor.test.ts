import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { type AttendingCharacter, readAttendingCharacters } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('Ivor, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('is an attending character with his own model, a copper sword and a pot lid', () => {
    const byLanguage = new Map<string, AttendingCharacter[]>()
    const models = new Set<string>()
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/bin/attnpc.gp2' })) {
      const language = /attnpc_(\w+)\.bin$/.exec(leaf.path)?.[1]
      if (language) byLanguage.set(language, readAttendingCharacters(leaf.bytes))
    }
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/chara_sub/s017' })) {
      models.add(leaf.path.slice('/data/chara_sub/'.length).split('/')[0] as string)
    }

    const english = byLanguage.get('en') ?? []
    expect(english.map((c) => c.name)).toEqual([
      'Aquila',
      'Ivor',
      'Dr Phlegming',
      'Sterling',
      'Erinn',
    ])
    const ivor = english.find((c) => c.name === 'Ivor')
    expect(ivor).toMatchObject({ id: 2, model: 17, level: 3, weapon: 20004, shield: 21296 })
    expect(ivor?.numbers).toMatchObject({ magicalMight: 0, magicalMending: 0, maxHp: 25, maxMp: 0 })

    // Every language agrees on everything but the names.
    const unnamed = (list: AttendingCharacter[]) => list.map(({ name: _, ...rest }) => rest)
    for (const [language, list] of byLanguage) {
      expect(unnamed(list), language).toEqual(unnamed(english))
    }

    // His model is on the cartridge, and so are the packs he fights with.
    for (const pack of ['s017.chr', 's017b.chr', 's017be.chr']) expect(models).toContain(pack)
  })
})
