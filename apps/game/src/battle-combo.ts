/**
 * **The combo display** — the count of a chain of blows, shown in the top
 * left of the battle's screen. Read 1 October 2026 from overlay 0 (USA):
 * `func_ov000_021823dc` starts it, `021824d8` keeps its timers each frame,
 * `0218251c` draws it, `02182498` sends it away; the sheets are
 * `bt_combo*.spr` in `data/bin/btarc.nsarc` (`func_ov000_0218214c`).
 *
 * It is started once an action, at its first damage number, by the chain's
 * count held to 3 (`func_ov025_021d8c30`, `0x021da794`): a level of 1 to 3
 * shows "2 / 3 / 4 combo" and "damage × 1.2 / 1.5 / 2"; 0 sends it away. It is
 * fixed in the corner, not over anyone; only its pieces' places move, and one
 * alpha in the change from one count to the next. **English only**: the
 * other languages' places are in the table at `0x021836d5`, not taken here.
 */

/** A piece drawn: its sheet, where on the DS's 256 × 192 screen its top left goes, and its alpha 0–31. */
export interface ComboPiece {
  readonly sheet: string
  readonly x: number
  readonly y: number
  readonly alpha: number
}

/** The display's state: its level, the one before, and its two timers, in frames. */
export interface Combo {
  level: number
  previous: number
  appear: number
  leave: number
}

export const NO_COMBO: Combo = { level: 0, previous: 0, appear: 0, leave: 0 }

/** The sound a level starts with, from the battle's own archive: 26, 23, 24 (`0x02182434` on). */
export const COMBO_SOUNDS = [0, 26, 23, 24] as const

/**
 * Start it at a level (`func_ov000_021823dc`): 1 to 3 shows that count from
 * its start — the same one still coming in does nothing — and 0 sends it
 * away. Returns whether a sound is due.
 */
export function startCombo(combo: Combo, level: number): boolean {
  const l = Math.min(level, 3)
  if (l > 0) {
    if (l === combo.level && combo.appear !== 0) return false
    combo.previous = combo.level
    combo.level = l
    combo.appear = 30
    combo.leave = 0
    return true
  }
  if (combo.level === 0) {
    combo.level = 0
    combo.previous = 0
    combo.appear = 0
    return false
  }
  leaveCombo(combo)
  return false
}

/** Send it away (`func_ov000_02182498`): it lets its coming in finish, then goes in five frames. */
export function leaveCombo(combo: Combo): void {
  if (combo.level !== 0 && combo.leave === 0) combo.leave = combo.appear + 5
}

/** A frame of its timers (`func_ov000_021824d8`). */
export function tickCombo(combo: Combo): void {
  if (combo.appear > 0) combo.appear--
  if (combo.leave > 0) {
    combo.leave--
    if (combo.leave === 0) {
      combo.level = 0
      combo.previous = 0
    }
  }
}

const f = Math.fround

/** Coming in from the left, in six frames: −64·((6 − u)/6)², truncated, in the game's floats. */
function slide(u: number): number {
  if (u >= 6) return 0
  const q = f(f(6 - u) / 6)
  return Math.trunc(f(-64 * f(q * q)))
}

/** Going away to the left: 2, 10, 23, 40 px as the leave timer runs 4 to 1. */
function away(e: number): number {
  if (e <= 0 || e >= 5) return 0
  const q = f(f(5 - e) / 5)
  return Math.trunc(f(64 * f(q * q)))
}

/** The multiplier's sheet and its place by level: `_12` and `_15` at 48, `_2` at 51 (English). */
const MULTIPLIERS = ['', 'bt_combo_12', 'bt_combo_15', 'bt_combo_2'] as const

/** **What it draws now** (`func_ov000_0218251c`), in the order the game draws them. */
export function comboPieces(combo: Combo): ComboPiece[] {
  const L = combo.level
  if (L === 0) return []
  const P = combo.previous
  const t = 30 - combo.appear
  const e = combo.leave
  const a = slide(t)
  const xLine = (L === 1 ? a : 0) - away(e)
  const xCount = (L === 1 ? a : Math.trunc(a / 4)) - away(e)
  const out: ComboPiece[] = [
    { sheet: 'bt_combo_line', x: xLine + 2, y: 31, alpha: 31 },
    { sheet: `bt_combo${L + 1}`, x: xCount + 11, y: 8, alpha: 31 },
  ]
  // The count before, fading as the new one comes in.
  if (L >= 2 && t < 6 && P > 0) {
    out.push({
      sheet: `bt_combo${P + 1}`,
      x: xLine + 11,
      y: 8,
      alpha: Math.min(31, Math.trunc(((6 - t) * 31) / 6)),
    })
  }
  // The word, which hops 1, 2, 3, 2, 1 px as it comes in; the top of the chain's own at 3.
  const u = t - 2
  const hop = u > 0 && u <= 3 ? -u : u > 3 && u < 6 ? u - 6 : 0
  const top = (L === 3 && t >= 6) || P === 3
  out.push({ sheet: top ? 'bt_combo2_en' : 'bt_combo1_en', x: xLine + 28, y: 20 + hop, alpha: 31 })
  // The bottom row: "damage × the multiplier", after the top for the first level.
  if (L > 1 || t - 5 > 0) {
    const s = slide(t - 5) - away(e)
    out.push({ sheet: 'bt_combo_dama', x: s + 3, y: 33, alpha: 31 })
    out.push({ sheet: 'bt_combo_x', x: s + 36, y: 34, alpha: 31 })
    out.push({ sheet: MULTIPLIERS[L] as string, x: s + (L === 3 ? 51 : 48), y: 33, alpha: 31 })
  }
  return out
}
