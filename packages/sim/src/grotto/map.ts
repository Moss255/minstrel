import type { TreasureMapTables } from '@minstrel/game-formats'

/**
 * **A treasure map's grotto, from its two numbers** — the seed and the
 * quality a map is kept as (`TreasureMapMetadata`, 28 bytes in the save),
 * through `DetailedTreasureMapData::RegularMapData::Populate` and its helpers
 * (the decomp's `DetailedTreasureMapData.cpp`, complete), read 11 October 2026.
 *
 * `srand(seed)`, then each of these draws from the game's `rand` in turn, each
 * from a table of `tdata_<LG>.pac` (see `readTreasureMapTables`):
 *
 * - an unknown value, a draw for each of its twelve entries — every chance on
 *   the cartridge is 0, so it is always 1 (`GenerateUnknownData`);
 * - the environment, 1 to 5 — caves, ruins, ice, water, fire — by a draw out
 *   of 100 over each environment's chance;
 * - the floor count, the starting monster rank and the boss, each from the row
 *   whose quality range holds the map's quality; the boss by the weights of
 *   that row's bosses;
 * - twelve chest ranks, which nothing reads;
 * - the name's three parts: a prefix by the monster rank, a suffix by the
 *   boss, a "locale" by the floor count;
 * - and the level: `rand() % 11 − 5 + (floors + rank + boss − 4) × 3`,
 *   held between 1 and 99.
 *
 * The name is the prefix, the locale (one string for each environment) and the
 * suffix, in that order in English. The level's words are the game's string
 * 1011 and are not read here.
 */

/** A regular treasure map's grotto. */
export interface GrottoDetails {
  readonly seed: number
  readonly quality: number
  /** 1 caves, 2 ruins, 3 ice, 4 water, 5 fire: the `Z0n` of its pieces. */
  readonly environment: number
  readonly floors: number
  readonly monsterRank: number
  /** 1 to 12. */
  readonly boss: number
  /** The boss's monster number. */
  readonly bossMonster: number
  readonly prefix: number
  readonly suffix: number
  readonly locale: number
  readonly level: number
  /** The name without its level — the three parts, joined as the language joins them. */
  readonly name: string
  /** The value nothing on the cartridge sets (`unknown_66_`): always 1. */
  readonly unknown_66: number
}

/** The game's `rand`, seeded. */
class Rand {
  private next: number
  constructor(seed: number) {
    this.next = seed >>> 0
  }
  draw(): number {
    this.next = (Math.imul(this.next, 0x41c64e6d) + 0x3039) >>> 0
    return (this.next >>> 16) & 0x7fff
  }
  /** `RandATRangeModular`: `min + rand() % (max − min + 1)`, unsigned. */
  range(min: number, max: number): number {
    const span = (max - min + 1) >>> 0
    const r = this.draw()
    return (min + (span === 0 ? 0 : r % span)) >>> 0
  }
}

/** A reader over the tables, as `TMAPLANGDATA_READ` advances. */
class Cursor {
  constructor(
    private readonly bytes: Uint8Array,
    public at: number,
  ) {}
  u8(): number {
    return this.bytes[this.at++] ?? 0
  }
  u16(): number {
    const v = (this.bytes[this.at] ?? 0) | ((this.bytes[this.at + 1] ?? 0) << 8)
    this.at += 2
    return v
  }
  i32(): number {
    const b = this.bytes
    const v =
      (b[this.at] ?? 0) |
      ((b[this.at + 1] ?? 0) << 8) |
      ((b[this.at + 2] ?? 0) << 16) |
      ((b[this.at + 3] ?? 0) << 24)
    this.at += 4
    return v
  }
  text(length: number): string {
    let out = ''
    for (let i = 0; i < length; i++) out += String.fromCharCode(this.bytes[this.at + i] ?? 0)
    this.at += length
    return out
  }
}

/** A row of a range table: the first whose range holds `key` gives a draw between its other two. */
function fromRanges(
  tables: TreasureMapTables,
  at: number,
  key: number,
  rand: Rand,
): number | undefined {
  const c = new Cursor(tables.bytes, at)
  const count = c.u16()
  for (let i = 0; i < count; i++) {
    const low = c.u8()
    const high = c.u8()
    const min = c.u8()
    const max = c.u8()
    if (low <= key && key <= high) return rand.range(min, max) & 0xff
  }
  return undefined
}

