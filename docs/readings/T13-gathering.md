# Task 13 — gathering spots, and treasure that comes back

Read 6 October 2026 from the decomp's USA build (`~/Projects/dqix-decomp`,
symbols and relocations; the disassembly is `dsd dis` of its extract, and
`src/World/LootableContainer.cpp` is already decompiled). Every code address
below is USA. The files were read on the European cartridge with the
project's own parsers; all of them are the game's `Script` command files
(`table.ts`).

## Where it stood

- Opened treasure was remembered for ever, keyed by the treasure files'
  running number (`0x66` + place), ours (`treasure.ts`, `treasureKey`).
- Pots, barrels, cabinets and kind `0x40` drew their contents once, by a
  fixed stand-in roll (`standInRoll`), from tables INFERRED to be theirs.
- Nothing placed a gathering spot. `flditem.pac` had not been looked at.

## Treasure: what each record is

`LootManager_CreateContainer` (`0x0207ba90`, decompiled) reads a treasure
record's two first values:

- **value 0**: the high half is the container's **unique id**, the low half
  its item, its gold or its rank (`packedID >> 16`, `& 0xffff`). Over the
  cartridge's 266 files the ids run 0–206 for the red chests and 0–699 for the
  rest; the only repeats are `C04M04` and `C04M05`, the same room's two
  versions, which share their three chests.
- **value 1**, the "kind": **bits 4–6 the container** — 0 a red chest, 1 a pot,
  2 a barrel, 3 a cupboard, 4 a blue chest (the decomp's naming; the code
  tells 0 and 4 from 1–3 by the position it reads and by the table it draws
  from, below); **bits 2–3 what it holds** — 0 nothing, 1 gold, 2 an item, 3 a
  monster; **bits 0–1** not read here (kind `0x9` is a red chest with 1 there,
  the five that are locked — task 16).

So kind `0x4` is gold (as INFERRED), `0x8` an item, `0x10` a pot, `0x20` a
barrel, `0x30` a cupboard, `0x40` a blue chest: **the pot and barrel order and
`0x40`'s table, INFERRED until now, are the code's**.

**The draw is made at every load of the map**
(`LootableContainerManager::LoadZoneContainers`, `0x0207bd34`, from the map's
load at ov017 `0x0219ed54`): every blue chest draws from `randTBox` by its
rank, every pot, barrel and cupboard from `randTTT`; `LootDistribution::Sample`
takes the rank's rows in file order and a draw below 100 (`func_02032370(100)`,
the "A table") and gives the first row the draw falls in; past the weights,
nothing. The kind becomes the row's (1 gold, 2 item, 3 monster). Red chests
are not drawn.

## Treasure: what is remembered, and what comes back

The treasure-opening service (ov017 `func_ov017_021adcb0`, the dispatcher's
case 33) sets a game-wide flag in the bank at `+0x8c` once it is open
(`0x021ae528`–`0x021ae58c`):

- **a red chest: flag `0x212 + id`** — for ever;
- **anything else: flag `0x79e + id`** — unless it is a grotto's, which come
  from the grotto's own list (`[r5+0x20]`, task 19).

**Every one of `0x79e`'s comes back when play begins.** The field's start
(`func_ov017_0218b688`, `0x0218c160`–`0x0218c180`) clears **700 flags from
`0x79e`** (`func_0206dfe8(bank, 0x79e, 0x2bc)`) — exactly the ids 0–699 the
non-red containers use — in a game of one's own (game mode not 5; mode 5 is
INFERRED to be a guest's, the mode the multiplayer copy at
`func_ov017_021b0bc0` serves). The field starts at a new game and at a game
continued from the title; nothing else clears them (the only other calls of
the range clear are a story-point script's, `func_020716a4`, which clears
`0`–`0x1ff` and another 1,000 from a pool word, and the multiplayer copy,
`0x021b0e48`). **A red chest never refills; a blue chest, a pot, a barrel
and a cupboard are full again each time the game is started.** The strategy
guide's "if you return to areas after considerable time has passed" (p. 23)
is this, seen from the player's side.

## Gathering spots: the files

`/data/scenario/flditem.pac`, a NARC: `F01flditem.bin` … `F63flditem.bin`
(40 fields have one) and `fldbias.bin`. `/data/bin/izmitm.bin` beside it.
Loaded by `func_0208e520` on entering a map whose code is a field's (`F` and
three letters, `func_0208e824`) or `R01M07`, Stornway's Guardian Fountain.

**`F<nn>flditem.bin`, tag `0x66`, one spot each** (`func_0208e0c4`):

