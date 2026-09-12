import { readFileSync } from 'node:fs'
import { readScript, type Script, type ScriptRoutine } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { EventRun, OP, ScriptError, type ScriptHost } from '@minstrel/script'
import { describe, expect, it } from 'vitest'

/**
 * Event scripts, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed. The
 * fixtures in `packages/game-formats/test/script.test.ts` and
 * `packages/script/test/vm.test.ts` are built in code; this holds the reader
 * and the machine to every event there is.
 */
const romPath = process.env.MINSTREL_TEST_ROM

/** The opcodes the machine reads. */
const READ = new Set<number>(Object.values(OP))

describe.skipIf(!romPath)('event scripts on a real cartridge', { timeout: 300_000 }, () => {
  const fs = romPath ? readNitroFs(new Uint8Array(readFileSync(romPath))) : undefined
  const scripts: { path: string; script: Script }[] = []
  const unreadable: string[] = []
  if (fs) {
    for (const file of walkFiles(fs.root)) {
      if (!/^\/data\/event\/ev\d+\.gp2$/i.test(file.path)) continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (!member.name.endsWith('.stb')) continue
        try {
          scripts.push({ path: file.path, script: readScript(archive.read(member)) })
        } catch (error) {
          unreadable.push(`${file.path}: ${String(error)}`)
        }
      }
    }
  }

  it('reads every event script, every section to its return, and every routine it calls', () => {
    expect(unreadable).toEqual([])
    expect(scripts.length).toBeGreaterThan(500)
    let calls = 0
    const strays: string[] = []
    const unknownOps = new Map<number, number>()
    for (const { path, script } of scripts) {
      const seen = new Set<number>()
      const visit = (routine: ScriptRoutine) => {
        if (seen.has(routine.at)) return
        seen.add(routine.at)
        for (const { op, b, at } of routine.code) {
          if (!READ.has(op)) unknownOps.set(op, (unknownOps.get(op) ?? 0) + 1)
          if (op !== OP.ROUTINE) continue
          calls++
          try {
            visit(script.routineAt(b))
          } catch {
            strays.push(`${path}@0x${at.toString(16)} -> 0x${b.toString(16)}`)
          }
        }
      }
      for (const section of script.sections) visit(section.routine)
    }
    console.log(
      `scripts ${scripts.length}, routine calls ${calls}, not landing on a routine ${strays.length}`,
      strays.slice(0, 5),
      'opcodes not read',
      Object.fromEntries(unknownOps),
    )
    expect(unknownOps.size).toBe(0)
    expect(strays.length).toBeLessThan(calls / 100)
  })

  it('runs every event to its end against an engine that answers nothing', () => {
    const outcomes = new Map<string, number>()
    let finished = 0
    let invocations = 0
    let counted = 0
    for (const { path, script } of scripts) {
      const host: ScriptHost = {
        call: () => {
          invocations++
          return 0
        },
      }
      const event = new EventRun(script, host)
      try {
        let frames = 0
        while (event.step() && frames < 20_000) frames++
        if (frames < 20_000) finished++
        else
          outcomes.set(
            'still running after 20,000 frames',
            (outcomes.get('still running after 20,000 frames') ?? 0) + 1,
          )
      } catch (error) {
        const reason =
          error instanceof ScriptError
            ? error.message.replace(/ \(at 0x[0-9a-f]+\)/, '')
            : String(error)
        outcomes.set(reason, (outcomes.get(reason) ?? 0) + 1)
        if (outcomes.get(reason) === 1) console.log(`first "${reason}": ${path}`)
      }
      counted++
    }
    console.log(
      `events ${counted}, ran to the end ${finished}, engine calls ${invocations}`,
      Object.fromEntries(outcomes),
    )
    expect(finished).toBeGreaterThan(counted * 0.9)
  })
})
