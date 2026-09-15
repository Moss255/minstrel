import { decodeWave, readSbnk, readSdat, readSseq, readSwar, type Sdat } from '@minstrel/nitro-snd'
import type { Song } from './sequencer.ts'

/**
 * A song out of an SDAT, by the sequence's name: its commands, its bank, and
 * the bank's wave archives decoded to PCM — the chain `BG_001` →
 * `BANK_BG_001` → `WAVE_BG_001` the archive's records make.
 */
export function songOf(sdat: Sdat, name: string): Song | undefined {
  const record = sdat.record(name)
  if (!record || record.fileId === undefined || record.kind !== 0) return undefined
  const info = sdat.sequenceInfo(record)
  const bankRecord = sdat.banks[info.bankId]
  if (!bankRecord || bankRecord.fileId === undefined) return undefined
  const sseq = readSseq(sdat.read(record))
  const bank = readSbnk(sdat.read(bankRecord))
  const archives = sdat.bankInfo(bankRecord).waveArchiveIds.map((id) => {
    const archive = sdat.waveArchives[id]
    if (id === 0xffff || !archive || archive.fileId === undefined) return undefined
    return readSwar(sdat.read(archive)).waves.map(decodeWave)
  })
  return { commands: sseq.commands, bank, archives, volume: info.volume }
}

/** The names of an archive's sequences, in order — what there is to play. */
export function songNames(sdat: Sdat): string[] {
  return sdat.sequences.flatMap((s) => (s.fileId !== undefined && s.name ? [s.name] : []))
}

export { readSdat }
