/**
 * **Alltrades Abbey** — Jack of Alltrades' vocation change, as the player
 * meets it. Read 3 October 2026 from overlay 3's service 46 (US code; the
 * text from the European cartridge), whose seven steps the flow in `main.ts`
 * follows: `docs/party-and-vocations.md`, "The Abbey's own flow", has the
 * addresses.
 *
 * - **Reached by talking to Jack.** His line is a bare `<DAMA>`, facility
 *   code 9 in the table at `0x020f0afc` that `func_0206f550` matches tags
 *   against — mode 0. Code 10 is `<DAMA_SATORI>`, mode 1, the same change
 *   said by the "Voice of Vocation"; no line on the cartridge uses it, so it
 *   is not built.
 * - **His lines** are `str_dam`'s, by number ({@link ABBEY_SAYS}); the
 *   windows' words `bm_dama`'s labels ({@link ABBEY_LABELS}).
 * - **The gates are three game-wide flags** (`func_0206dfb0` on the bank at
 *   `+0x8c`, the bank record operations 100 and 101 set): {@link FLAG_OPEN},
 *   {@link FLAG_REVOCATION} and `VOCATION_FLAG + v`. No record and no script
 *   on the cartridge sets any of them — the game's code does, and where is
 *   not read. See {@link abbeyOpen} for what stands in.
 */

/** The lines, `str_dam` numbers. */
export const ABBEY_SAYS = {
  greet: 0,
  tooSoon: 1,
  wish: 2,
  content: 3,
  how: 4,
  adrift: 5,
  who: 6,
  cancel: 7,
  cursed: 8,
  which: 9,
  confirm: 10,
  again: 11,
  prayer: 12,
  done: 13,
  revocation: 14,
  revokeWho: 15,
  notMaster: 16,
  sure: 17,
  revokeCursed: 18,
  revokeConfirm: 19,
  revokeDoubt: 20,
  revokePrayer: 21,
  revoked: 22,
  reward: 23,
  receives: 24,
  farewell: 25,
  already: 48,
  dead: 49,
  revokeDead: 65,
  noneMaster: 66,
} as const

/** A vocation's name in his lines, `str_dam 35 + v`; its medal's, `52 + v`. */
export const vocationSaid = (vocation: number): number => 35 + vocation
export const medalSaid = (vocation: number): number => 52 + vocation

/** The windows' words, `bm_dama` labels: a vocation is label `v − 1`. */
export const ABBEY_LABELS = {
  yes: 12,
  no: 13,
  change: 14,
  revocate: 15,
  level: 16,
  heading: 18,
} as const

/** The menu Jack offers once revocation is open: Change Vocation, then Revocate (window 2, items 8 and 9). */
export type AbbeyChoice = 'change' | 'revocate'
export const ABBEY_MENU: readonly AbbeyChoice[] = ['change', 'revocate']

/** Event flag `0x799`: clear, Jack says it is too soon (step 0, `0x02156278`). */
export const FLAG_OPEN = 0x799
/** Event flag `0x796`: set, Jack offers the Change Vocation / Revocate menu; clear, a Yes or No (`0x02156a48`). */
export const FLAG_REVOCATION = 0x796

/**
 * Whether the Abbey is open to a change.
 *
 * **The game's test is flag {@link FLAG_OPEN}, and that is asked first.**
 * Nothing on the cartridge's records or scripts sets it, so the code that
 * does is the game's own and not read. **Ours**, standing in for it: open once
 * the Abbey's own story thread is at 7.1 or past it — chapter `G`, where
 * Jack's lines are his own self again (label 1 of `G0`: "When I took on that
 * monstrous form…"), and where `<DAMA>` stands on his file in every chapter
 * after.
 */
