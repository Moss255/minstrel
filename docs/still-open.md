# What is still open

Written 18 September 2026, with the slice held **shippable**: Slice 1 plays
from the Guardian statue at 2.1 to Patty's rescue and the title card, walked
start to finish, and every point of the plan's definition of done is met — the
slice plan at the repository root, which is local and not committed, and the
table in `docs/next.md`, "What is still open — 16 September", which this file
replaces as the standing list.

Nothing in this file stops the slice being played end to end. What is here is
of four kinds, kept apart on purpose:

1. **Questions the cartridge has not answered** — a rule or a number that is
   in the game's code or data and has not been found, or has been found and
   only inferred. These are the ones that could make the game *wrong*.
2. **Ours, and stand-ins** — where the game's own rule is not known and
   something of our own is running in its place. A player meets these as
   plausible behaviour; they are not bugs, and they are not the game.
3. **Read and not modelled** — parsed from the cartridge, carried through,
   and not yet acted on.
4. **Polish** — by ear, by eye, and code with nothing riding on it.

Each entry says where it lives. The evidence behind every reading is in the
package's `FORMAT.md`; the shape a code search would go by, and the witness
that would confirm a find, are in `docs/binaries.md`, "Still to look for".

---

## 1. Questions the cartridge has not answered

### 1a. Cheap to settle in play, now that levels are free

`l` gives the Hero a level and Shift+L takes one back; `minstrelLevel(30)` goes
straight to one; `?level=20` opens a new game at one (`levelTo` in
`apps/game/src/main.ts`). That turns each of these from a grind into two
keypresses. **None of it settles anything by itself** — every one still wants
an outside witness.

| question | what rides on it | how it would be settled |
|---|---|---|
| **Which level-table column is which.** Eleven integers a level; the meanings are INFERRED from the status screen's words and the numbers themselves, and column 10 is not established at all — 0 at level 1, 200 at 99 on twelve of the thirteen files | every number the Hero fights and survives with: attack, defence, agility, HP and MP all come from this reading | a status screen at a known level, from a let's play or the emulator, against what the menu's status panel shows at that level. `levels.ts`; game-formats' FORMAT.md, "Level tables" |
| **Whether the Hero is a Minstrel.** `level6.bin` is taken as theirs, INFERRED from the Minstrel being 6 in all three places that number vocations; `level0.bin`, the Guardian's, is the other candidate | as above — a different table is a different curve | HP and MP at levels 1 and 10 against a video. Level 1 already agrees with the let's play under the Minstrel reading (`hero-kit.test.ts`: resilience 8, defence 14 dressed) |
| **Whether monsters run from a party at the level we think.** `fld_mondata`'s values 1 and 2 are read as a monster's level and the margin the party must pass it by — INFERRED, with rank agreement of 0.84 against maximum HP and 0.88 against experience over 280 non-boss monsters | how often a fight ends in a monster fleeing, which at low level is most of them | level 5, fight slimes, count the escapes; Shift+L to 6 and count again — ours says they stop running at 6. A let's play would confirm. `docs/next.md`, "Monsters run from a strong party" |
| **Whether the damage formula holds up the curve.** It is translated from DQIX/BattleEmulator and held to golden values, and checked against the let's play at low level only | every blow struck and taken | fights at levels 5, 20 and 50 against any video's damage numbers. `packages/sim/src/battle` |
| **How experience is shared among a party.** The result strings name up to four members each with an amount, so the game pays per member; the split itself is not on the cartridge | Ivor's level, and the party's pace through the slice | `?ivor=1`, win a fight, read both amounts: they should sit in the ratio of the levels and sum to the monsters' total |
| **Ivor's numbers as a guest.** 25 HP if `attnpc`'s numbers are in the level tables' order — INFERRED | whether he survives the fights he is brought into | his HP in a let's play's fight beside him, or his status screen in the emulator |

### 1b. Needs the emulator, or a video

Not code-shaped: each wants the game running. `docs/binaries.md` gives each of
these the shape to search the ARM9 and its overlays by, the witness that would
confirm a find, and what to do if the binaries do not give it up.

- **The inn's price.** No string in the binaries names an inn; no table looks
  like prices. `INN_PRICE` is a stand-in.
- ~~**The Hero's critical chance.**~~ **Settled 19 September 2026**, from the
  game's own `CalculateCritRate`: two in a hundred, plus a hundredth of a point
  for each point of deftness *past 150*, with an accessory's, a book's and a
  skill's bonus. The reference's 200 is this at any deftness to 150 and its
  500s are a bonus, not a level. `criticalChance` in the sim; the whole of it
  in `docs/conformance.md`.
- **The flee chance.** Ours is 50 in 100; the reference does not model it.
  **Looked for on 19 September and not found** — `docs/conformance.md` says
  where it is not. The words beside the weight tables, long the candidates,
  are heap sizes handed to `SafeAllocator::Allocate`.
- **How a monster weights its six ways**, and **which monsters draw by the
  third and fourth weight tables** — the four tables are read from the ARM9,
  and only the boss bit chooses between the first two.
- **How the game keeps time**, and **what ends the night of 2.2** — sleeping,
  or time. The decomp names five lengths at USA `0x020f030c`–`0x020f031c` to
  read first.
- **Which zone roams when and where**, and whether the mix changes at night.
- **Which treasure kind is the pot and which the barrel.** The ids are read —
  pots 5–7, barrels 8–10, overlay 17 `0x4AFCC` — and how a map object's kind
  chooses among them is still in code.
