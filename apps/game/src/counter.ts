/**
 * **Erinn's counter and the bank**, at the Quester's Rest — read 4 October
 * 2026 from overlay 3 (US code; the European cartridge's text). Their flows
 * run in `main.ts`; what they decide is here.
 *
 * **The counter** (`<RIKKA>`, code 6; `<RIKKAFIRST>`, 12, the same flow and on
 * no line; service 42, its steps at `0x0217f578`): "What can I do for you
 * today?" (`strstd` 68), and the menu, `str_rkm` 92 — Stay at the inn, Canvass
 * for guests, View the guestbook, Leave. **Stay** runs the inn's own flow with
 * its Quester's Rest switch on — `str_rki`'s words, **3 gold a head** for the
 * living — and its Leave, or too little gold, comes back to the counter
 * (`str_rkm` 41); **Leave** says 28. Canvassing and the guestbook are tag mode,
 * and multiplayer.
 *
 * **The bank** (`<BANK>`, code 3; service 17, `func_02168438`): Ginny's
 * Rainbow's End Gold Bank, `str_bank`. The gold banked is `GameState+0x396c`,
 * at most 999,999,000; the purse's most is 9,999,999. Deposit and Withdrawal
 * in **thousands, set four digits at a time**; one a visit. **Banked gold is
 * spared at a wipe-out**: the halving touches only the purse (`func_02010604`,
 * `0x020106e4`).
 */

/** The most the purse holds, and the vault. */
export const PURSE_MOST = 9_999_999
export const BANK_MOST = 999_999_000
/** The bank's unit. */
export const THOUSAND = 1000

/** The counter's lines: `str_rkm`, and its greeting from `strstd`. */
export const COUNTER_SAYS = { greeting: 68, menu: 92, again: 41, leave: 28 } as const
/** The counter's menu, by its place in line 92. */
export const COUNTER_STAY = 0
export const COUNTER_CANVASS = 1
export const COUNTER_GUESTBOOK = 2
export const COUNTER_LEAVE = 3

/** The Quester's Rest inn's price a head, a constant in code (`0x0215d0c4`). */
export const REST_PER_HEAD = 3

/** Erinn's inn's lines, `str_rki`. */
export const REST_SAYS = {
  staffRate: 100,
  welcome: 101,
  offer: 102,
  welcomeAtNight: 104,
  offerAtNight: 105,
  paid: 106,
  morning: 107,
  tooPoor: 108,
  rested: 109,
  changedMind: 110,
} as const

/** The labels of a `<N=i>…</N>` menu line, by place — `str_rkm` 92. */
export function menuLabels(line: string | undefined): string[] {
  return [...(line ?? '').matchAll(/<N=(\d+)>(.*?)<\/N>/g)].map((m) => m[2] ?? '')
}

/** The bank's lines, `str_bank`. */
export const BANK_SAYS = {
  deposit: 0,
  withdrawal: 1,
  leave: 2,
  welcome: 1000,
  nothingBanked: 1001,
  banked: 1002,
  askDeposit: 1010,
  deposited: 1011,
  vaultLimit: 1014,
  tooPoorToDeposit: 1013,
  vaultFull: 1015,
  askWithdraw: 1020,
  withdrawn: 1021,
  nothingToWithdraw: 1023,
  purseFull: 1024,
  changedMind: 1030,
  farewellEmpty: 1090,
  farewell: 1091,
} as const

/**
 * What a deposit or a withdrawal may be, at most, in thousands — or the line
 * that refuses it (`0x02168d9c`–`0x02169030`).
 */
export function bankLimit(
  kind: 'deposit' | 'withdrawal',
  purse: number,
  banked: number,
): { readonly most: number } | { readonly refused: number } {
  if (kind === 'deposit') {
    if (banked >= BANK_MOST) return { refused: BANK_SAYS.vaultFull }
    if (purse < THOUSAND) return { refused: BANK_SAYS.tooPoorToDeposit }
    return { most: Math.floor(purse / THOUSAND) }
  }
  if (banked === 0) return { refused: BANK_SAYS.nothingToWithdraw }
  if (purse >= 9_999_000) return { refused: BANK_SAYS.purseFull }
  return { most: Math.min(Math.floor(banked / THOUSAND), 9999 - Math.floor(purse / THOUSAND)) }
}

/**
 * **The bank's number window**: four digits of thousands, the cursor under one
 * (`func_02169eec`) — it starts on the last, at 0000. Up and down turn the
 * digit, wrapping; left and right move the cursor, and left past the first sets
 * the most, right past the last sets nothing; any value over the most is held
 * to it. **INFERRED**: a step of one a press, wrapping, as the touch path's
 * own code does.
 */
export interface Digits {
  readonly digits: readonly [number, number, number, number]
  readonly column: number
  /** The most, in thousands. */
  readonly most: number
}

export function newDigits(most: number): Digits {
  return { digits: [0, 0, 0, 0], column: 3, most }
}

/** The value set, in thousands. */
export const digitsValue = (d: Digits): number =>
  d.digits[0] * 1000 + d.digits[1] * 100 + d.digits[2] * 10 + d.digits[3]

const fromValue = (value: number): [number, number, number, number] => [
  Math.floor(value / 1000) % 10,
  Math.floor(value / 100) % 10,
  Math.floor(value / 10) % 10,
  value % 10,
]

/** A press on the window: up or down turn the digit under the cursor, left or right move it. */
export function pressDigits(d: Digits, key: 'up' | 'down' | 'left' | 'right'): Digits {
  if (key === 'left') {
    if (d.column === 0) return { ...d, digits: fromValue(d.most) }
    return { ...d, column: d.column - 1 }
  }
  if (key === 'right') {
    if (d.column === 3) return { ...d, digits: [0, 0, 0, 0] }
    return { ...d, column: d.column + 1 }
  }
  const digits = [...d.digits] as [number, number, number, number]
  const turned = ((digits[d.column] as number) + (key === 'up' ? 1 : 9)) % 10
  digits[d.column] = turned
  const value = digitsValue({ ...d, digits })
  return { ...d, digits: value > d.most ? fromValue(d.most) : digits }
}
