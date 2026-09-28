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
- talking to whoever the cast stands there, and from each of their talk
  boxes (`storyView`, which makes `castAt`'s choice, then `pickLine`), taking
  every answer a prompt could be given;
- each event's script run to see what it chains into (`538`);
- then what follows the event: its own record (`eventOutcome`, applied by
  `moveStory`, the same function `followEvent` uses), a set battle won
  (`afterBattle`), or a hand-on to another map.

It visits every state the story can reach. A state is each of the story's
five threads (stage, step, flags and marks) plus who goes along. A move reads
and writes the thread of the map it is made in, as the game's does (see
section 3), so **the threads are walked apart**: a new state is kept only if
one of its threads stands somewhere no state has had it, and otherwise its
game-wide flags are merged into the first state found there. Talk that only
sets marks or flags is folded into one state, "everyone talked to", so that
every order of talking to a town is not a state of its own. Scripts are also
run to see where they hand the Hero on (`807`). It runs in about 35 seconds.

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
- **Time of day** only as far as trying each map by day and by night.
- **Events the game's code starts on its own**, beyond the two the story
  needs (cause 15): `ev28800` when the five threads are done, and the Express
  ride's `ev29150` at 15.3 step 5, which is INFERRED. Any other shows up here
  as an event that nothing reaches.
- **Whether a character can be built.** Presence is `castAt`'s choice before
  anyone is built.
- **What a new game plays first**, which has not been read. The walk opens at
  1.1 with no step, as `?stage=` does.

## Where it stands, 28 September 2026

- **From a new game to the credits, in one walk**: walk 1 plays from 1.1
  through the prologue, the slice, chapters 3 to 5, all five threads, the
  Starflight Express's ride to the Observatory (`ev28800`, 10.8 step 1), 13
  to 15, Gittingham at 16, and the tower at 17 to 19.2, where the last set
  battle's `ev29300` sets every thread. It takes about 90 seconds.
- **6 breaks** between 1.1 and 19.7. **Five are after the credits**: the
  Quester's Rest's records at 19.3 to 19.7 test quests 174 to 193, the quest
  system's own work and past Phase 3's line. **One is 16.1 step 2**, which
  only losing set battle 17 sets — the story does not need it. (As read, the
  scene's start that opens 16.1 leaves the step at 15.3's 5, so 16.1 steps 2
  to 4 cannot be set at all on that way in; since the way in is the one
  INFERRED piece, `ev29150`, that wants checking in the game.)
- There were 109 breaks before the threads were read, 101 with them, 87 once
  records ran as the game runs them, 83 with the maps' own areas, 62 once who
  stands where was the game's own choice, 53 once talking was — and 372 files
  stopped reading as empty, see "Found on the way" — 47 with `155`, 31 with
  `807`, `place.bin`'s tag 4 and a fix to the walk itself (below), 26 once a
  scene's record was taken in the scene's own map, 24 with `220`, 20 with the
  doorway records, 13 with entry and settings records run whole, and **6**
  with party tricks, `602`, the scene's start raising the story, and the
  Starflight Express.

A break usually has more than one cause, one for each record that could have
moved the story on. So the counts below add up to more than the breaks.

**A fix to the walk, not the engine**: talk that only set game-wide flags
was folded into "everyone talked to" without them. So the king's `ev23198`
at 3.7 never set 147, which Stornway's entry at 4.1 wants, and the break
before 4.1 was the walk's own.

## The list, by cause

In the order I would take them. Structural causes come first, then those
that unblock the most.

