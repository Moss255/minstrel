import { GameFormatError } from './errors.ts'
import { type Grammar, readGrammar } from './grammar.ts'

/**
 * The monsters' battle numbers and names: `/data/prm/mon_btldata.nat` and
 * `/data/prm/mon_data.gp2/mon_data_<lang>.nat`. Both open with the head word
 * the monster list does — the record count in its low 12 bits, the strings'
 * size in its upper 20 — and both hold 438 records, one a monster, in the same
 * order: each record's monster number agrees on all 438. See FORMAT.md,
 * "Monster data".
 *
 * **Battle numbers**, 132-byte records. What is read, and on what evidence:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | the monster's number, with bit 15 set on all 438 |
 * | `+0x02` | `u8` ×2 | each drop's chance, a step: the ordinary's, then the rare's — see {@link dropOneIn} |
 * | `+0x04` | `u16` ×2 | two item ids — its drops, the ordinary and the rare |
 * | `+0x08` | `u32` | experience |
 * | `+0x0C` | `u16` | gold |
 * | `+0x10`, bits 5–7 | | **how it chooses among its six ways** — see {@link MonsterBattle.aiType} |
 * | `+0x18` | `u16` ×6 | six action words, not established |
 * | `+0x5C` | `u16` | maximum HP |
 * | `+0x5E` | `u16` | maximum MP |
 * | `+0x60` | `u16` | attack |
 * | `+0x62` | `u16` | defence |
 * | `+0x64` | `u16` | agility |
 * | `+0x6C` | `u8` ×22 | **resistances**, a hundredth each, one an element — from the game's code |
 * | `+0x24` | `u32` | two statuses a blow of its can carry and a chance for each — bits 0–6 and 7–13, then 14–20 and 21–27; the chances are 0, 25, 50, 75 or 100. Read by `0x021eb124` |
 * | `+0x28` | `u8` ×2 | the least and most passes Knight Watch holds it — see {@link MonsterBattle.watchTurns} |
 * | `+0x82` | `u8` ×2 | copied along with them, not established; 0 on every monster looked at |
 *
 * **The five numbers from `+0x5C` and the resistances are no longer only
 * INFERRED.** The game builds a monster's battle status from this record at
 * `+0x2C` (`func_02089630`, called at overlay 0 `0x0215eed0`), reading HP at
 * that block's `+0x30`, MP `+0x32`, three more `u16`s to `+0x38`, and copying
 * 24 bytes from its `+0x40` — which are this record's `+0x5C` to `+0x64` and
 * `+0x6C`. See FORMAT.md, "Monster data", "Resistances".
 *
 * **The drops, experience, gold and five numbers are confirmed by a witness**:
 * a published guide's bestiary gives HP, MP, attack, defence, agility,
 * experience, gold and both drops for the seven monsters around Angel Falls,
 * and the records agree at every one — 49 numbers and 14 items. See FORMAT.md,
 * "Monster data".
 *
 * The rest of each record is carried as it is.
 */

const HEAD = 4
const BATTLE_RECORD = 132
const DATA_RECORD = 28

