import { MEDALS_MOST, type MedalRewards } from '@minstrel/game-formats'

/**
 * Cap'n Max Meddlin' and the mini medals handed in to him: one visit, worked
 * out whole — what he says, in order, how many medals leave the bag, what he
 * gives, and the total afterwards.
 *
 * **Read from the game's code**, overlay 4 (US addresses; see
 * `game-formats`' FORMAT.md, "Mini medals"):
 *
 * - **where a visit starts** (`func_ov004_02167d90`): nothing handed in yet →
 *   his introduction, line 10; every milestone passed → the exchange, 100;
 *   otherwise → 30. A fourth start, the long introduction at 200, is taken
 *   when a global the game checks is set, which is not established and does
 *   not arise here.
 * - **the numbers his lines use** (`func_ov004_0216794c`, `02167b78`): the
 *   total handed in, the medals held — item 22039 in the bag — the next
 *   milestone's count, and the total after, held to 80.
 * - **handing over** (`func_ov004_02167adc`, `02167a0c`): if the medals held
 *   reach the next milestone, **only as many as it needs** are taken and its
 *   reward given; otherwise all of them. The total is held to 500.
 * - **what follows each** (`02167e28`, `02167e6c`, `02167eb0`, `02167f1c`):
 *   medals held after the greeting → hand them over, none → the tally (50) on
 *   a later visit and nothing more on the first; a milestone reached → its
 *   reward (40, 41); not reached → the next milestone (51), after the tally
 *   (50) on a later visit; every milestone passed → the scene at 60.
 *
 * **INFERRED** — the order of the lines where a step's handler was not tied to
 * its label: that a reward is followed by handing over again while medals are
 * left, and that 21 and 32 ("that's so many ye've given me") come after the
 * hand-over they count.
 *
 * **The exchange after 80** (`021680cc` on): a list of the six, each at its
 * price; choosing one says 130, "that'll cost ye", and asks, or 132 when the
 * medals held fall short (`02168318`); yes hands the price over — counted
 * into the total as any hand-over is — and gives the item, 140, which asks
 * whether there is more (`02168400`); no says 131 and goes back to the list;
 * more says 141 and goes back; leaving says 150 and 151.
 */

/** One line of his: a number in `str_mdl`, and what fills it. */
export interface MedalLine {
  readonly message: number
  readonly values: {
    readonly given: number
    readonly held: number
    readonly next: number
    readonly after: number
  }
  /** The item a line names — a milestone's reward. */
  readonly item: number | undefined
}

export interface MedalVisit {
  readonly lines: readonly MedalLine[]
  /** How many medals leave the bag. */
  readonly handed: number
  /** What he gives, in order. */
  readonly gifts: readonly number[]
  /** The total handed in, afterwards. */
  readonly given: number
  /** Whether every milestone is now passed, and the scene at 60 is due. */
  readonly allPassed: boolean
}

/** The last milestone's count, which his "after" number is held to. */
const HELD_TO = 80

/** The next milestone above `given`, by index, or -1 once every one is passed. */
function nextMilestone(rewards: MedalRewards, given: number): number {
  return rewards.milestones.findIndex((milestone) => milestone.medals > given)
}

