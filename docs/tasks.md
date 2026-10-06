# Tasks — find it in the game, then build it

Written 3 October 2026, with Phase 2 closed and the story walk reaching 19.2
(the credits' stage) in one go. **Every task is the same job: find where the
game does the thing — its code in the decomp, the files and the text it
reads — and then implement it in the engine as the game does it**, reached
the way the game reaches it. Each is meant to be taken whole by one session:
*"take task N from `docs/tasks.md`"*. Alltrades Abbey (3 October) is the
worked example: `<DAMA>` found on Jack's line, overlay 3's service 46 read,
then built — `abbey.ts`, and `docs/party-and-vocations.md`, "The Abbey's
own flow".

## Where it stands — 6 October 2026

**Tasks 1 to 10 are done**, each built, checked in the browser, committed and
written up on the wiki; each says so under its heading.

- **Task 11 is done**, 6 October 2026: the ending plays to its end, the staff
  roll on the bottom screen and the cards over the view.
- **Task 12 is done**, 6 October 2026: Zoom, the chimaera wing, Evac and a
  wipe-out go where the game sends them; the flight is not drawn and the ship
  not moved.
- **Task 13 is done**, 6 October 2026: the fields' gathering spots sparkle,
  are picked from and refill by the game's minutes; red chests stay opened,
  and blue chests, pots, barrels and cupboards come back as play begins.
- **Task 14 is done**, 6 October 2026: accolades are awarded by the game's
  own four scripts where it runs them, and the Battle Records open with
  SELECT and the field menu's row — the summary and Accolades Earnt. The
  monster and item lists, the wardrobe and Stella's comments wait; where the
  game keeps the first two is read.
- **Task 15 is done**, 6 October 2026: the command phase takes overlay
  26's fixed shots for the bosses, the chase keeps a tall target's yaw
  offset, the Attack's and the one-ally heals' lines wait for the chase to
  settle (state 6), the battle runs at the field loop's 30 passes a second,
  and the panels show the level and the acting member's pulse. What turns
  the pulse on, a hit's flash and shake, and the swirl's model are not
  found or not drawn (§1b).
- **Built this week and still ours**, listed in `docs/still-open.md` §2: the
  coups' own effects (every vocation's but the Warrior's says its opening
  line and does nothing — task 18); the camera easing in for a party trick;
  Weird Dance's sound not stopped; canvassing and the guestbook (multiplayer).
- **Development parameters added this week** (`docs/regions.md`): `globals=`,
  `gold=`, `tricks=`, `minutes=`; `revoke=` is gone, the credits opening revocation. The
  screenshot tool takes `--down=` and `--up=` for a
  key held while another is pressed.

## How to take one

- `CLAUDE.md` first, then **`docs/binaries.md` before disassembling
  anything** — it records what has already been found, and re-deriving a
  documented table has cost an evening before. The decomp is at
  `~/Projects/dqix-decomp`: symbols and delinks for US and JP, headers under
  `include/`.
- **Measure where it stands before reading.** The docs drift. Both
  `docs/still-open.md` and `docs/story-walk.md` still list quests as unbuilt,
  and they are largely built.
- **Every claim carries its address.** A function and the instructions that
  show it (`0x02099dd4`–`0x02099df0`), checked against every instance on the
  cartridge where there are instances to check. A guess is marked
  `INFERRED:` with its reasoning, never written as fact. Where the reading
  contradicts something the project already says, correct it and say so —
  that has happened twice this week (`func_02099d34`, the face and hair
  slots).
- **Where findings go**: a file format's in that package's `FORMAT.md`; a
  function's in `docs/binaries.md`; every function read, logged under "Read
  since" in `docs/decomp-contributions.md`.