| # | cause | breaks | first before | kind of work |
|---|---|---|---|---|
| 1 | ~~**A stage set on a record that is not an event's own**~~ | — | — | **done, 28 September**: records run as the game runs them |
| 2 | ~~**A character a record talks to that the cast does not stand there**~~ | — | — | **done, 28 September**: the game's placement script, tags 3, 4, 5 and 17. Drak at 11.2 stands while game-wide flag 322 is set, which a Clap in area 10 sets (kind 19, cause 14) |
| 3 | ~~**`214`, a story's stage set by its number**~~ | — | — | **done, 28 September**: read from the game's code and built |
| 4 | Chained from an event the walk never played | 4 | 7.4 | none directly: a cascade |
| 5 | A set battle whose starting event the walk never played | 4 | 14.4 step 3 | **Loch Storn done, 28 September**: its scene hands on with `807`. Left: Gortress's set battle 14, and the tower's 20 to 22 at 17.1, which nothing starts |
| 6 | Nothing reaches the event | — | — | **done, 28 September**: `155`; `ev14903` is chained into by `ev14640` when the thread's flags 11 to 14 are set, which `602` reads (cause 15). Left over: `ev29300`'s opcode `0x1e`, the credits |
| 7 | A flag, mark or step the walk never had | 2 | 1.3 | as 4, mostly. **The Quarantomb's done, 28 September**: `220`, its two switches, sets the flags 901 and 902 its records test with `88` |
| 8 | ~~An area no record defines~~ | — | — | **done, 28 September**: a map's own areas, and areas turned |
| 9 | ~~**Another of the character's records chooses first**~~ | 6 | 11.3 | **done, 28 September**: talking is the game's own rule. What is left is a flag (11.3) and the quests (19.3 to 19.7) |
| 10 | ~~The event plays, but its own record is in another area's file~~ | — | — | **done, 28 September**: a scene plays in its own map, from the game's event lists |
| 11 | A closing step of 0 on a cast record | — | — | gone with the game's placement rule |
| 12 | ~~A record kind the engine does not read~~ | — | — | **done, 28 September**: kind 17, the doorways; kind 20 run whole at load; kind 19, a party trick |
| 13 | ~~An entry record that plays no event~~ | — | — | **done, 28 September**: the field asks kind 3 whole on arriving, so an entry record's `143` areas are real — Batsureg's 72 and 73 |
| 14 | **A party trick** | — | — | **done, 28 September**: kind 19, read from the game's code — the walk performs any trick the Hero knows; the engine's B Button and +Control Pad |
| 15 | **A scene the game's code starts** | — | — | **done, 28 September**, as far as the story goes: `ev28800` at 10.8 step 1 with the five threads' flags, and the Express's `ev29150` at 15.3 step 5 (INFERRED), whose start raises the story to 16.1. The Starflight Express itself is not built |
| 16 | **The quests after the credits** | 5 | 19.3 | the Quester's Rest's records at 19.3 to 19.7 test quests 174 to 193 — the quest system's own work, after the credits, and past Phase 3's line |

Two more breaks name a record whose span the walk was never at, and one the
walk cannot explain. Both kinds are listed in the test's printout.

## Found on the way — 372 files read as empty, 28 September 2026

The king's talk file for chapter C, `C01C0.gp2/045_en.bin`, read as empty, so
talking to him at 3.1 could not have gone on to `ev3050`. It is not empty:
**its first word is 16**, the table header's own size, and the cartridge
walk tried every file as an LZ10 stream first — whose header is `0x10` and a
24-bit size, here 0. A stream of 0 bytes decodes to nothing whatever follows,
so the check that it decoded to its declared size passed. `tryDecompressLz10`
(`@minstrel/nitro-comp`) now declines a declared size of 0.