/** `RegularMapData::Populate`: everything a regular map's two numbers make. */
export function grottoDetails(
  tables: TreasureMapTables,
  seed: number,
  quality: number,
): GrottoDetails {
  const o = tables.offsets
  const rand = new Rand(seed & 0xffff)

  // `GenerateUnknownData`: a draw for each entry, until one's chance is met.
  let unknown_66 = 1
  {
    const c = new Cursor(tables.bytes, o.unknown_18)
    const count = c.u16()
    for (let i = 0; i < count; i++) {
      c.u8()
      const value = c.u8()
      const chance = c.u8()
      if (rand.draw() % 100 < chance) {
        unknown_66 = value
        break
      }
    }
  }

  // `GenerateEnviron`: one draw out of 100, over the environments' chances.
  let environment = 0
  {
    const roll = (rand.draw() % 100) & 0xff
    const c = new Cursor(tables.bytes, o.environs)
    const count = c.u16()
    let percentile = 0
    for (let i = 0; i < count; i++) {
      const which = c.u8()
      const chance = c.u8()
      if (roll < chance + percentile) {
        environment = which
        break
      }
      percentile = (percentile + chance) & 0xff
    }
  }

  const floors = fromRanges(tables, o.floorRangesByQuality, quality, rand) ?? 0
  const monsterRank = fromRanges(tables, o.startingMonsterRanksByQuality, quality, rand) ?? 0

  // `GenerateBoss`: the row's bosses by weight.
  let boss = 0
  let bossMonster = 0
  {
    const c = new Cursor(tables.bytes, o.bossRangesByQuality)
    const count = c.u16()
    for (let i = 0; i < count && boss === 0; i++) {
      const low = c.u8()
      const high = c.u8()
      const min = c.u8()
      const max = c.u8()
      if (low > quality || quality > high) continue
      const entry = (n: number) => {
        const e = new Cursor(tables.bytes, (n - 1) * 4 + 2 + o.bossIDsAndWeights)
        e.u8()
        const monster = e.u16()
        const weight = e.u8()
        return { monster, weight }
      }
      let total = 0
      for (let n = min; n <= max; n++) total = (total + entry(n).weight) & 0xffff
      // A zero total still spends its draw: the runtime's remainder by zero is 0.
      const drawn = rand.draw()
      const roll = total === 0 ? 0 : drawn % total
      let sum = 0
      for (let n = min; n <= max; n++) {
        const { monster, weight } = entry(n)
        if (roll < weight + sum) {
          boss = n
          bossMonster = monster
          break
        }
        sum = (sum + weight) & 0xffff
      }
      // A matching row decides, whatever it chose.
      break
    }
  }

  // `GenerateUnusedChestRanks`: twelve draws, when the table has twelve rows.
  {
    const c = new Cursor(tables.bytes, o.chestRanksByMonsterRank)
    if (c.u16() === 12) {
      for (let i = 0; i < 12; i++) {
        c.u8()
        const min = c.u8()
        const max = c.u8()
        rand.range(min, max)
      }
    }
  }

  const prefix = fromRanges(tables, o.prefixRangesByMonsterRank, monsterRank, rand) ?? 0
  const suffix = fromRanges(tables, o.suffixRangesByBoss, boss, rand) ?? 0
  const locale = fromRanges(tables, o.localeRankRangesByFloorCount, floors, rand) ?? 0

  const sum = floors + monsterRank + boss
  const raw = (rand.draw() % 11) - 5 + (sum - 4) * 3
  const level = raw <= 0 ? 1 : raw > 99 ? 99 : raw

  return {
    seed: seed & 0xffff,
    quality,
    environment,
    floors,
    monsterRank,
    boss,
    bossMonster,
    prefix,
    suffix,
    locale,
    level,
    name: prefix && suffix && locale ? nameOf(tables, prefix, suffix, locale, environment) : '',
    unknown_66,
  }
}

/**
 * The name's three parts (`GenerateNameBuffers`): prefix, locale, suffix — the
 * order English and German take (`partOrder` 0, 2, 1); French, Italian and
 * Spanish put the locale first.
 */
function nameOf(
  tables: TreasureMapTables,
  prefix: number,
  suffix: number,
  locale: number,
  environment: number,
): string {
  const o = tables.offsets
  const part = (at: number, index: number) => {
    const c = new Cursor(tables.bytes, at)
    const count = c.u16()
    for (let i = 0; i < count; i++) {
      const which = c.u8()
      c.u16()
      const length = c.u16()
      if (which === index) return c.text(length)
      c.at += length
    }
    return ''
  }
  const place = () => {
    const c = new Cursor(tables.bytes, o.localeNames)
    const count = c.u16()
    for (let i = 0; i < count; i++) {
      const which = c.u8()
      for (let env = 1; env <= 5; env++) {
        c.u16()
        const length = c.u16()
        if (env === environment && which === locale) return c.text(length)
        c.at += length
      }
    }
    return ''
  }
  return part(o.prefixNames, prefix) + place() + part(o.suffixNames, suffix)
}

/** Where a map's grotto is: one of the 150 places a map can lead (`ExportDetailedTreasureMapData`). */
export interface GrottoPlace {
  /** The picture the map shows, `mapt_005`. */
  readonly image: string
  /** The field the entrance is in, by map id. */
  readonly map: number
  /** The entrance model's centre, in the game's `fx32` units; the party comes out 2 units (`+0x2000`) to +z of it. */
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A map's place by its number, 1 to 150, as the game reads the list (stopping at it); the last when past the end. */
export function grottoPlace(tables: TreasureMapTables, location: number): GrottoPlace | undefined {
  const c = new Cursor(tables.bytes, tables.offsets.mapLocations)
  const count = c.u16()
  let found: GrottoPlace | undefined
  for (let i = 1; i <= count; i++) {
    c.u16()
    const length = c.u16()
    const image = c.text(length)
    found = { image, map: c.i32(), x: c.i32(), y: c.i32(), z: c.i32() }
    if (i === location) break
  }
  return found
}
