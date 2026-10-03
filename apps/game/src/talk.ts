import {
  type Conditions,
  conditionsOf,
  type EventOutcome,
  entriesOf,
  flagsHold,
  type MarkupToken,
  OP_ANSWER_IS,
  outcomeOf,
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
 * The chapter letter whose talk files go with a story stage — read from the
 * game's code: the talk opens `/data/scenario/<area><letter>0.gp2` (ov017
 * `func_ov017_021b8e8c`), the letter being the live major stage's in
 * `ABCDEFGHIJSTKLMNOPQ` from 1 (`func_ov017_0218d2c4`) — so 11 and 12 are `S`
 * and `T`, and 13 to 19 `K` to `Q`. An area without that chapter's archive
 * says nothing, as the game's load of it fails. With no stage, the first
 * letter, for looking through.
 */
export function letterForStage(
  letters: readonly string[],
  stage: Stage | undefined,
): string | undefined {
  if (letters.length === 0) return undefined
  if (stage === undefined) return letters[0]
  const letter = CHAPTER_LETTERS[stage.major - 1]
  if (letter === undefined) return undefined
  return letters.find((l) => l.startsWith(letter))
}

/** The talk's chapter letters by major stage, from 1 — see {@link letterForStage}. */
export const CHAPTER_LETTERS = 'ABCDEFGHIJSTKLMNOPQ'

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
  readonly kind: 'SHOP' | 'INN' | 'CHURCH' | 'RENKIN' | 'LUIDA' | 'DAMA'
  readonly id: number
}

/** Services whose tag carries a number, `<SHOP=32>`. */
const SERVICES = new Set<string>(['SHOP', 'INN', 'CHURCH'])

/**
 * Services whose tag is bare — they select nothing, because there is only one
 * of each. `<RENKIN>` is the Krak Pot (facility code 7) and `<LUIDA>` is
 * Patty's Party Planning Place (codes 5 and 8; ルイーダ is the tavern's
 * Japanese name, which is why the tag is not "PATTY"). `<DAMA>` is Alltrades
 * Abbey's vocation change (code 9; ダーマ is the Abbey's Japanese name): the
 * whole of Jack of Alltrades' line in `X02M01`, with no text before it — see
 * `abbey.ts`. **Every facility code has its tag**, in the table at
 * `0x020f0afc` that `func_0206f550` matches a line against, the code being
 * the tag's place: also `<RIKKA>` 6, `<LAVIELL>` 8, `<DAMA_SATORI>` 10 and
 * `<ARKSANDY>` 11, none of them built.
 *
 * `<BANK>` is the same shape and is not here: the bank is not built.
 */
const BARE_SERVICES = new Set<string>(['RENKIN', 'LUIDA', 'DAMA'])

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

/** An event, by number — see `OP_EVENT` in `@minstrel/game-formats`. */
const OP_EVENT = 119
/** Sets a flag and plays an event — see `OP_FLAG_AND_EVENT` in `@minstrel/game-formats`. */
const OP_FLAG_AND_EVENT = 155
/**
 * Holds by whether someone goes along with the Hero: `86 : 0` alone, `86 : 1`
 * not. **Partly read** (US ARM9 `func_0205faf4`): the game looks through the
 * party for a member of a kind it marks (`func_02061bd8`) and asks whether they
 * are up, and failing one whether its object `0xce` is there. That the object
 * is whoever goes along — Ivor over 2.2 and 2.3 — is INFERRED: in every one of
 * the events after Angel Falls' seven `86 : 0` records (2222, 2230, 2240,
 * 2250, 2430, 2440, 2450) Ivor speaks.
 */
const OP_ALONE = 86

const wordsOf = triggerWords

/** Value 5 of a character's own record: the first thing the game asks for when they are talked to — see {@link pickLine}. */
const KIND_OWN = 0
/** Value 5 of a talk record: asked for once a line has been said — see {@link pickLine}. */
const KIND_TALK = 1

/** A talk file's own lines, by their record's tag — see {@link lineFor}. */
const TAG_LINE = 1
/** A line for a quest, by its state — see {@link lineFor}. */
const TAG_QUEST = 2

