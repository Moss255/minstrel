import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * Who roams where: `/data/prm/encfld.bin` and `/data/prm/encbtl.bin`, two
 * tagged data tables of the same zones. See FORMAT.md, "Encounters".
 *
 * **`encfld`, by map.** A `0x69` record opens a map — its first value **is the
 * map's own id**, the one the map list gives it, on all 210 — and its zones
 * follow: a `0x68` record names a zone, a `0x66` holds one word for it, not
 * established, and a `0x67` record each gives a monster that roams there, its
 * number in the low 12 bits and — INFERRED — its weight among the zone's
 * monsters above, with a second value, 1 on most, not established.
 *
 * **`encbtl`, by zone.** The same zones by number, each a `0x68` and then
 * `0x66` records — **the zone's roaming monsters again, the same on all 287
 * zones** — and `0x67` records: monsters that may join a battle there, most of
 * them not among the zone's roamers. The numbers beside each are carried.
 *
 * How a map chooses among its zones is not established.
 */

const MAP_TAG = 0x69
const ZONE_TAG = 0x68
const HEAD_TAG = 0x66
const MONSTER_TAG = 0x67

export interface ZoneMonster {
  readonly number: number
  /** INFERRED: its weight among the zone's monsters. */
  readonly weight: number
  /** The record's second value — 1 on most — not established. */
  readonly unknown_1: number
}

export interface FieldZone {
  readonly zone: number
  /** The zone's `0x66` word, not established. */
  readonly unknown_head: number
  readonly monsters: readonly ZoneMonster[]
}

/** A number beside a monster in `encbtl`, carried: the bits above its number, and the record's second value. */
export interface BattleZoneMonster {
  readonly number: number
  readonly unknown_bits: number
  readonly unknown_1: number
}

export interface BattleZone {
  readonly zone: number
  /** The zone's roaming monsters — the same as `encfld`'s for it. */
  readonly roamers: readonly BattleZoneMonster[]
  /** Monsters that may join a battle in the zone. */
  readonly company: readonly BattleZoneMonster[]
}

/** Parse `encfld`: each map's zones and who roams them, by the map's id. */
export function readFieldEncounters(bytes: Uint8Array): Map<number, FieldZone[]> {
  const out = new Map<number, FieldZone[]>()
  let zones: FieldZone[] | undefined
  let zone: { zone: number; unknown_head: number; monsters: ZoneMonster[] } | undefined
  for (const record of readDataTable(bytes).records) {
    const first = record.values[0]
    if (record.tag === MAP_TAG) {
      if (first === undefined) throw new GameFormatError('a map record names no map', record.offset)
      zones = []
      zone = undefined
      out.set(first, zones)
    } else if (record.tag === ZONE_TAG) {
      if (!zones || first === undefined) {
        throw new GameFormatError('a zone before any map', record.offset)
      }
      zone = { zone: first, unknown_head: 0, monsters: [] }
      zones.push(zone)
    } else if (record.tag === HEAD_TAG) {
      if (zone && first !== undefined) zone.unknown_head = first
    } else if (record.tag === MONSTER_TAG) {
      if (!zone || first === undefined) {
        throw new GameFormatError('a monster before any zone', record.offset)
      }
      zone.monsters.push({
        number: first & 0xfff,
        weight: first >>> 12,
        unknown_1: record.values[1] ?? 0,
      })
    }
  }
  return out
}

/** Parse `encbtl`: each zone's roaming monsters and its battle company, by zone. */
export function readBattleEncounters(bytes: Uint8Array): Map<number, BattleZone> {
  const out = new Map<number, BattleZone>()
  let zone: { zone: number; roamers: BattleZoneMonster[]; company: BattleZoneMonster[] } | undefined
  const monster = (values: Uint32Array): BattleZoneMonster => {
    const word = values[0] ?? 0
    return { number: word & 0xfff, unknown_bits: word >>> 12, unknown_1: values[1] ?? 0 }
  }
  for (const record of readDataTable(bytes).records) {
    if (record.tag === ZONE_TAG) {
      const first = record.values[0]
      if (first === undefined)
        throw new GameFormatError('a zone record names no zone', record.offset)
      zone = { zone: first, roamers: [], company: [] }
      out.set(first, zone)
    } else if (record.tag === HEAD_TAG || record.tag === MONSTER_TAG) {
      if (!zone) throw new GameFormatError('a monster before any zone', record.offset)
      ;(record.tag === HEAD_TAG ? zone.roamers : zone.company).push(monster(record.values))
    }
  }
  return out
}
