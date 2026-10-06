import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { readScript, type Script, type ScriptRoutine } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { type AccoladeFacts, awardsOf, candidatesOf, TITLE_SCRIPTS } from '../src/accolades.ts'

const romPath = process.env.MINSTREL_TEST_ROM

type Op = [op: number, a: number, b: number]

/**
 * A script by hand: section 100 and its candidates' routines, laid out from
 * address 0 a routine at a time, as the reader would hand them over.
 */
function scriptOf(section: Op[], routines: Op[][]): Script {
  const base = 0
  const made = new Map<number, ScriptRoutine>()
  let at = 0
  const place = (code: Op[], params: number, locals: number): ScriptRoutine => {
    const routine: ScriptRoutine = {
      at,
      unknown_0x04: 0,
      locals,
      params,
      unknown_0x10: [],
      code: code.map(([op, a, b], i) => ({ at: at + 0x38 + i * 12, op, a, b })),
    }
    made.set(at, routine)
    at += 0x38 + code.length * 12
    return routine
  }
  for (const code of routines) place(code, 1, 2)
  const main = place(section, 0, 1)
  return {
    sharedSize: 0,
    base,
    unknown_0x18: 0,
    sections: [{ id: 100, routine: main }],
    routineAt: (address) => made.get(base + address) as ScriptRoutine,
    stringAt: () => new Uint8Array(),
  }
}

/** A candidate's routine: "has accolade id?" (1); if not, ask the Hero's level (101) and return 1. */
const levelRoutine = (id: number, at: number): Op[] => [
  [3, 1, 1],
  [3, 1, id],
  [2, 0, 1],
  [0x15, 3, 0],
  [1, 0, 1],
  [3, 1, 0],
  [0x0e, 40, 0],
  [0x11, at + 0x38 + 15 * 12, 0],
  [3, 1, 101],
  [3, 1, -1 >>> 0],
  [2, 1, 1],
  [2, 0, 1],
  [0x15, 4, 0],
  [3, 1, 1],
  [0x0f, 0, 0],
  // Past the early return, where the jump lands.
  [3, 1, 0],
  [0x0f, 0, 0],
]

const facts = (level: number, earned: number[] = []): AccoladeFacts => ({
  earned: new Set(earned),
  vocation: 1,
  levelIn: () => level,
  sex: 0,
  treePoints: () => 0,
})

describe('the accolade scripts, run as the game runs them', () => {
  // Two candidates; the section awards each due, and stops after the first when `stop`.
  const section = (stop: boolean, secondAt = 0x38 + 17 * 12): Op[] => [
    [0x13, 0, 0],
    [3, 1, 1],
    [0x0e, 40, 0],
    [0x11, 9999, 0],
    [3, 1, 0],
    [3, 1, 89],
    [0x15, 2, 0],
    ...(stop ? ([[3, 1, 1]] as Op[]) : []),
    ...(stop ? ([[0x0f, 0, 0]] as Op[]) : []),
    [0x13, 0, secondAt],
    [3, 1, 0],
    [3, 1, 90],
    [0x15, 2, 0],
    [3, 1, 0],
    [0x0f, 0, 0],
  ]
  const second = 0x38 + 17 * 12

  it('reads the candidates out of section 100, and which end the section', () => {
    const script = scriptOf(section(true), [levelRoutine(89, 0), levelRoutine(90, second)])
    expect(candidatesOf(script)).toEqual([
      { routine: 0, id: 89, last: true },
      { routine: second, id: 90, last: false },
    ])
  })

  it('awards each candidate due, none already earned, and the first only where the section stops', () => {
    const all = scriptOf(section(false), [levelRoutine(89, 0), levelRoutine(90, second)])
    // The routines here test "not earned", then return 1 from the early return.
    expect(awardsOf(all, facts(99))).toEqual([89, 90])
    expect(awardsOf(all, facts(99, [89]))).toEqual([90])
    const first = scriptOf(section(true), [levelRoutine(89, 0), levelRoutine(90, second)])
    expect(awardsOf(first, facts(99))).toEqual([89])
  })

  it('gives nothing a routine asks a function not modelled for', () => {
    const asks: Op[] = [
      [3, 1, 999],
      [0x15, 1, 0],
      [3, 1, 1],
      [0x0f, 0, 0],
    ]
    expect(awardsOf(scriptOf(section(false, 0x38 + 4 * 12), [asks, asks]), facts(99))).toEqual([])
  })
})

describe.skipIf(!romPath)('the accolade scripts on the cartridge', () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const scripts = new Map<string, Script>()
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/scenario/title_' })) {
    for (const [which, path] of Object.entries(TITLE_SCRIPTS))
      if (leaf.path === path) scripts.set(which, readScript(leaf.bytes))
  }
  const hero = (vocation: number, level: number, sword: number, earned: number[] = []) => ({
    earned: new Set(earned),
    vocation,
    levelIn: () => level,
    sex: 0,
    treePoints: (tree: number) => (tree === 1 ? sword : 0),
  })

  it('has every candidate the four name: 21, 260, 32 and 123', () => {
    const count = (which: string) => candidatesOf(scripts.get(which) as Script).length
    expect([count('battle'), count('skills'), count('cleared'), count('records')]).toEqual([
      21, 260, 32, 123,
    ])
  })

  it('gives a level-99 vocation its accolade, and the sword tree its grades', () => {
    const battle = scripts.get('battle') as Script
    const skills = scripts.get('skills') as Script
    // Vocation 1 is 89's, vocation 11 100's (`title_btl`'s routines).
    expect(awardsOf(battle, hero(1, 99, 0))).toEqual([89])
    expect(awardsOf(battle, hero(11, 99, 0))).toEqual([100])
    expect(awardsOf(battle, hero(1, 98, 0))).toEqual([])
    // The sword's first grade at 3 points; at 100, all ten.
    expect(awardsOf(skills, hero(1, 1, 3))).toEqual([121])
    expect(awardsOf(skills, hero(1, 1, 100))).toHaveLength(10)
    expect(awardsOf(skills, hero(1, 1, 3, [121]))).toEqual([])
  })
})