/** One visit to him, with `given` handed in before it and `held` medals in the bag. */
export function visitMax(rewards: MedalRewards, given: number, held: number): MedalVisit {
  const lines: MedalLine[] = []
  const gifts: number[] = []
  let handed = 0
  const say = (message: number, item?: number) => {
    const index = nextMilestone(rewards, given)
    const next = index < 0 ? 0 : (rewards.milestones[index]?.medals ?? 0)
    lines.push({
      message,
      values: { given, held, next, after: Math.min(given + held, HELD_TO) },
      item: item ?? (index < 0 ? undefined : rewards.milestones[index]?.item),
    })
  }

  // Every milestone passed: the exchange — his greeting, and with medals held
  // what he offers, before the list (`02168074`: held → 120, none → 151). The
  // list and what follows it are the caller's: see `exchangeLine`.
  if (nextMilestone(rewards, given) < 0) {
    say(110)
    say(held > 0 ? 120 : 151)
    return { lines, handed, gifts, given, allPassed: true }
  }

  const first = given === 0
  if (first) {
    say(10)
    say(11)
    if (held === 0) return { lines, handed, gifts, given, allPassed: false }
    say(20)
  } else {
    say(30)
    if (held === 0) {
      say(50)
      say(51)
      return { lines, handed, gifts, given, allPassed: false }
    }
    say(31)
  }

  // Handing over, a milestone at a time.
  let counted = false
  while (held > 0) {
    const index = nextMilestone(rewards, given)
    const milestone = index < 0 ? undefined : rewards.milestones[index]
    if (milestone && given + held >= milestone.medals) {
      const taken = milestone.medals - given
      handed += taken
      held -= taken
      given = Math.min(given + taken, MEDALS_MOST)
      const values = { given, held, next: milestone.medals, after: Math.min(given, HELD_TO) }
      lines.push({ message: 40, values, item: milestone.item })
      lines.push({ message: 41, values, item: milestone.item })
      gifts.push(milestone.item)
      continue
    }
    // Not enough for the next: all of them go, and he counts them.
    handed += held
    given = Math.min(given + held, MEDALS_MOST)
    held = 0
    say(first ? 21 : 32)
    counted = true
  }

  const allPassed = nextMilestone(rewards, given) < 0
  if (allPassed) return { lines, handed, gifts, given, allPassed }
  if (!counted) say(first ? 21 : 32)
  // The first visit goes straight on to the next milestone (`02167eb0`: to 51);
  // a later one says the tally first (`02167f1c`: to 50).
  if (!first) say(50)
  say(51)
  return { lines, handed, gifts, given, allPassed }
}

/** One of the exchange's lines: `val_3` the price and the item the one picked. */
export function exchangeLine(
  message: number,
  given: number,
  held: number,
  picked?: { readonly medals: number; readonly item: number },
): MedalLine {
  return {
    message,
    values: { given, held, next: picked?.medals ?? 0, after: Math.min(given + held, HELD_TO) },
    item: picked?.item,
  }
}

/**
 * One of his lines made plain for the text box: its numbers put in, and each
 * `<IF_SING val_n>` settled by the number it names — the text engine's
 * conditions go by name alone, and each of these lines turns on its own
 * number. The item's name, with "a" or "an" before it by its first letter
 * (**ours**: the game's article for an item is not read), stands for the item
 * tags. `<LEADER>` and the rest are left for the text engine.
 */
export function medalText(raw: string, line: MedalLine, itemName: (id: number) => string): string {
  const numbers: Record<string, number> = {
    val_1: line.values.given,
    val_2: line.values.held,
    val_3: line.values.next,
    val_4: line.values.after,
  }
  const name = line.item === undefined ? '' : itemName(line.item)
  const article = /^[aeiou]/i.test(name) ? 'an' : 'a'
  return (
    raw
      .replace(
        /<IF_SING (val_\d)>(.*?)<ELSE_NOT_SING>(.*?)<ENDIF_SING>/g,
        (_, which: string, one: string, many: string) => (numbers[which] === 1 ? one : many),
      )
      .replace(/<(val_\d)>/g, (_, which: string) => String(numbers[which] ?? ''))
      // Whether an item's name is a plural noun — "the pixie boots are" — is
      // not read; every one is taken as singular. Ours.
      .replace(/<IF_I_NAME_PLRNOUN>(.*?)<ELSE_NOT_PLRNOUN>(.*?)<ENDIF_PLRNOUN>/g, '$2')
      .replace(/<INDEF_ART_SGL_I_NAME>/g, `${article} ${name}`)
      .replace(/<DEF_ART_SGL_I_NAME>/g, `the ${name}`)
      .replace(/<SGL_I_NAME>/g, name)
  )
}
