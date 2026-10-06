import type { StoryArea } from './story.ts'
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
  /** Where the doorway stands in this map, in the file's own units. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** How big the doorway is, in the file's own units. */
  readonly width: number
  readonly height: number
  readonly depth: number
  /** Which way the doorway faces, in radians. */
  readonly angle: number
  /** Where you stand in the destination, in the file's own units. */
  readonly arriveX: number
  readonly arriveY: number
  readonly arriveZ: number
  /** Which way you face on arriving, in radians. */
  readonly arriveFacing: number
  /**
   * The doorway's two numbers, on the `0x74` form: its first two values, which
   * the game keeps on the region (`+0x2c`, `+0x2d`, `func_0201d638`) and tests
   * a doorway record against — see `KIND_DOORWAY` in `story.ts`. The village's
   * doors are `0, 0` to `9, 0`; a map with two doors to one place numbers them.
   */
  readonly id?: readonly [number, number]
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
  const id =
    tag === TAG_ACTION && record.kinds[0] === 1 && record.kinds[1] === 1
      ? ([record.values[0] as number, record.values[1] as number] as const)
      : undefined
  return {
    tag,
    to,
    ...(id ? { id } : {}),
    x: trigger.values[at] as number,
    y: trigger.values[at + 1] as number,
    z: trigger.values[at + 2] as number,
    width: trigger.values[at + 3] as number,
    height: trigger.values[at + 4] as number,
    depth: trigger.values[at + 5] as number,
    angle: trigger.values[at + 6] as number,
    arriveX: record.floats[arrival] as number,
    arriveY: record.floats[arrival + 1] as number,
    arriveZ: record.floats[arrival + 2] as number,
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
    // Only a doorway's region (type 2) is one: a ladder's end (type 9) names a
    // map in the same slot, and is left by climbing — see `mapLadders`.
    if (record.tag !== TAG_TRIGGER || record.values[0] !== REGION_DOORWAY) continue
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
 * across the village's seven shared doors the `0x73` trigger stands **one
 * unit** from the `0x72` one, every time, and is a unit deeper. They are the
 * same door described twice, not two doors.
 *
 * Set well above that and well below the gap between real neighbours: of the
 * 196 same-destination pairs on the cartridge, 87 fall inside this and the
 * rest are over three times as far apart. A house with two doors keeps both.
 * In the file's own units, like the positions it compares.
 */
const SAME_DOORWAY = 2.4

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

/** The kind of a `0x73` region that is an area of the map — see {@link mapAreas}. */
const REGION_AREA = 3

/**
 * A map's own areas: its link table's `0x73` regions of **type 3**, each with
 * the area's number in the first value of the `0x74` after it. Read from the
 * game's code (US ARM9): the table's handler for `0x73` (`func_0201d530`)
 * reads a type, a centre, a size — width, height, depth — and an angle in
 * radians, and adds a region the field keeps (`func_0201e710`); the one for
 * `0x74` (`func_0201d638`) gives a type-3 region its number. The field tests
 * the Hero against these (`func_ov017_0219814c`) as against a trigger's areas,
 * the first that holds them, and walking into one runs the map's records for
 * that area. 22 on the cartridge, in 15 maps; Stornway's throne room has areas
 * 0 and 1, the only definitions of the areas its records at 3.1 and 3.3 name.
 *
 * In the file's own units, as a trigger's areas are.
 */
export function mapAreas(data: Uint8Array): StoryArea[] {
  const table = readDataTable(data)
  const records = table.records
  const out: StoryArea[] = []
  for (let i = 0; i < records.length; i++) {
    const region = records[i] as TableRecord
    if (region.tag !== TAG_TRIGGER || region.values[0] !== REGION_AREA) continue
    const action = records[i + 1]
    if (action?.tag !== TAG_ACTION || action.values.length === 0) continue
    const f = region.floats
    const [x, y, z, width, height, depth, angle] = [1, 2, 3, 4, 5, 6, 7].map(
      (slot) => (f[slot] as number) ?? 0,
    ) as [number, number, number, number, number, number, number]
    const turn = 2 * Math.PI
    out.push({
      id: action.values[0] as number,
      max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 },
      min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
      angle: ((angle % turn) + turn) % turn,
      reach: (width / 2) ** 2 + (depth / 2) ** 2,
    })
  }
  return out
}

/** The kind of a `0x73` region that is a bookcase — see {@link mapBookcases}. */
const REGION_BOOKCASE = 8

