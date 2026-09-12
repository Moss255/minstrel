import { parseMarkup, type TalkLine, type Trigger } from '@minstrel/game-formats'
import type { Stage } from './load.ts'

/**
 * Talking to a character: who is in front of the Hero, which chapter's words
 * they say, and how a line of the cartridge's text reads on screen.
 *
 * **Much of this is reading rather than finding**, and says so where it is.
 * Which line a character says is `pickLine`'s choice, from readings of the talk
 * files' numbers and the triggers that are INFERRED, each with the measure
 * behind it; where those run out it says it has guessed.
 */

/** How far away a character can be and still be talked to: about two character heights. */
export const TALK_REACH = 0.35

/** Anyone who can be talked to, where they stand. */
export interface Talker {
  readonly id: number
  readonly name: string
  readonly x: number
  readonly z: number
}

/**
 * The character the Hero is facing and near enough to talk to, if any.
 *
 * Within {@link TALK_REACH} and within 60° of straight ahead, nearest first.
 * Facing `f` is the direction `(sin f, cos f)` in x and z, the player's own
 * convention.
 */
export function talkTarget(
  at: { readonly x: number; readonly z: number; readonly facing: number },
  cast: readonly Talker[],
  reach = TALK_REACH,
): Talker | undefined {
  const aheadX = Math.sin(at.facing)
  const aheadZ = Math.cos(at.facing)
  let best: Talker | undefined
  let nearest = Number.POSITIVE_INFINITY
  for (const who of cast) {
    const dx = who.x - at.x
    const dz = who.z - at.z
    const distance = Math.hypot(dx, dz)
    if (distance > reach || distance >= nearest) continue
    if (distance > 0 && (dx * aheadX + dz * aheadZ) / distance < 0.5) continue
    best = who
    nearest = distance
  }
  return best
}

/**
 * The chapter letter whose talk files go with a story stage.
 *
 * **INFERRED**: the letter's place in the alphabet read as the stage's major
 * number, `A` for 1 — the prologue's talk is under `A` and the village chapter's
 * under `B`, which is where the cast's stages 1 and 2 stand. An area without that
 * letter takes the latest one before it. With no stage, the first letter.
 */
export function letterForStage(
  letters: readonly string[],
  stage: Stage | undefined,
): string | undefined {
  if (letters.length === 0) return undefined
  if (stage === undefined) return letters[0]
  let chosen = letters[0]
  for (const letter of letters) {
    if (letter.charCodeAt(0) - 64 <= stage.major) chosen = letter
  }
  return chosen
}

/** What the text's conditions ask about the Hero, and the name it uses. */
export interface TextContext {
  readonly heroName: string
  /**
   * Whether each `<IF_name>` holds. Character creation is outside the slice, so
   * these are fixed, and a condition not listed takes its first branch.
   */
  readonly conditions: Readonly<Record<string, boolean>>
}

export const DEFAULT_CONTEXT: TextContext = {
  heroName: 'Hero',
  conditions: {
    HERO_MALE: true,
    MALE: true,
    SOLO: true,
    FEMALE_PARTY: false,
    VOWEL_FR_HERO: false,
    VOWEL_FR_LEADER: false,
  },
}

/**
 * Tags that stand for a character.
 *
 * `<1>` as an apostrophe is what `docs/M0-inventory.md` records from reading
 * the text, and so is the accent markup below. The rest are **INFERRED** from
 * where they stand: `<,>` sits exactly where a comma reads; `<6>`, `<9>`,
 * `<66>` and `<99>` are named for the shapes of the quotation marks, and German
 * has its own `<DE66>` and `<DE99>`; `<-->` stands between clauses as a dash
 * does; the French `<!>`, `<?>` and `<:>` are its spaced punctuation.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  '1': '’',
  ',': ',',
  '6': '‘',
  '9': '’',
  '66': '“',
  '99': '”',
  DE66: '„',
  DE99: '“',
  '--': '—',
  '...': '…',
  '!': ' !',
  '?': ' ?',
  ':': ' :',
  '^!': '¡',
  '^?': '¿',
  ss: 'ß',
  oe: 'œ',
}

/** An accent mark and the letter it goes on: `'e` is é. */
const ACCENTS: Readonly<Record<string, string>> = {
  "'": '́',
  '`': '̀',
  '^': '̂',
  ':': '̈',
  '~': '̃',
  ',': '̧',
}

