import { describe, expect, it } from 'vitest'
import {
  battleLog,
  LOG_KEEP,
  logLine,
  logLongFrame,
  logText,
  motionChanges,
} from '../src/battle-log.ts'

describe('the battle log', () => {
  it('stamps each line with the time since the fight began', () => {
    const log = battleLog(1000)
    logLine(log, 1000, 'page: Some slimes draw near!')
    logLine(log, 2534, 'Hero: attack1a')
    expect(logText(log)).toBe('   0.000  page: Some slimes draw near!\n   1.534  Hero: attack1a')
  })

  it('keeps the latest lines only, and shows the last few', () => {
    const log = battleLog(0)
    for (let i = 0; i < LOG_KEEP + 10; i++) logLine(log, i, `line ${i}`)
    expect(log.entries).toHaveLength(LOG_KEEP)
    expect(log.entries[0]?.text).toBe('line 10')
    expect(
      logText(log, 2)
        .split('\n')
        .map((l) => l.trim()),
    ).toEqual([`0.208  line ${LOG_KEEP + 8}`, `0.209  line ${LOG_KEEP + 9}`])
  })

  it('tells a motion begun, begun again, or blended into — and nothing else', () => {
    const seen = new Map<number, { motion: string; at: number }>()
    const name = (i: number) => (i === 0 ? 'Hero' : 'slime')
    const hero = { index: 0, motion: 'stand', motionAt: 0, blend: undefined }
    expect(motionChanges([hero], seen, name)).toEqual(['Hero: stand'])
    expect(motionChanges([{ ...hero, motionAt: 100 }], seen, name)).toEqual([])
    expect(
      motionChanges([{ ...hero, motion: 'run', blend: { from: 'stand' } }], seen, name),
    ).toEqual(['Hero: run, blending from stand'])
    expect(motionChanges([{ ...hero, motion: 'run', motionAt: 0 }], seen, name)).toEqual([])
    seen.set(0, { motion: 'run', at: 500 })
    expect(motionChanges([{ ...hero, motion: 'run', motionAt: 0 }], seen, name)).toEqual([
      'Hero: run',
    ])
  })

  it('folds a run of long frames into one line, counted, with the longest', () => {
    const log = battleLog(0)
    logLongFrame(log, 100, 40)
    logLongFrame(log, 150, 90)
    logLongFrame(log, 200, 50)
    logLine(log, 300, 'Hero: stand')
    logLongFrame(log, 400, 36)
    expect(log.entries.map((e) => e.text)).toEqual([
      'long frames: 3, longest 90 ms',
      'Hero: stand',
      'long frames: 1, longest 36 ms',
    ])
  })
})