/**
 * How many times a character has been talked to, as the game counts it for
 * {@link lineFor}: two counts of up to 15 each, kept for every character, both
 * going up each time a line is said (US ARM9 `func_0206ec64`, from ov017
 * `func_ov017_021b8e8c`). A new sub-stage clears both (`func_020703c8`), and
 * so does `106 : c` for its character. Entering a map clears `map`; entering
 * one the game counts as another area clears `area` (ov017
 * `func_ov017_0219d250`, which compares three bytes of each map's record in a
 * table it keeps — which file that is, is not read; the engine takes the area
 * to be the map's archive, `M01`, and that is ours).
 */
export interface Talked {
  readonly area: number
  readonly map: number
}

/** Never talked to — the counts a new sub-stage leaves. */
export const NEVER_TALKED: Talked = { area: 0, map: 0 }

/** Where the story stands for choosing a line — see {@link lineFor}. */
export interface LineAt {
  /** The sub-stage: a line's first two numbers are a range of them. */
  readonly minor: number
  /** The step, which labels 64 to 79 of each group count — see {@link lineFor}. */
  readonly step: number
  readonly night: boolean
  readonly talked: Talked
  /**
   * Each quest's state as the game keeps it, by its number: two bits of state,
   * then two flags (`func_0206e120`, `func_0206e260`, `func_0206e2dc`). Not
   * given, {@link QUESTS_OPEN}.
   */
  readonly quest?: (id: number) => number
}

/**
 * **Every quest on offer — the default where no quest states are given.**
 * The quests are kept now (see `quests.ts`), and the engine and the story walk
 * give their states; this stands for a caller that does not, as every talk did
 * before them. Ours.
 */
export const QUESTS_OPEN = (_id: number): number => 1

/**
 * **Which of a character's lines is said for a label — read from the game's
 * code.** A talk file is a script (ov017 `func_ov017_021ba810` runs it with
 * the opcode table at `0x021d7c58`): each record's tag is its opcode, and
 * every record is visited in turn. A line that holds is kept, **so the last
 * that holds is said**.
 *
 * - **Tag 1** (`func_ov017_021b9d00`), a line: its first two numbers are a
 *   range of sub-stages, which it holds within (`GameState` `+0x5cb4`, the
 *   live minor). With four numbers the third is the time of day: not 0, it
 *   holds only by night — and at night, once such a line is in range, no
 *   three-number line after it holds. Its last number is its label.
 * - **Tag 2** (`func_ov017_021b9e30`), a quest's line: the quest's number, a
 *   test of its state — −1 untouched, 0 state 2, 2 state 3, 3 state 1 — and
 *   then as tag 1. A quest's line that holds silences every tag-1 line, and
 *   the first quest to have one silences the others' unless their states say
 *   otherwise. The quests are not built — see {@link LineAt.quest}.
 * - **Tags 3 and 4** hold only in a game played together, and **tags 5 and
 *   6**, as 1 and 2, only while the Hero is down (see `OP_HERO_DOWN` in
 *   `@minstrel/game-formats`) — neither read here, since the Hero is taken to
 *   be up and alone.
 *
 * A label holds by the one asked for (`func_ov017_021b9bcc`): the two are in
 * the same group of 80, and within it, by the label's place — 0 to 15 while
 * that many are within the character's `area` count, 16 to 31 their `map`
 * count, 32 to 63 only the label itself, and 64 to 79 while within the step,
 * the highest such. Asked 0, a character's 0 and 16 always hold — their plain
 * lines — and 17 once they have been talked to in this map.
 */
