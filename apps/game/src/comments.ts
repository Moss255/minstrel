import type { Script } from '@minstrel/game-formats'
import { type ScriptHost, type ScriptRef, ScriptThread, type ScriptValue } from '@minstrel/script'

/**
 * **Stella's comments** — what the Battle Records' keeper says as they open.
 * Read 11 October 2026; `docs/readings/T14-records.md`, "Stella's comments".
 *
 * Each comment entry (`cmtFileTbl.bin`, see `readCommentTable`) has a script
 * whose section 100 is a run of candidates, as the accolade scripts are: a
 * test routine called, and when it returns 1, function 50 with the line's
 * number, function 52 with the candidate's bit, and a return — **the first
 * that holds is the comment**. The tests are run here on the script machine
 * against the functions read (overlay 23's table at `data_ov023_021fddb8`).
 *
 * **A test that asks for a function not modelled stops the whole run with no
 * comment** — the game would have answered it, and passing over it could
 * give a comment the game would not yet give. **Ours**, that it says nothing
 * instead.
 */

/** The entries overlay 8 runs: the header first, then the Story So Far's page's, then TailC. */
export const HEADER_ENTRY = 1000
export const TAIL_ENTRY = 1002

/** One candidate: the test routine, the line it gives, the bit it sets — none on a comment that may come again. */
export interface CommentCandidate {
  readonly routine: number
  readonly line: number
  readonly bit?: number
}

const OP_PUSH = 0x03
const OP_ADD = 0x06
const OP_ROUTINE = 0x13
const OP_INVOKE = 0x15
const PUSH_INT = 1

/**
 * Section 100's candidates, in its order: a call, then `push 50; push 0; add;
 * push line; invoke 2` — function 50 — and on most `push 50; push 2; add; push
 * bit; invoke 2`, function 52; one without it may be given again.
 */
export function commentCandidatesOf(script: Script): CommentCandidate[] {
  const main = script.sections.find((section) => section.id === 100)
  if (!main) return []
  const code = main.routine.code
  const isPush = (i: number, value?: number) =>
    code[i]?.op === OP_PUSH &&
    code[i]?.a === PUSH_INT &&
    (value === undefined || code[i]?.b === value)
  const out: CommentCandidate[] = []
  let routine: number | undefined
  for (let i = 0; i < code.length; i++) {
    const at = code[i]
    if (at?.op === OP_ROUTINE) routine = at.b
    if (
      routine !== undefined &&
      isPush(i, 50) &&
      isPush(i + 1, 0) &&
      code[i + 2]?.op === OP_ADD &&
      isPush(i + 3) &&
      code[i + 4]?.op === OP_INVOKE
    ) {
      const marks =
        isPush(i + 5, 50) &&
        isPush(i + 6, 2) &&
        code[i + 7]?.op === OP_ADD &&
        isPush(i + 8) &&
        code[i + 9]?.op === OP_INVOKE
      out.push({
        routine,
        line: code[i + 3]?.b as number,
        ...(marks ? { bit: code[i + 8]?.b as number } : {}),
      })
      routine = undefined
    }
  }
  return out
}

