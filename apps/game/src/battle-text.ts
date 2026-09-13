import { type Grammar, parseMarkup } from '@minstrel/game-formats'
import { glyphOf } from './talk.ts'

/**
 * The battle's words in the game's own: its messages — `strbtl`, `actmsg`,
 * the field menu's `str_tm`, the battle results' `str_bres` — rendered for who
 * is doing what to whom. See game-formats' FORMAT.md, "Battle text".
 *
 * A name comes with its grammar (`readGrammar`): its articles, by number in the
 * article table, and its gender. `<DEF_ART_ACTOR>` is the actor's name behind
 * its definite article — `the` and a monster's name, or the Hero's name alone,
 * which takes no article. The conditions choose on a count (`<IF_SING val_1>`),
 * on the target being one (`<IF_TARGET_SING>`), on the party being one
 * (`<IF_SOLO>`), and on a gender, three branches and one end
 * (`<IF_ACTOR_M>` … `<IF_ACTOR_F>` … `<IF_ACTOR_N>` … `<ENDIF_ACTOR_MFN>`).
 *
 * **One thing is ours**: a name is never a plural noun (`<IF_I_NAME_PLRNOUN>`
 * takes its other branch), as which names are is not read.
 */

export interface Named {
  /** The name, markup and all, as the files hold it. */
  readonly name: string
  readonly plural?: string
  /** Its articles and gender; none for the Hero, whose name takes no article. */
  readonly grammar?: Grammar
  /** Its gender when it has no grammar — the Hero's: 0 he, 1 she, 2 it. */
  readonly gender?: number
  /** A letter telling it from others of its kind: `slime A`. */
  readonly letter?: string
}

/** Who and what a message is about. */
export interface Telling {
  readonly actor?: Named | undefined
  readonly target?: Named | undefined
  /** Whether the target is one fighter rather than a side. Yes, unless said. */
  readonly targetSingular?: boolean | undefined
  readonly item?: Named | undefined
  readonly action?: Named | undefined
  /** The monsters a message names by kind, `<M_NAME1>`, `<M_NAME2>` … in order. */
  readonly monsters?: readonly Named[] | undefined
  /** What `<val_1>`, `<str_1>` … stand for. */
  readonly values?: Readonly<Record<string, number | string>> | undefined
  /** Whether the party is one. Yes, unless said: the slice's party is the Hero. */
  readonly solo?: boolean | undefined
  readonly leader?: Named | undefined
}

export interface Rendered {
  readonly text: string
  /** Tags this could not render, for the status line. */
  readonly unhandled: readonly string[]
}

/** Tags that time or place the text rather than say anything. */
const QUIET = /^(TIME|AUTO|ADD|CLOSE|W|X|Y|XY|SIZE|PLTT|ME_\d+|SE_\d+)$/

/** A name tag: which article, singular or plural, and whose name. */
const NAME_TAG =
  /^(DEF_ART_|INDEF_ART_)?(SGL_|PLR_)?(ACTOR|TARGET|LEADER|ACTION|I_NAME|M_NAME)(\d?)$/

const GENDERS = ['M', 'F', 'N'] as const

/** A name's own markup — `<1>` for an apostrophe — as text. */
function plain(name: string): string {
  let out = ''
  for (const token of parseMarkup(name)) {
    if (token.kind === 'text') out += token.text
    else if (token.kind === 'tag') out += glyphOf(token.name) ?? ''
  }
  return out
}

function whose(subject: string, digit: string, telling: Telling): Named | undefined {
  switch (subject) {
    case 'ACTOR':
      return telling.actor
    case 'TARGET':
      return telling.target
    case 'LEADER':
      return telling.leader
    case 'ACTION':
      return telling.action
    case 'I_NAME':
      return telling.item
    default:
      return telling.monsters?.[Math.max(1, Number(digit || 1)) - 1]
  }
}