export function lineFor(
  lines: readonly TalkLine[],
  label: number,
  at: LineAt,
): TalkLine | undefined {
  const quest = at.quest ?? QUESTS_OPEN
  const state = (id: number) => (id >= 0 && id < QUEST_SLOTS ? quest(id) & 3 : 0)
  const group = Math.trunc(label / 80)
  let said: TalkLine | undefined
  let nightInRange = false
  let highestStep = 0
  let questSaid = -1
  const holdsFor = (line: TalkLine, rest: readonly number[]): boolean => {
    // The time of day, and then the label — see above.
    if (rest.length >= 2) {
      if (rest[0] !== 0) {
        if (!at.night) return false
        nightInRange = true
      }
    } else if (nightInRange) return false
    const own = rest[rest.length - 1] as number
    if (line.text === undefined || Math.trunc(own / 80) !== group) return false
    const place = own % 80
    const count = place % 16
    switch (Math.trunc(place / 16)) {
      case 0:
        return count <= at.talked.area
      case 1:
        return count <= at.talked.map
      case 4:
        if (count > at.step || count < highestStep) return false
        highestStep = count
        return true
      default:
        return own === label
    }
  }
  for (const line of lines) {
    const n = line.unknown_numbers.map((v) => v | 0)
    if (line.tag === TAG_LINE) {
      if (questSaid >= 0) continue
      const from = n[0] as number
      if (from >= 0 && (at.minor < from || at.minor > (n[1] as number))) continue
      if (holdsFor(line, n.slice(2))) said = line
    } else if (line.tag === TAG_QUEST) {
      const id = n[0] as number
      if (questSaid >= 0 && questSaid !== id) {
        const s = state(id)
        const moves = s === 1 || s === 2 || (state(questSaid) === 3 && s === 3 && questSaid <= id)
        if (!moves) continue
      }
      if (!questStateHolds(quest, id, n[1] as number)) continue
      if (holdsFor(line, n.slice(2))) {
        said = line
        questSaid = id
      }
    }
  }
  return said
}

/** How many quests the game keeps a state for (`func_0206e120`). */
const QUEST_SLOTS = 0xcc

/** A quest line's test of its quest's state — see {@link lineFor}. */
function questStateHolds(quest: (id: number) => number, id: number, test: number): boolean {
  const nibble = id >= 0 && id < QUEST_SLOTS ? quest(id) : 0
  switch (test) {
    case -1:
      return (nibble & 3) === 0
    case 0:
      return (nibble & 3) === 2
    case 1:
      return (nibble & 4) !== 0
    case 2:
      return (nibble & 3) === 3
    case 3:
      return (nibble & 3) === 1
    case 4:
      return (nibble & 8) !== 0 && (nibble & 3) === 0
    default:
      return true
  }
}

/** What a talk record does once a line is said, and the answer it waits for — see {@link Choice}. */
export interface After {
  readonly outcome: EventOutcome
  /** The prompt's answer its `16` waits for, from 0; undefined, any. */
  readonly answer: number | undefined
}

/** What a character says now: a line, an event that plays instead, or a record that runs and says nothing. */
export type Choice =
  | {
      readonly kind: 'line'
      readonly line: TalkLine
      readonly why: string
      /** The label the talk was asked with, which the talk records after it test. */
      readonly label: number
      /** What the character's own record that asked for it does as it runs — see {@link pickLine}. */
      readonly record?: EventOutcome
      /**
       * The talk records that may run once it is said, in the file's order: the
       * game runs the first that holds, and they are tested then, so the answer
       * a prompt in the line was given decides among them — see {@link afterFor}.
       */
      readonly after: readonly After[]
    }
  | {
      readonly kind: 'event'
      readonly event: number
      readonly why: string
      /**
       * What the record that chose it does as it runs, the event among it: the
       * game runs every action of the record it takes (US ARM9
       * `func_02064530`), so its flags and any move of the story come too.
       */
      readonly record: EventOutcome
    }
  | {
      readonly kind: 'record'
      readonly why: string
      /** What it does — where it has the Hero talk to someone else, `record.talk` says who. */
      readonly record: EventOutcome
    }

/**
 * The talk record that runs once a line is said, given the answer its prompt
 * was given — the first in the file whose `16` holds. A talk's window sets
 * the answer to 0 as it opens (see `OP_ANSWER_IS`), so with no prompt it is 0.
 */
export function afterFor(after: readonly After[], answer: number): EventOutcome | undefined {
  return after.find((a) => a.answer === undefined || a.answer === answer)?.outcome
}