/** What the tests answer from. */
export interface CommentFacts {
  /** Whether a candidate's bit is set — its comment given before (the records' `+0x4c`). */
  shown(bit: number): boolean
  /** The Story So Far's page (`func_0201081c`). */
  readonly storySoFar: number
  /** Battles fought, the records' `+0x3c` (`func_ov000_021643d4` counts each as it is set up). */
  readonly battles: number
  /** Comments given, the records' `+0x20` high half (`func_ov008_02185dc0` counts each). */
  readonly heard: number
  /** Battles won (`+0x08`), wipe-outs (`+0x40`), flee attempts (`+0x34`) and flees (`+0x38`). */
  readonly victories: number
  readonly wipeouts: number
  readonly fleeTries: number
  readonly flees: number
  /**
   * A member's HP and MP now — their battle record's `+0x130` halfwords 4
   * and 6 (`func_020482bc` writes 6 against the maximum MP). The member is as
   * the functions name one (`func_ov023_021e8f28`): −1 the Hero, 0 to 3 a
   * party place; undefined for anyone else.
   */
  member(which: number): CommentMember | undefined
  /**
   * How many the player's party is, less one — function 157, the list at
   * `GameState+0x5718` (`func_02011494`), which `func_ov017_02191234` fills
   * with the player's own party. A story guest is not counted (INFERRED: a
   * guest is an attending character, not a party member).
   */
  readonly companions: number
  /** Time played, in minutes — function 123's hours and minutes. */
  readonly played: number
  /** How many of an item the party holds — carried, worn and in the bag (`func_02086aec`). */
  held(item: number): number
  /**
   * The player's party, its first the Hero, each member's HP and vocation —
   * the list `func_02011494` gives, and `func_020114ec`'s, the same in a game
   * of one's own (`func_ov017_02191234`). Story guests are left out, as for
   * {@link companions}. A member flagged `0x1000` in its first halfword is
   * passed over by 161 and 162; what sets it is not read, and none is here.
   */
  readonly party: readonly { readonly hp: number; readonly vocation: number }[]
  /** The gold carried and banked: the party's `+0xf6c` and `+0xf68` (the bank shows both in thousands, `func_ov003_02168b50`). */
  readonly gold: number
  readonly banked: number
  /** The Hero's experience in all thirteen vocations together, held at `0x7fffffff` (function 166). */
  readonly allExp: number
}

/** What the functions read of a member. */
export interface CommentMember {
  readonly hp: number
  readonly mp: number
  /** Their vocation, 1 to 12, its level and their experience in it — function 101. */
  readonly vocation: number
  readonly level: number
  readonly exp: number
}

class NotModelled extends Error {}

const isRef = (value: ScriptValue | undefined): value is ScriptRef =>
  typeof value === 'object' && value !== null

