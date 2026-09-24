import {
  flagsHold,
  type MarkupToken,
  marksSet,
  OP_THEN_MAP,
  parseMarkup,
  type TalkLine,
  type Trigger,
  triggerWords,
} from '@minstrel/game-formats'
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
 * The facing that looks from one point at another.
 *
 * The player's convention throughout: facing `f` is the direction
 * `(sin f, cos f)` in x and z, which is what {@link talkTarget} tests against.
 * The game computes the same thing for a speaker with `atan2(player − npc)` in
 * the pass at `0x0206a3c0`, and every message it shows does it — see `Turn`.
 */
export function facingToward(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
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
  /**
   * What `<val_1>`, `<val_2>` … stand for, when the engine supplies them — the
   * inn's price, say. A value not listed is left out, as an unknown tag is.
   */
  readonly values?: Readonly<Record<string, string>>
}

/**
 * A service a line hands over to when it is done: `<ADD><SHOP=32>`,
 * `<ADD><INN=2>`, `<ADD><CHURCH=1>`, `<ADD><RENKIN>`. The number is the
 * shop's in the shop table; what the inn's and the church's numbers select is
 * not established, and the bare tags carry none.
 *
 * **This is how the game opens a facility**, read 25 September 2026. The
 * message system's compiler turns each of these tags into a **facility code**
 * carried in the message, and `func_0206f6cc` — the one function service 5,
 * the talk service, calls for this — switches on that byte through a table at
 * `0x0206f70c`:
 *
 * ```
 * 0206f6fc  ldrb  r1, [r5, r4]           ; the facility code
 * 0206f700  cmp   r1, #0xc
 * 0206f704  addls pc, pc, r1, lsl #2     ; so code n is at 0x0206f70c + 4n
 * ```
 *
 * 1 the inn, 2 the church, 3 the bank, 4 the shop, **5 and 8 Patty's party
 * planning**, 6 and 12 the Quester's Rest counter, **7 the Krak Pot**, 9 and
 * 10 Alltrades, 11 the Starflight Express. Each arm begins the matching
 * service record — see `docs/event-scripts.md`.
 *
 * So a facility is not a menu command and never was: **it is a tag at the end
 * of somebody's talk line**, which is why the pot has to be spoken to.
 */
export interface Service {
  readonly kind: 'SHOP' | 'INN' | 'CHURCH' | 'RENKIN'
  readonly id: number
}

/** Services whose tag carries a number, `<SHOP=32>`. */
const SERVICES = new Set<string>(['SHOP', 'INN', 'CHURCH'])

/**
 * Services whose tag is bare, `<RENKIN>` — they select nothing, because there
 * is only one of each. `<BANK>` and `<LUIDA>` are the same shape and are not
 * here yet: the bank and Patty's party planning are not built.
 */
const BARE_SERVICES = new Set<string>(['RENKIN'])

/**
 * A sound a line asks for: `<ME_008>` a jingle, `<SE_014>` an effect.
 *
 * These are not formatting. **The game's markup compiler turns them into
 * control codes carried in the message itself** — `<ME_n>` becomes `0xFF34 + n`
 * and `<SE_n>` becomes `0xFF4B` — so the sound is played by whatever walks the
 * message, at the point in the text where it was written.
 *
 * **`id` is the game's own request id, not the number in the tag.** The
 * interpreter's arms at `0x02066860` and `0x020668b0` were read for this:
 *
 * - `<ME_n>` → `id = code − 0xFF03`, so **`n + 49`**. `<ME_008>` asks for 57.
 * - `<SE_n>` → the code is always `0xFF4B` and **the runtime answers it with a
 *   flat 14** (`mov r1, #0xe`); the tag's number never reaches it at all, and
 *   only 14 is in the compiler's list anyway.
 *
 * The two go to different calls — `0x209c830` for a jingle, `0x205eaa0` for an
 * effect, the latter shared with `<EXC>` and `<QES>` at ids 6 and 28.
 *
 * **What that id space is has not been read**, and it is not this host's:
 * `playEffect` takes an index into the effect archive's SSAR records, and the
 * cartridge has no record 14. So the cue is carried and nothing plays it —
 * see `docs/still-open.md`. Playing the archive's 14th effect because the
 * game asked for sound 14 would be an invented mapping that appeared to work.
 *
 * `page` is the page it falls on, since that is when it should be heard.
 */
export interface SoundCue {
  readonly kind: 'ME' | 'SE'
  readonly id: number
  readonly page: number
}

