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
        // 129: the records' `+0x3c`, low 24 bits — battles fought (`0x021e9d94`).
        case 129:
          put(0, facts.battles)
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
