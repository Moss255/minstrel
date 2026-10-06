/**
 * **Accolades**, and the scripts that award them — read 6 October 2026,
 * `docs/readings/T14-records.md`.
 *
 * The game keeps the accolades earned as bits (`GameState+0x7504`), and
 * awards them only through four scripts, each run where the game runs it:
 *
 * - `title_btl` as a victory's results end (overlay 23, step 15 of the 17
 *   at `data_ov023_021fe148`): the Hero's level 99 in a vocation, a grotto's
 *   boss or level, the eleven defeated;
 * - `title_skl` when skill points have been allocated (the victory's skill
 *   screen, step 9; the field menu's, overlay 2 `func_ov002_021688f8`);
 * - `title_clr` and `title_gyalel` as the Battle Records open (overlay 8,
 *   `func_ov008_02184a4c`), the first only after the ending.
 *
 * Each script's section 100 calls one routine a candidate and awards the
 * candidate's number with function 0 when the routine returns 1; `title_clr`
 * and `title_gyalel` stop at the first. This reads the candidates out of
 * section 100 and runs each routine on the script machine, against the
 * functions read (overlay 23's table at `data_ov023_021fddb8`). **A routine
 * that asks for a function not modelled here is not due** — so an accolade
 * whose test is not built is never given, rather than given on a guess.
 *
 * Each awarded is said with `str_tg` 100, and the first ever with 1000 after
 * it (`func_ov023_021ed724` returns whether the records' count was 0).
 */

import { OP_RETURN, type Script } from '@minstrel/game-formats'
import { type ScriptHost, type ScriptRef, ScriptThread, type ScriptValue } from '@minstrel/script'

/** The four scripts, by where they run. */
export const TITLE_SCRIPTS = {
  battle: '/data/scenario/title_btl.stb',
  skills: '/data/scenario/title_skl.stb',
  cleared: '/data/scenario/title_clr.stb',
  records: '/data/scenario/title_gyalel.stb',
} as const
export type TitleScript = keyof typeof TITLE_SCRIPTS

/** The lines: `str_tg` 100, "… is awarded the auspicious accolade …!", and 1000, the list now open. */
export const AWARD_LINE = 100
export const FIRST_AWARD_LINE = 1000

/** One candidate in a script's section 100: the routine that tests it, the number it awards. */
export interface Candidate {
  /** The routine's address, from the code base. */
  readonly routine: number
  readonly id: number
  /** Whether section 100 returns once this one is awarded. */
  readonly last: boolean
}

const OP_PUSH = 0x03
const OP_ROUTINE = 0x13
const OP_INVOKE = 0x15
const PUSH_INT = 1

/**
 * Section 100's candidates, in its order: a call, then `push 0; push id;
 * invoke 2` — function 0 with the number — and, on `title_clr` and
 * `title_gyalel`, `push 1; return` after it: the section's end.
 */
export function candidatesOf(script: Script): Candidate[] {
  const main = script.sections.find((section) => section.id === 100)
  if (!main) return []
  const code = main.routine.code
  const out: Candidate[] = []
  let routine: number | undefined
  for (let i = 0; i < code.length; i++) {
    const at = code[i]
    if (!at) continue
    if (at.op === OP_ROUTINE) routine = at.b
    const id = code[i + 1]
    const invoke = code[i + 2]
    if (
      routine !== undefined &&
      at.op === OP_PUSH &&
      at.a === PUSH_INT &&
      at.b === 0 &&
      id?.op === OP_PUSH &&
      id.a === PUSH_INT &&
      invoke?.op === OP_INVOKE &&
      invoke.a === 2
    ) {
      const after = code[i + 3]
      const last = after?.op === OP_PUSH && after.b === 1 && code[i + 4]?.op === OP_RETURN
      out.push({ routine, id: id.b, last })
      routine = undefined
    }
  }
  return out
}

/** What the functions answer from. */
export interface AccoladeFacts {
  readonly earned: ReadonlySet<number>
  /** The Hero's vocation now, 1 to 12. */
  readonly vocation: number
  /** The Hero's level in a vocation. */
  levelIn(vocation: number): number
  /** The Hero's sex: 0 a man, 1 a woman. */
  readonly sex: number
  /** The Hero's points in a skill tree. */
  treePoints(tree: number): number
}

/** A function the scripts call that is not modelled: the candidate asking is not due. */
class NotModelled extends Error {}

const isRef = (value: ScriptValue | undefined): value is ScriptRef =>
  typeof value === 'object' && value !== null

/**
 * The functions, as overlay 23's handlers do them. A member is the
 * character the first value names: −1 is `GameState+0x3ac`'s
 * (`func_ov023_021e8f28` → `func_020100a8`) — INFERRED the Hero, and the
 * only member these scripts ask about.
 */
function hostOf(facts: AccoladeFacts): ScriptHost {
  const hero = (member: ScriptValue | undefined) => {
    if (member !== -1) throw new NotModelled(`member ${String(member)}`)
  }
  return {
    call(id, args, thread) {
      const put = (i: number, value: number) => {
        const ref = args[i]
        if (isRef(ref)) thread.write(ref, value)
      }
      switch (id) {
        // 0: award — handled by the caller, which reads the number from section 100.
        case 0:
          return 1
        // 1: whether it is earned, into a reference (`0x021e9190`).
        case 1:
          put(1, facts.earned.has(args[0] as number) ? 1 : 0)
          return 1
        // 101: the member's vocation, that vocation's level, its experience (`0x021e9370`).
        case 101:
          hero(args[0])
          put(1, facts.vocation)
          put(2, facts.levelIn(facts.vocation))
          if (isRef(args[3])) throw new NotModelled('experience')
          return 1
        // 102: the member's sex, bit 0 of `+0x49c` (`0x021e93e0`).
        case 102:
          hero(args[0])
          put(1, facts.sex)
          return 1
        // 106: the member's points in a tree, the byte at `+0x464 + tree` (`0x021e9818`).
        case 106:
          hero(args[0])
          put(2, facts.treePoints((args[1] as number) & 0xff))
          return 1
        // 110: the grottoes cleared, the records' `+0x0c` bits 14–27 (`0x021e9910`).
        // 252, 253: a grotto's level and its boss's, cleared — 0 outside a
        // grotto, which is everywhere until grottoes are built (`0x021eaea0`,
        // `0x021eaf50`). No grotto can be cleared yet, so all three are 0.
        case 110:
          put(0, 0)
          return 1
        case 252:
        case 253:
          put(0, 0)
          return 1
        default:
          throw new NotModelled(`function ${id}`)
      }
    },
  }
}

/** Whether a candidate is due: its routine run to the end, returning 1. */
function due(script: Script, candidate: Candidate, host: ScriptHost): boolean {
  try {
    const thread = new ScriptThread(script, script.routineAt(candidate.routine), host)
    while (thread.step()) {
      // These routines never wait; a frame's step runs them through.
    }
    return thread.result === 1
  } catch (error) {
    if (error instanceof NotModelled) return false
    throw error
  }
}

/**
 * **The accolades a script awards now**, in its order: every candidate due,
 * or for `title_clr` and `title_gyalel` the first. None already earned —
 * each routine asks function 1 first.
 */
export function awardsOf(script: Script, facts: AccoladeFacts): number[] {
  const host = hostOf(facts)
  const out: number[] = []
  for (const candidate of candidatesOf(script)) {
    if (!due(script, candidate, host)) continue
    out.push(candidate.id)
    if (candidate.last) break
  }
  return out
}
