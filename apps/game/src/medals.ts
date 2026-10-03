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
 *   his introduction, label 10; every milestone passed → the exchange, 100;
 *   otherwise → 30. A fourth, **label 200, is for a guest in another
 *   player's game** (`func_0202c540`, INFERRED from what writes its halfword)
 *   — multiplayer, so it never arises here. It is not a count of medals.
 * - **his script**, `/data/menu/medal.stb`, one section a label, each saying
 *   its lines and then running a handler that picks the next (read 3 October
 *   2026): 10 says 10, 11, and goes to 20 with medals held (`02167e28`); 20
 *   says 20, 21 and hands over (`02167eb0`); 30 says 30 and goes to 31 with
 *   medals held, else 50 (`02167e6c`); 31 says 31, 32 and hands over; 40 says
 *   40, 41 and hands over again (`02167f1c`); 50 says 50 and goes on to 51
 *   (`02167fb0`); 60 is the scene and the trick (`02167fd4`).
 * - **handing over** (`MiniMedals_HandOverTowardsMilestone`, `02167adc`): with
 *   a milestone left, if the medals held reach it **only as many as it needs**
 *   go, and its reward is given; if not, all of them go; **with none left,
 *   nothing goes** — the rest stay in the bag for the exchange. The total is
 *   held to 500.
 * - **where a hand-over goes** — by the progress read *before* it
 *   (`MiniMedals_GetProgress`): reached → 40; else, after 21 or 32, → 51; after
 *   41, every milestone passed → 60, otherwise → 50.
 * - **the numbers his lines use** (`MiniMedals_SetMessageValues`): the total
 *   handed in, the medals held, the next milestone's count and the total they
 *   would make, held to 80 — set as a visit starts, before each hand-over, and
 *   again before 50 and 51.
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
  /** Whether every milestone is now passed. */
  readonly allPassed: boolean
  /**
   * Whether the visit reached label 60 — the last milestone's reward just
   * given: the scene (`ev28590`) and the Cap'n's Curtsy, trick 23, taught by
   * his own handler (`func_0206e348(…, 23, 1)` at `0x02168014`).
   */
  readonly curtsy: boolean
}

/** The last milestone's count, which his "after" number is held to. */
const HELD_TO = 80

/** The next milestone above `given`, by index, or -1 once every one is passed. */
function nextMilestone(rewards: MedalRewards, given: number): number {
  return rewards.milestones.findIndex((milestone) => milestone.medals > given)
}

/** One visit to him, with `given` handed in before it and `held` medals in the bag — his script, label by label. */
export function visitMax(rewards: MedalRewards, given: number, held: number): MedalVisit {
  const lines: MedalLine[] = []
  const gifts: number[] = []
  let handed = 0
  // `MiniMedals_GetProgress`: the next milestone, and whether the medals held reach it.
  const progress = () => {
    const index = nextMilestone(rewards, given)
    const milestone = index < 0 ? undefined : rewards.milestones[index]
    return {
      index,
      next: milestone?.medals ?? 0,
      reached: milestone !== undefined && given + held >= milestone.medals,
      item: milestone?.item,
    }
  }
  // `MiniMedals_SetMessageValues`: what the lines say until it is set again.
  let values: MedalLine['values'] = { given, held, next: 0, after: 0 }
  let item: number | undefined
  const setValues = () => {
    const p = progress()
    values = { given, held, next: p.next, after: Math.min(given + held, HELD_TO) }
    item = p.item
  }
  const say = (...messages: number[]) => {
    for (const message of messages) lines.push({ message, values, item })
  }
  const handOver = (count: number) => {
    handed += count
    held -= count
    given = Math.min(given + count, MEDALS_MOST)
  }
  // `MiniMedals_HandOverTowardsMilestone`.
  const towards = () => {
    const p = progress()
    if (p.index < 0) return
    if (p.reached) {
      handOver(p.next - given)
      if (p.item !== undefined) gifts.push(p.item)
    } else handOver(held)
  }

  setValues()
  // Every milestone passed: the exchange — his greeting, and with medals held
  // what he offers, before the list (`02168074`: held → 120, none → 151). The
  // list and what follows it are the caller's: see `exchangeLine`.
  if (progress().index < 0) {
    say(110, held > 0 ? 120 : 151)
    return { lines, handed, gifts, given, allPassed: true, curtsy: false }
  }
  let label = given === 0 ? 10 : 30
  let curtsy = false
  // Each section says its lines, then its handler picks the next label; the
  // service closes at the end of 51, at 3 (nothing to hand over) and at 60.
  for (;;) {
    if (label === 10) {
      say(10, 11)
      label = held > 0 ? 20 : 3
    } else if (label === 20 || label === 31) {
      say(...(label === 20 ? [20, 21] : [31, 32]))
      // `02167eb0`: hand over; reached → 40, not → 51.
      const before = progress()
      setValues()
      towards()
      label = before.reached ? 40 : 51
    } else if (label === 30) {
      say(30)
      label = held > 0 ? 31 : 50
    } else if (label === 40) {
      say(40, 41)
      // `02167f1c`: hand over again; reached → 40, every milestone passed → 60, else → 50.
      const before = progress()
      setValues()
      towards()
      if (before.reached) label = 40
      else if (before.index < 0) label = 60
      else {
        setValues()
        label = 50
      }
    } else if (label === 50) {
      say(50)
      // `02167fb0`.
      setValues()
      label = 51
    } else if (label === 51) {
      say(51)
      break
    } else {
      curtsy = label === 60
      break
    }
  }
  return { lines, handed, gifts, given, allPassed: progress().index < 0, curtsy }
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
