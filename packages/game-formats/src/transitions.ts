import { PLACEMENT_SCALE } from './mapmanifest.ts'
import { type DataTable, readDataTable, type TableRecord } from './table.ts'

/**
 * Where one map leads to another.
 *
 * A `.bmbl` carries, besides the names of the maps it connects to, the doorways
 * themselves: a volume standing in this map, the map it leads to, and where you
 * arrive. It is the data the village's ten doorway models are the visible half
 * of.
 *
 * Two forms carry it, and both are read here.
 *
 * | | trigger | destination | arrival | then |
 * |---|---|---|---|---|
 * | `0x72`, 25 values | slots 0-6 | slot 8 | slots 11-14 | 15-24 |
 * | `0x73` + `0x74` | `0x73` slots 1-7 | `0x74` slot 4 | `0x74` slots 7-10 | 11-23 |
 *
 * **Arrival is always three slots past the destination**, in both, which is
 * what makes them one thing rather than two. So is the rest of the tail: past
 * the arrival each form has a marker and then *three further positions*.
 *
 * Those three are `unknown`. On 847 of 1,393 records they repeat the arrival
 * exactly, which invites reading them as somewhere for the party to stand —
 * but on 407 they are more than four units from it and on one they are 170,
 * which no line-up explains. They are carried nowhere until that is settled.
 *
 * The village makes the shape plain. Its nine `0x72` records are its nine
 * doorways: eight houses and the road out to the field. Their trigger volumes
 * stand where its doorway models stand.
 */

/** Tags carrying a transition. `0x73` is a trigger whose `0x74` says what it does. */
const TAG_DOORWAY = 0x72
const TAG_TRIGGER = 0x73
const TAG_ACTION = 0x74

/** Where the destination name sits in each form. */
const DOORWAY_DESTINATION = 8
const ACTION_DESTINATION = 4
/** Values from the destination to the arrival position. */
const ARRIVAL_AHEAD = 3

/** The type bits call a value a string when it is a byte offset into the names. */
const KIND_STRING = 0

export interface MapTransition {
  /** Which record form this came from: `0x72`, or `0x74` behind a `0x73`. */
  readonly tag: number
  /** The map this leads to, by the code the map index knows it by. */
  readonly to: string
  /** Where the doorway stands in this map, in world units. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** How big the doorway is, in world units. */
  readonly width: number
  readonly height: number
  readonly depth: number
  /** Which way the doorway faces, in radians. */
  readonly angle: number
  /** Where you stand in the destination, in world units. */
  readonly arriveX: number
  readonly arriveY: number
  readonly arriveZ: number
  /** Which way you face on arriving, in radians. */
  readonly arriveFacing: number
}

/** Positions are in the file's own units, the same eighth-scale the maps use. */
function scaled(value: number): number {
  return value / PLACEMENT_SCALE
}

/**
 * The destination a record names, if it names one.
 *
 * Taken from the fixed slot rather than by searching, but checked against the
 * header's type bits: on the cartridge's 1,415 transition records the slot is
 * marked a string every time, and **no record names two maps**, so there is
 * nothing to choose between.
 */
function destinationOf(table: DataTable, record: TableRecord, slot: number): string | undefined {
  if (record.values.length <= slot + ARRIVAL_AHEAD + 4) return undefined
  if (record.kinds[slot] !== KIND_STRING) return undefined
  return table.stringAt(record.values[slot] as number)
}

