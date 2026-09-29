import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **A map's lighting** — its `.bats`, one a map, in `/data/map/ats_<letter>.ambl`
 * by the map code's first letter (`B01M1600.bats` in `ats_B.ambl`). A data
 * table (see `readDataTable`) the game runs as a script: the decomp's
 * `LightingInfo::LoadFromScript` (`src/Graphics/LightingInfo.cpp`) names what
 * each record's values are, read here in its order. See FORMAT.md, "`.bats`".
 *
 * | tag | what |
 * |---|---|
 * | `100` | the advanced lighting's gradient centre offset, a float — and that the map uses it |
 * | `106` | an advanced slot: index, two lights, and seven colours |
 * | `103` | the basic lighting's gradient centre offset |
 * | `104` | a basic slot: index, a vector, three colours, two floats, three colours |
 * | `105` | a fog slot: index, on, colour, type, depth shift, offset, eight density words, alpha |
 *
 * A slot's index is the time of day — 0 night, 1 morning, 2 day, 3 evening —
 * up to 6. Colours are `BGR555`, carried as they are: see {@link bgr555}.
 */
export interface Lighting {
  /** Which of the two the map's script set up: `100` advanced, `103` basic; undefined for neither. */
  readonly mode: 'advanced' | 'basic' | undefined
  /** Where the gradient's middle row is moved to, as a fraction of the screen. */
  readonly gradientCentreOffset: number
  /** By index. */
  readonly slots: ReadonlyMap<number, LightingSlot>
  readonly fog: ReadonlyMap<number, FogSlot>
}

export interface Light {
  readonly on: boolean
  readonly direction: readonly [number, number, number]
  readonly colour: number
}

export interface LightingSlot {
  readonly index: number
  /** An advanced slot's two lights, light 1 first as the record has them; absent on a basic one. */
  readonly light1?: Light
  readonly light0?: Light
  /** The gradient's outer colour, at the top and bottom. */
  readonly background: number
  /** The gradient's inner colour, at the horizon. */
  readonly horizon: number
  /** Advanced only: the ambient colour, and one more not established. */
  readonly ambient?: number
  readonly unknown_colour4?: number
  /** Basic only: what pots and barrels are tinted. */
  readonly potsAndBarrels?: number
  readonly sprite: number
  readonly model: number
  readonly edge: number
}

export interface FogSlot {
  readonly index: number
  readonly on: boolean
  readonly colour: number
  readonly type: number
  readonly depthShift: number
  readonly offset: number
  /** The eight words the game unpacks into its density table, as they are. */
  readonly density: readonly number[]
  readonly alpha: number
}

/** A `BGR555` colour's three channels, 0 to 31 each, red first. */
export function bgr555(colour: number): readonly [number, number, number] {
  return [colour & 0x1f, (colour >> 5) & 0x1f, (colour >> 10) & 0x1f]
}

const TAG_ADVANCED = 100
const TAG_BASIC = 103
const TAG_BASIC_SLOT = 104
const TAG_FOG = 105
const TAG_ADVANCED_SLOT = 106
/** The script refuses an index past 6. */
const LAST_INDEX = 6

/** Read a map's `.bats`. */
export function readLighting(data: Uint8Array): Lighting {
  const table = readDataTable(data)
  let mode: Lighting['mode']
  let gradientCentreOffset = 0
  const slots = new Map<number, LightingSlot>()
  const fog = new Map<number, FogSlot>()
  for (const record of table.records) {
    const int = (i: number) => (record.values[i] ?? 0) | 0
    const float = (i: number) => record.floats[i] ?? 0
    const need = (count: number) => {
      if (record.values.length < count) {
        throw new GameFormatError(
          `lighting: tag ${record.tag} has ${record.values.length} values, fewer than ${count}`,
          record.offset,
        )
      }
    }
    if (record.tag === TAG_ADVANCED || record.tag === TAG_BASIC) {
      need(1)
      mode = record.tag === TAG_ADVANCED ? 'advanced' : 'basic'
      gradientCentreOffset = float(0)
    } else if (record.tag === TAG_ADVANCED_SLOT) {
      need(18)
      const index = int(0)
      if (index > LAST_INDEX) continue
      const light = (at: number): Light => ({
        on: int(at) !== 0,
        direction: [float(at + 1), float(at + 2), float(at + 3)],
        colour: int(at + 4),
      })
      slots.set(index, {
        index,
        light1: light(1),
        light0: light(6),
        background: int(11),
        horizon: int(12),
        ambient: int(13),
        unknown_colour4: int(14),
        sprite: int(15),
        model: int(16),
        edge: int(17),
      })
    } else if (record.tag === TAG_BASIC_SLOT) {
      need(12)
      const index = int(0)
      if (index > LAST_INDEX) continue
      slots.set(index, {
        index,
        background: int(4) & 0xffff,
        horizon: int(5) & 0xffff,
        potsAndBarrels: int(6) & 0xffff,
        sprite: int(9) & 0xffff,
        model: int(10) & 0xffff,
        edge: int(11) & 0xffff,
      })
    } else if (record.tag === TAG_FOG) {
      need(15)
      const index = int(0)
      if (index > LAST_INDEX) continue
      fog.set(index, {
        index,
        on: int(1) !== 0,
        colour: int(2),
        type: int(3),
        depthShift: int(4),
        offset: int(5),
        density: Array.from({ length: 8 }, (_, i) => record.values[6 + i] ?? 0),
        alpha: int(14),
      })
    }
  }
  return { mode, gradientCentreOffset, slots, fog }
}
