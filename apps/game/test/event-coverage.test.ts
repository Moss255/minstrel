import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import {
  OP_EVENT,
  readScript,
  readTriggers,
  type Script,
  triggerWords,
} from '@minstrel/game-formats'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { beforeAll, describe, expect, it } from 'vitest'
import { EventPlayer } from '../src/event.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * Which engine functions an area's events call that the host has not got.
 *
 * An event script invokes the engine by number. `EventRun` answers the ones it
 * knows and **answers everything else with 0 and counts it** — which is the
 * right thing for a scene that would otherwise stop dead, and the wrong thing
 * to be quiet about: a scene half-plays and nothing says why.
 *
 * So this runs every event an area's triggers can reach and reports what was
 * missing. The report is the worklist: 139 numbers are invoked across the
 * cartridge and about 40 have a reading (`docs/event-scripts.md`), and the ones
 * called most, in the areas that come first, are the ones worth reading out of
 * the decomp next.
 *
 * It is a measurement as much as a test. The assertions pin what is known so
 * that implementing a function shows up as a smaller number and losing one
 * shows up as a larger; the console table is what the work is planned from.
 */
describe.skipIf(!romPath)('what an area needs that the host has not got', () => {
  /** How many frames one event may take before it is called a runaway. */
  const FRAME_CAP = 20_000

  interface AreaReport {
    readonly area: string
    readonly events: number
    readonly missingScripts: number
    readonly runaway: number
    /** Engine function number to how many times it was called unanswered. */
    readonly unhandled: Map<number, number>
  }

  let reports: AreaReport[] = []
  let scriptsByEvent: Map<number, Script>

  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const fs = readNitroFs(rom)

    // The areas' trigger files, straight out of the filesystem.
    const triggerFiles = new Map<string, Uint8Array>()
    for (const file of walkFiles(fs.root)) {
      const trigger = /\/trigger([A-Z]\d\d)\.bin$/i.exec(file.path)
      if (trigger) triggerFiles.set((trigger[1] as string).toUpperCase(), fs.read(file))
    }

    // Every event's script, in one walk of the two folders that hold them.
    // Each lives in its own `ev#####.gp2` beside its text.
    scriptsByEvent = new Map()
    for (const folder of ['/data/event', '/data/evspt_lv5']) {
      for (const leaf of scanCartridge(rom, { pathFilter: folder })) {
        if (!/\.stb$/i.test(leaf.path)) continue
        const named = /ev(\d{5})\.gp2/i.exec(leaf.archive)
        if (!named) continue
        try {
          scriptsByEvent.set(Number(named[1]), readScript(leaf.bytes))
        } catch {
          // A script that will not read leaves its event without one, which
          // the count below reports rather than throws on.
        }
      }
    }

    reports = [...triggerFiles]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, bytes]) => {
        let triggers: ReturnType<typeof readTriggers>
        try {
          triggers = readTriggers(bytes)
        } catch {
          triggers = []
        }
        const events = new Set<number>()
        for (const trigger of triggers) {
          for (const word of triggerWords(trigger)) {
            if (word.op === OP_EVENT && word.arg > 0) events.add(word.arg)
          }
        }
        const unhandled = new Map<number, number>()
        let missingScripts = 0
        let runaway = 0
        for (const id of events) {
          const script = scriptsByEvent.get(id)
          if (!script) {
            missingScripts++
            continue
          }
          const player = new EventPlayer(script, 1)
          let frames = 0
          while (!player.finished && frames < FRAME_CAP) {
            player.tick()
            // A scene waits for its message to be read. Nobody is reading, so
            // read it — otherwise every talking event runs to the cap and the
            // half of it after the first line is never reached.
            if (player.stage.message !== undefined) player.dismiss()
            frames++
          }
          if (frames >= FRAME_CAP) runaway++
          for (const [fn, n] of player.stage.unhandled) {
            unhandled.set(fn, (unhandled.get(fn) ?? 0) + n)
          }
        }
        return { area, events: events.size, missingScripts, runaway, unhandled }
      })

    // The worklist, and the shape of it.
    const everywhere = new Map<number, { calls: number; areas: number }>()
    for (const report of reports) {
      for (const [fn, n] of report.unhandled) {
        const row = everywhere.get(fn) ?? { calls: 0, areas: 0 }
        row.calls += n
        row.areas++
        everywhere.set(fn, row)
      }
    }
    const worklist = [...everywhere].sort(
      (a, b) => b[1].areas - a[1].areas || b[1].calls - a[1].calls,
    )

    console.log(
      `${reports.length} areas, ${reports.reduce((n, r) => n + r.events, 0)} events reachable from their triggers`,
    )
    console.log(`${everywhere.size} engine functions wanted and not implemented`)
    console.log('  the worklist, by how many areas want it:')
    for (const [fn, row] of worklist.slice(0, 20)) {
      console.log(
        `    ${String(fn).padStart(4)}  ${String(row.areas).padStart(3)} areas, ${row.calls} calls`,
      )
    }
    const worst = [...reports].sort((a, b) => b.unhandled.size - a.unhandled.size).slice(0, 10)
    console.log('  the areas wanting most:')
    for (const r of worst) {
      console.log(`    ${r.area}  ${r.events} events, ${r.unhandled.size} functions missing`)
    }
  }, 600_000)

  it('finds the events its triggers name, bar a known few', () => {
    const dangling = reports.filter((r) => r.missingScripts > 0)
    const found = dangling.map((r) => `${r.area}:${r.missingScripts}`).join(' ')
    // Five areas name events with no script in either event folder: H18 and
    // M02 one each, R02, R03 and R04 seven each. **Not explained**, and pinned
    // rather than allowed for: either the folders are not the only two, or
    // those events ship elsewhere, or `OP_EVENT` has a case this misreads. The
    // R areas wanting exactly seven apiece is the thread to pull.
    expect(found).toBe('H18:1 M02:1 R02:7 R03:7 R04:7')
  })

  it('runs every event to its end, bar one', () => {
    const stuck = reports.filter((r) => r.runaway > 0)
    // One event in H15 never finishes with its messages read and every unknown
    // function answered 0. Whether it waits on something this host cannot give
    // or loops in the game too is not established.
    expect(stuck.map((r) => `${r.area}:${r.runaway}`).join(' ')).toBe('H15:1')
  })

  it('counts what the slice itself still wants', () => {
    // M01 is the slice's own area and it plays — which is not the same as
    // being complete. Its events call **78** functions the host answers with
    // 0, and the slice is playable because none of them stops a scene it
    // needs. The number is a pin: implementing one lowers it, and a change
    // that loses one raises it.
    const slice = reports.find((r) => r.area === 'M01')
    expect(slice, 'no triggers for the slice area').toBeDefined()
    const here = slice as AreaReport
    expect(here.events).toBe(49)
    expect(here.unhandled.size).toBe(78)
  })

  it('shows the gap is front-loaded — the same functions, area after area', () => {
    const everywhere = new Map<number, number>()
    for (const report of reports)
      for (const fn of report.unhandled.keys()) {
        everywhere.set(fn, (everywhere.get(fn) ?? 0) + 1)
      }
    const wanted = [...everywhere.values()]
    // The cost is not per-area: most missing functions are wanted by many
    // areas, so the first town pays for most of the rest. If this ever stops
    // being true the plan's sequencing is wrong and the world is the expensive
    // phase rather than the pipeline — see `docs/beyond-the-slice.md`.
    const shared = wanted.filter((areas) => areas > 1).length
    expect(shared / wanted.length).toBeGreaterThan(0.5)
  })

  it('reaches further than the count in the event-scripts notes', () => {
    // `docs/event-scripts.md` says 139 numbers are invoked across the
    // cartridge, "met by running every event against a host that answers
    // everything with 0 — so only the paths that run that way are seen".
    // Reading each message as it comes up opens the paths after the first
    // line, and then more than 139 are reached: 150 are unanswered here, on
    // top of the 36 the host implements. The notes' figure is a floor.
    const everywhere = new Set<number>()
    for (const report of reports) for (const fn of report.unhandled.keys()) everywhere.add(fn)
    expect(everywhere.size).toBe(150)
  })
})