/** A bookcase: its box, as an area's, and the way the Hero faces to read it. */
export interface Bookcase {
  /** Its number, matched against a bookshelf record's value 1 — see `readBookshelves`. */
  readonly index: number
  readonly area: StoryArea
  /** The way the Hero is turned to read it, in radians — the `0x73`'s value 8. */
  readonly facing: number
}

/**
 * **A map's bookcases** — the `0x73` regions of type 8, each with a `0x74`
 * holding its number (`func_0201d638` case 8, `0x0201dbd8`). Read 4 October
 * 2026: the Hero reads one standing in its box and facing within about 117°
 * of its value 8 (`func_ov017_021984f4`, `< 8364.2` fx32), the closest such
 * angle winning. 163 on the cartridge, in 64 maps. In the file's own units,
 * as a trigger's areas are.
 */
export function mapBookcases(data: Uint8Array): Bookcase[] {
  const table = readDataTable(data)
  const records = table.records
  const out: Bookcase[] = []
  for (let i = 0; i < records.length; i++) {
    const region = records[i] as TableRecord
    if (region.tag !== TAG_TRIGGER || region.values[0] !== REGION_BOOKCASE) continue
    const action = records[i + 1]
    if (action?.tag !== TAG_ACTION || action.values.length === 0) continue
    const f = region.floats
    const [x, y, z, width, height, depth, angle, facing] = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (slot) => (f[slot] as number) ?? 0,
    ) as [number, number, number, number, number, number, number, number]
    const turn = 2 * Math.PI
    out.push({
      index: action.values[0] as number,
      area: {
        id: action.values[0] as number,
        max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 },
        min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
        angle: ((angle % turn) + turn) % turn,
        reach: (width / 2) ** 2 + (depth / 2) ** 2,
      },
      facing,
    })
  }
  return out
}

/** The kind of a `0x73` region that is a doorway — see {@link mapDoorwayRegions}. */
const REGION_DOORWAY = 2

/** A doorway region of a map's link table, by the two numbers its records name it by. */
export interface DoorwayRegion {
  /** Its first two `0x74` values, which the game keeps at the region's `+0x2c` and `+0x2d`. */
  readonly id: readonly [number, number]
  /** Where it is, as an area: numbered by its place in the table. */
  readonly area: StoryArea
}

/**
 * A map's doorway regions: its link table's `0x73` regions of **type 2**, each
 * with the two numbers of the `0x74` after it — **with or without a
 * destination**. A doorway record (`KIND_DOORWAY` in `story.ts`) names one by
 * those numbers, and the game runs it for each such region the Hero stands in
 * (ov017 `func_ov017_02198f84`) before any transition; a region with no
 * destination is a way out that some record blocks or answers — D12's
 * `0, 13` at 8201, whose record has 51 speak. {@link mapDoorways} keeps only
 * those with a destination, since it says where the Hero goes.
 */
export function mapDoorwayRegions(data: Uint8Array): DoorwayRegion[] {
  const table = readDataTable(data)
  const records = table.records
  const out: DoorwayRegion[] = []
  for (let i = 0; i < records.length; i++) {
    const region = records[i] as TableRecord
    if (region.tag !== TAG_TRIGGER || region.values[0] !== REGION_DOORWAY) continue
    const action = records[i + 1]
    if (action?.tag !== TAG_ACTION || action.values.length < 2) continue
    if (action.kinds[0] !== 1 || action.kinds[1] !== 1) continue
    const f = region.floats
    const [x, y, z, width, height, depth, angle] = [1, 2, 3, 4, 5, 6, 7].map(
      (slot) => (f[slot] as number) ?? 0,
    ) as [number, number, number, number, number, number, number]
    const turn = 2 * Math.PI
    out.push({
      id: [action.values[0] as number, action.values[1] as number],
      area: {
        id: out.length,
        max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 },
        min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
        angle: ((angle % turn) + turn) % turn,
        reach: (width / 2) ** 2 + (depth / 2) ** 2,
      },
    })
  }
  return out
}

/** The kind of a `0x73` region that is an end of a ladder — see {@link mapLadders}. */
const REGION_LADDER = 9

/** Bits of a ladder end's flags, its `0x74` value 3 (`+0x31`). */
const LADDER_TOP = 1
const LADDER_LEAVES = 2
const LADDER_ENTERS_ON = 4

