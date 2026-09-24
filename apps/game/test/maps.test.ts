import { readFileSync } from 'node:fs'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { beforeAll, describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Every map the cartridge has, through the game's own loader.**
 *
 * `cartridge.test.ts` already reads every manifest, every collision mesh and
 * every model, out of the packages. This is a different question: does
 * `apps/game`'s `load` — which assembles a map a player could stand in, with
 * its cast, its doorways and its treasure — come back with something usable
 * for each of them?
 *
 * The distinction is not academic. `O00`'s manifest reads, its models read,
 * and it is unplayable: it has no collision, so there is nowhere to put the
 * Hero, and the game stops on its title card. That was found by looking at
 * thirteen areas by hand on 24 September 2026 — a tenth of the cartridge,
 * found by luck. This is the whole of it, in one run, and it is the phase's
 * "the loader against all 669 maps headlessly".
 *
 * It is a measurement as much as a test. The assertions pin what is known so
 * that a regression shows up as a bigger number; the table is what the work is
 * read from.
 *
 * It lives here rather than in `tools/harness` because it exercises the
 * **game's** loader: pulling `apps/game/src/load.ts` into the root project
 * drags `packages/gl` in behind it, which needs the DOM types the root config
 * deliberately has not got. Beside `event-coverage.test.ts`, which measures
 * the same app the same way, it typechecks under the game's own config.
 *
 * Local-only: skipped without a dump.
 */
describe.skipIf(!romPath)('every map, through the game’s own loader', () => {
  /** What one map came to. */
  interface Opened {
    readonly code: string
    /** The message, where it would not read at all. */
    readonly threw?: string
    /** Whether it has collision — without it there is nowhere to stand. */
    readonly world: boolean
    readonly pieces: number
    readonly meshes: number
    /** Resources its manifest names that the archive holds no readable file for. */
    readonly missing: number
    readonly doorways: number
    /** Where its doorways lead, so that what leads *here* can be worked out. */
    readonly doorwayCodes: readonly string[]
    /** Doorways naming a map this cartridge has no archive for. */
    readonly danglingDoors: readonly string[]
    readonly cast: number
    readonly treasures: number
    /** The map index's name for it, or undefined where the index has no entry. */
    readonly region: string | undefined
    readonly triggers: number
  }

  /**
   * **A map with no collision is not necessarily a fault**, and the question is
   * which ones a player could ever be standing in.
   *
   * The first version of this asked whether the map had triggers, doorways, a
   * cast or a named region. Three of those four are properties of the **area**,
   * not the map: every map in Wormwood Creek reports the area's 139 triggers,
   * and `F34M01` reports the same two exits `F34` does. So it counted twelve
   * "places the story visits", and most of that was the area showing through.
   *
   * **What a map cannot inherit is something leading to it.** `M12` has eight
   * doorways into it, `C02` nine, `M01` nine; of the eleven that survived the
   * old heuristic, **nothing on the cartridge leads to any of them**. That is
   * the test — a map nothing opens onto is not somewhere a player walks into,
   * whether or not it has collision.
   */
  const isPlace = (m: Opened) => (leadsTo.get(m.code)?.length ?? 0) > 0
  /** Each map, and the maps whose doorways open onto it — built from the same walk. */
  const leadsTo = new Map<string, string[]>()

  let opened: Opened[] = []
  let codes: string[] = []

  // The sweep is 669 loads at about 80 ms each — near a minute, where a hook
  // is allowed ten seconds by default.
  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const fs = readNitroFs(rom)
    // A map is an `.amdj` archive under `/data/map`; its stem is the code the
    // rest of the game names it by, and the code a doorway leads to.
    const archives = new Set<string>()
    for (const file of walkFiles(fs.root)) {
      const named = /\/data\/map\/([A-Za-z0-9_]+)\.amdj$/i.exec(file.path)
      if (named) archives.add((named[1] as string).toUpperCase())
    }
    codes = [...archives].sort()
    /**
     * **A code is not an archive stem.** `O00` is held in `O00a.amdj`, and the
     * loader finds it by matching the start of the name — so a doorway naming
     * `O00` is perfectly good. Comparing stems outright called six such doors
     * dangling on the first run of this sweep.
     */
    const resolves = (code: string) =>
      archives.has(code) || [...archives].some((stem) => stem.startsWith(code))

    opened = codes.map((code) => {
      try {
        const map = load(rom, { map: code })
        const doorways = map.doorways.map((door) => door.to.toUpperCase())
        return {
          code,
          world: map.world !== undefined,
          pieces: map.map.pieces.length,
          meshes: map.map.meshes.length,
          missing: map.map.missing.length,
          doorways: doorways.length,
          doorwayCodes: doorways,
          danglingDoors: doorways.filter((to) => !resolves(to)),
          cast: map.cast.members.length + map.cast.sprites2d.length,
          treasures: map.treasures.length,
          region: map.region,
          triggers: map.triggers.length,
        }
      } catch (error) {
        return {
          code,
          threw: error instanceof Error ? error.message : String(error),
          world: false,
          pieces: 0,
          meshes: 0,
          missing: 0,
          doorways: 0,
          doorwayCodes: [],
          danglingDoors: [],
          cast: 0,
          treasures: 0,
          region: undefined,
          triggers: 0,
        }
      }
    })

    for (const m of opened) {
      for (const to of m.doorwayCodes) leadsTo.set(to, [...(leadsTo.get(to) ?? []), m.code])
    }

    const threw = opened.filter((m) => m.threw)
    const standless = opened.filter((m) => !m.threw && !m.world)
    const dangling = opened.filter((m) => m.danglingDoors.length > 0)
    const missing = opened.filter((m) => m.missing > 0)
    console.log(`${opened.length} map archives, through the game's own loader`)
    console.log(`  ${threw.length} would not read`)
    for (const m of threw.slice(0, 12)) console.log(`    ${m.code}: ${m.threw}`)
    // Grouped by the letter a map's code begins with, because the answer is
    // lopsided: one family is most of it, and the handful outside that family
    // is the part worth a person's time.
    const byFamily = new Map<string, string[]>()
    for (const m of standless) {
      const family = (m.code.match(/^[A-Z]+/)?.[0] ?? '?') as string
      byFamily.set(family, [...(byFamily.get(family) ?? []), m.code])
    }
    console.log(`  ${standless.length} read but have nowhere to stand:`)
    for (const [family, list] of [...byFamily].sort((a, b) => b[1].length - a[1].length)) {
      const all = codes.filter((c) => c.startsWith(family)).length
      console.log(
        `    ${family}: ${list.length} of the family's ${all}${list.length > 12 ? '' : ` — ${list.join(' ')}`}`,
      )
    }
    const placeless = standless.filter(isPlace)
    console.log(`  ${placeless.length} of those are maps something leads to:`)
    for (const m of placeless) {
      console.log(`    ${m.code} — reached from ${leadsTo.get(m.code)?.join(' ')}`)
    }
    const nowhere = opened.filter((m) => !m.threw && !isPlace(m)).length
    console.log(`  (${nowhere} of all ${opened.length} maps have nothing leading to them)`)
    console.log(`  ${missing.length} name a resource their archive has not got`)
    for (const m of missing.slice(0, 12)) console.log(`    ${m.code}: ${m.missing} missing`)
    console.log(`  ${dangling.length} have a doorway to a map that is not there`)
    for (const m of dangling.slice(0, 12)) {
      console.log(`    ${m.code} → ${m.danglingDoors.join(' ')}`)
    }
  }, 300_000)

  it('finds the cartridge’s map archives', () => {
    expect(codes.length).toBeGreaterThan(600)
  })

  it('opens every one of them', () => {
    const threw = opened.filter((m) => m.threw)
    expect(threw.map((m) => `${m.code}: ${m.threw}`)).toEqual([])
  })

  it('gives all but the known few somewhere to stand', () => {
    // **Without collision the game cannot place the Hero**, so the map never
    // comes up — `main.ts` stops and says so. The `O` family is the only one
    // that does this, and whether those maps are meant to be walked at all is
    // an open question: see `docs/still-open.md`.
    const standless = opened.filter((m) => !m.threw && !m.world).map((m) => m.code)
    // **174 of the 197 are the `B` family**, which has no triggers, no area
    // and never appears as a doorway's destination — consistent with the
    // grotto floors, which the game assembles at runtime and which are out of
    // the slice. They are counted, not listed.
    expect(standless.filter((c) => c.startsWith('B')).length).toBe(174)
    // The rest are the ones worth a person's time, and they are pinned by name
    // so that one more showing up is visible.
    // **Every map a doorway opens onto has somewhere to stand.** Of the 196
    // without collision, not one is ever led to — and 237 of all 669 maps have
    // nothing leading to them, which is what a cartridge full of assembled
    // pieces looks like. This is the assertion that would catch another `M12`.
    const reachableAndStandless = opened
      .filter((m) => !m.threw && !m.world && isPlace(m))
      .map((m) => m.code)
    expect(reachableAndStandless).toEqual([])

    // The same question from the other side: no map with a cast of its own is
    // left without collision. `M12`, Wormwood Creek, was the one that was, and
    // it was a fault here rather than in the cartridge.
    const withOwnPeople = opened.filter((m) => !m.threw && !m.world && m.cast > 0)
    expect(withOwnPeople.map((m) => m.code)).toEqual([])

    expect(standless.filter((c) => !c.startsWith('B'))).toEqual([
      'C04M10',
      'D17M07',
      'E01M01',
      'E01M02',
      'E01M03',
      'E01M05',
      'E01M06',
      'E01M07',
      'E01M08',
      'E01M10',
      'E01M11',
      'F01M02',
      'F10M01',
      'F34M01',
      'M12M10',
      'M12M11',
      'M13M99',
      'O00A',
      'O01A',
      'X01',
      'X04M25',
      'X05',
    ])
  })

  it('names no resource its archive has not got', () => {
    const missing = opened.filter((m) => m.missing > 0).map((m) => `${m.code}×${m.missing}`)
    expect(missing).toEqual([])
  })

  it('has no doorway onto a map that is not there', () => {
    // A doorway names its destination by code. One naming a map the cartridge
    // has no archive for would throw the player out of the map they are in.
    // **One on the whole cartridge**, and it is the game's own: `M07` has a
    // door to `M07M07`, for which there is no archive. Walking into it would
    // be refused and leave the player where they were — `enter` keeps the map
    // it has when a new one will not read — so it is a dead door, not a crash.
    const dangling = opened.filter((m) => m.danglingDoors.length > 0)
    expect(dangling.map((m) => `${m.code} → ${m.danglingDoors.join(' ')}`)).toEqual([
      'M07 → M07M07',
    ])
  })
})
