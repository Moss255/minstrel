import { ROUTINE_HEADER, type Script, type ScriptRoutine } from '@minstrel/game-formats'

/**
 * The event script machine: a stack machine of three-word instructions.
 *
 * Read from the cartridge's own scripts — every event's and the block of
 * routines they all carry — and not from any documentation; there is none.
 * `game-formats/FORMAT.md`, "Event scripts", has the evidence. What each
 * instruction does, as read:
 *
 * | op | name | does | how sure |
 * |---|---|---|---|
 * | `0x01 i s` | load | pushes variable `i` of scope `s` | read from use |
 * | `0x02 i s` | ref | pushes a reference to it, for a store or for an engine function to fill | read from use |
 * | `0x03 t v` | push | a constant: `t` 1 an integer, 2 a float's bits, 3 a string's offset from the code base | established |
 * | `0x04` | pop | drops the top value | read from use |
 * | `0x05` | store | value, then reference, off the stack; stores; pushes the value back | read from use |
 * | `0x06` | add | `&0 L0 1 add store` counts up; `200 9 add` makes function 209 | read from use |
 * | `0x07` | subtract | | read from use |
 * | `0x08` | multiply | the second event folder's: 4,761 of its 4,777 follow `1 negate`; `3.14 1.5` makes a three-quarter turn | read from use |
 * | `0x09` | divide | the second, by the top — `4.5 180 divide 3.14 multiply` turns degrees to radians | read from use |
 * | `0x0B` | negate | the value on top; coordinates are stored positive and negated | read from use |
 * | `0x0E c` | compare | 40 `==` … 45 `>=`, in C's order — INFERRED past `==` | INFERRED |
 * | `0x0F` | return | with the value on top | established |
 * | `0x10 t` | jump | to `t`, from the code base | established |
 * | `0x11 t w` | jump if | pops; jumps when its truth is `w` | read from use |
 * | `0x12 t w` | short-circuit | jumps keeping the value when its truth is `w`, else drops it | INFERRED |
 * | `0x13 _ t` | routine | calls the routine at `t`, handing it its parameters off the stack | established |
 * | `0x14 1` | note | pops a string the developers left as a note | read from use |
 * | `0x15 n` | invoke | takes `n` values: an engine function's number, then what it is handed | established |
 * | `0x16 n` | label | nothing; marks a jump's target | read from use |
 * | `0x17` | yield | waits for the next frame | read from use |
 * | `0x19` | or | only ever of flag values, `4 \| 16` | INFERRED |
 * | `0x1A` | not | | read from use |
 *
 * Anything else stops the machine with a `ScriptError` rather than being
 * guessed at — `0x1D` and `0x1E`, twice each in one event outside the slice,
 * among them.
 *
 * Variables have a scope: 1 is the routine's own locals, 8 the event's, and 64
 * the game's, which the host keeps — the last two INFERRED from use.
 */

export class ScriptError extends Error {
  constructor(message: string, at?: number) {
    super(at === undefined ? message : `${message} (at 0x${at.toString(16)})`)
    this.name = 'ScriptError'
  }
}

export const OP = {
  LOAD: 0x01,
  REF: 0x02,
  PUSH: 0x03,
  POP: 0x04,
  STORE: 0x05,
  ADD: 0x06,
  SUBTRACT: 0x07,
  MULTIPLY: 0x08,
  DIVIDE: 0x09,
  NEGATE: 0x0b,
  COMPARE: 0x0e,
  RETURN: 0x0f,
  JUMP: 0x10,
  JUMP_IF: 0x11,
  SHORT_CIRCUIT: 0x12,
  ROUTINE: 0x13,
  NOTE: 0x14,
  INVOKE: 0x15,
  LABEL: 0x16,
  YIELD: 0x17,
  OR: 0x19,
  NOT: 0x1a,
} as const

/** A push's type word. */
export const PUSH_INT = 1
export const PUSH_FLOAT = 2
export const PUSH_STRING = 3

export const SCOPE_LOCAL = 1
export const SCOPE_EVENT = 8
export const SCOPE_GAME = 64

/** Where a variable is; a local one remembers whose locals it is. */
export interface ScriptRef {
  readonly scope: number
  readonly index: number
  readonly locals?: ScriptValue[]
}

export type ScriptValue = number | string | ScriptRef

/** What the machine needs from the game. */
export interface ScriptHost {
  /**
   * An engine function, by its number, with the values handed to it. The
   * numbers come in hundreds — 200s move characters, 300s the camera, 400s
   * show messages — and scripts write them as a sum, `200 + 9`. What it
   * returns is what the script gets back; nothing is 0.
   */
  call(id: number, args: readonly ScriptValue[], thread: ScriptThread): ScriptValue | undefined
  /** A note the developers left in the script. */
  note?(text: string): void
  /** Variables outside the event — scope 64 and any other. Unread ones are 0. */
  readVariable?(scope: number, index: number): ScriptValue
  writeVariable?(scope: number, index: number, value: ScriptValue): void
  /** A string operand's bytes as text. Byte for byte by default: the names scripts use are ASCII. */
  decode?(bytes: Uint8Array): string
}