function accented(name: string): string | undefined {
  if (name.length !== 2) return undefined
  const mark = ACCENTS[name[0] as string]
  const letter = name[1] as string
  if (mark === undefined || !/[a-zA-Z]/.test(letter)) return undefined
  return (letter + mark).normalize('NFC')
}

/** One page of a line, and who says it when the text names them. */
export interface TalkPage {
  readonly speaker: string | undefined
  readonly text: string
}

export interface RenderedLine {
  readonly pages: readonly TalkPage[]
  /** Tags left out of the text because nothing here knows what they do. */
  readonly unhandled: readonly string[]
}

/**
 * How a line of the cartridge's text reads on screen.
 *
 * `<PAGE>` starts a new page — **INFERRED**, from standing between whole
 * sentences, each page opening with its own speaker mark. A page that opens
 * `//Name//` is said by Name; one that opens `*:` by someone unnamed, and the
 * mark is not shown. `<HERO>` and `<LEADER>` are the Hero's name — the second
 * **INFERRED** for a party of one — and `<Cap>` capitalises what follows.
 */
export function renderLine(text: string, context: TextContext = DEFAULT_CONTEXT): RenderedLine {
  const pages: string[] = []
  const unhandled = new Set<string>()
  let page = ''
  let capitalise = false
  /** For each open condition, whether the branch being read is the one shown. */
  const shown: boolean[] = []
  const visible = () => shown.every(Boolean)
  const put = (piece: string) => {
    if (!visible() || piece === '') return
    if (capitalise) {
      page += piece.charAt(0).toUpperCase() + piece.slice(1)
      capitalise = false
    } else page += piece
  }

  for (const token of parseMarkup(text)) {
    if (token.kind === 'text') {
      put(token.text)
      continue
    }
    if (token.kind === 'break') {
      if (visible()) page += '\n'
      continue
    }
    const condition = /^(IF|ELSE|ENDIF)_(.+)$/.exec(token.name)
    if (condition) {
      if (condition[1] === 'IF') shown.push(context.conditions[condition[2] as string] ?? true)
      else if (condition[1] === 'ELSE') shown[shown.length - 1] = !shown[shown.length - 1]
      else shown.pop()
      continue
    }
    if (!visible()) continue
    if (token.name === 'PAGE') {
      pages.push(page)
      page = ''
    } else if (token.name === 'Cap') {
      capitalise = true
    } else if (token.name === 'HERO' || token.name === 'LEADER') {
      put(context.heroName)
    } else {
      const glyph = GLYPHS[token.name] ?? accented(token.name)
      if (glyph === undefined) unhandled.add(token.name)
      else put(glyph)
    }
  }
  pages.push(page)

  return {
    pages: pages.filter((p) => p.trim() !== '').map(speakerOf),
    unhandled: [...unhandled],
  }
}

/** A conversation under way: who, what is being read out, and how far through it. */
export interface Conversation {
  readonly who: Talker
  /** Where the words came from, for the status line: a chapter and a label, or an event. */
  readonly source: string
  readonly texts: readonly (string | undefined)[]
  /** One note per text, for the status line: a line's tag and numbers, or a message's number. */
  readonly notes: readonly string[]
  readonly line: number
  readonly page: number
  readonly rendered: RenderedLine
}

type Script = Pick<Conversation, 'who' | 'source' | 'texts' | 'notes'>