- **Find, then build.** Each task's "done when" names what has to be found;
  the task is finished when that is **built and working in the game**, not
  when it is written down. Two shapes, which each heading says:
  - **Translate**: the function *is* the behaviour — a formula, a generator,
    an opcode. Port it, cite it, and hold it to golden tests.
  - **Find and build**: a feature — a service, a window, a rule. Write down
    what was found (where above), then build it: its own screens and lines in
    the game's words, from the game's files, reached as the game reaches it —
    by the tag, the button or the place, never a menu command of ours.
  Fixtures are synthetic; the cartridge is used only in tests gated on
  `MINSTREL_TEST_ROM`. Look at it running (`tools/shot`) before calling it
  done.
- **Where something cannot be found**, build what was found and stand the
  rest in with something marked **ours** in the code, in `docs/still-open.md`
  §2, and in the commit — never a guess passed off as the game's. If a
  missing piece would make the feature wrong rather than incomplete, stop
  there and say so instead.
- Done means the full gate: `pnpm typecheck`, the tests with
  `MINSTREL_TEST_ROM=$PWD/rom/dq9-europe.nds`, and lint on what you touched.
  Commits carry no co-author, session or "Generated with" lines.
- The emulator, Ghidra and anything needing a person's eyes are out of reach.
  What only they can settle is written as a question for `docs/still-open.md`
  §1b, never guessed.

**Ordered smallest first** (4 October 2026), so the quick wins come before
the long readings. The sizes are a judgement from what each task asks, not a
measurement; a task that turns out bigger than its place says should say so.
Tasks 17 and 18 both change the battle code, so take them one after the
other. Tasks 6 and 7 meet — the inn's Stay and Rest set the clock — and
either can go first. The rest are independent of each other.

---

## Where the later tasks came from

Features the strategy guide describes that the engine has not built,
`evidence/game_guide.pdf`. Page numbers are **printed** pages, which are the
PDF page minus 2. The guide is one witness; the game's code decides. They were
found by reading the guide's first two chapters and searching the code for
each one, and by a census of the cartridge's facility tags: of the twelve,
**`<RIKKA>` (252 lines) and `<BANK>` (48)** are on the cartridge and not
recognised, so their lines open nothing — as Jack's `<DAMA>` did until 3
October.

Tasks 1, 2, 4 to 9, 13, 14 and 16 came from the guide and from play, added 3
October 2026; each needs the game's code read first, and follows the same
rules as above.

The facility codes' flows begin at (US, `func_0206f6cc`'s table at
`0x0206f70c`; `docs/event-scripts.md`): the inn `0x21bac24`, the church
`0x21ba8e0`, the bank `0x217e300`, the shop `0x21b2c24`, the Quester's Rest
counter (codes 6 and 12) `0x218d77c`. Alltrades' reading,
`docs/party-and-vocations.md`, "The Abbey's own flow", is the model of what
a finished one looks like.

---

## 1. The Story So Far — find and build

**Done, 4 October 2026** (`355633a`): `story-so-far.ts`; the wiki's Story-So-Far.

A button that "summarises the latest goal" (p. 7). Not built.

**Done when** what it shows is read: which message, chosen by what (the
stage, the live thread, a flag), and from which file.

## 2. Heal All — find and build

**Done, 4 October 2026** (`2ead6bf`): `heal-all.ts`; the wiki's Heal-All.

The Misc. menu's Heal All heals the party with its own spells (p. 11). Not
built. **Done when** its rule is read: who casts, which spell, in what order,
when it stops.

## 3. The last four engine functions — translate

**Done, 4 October 2026** (`3b3cf8b`): `event.ts`; the wiki's Engine-Functions.

`apps/game/test/event-coverage.test.ts` counts the engine functions that
events call and that the host does not answer. **Four are left on the whole
cartridge: `843`, `837`, `839` and `844`.**

- `843` takes two numbers, and is wanted by one area's scene.
- `837` takes a reference to fill.
- `839` takes one number.

**Start from:** the engine-function table the host's other 226 were read from
(`docs/event-scripts.md`, and `event.ts`'s comments on its neighbours, `807`
and `838`).

**Done when** each is answered, its reading cited, and the test's expected
list is empty.

## 4. Recipe books — find and build

**Done, 4 October 2026** (`1b36196`): `bookshelves.ts`, `alchemy.ts`; the wiki's Bookshelves.

