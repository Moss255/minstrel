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
  /** Events enough for an area to count as a place rather than a room. */
  const TOWN_EVENTS = 15

  interface AreaReport {
    readonly area: string
    readonly events: number
    readonly missingScripts: number
    readonly runaway: number
    /** Engine function number to how many times it was called unanswered. */
    readonly unhandled: Map<number, number>
  }

  /** An area with events enough to be a place rather than a room, and what it would cost. */
  interface Town {
    readonly area: string
    readonly events: number
    readonly missing: number
    /** The functions it wants that the slice's own area does not — the work it adds. */
    readonly beyond: readonly number[]
  }

  let reports: AreaReport[] = []
  let towns: Town[] = []
  let scriptsByEvent: Map<number, Script>
  /** The earliest story stage that can reach each event, as `major × 100 + minor`. */
  const storyOf = new Map<number, number>()
  /** Each unread engine function: how often, where, what it was handed, and how early it is wanted. */
  const wanted = new Map<
    number,
    { calls: number; areas: Set<string>; shapes: Set<string>; at: number; event: number }
  >()

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
            if (word.op !== OP_EVENT || word.arg <= 0) continue
            events.add(word.arg)
            // **Where it falls in the story**: the earliest stage of any
            // trigger that can reach it. That is what turns the worklist from
            // a heap into a sequence — see the story-ordered table below.
            const at = trigger.from.major * 100 + trigger.from.minor
            const was = storyOf.get(word.arg)
            if (was === undefined || at < was) storyOf.set(word.arg, at)
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
          // What each one was handed, and the earliest story stage that wants
          // it — the two things reading it out of the decomp starts from.
          for (const call of player.stage.unreadCalls.values()) {
            const row = wanted.get(call.fn) ?? {
              calls: 0,
              areas: new Set<string>(),
              shapes: new Set<string>(),
              at: Number.POSITIVE_INFINITY,
              event: id,
            }
            row.calls += call.calls
            row.areas.add(area)
            for (const shape of call.shapes) row.shapes.add(shape)
            row.at = Math.min(row.at, storyOf.get(id) ?? Number.POSITIVE_INFINITY)
            // The lowest-numbered event that wants it. The numbering runs with
            // the story — the slice's own are `ev02xxx` — and it is the finer
            // of the two orders, since a trigger's span nearly always starts
            // at 1.1 and so says little.
            row.event = Math.min(row.event, id)
            wanted.set(call.fn, row)
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
    // **What the next place costs.** The slice's own area wants 78 functions
    // and plays regardless, so a count of what an area wants is an upper bound
    // on the work and not a list of blockers. What it is good for is the
    // *difference*: how much a new town adds over what the slice already
    // wanted, which is the number Phase 1 is really sized by.
    const mine = new Set(reports.find((r) => r.area === 'M01')?.unhandled.keys() ?? [])
    towns = [...reports]
      .filter((report) => report.area !== 'M01' && report.events >= TOWN_EVENTS)
      .map((report) => ({
        area: report.area,
        events: report.events,
        missing: report.unhandled.size,
        beyond: [...report.unhandled.keys()].filter((fn) => !mine.has(fn)),
      }))
      .sort((a, b) => a.beyond.length - b.beyond.length)
    console.log(`  the towns (${TOWN_EVENTS}+ events), by what they add to the slice's own want:`)
    for (const town of towns) {
      console.log(
        `    ${town.area}  ${String(town.events).padStart(3)} events, ` +
          `${String(town.missing).padStart(3)} missing, ${String(town.beyond.length).padStart(3)} beyond the slice` +
          `${town.beyond.length > 0 ? `: ${town.beyond.slice(0, 12).join(' ')}` : ''}`,
      )
    }
    const union = new Set(towns.flatMap((town) => town.beyond))
    console.log(
      `  all ${towns.length} of them together add ${union.size} functions the slice does not want`,
    )

    const worst = [...reports].sort((a, b) => b.unhandled.size - a.unhandled.size).slice(0, 10)
    console.log('  the areas wanting most:')
    for (const r of worst) {
      console.log(`    ${r.area}  ${r.events} events, ${r.unhandled.size} functions missing`)
    }

    // **The worklist as a sequence.** Ordered by the earliest story stage that
    // wants a function, and within a stage by how often it is called: the top
    // of this list is what the next scenes cannot play without.
    const sequence = [...wanted].sort(
      (a, b) => a[1].at - b[1].at || a[1].event - b[1].event || b[1].calls - a[1].calls,
    )
    const stages = new Set([...wanted.values()].map((row) => row.at))
    console.log(
      `  the stages the triggers give: ${[...stages].sort((a, b) => a - b).join(' ')} — a span that starts at 1.1 says little, so the event number orders within it`,
    )
    const stage = (at: number) =>
      at === Number.POSITIVE_INFINITY ? '  —  ' : `${Math.floor(at / 100)}.${at % 100}`
    console.log('  the worklist, in the order the story wants it:')
    for (const [fn, row] of sequence.slice(0, 25)) {
      console.log(
        `    ${stage(row.at).padStart(5)}  fn ${String(fn).padStart(4)}  ` +
          `${String(row.calls).padStart(6)} calls, ${String(row.areas.size).padStart(3)} areas, ` +
          `(${[...row.shapes].sort().slice(0, 3).join('|')})  from ev${String(row.event).padStart(5, '0')}`,
      )
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
    // being complete. Its events call **55** functions the host answers with
    // 0, and the slice is playable because none of them stops a scene it
    // needs. The number is a pin: implementing one lowers it, and a change
    // that loses one raises it. It was 78 before the scene's field of view
    // and the cast-staging block went in.
    const slice = reports.find((r) => r.area === 'M01')
    expect(slice, 'no triggers for the slice area').toBeDefined()
    const here = slice as AreaReport
    expect(here.events).toBe(49)
    expect(here.unhandled.size).toBe(17)
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

  it('puts the worklist in the story’s order, and names what the first scenes want', () => {
    // The head of the list is the work that opens the most: the lowest-numbered
    // events that want anything at all, and what they want. Pinned so that
    // implementing one of them shows up here as a shorter list.
    const first = Math.min(...[...wanted.values()].map((row) => row.event))
    // ev01130's whole want — 222, 532, 543, 554, 595, 596, 728 and 731 — has
    // been read, and then ev01150's one want, 120, the bottom screen's fade;
    // so the head of the list has moved on to ev01515.
    expect(first).toBe(1515)
    const head = [...wanted]
      .filter(([, row]) => row.event === first)
      .map(([fn]) => fn)
      .sort((a, b) => a - b)
    expect(head).toEqual([538])
    // Still wanted by a great many areas, which is why it is first: the
    // earliest scenes and the latest want the same handful.
    for (const fn of head) {
      expect(wanted.get(fn)?.areas.size, `fn ${fn}`).toBeGreaterThanOrEqual(20)
    }
  })

  it('keeps what each unread function was handed, which is what reading it starts from', () => {
    // A signature apiece, in `docs/event-scripts.md`'s letters: 226 takes a
    // number and a number either way, 538 one number, 589 nothing at all.
    expect([...(wanted.get(226)?.shapes ?? [])].sort()).toEqual(['if', 'ii'])
    expect([...(wanted.get(538)?.shapes ?? [])]).toEqual(['i'])
    expect([...(wanted.get(589)?.shapes ?? [])]).toEqual([''])
  })

  it('says what a town beyond the slice adds, which is what the phase is sized by', () => {
    // Eight areas have 15 events or more. **The cheapest of them now adds
    // nothing**: C02 wants no engine function the slice does not want
    // already, which is the first town outside the slice to stand level with
    // it. The eight together add 14, where the raw count of what is
    // unanswered is 51 — the earliest scenes and the latest want the same
    // handful, which is what the phase's order rests on.
    //
    // **This is the measure of the phase.** It moved four times in two days:
    // the waypoint path (214 to 217) took the cheapest town from 11 to 7, the
    // cast-staging block (502 to 508 with 203, 205, 212) took the slice's own
    // count down eight, C02's last seven — 9, 218, 540, 544, 563, 597 and
    // 800 — took it to nothing, and the worklist head with the towns' shared
    // set (105, 120, 211, 233, 322, 328, 547, 558, 573, 574, 603, 703 to 709,
    // 715, 721) took the union from 30 to 21 and the raw count from 107 to 90,
    // the whole brightness block with it (100 to 122, less 108 to 110, which
    // are the display swap) took the slice's own from 48 to 37, and four
    // clusters read at once — 568 alone, the caption block 409 to 414, the
    // sound pairs 713/714 and 724/725 with 801, and the bone camera 572/531
    // with 213, 327, 512 and 587 — took it to 24, and the knobs those reads
    // gave away for nothing — 402 to 404, 417 to 421, 536, 569, 581, 582 and
    // 833 — to 21, and the four that were not moves at all — 230, 236, 238
    // and 578 — to 17.
    expect(towns.length).toBe(8)
    const cheapest = towns[0] as Town
    expect(cheapest.area).toBe('C02')
    expect(cheapest.beyond.length).toBe(0)
    const union = new Set(towns.flatMap((town) => town.beyond))
    expect(union.size).toBe(14)
    // **And none of them is a fresh start.** This used to be pinned as a
    // ratio — that each town wanted at least twice as much the slice wanted
    // too as it wanted on its own — and on 23 September 2026 M03 broke it at
    // 4 of 8. Nothing regressed: the ratio was bound to fall, because what
    // has been implemented is precisely the shared base, so what is left over
    // is town-specific by construction. M03 wanting 4 of 8 where it once
    // wanted 5 of 23 is the work showing, not a warning.
    //
    // What still carries the claim is the absolute number, so that is what is
    // pinned now: **no town adds more than a handful**, where each wanted
    // dozens when the phase began. The "most missing functions are wanted by
    // many areas" check above is the other half, and it is untouched by this.
    for (const town of towns) {
      expect(town.beyond.length, town.area).toBeLessThanOrEqual(4)
    }
  })

  it('reaches further than the count in the event-scripts notes', () => {
    // `docs/event-scripts.md` says 139 numbers are invoked across the
    // cartridge, "met by running every event against a host that answers
    // everything with 0 — so only the paths that run that way are seen".
    // Reading each message as it comes up opens the paths after the first
    // line, and then more than 139 are reached. The notes' figure is a floor:
    // what the host has read since has taken this from 150 down to 47.
    const everywhere = new Set<number>()
    for (const report of reports) for (const fn of report.unhandled.keys()) everywhere.add(fn)
    expect(everywhere.size).toBe(47)
  })
})