/** How many instructions may run without waiting for a frame before it is taken for a hang. */
export const STEP_LIMIT = 100_000

interface Frame {
  readonly routine: ScriptRoutine
  pc: number
  readonly locals: ScriptValue[]
  readonly stackBase: number
}

const isRef = (value: ScriptValue): value is ScriptRef => typeof value === 'object'
const truth = (value: ScriptValue): boolean =>
  typeof value === 'number' ? value !== 0 : typeof value === 'string' ? value !== '' : true
const latin1 = (bytes: Uint8Array): string => {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

/** One routine running, and the routines it has called. */
export class ScriptThread {
  readonly stack: ScriptValue[] = []
  private readonly frames: Frame[] = []
  private done = false

  constructor(
    private readonly script: Script,
    routine: ScriptRoutine,
    private readonly host: ScriptHost,
    private readonly eventVariables: ScriptValue[] = [],
  ) {
    this.enter(routine, [])
  }

  get finished(): boolean {
    return this.done
  }

  /**
   * Run until the script waits for the next frame or ends. True while there
   * is more to run.
   */
  step(limit = STEP_LIMIT): boolean {
    for (let count = 0; count < limit; count++) {
      if (this.done) return false
      const frame = this.frames[this.frames.length - 1] as Frame
      const instruction = frame.routine.code[frame.pc]
      if (!instruction) throw new ScriptError('ran past the end of a routine', frame.routine.at)
      frame.pc++
      if (this.execute(frame, instruction.op, instruction.a, instruction.b, instruction.at)) {
        return !this.done
      }
    }
    throw new ScriptError(`ran ${limit} instructions without waiting for a frame`)
  }

  /** The value a reference names. */
  read(ref: ScriptRef): ScriptValue {
    if (ref.scope === SCOPE_LOCAL) return ref.locals?.[ref.index] ?? 0
    if (ref.scope === SCOPE_EVENT) return this.eventVariables[ref.index] ?? 0
    return this.host.readVariable?.(ref.scope, ref.index) ?? 0
  }

  /** Store through a reference — what an engine function does with one it is handed. */
  write(ref: ScriptRef, value: ScriptValue): void {
    if (ref.scope === SCOPE_LOCAL) {
      if (ref.locals) ref.locals[ref.index] = value
    } else if (ref.scope === SCOPE_EVENT) {
      this.eventVariables[ref.index] = value
    } else {
      this.host.writeVariable?.(ref.scope, ref.index, value)
    }
  }

  private enter(routine: ScriptRoutine, args: readonly ScriptValue[]): void {
    const locals: ScriptValue[] = new Array(Math.max(routine.locals, args.length)).fill(0)
    args.forEach((value, i) => {
      locals[i] = value
    })
    this.frames.push({ routine, pc: 0, locals, stackBase: this.stack.length })
  }

  private pop(at: number): ScriptValue {
    if (this.stack.length === 0) throw new ScriptError('popped an empty stack', at)
    return this.stack.pop() as ScriptValue
  }

  private popNumber(at: number): number {
    const value = this.pop(at)
    if (typeof value !== 'number')
      throw new ScriptError(`wanted a number, found ${typeof value}`, at)
    return value
  }

  private jump(frame: Frame, target: number, at: number): void {
    const index = (this.script.base + target - (frame.routine.at + ROUTINE_HEADER)) / 12
    if (!Number.isInteger(index) || index < 0 || index >= frame.routine.code.length) {
      throw new ScriptError(`jump to 0x${target.toString(16)} lands outside its routine`, at)
    }
    frame.pc = index
  }

  /** One instruction; true when the script waits for the next frame. */
  private execute(frame: Frame, op: number, a: number, b: number, at: number): boolean {
    switch (op) {
      case OP.PUSH:
        if (a === PUSH_INT) this.stack.push(b | 0)
        else if (a === PUSH_FLOAT) {
          const bits = new DataView(new ArrayBuffer(4))
          bits.setUint32(0, b, true)
          this.stack.push(bits.getFloat32(0, true))
        } else if (a === PUSH_STRING) {
          this.stack.push((this.host.decode ?? latin1)(this.script.stringAt(b)))
        } else throw new ScriptError(`push of type ${a}, which is not read`, at)
        return false
      case OP.LOAD:
        this.stack.push(this.read(this.ref(frame, a, b)))
        return false
      case OP.REF:
        this.stack.push(this.ref(frame, a, b))
        return false
      case OP.POP:
        this.pop(at)
        return false
      case OP.STORE: {
        const value = this.pop(at)
        const ref = this.pop(at)
        if (!isRef(ref)) throw new ScriptError('stored through something not a reference', at)
        this.write(ref, value)
        this.stack.push(value)
        return false
      }
      case OP.INVOKE: {
        if (a < 1 || this.stack.length - frame.stackBase < a) {
          throw new ScriptError(`invoke of ${a} values with ${this.stack.length} on the stack`, at)
        }
        const [id, ...args] = this.stack.splice(this.stack.length - a)
        if (typeof id !== 'number')
          throw new ScriptError(`invoked ${typeof id}, not a function number`, at)
        this.stack.push(this.host.call(id, args, this) ?? 0)
        return false
      }
      case OP.ADD: {
        const right = this.popNumber(at)
        this.stack.push(this.popNumber(at) + right)
        return false
      }
      case OP.SUBTRACT: {
        const right = this.popNumber(at)
        this.stack.push(this.popNumber(at) - right)
        return false
      }
      case OP.MULTIPLY: {
        const right = this.popNumber(at)
        this.stack.push(this.popNumber(at) * right)
        return false
      }
      case OP.DIVIDE: {
        // Every one on the cartridge divides a float; what an integer division
        // does — truncate or not — is not seen, and a float's is kept.
        const right = this.popNumber(at)
        this.stack.push(this.popNumber(at) / right)
        return false
      }
      case OP.OR: {
        const right = this.popNumber(at)
        this.stack.push(this.popNumber(at) | right)
        return false
      }
      case OP.NEGATE:
        this.stack.push(-this.popNumber(at))
        return false
      case OP.NOT:
        this.stack.push(truth(this.pop(at)) ? 0 : 1)
        return false
      case OP.COMPARE: {
        const right = this.pop(at)
        const left = this.pop(at)
        this.stack.push(compare(a, left, right, at) ? 1 : 0)
        return false
      }
      case OP.JUMP:
        this.jump(frame, a, at)
        return false
      case OP.JUMP_IF:
        if (truth(this.pop(at)) === (b === 1)) this.jump(frame, a, at)
        return false
      case OP.SHORT_CIRCUIT: {
        const top = this.stack[this.stack.length - 1]
        if (top === undefined) throw new ScriptError('short-circuit on an empty stack', at)
        if (truth(top) === (b === 1)) this.jump(frame, a, at)
        else this.stack.pop()
        return false
      }
      case OP.ROUTINE: {
        const routine = this.script.routineAt(b)
        if (this.stack.length < routine.params) {
          throw new ScriptError(
            `routine wants ${routine.params} values, the stack has ${this.stack.length}`,
            at,
          )
        }
        this.enter(routine, this.stack.splice(this.stack.length - routine.params))
        return false
      }
      case OP.RETURN: {
        const value = this.stack.length > frame.stackBase ? this.pop(at) : 0
        this.frames.pop()
        this.stack.length = frame.stackBase
        if (this.frames.length === 0) {
          this.done = true
          return true
        }
        this.stack.push(value)
        return false
      }
      case OP.NOTE: {
        const text = this.pop(at)
        this.host.note?.(String(text))
        return false
      }
      case OP.LABEL:
        return false
      case OP.YIELD:
        return true
      default:
        throw new ScriptError(`opcode 0x${op.toString(16)} is not read`, at)
    }
  }

  private ref(frame: Frame, index: number, scope: number): ScriptRef {
    return scope === SCOPE_LOCAL ? { scope, index, locals: frame.locals } : { scope, index }
  }
}

/** 40 to 45 as C orders them: `==`, `!=`, `<`, `<=`, `>`, `>=`. Past `==`, INFERRED. */
function compare(kind: number, left: ScriptValue, right: ScriptValue, at: number): boolean {
  if (kind === 40) return left === right
  if (kind === 41) return left !== right
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new ScriptError(`ordered comparison ${kind} of something not a number`, at)
  }
  if (kind === 42) return left < right
  if (kind === 43) return left <= right
  if (kind === 44) return left > right
  if (kind === 45) return left >= right
  throw new ScriptError(`comparison ${kind} is not read`, at)
}

