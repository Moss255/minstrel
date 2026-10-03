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

type Kit = Pick<Song, 'bank' | 'archives'>

/**
 * What each archive's banks and wave archives have been read to, so each is
 * decoded once — and is the same object every time, which is what lets the
 * player send it to the worklet once (`Music.keep`). A battle's every sound
 * shares a bank; decoding and sending it again for each one cost whole frames.
 */
const kits = new WeakMap<Sdat, Map<number, Kit | undefined>>()
const waves = new WeakMap<Sdat, Map<number, Song['archives'][number]>>()

/** A bank and its decoded wave archives, by the bank's index. */
function bankKit(sdat: Sdat, bankId: number): Kit | undefined {
  let byBank = kits.get(sdat)
  if (!byBank) {
    byBank = new Map()
    kits.set(sdat, byBank)
  }
  if (byBank.has(bankId)) return byBank.get(bankId)
  const kit = readKit(sdat, bankId)
  byBank.set(bankId, kit)
  return kit
}

function readKit(sdat: Sdat, bankId: number): Kit | undefined {
  const bankRecord = sdat.banks[bankId]
  if (!bankRecord || bankRecord.fileId === undefined) return undefined
  const bank = readSbnk(sdat.read(bankRecord))
  const archives = sdat.bankInfo(bankRecord).waveArchiveIds.map((id) => waveArchive(sdat, id))
  return { bank, archives }
}

/** A wave archive decoded to PCM, once — banks that share one share it. */
function waveArchive(sdat: Sdat, id: number): Song['archives'][number] {
  let byId = waves.get(sdat)
  if (!byId) {
    byId = new Map()
    waves.set(sdat, byId)
  }
  if (byId.has(id)) return byId.get(id)
  const archive = sdat.waveArchives[id]
  const decoded =
    id === 0xffff || !archive || archive.fileId === undefined
      ? undefined
      : readSwar(sdat.read(archive)).waves.map(decodeWave)
  byId.set(id, decoded)
  return decoded
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
