import {
  decodeWave,
  readSbnk,
  readSdat,
  readSsar,
  readSseq,
  readSwar,
  type Sdat,
  type SdatRecord,
} from '@minstrel/nitro-snd'
import type { Song } from './sequencer.ts'

/**
 * A song out of an SDAT, by the sequence's name: its commands, its bank, and
 * the bank's wave archives decoded to PCM — the chain `BG_001` →
 * `BANK_BG_001` → `WAVE_BG_001` the archive's records make.
 */
export function songOf(sdat: Sdat, name: string): Song | undefined {
  const record = sdat.record(name)
  if (record?.kind !== 0) return undefined
  return sequenceSong(sdat, record)
}

/** A song by the sequence's index in the archive — `720`'s way of naming a jingle. */
export function songAt(sdat: Sdat, index: number): Song | undefined {
  const record = sdat.sequences[index]
  return record ? sequenceSong(sdat, record) : undefined
}

function sequenceSong(sdat: Sdat, record: SdatRecord): Song | undefined {
  if (record.fileId === undefined) return undefined
  const info = sdat.sequenceInfo(record)
  const sseq = readSseq(sdat.read(record))
  const kit = bankKit(sdat, info.bankId)
  return kit ? { commands: sseq.commands, ...kit, volume: info.volume } : undefined
}

/** A bank and its decoded wave archives, by the bank's index. */
function bankKit(sdat: Sdat, bankId: number): Pick<Song, 'bank' | 'archives'> | undefined {
  const bankRecord = sdat.banks[bankId]
  if (!bankRecord || bankRecord.fileId === undefined) return undefined
  const bank = readSbnk(sdat.read(bankRecord))
  const archives = sdat.bankInfo(bankRecord).waveArchiveIds.map((id) => {
    const archive = sdat.waveArchives[id]
    if (id === 0xffff || !archive || archive.fileId === undefined) return undefined
    return readSwar(sdat.read(archive)).waves.map(decodeWave)
  })
  return { bank, archives }
}

/**
 * An effect out of a sequence archive, by the archive's index and a slot: the
 * first filled slot when none is given. An archive's filled slots are
 * variants of one sound — the same note at rising pitches, or louder and
 * softer — and which the game picks is not read; the first is ours.
 */
export function effectOf(sdat: Sdat, index: number, slot?: number): Song | undefined {
  const record = sdat.records[1]?.[index]
  if (!record || record.fileId === undefined) return undefined
  const ssar = readSsar(sdat.read(record))
  const entry = slot === undefined ? ssar.entries.find((e) => e !== undefined) : ssar.entries[slot]
  if (!entry) return undefined
  const kit = bankKit(sdat, entry.bank)
  return kit
    ? { commands: ssar.commands, ...kit, volume: entry.volume, start: entry.offset }
    : undefined
}

/** The names of an archive's sequences, in order — what there is to play. */
export function songNames(sdat: Sdat): string[] {
  return sdat.sequences.flatMap((s) => (s.fileId !== undefined && s.name ? [s.name] : []))
}

export { readSdat }