export function abbeyOpen(
  flag: (bit: number) => boolean,
  abbeyStage: { readonly major: number; readonly minor: number } | undefined,
): boolean {
  if (flag(FLAG_OPEN)) return true
  return (
    abbeyStage !== undefined &&
    (abbeyStage.major > 7 || (abbeyStage.major === 7 && abbeyStage.minor >= 1))
  )
}

/** The jingle the ceremony plays, both of them — `<ME_003>`'s id (`0x02157404`). */
export const ABBEY_JINGLE = 52

/**
 * How long the ceremony runs before the change is made: 140 ticks
 * (`0x02157420`), INFERRED a 60th of a second each.
 */
export const CEREMONY_MS = (140 * 1000) / 60

/**
 * The medal given the first time each vocation is revoked, by vocation — the
 * table at `0x0217f2e8`, each id's name agreeing with `str_dam 52 + v`.
 */
export const REVOCATION_MEDALS: ReadonlyMap<number, number> = new Map([
  [1, 18043],
  [2, 18044],
  [3, 18045],
  [4, 18046],
  [5, 18047],
  [6, 18048],
  [7, 18049],
  [8, 18051],
  [9, 18050],
  [10, 18053],
  [11, 18054],
  [12, 18052],
])

/** The level revocation asks for (`cmp r0, #0x63`, `0x02155ffc`). */
export const REVOCATION_LEVEL = 99

/** What a line of his is filled with. */
export interface AbbeyFill {
  /** The member he speaks of, `<TARGET>`. */
  readonly target: string
  /** `<IF_TARGET_M>` and the rest: by the target's sex — man, woman, or neither. */
  readonly sex: 'm' | 'f' | 'n'
  /** `<IF_SOLO>`: a party of one. */
  readonly solo: boolean
  /** `<str_2>`, the vocation chosen, as his lines name it. */
  readonly chosen?: string | undefined
  /** `<str_3>`, the target's vocation now. */
  readonly current?: string | undefined
  /** `<str_4>`, the medal given. */
  readonly medal?: string | undefined
  /**
   * The name `<IF_VOWEL_VOCATION>` is asked of: the chosen vocation's, and the
   * current one's in lines 16, 19 and 22 (`0x02155418`–`0x0215542c`).
   */
  readonly articleOf?: string | undefined
}

/**
 * One of his lines with its tags filled, as `func_ov003_021552b8` fills the
 * window's slots before putting it up — the rest (`<Cap>`, `<LEADER>`, the
 * pauses) left to the text engine.
 *
 * INFERRED: `<str_n>` reads value slot n − 1, which fits every line with no
 * exception; and the article test looks at the name's first letter.
 */
export function abbeyText(raw: string, fill: AbbeyFill): string {
  const vowel = /^[aeiou]/i.test(fill.articleOf ?? '')
  const bySex = (m: string, f: string, n: string) =>
    fill.sex === 'm' ? m : fill.sex === 'f' ? f : n
  return (
    raw
      // A line break written as the two characters backslash and n.
      .replaceAll('\\n', '\n')
      .replace(
        /<IF_SOLO>(.*?)<ELSE_NOT_SOLO>(.*?)<ENDIF_SOLO>/gs,
        (_, one: string, many: string) => (fill.solo ? one : many),
      )
      .replace(
        /<IF_TARGET_M>(.*?)<IF_TARGET_F>(.*?)<IF_TARGET_N>(.*?)<ENDIF_TARGET_MFN>/gs,
        (_, m: string, f: string, n: string) => bySex(m, f, n),
      )
      .replace(
        /<IF_VOWEL_VOCATION>(.*?)<ELSE_CONSONANT_VOCATION>(.*?)<ENDIF_VOWEL_VOCATION>/gs,
        (_, an: string, a: string) => (vowel ? an : a),
      )
      .replaceAll('<TARGET>', fill.target)
      .replaceAll('<str_2>', fill.chosen ?? '')
      .replaceAll('<str_3>', fill.current ?? '')
      .replaceAll('<str_4>', fill.medal ?? '')
  )
}
