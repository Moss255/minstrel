import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * Who roams where: `/data/prm/encfld.bin` and `/data/prm/encbtl.bin`, two
 * tagged data tables of the same zones. See FORMAT.md, "Encounters".
 *
 * **`encfld`, by map.** A `0x69` record opens a map — its first value **is the
 * map's own id**, the one the map list gives it, on all 210 — and its zones
 * follow: a `0x68` record names a zone, a `0x66` holds one word for it — its
 * low three bits INFERRED a kind, the rest not established — and a `0x67`
 * record each gives a monster that roams there, its
 * number in the low 12 bits and — INFERRED — its weight among the zone's
 * monsters above, with a second value, 1 on most, not established.
 *
 * **`encbtl`, by zone.** The same zones by number, each a `0x68` and then
 * `0x66` records — **the zone's roaming monsters again, the same on all 287
 * zones** — and `0x67` records: monsters that may join a battle there, most of
 * them not among the zone's roamers.
 *
 * **A companion's bits are three 3-bit fields** above its number: its weight
 * among the zone's company, and the least and most of it that join — INFERRED:
 * the second is no more than the third on all 1,527 company records, as a
 * count's range would be, and nothing is set above the three. The weights are
 * the company's own: they agree with `encfld`'s for the same monster on 272 of
 * 829. A roamer's bits hold the same three fields and more above them, and
 * are carried: the second is no more than the third on only 1,027 of 1,058.
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
  /**
   * The record's second value — 1 on most, 0 on some, and on others a float,
   * 0.85 or 0.9, carried here as its bits — not established.
   */
  readonly unknown_1: number
}

export interface FieldZone {
  readonly zone: number
  /**
   * The low three bits of the zone's `0x66` word, 0, 1 or 2 — INFERRED a kind.
   * 0 and 1 come as a pair, in that order, on fields only, and 37 of the 40
   * pairs are roamed by the same monsters on other weights; 2 is the one zone
   * of every dungeon, and a field's third and fourth. What chooses among a
   * map's zones is not established — see FORMAT.md, "Encounters".
   */
  readonly kind: number
  /** The zone's `0x66` word whole: its kind in the low three bits, the rest not established. */
  readonly unknown_head: number
  readonly monsters: readonly ZoneMonster[]
}

/** A number beside a monster in `encbtl`, carried: the bits above its number, and the record's second value. */
export interface BattleZoneMonster {
  readonly number: number
  readonly unknown_bits: number
  readonly unknown_1: number
}

/** A monster that may join a battle in a zone: its weight, and how many of it join — INFERRED, see above. */
export interface CompanyMonster extends BattleZoneMonster {
  /** Its weight among the zone's company, 0 to 7. */
  readonly weight: number
  /** The fewest of it that join, 1 to 3. */
  readonly least: number
  /** The most, 1 to 5. */
  readonly most: number
}

export interface BattleZone {
  readonly zone: number
  /** The zone's roaming monsters — the same as `encfld`'s for it. */
  readonly roamers: readonly BattleZoneMonster[]
  /** Monsters that may join a battle in the zone. */
  readonly company: readonly CompanyMonster[]
}

/** Parse `encfld`: each map's zones and who roams them, by the map's id. */
export function readFieldEncounters(bytes: Uint8Array): Map<number, FieldZone[]> {
  const out = new Map<number, FieldZone[]>()
  let zones: FieldZone[] | undefined
  let zone:
    | { zone: number; kind: number; unknown_head: number; monsters: ZoneMonster[] }
    | undefined
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
      zone = { zone: first, kind: 0, unknown_head: 0, monsters: [] }
      zones.push(zone)
    } else if (record.tag === HEAD_TAG) {
      if (zone && first !== undefined) {
        zone.unknown_head = first
        zone.kind = first & 7
      }
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
  let zone: { zone: number; roamers: BattleZoneMonster[]; company: CompanyMonster[] } | undefined
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
      const read = monster(record.values)
      if (record.tag === HEAD_TAG) zone.roamers.push(read)
      else {
        const bits = read.unknown_bits
        zone.company.push({
          ...read,
          weight: bits & 7,
          least: (bits >>> 3) & 7,
          most: (bits >>> 6) & 7,
        })
      }
    }
  }
  return out
}