export interface MonsterBattle {
  readonly number: number
  readonly drops: readonly [number, number]
  /** Each drop's chance as a step, 0 to 7 — see {@link dropOneIn}. */
  readonly dropSteps: readonly [number, number]
  readonly exp: number
  readonly gold: number
  readonly actions: readonly number[]
  /**
   * How it chooses among its six ways — the game's own selector, bits 5 to 7
   * of the word at `+0x10`, which index eight handlers at `0x020f10b0` in the
   * ARM9 (`func_0208a91c`):
   *
   * | type | how it picks | of the 438 |
   * |---|---|---|
   * | 0 | the even weights, `43 42 43 43 42 43` | 96 |
   * | 1 | the falling weights, `68 58 48 38 27 17` | 281 |
   * | 2 | the steep weights, `210 29 10 4 2 1` | 2 |
   * | 4 | the fourth weights, `70 70 70 16 15 15` | 25 |
   * | 3 | in turn, by a count kept for the monster (`func_0208a52c`) | 9 |
   * | 7 | in turn, by a count kept for its group (`func_0208a840`) | 0 |
   * | 5 | a pair in turn, a coin within it (`func_0208a5d8`) | 22 |
   * | 6 | its first way, then a draw among the other five, by turns (`func_0208a700`) | 3 |
   *
   * The four weight tables are one array in the ARM9, `monsterActionWeights`
   * at `0x020e8caa` — see `readWeightTables`. **Not** {@link bossAi}, which was
   * INFERRED to select between the first two and does not: the two commonest
   * types fall on both sides of that bit, and Hexagoon — a boss — is type 0.
   */
  readonly aiType: number
  /**
   * Its **AI mode**, `+0x10` bits 3–4 (read 3 October 2026,
   * `func_ov000_02159d94`): 0 and 1 choose their way and its target as the
   * round begins, 2 at its own turn; each mode takes its own targeting
   * handler. 102, 253 and 83 of the 438; none is 3.
   */
  readonly aiMode: number
  /**
   * How many more actions it takes a round, `+0x10` bits 8–10, by the rule of
   * `func_ov000_0215f57c` (table `0x02182a6c`): 0 none; 1 one on a coin; 2
   * one; 3 two; 4 and 5, 6 and 7 one or two by a status bit.
   */
  readonly extraRule: number
  /** Which of its six ways it may use only once a group, `+0x10` bits 20–25. */
  readonly oncePerGroup: number
  /** Whether it weighs who last struck it in choosing whom (`+0x10` bit 26, `func_ov000_02154f30`). */
  readonly remembers: boolean
  readonly maxHp: number
  readonly maxMp: number
  readonly attack: number
  readonly defence: number
  readonly agility: number
  /**
   * What it takes of each of the game's 21 elements, in hundredths — index
   * `element − 1`; 22 bytes, the last not reached by any element. 100 is
   * whole, 0 immune, 125 a quarter more. The battle's `func_ov000_02156b38`
   * reads the byte for an action's element and divides by `100.0f`: a spell's
   * damage is multiplied by it, a change of state's accuracy likewise, and
   * what rides on a blow lands under its chance times it.
   *
   * From the actions that carry them: 1 fire (Frizz), 2 ice (Crack), 3 wind
   * (Woosh), 4 blast (Bang), 6 dark (Zam), **8 the plain Attack's**, 9 Dazzle,
   * 10 sleep, 13 Fuddle, 16 poison, 19 defence down (Kasap), 20 agility down.
   * 18 is attack down, from its rider's handler. The rest INFERRED or unknown.
   */
  readonly resistances: readonly number[]
  /**
   * Whether it fights as a boss does: bit 4 of the byte at `+0x27`. INFERRED
   * from where it is set: on 144 of the 159 boss-coded monsters and on the
   * five grotto bosses that carry ordinary codes (Equinox, Atlas, Shogum,
   * Trauminator, Nemean), and clear on the bosses' minions (scarlet fever,
   * octagoon, cannibelle …) and every other ordinary monster. The reference
   * battle emulator draws its own boss's ways, Ragin' Contagion's, by the
   * falling weight table and every other monster's by the even one; this bit
   * is set on it. See FORMAT.md, "Battle weight tables".
   *
   * **It does not choose the weight table**, which was INFERRED here until the
   * game's own selector was read: that is {@link aiType}, and it cuts across
   * this bit.
   *
   * **Nothing in the ROM reads it.** It is bit 28 of the word at `+0x24`,
   * whose other bits are two statuses a blow can carry and a chance for each;
   * the one function that reads that word (`0x021eb124`) never touches bit 28,
   * and a search of the ARM9 and all 35 overlays — by byte, by halfword, by
   * word, and through every function handed the record — found no other
   * reader. It still says *boss* by where it is set, and says nothing to the
   * game.
   */
  readonly bossAi: boolean
  /**
   * **How long Knight Watch holds it**, the least and the most of its own
   * passes — the bytes at `+0x28` and `+0x29`, which the Paladin's coup draws
   * between (`func_ov024_021e1de8`, `0x021e1e34`–`0x021e1e40`, by
   * `NextRandomBetween`, the record being the combatant's `+0x148`). A draw
   * of 0 leaves it unwatched.
   */
  readonly watchTurns: readonly [number, number]
  /** The whole record, for what is not read. */
  readonly raw: Uint8Array
}

