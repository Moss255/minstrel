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
| ~~**Which level-table column is which.**~~ **Settled 22 September 2026**, by the published guide in `evidence/`: its Minstrel attribute table agrees with `level6` at all 72 values it gives, so columns 1 to 9 are as read; column 10 is **the skill points gained, all told**, agreeing with the guide's skill-point table at every level on all twelve vocations' files. Column 0, the experience, is still INFERRED | — | game-formats' FORMAT.md, "Level tables", "Confirmed by the guide" |
| ~~**Whether the Hero is a Minstrel.**~~ **Settled 22 September 2026**: the guide says the Hero "starts the main game as a minstrel", and `level6` is the Minstrel's table (above); its spell list agrees with the spell table's 6, spell for spell and level for level. `level0` agrees with the attribute table at 2 values of 72 | — | `hero.ts`; FORMAT.md, "The spell table" |
| **Whether monsters run from a party at the level we think.** `fld_mondata`'s values 1 and 2 are read as a monster's level and the margin the party must pass it by — INFERRED, with rank agreement of 0.84 against maximum HP and 0.88 against experience over 280 non-boss monsters | how often a fight ends in a monster fleeing, which at low level is most of them | level 5, fight slimes, count the escapes; Shift+L to 6 and count again — ours says they stop running at 6. A let's play would confirm. `docs/next.md`, "Monsters run from a strong party" |
| **Whether the damage formula holds up the curve.** It is translated from DQIX/BattleEmulator and held to golden values, and checked against the let's play at low level only | every blow struck and taken | fights at levels 5, 20 and 50 against any video's damage numbers. `packages/sim/src/battle` |
| **How experience is shared among a party.** The result strings name up to four members each with an amount, so the game pays per member; the split itself is not on the cartridge. The guide says only that "lower-level characters suffer an experience penalty while leveling with a higher-level party" | Ivor's level, and the party's pace through the slice | `?ivor=1`, win a fight, read both amounts: they should sit in the ratio of the levels and sum to the monsters' total |
| **Ivor's numbers as a guest.** 25 HP if `attnpc`'s numbers are in the level tables' order — INFERRED | whether he survives the fights he is brought into | his HP in a let's play's fight beside him, or his status screen in the emulator |

### 1b. Needs the emulator, or a video

Not code-shaped: each wants the game running. `docs/binaries.md` gives each of
these the shape to search the ARM9 and its overlays by, the witness that would
confirm a find, and what to do if the binaries do not give it up.

- **Whether a monster's HP varies from battle to battle.** The game's code
  draws it at 0.8 to 1.0 of the table's as the battle is built
  (`func_02089630`), unless a flag says not. **Modelled since 20 September**
  for a battle that can be fled; what would still be worth seeing is the flag —
  that a boss's HP does not vary. **The witness**: the same monster in two battles falling to
  different totals of damage — a slime's 8 would be 6 to 8.
- ~~**Whether a defended blow that comes to nothing can still deal 1.**~~ The
  question is **gone as it stood — 22 September 2026**: the bit that halves was
  read as defending and is **maximum tension**, set by the psyche-up ladder and
  by nothing else in the ROM (`docs/conformance.md`, "It was not defending").
  So the game's halving is not a defence, and no witness settles our defending
  by watching it. **What is open now**: what the Defend command does at all —
  the status word has no one-turn flag, so it lives in the command's own
  handler or in the action data, neither located. Ours is the reference's half,
  and the 0-or-1 coin before it.
- **The inn's price.** No string in the binaries names an inn; no table looks
  like prices. `INN_PRICE` is a stand-in. Every line that names a price is
  **Ivor's**, at "Ivor's Inn", and the inn opens only from 2.7, past the slice.
- **Erinn's rest, free — seen, and not reached.** The guide says that in the
  slice, "talk to Erinn, who'll let you get some rest. This restores HP and MP
  without cost" (p. 59). Her talk file `098` has the offer — "Do you want to
  call it a day?" — as labels 194 by day and 197 by night at 2.2 and 193 at
  2.4, and the records that choose 194 and 197 go on to **event 2360**. They
  need flag 0 set and, for 194, mark 4 (`17:0 4:0 2:4`; `17:1 4:0` for 197 —
  op 17 not established, INFERRED day and night). Talked to with no flags,
  Erinn gives her ordinary lines at every stage. Not traced: whether flag 0
  and mark 4 are set in play by 2.2, and whether event 2360 restores anything
  — no opcode in our event player restores HP. Until it is, herbs and Heal
  aside, nothing in the slice restores the Hero whole but losing a battle.
- ~~**The Hero's critical chance.**~~ **Settled 19 September 2026**, from the
  game's own `CalculateCritRate`: two in a hundred, plus a hundredth of a point
  for each point of deftness *past 150*, with an accessory's, a book's and a
  skill's bonus. The reference's 200 is this at any deftness to 150 and its
  500s are a bonus, not a level. `criticalChance` in the sim; the whole of it
  in `docs/conformance.md`.