**372 files** begin that way, in every language: 225 talk files (41 English),
54 map `.bmdj` and 25 `.bmbl` link tables — the Hexagon's `D01M0000` among
them — 25 event files (`ev03050`'s messages, so "message 100 says nothing" is
answered), 10 event scripts (Loch Storn's `ev23193`, `ev29410`), four
mini-map layouts (`F07`, `H07`, `M05`, `M12`, which now have one) and two
treasure files, `M09M05` and `D13M02` — the two 13-wide gaps in the treasure
numbering, which now runs 0 to 847 without one.

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
  hand-on, now runs once its line is read — since cause 9, as every talk
  record does (`Choice.after` in `talk.ts`).

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

**Tag 4, read later the same day** (`func_0206c0f8`): a placement at one
point of the story — stage, sub-stage and step all now's — then as a span's.
Coffinwell's `26` is placed only so. With tag 4 read, 14 breaks went: two
at 4.1, the Quarantomb's at 4.3 to 4.5, and others at 6.5, 6.6, 7.3, 10.3,
10.4, 10.6, 10.8 and 15.1.

**Left**: 1 break, `200` in Gleeba at 11.2. Others may be placed by tag 14, by
a quest's state, which is not read.

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
on another cause.

**Loch Storn's first fight, 28 September 2026.** Entering the lake at 3.2
plays `ev23189`, which has no record of its own; the fight is started by
`ev23190`'s record (`104:0 120:0`), and losing it is what moves the story to
3.2 step 3. Nothing the walk read reached `ev23190`. **The scene ends with
`807(5200, 0, 0, 0, 0, 23190)`**, a script function read from overlay 1: a
map, a place, a facing and an event, filling the same map-change request the
queue's `133` does — see `docs/event-scripts.md` §5m. The engine now goes
there once a scene is over, and the walk follows it. `547`, which scenes
also call before a fight, turned out to be only the battle's transition —
its swirl and music — the fight itself still coming from a record's `120`.

**The Quarantomb's switches, 28 September 2026.** Its records at 4.3 test
two game-wide flags, 901 and 902, with `88` and `89`, and nothing the walk
read set them. **`220` does**: an action whose value is two bytes — which
switch, and whether it is on — that, in the Quarantomb's map 7402 only,
turns the map's walls and sets flag 830 + 71 or 830 + 72 (FORMAT.md, "How a
record runs"). Talking to `107` and `108`, in either order, sets both and
plays `ev24590`, which moves the story to 4.3 step 3 and clears them. Read
into `outcomeOf` and `moveStory`; the walls are not modelled.

### 6. Nothing reaches the event: mostly done, 28 September 2026

Seven events on Gortress (`S07`), over six breaks at 14.4 and 14.6, were
reached by nothing the walk read. **`155` reaches them**: `155 : e` with a
value `f : 0` sets flag f and plays e, the queue starting it as it starts a
`119`'s (FORMAT.md, "How a record runs"). All 14 of its records are
Gortress's, on its characters at 14.4 — `52:203 7:2 155:28991 7:0`.

**Left**: `ev14903` at 14.4 step 8. And eight scripts will not run at all
(`ev29300`–`ev29350`, VM opcode `0x1e`). **`ev29300` is also what winning the
last set battle plays**, before `148` sets every thread to 19.2, so it is
probably the ending and its credits. (`ev12101` was here too until `226` was
read as a hand-on.)

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

### 9. Talking, as the game talks: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "How a talk runs" and "A talk file
is a script", with the functions logged in `docs/decomp-contributions.md`.
`pickLine`'s precedence had been INFERRED from 116 talk records. The game's:

- **Whom**: whoever is near and most nearly faced, or whoever's **talk box**
  the Hero stands in — tag 6 of the cast's `place.bin`, a box and a label.
  A thing to examine is talked to only from its box. The label the talk asks
  with is the box's, or 0.
- **Their own records first** (kind 0): the first that holds, tested with who
  and the label, runs — a `118` has the Hero talk with another label, a `119`
  plays an event.
- **The line**: the talk file runs as a script, and the last line that holds
  for the label is said. Labels hold by groups of 80 — 0 and 16 are a
  character's plain lines, 17 on need them to have been talked to already,
  192 up only the label asked. With none, nothing is said and nothing runs
  after.
- **Their talk records after it** (kind 1), once the window closes: the
  first that holds for who, the label asked, and the prompt's answer, which
  is 0 with no prompt.

Built: `pickLine`, `lineFor` and `afterFor` in `talk.ts`; talk boxes in
`castAtPoint` and `talkBoxesAt` in `main.ts`; the counts in `main.ts`.
Also read on the way: the chapter a talk opens is the major's in
`ABCDEFGHIJSTKLMNOPQ`, not the alphabet's — 11 and 12 are `S` and `T` —
and conditions 11, 16, 26, 27, 36, 41, 62, 63, 88 and 89.

**Ours**: every quest is taken as open and not taken (`QUESTS_OPEN`), since
the quests are not built — the story walks the same either way — and the
Hero is taken to be up.

**Left**: 11.3, where `106` in Gleeba's `205` asks 194 while flag 1 is
clear and 195, which plays `ev11230`, only at step 3 with it set — a flag,
as cause 7. And 19.3 to 19.7, the Quester's Rest's records after the credits,
which test quests 174 to 193 (`55`, `57`, `61`) — the quests' own work.

### 10. A scene plays in its own map: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "The event lists". Every scene has
an entry in one of three lists, and the entry names the map it plays in. When
a scene starts somewhere else, the game changes map and plays it there — and
a script a scene chains into goes back through the same start, so a chain
walks the Hero from map to map. Talking to `106` on the Starflight Express at
4.7 plays `ev24598`, which chains through three more maps to `ev5110` in the
Observatory's 4507, whose record moves the story to 5.1.

The walk takes a scene's record in its own map, the last script's; the game
goes there before playing a scene (`startEvent`), and a chain into another
map's scene ends the scene and carries on there. Arriving by the map's
entrance is ours: the game keeps where the Hero stands on some, which is not
read. Of the 620 scenes the records start, 47 play in a map other than the
one whose record starts them.

### 11. A closing step of 0

80 cast records end at "step 0" of their last stage, and two of them sit on
the story. One is Coffinwell's `29`, from 4.1 step 1 to 4.2 step 0, and a
record talks to them at 4.2. Read
as "at or before step 0" they are not there. There is one such case among
the 431 talk records over a single stage, which is too thin to change the
reading.

### 12 and 13. Every kind, and who asks for it: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "Who asks for which kind" — now
the whole list. The only way a record runs whole is `func_020649b0`, and
every call to it in the ARM9 and the overlays was found, three through thunks
that fix the kind: **the field asks kind 3, the entry record, whole on
arriving in a map** (ov017 `0x0219f3a0`), so an entry record's `143` areas
exist — Batsureg's 72 and 73 at 10.6 — and its `124` and `119` run; map
loading runs only `108` of kinds 3 and 20 besides. Kind 20 runs whole as the
trigger file loads (the Bowhole's plays `ev13500` at 13.5), kind 17 at a
doorway (Coffinwell's `27` at door 9), kinds 15 and 16 at a set battle's end,
won and lost. **No record on the cartridge is of kind 9**, though the field
asks for it.

### 14. A party trick: done, 28 September 2026

**Read from the game's code**: FORMAT.md, "Kind 19 is a party trick". Gleeba's
Drak comes out for a **Clap in area 10** at 11.2 (`7:10 33:0 512:0 …
119:11200`): the record kind 19 is asked for when the party member playing a
trick is done, with the tricks performed; condition `33` takes the next word
as four bytes, each a trick that must be among them. The tricks are numbered
as the field menu's strings are (`str_tm` 4510 is Bow, 1), sixteen are known
from the start and the rest taught by `142` — Bow at Porth Llaffan's 6.3,
Pirouette and Pray by the Quester's Rest's first two quests, which are kind
19 records too (an Air Punch; a sequence, `32`). **The walk** performs any
trick the Hero knows, from the start or learnt, in every area of a map
(`trickPlay`). **The engine** has the game's own way: the menu's Assign Party
Tricks puts a trick in each of the four places, and the B Button held with a
direction performs it — a line of status, not its motion, which is a
`data/chara/sg<nn>.chr` not played yet. The game's defaults in the four
places are not read; a new game starts with none.

**`124 : c` takes a character out of the map**, read the same day: the
object's bit `0x8000`, which every lookup skips. Drak leaves so after his
talk; the engine drops the member from the cast until it is next placed.

### 15. Scenes the game's code starts, and what a scene's start does: done for the story, 28 September 2026

**Read from the game's code**: FORMAT.md, "The thread record, and
`601`/`602`", "Starting a scene raises the story", "The field's arrival
handler". Three things, each a break until then:

- **`ev14903` at 14.4 step 8** is chained into by `ev14640` and `ev14641`
  (`538(14903)`) when the sum of `602(11)` to `602(14)` is four. `602 : n`
  reads **flag *n* of the live thread** — the thread record's bitfield at
  `+0x10`, the one `104` sets; `601` its marks at `+0x03`. Gortress's four
  `155` records set 11 to 14. The walk runs a scene's script with the state's
  thread flags and marks, and keeps the chain by them where the script read
  them; the engine seeds a scene's stage with the story's.
- **`ev28800` at 13.1** is the Starflight Express's: Stella's ride to the
  Observatory at 10.8 step 1 with game-wide flags 4 to 10 set — one at each
  thread's end — plays it in place of the ride's own arrival (see "The
  Starflight Express" below). **The walk's threads are walked apart**, so no
  one state has all seven: the ride is taken again from the first state at
  10.8 step 1 with every flag any state has set (`walkFrom`), and the walk
  goes on from what it plays — through 13.2, to Gortress and the Observatory.
- **16.1 is opened by no record.** The scene's start raises the live thread
  to the list entry's stage when the story is behind (`func_ov017_021bbfc4`,
  at `0x021bc424`; majors of 20 are left, which is why the Express's ride
  scenes are listed at 20.1). **INFERRED**: arriving at Gittingham Palace's
  field stop by the Express at 15.3 step 5 plays `ev29150`, Celestria
  opening the way, listed at 16.1 in map 20034 — nothing read names 29150;
  the field's own code must.

### 16. The Starflight Express: built, 28 September 2026

**Read from the game's code**: FORMAT.md, "The Starflight Express" — its
whole task. Talking to Stella (#2) or Sterling (#203) aboard (S14, map 6401)
runs their record's `215`, which opens a list of stops in `str_ark`'s words;
the stop it is at asks "that's where we are already?"; another is a ride —
a scene leaving where the Express is (`216` sets that, and every ride) and one
arriving, or the story's own in its place (`ev28800`, `ev29210`).

- **The engine** (`express.ts`, `main.ts`): the list as a menu panel opened by
  the conductor's record; the yes-or-no as a conversation; a ride as the
  leaving scene with the arriving one parked behind it (`834`, `810`), whose
  `807` puts the Hero down at a field stop; the stop saved. The Hero is not
  turned to the conductor; the field stops' `func_ov017_021a65c4` is not
  read; the Express summoned by Sterling's whistle and flown over the field
  (`str_ark` 13 to 38) is another part, not built.
- **The walk** rides to each stop a conductor offers. It does not follow
  which stop the Express is at: that chooses only the leaving scene, which
  has no record.
- **The walk's reach**: what I had called "the field's arrival handler" was
  the Express. Once scenes raised the story, the walk's "every map is in
  reach" let the prologue walk into the Realm of the Almighty, whose doorway
  record over 1.1 to 19.99 plays `ev15310`, listed at 15.1, and ride the
  raise to chapter 15 — which is what made the walk run past its ten minutes.
  So a map is now taken to be in reach from the earliest stage any record of
  its own begins at, those over the whole story — from 1.1 into chapter 19 —
  aside (`reachFrom`, ours).

### 17. The quests: built, 28 September 2026

**Read from the game's code**: FORMAT.md, "Quests". A quest is a nibble —
0 not on offer, 1 on offer, 2 taken, 3 cleared, and two flags, the second
"delivered". Who offers what is `questorder3.bin`, a giver a quest; talking to
someone runs the offer over the map's givers first, and their records and
lines then read the states it left. `125` accepts into a log of eight, `127`
clears, `129` offers, `144` sets a taken quest's progress, `130`/`131` its
flags; conditions 20 to 22 and the composites 53 to 61 test them — 57 to 60
also a flag, which the walk had missed.

**64 quests are delivered ones** — quest 2 and most of 122 to 202 — whose
givers offer them only once the online service has delivered them; the
Quester's Rest's 174 to 193 are among them. So **the five breaks after the
credits are downloaded content**, and without a delivery they stay. Walked
once with every quest delivered, 19.3 opens (four breaks, not five); the
rest wait on flags the quests' own content sets — 194 for "Perk Up, Patty!",
which no record sets — so each downloaded quest is content of its own, its
scripted battles (`quest_btl_%d.stb`, overlay 23) among it, not read.

- **The engine** keeps the quests and saves them, runs the offer on every
  talk, the actions on every record, and has the Quest List in the field
  menu, in `questmsg`'s words (which text it shows when is INFERRED).
- **The walk** keeps them too, and — ours — makes an offer for the talk in
  hand only, and merges quests as it merges game-wide flags, each at the
  furthest any way took it; branching on them made a state of every side
  quest taken or not.

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
- What the quests' states 0, 2 and 3 mean. `129 : q` sets 1; the rest are
  read from the lines as untouched, taken and done (INFERRED). What opens a
  quest besides `129`, which only two records carry, is the quest system's
  own code, not read.
- What the contexts of kinds 10, 12, 18, 22 to 27, 29 and 30 hold — who asks
  is read (FORMAT.md), what they are asked with is not.
- Which scene the Starflight Express plays on a ride, and what `216` and
  `225` do at boarding: `ev29150` at 15.3 step 5 is the walk's guess.
- The party tricks the game puts in the four places of the B Button by
  default.
- What applies the queue of stage moves that `132` and `214` add to, and when.
- Whether the game applies each chained script's record or only the last's.
  The engine follows the last, as the scene's own event id is overwritten on
  each chain.
