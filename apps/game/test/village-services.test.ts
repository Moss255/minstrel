import { readFileSync } from 'node:fs'
import { parseMarkup } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load, type Stage } from '../src/load.ts'
import {
  branchOf,
  letterForStage,
  OPENING_STAGE,
  pickLine,
  runLine,
  type Service,
} from '../src/talk.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/** The village's maps that read. */
const VILLAGE = [
  'M01',
  'M01M01',
  'M01M02',
  'M01M03',
  'M01M04',
  'M01M05',
  'M01M06',
  'M01M07',
  'M01M08',
  'M01M09',
  'M01M10',
]

/** The services a line can hand over to, trying every answer to every prompt it asks, as play can. */
function servicesIn(text: string): Service[] {
  const tokens = parseMarkup(text)
  const found: Service[] = []
  const walk = (from: number, depth: number) => {
    const run = runLine(tokens, from)
    if (run.service) found.push(run.service)
    if (!run.prompt || depth > 8) return
    for (const answer of run.prompt.answers) {
      const next = branchOf(tokens, run.prompt, answer)
      if (next !== undefined) walk(next, depth + 1)
    }
  }
  walk(0, 0)
  return found
}

describe.skipIf(!romPath)('the village services on a real cartridge', { timeout: 300_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('has a shop, an inn and a church whose keepers hand over to them in chapter 2', () => {
    const byStage = new Map<string, Set<Service['kind']>>()
    const key = (stage: Stage) => `${stage.major}.${stage.minor}`
    for (const code of VILLAGE) {
      const at = load(rom, { map: code })
      const stages = [OPENING_STAGE, ...at.stages.filter((stage) => stage.major === 2)]
      for (const stage of stages) {
        const cast = at.castAt(stage)
        const letter = letterForStage(at.letters, stage)
        if (!letter) continue
        for (const member of [...cast.members, ...cast.sprites2d]) {
          const id = member.placement.id
          const lines = at.linesOf(id, letter)
          for (const night of [false, true]) {
            const choice = pickLine({
              triggers: at.triggers,
              map: at.mapId,
              stage,
              night,
              id,
              lines,
            })
            if (choice?.kind !== 'line') continue
            const services = servicesIn(choice.line.text ?? '')
            // The shopkeeper, whose shop the done-when needs, is logged at every stage.
            if (id === 19)
              console.log(
                `shopkeeper at ${key(stage)} in ${at.code}${night ? ' by night' : ''}: ${services.map((s) => s.kind).join(' ') || 'no service'} — ${choice.why}`,
              )
            for (const service of services) {
              if (service.kind === 'SHOP')
                expect(at.shops.has(service.id), `shop ${service.id}`).toBe(true)
              const kinds = byStage.get(key(stage)) ?? new Set()
              kinds.add(service.kind)
              byStage.set(key(stage), kinds)
            }
          }
        }
      }
    }
    const summary = [...byStage].map(([stage, kinds]) => `${stage}: ${[...kinds].sort().join(' ')}`)
    console.log(`services by stage — ${summary.join(' · ')}`)
    // The shop and the church are open from the slice's first stage…
    expect(byStage.get(key(OPENING_STAGE)), summary.join(' · ')).toEqual(
      new Set(['CHURCH', 'SHOP']),
    )
    // …and the inn at some stage of chapter 2: the story puts its keeper behind the counter later.
    const reached = new Set([...byStage.values()].flatMap((kinds) => [...kinds]))
    expect([...reached].sort(), summary.join(' · ')).toEqual(['CHURCH', 'INN', 'SHOP'])
  })

  it('prices and names everything the village shop sells, a weapon among it', () => {
    const at = load(rom, { map: 'M01' })
    const shop = at.shops.get(32)
    if (!shop) throw new Error('no shop 32')
    for (const id of shop.items) {
      expect(at.goods.get(id)?.price, `item ${id}`).toBeGreaterThan(0)
      expect(at.itemNames.has(id), `item ${id}`).toBe(true)
    }
    expect(shop.items.some((id) => at.goods.get(id)?.table === 'w')).toBe(true)
  })
})
