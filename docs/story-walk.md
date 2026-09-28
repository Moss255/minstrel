# The story, walked: what stands between a new game and the credits

Phase 3's worklist. Written 28 September 2026 against `69f57d0`.

Phase 3 is done when **the story plays from a new game to the credits in one
save, with no URL parameters** (`docs/beyond-the-slice.md`, "Phase 3"). The
sweep showed every area loads, walks, talks and plays its scenes, but every
one of them was opened with a stage given. None was reached by playing. This
file is what it takes to reach them.

## How it is measured

`apps/game/test/story-walk.test.ts` follows the story over the whole
cartridge. It uses the engine's own rules and the engine's own functions:

- entering a map (`entryPlay`);
- walking into one of its areas (`areaEvent`);
- talking to whoever the cast stands there (`storyView`, which makes
  `castAt`'s choice, then `pickLine`);
- each event's script run to see what it chains into (`538`);
- then what follows the event: its own record (`eventOutcome`, applied by
  `moveStory`, the same function `followEvent` uses), a set battle won
  (`afterBattle`), or a hand-on to another map.

It visits every state the story can reach. A state is each of the story's
five threads (stage, step, flags and marks) plus who goes along. A move reads
and writes the thread of the map it is made in, as the game's does (see
section 3). Talk that only sets marks is folded into one state, "everyone
talked to", so that every order of talking to a town is not a state of its
own. It runs in about five seconds.

```sh
MINSTREL_TEST_ROM=$PWD/rom/dq9-europe.nds npx vitest run apps/game/test/story-walk.test.ts
```

Where no move carries the story on, that is a **break**. The walk starts
again from the earliest stage some record sets that no walk has reached yet,
as the witness does with `--stage=`, so one break does not hide the rest. For each break it prints the
records that would have moved the story on, and why the walk could play none
of them. **That printout is the full list, in story order.** This file groups
it by cause.

**What it does not check:**

- **Where the Hero can get to.** Every map is taken to be in reach. The world
  map, ships, sealed doors and the Starflight Express are not modelled.
- **Time of day.** The walk plays by day throughout.
- **Events the game's code starts on its own.** If there are any, they show
  up here as events that nothing reaches.
- **Whether a character can be built.** Presence is `castAt`'s choice before
  anyone is built.
- **What a new game plays first**, which has not been read. The walk opens at
  1.1 with no step, as `?stage=` does.

## Where it stands, 28 September 2026

- **From a new game:** 1.1, then 1.2 steps 1 and 2. It stops before 1.3.
- **The slice plays through in one walk**, 1.4 to 2.7, and every step the
  records set. This is the test's check that the walk is sound. The slice is
  known to play, and the walk agrees.
- **From 5.2, one walk now plays into all five threads**: chapters 6, 7, 8,
  11 and 12, each to its own first break. Before the threads were read, the
  walk stopped at 5.2.
- **101 breaks** between 1.1 and 19.7, against 109 counted the same way
  without the threads. The first break after the slice is the first thing a
  player meets on leaving Angel Falls: arriving at Stornway's lobby, which
  starts chapter 3.

A break usually has more than one cause, one for each record that could have
moved the story on. So the counts below add up to more than 101.

## The list, by cause

In the order I would take them. Structural causes come first, then those
that unblock the most.

| # | cause | breaks | first before | kind of work |
|---|---|---|---|---|
| 1 | **A stage set on a record that is not an event's own** | 21 | 1.3; after the slice, 3.1 | engine, plus reading kinds 6 and 20 in the game's code |
| 2 | **A character a record talks to that the cast does not stand there** | 21 | 1.3 step 2 | reading: how the game places story characters |
| 3 | ~~**`214`, a story's stage set by its number**~~ | — | — | **done, 28 September**: read from the game's code and built |
| 4 | Chained from an event the walk never played | 17 | 4.5 | none directly: a cascade, run again after 1 and 2 |
| 5 | A set battle whose starting event the walk never played | 7 | 3.3 | as 4 |
| 6 | Nothing reaches the event | 7 | 12.1 step 2 | reading: `S07`, op `226`, and VM opcode `0x1e` |
| 7 | A flag the walk never had | 5 | 1.1 step 2 | as 4, mostly |
| 8 | An area no record defines | 5 | 3.1 step 3 | reading: where areas 0, 1, 72 and 73 come from |
| 9 | Another of the character's records chooses first | 6 | 4.3 step 3 | reading: `pickLine`'s precedence, INFERRED |
| 10 | The event plays, but the wrong one of its own records is taken | 3 | 5.1 | engine |
| 11 | A closing step of 0 on a cast record | 2 | 4.3 | reading |
| 12 | A record kind the engine does not read | 2 | 13.5 step 2 | reading |