function genderOf(named: Named | undefined): (typeof GENDERS)[number] {
  return GENDERS[named?.grammar?.gender ?? named?.gender ?? 0] ?? 'M'
}

/** Render one message for who is doing what. */
export function tellBattle(
  template: string,
  telling: Telling,
  articles: ReadonlyMap<number, string>,
): Rendered {
  const unhandled = new Set<string>()
  // `<ST=<val_10>,1>` asks the status panel to show a change: a tag inside a
  // tag, which the markup reader rightly refuses. It says nothing, so it goes.
  const tokens = parseMarkup(template.replace(/<ST=<val_\d+>,\d+>/g, ''))
  const frames: { shown: boolean; chain?: string }[] = []
  const visible = () => frames.every((f) => f.shown)
  let out = ''
  let capitalise = false
  const put = (piece: string) => {
    if (!piece || !visible()) return
    if (capitalise) {
      const at = piece.search(/[A-Za-z]/)
      if (at >= 0) {
        out += piece.slice(0, at) + (piece[at] as string).toUpperCase() + piece.slice(at + 1)
        capitalise = false
        return
      }
    }
    out += piece
  }

  for (const token of tokens) {
    if (token.kind === 'text') {
      put(token.text)
      continue
    }
    if (token.kind === 'break') {
      put('\n')
      continue
    }
    const [name, argument] = token.name.split(' ') as [string, string | undefined]

    const chain = /^IF_(ACTOR|TARGET|M_NAME|I_NAME)_([MFN])$/.exec(name)
    if (chain) {
      const subject = chain[1] as string
      const named = whose(subject, '', telling)
      const shown = genderOf(named) === chain[2]
      const top = frames[frames.length - 1]
      if (top?.chain === subject) top.shown = shown
      else frames.push({ shown, chain: subject })
      continue
    }
    if (name.startsWith('IF_')) {
      if (name === 'IF_SING') frames.push({ shown: Number(telling.values?.[argument ?? '']) === 1 })
      else if (name === 'IF_TARGET_SING') frames.push({ shown: telling.targetSingular ?? true })
      else if (name === 'IF_SOLO') frames.push({ shown: telling.solo ?? true })
      else if (name.endsWith('_PLRNOUN')) frames.push({ shown: false })
      else {
        unhandled.add(name)
        frames.push({ shown: true })
      }
      continue
    }
    if (name.startsWith('ELSE_')) {
      const top = frames[frames.length - 1]
      if (top) top.shown = !top.shown
      continue
    }
    if (name.startsWith('ENDIF_')) {
      frames.pop()
      continue
    }
    if (!visible()) continue

    if (name === 'Cap') {
      capitalise = true
      continue
    }
    if (name === 'PAGE') {
      put('\n')
      continue
    }
    const named = NAME_TAG.exec(name)
    if (named) {
      const [, article, number, subject, digit] = named as unknown as [
        string,
        string | undefined,
        string | undefined,
        string,
        string,
      ]
      const who = whose(subject, digit, telling)
      if (!who) {
        unhandled.add(name)
        continue
      }
      const plural = number === 'PLR_'
      let text = plain(plural ? (who.plural ?? who.name) : who.name)
      if (who.letter && !plural) text += ` ${who.letter}`
      const grammar = who.grammar
      if (article && grammar) {
        const definite = article === 'DEF_ART_'
        const which = definite
          ? plural
            ? grammar.definitePlural
            : grammar.definite
          : plural
            ? grammar.indefinitePlural
            : grammar.indefinite
        const word = articles.get(which) ?? ''
        if (word) text = `${word} ${text}`
      }
      put(text)
      continue
    }
    const value = telling.values?.[name]
    if (value !== undefined) {
      put(String(value))
      continue
    }
    const glyph = glyphOf(name)
    if (glyph !== undefined) {
      put(glyph)
      continue
    }
    if (!QUIET.test(name)) unhandled.add(name)
  }
  return { text: out.replace(/[ \t]+\n/g, '\n').trim(), unhandled: [...unhandled] }
}