- **A party member's colour** on the top screen.
- **Whether Ivor's greeting plays as the Hero comes near**, or only on being
  talked to.
- **Whether the village's theme carries on into a house** or starts again, and
  what the church plays.
- **The monsters' drop chances.** Two item ids a monster are read (INFERRED);
  the table the drop-rate field indexes is not found, and **nothing awards a
  drop after a battle** — `spoils` pays experience and gold only.
- **The shops' selling price.** Ours is half, rounded down.
- **The Hero's starting purse.** 180 gold — seen in a let's play, not read.

---

## 2. Ours, and stand-ins

What a player meets that is not the game's. Each is marked in the code where it
lives; this is the gathered list.

| where | what is ours |
|---|---|
| battle numbers | **the Hero's attack and defence are strength and resilience plus what they wear** — the equipment's numbers are read, the adding is ours; the battle reference takes attack and defence as given |
| battle | the flee chance, 50 in 100; a monster attacking when its drawn Flee is refused; that the margin is weighed in battle at all, and that the party's level is the highest standing |
| defeat | the Hero comes round in the village church with half the gold gone — the game sends them to a church, which is not modelled; no text says where |
| shops, inn | the inn's price; selling at half, rounded down |
| items | Evacuazam to the region's outside; holy water's calm; the chimaera wing's one destination |
| time of day | 120 s to evening, 150 s to night, from the let's play; the zone kind by the time of day — 0 by day, 1 at dusk, 2 by night |
| chests | how far a lid goes back (110°), that it goes at the rate of the hands, and the text waiting for the motion. INFERRED: that the lid rises with the hands at all — no file animates one |
| the character | the person's scale against the buildings, set by eye — the buildings are measured, the ratio to them is not (`sim/src/character.ts`, `PERSON`); the step and snap heights, set by the movement |
| the look | the doorway fade's quarter-second; the text speeds; the sword and shield on the back; the dusk and night colours |
| the slice | the title card that closes it |

---

## 3. Read and not modelled

- **What dazzle does is read** (20 September, `docs/conformance.md`): a blow that
  sight spoils misses on five faces of a die of eight. Not yet modelled.
- **Dazzle, sand, and Weird Dance (MP drain)**, and `calls for backup`: read
  from the monsters' actions, landing as ordinary attacks.
- **The monsters' drops**: ids read, nothing awarded (§1b).
- **The field sprites' ids**: the pot, barrel and bubble numbering was found
  in overlay 17 (`0x4AFCC`) and no parser reads it yet; how a treasure's kind
  chooses among them is still in code, unread.
- **`.bmmp` tags** left over on the top screen's panel are constant, and the
  fuller panel in the sprite set is for a screen not seen.

---

## 4. By ear and by eye

Nothing to code until heard or seen. The tempo was the last of these to be
settled — heard as right at the tempo read, 17 September, with no factor.

- **The music's manners:** the effects' loudness against the music; a fade
  between tracks on a map change (`Music.fade` exists, unused); whether the
  village theme should restart indoors (ours: it carries on).
- **The scenes' feel:** the camera's pace over a `304`/`311` move (ours is
  even) and its field of view, 50° — both want a measurement against the let's
  play at 12 fps; opcode `223`, 14 calls, unread.
- **The scale and the light:** the character against the village, the dusk and
  night colours.

---

## 5. Code polish, none blocking

| where | what |
|---|---|
| `packages/audio`, `event.ts` | the menus' sounds — `728` (1,174 calls, small values) and `712` are the candidates, unread; `731`; the three `STRM` streams |
| `equip-screen.ts` | the layouts `lay_eq.lia`, `lay_iie.lia`, for the screen's exact places instead of the screenshots' |
| `daytime.ts`, `save.ts` | 2.2's field seconds are not saved, so a save mid-2.2 wakes to day |
| `main.ts` (`hungPieces`) | a face hung on the Hero by opcode `235` is not drawn — the Hero is the figure, not a scene model |
| `cast.ts` (`walkingFrame`) | sprites walking in scenes: not yet watched in the browser |
| `apps/explorer` | lone `NCGR`+`NCLR` tile sheets; `NSBTX` textures on their own; the sound streams; the scan in a Worker |
| the village | 17 to 20 of the 20 to 22 villagers at each stage have their line |

---

## 6. The repository itself

- **Nothing is checked automatically.** The gate is `pnpm typecheck && pnpm
  test && pnpm lint`, run by hand — 1,174 synthetic tests that pass without a
  cartridge, plus 171 that are skipped without one.
- **The package boundaries and the `nitro-*` rules** (no Node built-ins, no
  DOM, no title-specific anything) are therefore held by review alone.
- **A test can sit red without anyone noticing**, and one did: two assertions
  in `spells.test.ts` went in on 16 September and failed from that commit
  until 19 September. They were invisible to anyone without a cartridge,
  because the tests that need one are skipped. Running the gate before
  committing is the whole of the defence.

---

## 7. Out of the slice's scope

The plan's own list, which is a contract rather than a wishlist: the story on
from 2.5, the world beyond Angel Falls, character creation, vocations, alchemy,
grottoes, multiplayer, party recruitment. Equipment drawn on the Hero and Ivor
was brought into the slice on 15 September 2026 at the owner's word; nothing
else has been.