/** The first page of the first text, at or after `line`, that has anything to show. */
function fromLine(script: Script, line: number, context: TextContext): Conversation | undefined {
  for (let at = line; at < script.texts.length; at++) {
    const rendered = renderLine(script.texts[at] ?? '', context)
    if (rendered.pages.length > 0) return { ...script, line: at, page: 0, rendered }
  }
  return undefined
}

/** Start talking: the first page of the first text that says anything, or nothing at all. */
export function startConversation(
  who: Talker,
  source: string,
  texts: readonly (string | undefined)[],
  notes: readonly string[] = [],
  context: TextContext = DEFAULT_CONTEXT,
): Conversation | undefined {
  return fromLine({ who, source, texts, notes }, 0, context)
}

/** The next page, or the next text's first, or undefined when there is no more. */
export function nextPage(
  conversation: Conversation,
  context: TextContext = DEFAULT_CONTEXT,
): Conversation | undefined {
  if (conversation.page + 1 < conversation.rendered.pages.length) {
    return { ...conversation, page: conversation.page + 1 }
  }
  const { who, source, texts, notes } = conversation
  return fromLine({ who, source, texts, notes }, conversation.line + 1, context)
}

/** A talk line's tag and numbers, for the status line. */
export function noteOf(line: TalkLine): string {
  return `tag ${line.tag}, numbers ${line.unknown_numbers.join(' ')}`
}

/** Two stages the same, or both no stage at all. */
export function sameStage(a: Stage | undefined, b: Stage | undefined): boolean {
  return (
    a === b || (a !== undefined && b !== undefined && a.major === b.major && a.minor === b.minor)
  )
}

/** A stage as one number that orders the way the story does. */
export function stageOrder(stage: Stage): number {
  return stage.major * 1000 + stage.minor
}

/**
 * Where the slice opens: chapter B, sub-stage 1.
 *
 * **INFERRED.** The triggers put Erinn's morning event, `ev02130`, at 2.1 in her
 * house; chapter B's sub-stage-1 lines speak of the Hero's fall as just past;
 * and the slice plan opens with the Hero waking there.
 */
export const OPENING_STAGE: Stage = { major: 2, minor: 1 }

/**
 * A trigger word read as an operation, its high half, and an argument, its low.
 * **INFERRED**, and only four are used, each with the measure behind it in
 * `FORMAT.md`:
 */
/** The character a record is about: placed in the record's map on 66%, against 18% for another. */
const OP_CHARACTER = 6
/** A talk label: one of that character's line labels on 707 of 793, against 221 for a control. */
const OP_LABEL = 11
/** With argument 1, the label is the high half of a word whose low half is 0: 338 of 519, against 0. */
const OP_LABEL_BY = 36
/** An event, by number: 58 of 64 in Angel Falls name one. */
const OP_EVENT = 119
/** The label of a character's plain line — the commonest, and the one chapter B's day-to-day lines carry. INFERRED. */
const PLAIN = 16

interface Word {
  readonly op: number
  readonly arg: number
}

function wordsOf(trigger: Trigger): Word[] {
  const words: Word[] = []
  for (let i = 0; i < trigger.values.length; i++) {
    if (trigger.kinds[i] !== 1) continue
    const value = trigger.values[i] as number
    words.push({ op: value >>> 16, arg: value & 0xffff })
  }
  return words
}

/** A line's first two numbers as a range of sub-stages, 99 for "to the end". */
function covers(line: TalkLine, minor: number): boolean {
  const from = line.unknown_numbers[0] as number
  const to = line.unknown_numbers[1] as number
  return from <= minor && (minor <= to || to === 99)
}

/** INFERRED: the four-number form is the night line — on tag 1, 42.5% of them use night words against 9.2% of the three-number ones. */
const isNightLine = (line: TalkLine) => line.unknown_numbers.length === 4
const labelOf = (line: TalkLine) => line.unknown_numbers[line.unknown_numbers.length - 1]

/** What a character says now: one of their lines, or an event that runs instead. */
export type Choice =
  | { readonly kind: 'line'; readonly line: TalkLine; readonly why: string }
  | { readonly kind: 'event'; readonly event: number; readonly why: string }

