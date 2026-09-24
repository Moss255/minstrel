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

- **`<TURN=n>`'s absolute angle** (24 September, `docs/event-scripts.md` §7a).
  The rest of the turn family is now done — `turnSpeaker` in `main.ts` turns
  the speaker through `castPlaced`, and `talk-coverage.test.ts` pins the
  measure: of 1,116 spoken lines, **780 face the player, 198 stay put and 138
  turn back**. `<TURN=n>` is handled with them, but the cartridge's dialogue
  never uses it, so **nothing exercises it** and the reading that its argument
  is fx32 radians is untested against anything.
- **`<R_TURN>` waits and `<END_R_TURN>` does not** — the game makes the
  message box hold until the rotation finishes in the first case. **Ours**:
  this turns instantly, so the two are indistinguishable. Rotating over time
  is the thing that would make the difference visible, and nothing here
  animates a cast member's facing at all.
- **What restores a speaker whose last message asks for no turn** has not been
  read. **Ours**: `closeTalk` puts them back. Leaving them turned would have a
  town slowly rotating to face wherever the Hero last stood, which is worse
  than either answer, but it is a choice and not a reading.
- **The quest banner** (24 September). `<QUEST=n>` binds a quest to the box and
  `<QUEST_HAN>` / `<QUEST_FAILED>` / `</QUEST>` / `<QUEST_SE>` open, close and
  commit a banner over it. All five are read onto `Run.quest`; none is drawn,
  and what the banner looks like has not been read either — only the request
  bits that ask for it.
- **`<ALL_RECOVER=a,b,c>`** (24 September): a gameplay action written where a
  line of dialogue would go — one event's entire message is that single tag.
  It is carried on `Run.restore` and does nothing. **What its two flags select
  is not established**, so they are named `flagA` and `flagB` rather than
  guessed at.
- **`<ADD>`'s continuation** (24 September): the game leaves the window
  standing so the next message is drawn *into* it, continuing mid-line if the
  text says so. `Run.continues` records it; this host starts the next message
  on a fresh page. 1,724 uses, so if any of this shows, it is this.
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
- **Whether `532`'s field of view is a half-angle or the whole field** —
  unsettled, and the two differ by a factor of two. The first reading called
  it a half-angle because the projection puts `cot` in the matrix slot that
  holds `cot(fov / 2)`; reading `580` showed that slot actually takes
  `cot × aspect`, which weakens that. Against the half-angle: the engine's own
  default is **60**, and the field camera here was tuned by eye to 50 — close
  to 60 read whole, nowhere near the 120 the half-angle reading would give.
  Left as it was, because that is what the scenes were watched with. Settling
  it wants the game in front of you (§1b), not more arithmetic.
- **The bottom screen's own brightness** — `105` and `120` fade it apart from
  the top, and this engine draws one screen, so the level is kept and nothing
  shows it (`docs/event-scripts.md` §5e).
- **What a scene places on the map** — `573` takes a placed `.spr` away and
  `574` shows or hides a placed thing, but `521`, which builds them, is not
  implemented, and nothing draws map placements yet. Both are kept, as `540`'s
  doors are.
- **The scripted battle**, `547`: read, including the `eventbattle.bin` record
  that picks the battle and its music, and kept — no battle begins from a scene
  yet.
- **The game's story flags**, which `603` reads: this engine keeps none, so a
  scene that asks finds them clear.
- **Engine functions `4`, `5` and `6`** — one and two numbers of maths,
  answered as floats. The shapes say sine, cosine and arc tangent, and that is
  as far as it goes: a wrong guess would put a wrong number into a scene's own
  arithmetic, so they are counted rather than answered
  (`docs/event-scripts.md` §5j).
- **The DS's buttons**, which `0`, `1` and `2` report. This engine's keys are
  not mapped onto the hardware's bits — doing so is a control-scheme decision,
  not a reading — so the three answer from fields the caller fills, and a scene
  that waits for a press waits. One scene on the cartridge does exactly that.
