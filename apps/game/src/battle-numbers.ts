/**
 * **The numbers that rise over a fighter** when a blow lands or a spell mends
 * — read from the game's code (US ARM9 `0x02039f04` to `0x0203a6xx`, spawned
 * from overlay 25) on 29 September 2026. FORMAT.md, "The battle's numbers",
 * has the evidence. Everything here is in the DS's own screen pixels and its
 * own frames; the caller scales and times it.
 *
 * - **Five kinds, each a sheet of ten digits and a frame behind them**, in
 *   `/data/bin/btarc.nsarc` (the table at `0x020e7844`) — see {@link NUMBER_SHEETS}.
 * - **Spawned at the top of the fighter's body** — its place, raised by its
 *   height — with a pixel offset that steps with each further hit on it
 *   (`0x021eeea4`, `0x021eeebc`); a value of 0 makes none.
 * - **It lives 37 frames**: hidden for 3, solid for 26, fading for 4
 *   (`func_02039fec`, `func_0203a0b4`).
 * - **Its digits pop in from the left**, 3 frames apart, each swelling to
 *   double for three frames (`0x020e7830`); **the frame behind springs**
 *   from 1.2 to rest at 1.
 */

/** A number's kind, the game's order: damage, MP damage, recovery, MP recovery, tension. */
export type NumberKind = 0 | 1 | 2 | 3 | 4

/** Each kind's digits and frame, by sheet name in `btarc.nsarc`. INFERRED: `_m` is MP, by the blue. */
export const NUMBER_SHEETS: readonly { readonly digits: string; readonly frame: string }[] = [
  { digits: 'damage_num', frame: 'damage_waku' },
  { digits: 'damage_m_num', frame: 'damage_m_waku' },
  { digits: 'recovery_num', frame: 'recovery_waku' },
  { digits: 'recovery_m_num', frame: 'recovery_m_waku' },
  { digits: 'tension_num', frame: 'tension_waku' },
]

/** One number showing, as the game's ring of sixteen keeps it (`+0x550`, `0x18` bytes each). */
export interface RisingNumber {
  readonly value: number
  readonly kind: NumberKind
  /** Where it rises from, in the world: the top of the fighter. */
  readonly at: readonly [number, number, number]
  /** Its pixel offset, for a further hit on the same fighter. */
  readonly dx: number
  readonly dy: number
  /** Frames left: 37 at first (`0x25`). */
  readonly timer: number
  /** The frame behind: its scale and its spring's speed, ×4096 (`0x1333`, `0x333`). */
  readonly scale: number
  readonly speed: number
}

/** How many frames a number lives. */
export const NUMBER_LIFE = 0x25
/** The offsets a fighter's second, third … hit's number takes (`0x021eeea4`, `0x021eeebc`). */
const HIT_DX = [0, -16, 16, 0, -16, 16]
const HIT_DY = [0, 8, 16, 24, 32, 40]
/** How much a digit swells, frame by frame, as it pops in (`0x020e7830`). */
const POP = [0.5, 1, 1, 1, 0.5]

/** A number over a fighter: undefined for 0, which the game shows none of. `hit` counts from 0. */
export function risingNumber(
  value: number,
  kind: NumberKind,
  at: readonly [number, number, number],
  hit = 0,
): RisingNumber | undefined {
  if (value <= 0) return undefined
  const step = Math.min(hit, HIT_DX.length - 1)
  return {
    value: Math.min(value, 0xffff),
    kind,
    at,
    dx: HIT_DX[step] ?? 0,
    dy: HIT_DY[step] ?? 0,
    timer: NUMBER_LIFE,
    scale: 0x1333,
    speed: 0x333,
  }
}

/** One of the game's frames: the frame's spring, and the timer; undefined once it is gone. */
export function numberFrame(number: RisingNumber): RisingNumber | undefined {
  const timer = number.timer - 1
  if (timer <= 0) return undefined
  const scale = number.scale + number.speed
  const speed = Math.trunc((number.speed + ((0x1000 - scale) >> 1)) * 0.8)
  return { ...number, timer, scale, speed }
}