export interface Asking {
  readonly triggers: readonly Trigger[]
  /** The map the Hero is in, by its own id. */
  readonly map: number | undefined
  readonly stage: Stage
  readonly night: boolean
  /** Who is being talked to, by their id in the area's cast. */
  readonly id: number
  /** Their talk file for the stage's chapter — see {@link letterForStage}. */
  readonly lines: readonly TalkLine[]
  /**
   * The label to talk with, where a record asked for one — see `OP_TALK_TO`.
   * Without one the character's own records are asked first.
   */
  readonly label?: number
  /**
   * The label of the talk box the Hero stands in round them, if one — see
   * `TalkBox` in `@minstrel/game-formats`. Their own records are asked with
   * it, and without one of theirs holding it is the label talked with.
   */
  readonly box?: number
  /** The story flags set — see `flagsHold`. None, when not given. */
  readonly flags?: ReadonlySet<number>
  /** The marks set, the second set of flags — see `OP_IF_MARK`. Not read when not given. */
  readonly marks?: ReadonlySet<number>
  /** Whether nobody goes along with the Hero — see {@link OP_ALONE}. Not read when not given. */
  readonly alone?: boolean
  /** How many are in the party, the Hero among them — see `OP_PARTY_AT_LEAST`. Not read when not given. */
  readonly party?: number
  /** The step within the stage — see `OP_AT_STEP`. Not read when not given. */
  readonly step?: number | undefined
  /** The game-wide flags set — see `OP_SET_GLOBAL`. Not read when not given. */
  readonly globals?: ReadonlySet<number>
  /** Those surely set, where `globals` holds those that may be — see `Conditions.globalsSure`. */
  readonly globalsSure?: ReadonlySet<number>
  /** How often they have been talked to — see {@link Talked}. Never, when not given. */
  readonly talked?: Talked
  /**
   * Each quest's nibble — see `quests.ts` — for their records' quest
   * conditions and their quest lines. {@link QUESTS_OPEN} when not given.
   */
  readonly quest?: (quest: number) => number
}

/**
 * **Which of a character's lines applies now, or what runs instead — as the
 * game decides it**, read from its code (ov017):
 *
 * 1. **Their own record first** (`func_ov017_021a4cf0`): the first record of
 *    value 5 = 0 over the map and stage whose conditions hold, tested with
 *    who is talked to (`6`) and the label of the talk box the Hero stands in
 *    round them, or 0 (`11`, and `41` for whether there is one — see
 *    {@link Asking.box}). It runs, every action: a `118` has the Hero talk to
 *    someone with a label, and a `119` plays an event. With none, the talk
 *    goes on with the box's label, or 0.
 * 2. **The line** for that label — see {@link lineFor}. With none, nothing is
 *    said, and nothing after.
 * 3. **Their talk records after it** (`func_ov017_021b8e8c`, once the window
 *    closes): the first record of value 5 = 1 whose conditions hold for who
 *    and the label asked, and for the prompt's answer (`16`) — which is why
 *    they are handed on as {@link Choice.after}. One may ask for another
 *    label with `118`, and the talk goes round again.
 *
 * `Asking.label` starts at 2, as a `118` does. The quests are as
 * {@link Asking.quest} has them, or {@link QUESTS_OPEN}; the Hero as up (`36`), ours.
 */