/** Where leaving a ladder by an end takes the Hero, when it leads out of the map. */
export interface LadderExit {
  /** The map, by its code — or its id, where the record gives a number. */
  readonly map: string | number
  /** Where the Hero arrives, in the file's own units: values 7 to 9. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** The facing there, in radians: value 10. */
  readonly facing: number
  /**
   * With flag bit 2, the ladder end in the new map the Hero arrives on
   * (value 22, `+0x6e`) and how far up it, × 4096 (value 21, `+0x6c`, a float
   * kept as `fx32`) — see `func_020399b0`.
   */
  readonly onLadder?: { readonly end: number; readonly along: number }
  /** Values 5, 6 and 11: −1 or 0 on the cartridge, handed on and not read. */
  readonly unknown_5: number
  readonly unknown_6: number
  readonly unknown_11: number
}

/**
 * One end of a ladder or a vine: a `0x73` region of type 9 and its `0x74`
 * (`func_0201d638` case 9, `0x0201dbf8`). Read 6 October 2026 — see
 * `docs/readings/T16-getting-around.md`.
 */
export interface LadderEnd {
  /** This end's number, value 0 (`+0x2c`). */
  readonly id: number
  /** The other end's number, value 1 (`+0x2e`). */
  readonly partner: number
  /** Whether this is the top, flag bit 0. */
  readonly top: boolean
  /** Value 2 (`+0x30`): 0 on all 56 ends on the cartridge; nothing found reads it. */
  readonly unknown_2: number
  /** Its centre, in the file's own units: the `0x73`'s values 1 to 3. */
  readonly x: number
  readonly y: number
  readonly z: number
  /**
   * **The ladder's facing**, the way the Hero faces climbing up, in radians:
   * the `0x73`'s value 8 (`+0x20`), as stored.
   */
  readonly facing: number
  /** Its box, as an area's: where the Hero must stand to take it. */
  readonly area: StoryArea
  /** With flag bit 1, where leaving by this end goes. */
  readonly exit?: LadderExit
}

/**
 * **A map's ladders**, end by end: its link table's `0x73` regions of type 9.
 * Each names the other end of its ladder; one of the two is the top. 56 on the
 * cartridge, 28 ladders in 18 maps. In the file's own units.
 */
export function mapLadders(data: Uint8Array): LadderEnd[] {
  const table = readDataTable(data)
  const records = table.records
  const out: LadderEnd[] = []
  for (let i = 0; i < records.length; i++) {
    const region = records[i] as TableRecord
    if (region.tag !== TAG_TRIGGER || region.values[0] !== REGION_LADDER) continue
    const action = records[i + 1]
    if (action?.tag !== TAG_ACTION || action.values.length < 4) continue
    const f = region.floats
    const [x, y, z, width, height, depth, angle, facing] = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (slot) => (f[slot] as number) ?? 0,
    ) as [number, number, number, number, number, number, number, number]
    const v = action.values
    const int = (slot: number) => (v[slot] as number) | 0
    const flags = int(3)
    const turn = 2 * Math.PI
    let exit: LadderExit | undefined
    if (flags & LADDER_LEAVES && v.length >= 23) {
      const map = action.kinds[4] === KIND_STRING ? (table.stringAt(v[4] as number) ?? '') : int(4)
      const a = action.floats
      exit = {
        map,
        x: a[7] as number,
        y: a[8] as number,
        z: a[9] as number,
        facing: a[10] as number,
        ...(flags & LADDER_ENTERS_ON
          ? { onLadder: { end: int(22), along: Math.trunc((a[21] as number) * 4096) } }
          : {}),
        unknown_5: int(5),
        unknown_6: int(6),
        unknown_11: int(11),
      }
    }
    out.push({
      id: int(0),
      partner: int(1),
      top: (flags & LADDER_TOP) !== 0,
      unknown_2: int(2),
      x,
      y,
      z,
      facing,
      area: {
        id: int(0),
        max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 },
        min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
        angle: ((angle % turn) + turn) % turn,
        reach: (width / 2) ** 2 + (depth / 2) ** 2,
      },
      ...(exit ? { exit } : {}),
    })
  }
  return out
}

/** The kind of a `0x73` region that is a mooring for the ship — see {@link mapMoorings}. */
const REGION_MOORING = 10

/**
 * **A mooring for the ship**: a `0x73` region of type 10 and its `0x74`
 * (`func_0201d638` case 10, `0x0201dd98`–`0x0201de3c`). Read 6 October 2026 —
 * see `docs/readings/T16b-ship.md`. Positions are in the map's own units,
 * angles in radians; the game keeps them × 4096.
 */