| value | meaning |
|---|---|
| 0 | the spot's id, 0–97 — game-wide, unique over the 40 files (89 spots) |
| 1 | the item it gives |
| 2 | when it is there: 1 always, 2 once flag `0x798` is set, 3 once `0x796` is (`0x0208ed80`–`0x0208ee20`); 1 on all 89 |
| 3 | not read by the code; 1 on all 89 |
| 4 | **8**: values 5–7 are the spot's own; **0–7**: they come from `fldbias.bin`'s row of that number |
| 5 | minutes between refills: 30, 60, 90, 120, 240, 360 |
| 6 | the fewest an empty spot refills with |
| 7 | the most it holds — the number of places listed, where value 4 is 8 |
| 8–31 | eight places, x y z in the files' units (`ToVec3fix`) |

**`fldbias.bin`, tag `0x67`, one row per value-4 number 0–7**
(`func_0208e2c0`): the number, then eight (minutes, fewest, most); **the one
used is the save's variant**, `GameState+0x5cda`, drawn once, `rand() % 8`, at
the first start of a new game (`func_0208ea10`, `0x0208ea2c`–`0x0208ea54`) and
saved. The rows are one cycle, each starting a step on: (60,1,3) (120,1,3)
(180,1,3) (360,1,3) (60,3,4) (120,4,5) (180,5,6) (360,7,8).

**`izmitm.bin`**: tag `0x66` the Fountain's two spots, 98 and 99, seven places
each as floats (`func_0208e35c`: most 8, mode 9, item none); tag `0x68` a row
per variant of 16 items (`func_0208e444` keeps the save's variant's).

## Gathering spots: what the game keeps

A word a spot at `GameState+0x5cdc + 4·id`, 100 of them (`0x0208e894`):

| bits | |
|---|---|
| 0–8 | minutes to the next refill |
| 9–12 | the most it holds |
| 13–16 | the fewest an empty one refills with |
| 17–24 | which of its places have an item lying |
| 25–28 | minutes between refills ÷ 30 |
| 29–30 | when it is there (value 2) |
| 31 | set up |

**At the first start of a new game** (variant 8, none drawn) every spot of
the 40 files is set up empty with its refill due (`func_0208ea10`), and the
Fountain's two with most 1, fewest 1, every 60 minutes. **At every later
start** each spot with anything lying is emptied and its refill set to a
tenth of its minutes (`func_0208ec04`).

## Gathering spots: the refill

`func_0208ec78`, every frame of the field (ov017 `0x0218cee8`), not while a
map is changing (the service queue's head is case 3) nor in a guest's game:

- **A minute of play is counted** from the effective frame time, milliseconds
  (`GameState::GetEffectiveDeltaTime`) over 1000, to 60; then it starts again
  and **a sweep** begins, one spot a frame, 0 to 99.
- A spot not set up, or not there yet (value 2), is passed over.
- **Its refill due** (0 minutes): empty, it gets
  `max(rand() % (most + 1), fewest)` items; part-full with `n`, it gets
  `rand() % (most − n + 1)` when `n < most`. They go to free places from
  `rand() % most` on, wrapping. Its minutes start again.
- Then, **unless it is full, a minute comes off**.

So a spot's items come back its minutes after it was last refilled or picked
from, and a full spot waits.

## Gathering spots: seen and picked up

- **The sparkle** is `data/effect/ev999990300.chr` (overlay 17
  `func_ov017_0219b624`, `0x0219b834`), at the characters' scale `0x10a`
  (`func_0208f36c`), its motion looped from a random frame of its range
  (`func_0208f168`). One stands at each place with an item, on entering the map
  (`func_0208f168`, from the map load at ov017 `0x0219f140`): **0.1 above the
  floor found from 1 above the place to 10 below** (`func_02018fbc`).
- **Picking up** (ov017 `func_ov017_021986fc`): the Hero within 0.7 of a
  place, in x and in z (`0xb33`), and A pressed (or the place touched). The
  place's item is taken off, the spot's minutes start again, flag `0xc12 + id`
  is set, and the Fountain's spots give one of the variant's first 8 items, or
  of all 16 from story 19 on (`func_0208e7d0`). Then service 35
  (`func_ov017_021ae85c`): the Hero is set to state 8 (`func_02033b68`) and
  sound 91 plays; 30 frames on, the item's icon (`/data/ani/d_%c%03d.spr`)
  rises over the Hero; **`<ACTOR> acquires <INDEF_ART_SGL_I_NAME>.`, system
  string 84** (`func_0207d538` kind 2, through `func_0207d300`, the item
  obtained as a chest's is) and sound 14.
- **The Fountain's count** is `field+0x2374` ÷ 100 + 4, at most 14
  (`func_0208f048`): 7 to spot 98, the rest to 99. That field counts the
  guests canvassed (overlay 3 `0x0216c8d4` adds to it) — multiplayer, so in a
  game with none it is 0, and the Fountain holds 4.

## Not found, or not chased

- What the Hero's state 8 plays: INFERRED `hirou`, *picking up*, the motion
  beside `takara` — the state's motion lookup (`func_02033dd4`) was not read.
- Flag `0xc12 + id` is set and read by nothing found.
- The icon's letter and number (`func_020de234`, the item record's `+0x10`).
- What the game's `rand()` is seeded with; a stand-in draws here.