/** The functions, as overlay 23's handlers do them. */
function hostOf(facts: CommentFacts): ScriptHost {
  return {
    call(id, args, thread) {
      const put = (i: number, value: number) => {
        const ref = args[i]
        if (isRef(ref)) thread.write(ref, value)
      }
      switch (id) {
        // 50, 52: the line and the bit — the caller reads them from section 100.
        case 50:
        case 52:
          return 1
        // 51: whether the bit is set, into a reference (`0x021e9278`).
        case 51:
          put(1, facts.shown(args[0] as number) ? 1 : 0)
          return 1
        // 53: the Story So Far's page (`0x021e934c`, `func_0201081c`).
        case 53:
          put(0, facts.storySoFar)
          return 1
        // 101: a member's vocation, its level and their experience in it (`0x021e9370`).
        case 101: {
          const who = facts.member(args[0] as number)
          if (!who) throw new NotModelled(`member ${String(args[0])}`)
          put(1, who.vocation)
          put(2, who.level)
          put(3, who.exp)
          return 1
        }
        // 107, 108: a member's HP and MP (`0x021e9864`, `0x021e98a0`).
        case 107:
        case 108: {
          const who = facts.member(args[0] as number)
          if (!who) throw new NotModelled(`member ${String(args[0])}`)
          put(1, id === 107 ? who.hp : who.mp)
          return 1
        }
        // 123: time played, hours (to 9,999) and minutes (`0x021e9be4`, through
        // `func_ov023_021e8fe8`, which adds the session's own).
        case 123:
          put(0, Math.min(9999, Math.floor(facts.played / 60)))
          put(1, facts.played % 60)
          return 1
        // 124: the records' next time, which the summary shows as time in
        // multiplayer (`0x021e9c54`) — none here, where multiplayer is out.
        case 124:
          put(0, 0)
          put(1, 0)
          return 1
        // 177: how many of an item the party holds (`0x021eaae8`).
        case 177:
          put(1, facts.held(args[0] as number))
          return 1
        // 158: the fallen among the party but its first (`0x021ea3ec`).
        case 158:
          put(0, facts.party.slice(1).filter((m) => m.hp <= 0).length)
          return 1
        // 159: those in the vocations 1, 4, 7, 9 — Warrior, Martial Artist,
        // Gladiator, Paladin (`0x021ea46c`, its jump table).
        case 159:
          put(0, facts.party.filter((m) => [1, 4, 7, 9].includes(m.vocation)).length)
          return 1
        // 160: those in 2, 3, 10 — Priest, Mage, Sage (`0x021ea51c`).
        case 160:
          put(0, facts.party.filter((m) => [2, 3, 10].includes(m.vocation)).length)
          return 1
        // 161, 162: the living and the fallen (`0x021ea5a4`, `0x021ea630`).
        case 161:
          put(0, facts.party.filter((m) => m.hp > 0).length)
          return 1
        case 162:
          put(0, facts.party.filter((m) => m.hp <= 0).length)
          return 1
        // 165: whether the player's own character stands (`0x021ea77c`).
        case 165:
          put(0, (facts.party[0]?.hp ?? 0) > 0 ? 1 : 0)
          return 1
        // 110: grottoes cleared, the records' `+0x0c` bits 14–27 (`0x021e9910`) —
        // none is cleared yet: a grotto's boss is not built.
        case 110:
          put(0, 0)
          return 1
        // 117, 175: the gold banked and carried (`0x021e9a78`, `0x021ea9dc`).
        case 117:
          put(0, facts.banked)
          return 1
        case 175:
          put(0, facts.gold)
          return 1
        // 166: the player's own character's experience, every vocation's (`0x021ea7e0`).
        case 166:
          put(0, Math.min(0x7fffffff, facts.allExp))
          return 1
        // 157: the party's size less one (`0x021ea3ac`).
        case 157:
          put(0, facts.companions)
          return 1
        // 127, 128: flee attempts and flees, the records' `+0x34` and `+0x38` (`0x021e9d2c`, `0x021e9d60`).
        case 127:
          put(0, facts.fleeTries)
          return 1
        case 128:
          put(0, facts.flees)
          return 1
        // 129: the records' `+0x3c`, low 24 bits — battles fought (`0x021e9d94`).
        case 129:
          put(0, facts.battles)
          return 1
        // 130: `+0x08` — battles won (`0x021e9dc8`).
        case 130:
          put(0, facts.victories)
          return 1
        // 134: `+0x40` — wipe-outs (`0x021e9e98`).
        case 134:
          put(0, facts.wipeouts)
          return 1
        // 169: the records' `+0x20`, high half — comments given (`0x021ea8b8`).
        case 169:
          put(0, facts.heard)
          return 1
        // 170, 171: the wireless session's state (`func_0202ae18`): never one here.
        case 170:
        case 171:
          put(0, 0)
          return 1
        default:
          throw new NotModelled(`function ${id}`)
      }
    },
  }
}

/** A comment's outcome: its line and bit, none, or stopped at a test not modelled. */
export type CommentRun =
  | { readonly line: number; readonly bit?: number | undefined }
  | { readonly none: true }
  | { readonly stopped: string }

/** **Run an entry's script**: the first candidate that holds, as the game runs them. */
export function runComment(script: Script, facts: CommentFacts): CommentRun {
  const host = hostOf(facts)
  for (const candidate of commentCandidatesOf(script)) {
    try {
      const thread = new ScriptThread(script, script.routineAt(candidate.routine), host)
      while (thread.step()) {
        // These routines never wait.
      }
      if (thread.result === 1) return { line: candidate.line, bit: candidate.bit }
    } catch (error) {
      if (error instanceof NotModelled) return { stopped: error.message }
      throw error
    }
  }
  return { none: true }
}