/**
 * The order an event's sections run in: 200, then 100, then 300.
 *
 * **A choice.** Nothing read says when each runs. 200 loads the cast and sets
 * the event's options, 100 is the scene and by far the largest, 300 hands the
 * Hero back, so numbered as before, during and after. Sections numbered
 * otherwise — one event has 201, 301 and 101 as well — are not run.
 */
export const SECTION_ORDER: readonly number[] = [200, 100, 300]

/** A whole event: its sections one after another, sharing the event's variables. */
export class EventRun {
  private readonly queue: ScriptRoutine[]
  private thread: ScriptThread | undefined
  readonly variables: ScriptValue[] = []

  constructor(
    private readonly script: Script,
    private readonly host: ScriptHost,
    order: readonly number[] = SECTION_ORDER,
  ) {
    this.queue = order.flatMap((id) =>
      script.sections.filter((section) => section.id === id).map((section) => section.routine),
    )
  }

  /** Run up to the next frame. False once every section has finished. */
  step(limit = STEP_LIMIT): boolean {
    for (;;) {
      if (!this.thread) {
        const next = this.queue.shift()
        if (!next) return false
        this.thread = new ScriptThread(this.script, next, this.host, this.variables)
      }
      if (this.thread.step(limit)) return true
      this.thread = undefined
    }
  }
}
