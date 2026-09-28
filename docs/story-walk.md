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

- **From a new game:** 1.1 to 1.2 step 2. It stops before 1.3.
- **From 1.3 one walk plays the prologue's end, the whole slice and chapter 3
  as far as Loch Storn** (3.2), and another plays Zere and its dungeon to
  3.7. The throne room's area 0 plays `ev3040`; the king, `45`, stands where
  his block puts him, so talking to him plays `ev3050`. That is the
  first time the story has been followed past the slice's end. The same was
  checked in the game in a browser: talking to #203 in Stornway's lobby at
  2.7 plays `ev2940`, and once it is read the story is at 3.1.
- **From 5.2, one walk plays into all five threads**: chapters 6, 7, 8, 11
  and 12, each to its own first break.
- **62 breaks** between 1.1 and 19.7. There were 109 before the threads were
  read, 101 with them, 87 once records ran as the game runs them, 83 with the
  maps' own areas, and 62 once who stands where was the game's own choice.
  The first after the slice is Loch Storn's set battle, before 3.2 step 3.

A break usually has more than one cause, one for each record that could have
moved the story on. So the counts below add up to more than 62.

## The list, by cause

In the order I would take them. Structural causes come first, then those
that unblock the most.

| # | cause | breaks | first before | kind of work |
|---|---|---|---|---|
| 1 | ~~**A stage set on a record that is not an event's own**~~ | — | — | **done, 28 September**: records run as the game runs them |
| 2 | **A character a record talks to that the cast does not stand there** | 8 | 4.1 step 3 | **mostly done, 28 September**: the game's placement script, tags 3, 5 and 17. The rest are placed by tag 14 or by scenes |
| 3 | ~~**`214`, a story's stage set by its number**~~ | — | — | **done, 28 September**: read from the game's code and built |
| 4 | Chained from an event the walk never played | 11 | 4.5 | none directly: a cascade |
| 5 | A set battle whose starting event the walk never played | 10 | 3.2 step 3 | reading: what starts a set battle from a scene. Loch Storn's first fight, after `ev23189`, is the first |
| 6 | Nothing reaches the event | 6 | 14.4 step 4 | reading: `S07`, and VM opcode `0x1e` |
| 7 | A flag, mark or step the walk never had | 5 | 1.3 | as 4, mostly |
| 8 | ~~An area no record defines~~ | — | — | **done, 28 September**: a map's own areas, and areas turned |
| 9 | **Another of the character's records chooses first** | 12 | 4.3 step 3 | reading: `pickLine`'s precedence, INFERRED — the game asks for kinds 0 and 1 separately (`func_ov017_021a4cf0`, `func_ov017_021b8e8c`) |
| 10 | The event plays, but its own record is in another area's file | 2 | 5.1 | engine |
| 11 | A closing step of 0 on a cast record | — | — | gone with the game's placement rule |
| 12 | A record kind the engine does not read | 3 | 4.3 step 5 | reading: kind 20's actions besides areas |
| 13 | An entry record that plays no event | 2 | 10.7 | reading: what runs kind 3 besides its `108` at load. Batsureg's areas 72 and 73 are one's |

Five more breaks name a record whose span the walk was never at, and one
the walk cannot explain. Both kinds are listed in the test's printout.

### 1. Records run as the game runs them: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "How a record runs", with the
functions logged in `docs/decomp-contributions.md`.

- **The game takes a record the same way for every kind**: the first of that
  kind, in file order, whose conditions hold. It then runs **every one of its
  actions** (`func_02064490`, `func_020649b0`). So a `132` on a talk, entry
  or battle record moves the story when that record runs.
- **The parser** splits a record into conditions (operations below 100, or
  from 500) and actions (100 to 499). Each operation takes a fixed number of
  the words after it as its own. `conditionsOf` now reads conditions that
  way, and **the `0 : n` words after `132` are no longer mistaken for
  conditions**.
- **Conditions now read**:
  - `0`/`1`, game-wide flags;
  - `17`, day or night;
  - `23`, who is playing (as one playing alone: `23:2` holds and `23:3` does
    not, across 1,541 records);
  - **the composites `52` to `61`**, which name their character inside
    themselves. That is 1,409 records `pickLine` could not see before. 52 is
    the key one here: Stornway's lobby, talking to 203.
- **Actions now applied**:
  - `100`/`101`, game-wide flags;
  - `103` and `105`, clearing a mark and a flag;
  - `148`, every thread's stage;
  - `138` and `226`, hand-ons like `133`. `ev2910`'s `138` is how Angel
    Falls hands on to Stornway.
- **Kind 6 runs every frame in the field**: `maybeWatch` in `main.ts`,
  `watchPlay` in `story.ts`.
- **Moves follow the game's order.** Flags, marks and game-wide flags change
  as each action runs. Stage moves are queued and applied after, and **only
  forward**. A flag its own record sets on the way into a new sub-stage is
  lost, as it is in the game.
- **An event's own record** is the first whose conditions hold, not merely
  the first. That settles the Observatory's two at 15.3.
- **A label's talk record** that only moves the story, with no event and no
  hand-on, now runs once its line is read (`labelRecord` in `talk.ts`).

### 2. Who stands where: mostly done, 28 September 2026

**Read from the game's code**: FORMAT.md, "Who stands where, read from the
game's code", with the functions logged in `docs/decomp-contributions.md`.

The cast file's `place.bin` is **a script the game runs in order**, each
record placing a character or taking them away. Three things the engine had
wrong:

- **A record for another map takes a character away from this one.** The
  engine only read this map's records, so it had to guess that "records,
  none covering" meant "not here". The game leaves such a character at their
  block's place. That is why the king, `45`, stands in the throne room at 3.1.
- **Word 6 of a span is the time of day**: 0 by day, 1 by night, 2 either.
  Erinn is upstairs at 2.6 only by night, and Angel Falls' `15` is in the
  stable by day and the village by night. The walk now tries by day and by
  night, since the day passes in the field (ours).
- **The byte-pattern reader missed 89 blocks and 40 spans.** `place.bin` is
  now read as the table it is.

Also read: **tag 17 places a character while game-wide flags hold**, before
anything else. Its flags are the same bank the scripts' `603` reads.

**Left**: 8 breaks. Coffinwell's `26` is placed only by scenes (tags 18 and
19 name its model). Others may be placed by tag 14, by the four states of an
id, which is not read.

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
was never played, and a flag set only by something never played mostly wait
on cause 2. Several set battles are started from scenes by the script
function `547`, which the engine reads and does not yet act on.

### 6. Nothing reaches the event

Seven events on Gortress (`S07`), over six breaks at 14.4 and 14.6
(`ev28991`, `ev14620`, `ev14621`, `ev14640`, `ev14641`, `ev14903`,
`ev14770`). Eight scripts will not run at all (`ev29300`–`ev29350`, VM
opcode `0x1e`). They are the likeliest thing that chains into Gortress's
events. **`ev29300` is also what winning the last set battle plays**, before
`148` sets every thread to 19.2, so it is probably the ending and its
credits. (`ev12101` was here too until `226` was read as a hand-on.)

### 8. Areas: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "Areas", with the functions logged
in `docs/decomp-contributions.md`.

- **A map has areas of its own**, in its link table (`.bmbl`): `0x73`
  regions of type 3, numbered by the `0x74` after each. There are 22 in 15
  maps. Stornway's throne room's areas 0 and 1 are two of them, and walking
  into area 0 at 3.1 now plays `ev3040`.
- **A trigger's `143` is turned** by the degrees after its box. 31 of 113
  are, and they were being tested as if square to the map. The game refuses
  a turned box early by a squared radius made from its width and height,
  and so does `inArea` now.
- **The field keeps one area for each source**, the first that holds the
  Hero, and runs the records for a new one. `maybeAreaEvent` does the same.
- **`143` adds its area when its record runs**, whatever the kind: 80 are on
  settings records, 7 on others. The engine keeps those for the visit to the
  map (`areasAdded`), and takes the first settings record that holds, as the
  game does. Batsureg's areas 72 and 73 are on an entry record with no
  event, which is cause 13.

### 9. Another of the character's records chooses first

`pickLine` lets a character's own records choose before a talk record, and
takes the first that holds. That is INFERRED from 116 talk records. At
Alltrades Abbey at 6.6 it picks label 192 for `17` over the record that
plays `ev6600`, which moves the story to 7.1. There are four such cases, at
6.6, 9.4, 12.2 and 14.6.

### 10. The event plays, but its own record is in another area's file

Talking to `106` on the Starflight Express at 4.7 plays `ev24598`, which
chains `ev24500` → `ev25500` → `ev5110`. The record for `ev5110` is in the
Observatory's file (`X05`), so the move to 5.1 is lost. The game only ever
holds the current map's records, so the scene must take the Hero there
before it ends. Where scenes change map is `event.ts`'s to read.

(The other half of this cause, an event's own records chosen by flags, is
done: the first whose conditions hold is taken, as in the game.)

### 11. A closing step of 0

80 cast records end at "step 0" of their last stage, and two of them sit on
the story. One is Coffinwell's `29`, from 4.1 step 1 to 4.2 step 0, and a
record talks to them at 4.2. Read
as "at or before step 0" they are not there. There is one such case among
the 431 talk records over a single stage, which is too thin to change the
reading.

### 12. A kind the engine does not read

Kind 20, the settings that define a map's areas, also carries stage moves,
at 4.3 in Quarantomb and at 13.5 in `S13`. The game takes kind 20 at load
for its areas, and kinds 3 and 20 at map load for their action `108` only
(`func_02017a94`). What runs the rest of them is not read.

## Not measured yet

- **Geography**: whether the Hero can get from where one event leaves them to
  where the next is. This is the walk's second pass, once the list above is
  short.
- **The credits.** Winning set battle 25 at 17.2 plays `ev29300` and moves
  every thread to 19.2 (`148`). `ev29300` needs VM opcode `0x1e`, which is
  not read, and `838` is the staff roll's stopwatch.
- **The prologue's start**: which event a new game plays at 1.1, before the
  Observatory. This goes with character creation's eight screens, which
  already run.

## Not established, raised by this

- Operation `23` is read as a multiplayer session test. That it is
  multiplayer is INFERRED, from the flag actions using the same test to
  decide whether to send a change over the link.
- What `func_0206474c` tests for the composites `53` to `61`: one of four
  states of an id, through `func_0206e120`. Quest progress, perhaps. The
  composite is kept beside what it expands to, and that part is left to
  hold.
- Which kind each of the other lookups asks for: 9, 10, 12, 17 to 19 and 22
  to 30 are asked for from overlays 1 to 4 and 17, not yet read.
- What applies the queue of stage moves that `132` and `214` add to, and when.
- Whether the game applies each chained script's record or only the last's.
  The engine follows the last, as the scene's own event id is overwritten on
  each chain.