"Almost all of these are found in bookcases… once read, the Krak Pot keeps
track" (p. 24); the first is in Stornway's inn (p. 68). The pot lists all 470
recipes from the start (`alchemy.ts`, `potList`), and nothing reads a
bookcase.

**Done when** where the known recipes are kept, how a book maps to its
recipes, and how a bookcase is examined are read, with a recipe for both.

## 5. The Quester's Rest counter and the bank — find and build

**Done, 4 October 2026** (`715b088`): `counter.ts`; the wiki's Questers-Rest. Value 2 is the Rapportal (multiplayer), value 6 DQVC without connecting.

- **The counter**, `<RIKKA>` (code 6) and `<RIKKAFIRST>` (12): Stay, and
  **Rest until evening** (p. 68). Canvass and the Guestbook are tag mode, so
  multiplayer: leave them out, but say where the flow branches to them.
- **The bank**, `<BANK>` (code 3): deposit and withdraw. Gold in the bank is
  kept from the wipe-out's halving (p. 23), which is built and so must learn
  to leave the bank alone.
- **What operation 145 opens with value 2**, on character 99 at the
  Quester's Rest (`R01`–`R04`). And **value 6**, on Sellma: the code's own
  note says DQVC without the Wi-Fi step. Which of these is single-player?

**Done when** each flow has a recipe (steps, lines and their files, windows,
prices, what is saved), and `<RIKKA>`, `<RIKKAFIRST>` and `<BANK>` are in
`talk.ts`'s `BARE_SERVICES`, each opening its flow — the change to the tag
reading is small, and its pattern is `<DAMA>`'s.

## 6. The church and the inn — find and build

**Done, 4 October 2026** (`25b0669`): `keepers.ts`; the wiki's Inns-and-Churches.

- **The church's other services**: resurrect, cure poison, lift a curse —
  "costs climb as heroes increase in level" (p. 23). Ours offers Confess and
  Divination only (`services.ts`, `CHURCH_ROWS`), and the rows' words are
  ours. Met with the first fallen member.
- **The inn's Stay and Rest.** Nearly every innkeeper offers both — "You
  wish to stay the night, or merely to rest until evening? Either service
  costs a highly reasonable `<val_2>` gold coins" — in 181 English lines
  that end `<INN=n>`; ours offers only "Stay the night", in our own words.
  Read the flow from `0x21bac24`: the Stay / Rest window and its words,
  which of the innkeeper's several `<INN=n>` lines is said when (they differ
  by party size — "There are `<val_1>` of you in need of a bed" — and by
  stay or rest), and what each choice does to the time of day (task 7).
- **The inn's price.** `INN_PRICE`, 10 G, is ours; the lines make it one
  price for either choice, by party size (`<val_1>` beds, `<val_2>` gold),
  and the guide has Erinn's at 3 G a member (p. 68). What `<INN=n>`'s number
  selects is also not established.

**Done when** both flows have recipes — the menu and its words, each price's
formula, the lines — and the stand-ins in `services.ts` are named for
replacement. A curse is not modelled at all; say what the game keeps for one.

## 7. The game's clock — find and build

**Done, 4 October 2026** (`dfa338f`): `packages/sim/src/clock.ts`; the wiki's Time-Of-Day.