Five more breaks name a record whose span the walk was never at, and three
the walk cannot explain. Both kinds are listed in the test's printout.

### 1. A stage set on a record that is not an event's own

`followEvent` moves the story only by an event's own record (kind 11). But
**40 records of other kinds carry the same stage word, `132`**, and the engine
ignores them:

| kind | what it is | records with `132` | example |
|---|---|---|---|
| 1 | talk: a character, a label, what talking does | 19 | Alltrades Abbey at 6.1: `6:7 11:192 104:1 197:43 132:0 0:6 0:2 0:1` |
| 16 | a set battle lost | 6 | Tower of Trades at 6.4: `12:4 132:0 0:6 0:5 0:1 197:46` |
| 6 | not established; opens with `9 : map`, as an entry record does | 6 | Stornway's lobby at 2.7: `9:50101 23:2 4:3 132:0 0:3 0:1 0:1` |
| 15 | a set battle won | 4 | the Realm of the Mighty at 17.1: `12:20 132:0 0:17 0:1 0:2` |
| 3 | entering a map | 3 | Batsureg at 10.1: `9:2000 23:2 4:0 132:0 0:10 0:2 0:1 119:28791 197:70` |
| 20 | map settings, but this one opens with `9 : map` | 1 | Quarantomb at 4.3 |
| 0 | a character's own record, choosing a label | 1 | Coffinwell at 4.1: `6:25 5:0 23:2 118:25 192:0 104:0 197:28 132:0 0:4 0:1 0:2` |

Kinds 0, 1, 3, 15 and 16 are already read, and the engine plays them. What
is missing is applying their `132` and `104` as `moveStory` applies an
event's. Kind 6 has to be read first: 34 records on the cartridge, 33 of them
opening with `9` and their own map. The Tower of Trades
shows the lost-battle case matters: at 6.4 the story moves on whether the
battle is won or lost.

### 2. A character a record talks to that the cast does not stand there

A trigger names a character, and the area's `.npc` places nobody with that id
in that map at that stage. There are three shapes:

- **Story characters with no place at all at that stage.** Stornway's
  throne room at 3.1 talks to `45`. `45` is `s004`, a cast entry of kind 2,
  and has one record, at 19.6, which says nowhere. The kind-2 `s0xx` entries
  look like the story's own actors. They are probably placed by scenes, which
  `castLeft` would follow in play but a headless walk does not.
- **A gap across stages.** Angel Falls' `94` has records to 1.2 step 2 and
  from 1.3 step 2, and a record talks to them at 1.3. The gap rule in
  `castOf` fills only a gap inside one sub-stage, and FORMAT.md records why a
  wider one breaks Ivor.
- **Placed in another map of the area.** Zere's `10` stands in `M02M04` over
  2.7 to 18.1, while the record talks to them in `M02M01` at 3.5.

What decides it is how the game places a kind-2 character. The decomp or the
emulator should say.

### 3. `214`, and the story's five threads: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "Triggers, read from the game's
code", with the functions logged in `docs/decomp-contributions.md`.

The game keeps **five story threads**, each with its own stage, step, flags
and marks. **The map the Hero is in decides which thread is live**
(`func_02064b98`):

- thread 1: Alltrades Abbey and the Tower of Trades;
- thread 2: Zere Rocks, Dourbridge, the Lonely Plains and the Heights of
  Loneliness;
- thread 3: Gleeba and the Plumbed Depths;
- thread 4: Swinedimples Academy;
- thread 0: everywhere else.

A trigger's span is checked against the live thread's stage. `132` moves the
live thread, and `214 : n` moves thread n. `ev25524` at 5.2 starts all five,
at 7.1, 6.1, 8.1, 11.1 and 12.1, so those chapters can be played in any
order.