function transition(
  table: DataTable,
  tag: number,
  trigger: { values: Float32Array; from: number },
  record: TableRecord,
  slot: number,
): MapTransition | undefined {
  const to = destinationOf(table, record, slot)
  if (to === undefined) return undefined
  const at = trigger.from
  const arrival = slot + ARRIVAL_AHEAD
  return {
    tag,
    to,
    x: scaled(trigger.values[at] as number),
    y: scaled(trigger.values[at + 1] as number),
    z: scaled(trigger.values[at + 2] as number),
    width: scaled(trigger.values[at + 3] as number),
    height: scaled(trigger.values[at + 4] as number),
    depth: scaled(trigger.values[at + 5] as number),
    angle: trigger.values[at + 6] as number,
    arriveX: scaled(record.floats[arrival] as number),
    arriveY: scaled(record.floats[arrival + 1] as number),
    arriveZ: scaled(record.floats[arrival + 2] as number),
    // An angle is an angle whatever the scale is.
    arriveFacing: record.floats[arrival + 3] as number,
  }
}

/**
 * Every doorway a map has, in the order the file lists them.
 *
 * A `0x73` is a trigger and the `0x74` after it says what the trigger does —
 * the two are adjacent on **2,301 of 2,301** records. Most `0x74` do something
 * other than change map, and those are skipped rather than guessed at.
 */
export function readMapTransitions(data: Uint8Array): MapTransition[] {
  const table = readDataTable(data)
  const out: MapTransition[] = []
  const records = table.records

  for (let i = 0; i < records.length; i++) {
    const record = records[i] as TableRecord
    if (record.tag === TAG_DOORWAY) {
      const found = transition(
        table,
        TAG_DOORWAY,
        { values: record.floats, from: 0 },
        record,
        DOORWAY_DESTINATION,
      )
      if (found) out.push(found)
      continue
    }
    if (record.tag !== TAG_TRIGGER) continue
    const action = records[i + 1]
    if (!action || action.tag !== TAG_ACTION) continue
    // A `0x73` leads with an integer, so its volume starts one slot in.
    const found = transition(
      table,
      TAG_ACTION,
      { values: record.floats, from: 1 },
      action,
      ACTION_DESTINATION,
    )
    if (found) out.push(found)
  }
  return out
}

/**
 * How far apart two records may stand and still be the same doorway.
 *
 * Where a map carries both forms of a doorway they do not coincide exactly:
 * across the village's seven shared doors the `0x73` trigger stands **one raw
 * unit** — an eighth of a world unit — from the `0x72` one, every time, and is
 * a unit deeper. They are the same door described twice, not two doors.
 *
 * Set well above that and well below the gap between real neighbours: of the
 * 196 same-destination pairs on the cartridge, 87 fall inside this and the
 * rest are over three times as far apart. A house with two doors keeps both.
 */
const SAME_DOORWAY = 0.3

/**
 * The doorways of a map, each one once.
 *
 * {@link readMapTransitions} reads what the file says; this says what the map
 * has. The two forms overlap — 106 maps carry both — and where they describe
 * the same doorway **the `0x73`/`0x74` one is kept**, because its arrival is
 * the better of the two by both measures available:
 *
 * | | arrival stands on the destination's floor | arrival is within half a unit of the door back |
 * |---|---|---|
 * | `0x72` | 736/958 (76.8%) | 755/935 (80.7%) |
 * | `0x74` | 376/440 (85.5%) | **404/424 (95.3%)** |
 *
 * Neither form is redundant: 315 maps carry only `0x72`, 23 only `0x74`.
 *
 * A form may also repeat a doorway within itself — the village lists three of
 * its doors twice, alike but for two integers this parser does not read — and
 * the repeat is dropped here too.
 */
export function mapDoorways(data: Uint8Array): MapTransition[] {
  const all = readMapTransitions(data)
  const kept: MapTransition[] = []
  for (const t of all) {
    const same = kept.findIndex(
      (k) => k.to === t.to && Math.hypot(k.x - t.x, k.y - t.y, k.z - t.z) < SAME_DOORWAY,
    )
    if (same < 0) {
      kept.push(t)
      continue
    }
    // The better arrival wins, and a repeat within one form changes nothing.
    if (t.tag === TAG_ACTION && (kept[same] as MapTransition).tag === TAG_DOORWAY) kept[same] = t
  }
  return kept
}