/** A sprite to draw, in the DS's pixels: its sheet, frame, top-left, scale and alpha out of 31. */
export interface NumberSprite {
  readonly sheet: string
  readonly frame: number
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly alpha: number
}

/**
 * **What a number draws**, its fighter's top put at `(sx, sy)` on the DS's
 * screen (`func_0203a0b4`): moved by its offset and 20 up, kept 16 in from the
 * edges; its frame behind, centred, at its spring's scale; its digits 8 apart
 * and centred, each popping in 3 frames after the one to its left; all at
 * 31, fading by 7 a frame over its last four. Frame first, then the digits.
 */
export function numberSprites(number: RisingNumber, sx: number, sy: number): NumberSprite[] {
  if (number.timer >= NUMBER_LIFE - 2) return []
  const alpha = number.timer - 5 > 4 ? 31 : 7 * (number.timer - 5)
  if (alpha <= 0) return []
  const sheets = NUMBER_SHEETS[number.kind] ?? NUMBER_SHEETS[0]
  if (!sheets) return []
  const x = Math.max(16, Math.min(240, sx + number.dx))
  const y = Math.max(16, Math.min(176, sy + number.dy - 20))
  const s = number.scale / 0x1000
  const digits = String(number.value)
  const n = digits.length
  const shown = NUMBER_LIFE - 3 - number.timer
  const out: NumberSprite[] = [
    { sheet: sheets.frame, frame: 0, x: x - 16 * s, y: y - 8 * s - 8, scale: s, alpha },
  ]
  for (let j = 0; j < n; j++) {
    const since = shown - 3 * j
    if (since < 0) continue
    const t = POP[since] ?? 0
    // The ones digit at x + 4n − 8, each to its left 8 further.
    const fromRight = n - 1 - j
    out.push({
      sheet: sheets.digits,
      frame: Number(digits[j]),
      x: x + n * 4 - 8 - 8 * fromRight - 4 * t,
      y: y - 8 - 8 * t,
      scale: 1 + t,
      alpha,
    })
  }
  return out
}

/** The frame a number is nudged clear of the others on: 34, its first showing (`func_02039fec`). */
export const NUDGE_AT = 34

/**
 * **Nudge a number clear of the others** (`func_0203a5e8`), in the screen's
 * pixels: `screen` is where each number's fighter falls on the DS's screen,
 * undefined for one off it. Every number already showing counts, before or
 * after it — tension never against tension — and one is in the way nearer
 * than 8 across and 14 up or down, its height kept within 36 to 196. Tried
 * in the game's order: (0, 0), (24, −4), (0, 0), (24, −24), (0, 20),
 * (24, 16), (0, −20) … — and when all sixteen are taken, 80 down, untried.
 * The number's own offset, moved by what is found.
 */
export function nudged(
  numbers: readonly RisingNumber[],
  i: number,
  screen: readonly ({ readonly x: number; readonly y: number } | undefined)[],
): RisingNumber | undefined {
  const own = numbers[i]
  const at = screen[i]
  if (!own || !at) return own
  const clampY = (y: number) => Math.max(36, Math.min(196, y))
  const x = at.x + own.dx
  const y = at.y + own.dy
  const others = numbers.flatMap((other, m) => {
    const where = screen[m]
    if (m === i || !where) return []
    if (other.timer <= 0 || other.timer >= NUMBER_LIFE - 2) return []
    if (own.kind === 4 && other.kind === 4) return []
    return [{ x: where.x + other.dx, y: clampY(where.y + other.dy) }]
  })
  const hit = (dx: number, dy: number) => {
    const cy = clampY(y + dy)
    return others.some((o) => Math.abs(x + dx - o.x) < 8 && Math.abs(cy - o.y) < 14)
  }
  let dx = 0
  let dy = 0
  let n = 0
  let flip = false
  for (let tries = 0; tries < 16; tries++) {
    if (!hit(dx, dy)) break
    if (!flip) {
      dy = n * 20 - 4
      dx = 24
      n = -n
      flip = true
    } else {
      dy = n * 20
      dx = 0
      if (n <= 0) n -= 1
      flip = false
    }
  }
  return { ...own, dx: own.dx + dx, dy: own.dy + dy }
}