- **196 of the cartridge's 669 maps have no collision**, so the engine has
  nowhere to stand the Hero. Swept with `apps/game/test/maps.test.ts` on 24
  September 2026, which runs the game's own loader over every one. **None of
  them is a place a player is kept out of**, and it took two goes to be able
  to say that.

  - **174 are the whole `B` family** — region `"None"`, no doorway, no cast,
    no trigger. Pieces rather than places; grottoes are assembled at runtime
    and not built here. Nothing to do.
  - **`M12`, Wormwood Creek, was the one real fault**, and it is fixed — which
    is what took the count from 197 to 196. Its archive holds **two**
    descriptors, `M12M0000.bmdj` with 24 resources and `M12M0001.bmdj` with
    one, and the loader kept whichever it saw last because they were keyed by
    archive. It now keeps the one that describes the map. Six of the 1,348
    archives hold more than one and `M12` is the only one where it mattered.
  - **The other 22 are not places either**, though the first reading said
    twelve of them were. That reading asked whether a map had triggers,
    doorways or a named region — and **three of those are properties of the
    *area*, not the map**. Every map in Wormwood Creek reports the area's 139
    triggers; `F34M01` reports the same two exits `F34` does, and its archive
    holds no collision file at all because `F34`'s holds 66 KB of it for the
    whole field.

    **What a map cannot inherit is something leading to it.** `M12` has eight
    doorways into it, `C02` nine, `M01` nine — and **nothing on the cartridge
    leads to any of the 196**. 237 of all 669 maps have nothing leading to
    them, which is what a cartridge full of assembled pieces looks like.

  So the sweep now asserts the thing worth asserting: **every map a doorway
  opens onto has somewhere to stand**. Whether any individual one of the 196
  is the reader or the cartridge is still not established — the sweep says
  what the loader makes of a map, not what the map is — but none of them is
  reachable and none has a cast.
- **One doorway on the cartridge names a map that is not there**: `M07` has a
  door to `M07M07`, for which there is no archive. Walking into it is refused
  and leaves the player where they were — `enter` keeps the map it has when a
  new one will not read — so it is a dead door rather than a crash. Whether the
  game has the same dead door or the reader is missing an archive is open.
- **The four props `809` shows and hides** — two of four `Object3D` slots
  filled from four file ids in a record whose owner was not chased, so what
  they are is open.
- **`806`, a grotto's request flag**: read, and **out of Slice 1's scope**, so
  it is answered and nothing is done.
- **`591`'s zone bit**: set when its number is 0 and cleared otherwise, and —
  like `559`'s byte — **no reader was found anywhere in the cartridge**. Six
  write sites, none reading.
- **What the three models `599` and `805` draw are.** Both passes are walked
  structurally — a count, a list of `0x24`-byte placements, two angles apiece —
  but no filename was reached.
- **`583`'s values.** Fifteen places read the byte as a yes-or-no gate on
  entering a map; one tells 4, 8 and `0x0c` apart. What those mean is open.
- **`559`'s byte**: written by the script and by a map transition, and **read
  by nothing in the cartridge**. Kept so as to record that, not because it does
  anything (`docs/event-scripts.md` §5i).
- **What a character holds**, `550` and `556`: read in full, including the
  twelve-row weapon-mount table in `data/bin/wpnpos.bin` and its two placements
  a row. This engine draws the Hero's and Ivor's equipment from the wearer's
  own record rather than from six object slots, so a scene's word about it is
  kept against the character rather than acted on. Whether `556`'s second
  number is stowed-versus-drawn is INFERRED — the two halves of a row are built
  the same and nothing names them.
- **A message's choices**, which `558` answers: no choice window is drawn, so
  the answer is always the first option unless the caller sets it.
- **The caption**, `409` to `414`: read in full, and kept rather than drawn —
  this engine draws a message one way. The reading is in
  `docs/event-scripts.md` §5f, so drawing it is work, not research.
- **The bone-driven camera**, `572` and `531`: read in full. This engine has
  the models and their poses but no way yet to hand a bone to the camera, so
  what a scene asked for is kept.
- **What a scene suppresses**, `568` and `512`: the masks are gathered and
  nothing is suppressed, because this engine has none of the subsystems the
  five readable bits gate. **Bits 6 to 26 of `568`'s field have no reader in
  the cartridge at all.**
- **Whether a jingle is still sounding**, `725`, and **whether a wireless
  session is up**, `801`: both answered no, which lets a scene waiting on
  either carry on. Multiplayer is not built here, and stays out.

---

## 4. By ear and by eye

Nothing to code until heard or seen. The tempo was the last of these to be
settled — heard as right at the tempo read, 17 September, with no factor.

- **The music's manners:** the effects' loudness against the music; a fade
  between tracks on a map change (`Music.fade` exists, unused); whether the
  village theme should restart indoors (ours: it carries on).
- **The scenes' feel:** the camera's pace over a `304`/`311` move (ours is
  even); opcode `223`, 14 calls, unread. **A scene's field of view is no
  longer ours** — read 23 September from `Camera_SetFov`: engine function
  `532` hands it the half-angle in degrees, so the 15 that 1,668 of its 2,477
  calls pass is a vertical field of 30°. The **field** camera's 50° is still
  by eye: what sets that one has not been read.
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