/**
 * A monster's names. **Names**, 28-byte records:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | the name's offset from the strings |
 * | `+0x04` | `u32` | the code's |
 * | `+0x08` | `u16` | the monster's number |
 * | `+0x0A` | 10 bytes | not established |
 * | `+0x14` | `u32` | the plural's offset — `slimes`; a string's start on all 438 in all five languages |
 * | `+0x18` | `u32` | its grammar: articles and gender, see `readGrammar` |
 */
export interface MonsterName {
  readonly number: number
  readonly name: string
  readonly plural: string
  readonly code: string
  /** Its articles and gender — see `readGrammar`. */
  readonly grammar: Grammar
  /** `+0x0A`, two bytes not established. */
  readonly unknown_0x0a: Uint8Array
  /**
   * Its **family**, 0–15 — `+0x0A`'s halfword, bits 7–10 — and whether its
   * body is **metal**, bit 12. Read 2 October 2026 (USA): the abilities' damage
   * handlers ask them (`func_ov000_02156068`); bit 12 is set on the metal
   * slimes' family alone, and each family-slaying ability's name matches its
   * family's monsters. The low seven bits are the monster's level (INFERRED,
   * `docs/conformance.md`, "Tension, modelled").
   */
  readonly family: number
  readonly metal: boolean
  /**
   * Its **level**, `+0x0A`'s low seven bits — what the handlers and tension's
   * bonus take as a monster's level (`func_ov000_02159dbc`, `0x02159e50`; read
   * 3 October 2026). A legacy boss's is its map's, not this.
   */
  readonly level: number
  /**
   * `+0x0C`, its body's radius, in `fx32`: the record's `s16` in 1024ths,
   * shifted up by two — read from overlay 17's `func_ov017_021a2128`, which
   * hands it to `Object3D::SetRadius` so (docs/binaries.md, "A monster's
   * body"). Overlay 0 lines monsters up in battle by it.
   */
  readonly radius: number
  /** `+0x0E`, its body's height, an `s16` in `fx32` — handed to `Object3D::SetHeight`, as above. */
  readonly height: number
  /**
   * `+0x10`, a `u16`: **its kind**, one value to a monster across its story
   * versions — 1 to `0x133`, the bosses `0x101` (the hexagoon) on. Read 6
   * October 2026 (USA): overlay 0's `func_ov000_0215fc8c` compares it, on each
   * monster object's record (`+0x144`, stored by `func_02048850`), with the
   * keys of overlay 26's fixed shots — see {@link readFixedShots}. INFERRED:
   * that it is the bestiary's kind; the code only compares it.
   */
  readonly kind: number
  /**
   * `+0x12`, its size in battle, an `s16` in 4096ths — 1.0 for the slime,
   * 3.12 for the hexagoon. Read 1 October 2026 (USA): `func_02048588` copies
   * it onto the battle object's `+0x18e` (`0x02048608`), which the close-up's
   * distance, the effects' scale and the shadow are made from.
   */
  readonly size: number
}