- ~~**The flee chance.**~~ **Found 22 September 2026**, after a search on 19
  September had failed: it is `func_ov000_0215f7a8`, in overlay 0, and the
  party's Flee never becomes an action at all — the command short-circuits in
  overlay 26. A flight is certain where the party surprised the monsters,
  where nothing is left that can act, or where three times the monsters' mean
  attack-and-defence is not above the party's; otherwise the chance climbs
  with each attempt in the battle — a quarter, a half, three quarters, then
  certainty — and the draw comes from the world's generator, not the battle's.
  Modelled; `docs/conformance.md` has the row. The ten-bit field its own term
  reads is deftness — the same one the critical roll reads.
- ~~**How a monster weights its six ways**~~ **Read 22 September 2026**: the
  record's `+0x10` bits 5–7 choose among eight ways, four of which draw by one
  of the four tables (`MonsterBattle.aiType`), and the boss bit — which this
  repository had chosen by — does not come into it. **Still ours**: the other
  four ways, a round robin and the rest, fall back to the even table; 34 of
  the 438 monsters use them, the hammerhood among the slice's.
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
- ~~**The monsters' drop chances.**~~ **Settled 22 September 2026**, and
  **modelled**: the chances are the game's own table at `0x021fd888` in
  overlay 23, which its drop roll indexes by the bytes at `+0x02` (the
  ordinary drop's) and `+0x03` (the rare's) — 0 always, 1 to 6 one in
  `2^(step+2)`, 7 never. A won battle now pays what it drops; the roll is
  `dropsWon`, and `docs/conformance.md` has the row. What is **ours**: the
  seed of the C library generator the game rolls these from, and the order the
  kinds of monster are rolled in. Not modelled: the four further passes, one a
  standing party member, that the series' item-finding abilities scale — the
  slice has none.
- ~~**The shops' selling price.**~~ **Settled 22 September 2026**: it is the
  item's own, the word at `+0x06` — not half what a shop asks. The copper sword
  sells for 15, not 75. `+0x08` is what a shop asks, and the bamboo lance's and
  the halberd's, read before at twice the word, are their prices themselves.
  FORMAT.md, "Items", "The price". Whether a shop's rate touches the selling
  price is not established.
- **The Hero's starting purse.** 180 gold — seen in a let's play, not read.

---

## 2. Ours, and stand-ins

What a player meets that is not the game's. Each is marked in the code where it
lives; this is the gathered list.

| where | what is ours |
|---|---|
| drops | the seed of the generator a drop is rolled from, and the order the kinds of monster are rolled in — the roll itself and its table are the game's |
| battle numbers | **the Hero's attack and defence are strength and resilience plus what they wear** — the equipment's numbers are read, the adding is ours; the battle reference takes attack and defence as given |
| battle | the four ways of choosing that are not weight tables — a round robin, a pair and a coin, two passes — which fall back to the even table; a monster attacking when its drawn Flee is refused; that the margin is weighed in battle at all, and that the party's level is the highest standing |
| defeat | the Hero comes round in the village church — the game sends them to a church, which is not modelled; no text says where. **Half the gold going is the game's**: the guide, "Money on hand is halved when your characters die"; rounding down is ours |
| shops, inn | the inn's price |
| items | Evacuazam to the region's outside; holy water's calm; the chimaera wing's one destination |
| time of day | 120 s to evening, 150 s to night, from the let's play; the zone kind by the time of day — 0 by day, 1 at dusk, 2 by night |
| chests | how far a lid goes back (110°), that it goes at the rate of the hands, and the text waiting for the motion. INFERRED: that the lid rises with the hands at all — no file animates one |
| the character | the person's scale against the buildings, set by eye — the buildings are measured, the ratio to them is not (`sim/src/character.ts`, `PERSON`); the step and snap heights, set by the movement |
| the look | the doorway fade's quarter-second; the text speeds; the sword and shield on the back; the dusk and night colours |
| the slice | the title card that closes it |

---

## 3. Read and not modelled

- **The wards, and the two statuses that shift a resistance** — a quarter off
  fire or ice for five turns, a half against one family of monsters for four,
  and a flat 25 either way on everything but a plain blow. Read 22 September
  (`docs/conformance.md`); no spell of the slice's casts one.
- **What dazzle does is read** (20 September, `docs/conformance.md`): a blow that
  sight spoils misses on five faces of a die of eight. Not yet modelled.
- **Dazzle, sand, and Weird Dance (MP drain)**, and `calls for backup`: read
  from the monsters' actions, landing as ordinary attacks.
- **Erinn's rest**: the offer and the event it leads to are read, and not
  reached in play (§1b).
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