Night falls only at stage 2.2 here (`daytime.ts`, a choice made for the
slice from the let's play), so **there is no evening to rest until** at any
other stage. The game has a clock: the inn's Stay (to the morning) and Rest
(to the evening) — task 6, and Erinn's own Stay and Rest at the Quester's
Rest, `str_rki`/`str_rkm`, task 5 — people met at night (p. 150, "talk to Nicholas at night"; p. 214,
"meet at midnight"), and the cast's placements by time of day, already read
(`place.bin` tag 5).

**Done when** how the game keeps the time of day is read — what advances it,
how fast, what the inn sets it to — with a recipe to replace `daytime.ts`'s
stand-in. Whatever only footage can settle goes to `docs/still-open.md` §1b.

## 8. The battle's other commands — find and build

**Done, 4 October 2026**: Examine and Line-Up (`1133a2f`), Equipment (`4e8fcb0`), the coup de grâce's readiness; the coups' own handlers wait for task 18. The wiki's Battle-Commands.

Examine, Equipment and Line-Up do nothing (`battle-commands.ts`), and the
coup de grâce is never ready (p. 13; `docs/still-open.md` §2, "the command
phase").

**Done when** each has a recipe — what Examine shows (and from which text),
what Line-Up changes and whether the order affects targeting, and **how a
coup de grâce becomes ready** and what each vocation's does. Equipment is
mostly the field's equip screen in battle; say only where it differs.

## 9. Party tricks, performed — find and build

**Done, 4 October 2026**: `tricks.ts` — the seven slots, B held with a direction, the motions, sounds and bubbles, kind 19 at the end. The camera's ease-in is not built. The wiki's Party-Tricks.

Assigning tricks (Misc. → Assign Party Tricks), holding B with a direction,
and the map's kind-19 reactions (Gleeba's Drak answering a Clap) are built.
**The performance is not**: a trick is a line of status, with no motion
(`main.ts`, `performTrick`). Already read, `packages/game-formats/FORMAT.md`,
"Kind 19 is a party trick": the field object loads
`data/chara/sg<nn><m|w>.chr` (`func_0205308c`), each holding a gesture,
`sigusa.nsbca`, for a man or a woman (`func_02052e2c`); its update,
`func_02053634`, hands the up to four performed to the kind-19 query at
`0x020539ac`.

- **The input**: where B held with a direction is read, what it checks, and
  **the four-on-down rule** — "You can assign up to four party tricks to the
  down direction of the +Control Pad. That way, you can perform all four in
  one go!" (Ricki, quests 3 and 4): how Down comes to hold four, whether
  something unlocks it, and the order they play in.
- **Who performs**: the Hero alone, or every member, each by their sex.
- **The performance**: how the gesture is applied (in place of standing,
  blended?), its length, any sound or effect per trick, whether the player
  can move, and the sequence case.
- **The files**: every `sg*.chr`, what each holds, how `<nn>` maps to the
  trick's number, and whether the gesture drives the same rig as the
  player's motions (`packMotions`, `packages/actor`).

**Done when** it is built. Playing the gesture is then the chest's
pattern (`chestOpeningPose`): a pose over the Hero's, timed by its frames,
with what follows at its end.

## 10. Single questions — find and build

**Done, 6 October 2026** (`c8853c2`, `939ef55`, `c7c0178` and the commit that marks it done): the Abbey's flags by actions 223, 231 and 160, and the slots' order (`bankBit`, `marchingOrder`); faces and hairs as items, by sex, the hair's letter by its headgear and its ramp (`modelName`, `hairLetter`, `CREATION_ITEMS`); Autofilch and Critical in a Crisis (`dropsWon`, `inCrisis`); the text's sounds and the victory's jingle wait, spell lines and skill screen (`TEXT_JINGLE`, `ResultsSlot`). The outline colour and overlay 23's `d_` figure are read and not drawn. The readings are in `docs/readings/T10a-questions.md` and `docs/readings/T10b-questions.md`; the wiki's Single-Questions.

Each is short alone; take them as a batch, in any order.

- **What sets Alltrades Abbey's three flags**: `0x799` (open), `0x796`
  (revocation) and `0x113F + v` (the advanced six), raw bits of the
  game-wide bank at `+0x8c`. No record or script on the cartridge sets any of
  them, so the game's code does — likely around the Abbey's chapter, the
  postgame and the vocation quests. `docs/party-and-vocations.md`, "The
  Abbey's own flow", has what stands in.
- **What writes the party's slots and its count**, `+0x397c`. Three reads in
  the ARM9 and no write found in the ARM9 or any overlay. Look for a write
  through a base register or a block copy.
- **Where a preset's hair comes from**, if anywhere. The record names none.
- **A preset's face**: `hero.ts`'s `faceName` reads face id 9000+n as
  `p_f<n>`, but the item records make 9000+n a hair and 9020+n a face
  (INFERRED). Settle which is which from the code that loads a preset.
- **The hair's skin ramp**: how a hair style pairs with its item record
  (9000–9013), since three of the man's hairs take eight shades at slot 8.
- **`palette.bin` tag `0x69`**: stored at `0x02109a50`; what reads it?
- **Overlay 23's second skin path** (`func_ov023_021e540c`): `which` 0,
  written straight to VRAM, for the `d_` parts. Which models, and when?
- **The drop roll's four further passes**: what scales their chance,
  `func_ov023_021f454c` from `0x021f4628`.
- **The critical rate's doubling**: what trait `0x11d` is, and what
  `func_ov000_02155a04`'s quarter is a quarter of.
- **The sound ids**: `<ME_n>` asks for `n + 49` and `<SE_n>` for a flat 14.
  What do those ids index, so that the cues can play?
- **Victory**: the waits for `ME_004` to end, and when a new spell's line (12)
  and the first-time tutorial (36) are said (overlay 23, beside
  `results-window.ts`'s readings).

**Done when** each is answered with addresses or recorded as not found, with
where the search stopped, and **every answer that changes what the engine
does is applied** — the preset's face, the hair's ramp, the sound ids, the
victory's lines.

## 11. The ending: opcode `0x1e` and the staff roll — translate

**Done, 6 October 2026** (`3063b1d`, `7147756`, `c714054`): `0x1D`/`0x1E` are fdlibm's sine and cosine (`vm.ts`); overlay 28 read whole and run as `StaffRollRun` from `staffroll.bin` (`staff-roll.ts`), the cards drawn over the view; the ending's chain plays to `ev29450`. Ours: the roll's two colours, the fade's screens, a flat floor in the collision-less `E01` maps. The reading: `docs/readings/T11-ending.md`; the wiki's Staff-Roll.

The story walk reaches 19.2, but the last scene, `ev29300`, stops on VM
opcode `0x1e`, so the credits never run (`docs/story-walk.md`, cause 6). The
staff roll's engine functions — `811`, `812`, `838` and the ending's block
in `apps/game/src/event.ts` — are partly read.

**Start from:** the VM's dispatch in `packages/script` and the ARM9
interpreter it was read from (`docs/event-scripts.md`); then the overlay that
`811` pages in.

**Done when** `0x1e` runs as the game runs it, and the staff roll's content,
order and speed are read rather than set by eye, so `ev29300` plays to the
end of the roll. Whatever cannot be read becomes a line for a video.

## 12. Travel — find and build

**Done, 6 October 2026**: `travel.ts` in `@minstrel/game-formats`, `openZoom`,
`zoomChosen`, `evacuate`, `comeRound` in `main.ts`; the reading is
`docs/readings/T12-travel.md`; the wiki's Travel. Ours: the flight not drawn,
the ship not moved, where in the revival map the party stands.

A play-through needs these to get around once the world opens up past
Stornway, and every one is a stand-in today (`docs/still-open.md` §2):

- **The places Zoom and the chimaera wing offer**: where the game keeps the
  places reached, what adds to it, and the order and names of the list. The
  wing has one destination here, and Zoom does not exist yet.
- **Where Evacuazam takes you**: by map, or by a table. It goes to the
  region's outside here.
- **Where a wipe-out sends the party**: which church, chosen how. The village
  church is ours.

The places reached are save data, which is why this comes before more
content. Find the lists and the rules, then build them: Zoom from the
spell, the wing from the bag, each in the game's own window.

**Done when** each of the four has a recipe with its addresses, and any file
or table it reads is described in `FORMAT.md` with a check against the
cartridge.

## 13. Gathering spots and treasure that comes back — find and build

**Done, 6 October 2026**: `sim/src/gathering.ts`, `sparkles.ts`, `game-formats/src/gathering.ts`, the treasure's flags; the reading is `docs/readings/T13-gathering.md`; the wiki's Gathering. The item's icon over the Hero is not drawn; the draws are ours.

Ingredients lie on the ground and come back (pp. 22, 24); blue chests, pots
and barrels refill, red ones never do (p. 23). Here, opened treasure is
remembered for ever (`treasure.ts`), and nothing places a gathering spot.

**Done when** the spots' data (likely a format of its own: where it is, what
it holds, how it is chosen) and the refill rule (what counts the time, and
how a blue container is told from a red) are read.

## 14. Battle Records and accolades — find and build

**Done, 6 October 2026** (`f473fb3`, `589fcc7`): `accolades.ts`, `readAccoladeData`; the reading in `docs/readings/T14-records.md`; the wiki's Accolades. The four award scripts run with the functions read; the Battle Records by SELECT and the field menu's row, their summary and Accolades Earnt. What sets `0x119a` is not found, and stands in at Stella's `ev22593`; the monster and item lists, the wardrobe and Stella's comments are not built.

Stella's Battle Records (pp. 8–10), from when she joins (~p. 64): a summary,
the monsters defeated, the items found, the wardrobe, **accolades** (titles,
appendix p. 434) and, after the ending, completion records. None is built,
and accolades have no reader. The Abbey's revocation titles are accolades too
(`0x0217f2ce`, 101 to 112).

**Done when** where the game keeps what was defeated and found is read, the
accolades' table is read and parsed into `game-formats` with a `FORMAT.md`
entry, and what awards each accolade is read or listed as not found.

## 15. The battle's presentation — find and build

**Done, 6 October 2026** (`287bc5a`, `bcd4968`, `7da0c28`): `fixedshots.ts`, `battle-camera.ts`, `action-player.ts`, `battle-screen.ts`; the reading `docs/readings/T15-presentation.md`; the wiki's Battle-Presentation. Not found: what turns the pulse on, a hit's flash and shake, the view the swirl's model is drawn under.

The battle looks right in outline, but much of how it is staged is ours. From
`docs/still-open.md` §2, the rows "the battle stage" and "the command phase",
each of these is wanted as a reading:

- **the camera while a command is chosen**: overlay 26's fixed shots for 47
  kinds of monster (the wide shot stands in), and the chase shot's yaw
  offset for a tall target;
- **state 6**, which brings a blow's line up when the action's script has no
  camera before its first reaction;
- **the rates**: the action dispatcher's (taken as 1/60 s), the battle loop's
  for the rising numbers, and a tick's length, which the results windows also
  assume;
- **the setters** for the acting member's pulse, and for a hit's flash and
  shake;
- **where the level number is drawn** on the party's panels;
- **going in and out**: the swirl model, a set battle's 15-frame wait and the
  10-frame music fade.

**Done when** each is read with addresses or written down as not found and
where the search stopped — and **what was found is put into the battle**,
in place of the stand-in `docs/still-open.md` §2 lists for it.

## 16. Getting around: ladders and vines, keys, the ferry, the ship — find and build

- **Climbing** (p. 5; dungeons from ~p. 108): nothing handles a ladder or a
  vine. Is it collision, an object, or a map flag?
- **Locks**: doors and chests that want the thief's, magic or ultimate key
  (pp. 6, 23). Cap'n Max already gives the thief's key (p. 114), and there is
  no lock logic anywhere. Where does a door or a chest keep its lock?
- **The ferry**, Porth Llaffan to Slurry Quay (p. 110): check first — it may
  already play as a scene and a map change.
- **The ship** (~pp. 123–138; "Using a ship", p. 7): a vehicle, the same
  shape of job as the Starflight Express's flight (`flight.ts`).

**Done when** each has a recipe, or is shown to work already. The ship may
be big enough to split off once its reading is done.

## 17. Battle AI — translate

- **The party's tactics.** A member not on Follow Orders hands in no command,
  because the AI is not read. The party's command-phase processing is at
  `021f9030` and `021f8f20`.
- **The monsters' other ways of choosing.** 34 of the 438 monsters choose by
  one of four methods that are not a weight table: a round robin (3 and 7),
  a pair and a coin (5), and two passes (6). Today all four fall back to the
  even table. What makes a slot unusable is already read.
- **The targeting handlers** not yet read, Sap's among them. Today they all
  take the first target.

**Start from:** `docs/conformance.md`, "Still to read, in the order it is
wanted", then `battle.ts` (`chooseFoe`, `byHandler`, `firstHandler`) and
`apps/game/src/battle-commands.ts`.

**Done when** each tactic chooses as the game's code chooses, the four
methods are translated, and every targeting handler is read or listed as
unread. A seeded battle with the party on a tactic replays identically.

## 18. The abilities' and spells' handlers — translate

`docs/still-open.md` §2, the rows "abilities" and "combo and tension", lists
what still does not play as the game plays it:

- the slot-0 blows with code of their own are played as a plain blow:
  Propeller Blade, Crosscutter Throw, Gold Rush, Gigaslash and the five that
  scale;
- an ability that is not a blow, a spell or Psyche Up is struck as the
  Attack, and so are Egg On and the others that psyche up someone else;
- the metal body's zeroing, the riders on abilities, and taking or giving MP
  by a number are not modelled.

With vocations in, a play-through meets these within a few levels.

**Start from:**

- `docs/conformance.md`, "The abilities' handlers — 2 October 2026" and
  "What is not a plain blow";
- the resolver, `func_ov024_021eb5d0`, and the handler tables it dispatches
  through;
- `packages/sim/src/battle` and `packages/sim/test/game-oracle.ts`.

**Done when** every ability on the 26 skill trees, and every spell the six
starting vocations learn, either resolves by a translated function with a
golden test, or is listed by name as unread with the address that would
answer it. Count what is "struck as the Attack" before and after.

The battle's floats are allowed only under `CLAUDE.md`'s "The one exception".

## 19. The grotto generator — translate

The longest pure translation job in the project, and it needs no map or story
to exist. `FloorMapGenerator` is named in the US symbols: `Initialize`,
`Calculate`, `RandRange`, `BasicRectangle`, `Room`, `ReshapeRoom`, and
`RoutineA` to `RoutineK`. There is a header at
`include/Grotto/Main/FloorMapGenerator.h`. The `.bpos` files, `Z01M0100` to
`Z05M0100`, an 11 by 18 grid of codes each, are read and not modelled.

This is Phase 4 work, taken early because it stands alone. Put it where
`CLAUDE.md`'s boundaries allow: headless, deterministic, no DOM, so `sim` or a
package of its own.

**Done when** a grotto's seed gives a floor layout by the game's own
generator, with golden tests, and the `.bpos` grid's codes are read for what
the generator uses them for. Where the seed comes from — a grotto map's name
and its numbers — is part of the task if the code shows it. **Then the
floor is built from it**: the pieces the generator places, put together into
a floor the Hero can walk. If those pieces need finding of their own, finish
the generator, say so, and leave the floor as the next step in this file.

## Not assembly work — screens over what is already read

For any session, not only one reading assembly:

- **Tactics in the field Misc. menu** (p. 11): settable only in battle now
  (`battle-scene.ts`). Playing a tactic is task 17.
- **Organise Items** (p. 7), over `inventory.ts`.
- **The battle's Equipment command**, once task 8 says where it differs
  from the field's.
- **Battle Records' monster and item lists**: where the game keeps them is
  read (`docs/readings/T14-records.md` — `GameState+0x75f0` and `+0x7ac4`);
  keeping them and their screens are left, with the wardrobe and Stella's
  comments (`cmtFileTbl.bin`).
- Low value, and largely ours anyway: **Quick Save** (p. 12) and the
  **volume** settings.

**Out of scope, as multiplayer or online**: the Rapportal and Pavo,
Canvass and the Guestbook, the DQVC shop and its special guests, map
trading, and the profile. `<LAVIELL>` (code 8, Patty's flow in mode 1) is
INFERRED to be the Rapportal's from its Japanese name, which is not read.