**Built**: `THREADS`, `threadOf` and `swapThread` in `apps/game/src/story.ts`.
`enter` in `main.ts` swaps threads as the game does, `followEvent` applies
`214`, and the save keeps all five threads (optional fields, so older saves
still read).

The same reading corrected something already built. **Marks last the major
stage**: a new minor clears the flags but not the marks. `moveStory` had
cleared both on any move, and had marked that as ours.

### 4, 5 and 7. Cascades

An event chained from another that was never played, a battle whose starter
was never played, and a flag set only by something never played all wait on
causes 1 to 3. Run the walk again once those land.

### 6. Nothing reaches the event

Seven events on Gortress (`S07`), over six breaks at 14.4 and 14.6
(`ev28991`, `ev14620`, `ev14621`, `ev14640`, `ev14641`, `ev14903`,
`ev14770`), and `ev12101` at 12.1. `ev12101` is reached by `ev12100`'s `226:2103 12101:0`, a hand-on shaped
like `133` that is not read. Eight scripts will not run at all
(`ev29300`–`ev29350`, VM opcode `0x1e`). They are the likeliest thing that
chains into Gortress's events.

### 8. An area no record defines

Area events name areas 0 and 1 in Stornway's throne room, Zere and
Brigadoom's northern tower (`D03M06`), and 72 and 73 in Batsureg, where no settings record in
the map defines them. 102 of the 110 area records name an area their map
defines (FORMAT.md). These are the rest, and they fall exactly on the story.

### 9. Another of the character's records chooses first

`pickLine` lets a character's own records choose before a talk record, and
takes the first that holds. That is INFERRED from 116 talk records. At
Alltrades Abbey at 6.6 it picks label 192 for `17` over the record that
plays `ev6600`, which moves the story to 7.1. There are four such cases, at
6.6, 9.4, 12.2 and 14.6.

### 10. The event plays, but the wrong one of its own records is taken

`eventOutcome` takes the event's record in the loaded map, or else the first
anywhere in the loaded area's file. It does not test the record's
conditions, and it does not look in other files. Both matter:

- **In another area's file.** Talking to `106` on the Starflight Express at
  4.7 plays `ev24598`, which chains `ev24500` → `ev25500` → `ev5110`. The
  record for `ev5110` is in the Observatory's file (`X05`), so the move to
  5.1 is lost. The same happens in the game today.
- **Chosen by flags.** At 15.3 in the Observatory, `ev15410` and `ev15420`
  each have two records of their own, `5:1 5:0` and `5:1 4:0`. Whichever of
  the two is talked to second takes the story to step 4. The first record is
  always taken, so step 4 is never reached. The 1,541 records carrying `23`
  come in pairs of the same shape, so this is probably wider than two
  breaks.

### 11. A closing step of 0

80 cast records end at "step 0" of their last stage, and two of them sit on
the story. One is Coffinwell's `29`, from 4.1 step 1 to 4.2 step 0, and a
record talks to them at 4.2. Read
as "at or before step 0" they are not there. There is one such case among
the 431 talk records over a single stage, which is too thin to change the
reading.

### 12. A kind the engine does not read

Kind 20 at 13.5, in `S13`.

## Not measured yet

- **Geography**: whether the Hero can get from where one event leaves them to
  where the next is. This is the walk's second pass, once the list above is
  short.
- **The credits.** No record sets anything between 17.2 and 19.x, and what
  rolls the staff roll is not read (`838` is its stopwatch).
- **The prologue's start**: which event a new game plays at 1.1, before the
  Observatory. This goes with character creation's eight screens, which
  already run.

## Not established, raised by this

- What operation `23` is: `23:2` and `23:3` twin records, **1,541** of them.
  It is the most common operation nothing reads.
- What kind 6 is, beyond opening with `9 : map`. The game's action
  interpreter is read (`func_02061c04`). What decides *when* each kind of
  record runs is not, and that is where kinds 6 and 20 will be answered.
- What applies the queue of stage moves that `132` and `214` add to, and when.
- Whether the game applies each chained script's record or only the last's.
  The engine follows the last, as the scene's own event id is overwritten on
  each chain.