/**
 * How the character being talked to should be facing.
 *
 * **Every message turns them to face the player by default.** The engine's
 * prefix pass at `0x0206a3c0` sets the pending-turn flag and the target angle
 * to `atan2(player − npc)` before it looks at a single tag, and the tags below
 * only ever override that. So the interesting case is `<N_TURN>`, which is 208
 * of the cartridge's turns: it is not "turn" at all but **"no turn"**, putting
 * the target back to the angle saved when the conversation opened and clearing
 * the flag. See `docs/event-scripts.md` §7a.
 *
 * - `player` — the default, and `<TURN_P>`.
 * - `keep` — `<N_TURN>`: stay as you were.
 * - `back` — `<R_TURN>` and `<END_R_TURN>`: return to the saved facing. The
 *   two differ in whether the box waits for the rotation, which this does not
 *   record because nothing here animates it yet.
 * - `angle` — `<TURN=n>`, an absolute facing in radians.
 */
export interface Turn {
  readonly kind: 'player' | 'keep' | 'back' | 'angle'
  /** For `angle` only. The game stores fx32 radians; this is the float. */
  readonly radians?: number
}

/**
 * A balloon over the speaker's head: `<EXC>` is `!`, `<QES>` is `?`.
 *
 * Both write 60 to the window's `+0x959` and 1 to `+0x9b7`, and differ only in
 * a kind byte at `+0x95c` — 0 and 1 — and the sound they ask for, 6 and 28.
 * Sixty frames is a second.
 */
export type Emote = 'EXC' | 'QES'

/**
 * What a line does to the quest log. None of it is text.
 *
 * `<QUEST=n>` binds a quest to the window — the compiler turns the number into
 * the index of its slot in the 204-entry active-quest list and stashes it, and
 * the interpreter copies it onto the window at `0x020668e8`. The rest act on
 * whatever is bound:
 *
 * - `HAN` (`<QUEST_HAN>`) and `FAILED` (`<QUEST_FAILED>`) open a banner over
 *   the message, by identical code differing only in one bit and the sound
 *   asked for. **What `HAN` abbreviates is not established** — it is symmetric
 *   with `FAILED`, which is suggestive and no more, so it is left as the tag
 *   spells it.
 * - `CLOSE` (`</QUEST>`) closes it.
 *
 * `commit` is `<QUEST_SE>`, which writes a packed word per quest and asks for
 * a fanfare. **None of this is drawn or recorded yet**; it is read so that the
 * line is no longer a mystery and the banner can be built against it.
 */