function head(bytes: Uint8Array, record: number, what: string) {
  if (bytes.length < HEAD)
    throw new GameFormatError(`${what} is ${bytes.length} bytes, shorter than its head`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const word = view.getUint32(0, true)
  const count = word & 0xfff
  const size = word >>> 12
  const strings = HEAD + count * record
  if (strings + size !== bytes.length) {
    throw new GameFormatError(
      `${what} says ${count} records and ${size} bytes of strings, which is not its ${bytes.length} bytes`,
      0,
    )
  }
  return { view, count, strings }
}

/** Parse the monsters' battle numbers. */
export function readMonsterBattle(bytes: Uint8Array): MonsterBattle[] {
  const { view, count } = head(bytes, BATTLE_RECORD, 'monster battle data')
  const out: MonsterBattle[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * BATTLE_RECORD
    const u16 = (offset: number) => view.getUint16(at + offset, true)
    out.push({
      number: u16(0) & 0x7fff,
      drops: [u16(4), u16(6)],
      dropSteps: [bytes[at + 2] as number, bytes[at + 3] as number],
      exp: view.getUint32(at + 8, true),
      gold: u16(12),
      actions: [0, 1, 2, 3, 4, 5].map((i) => u16(0x18 + i * 2)),
      aiType: (view.getUint32(at + 0x10, true) >>> 5) & 7,
      aiMode: (view.getUint32(at + 0x10, true) >>> 3) & 3,
      extraRule: (view.getUint32(at + 0x10, true) >>> 8) & 7,
      oncePerGroup: (view.getUint32(at + 0x10, true) >>> 20) & 63,
      remembers: ((view.getUint32(at + 0x10, true) >>> 26) & 1) === 1,
      maxHp: u16(0x5c),
      maxMp: u16(0x5e),
      attack: u16(0x60),
      defence: u16(0x62),
      agility: u16(0x64),
      resistances: [...bytes.subarray(at + 0x6c, at + 0x6c + 22)],
      bossAi: ((bytes[at + 0x27] as number) & 0x10) !== 0,
      watchTurns: [bytes[at + 0x28] as number, bytes[at + 0x29] as number],
      raw: bytes.subarray(at, at + BATTLE_RECORD),
    })
  }
  return out
}

/**
 * A drop's chance, as "one in so many", from its step at `+0x02`: 0 always, 1
 * to 6 one in `2 ** (step + 2)` — 1 in 8 to 1 in 256 — and 7 none.
 *
 * **The game's own**: the table of eight words at `0x021fd888` in overlay 23,
 * `1 8 16 32 64 128 256 0`, which its drop roll indexes by this byte —
 * `func_ov023_021f454c`, and nothing else in the ROM holds that table. It was
 * read first from a published guide's bestiary, which prints the same chance
 * at every one of 20 drops checked and "100%" for step 0.
 *
 * 7 is 0 in the table, so it never drops; it sits beside no item on every
 * record but ten legacy and grotto bosses', whose drops that routine takes
 * another way. See `packages/sim/src/battle/drops.ts` for the roll.
 */
export function dropOneIn(step: number): number | undefined {
  if (step === 0) return 1
  if (step >= 1 && step <= 6) return 2 ** (step + 2)
  return undefined
}

/** Parse the monsters' names: each one's number, name, plural, code and grammar. */
export function readMonsterNames(bytes: Uint8Array): MonsterName[] {
  const { view, count, strings } = head(bytes, DATA_RECORD, 'monster names')
  const text = (offset: number, at: number): string => {
    const start = strings + offset
    if (start >= bytes.length || (offset > 0 && bytes[start - 1] !== 0)) {
      throw new GameFormatError(`offset ${offset} does not start a string`, at)
    }
    let out = ''
    for (let i = start; i < bytes.length && bytes[i] !== 0; i++)
      out += String.fromCharCode(bytes[i] as number)
    return out
  }
  const out: MonsterName[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * DATA_RECORD
    out.push({
      name: text(view.getUint32(at, true), at),
      code: text(view.getUint32(at + 4, true), at + 4),
      number: view.getUint16(at + 8, true),
      plural: text(view.getUint32(at + 0x14, true), at + 0x14),
      grammar: readGrammar(view.getUint32(at + 0x18, true)),
      unknown_0x0a: bytes.subarray(at + 0x0a, at + 0x0c),
      family: (view.getUint16(at + 0x0a, true) >> 7) & 15,
      metal: ((view.getUint16(at + 0x0a, true) >> 12) & 1) === 1,
      level: view.getUint16(at + 0x0a, true) & 0x7f,
      radius: view.getInt16(at + 0x0c, true) * 4,
      height: view.getInt16(at + 0x0e, true),
      kind: view.getUint16(at + 0x10, true),
      size: view.getInt16(at + 0x12, true),
    })
  }
  return out
}
