/**
 * How a name takes its articles and pronouns: one packed word, beside a
 * monster's name in `mon_data_<lang>.nat` (`+0x18`) and an item's in
 * `itemname_<lang>.nat` (`+0x08`). See FORMAT.md, "Articles".
 *
 * Four of its fields are numbers in the article table,
 * `/data/prm/article.gp2/article_<lang>.nat`, which reads with
 * `readSystemStrings`: its 0s are the definite singular articles (`the`,
 * `the pair of` …), its 100s the indefinite (`a`, `an`, `a suit of` …), its
 * 200s the definite plural and its 300s the indefinite plural (`some`).
 *
 * | bits | reading | evidence |
 * |---|---|---|
 * | 0–5 | indefinite singular, 100 + n | `an` on every English monster whose name opens with a vowel and `a` on every other, 289 of 289; on the items 679 of 687, the rest English's own (`an honour among thieves`, `a utility belt`); `a suit of` on leather armour, `a book called` on the books |
 * | 6–11 | a plural: the indefinite, 300 + n, or the definite — which of the two is not established | equal to bits 18–23 on every English record |
 * | 12–17 | definite singular, n | `the book called` on the books, `the keg of` on the kegs; 0 — no article at all — on the story's named monsters |
 * | 18–23 | the other plural, 200 + n | |
 * | 24–25 | the name's gender, INFERRED: 0 he, 1 she, 2 it | 2 on 303 of the 438 English monsters and 0 on the named men; German, whose nouns have genders, spreads its monsters across all three |
 * | 26–31 | not established | |
 */

export interface Grammar {
  /** The indefinite singular article's number: 101 `a`, 102 `an`, 106 `a suit of`. */
  readonly indefinite: number
  /** The definite singular article's number: 1 `the`, or 0 for none. */
  readonly definite: number
  /** The indefinite plural article's number: 301 `some`. */
  readonly indefinitePlural: number
  /** The definite plural article's number: 201 `the`. */
  readonly definitePlural: number
  /** INFERRED: 0 he, 1 she, 2 it — see above. */
  readonly gender: number
  /** Bits 26 to 31, not established. */
  readonly unknown_bits26: number
}

/** Unpack a grammar word. */
export function readGrammar(word: number): Grammar {
  return {
    indefinite: 100 + (word & 63),
    indefinitePlural: 300 + ((word >>> 6) & 63),
    definite: (word >>> 12) & 63,
    definitePlural: 200 + ((word >>> 18) & 63),
    gender: (word >>> 24) & 3,
    unknown_bits26: word >>> 26,
  }
}