export interface QuestNote {
  readonly id: number | undefined
  readonly banner: 'HAN' | 'FAILED' | 'CLOSE' | undefined
  readonly commit: boolean
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

/** The character a tag stands for — `<1>` an apostrophe, `<'e>` é — or undefined. */
export function glyphOf(name: string): string | undefined {
  return GLYPHS[name] ?? accented(name)
}

/** One page of a line, and who says it when the text names them. */
export interface TalkPage {
  readonly speaker: string | undefined
  readonly text: string
  /** Whether the box is centred — `<CEN>`, the narration card. */
  readonly centred: boolean
}

/** One of a prompt's answers: the marker its branch opens with, and what the box shows. */
export interface Answer {
  readonly marker: string
  readonly label: string
}

/** A prompt waiting for an answer, and the token it stands at; its branches follow. */
export interface Prompt {
  readonly kind: string
  readonly answers: readonly Answer[]
  readonly at: number
}

/**
 * The prompts and the markers their branches open with — see `FORMAT.md`,
 * "Prompts".
 *
 * `<UKE>` and `<YAME>` as accept and decline used to be marked `INFERRED` here,
 * from the Japanese, from standing at quest offers, and from the system strings
 * listing "Yes", "No", "Accept", "Decline" in that order (messages 27 to 30).
 * **The game's own markup compiler settles it.** Every tag compiles to a
 * two-byte code, and these four are consecutive in the order their two prompts
 * introduce them — `<YES>` 0xFF14, `<NO>` 0xFF15, `<UKE>` 0xFF16, `<YAME>`
 * 0xFF17, against `<YESNO>` 0xFF04 and `<UKEYAME>` 0xFF08. The pairing is the
 * compiler's, not a reading of the text: see `docs/event-scripts.md` §7a.
 */
const PROMPTS: Readonly<Record<string, readonly Answer[]>> = {
  YESNO: [
    { marker: 'YES', label: 'Yes' },
    { marker: 'NO', label: 'No' },
  ],
  UKEYAME: [
    { marker: 'UKE', label: 'Accept' },
    { marker: 'YAME', label: 'Decline' },
  ],
}
const MARKERS = new Set(Object.values(PROMPTS).flatMap((answers) => answers.map((a) => a.marker)))

/** `<ME_008>`, `<SE_014>` — see {@link SoundCue}. The digits are decimal. */
const SOUND = /^(ME|SE)_(\d+)$/

/** What running a line from one point came to: its pages, then a prompt or the end. */
export interface Run {
  readonly pages: readonly TalkPage[]
  /** Tags left out of the text because nothing here knows what they do. */
  readonly unhandled: readonly string[]
  /** The prompt the run stopped at, asked on its last page; undefined when the line is over. */
  readonly prompt: Prompt | undefined
  /** The service the run hands over to at its end, if it names one. */
  readonly service: Service | undefined
  /** The jingles and effects the line asks for, in the order it asks. */
  readonly cues: readonly SoundCue[]
  /**
   * `<ADD>`: the box stays open and the next message is drawn **into it**
   * rather than into a fresh one.
   *
   * The game does this by leaving the message in wait-state 3 — which nothing
   * else ever writes — so that the next `ShowMessage` takes the append path at
   * `0x02044f3c` instead of tearing the window down. It is the commonest tag
   * on the cartridge: 429 of 687 events, 1,724 uses.
   *
   * **Nothing acts on this yet.** It is read and carried so that the tag is no
   * longer a mystery and so the append can be built against it; this host
   * already keeps its box up across a conversation's messages, and starting
   * the next one mid-line is work in the box, not in the markup.
   */
  readonly continues: boolean
  /** How the speaker should be facing — see {@link Turn}. Read, not yet acted on. */
  readonly turn: Turn
  /** The balloon over the speaker's head, if the line asks for one. */
  readonly emote: Emote | undefined
  /** `<SHAKE>`: the box shakes for 30 frames. */
  readonly shake: boolean
  /** `<TIME=n>`: hold for `n` ticks before going on. */
  readonly pause: number | undefined
  /**
   * `<ALL_RECOVER=a,b,c>`: a gameplay action written where a line would go —
   * the one thing on the cartridge whose whole message is a single tag.
   *
   * The compiler stores `a != 0` and `b != 0` as two flags and `c` as a count,
   * and the interpreter hands all three to an overlay. **What the two flags
   * select is not established**, so they are carried under the names the bytes
   * justify rather than a guess at what is being restored.
   */
  readonly restore:
    | { readonly flagA: boolean; readonly flagB: boolean; readonly amount: number }
    | undefined
  /** What the line does to the quest log — see {@link QuestNote}. */
  readonly quest: QuestNote | undefined
}

/** A line read straight through, as far as its first prompt. */
export type RenderedLine = Pick<Run, 'pages' | 'unhandled'>

/**
 * Run a line, from one of its tokens to its next prompt or its end.
 *
 * `<PAGE>` starts a new page — **INFERRED**, from standing between whole
 * sentences, each page opening with its own speaker mark. A page that opens
 * `//Name//` is said by Name; one that opens `*:` by someone unnamed, and the
 * mark is not shown. `<HERO>` and `<LEADER>` are the Hero's name — the second
 * **INFERRED** for a party of one — and `<Cap>` capitalises what follows.
 *
 * A prompt stops the run, to be asked on its last page. A branch ends at
 * `<END>`, `<CLOSE>` or the next branch's marker, since branches do not rejoin;
 * `<JP_x>` goes back or on to `<LB_x>`, which every jump on the cartridge has.
 */
export function runLine(
  tokens: readonly MarkupToken[],
  from = 0,
  context: TextContext = DEFAULT_CONTEXT,
): Run {
  const pages: { text: string; centred: boolean }[] = []
  const unhandled = new Set<string>()
  let page = ''
  let capitalise = false
  /**
   * Whether the box is centred. `<CEN>` writes 1 to the window's byte at
   * `+0x9b8` and nothing writes it back, so it holds for the rest of the
   * message — see `docs/event-scripts.md` §7a. It is how the game sets a
   * narration card: "Some days later, the landslide is cleared…".
   */
  let centred = false
  let service: Service | undefined
  const cues: SoundCue[] = []
  let continues = false
  // Every message faces the speaker at the player unless a tag says otherwise.
  let turn: Turn = { kind: 'player' }
  let emote: Emote | undefined
  let shake = false
  let pause: number | undefined
  let restore: Run['restore']
  let questId: number | undefined
  let banner: QuestNote['banner']
  let commit = false
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
  const done = (prompt?: Prompt): Run => {
    const kept = pages.filter((p) => p.text.trim() !== '')
    // A prompt is asked on the page it ends, even one with nothing before it.
    if (prompt || page.trim() !== '') kept.push({ text: page, centred })
    return {
      pages: kept.map(speakerOf),
      unhandled: [...unhandled],
      prompt,
      service,
      cues,
      continues,
      turn,
      emote,
      shake,
      pause,
      restore,
      quest:
        questId === undefined && banner === undefined && !commit
          ? undefined
          : { id: questId, banner, commit },
    }
  }

  // A jump that never reaches a prompt would go round for ever; no line needs
  // anything like this many steps.
  let steps = 0
  for (let at = from; at < tokens.length; at++) {
    if (++steps > tokens.length * 8) break
    const token = tokens[at] as MarkupToken
    if (token.kind === 'text') {
      put(token.text)
      continue
    }
    if (token.kind === 'break') {
      if (visible()) page += '\n'
      continue
    }
    const { name } = token
    const condition = /^(IF|ELSE|ENDIF)_(.+)$/.exec(name)
    if (condition) {
      if (condition[1] === 'IF') shown.push(context.conditions[condition[2] as string] ?? true)
      else if (condition[1] === 'ELSE') shown[shown.length - 1] = !shown[shown.length - 1]
      else shown.pop()
      continue
    }
    if (!visible()) continue
    const answers = PROMPTS[name]
    if (answers) return done({ kind: name, answers, at })
    // `<END_R_TURN>` is 0xFF02, which the interpreter treats exactly as
    // `<END>` 0xFF01 — and additionally sends the speaker back to the facing
    // it had before the conversation, without waiting for the rotation.
    if (name === 'END_R_TURN') {
      turn = { kind: 'back' }
      return done()
    }
    if (MARKERS.has(name) || name === 'END' || name === 'CLOSE') {
      // **A bare service tag may sit immediately after the end.** The Krak
      // Pot's hand-over line is `…<END><RENKIN>`, where `<ADD><SHOP=32>` puts
      // its tag before the end instead. Only the very next token is taken:
      // scanning further could reach a tag belonging to another answer's
      // branch, which is a different conversation.
      const next = tokens[at + 1]
      if (name === 'END' && next?.kind === 'tag' && BARE_SERVICES.has(next.name)) {
        service = { kind: next.name as Service['kind'], id: 0 }
      }
      return done()
    }
    if (name.startsWith('JP_')) {
      const label = tokens.findIndex((t) => t.kind === 'tag' && t.name === `LB_${name.slice(3)}`)
      if (label >= 0) at = label
      else unhandled.add(name)
      continue
    }
    if (name.startsWith('LB_')) continue
    if (name === 'PAGE' || name === 'PAD_WAIT' || name === 'PAD_WAIT_NOCUR') {
      // All three stop and wait for a button. `<PAD_WAIT_NOCUR>` differs only
      // in not showing the arrow, which this box does not draw anyway.
      pages.push({ text: page, centred })
      page = ''
    } else if (name === 'ADD') {
      // A message terminator that leaves the window standing — see `Run`.
      continues = true
    } else if (name === 'N_TURN') {
      turn = { kind: 'keep' }
    } else if (name === 'R_TURN') {
      turn = { kind: 'back' }
    } else if (name === 'TURN_P') {
      turn = { kind: 'player' }
    } else if (name === 'TURN' && Number.isFinite(Number(token.args[0]))) {
      turn = { kind: 'angle', radians: Number(token.args[0]) }
    } else if (name === 'EXC' || name === 'QES') {
      emote = name
    } else if (name === 'SHAKE') {
      shake = true
    } else if (name === 'TIME' && Number.isInteger(Number(token.args[0]))) {
      pause = Number(token.args[0])
    } else if (name === 'ALL_RECOVER' && token.args.length === 3) {
      restore = {
        flagA: Number(token.args[0]) !== 0,
        flagB: Number(token.args[1]) !== 0,
        amount: Number(token.args[2]),
      }
    } else if (name === 'QUEST' && Number.isInteger(Number(token.args[0]))) {
      questId = Number(token.args[0])
    } else if (name === 'QUEST_HAN' || name === 'QUEST_FAILED') {
      banner = name === 'QUEST_HAN' ? 'HAN' : 'FAILED'
    } else if (name === '/QUEST') {
      banner = 'CLOSE'
    } else if (name === 'QUEST_SE') {
      commit = true
    } else if (name === 'CEN' || name === 'CEN_ON') {
      centred = true
    } else if (name === 'CEN_OFF') {
      centred = false
    } else if (name === 'Cap') {
      capitalise = true
    } else if (name === 'HERO' || name === 'LEADER') {
      put(context.heroName)
    } else if (SOUND.test(name)) {
      // A sound is not text. The compiler gives it a control code of its own
      // and the message tick plays it where it stands, so it comes out of the
      // line rather than going into it.
      const [kind, digits] = name.split('_') as [string, string]
      // The id the runtime would ask for, not the number in the tag.
      const id = kind === 'ME' ? Number(digits) + 49 : 14
      cues.push({ kind: kind as SoundCue['kind'], id, page: pages.length })
    } else if (SERVICES.has(name) && Number.isInteger(Number(token.args[0]))) {
      service = { kind: name as Service['kind'], id: Number(token.args[0]) }
    } else if (BARE_SERVICES.has(name)) {
      // There is one Krak Pot, so its tag selects nothing and its id is 0.
      service = { kind: name as Service['kind'], id: 0 }
    } else if (context.values?.[name] !== undefined) {
      put(context.values[name] as string)
    } else {
      const glyph = GLYPHS[name] ?? accented(name)
      if (glyph === undefined) unhandled.add(name)
      else put(glyph)
    }
  }
  return done()
}

/**
 * Where an answer's branch starts: just after the first marker for it after the
 * prompt. Undefined when the line has none, and what follows is a script's.
 */
export function branchOf(
  tokens: readonly MarkupToken[],
  prompt: Prompt,
  answer: Answer,
): number | undefined {
  for (let at = prompt.at + 1; at < tokens.length; at++) {
    const token = tokens[at]
    if (token?.kind !== 'tag' || token.name !== answer.marker) continue
    // INFERRED: answers whose markers stand side by side — `<YES><NO>` — share
    // the branch after them. Read as two branches, the first would be empty
    // and end the line; the innkeeper's counter line is one.
    let from = at + 1
    for (
      let next = tokens[from];
      next?.kind === 'tag' && MARKERS.has(next.name);
      next = tokens[from]
    ) {
      from++
    }
    return from
  }
  return undefined
}

/** How a line reads on screen, straight through to its first prompt — see `runLine`. */
export function renderLine(text: string, context: TextContext = DEFAULT_CONTEXT): RenderedLine {
  const { pages, unhandled } = runLine(parseMarkup(text), 0, context)
  return { pages, unhandled }
}

/** A conversation under way: who, what is being read out, and how far through it. */
export interface Conversation {
  readonly who: Talker
  /** Where the words came from, for the status line: a chapter and a label, or an event. */
  readonly source: string
  readonly texts: readonly (string | undefined)[]
  /** One note per text, for the status line: a line's tag and numbers, or a message's number. */
  readonly notes: readonly string[]
  /** Which text, and its markup. */
  readonly line: number
  readonly tokens: readonly MarkupToken[]
  /** What the text has run to since it started, or since its last answer. */
  readonly run: Run
  readonly page: number
  /** Which answer is chosen, while a prompt is being asked. */
  readonly choice: number
  /** How the conversation got here, for the status line: the answer just given. */
  readonly aside: string | undefined
  /** Which of a prompt's answers was last given, from 0 — kept until the next is. */
  readonly answered?: number
}

type Script = Pick<Conversation, 'who' | 'source' | 'texts' | 'notes'>

const scriptOf = ({ who, source, texts, notes }: Conversation): Script => ({
  who,
  source,
  texts,
  notes,
})

/** The first page of the first text, at or after `line`, that has anything to show. */
function fromLine(
  script: Script,
  line: number,
  context: TextContext,
  aside?: string,
): Conversation | undefined {
  for (let at = line; at < script.texts.length; at++) {
    const tokens = parseMarkup(script.texts[at] ?? '')
    const run = runLine(tokens, 0, context)
    if (run.pages.length > 0) {
      return { ...script, line: at, tokens, run, page: 0, choice: 0, aside }
    }
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

/** The prompt being asked, when the conversation is on the page that asks it. */
export function promptOf(conversation: Conversation): Prompt | undefined {
  const { run, page } = conversation
  return run.prompt && page === run.pages.length - 1 ? run.prompt : undefined
}

/** Choose another of the prompt's answers, round and round. */
export function moveChoice(conversation: Conversation, by: number): Conversation {
  const prompt = promptOf(conversation)
  if (!prompt) return conversation
  const count = prompt.answers.length
  return { ...conversation, choice: (((conversation.choice + by) % count) + count) % count }
}

/**
 * Go on: the next page; on a prompt, the chosen answer's branch; at the end of
 * a text, the next text; and undefined when there is no more.
 *
 * An answer the line has no branch for moves on to the next text, and says
 * so: what follows it is a script's, and scripts are not run yet.
 */
export function nextPage(
  conversation: Conversation,
  context: TextContext = DEFAULT_CONTEXT,
): Conversation | undefined {
  if (conversation.page + 1 < conversation.run.pages.length) {
    return { ...conversation, page: conversation.page + 1, aside: undefined }
  }
  const prompt = conversation.run.prompt
  if (!prompt) return fromLine(scriptOf(conversation), conversation.line + 1, context)
  const answered = prompt.answers[conversation.choice] ? conversation.choice : 0
  const chosen = prompt.answers[answered] as Answer
  const from = branchOf(conversation.tokens, prompt, chosen)
  const run = from === undefined ? undefined : runLine(conversation.tokens, from, context)
  if (run === undefined || run.pages.length === 0) {
    const why =
      from === undefined
        ? `answered ${chosen.label} — the line has no branch for it; what follows is a script's`
        : `answered ${chosen.label}`
    const next = fromLine(scriptOf(conversation), conversation.line + 1, context, why)
    return next && { ...next, answered }
  }
  return { ...conversation, run, page: 0, choice: 0, aside: `answered ${chosen.label}`, answered }
}

/**
 * The answer `f` gives now, from 0, if the conversation stands at a prompt —
 * as {@link nextPage} takes it. For the caller to keep: a branch that says
 * nothing ends the talk with the answer — the Hexagon statue's Yes,
 * `<YES><END>`, which the switch's scene waits on.
 */
export function answerNow(conversation: Conversation): number | undefined {
  const prompt = conversation.run.prompt
  if (!prompt || conversation.page + 1 < conversation.run.pages.length) return undefined
  return prompt.answers[conversation.choice] ? conversation.choice : 0
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
 * A trigger word read as an operation, its high half, and an argument, its low
 * — see `triggerWords`. **INFERRED**, each with the measure behind it in
 * `FORMAT.md`; the story's own operations, flags among them, are `story.ts`'s.
 */
/** The character a record is about: placed in the record's map on 66%, against 18% for another. */
const OP_CHARACTER = 6
/** A talk label: one of that character's line labels on 707 of 793, against 221 for a control. */
const OP_LABEL = 11
/** With argument 1, the label is the high half of a word whose low half is 0: 338 of 519, against 0. */
const OP_LABEL_BY = 36
/**
 * The same, on a character's own records (value 5 of 0): the word names the
 * character again, as `6` does on every one read, and the label follows as a
 * word whose low half is 0 — 192 or 193 as the story's flags stand.
 */
const OP_LABEL_OF = 118
/** An event, by number: 58 of 64 in Angel Falls name one. */
const OP_EVENT = 119
/**
 * Holds when the Hero has no companion with them; its argument is 0 on all 7
 * in Angel Falls. Each of those records sits before a character's first-time
 * event and gives the label that comes after it instead — and in every one of
 * those events (2222, 2230, 2240, 2250, 2430, 2440, 2450) Ivor speaks. So
 * without Ivor the character just talks. INFERRED.
 */
const OP_ALONE = 86
/** The label of a character's plain line — the commonest, and the one chapter B's day-to-day lines carry. INFERRED. */
const PLAIN = 16

const wordsOf = triggerWords

/** A line's first two numbers as a range of sub-stages, 99 for "to the end". */
function covers(line: TalkLine, minor: number): boolean {
  const from = line.unknown_numbers[0] as number
  const to = line.unknown_numbers[1] as number
  return from <= minor && (minor <= to || to === 99)
}

/** INFERRED: the four-number form is the night line — on tag 1, 42.5% of them use night words against 9.2% of the three-number ones. */
const isNightLine = (line: TalkLine) => line.unknown_numbers.length === 4
const labelOf = (line: TalkLine) => line.unknown_numbers[line.unknown_numbers.length - 1]

/**
 * Where a talk goes on once it is read — see {@link labelOnward}: the map and
 * the event there, and the prompt's answer it waits for, from 0, if it waits.
 */
export interface Onward {
  readonly map: number
  readonly event: number
  readonly answer: number | undefined
}

/** What a character says now: one of their lines, or an event that runs instead. */
export type Choice =
  | {
      readonly kind: 'line'
      readonly line: TalkLine
      readonly why: string
      /** The marks the record that chose it sets — see `OP_SET_MARK`. */
      readonly marks?: readonly number[]
      /** Where the talk goes on once read, if its label's talk record says — see {@link labelOnward}. */
      readonly onward?: Onward
      /**
       * The event its label leads to, played once the line is read — and if the
       * line asks, only on the answer it waits for. See {@link labelEvent}.
       */
      readonly leadsTo?: { readonly event: number; readonly answer: number | undefined }
    }
  | {
      readonly kind: 'event'
      readonly event: number
      readonly why: string
      /** The marks the records that chose it set — see `OP_SET_MARK`. */
      readonly marks?: readonly number[]
    }

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
  /** The story flags set — see `flagsHold`. None, when not given. */
  readonly flags?: ReadonlySet<number>
  /** The marks set, the second set of flags — see `OP_IF_MARK`. Not read when not given. */
  readonly marks?: ReadonlySet<number>
  /** Whether the Hero has no companion with them — see `OP_ALONE`. Not read when not given. */
  readonly alone?: boolean
  /** The step within the stage — see `OP_AT_STEP`. Not read when not given. */
  readonly step?: number | undefined
}

/**
 * Which of a character's lines applies now, or which event runs instead.
 *
 * **INFERRED throughout**, from the measures above. The first of the area's
 * triggers in this map, over a span that covers the stage, naming the
 * character and a talk operation, and whose flag conditions hold for the
 * story's flags, decides: a label, or failing that an event. A label may lead
 * on to an event of its own — see {@link labelEvent} — which then runs instead.
 * Without one, the plain line. The line is the tag-1 line with that label whose
 * range covers the sub-stage, in the time of day asked for if there is one and
 * the other if not; the other tags are errands and counters, not talk. Where no
 * line has the label, the first that covers the sub-stage is taken, and `why`
 * says it is a guess.
 */
export function pickLine(asking: Asking): Choice | undefined {
  const { triggers, map, stage, night, id, marks, step } = asking
  const flags = asking.flags ?? new Set<number>()
  let marked: number[] = []
  let onward: Onward | undefined
  let leadsTo: { event: number; answer: number | undefined } | undefined
  const lines = asking.lines.filter((line) => line.tag === 1)
  const labels = new Set(lines.map(labelOf))
  let label = PLAIN
  let why = `label ${PLAIN}, the plain line — no trigger names them here`

  const applies = (candidate: Trigger) =>
    (map === undefined || candidate.map === map) &&
    stageOrder(candidate.from) <= stageOrder(stage) &&
    stageOrder(stage) <= stageOrder(candidate.to)

  const naming = (candidate: Trigger) =>
    applies(candidate) && wordsOf(candidate).some((w) => w.op === OP_CHARACTER && w.arg === id)
  const chooses = (candidate: Trigger) => {
    if (!naming(candidate)) return false
    const words = wordsOf(candidate)
    return (
      words.some(
        (w) =>
          w.op === OP_LABEL || w.op === OP_LABEL_BY || w.op === OP_LABEL_OF || w.op === OP_EVENT,
      ) &&
      flagsHold(words, flags, marks, step) &&
      (asking.alone === undefined || asking.alone || !words.some((w) => w.op === OP_ALONE))
    )
  }
  // The character's own records choose first; a talk record chooses only for
  // one who has none here — otherwise it makes an event of a label they
  // choose, see `labelEvent`. INFERRED: 116 talk records with no condition sit
  // before a record of the same character, map and span, which the first
  // match in the file would leave dead — 269 of them, Patty's among them.
  const own = triggers.some((c) => c.unknown_5 !== KIND_TALK && naming(c))
  const trigger =
    triggers.find((c) => c.unknown_5 !== KIND_TALK && chooses(c)) ??
    (own ? undefined : triggers.find((c) => c.unknown_5 === KIND_TALK && chooses(c)))
  if (trigger) {
    const words = wordsOf(trigger)
    marked = marksSet(words)
    const where = `the trigger at 0x${trigger.offset.toString(16)}`
    const named = words.find((w) => w.op === OP_LABEL && w.arg !== 0)?.arg
    // The label the record chooses, by its own words — after the character's
    // label word, the first that is a label with 0 — whether or not the talk
    // file has a line with it; and the event a talk record makes of it.
    const at = words.findIndex(
      (w) => (w.op === OP_LABEL_BY && w.arg === 1) || (w.op === OP_LABEL_OF && w.arg === id),
    )
    const chosenHere =
      named ??
      (at >= 0 ? words.slice(at + 1).find((w) => w.arg === 0 && w.op !== 0)?.op : undefined)
    const leads =
      chosenHere === undefined
        ? undefined
        : labelEvent(triggers, applies, id, chosenHere, flags, marks, step)
    // The line is read first and the event played after it — as a let's play
    // reads the Hexagon's inscription out before its figure appears, and asks
    // "Press the button?" before the switch's scene. Where no line has the
    // label, the one that would be said is: the inscription's record names
    // label 80 and its one line is 96, and still it is read out (INFERRED,
    // thin: the one such case seen). With no line at all, the event at once.
    const read = lines.some((line) => covers(line, stage.minor))
    if (leads && !read) {
      const both = [...marked, ...leads.marks]
      return {
        kind: 'event',
        event: leads.event,
        why: `event ${leads.event}, which label ${chosenHere} leads to by the trigger at 0x${leads.offset.toString(16)}`,
        ...(both.length > 0 ? { marks: both } : {}),
      }
    }
    if (leads && chosenHere !== undefined) {
      marked = [...marked, ...leads.marks]
      label = chosenHere
      why = `label ${chosenHere}, then event ${leads.event}, which it leads to by the trigger at 0x${leads.offset.toString(16)}`
      leadsTo = { event: leads.event, answer: leads.answer }
    } else {
      onward =
        chosenHere === undefined
          ? undefined
          : labelOnward(triggers, applies, id, chosenHere, flags, marks, step)
      const byWord = words.some(
        (w) => (w.op === OP_LABEL_BY && w.arg === 1) || (w.op === OP_LABEL_OF && w.arg === id),
      )
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
        return {
          kind: 'event',
          event,
          why: `event ${event}, from ${where}`,
          ...(marked.length > 0 ? { marks: marked } : {}),
        }
      }
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
    return {
      kind: 'line',
      line: chosen,
      why: why + time,
      ...(marked.length > 0 ? { marks: marked } : {}),
      ...(onward ? { onward } : {}),
      ...(leadsTo ? { leadsTo } : {}),
    }
  }
  const guess = covering.find((line) => isNightLine(line) === night) ?? covering[0]
  if (guess) {
    return {
      kind: 'line',
      line: guess,
      why: `${why}; no such line covers ${stage.major}.${stage.minor}, so the first that does — a guess`,
      // Read before the event its label leads to — see `read` above.
      ...(leadsTo ? { leadsTo, ...(marked.length > 0 ? { marks: marked } : {}) } : {}),
    }
  }
  return undefined
}

/** Value 5 of a talk record: a character, a talk label, and what talking with it does. */
const KIND_TALK = 1

/**
 * The prompt's answer a talk record's event waits for, from 0 — Yes. INFERRED:
 * in Angel Falls, the pass and the Hexagon, 7 of the 9 talk records with a
 * label, an event and a `16` have a line that asks — one more is the inn's
 * welcome, and one has no line found — where 3 of the 17 without one do. The
 * switch's, `6:201 11:194 16:0 119:2530`, asks "Press the button?", and a
 * let's play answering No is told the Hero decides not to, and nothing moves.
 */
const OP_EVENT_ANSWER = 16

/**
 * The event a character's chosen label leads to: a talk record — see
 * {@link KIND_TALK} — over the map and stage, naming the character, that label
 * with {@link OP_LABEL}, and an event, its flag conditions holding; and the
 * answer it waits for, {@link OP_EVENT_ANSWER}.
 *
 * **INFERRED**: of the 179 talk records on the cartridge with a label and an
 * event, 97 have the same character's own record choosing that label in the
 * same map and span, first in the file on all 97 — Ivor's at the landslide,
 * `6:7 118:7 192:0` and then `6:7 11:192 119:2350`. The other 82 are not
 * established.
 */
function labelEvent(
  triggers: readonly Trigger[],
  applies: (candidate: Trigger) => boolean,
  id: number,
  label: number,
  flags: ReadonlySet<number>,
  marks: ReadonlySet<number> | undefined,
  step: number | undefined,
): { event: number; offset: number; marks: number[]; answer: number | undefined } | undefined {
  for (const candidate of triggers) {
    if (candidate.unknown_5 !== KIND_TALK || !applies(candidate)) continue
    const words = wordsOf(candidate)
    if (!words.some((w) => w.op === OP_CHARACTER && w.arg === id)) continue
    if (!words.some((w) => w.op === OP_LABEL && w.arg === label)) continue
    if (!flagsHold(words, flags, marks, step)) continue
    const event = words.find((w) => w.op === OP_EVENT)?.arg
    if (event !== undefined) {
      return {
        event,
        offset: candidate.offset,
        marks: marksSet(words),
        answer: words.find((w) => w.op === OP_EVENT_ANSWER)?.arg,
      }
    }
  }
  return undefined
}

/**
 * The prompt's answer a talk record's onward waits for, from 0. INFERRED, and
 * thin: two records on the cartridge carry it beside an onward. Erinn's at 2.1,
 * `6:98 11:193 16:0 177:0 1:0 133:1110 2130:0`, goes on to the morning upstairs
 * — and the line it goes on from asks the Hero in for the night, its first
 * answer, Yes, being dinner. A let's play answers Yes and wakes to the morning.
 */
const OP_ANSWER = 177

/**
 * Where talking to a character goes on once read, by the talk record for the
 * label they chose — see {@link KIND_TALK}: `133 : map` and then the event as
 * its operation, as an event's own record goes on (`OP_THEN_MAP`), and the
 * answer it waits for, {@link OP_ANSWER}.
 */
function labelOnward(
  triggers: readonly Trigger[],
  applies: (candidate: Trigger) => boolean,
  id: number,
  label: number,
  flags: ReadonlySet<number>,
  marks: ReadonlySet<number> | undefined,
  step: number | undefined,
): Onward | undefined {
  for (const candidate of triggers) {
    if (candidate.unknown_5 !== KIND_TALK || !applies(candidate)) continue
    const words = wordsOf(candidate)
    if (!words.some((w) => w.op === OP_CHARACTER && w.arg === id)) continue
    if (!words.some((w) => w.op === OP_LABEL && w.arg === label)) continue
    if (!flagsHold(words, flags, marks, step)) continue
    const go = words.findIndex((w) => w.op === OP_THEN_MAP)
    const next = go < 0 ? undefined : words[go + 1]
    if (go < 0 || !next || next.arg !== 0) continue
    return {
      map: (words[go] as { arg: number }).arg,
      event: next.op,
      answer: words.find((w) => w.op === OP_ANSWER)?.arg,
    }
  }
  return undefined
}

function speakerOf({ text: page, centred }: { text: string; centred: boolean }): TalkPage {
  const trimmed = page.replace(/^\s+/, '')
  const named = /^\/\/(.+?)\/\/\s*/.exec(trimmed)
  if (named) return { speaker: named[1], text: trimmed.slice(named[0].length), centred }
  const someone = /^\*:\s*/.exec(trimmed)
  if (someone) return { speaker: undefined, text: trimmed.slice(someone[0].length), centred }
  return { speaker: undefined, text: trimmed, centred }
}

/**
 * Every event a map's triggers can reach, in order — what the witness looks
 * at. A trigger names an event with `OP_EVENT`, and several may name the same
 * one, so this is the set rather than the list.
 *
 * It ignores the conditions on a trigger deliberately: the witness wants
 * everything an area *can* play, not what it would play now.
 */
export function eventsTriggered(triggers: readonly Trigger[]): number[] {
  const events = new Set<number>()
  for (const trigger of triggers) {
    for (const word of wordsOf(trigger)) {
      if (word.op === OP_EVENT && word.arg > 0) events.add(word.arg)
    }
  }
  return [...events].sort((a, b) => a - b)
}
