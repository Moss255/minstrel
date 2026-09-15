export { NitroSndError } from './errors.ts'
export {
  type Instrument,
  InstrumentType,
  isSbnk,
  type NoteDefinition,
  type NoteSource,
  noteFor,
  readSbnk,
  type Sbnk,
} from './sbnk.ts'
export {
  type BankInfo,
  isSdat,
  RECORD_KIND_NAMES,
  RecordKind,
  type RecordKindValue,
  readSdat,
  SDAT_MAGIC,
  type Sdat,
  type SdatFile,
  type SdatRecord,
  type SequenceInfo,
} from './sdat.ts'
export { isSseq, readSseq, type Sseq } from './sseq.ts'
export {
  ADPCM_TABLE,
  ARM7_CLOCK,
  type DecodedWave,
  decodeWave,
  isSwar,
  readSwar,
  readWave,
  type Swar,
  type Wave,
  WaveFormat,
} from './swar.ts'
