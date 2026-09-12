import { parseMarkup, type TalkLine } from '@minstrel/game-formats'
import type { Stage } from './load.ts'

/**
 * Talking to a character: who is in front of the Hero, which chapter's words
 * they say, and how a line of the cartridge's text reads on screen.
 *
 * **Much of this is reading rather than finding**, and says so where it is.
 * Which of a character's lines the game picks is not established — the numbers
 * before each line are not decoded — so every line is shown in turn, as a way
 * to test the text and the box rather than as the game's own conversation.
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

/** A conversation under way: who, in which chapter, and how far through what they say. */
export interface Conversation {
  readonly who: Talker
  readonly letter: string
  readonly lines: readonly TalkLine[]
  readonly line: number
  readonly page: number
  readonly rendered: RenderedLine
}

/** The first page of the first line, at or after `line`, that has anything to show. */
function fromLine(
  who: Talker,
  letter: string,
  lines: readonly TalkLine[],
  line: number,
  context: TextContext,
): Conversation | undefined {
  for (let at = line; at < lines.length; at++) {
    const rendered = renderLine(lines[at]?.text ?? '', context)
    if (rendered.pages.length > 0) return { who, letter, lines, line: at, page: 0, rendered }
  }
  return undefined
}

/** Start talking: the first page of the first line that says anything, or nothing at all. */
export function startConversation(
  who: Talker,
  letter: string,
  lines: readonly TalkLine[],
  context: TextContext = DEFAULT_CONTEXT,
): Conversation | undefined {
  return fromLine(who, letter, lines, 0, context)
}

/** The next page, or the next line's first, or undefined when there is no more. */
export function nextPage(
  conversation: Conversation,
  context: TextContext = DEFAULT_CONTEXT,
): Conversation | undefined {
  if (conversation.page + 1 < conversation.rendered.pages.length) {
    return { ...conversation, page: conversation.page + 1 }
  }
  const { who, letter, lines, line } = conversation
  return fromLine(who, letter, lines, line + 1, context)
}

function speakerOf(page: string): TalkPage {
  const trimmed = page.replace(/^\s+/, '')
  const named = /^\/\/(.+?)\/\/\s*/.exec(trimmed)
  if (named) return { speaker: named[1], text: trimmed.slice(named[0].length) }
  const someone = /^\*:\s*/.exec(trimmed)
  if (someone) return { speaker: undefined, text: trimmed.slice(someone[0].length) }
  return { speaker: undefined, text: trimmed }
}