export interface Mooring {
  /** Its number, value 0 (`+0x2c`) — what the game keeps the ship tied up at. */
  readonly id: number
  /** Where the ship stands: the region's centre, the `0x73`'s values 1 to 3 (`+0x08`). */
  readonly x: number
  readonly y: number
  readonly z: number
  /** The way the ship faces moored: the `0x73`'s value 8 (`+0x20`). */
  readonly facing: number
  /** Its box, as an area's: where the Hero stands to board — the A Button's check, kind 11. */
  readonly area: StoryArea
  /** Where the party is put ashore, values 1 to 3 (`+0x30`). */
  readonly ashore: { readonly x: number; readonly y: number; readonly z: number }
  /** The facing ashore, value 4 (`+0x2e`). */
  readonly ashoreFacing: number
  /** How near the ship must come on the ocean for this to be the one it ties up at, value 5 (`+0x3c`). */
  readonly reach: number
  /**
   * Where the ship goes out to sea from here, on the ocean (map 10000), and
   * its facing — values 6 to 9 (`+0x40`, `+0x4c`). Read only when the record
   * has more than six values; all 204 on the cartridge have ten.
   */
  readonly sea?: {
    readonly x: number
    readonly y: number
    readonly z: number
    readonly facing: number
  }
}

/**
 * **A map's moorings** — its link table's `0x73` regions of type 10. 204 on
 * the cartridge, in 30 fields and no other map. The `0x74`'s values are
 * integers there, whole units and whole radians, which the game reads as
 * floats (`Script::Parameter::ToFloat`, `0x02030b44`); so are they here.
 */
export function mapMoorings(data: Uint8Array): Mooring[] {
  const table = readDataTable(data)
  const records = table.records
  const out: Mooring[] = []
  for (let i = 0; i < records.length; i++) {
    const region = records[i] as TableRecord
    if (region.tag !== TAG_TRIGGER || region.values[0] !== REGION_MOORING) continue
    const action = records[i + 1]
    if (action?.tag !== TAG_ACTION || action.values.length < 6) continue
    const f = region.floats
    const [x, y, z, width, height, depth, angle, facing] = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (slot) => (f[slot] as number) ?? 0,
    ) as [number, number, number, number, number, number, number, number]
    const value = (slot: number) =>
      action.kinds[slot] === KIND_FLOAT
        ? (action.floats[slot] as number)
        : (action.values[slot] as number) | 0
    const turn = 2 * Math.PI
    out.push({
      id: value(0) | 0,
      x,
      y,
      z,
      facing,
      area: {
        id: value(0) | 0,
        max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 },
        min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
        angle: ((angle % turn) + turn) % turn,
        reach: (width / 2) ** 2 + (depth / 2) ** 2,
      },
      ashore: { x: value(1), y: value(2), z: value(3) },
      ashoreFacing: value(4),
      reach: value(5),
      ...(action.values.length > 6
        ? { sea: { x: value(6), y: value(7), z: value(8), facing: value(9) } }
        : {}),
    })
  }
  return out
}

/** The `.bmbl` instruction that is the map's start point (`func_0201d494`). */
const TAG_START = 0x6e
/** The type bits of a float. */
const KIND_FLOAT = 2

/** **A map's start point**: where a party asked into the map with no place stands. */
export interface MapStart {
  /** In the file's own units. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** The facing there, in radians. */
  readonly facing: number
}

/**
 * **The map's start point** — its `.bmbl`'s instruction `0x6E`, four floats:
 * x, y, z and a facing in radians, which the map's reader (`func_0201e1d0`,
 * opcode table `data_020ef388`) puts at the map's `+0x6c + 0x70` and `+0x7c`
 * (`func_0201d494`). A map request with no place — a wipe-out's — stands the
 * party there (`func_ov017_0219c598`, `0x0219c648`–`0x0219c668`). One on each
 * of the cartridge's 667 `.bmbl`; all four 0 on the battle stages. Read 6
 * October 2026 — `docs/readings/T12-travel.md`, "Where a party wiped out
 * stands". `undefined` when the file has none.
 */
export function mapStart(data: Uint8Array): MapStart | undefined {
  const record = readDataTable(data).records.find(
    (r) => r.tag === TAG_START && r.values.length >= 4,
  )
  if (!record || [0, 1, 2, 3].some((i) => record.kinds[i] !== KIND_FLOAT)) return undefined
  const f = record.floats
  return {
    x: f[0] as number,
    y: f[1] as number,
    z: f[2] as number,
    facing: f[3] as number,
  }
}
