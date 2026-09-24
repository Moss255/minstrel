import { readFileSync } from 'node:fs'
import { PANELS_A_TREE, readSkillTable, SKILL_TREES } from '@minstrel/game-formats'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The skill table, on a real cartridge.
 *
 * `/data/prm/skilltable.bin` was found on 24 September 2026 by reading the
 * ARM9's per-tag handler table, which sits immediately before the file's own
 * path string. Nothing had read it, so the trees were numbers with no
 * contents and skill points were shown and could not be spent.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed.
 */
const romPath = process.env.MINSTREL_TEST_ROM
const SKILLS = '/data/prm/skilltable.bin'

describe.skipIf(!romPath)('the skill table on a real cartridge', { timeout: 60_000 }, () => {
  it('is twenty-six trees of eleven panels, and one record outside them', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const file = [...walkFiles(fs.root)].find((f) => f.path === SKILLS)
    if (!file) throw new Error(`${SKILLS} is not on this cartridge`)
    const panels = readSkillTable(fs.read(file))

    expect(panels).toHaveLength(SKILL_TREES * PANELS_A_TREE + 1)

    // Eleven to a tree, for all twenty-six, and one belonging to none.
    const byTree = new Map<number, number>()
    for (const panel of panels) byTree.set(panel.tree, (byTree.get(panel.tree) ?? 0) + 1)
    for (let tree = 1; tree <= SKILL_TREES; tree++) {
      expect(byTree.get(tree), `tree ${tree}`).toBe(PANELS_A_TREE)
    }
    expect(byTree.get(0)).toBe(1)

    // Ids are 0 to 286 with none missing and none twice — which is what makes
    // them the join to `sklname` and `sta_skl`.
    expect(new Set(panels.map((p) => p.id)).size).toBe(panels.length)
    expect(Math.min(...panels.map((p) => p.id))).toBe(0)
    expect(Math.max(...panels.map((p) => p.id))).toBe(panels.length - 1)

    // **Each tree's eleventh panel costs nothing**, and the other ten rise.
    // What unlocks the free one is not established; it is not the hundred, as
    // every tree has a hundred-point panel of its own.
    for (let tree = 1; tree <= SKILL_TREES; tree++) {
      const costs = panels
        .filter((p) => p.tree === tree)
        .map((p) => p.cost)
        .sort((a, b) => a - b)
      expect(
        costs.filter((c) => c === 0),
        `tree ${tree} free panels`,
      ).toHaveLength(1)
      expect(costs[10], `tree ${tree} dearest`).toBe(100)
      const paid = costs.slice(1)
      expect(paid, `tree ${tree} rises`).toEqual([...paid].sort((a, b) => a - b))
    }
  })

  /**
   * **The zero is not a price.** Read 24 September 2026, and it settles what
   * `panelsBought` should do with it: in every one of the twenty-six trees the
   * cost-0 panel is the *eleventh*, last in the file's own order and last by
   * the second index `unknown_7`, sitting **after** the hundred-point panel.
   * It is the tree's marquee ability — Sword's Gigagash, Shield's Critical Hit
   * Guard, Courage's Auto Counter — so treating it as free would give a
   * character with no points at all the best thing in the tree.
   *
   * What does unlock it is still not established; this pins the shape that
   * says it is not simply free.
   */
  it('puts the cost-0 panel eleventh in every tree, after the hundred', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const file = [...walkFiles(fs.root)].find((f) => f.path === SKILLS)
    if (!file) throw new Error(`${SKILLS} is not on this cartridge`)
    const panels = readSkillTable(fs.read(file))
    for (let tree = 1; tree <= SKILL_TREES; tree++) {
      const mine = panels.filter((panel) => panel.tree === tree)
      const free = mine.filter((panel) => panel.cost === 0)
      expect(free, `tree ${tree}`).toHaveLength(1)
      expect(mine.at(-1), `tree ${tree} in file order`).toBe(free[0])
      const byIndex = [...mine].sort((a, b) => a.unknown_7 - b.unknown_7)
      expect(byIndex.at(-1), `tree ${tree} by value 7`).toBe(free[0])
      expect(byIndex.at(-2)?.cost, `tree ${tree}'s tenth`).toBe(100)
    }
  })
})