export interface Asking {
  readonly triggers: readonly Trigger[]
  /** The map the Hero is in, by its own id. */
  readonly map: number | undefined
  readonly stage: Stage
  readonly night: boolean
  /** Who is being talked to, by their id in the area's cast. */
  readonly id: number
  /** Their talk file for the stage's chapter. */
  readonly lines: readonly TalkLine[]
}

/**
 * Which of a character's lines applies now, or which event runs instead.
 *
 * **INFERRED throughout**, from the measures above. The first of the area's
 * triggers in this map, over a span that covers the stage, naming the
 * character and a talk operation, decides: a label, or failing that an event.
 * Without one, the plain line. The line is the tag-1 line with that label whose
 * range covers the sub-stage, in the time of day asked for if there is one and
 * the other if not; the other tags are errands and counters, not talk. Where no
 * line has the label, the first that covers the sub-stage is taken, and `why`
 * says it is a guess.
 */
export function pickLine(asking: Asking): Choice | undefined {
  const { triggers, map, stage, night, id } = asking
  const lines = asking.lines.filter((line) => line.tag === 1)
  const labels = new Set(lines.map(labelOf))
  let label = PLAIN
  let why = `label ${PLAIN}, the plain line — no trigger names them here`

  const trigger = triggers.find((candidate) => {
    if (map !== undefined && candidate.map !== map) return false
    if (
      stageOrder(candidate.from) > stageOrder(stage) ||
      stageOrder(stage) > stageOrder(candidate.to)
    ) {
      return false
    }
    const words = wordsOf(candidate)
    return (
      words.some((w) => w.op === OP_CHARACTER && w.arg === id) &&
      words.some((w) => w.op === OP_LABEL || w.op === OP_LABEL_BY || w.op === OP_EVENT)
    )
  })
  if (trigger) {
    const words = wordsOf(trigger)
    const where = `the trigger at 0x${trigger.offset.toString(16)}`
    const named = words.find((w) => w.op === OP_LABEL && w.arg !== 0)?.arg
    const byWord = words.some((w) => w.op === OP_LABEL_BY && w.arg === 1)
      ? words.find((w) => w.arg === 0 && labels.has(w.op))?.op
      : undefined
    const event = words.find((w) => w.op === OP_EVENT)?.arg
    if (named !== undefined) {
      label = named
      why = `label ${named}, from ${where}`
    } else if (byWord !== undefined) {
      label = byWord
      why = `label ${byWord}, from ${where}`
    } else if (event !== undefined) {
      return { kind: 'event', event, why: `event ${event}, from ${where}` }
    }
  }

  const covering = lines.filter((line) => covers(line, stage.minor))
  const labelled = covering.filter((line) => labelOf(line) === label)
  const chosen = labelled.find((line) => isNightLine(line) === night) ?? labelled[0]
  if (chosen) {
    const time =
      isNightLine(chosen) === night
        ? ''
        : ` — the ${isNightLine(chosen) ? 'night' : 'day'} line, as there is none for the ${night ? 'night' : 'day'}`
    return { kind: 'line', line: chosen, why: why + time }
  }
  const guess = covering.find((line) => isNightLine(line) === night) ?? covering[0]
  if (guess) {
    return {
      kind: 'line',
      line: guess,
      why: `${why}; no such line covers ${stage.major}.${stage.minor}, so the first that does — a guess`,
    }
  }
  return undefined
}

function speakerOf(page: string): TalkPage {
  const trimmed = page.replace(/^\s+/, '')
  const named = /^\/\/(.+?)\/\/\s*/.exec(trimmed)
  if (named) return { speaker: named[1], text: trimmed.slice(named[0].length) }
  const someone = /^\*:\s*/.exec(trimmed)
  if (someone) return { speaker: undefined, text: trimmed.slice(someone[0].length) }
  return { speaker: undefined, text: trimmed }
}
