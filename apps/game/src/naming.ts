/**
 * The name: the eighth and last of creation's screens, after the seven knobs
 * of `CREATION_ORDER` — overlay 9's own order, for the Hero and for everyone
 * Patty signs up.
 *
 * **Read**:
 *
 * - **the 201 given names the game offers to roll from**, `str_cm` 20000–20100
 *   a man's and 21000–21100 a woman's — "Irving" to "Wayne", "Iris" to "Wanda";
 * - **eight letters at most**: the name field in the let's play
 *   (`evidence/dq9-lp-ep1.mp4`, about 3:45) is eight slots, filled "Mage****".
 *
 * **Ours**: typing the name on this machine's own keyboard. The game's is on
 * the bottom screen, laid out by `/data/bin/keyboard_cm.bin` — a tagged table
 * of 0x65 records, one a key, each with its place on the 256 × 192 screen and
 * two of the game's own character codes. Which code is which letter is not
 * read, and a keyboard built on a guessed mapping would type wrong letters,
 * so it waits for that. How the game rolls a name is not read either: any of
 * the list for the character's sex, drawn as the caller draws.
 */

/** The most letters a name holds — the let's play's eight slots. */
export const NAME_MOST = 8

/** The given names by sex, out of `str_cm`, in the file's order. */
export interface GivenNames {
  readonly male: readonly string[]
  readonly female: readonly string[]
}

const MALE_FROM = 20000
const MALE_TO = 20100
const FEMALE_FROM = 21000
const FEMALE_TO = 21100

/** The given names out of `str_cm`'s strings, by number. */
export function givenNamesOf(strings: ReadonlyMap<number, string>): GivenNames {
  const between = (from: number, to: number) => {
    const out: string[] = []
    for (let id = from; id <= to; id++) {
      const name = strings.get(id)
      if (name) out.push(name)
    }
    return out
  }
  return { male: between(MALE_FROM, MALE_TO), female: between(FEMALE_FROM, FEMALE_TO) }
}

/**
 * A typed name as it is kept: spaces at its ends taken off, runs of them made
 * one, and cut to {@link NAME_MOST} letters — letters, not UTF-16 units, so an
 * accented one counts once.
 */
export function tidyName(typed: string): string {
  const letters = [...typed.trim().replace(/\s+/g, ' ')]
  return letters.slice(0, NAME_MOST).join('').trimEnd()
}

/**
 * One of the given names for `sex` — `SEX.female` is 1 — at the place `draw`
 * gives, from 0 below the count. Undefined when the list is empty.
 */
export function rollName(
  names: GivenNames,
  sex: number,
  draw: (count: number) => number,
): string | undefined {
  const list = sex === 1 ? names.female : names.male
  if (list.length === 0) return undefined
  const at = Math.min(list.length - 1, Math.max(0, Math.floor(draw(list.length))))
  return list[at]
}
