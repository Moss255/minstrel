/**
 * **The inn and the church**, as the player meets them — read 4 October 2026
 * from overlay 3 (`func_ov003_0215c924`, the inn; `func_ov003_02158e94`, the
 * church), the text from the European cartridge. Their flows run in
 * `main.ts`; what they decide is here.
 *
 * **`<INN=n>` and `<CHURCH=n>` choose the keeper's own words**: the file
 * `n − 1` — `/data/scenario/str_in<k>.gp2` › `str_in<k>_en.nat`, or
 * `str_ch<k>` — which holds the keeper's lines, the inn's price a head (its
 * line 10000) and which of the church's services there are (an empty label is
 * left out). Eight churches' voices, fifteen inns'.
 *
 * - **The inn** (`0x0217fe94`): Stay Overnight, Rest or Cancel by day; Stay
 *   or Cancel at night (line 0, 1, 2). The price is **a head's price times
 *   those living**, paid once Stay or Rest is chosen; both fill the living's HP
 *   and MP — never raising the dead, nor touching poison or a curse — play
 *   jingle 55, and put the clock at the day's start (Stay) or the night's
 *   (Rest). Lines: 1010 paid, 1020 too poor, 1011 after, 1090 cancelled.
 * - **The church** (`0x02158f80`): Confession (Save), Divination,
 *   Resurrection, Purification, Benediction, Nothing — labels 0 to 5. Each
 *   cure asks whom (1030, 1040, 1050), says its price (1061), prays (the base
 *   + 1) to jingle 59, and goes back to the menu (1070); a member it is not
 *   wanted for gets the base + 2.
 */

/** The inn's menu: Stay Overnight, Rest, Cancel — its words are lines 0, 1 and 2. */
export const INN_STAY = 0
export const INN_REST = 1
export const INN_CANCEL = 2

/** The inn's choices: all three by day; no Rest at night (`0x0215df1c`). */
export function innChoices(night: boolean): readonly number[] {
  return night ? [INN_STAY, INN_CANCEL] : [INN_STAY, INN_REST, INN_CANCEL]
}

/** The inn's lines, `str_in`. */
export const INN_SAYS = {
  dayGreeting: 1000,
  nightGreeting: 1001,
  paid: 1010,
  after: 1011,
  tooPoor: 1020,
  cancel: 1090,
  /** The price a head, as text. */
  perHead: 10000,
} as const

/** The jingle a night at the inn plays (`0x0215d6xx`, `func_0209c6d8(…, 0x37)`), and its hold, 180 ticks. */
export const INN_JINGLE = 0x37
export const INN_HOLD_MS = (180 * 1000) / 60

/**
 * What a night costs: the keeper's own price a head — its line 10000, read
 * with `atoi`, 1 where there is no such line — times **the living**
 * (`0x0215d0d4`–`0x0215d108`, `func_ov003_0215e1ec`). The Quester's Rest's is a
 * flat 3 a head.
 */
export function innPrice(
  perHeadLine: string | undefined,
  living: number,
): { readonly perHead: number; readonly total: number } {
  const parsed = perHeadLine === undefined ? Number.NaN : Number.parseInt(perHeadLine, 10)
  const perHead = Number.isFinite(parsed) ? parsed : 1
  return { perHead, total: perHead * living }
}

/** The church's six labels, and what each is. */
export const CHURCH_SERVICES = [
  'confession',
  'divination',
  'resurrection',
  'purification',
  'benediction',
  'nothing',
] as const
export type ChurchService = (typeof CHURCH_SERVICES)[number]

/** The church's menu: its six labels, less any its file leaves empty (`0x02159a94`). */
export function churchChoices(label: (n: number) => string | undefined): readonly number[] {
  return CHURCH_SERVICES.map((_, n) => n).filter((n) => (label(n) ?? '').trim() !== '')
}

/** The church's lines, `str_ch`. */
export const CHURCH_SAYS = {
  dayGreeting: 1000,
  nightGreeting: 1001,
  confess: 1010,
  saved: 1011,
  declined: 1012,
  goOn: 1013,
  farewellToRest: 1014,
  divine: 1020,
  needs: 1021,
  mastered: 1022,
  nextBattle: 1023,
  cancelled: 1060,
  price: 1061,
  refused: 1062,
  tooPoor: 1063,
  anythingElse: 1070,
  farewell: 1090,
  saving: 100,
  /** A vocation's name in the church's own words: this plus its number. */
  vocation: 30,
} as const

/** Each cure's first line — whom? — then the prayer is +1 and "not wanted" +2. */
export const CURE_BASE: Readonly<Record<'resurrection' | 'purification' | 'benediction', number>> =
  {
    resurrection: 1030,
    purification: 1040,
    benediction: 1050,
  }

/** The jingle a cure is prayed to (`func_0209c830(…, 0x3B)`). */
export const CHURCH_JINGLE = 0x3b

/**
 * What a cure costs, by the member's level in their vocation `L`
 * (`0x0215a8e0`–`0x0215a99c`): to raise the dead `⌊(L² + 20) / 20⌋ × 10`,
 * to cure poison 5, to lift a curse `30 × L`.
 */
export function curePrice(
  cure: 'resurrection' | 'purification' | 'benediction',
  level: number,
): number {
  if (cure === 'resurrection') return Math.floor((level * level + 20) / 20) * 10
  if (cure === 'purification') return 5
  return 30 * level
}