export function pickLine(asking: Asking): Choice | undefined {
  const { triggers, map, stage, night, id } = asking
  const flags = asking.flags ?? new Set<number>()
  const more: Conditions = {
    night,
    character: id,
    down: false,
    inBox: asking.box !== undefined,
    ...(asking.party !== undefined ? { party: asking.party } : {}),
    ...(asking.globals ? { globals: asking.globals } : {}),
    ...(asking.globalsSure ? { globalsSure: asking.globalsSure } : {}),
    ...(asking.quest ? { quest: asking.quest } : {}),
  }
  const applies = (candidate: Trigger) =>
    (map === undefined || candidate.map === map) &&
    stageOrder(candidate.from) <= stageOrder(stage) &&
    stageOrder(stage) <= stageOrder(candidate.to)
  const holdsWith = (candidate: Trigger, label: number) => {
    const conditions = conditionsOf(candidate)
    return (
      flagsHold(conditions, flags, asking.marks, asking.step, { ...more, label }) &&
      (asking.quest !== undefined || questsHold(candidate)) &&
      (asking.alone === undefined ||
        conditions.every((w) => w.op !== OP_ALONE || (w.arg === 0) === asking.alone))
    )
  }
  const where = (candidate: Trigger) => `the record at 0x${candidate.offset.toString(16)}`

  const first = asking.box ?? 0
  let label = asking.label ?? first
  let record: EventOutcome | undefined
  let why = asking.label === undefined ? `label ${first}, as none of their own records holds` : ''
  if (asking.label === undefined) {
    const own = triggers.find(
      (candidate) =>
        candidate.unknown_5 === KIND_OWN && applies(candidate) && holdsWith(candidate, first),
    )
    if (own) {
      record = outcomeOf(own)
      const talk = record.talk
      if (talk === undefined || talk.character !== id) {
        const event = record.event
        if (event !== undefined && talk === undefined)
          return { kind: 'event', event, why: `event ${event}, from ${where(own)}`, record }
        return {
          kind: 'record',
          why:
            talk === undefined
              ? `${where(own)} runs and says nothing`
              : `${where(own)} has the Hero talk to ${talk.character} with label ${talk.label}`,
          record,
        }
      }
      label = talk.label
      why = `label ${label}, from ${where(own)}`
    }
  } else why = `label ${label}, as asked`

  const line = lineFor(asking.lines, label, {
    minor: stage.minor,
    step: asking.step ?? 0,
    night,
    talked: asking.talked ?? NEVER_TALKED,
    ...(asking.quest ? { quest: asking.quest } : {}),
  })
  if (!line) {
    return record
      ? {
          kind: 'record',
          why: `${why}; no line of theirs holds for it, so nothing is said`,
          record,
        }
      : undefined
  }
  const after: After[] = []
  for (const candidate of triggers) {
    if (candidate.unknown_5 !== KIND_TALK || !applies(candidate)) continue
    // Tested with the answer left open: it decides among them once given.
    if (!holdsWith(candidate, label)) continue
    const answer = conditionsOf(candidate).find((w) => w.op === OP_ANSWER_IS)?.arg
    after.push({ outcome: outcomeOf(candidate), answer })
    if (answer === undefined) break
  }
  return { kind: 'line', line, why, label, ...(record ? { record } : {}), after }
}

/**
 * The composites' test of a quest (US ARM9 `func_0206474c`): by its mode, −1
 * holds for a quest at 0, 0 at 2, 1 while its first flag is set, 2 at 3, 3 at
 * 1, 4 never and 5 at 0 — here with every quest as {@link QUESTS_OPEN} has
 * it. 53 to 61 carry it in their first value, the quest in its high half and
 * the mode in its low — see `conditionsOf` in `@minstrel/game-formats`.
 */
function questsHold(candidate: Trigger, quest: (id: number) => number = QUESTS_OPEN): boolean {
  for (const entry of entriesOf(candidate)) {
    if (entry.op < 53 || entry.op > 61) continue
    const value = entry.params[0] ?? 0
    const id = (value >>> 16) & 0xffff
    const mode = ((value & 0xffff) << 16) >> 16
    const nibble = id < QUEST_SLOTS ? quest(id) : 0
    const state = nibble & 3
    const holds =
      mode === -1 || mode === 5
        ? state === 0
        : mode === 0
          ? state === 2
          : mode === 1
            ? (nibble & 4) !== 0
            : mode === 2
              ? state === 3
              : mode === 3
                ? state === 1
                : false
    if (!holds) return false
  }
  return true
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
      if ((word.op === OP_EVENT || word.op === OP_FLAG_AND_EVENT) && word.arg > 0)
        events.add(word.arg)
    }
  }
  return [...events].sort((a, b) => a - b)
}
