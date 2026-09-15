# Where to pick up

Written 10 September 2026 against `2c8fd7f`, and revised the same day: items 1
and 2 are done, item 3 has been measured further and the question has moved, and
the doorway cost is gone. The evidence behind each is in
`packages/game-formats/FORMAT.md`; this is the short version and what to do next.

Ordered by what is blocking the milestone, not by how interesting it is.

---

## What is still open — 15 September, at `edde26c`

This replaces the list of 14 September. The list of 13 September further down
is kept for its questions to the emulator. Each gap's evidence is in the
section it names.

**Where the milestones stand.** M0–M2 are done. M3 plays the opening as far as
Ivor's call outside Erinn's house, moved on by the trigger records. M4 is as
far as the cartridge goes: equipment's numbers wait on the emulator. M5 has
battles, spells, changes of state, monsters acting and a party of up to four.
M6 has monsters roaming the field, the poison marsh, Ivor following and the
party on the top screen. **Equipment's attack and defence are found** (15
September): the table after each equipment category's records
(game-formats' FORMAT.md, "The stats"), read but not yet wired into battle or
the equipment screen. M7 and M8 have not started, and audio — which the plan
wanted begun alongside M5 — has not either.

**Against the definition of done:**

| | | |
|---|---|---|
| 1 | the ROM's hash checked, its assets converted and cached | no — M8 |
| 2 | wake in Erinn's house and explore all of Angel Falls | yes |
| 3 | NPCs, shops, the inn and the save point work | mostly: 17 to 20 of the 20 to 22 villagers at each stage have their line |
| 4 | fight, level up, buy and equip gear | yes, but equipment changes no number |
| 5 | cross the pass, clear the Hexagon, beat Hexagoon, rescue Patty | no — M7 |
| 6 | the monitor's resolution, widescreen, remappable input | resolution and widescreen yes; remapping no |

**Closable here, from the code and the cartridge:**

| gap | milestone | what it needs |
|---|---|---|
| Equipment's numbers in the game | M4, M5 | **Read and in use** (15 September): each piece's own attack or defence on the equipment screen and in the menu, and a fighter's attack and defence with what their equipment adds — the Hero's and Ivor's. The adding — strength plus equipment, resilience plus equipment — is **ours**: the battle reference takes attack and defence as given. A status screen in the emulator would check it. The rest of each entry is read too (deftness, agility, magical might, evasion, critical, a weapon's kind, who may wear a piece); **agility is in use** — a fighter's agility with what they wear, which orders a round — and the rest not yet. Left: which "Used by" bit is which vocation; word 0's resistances; words 1 and 2; charm, max HP and max MP, not found as numbers. |
| Which zone applies where | M6 | Measured, not settled (game-formats' FORMAT.md, "Encounters"). A zone's kind is read: 0 and 1 a pair on fields, the same monsters on other weights; 2 every dungeon's, and a field's others. Nothing read so far says which applies when, and the places tried — the ground's attribute word, the night pieces, the map's own tables — are ruled out. Wants the emulator; see below. |
| The opening, past Ivor's call | M3, M7 | When an event starts — on coming near, on entering a map (value 5 = 3) — and the rest of the triggers' words: the second set of flags (`102`, `2`, `3`: 145 of 566), operations 17, 141, 197 and 205. Then 2.2 step 2 onwards to the pass. The largest job left, and on the critical path. |
| When Ivor joins and leaves | M6 | Ours, by stage, so he follows at 2.2 before he has asked. Flag 0, which his call sets, is a candidate. |
| What Ivor does in a fight, and how he follows | M5, M6 | How the game chooses for him; his footsteps are ours. |
| Monsters that flee a strong party | M6 | `fld_mondata`'s first two numbers. |
| The poison marsh's toll | M6 | Where it is, is read; 1 HP a half second is ours. |
| What battles still lack | M5 | Abilities; the changes of state the reference does not model (Dazzle, sand in the eyes, the dances); Hexagoon beyond its six ways. |
| The equipment screen's layouts and the rest of it | M4 | A reader for `lay_eq.lia` and `lay_iie.lia` (LI5); moving round the grid, L/R between tabs, Change Character, sorting; the name plate's colour for each character; a string for "Nothing Equipped". |
| Item art not found | M4 | 193 of the 1,178 items have no icon by the rule; the English vocation icons for "Used by"; what the white and gold stars mean. |
| ~~`itemsort`'s `unknown_1` and `unknown_2`~~ | M4 | **Read, 15 September**: the bag's order by category, and alphabetical order by English name — neither a stat (game-formats' FORMAT.md, "Item kinds"). |
| M4's stand-ins | M4 | `STARTING_GOLD` and `INN_PRICE`; the chimaera wing's destination; Evac and holy water. |
| The game's Latin fonts | M3 | **Found and read, 15 September**: `/data/pack_lv5/fd_me.bin` and `fd_s7.bin` are one-bit strips of the Latin glyphs, 12 pixels tall, and `fi_me.bin` and `fi_s7.bin` index them — each glyph's name, width and place, a flag for a small letter with a capital, and kerning (game-formats' FORMAT.md, "The Latin fonts"; `readLatinFont`). The party's names are set in `fd_s7` on the top screen — the face and the pixel between glyphs ours. Left: which face the game uses where, the space between glyphs, and a space's width. The text box stays in a vector font, as the slice plan's M3 has it, unless that is decided otherwise. |
| The top screen's rest | M6 | The party panel's HP, MP and level, with its own digits; `obj_mm.pac`'s narrower cuts of it; the town's name tab; `.bmmp` tags `0x65`, `0x67`, `0x68` and `0x6d`; the `z` tile sets. |
| 2D format unknowns | — | `.bnsc` `+0x0A`; `.bncl` `+0x04`; `.bncg` `0x7C00` beyond its low bit; which `CHAR` a screen uses when a pack has two; NCER's cell attribute, LBAL/TXEU and `CEBK` `+0x10`; affine parts drawn without rotation. |
| The explorer's 2D previews | explorer | NCLR, NCGR, NCER and `.bncg`/`.bnsc` are read but not shown. |
| Audio | M8 | Not started, and late by the plan's own reckoning. |
| The rest of M8 | M8 | Settings — resolution, the two-screen layout, input remapping, text speed; the ROM's hash and caching; README, licence and contribution guide. |

**Needs the emulator — questions to bring to it:**

- **Equipment's numbers — a check, now they are read**: the shop's or the
  equipment screen's attack for a copper sword should be 7, and a leather
  shield's defence 3 (game-formats' FORMAT.md, "The stats"). **Rarity and
  "Used by"** are still not found. Open the equipment screen on the Flame shield (defence 18, rarity 1),
  search RAM for its id, `8E 53`, and look for 18 and 1 near it; send the
  address and the bytes round it. The copper sword's attack would check the
  weapons.
- **A party member's colour**: how the game picks the colour of each one's
  name strip and dot — in the capture of Stornway's church they are the
  characters' own, and none is one of the panel's four. Also where a room's
  dots sit on its area's picture, and how a large picture scrolls.
- **Ivor's numbers**: in a battle beside him, his HP — 25 if `attnpc`'s
  numbers are in the level tables' order.
- **How a monster chooses**: the weights for its six ways (an even table stands
  in); the critical chance; fleeing's chance.
- **The Hero's vocation, and a level-1 status screen**, to settle which
  level-table columns are which.
- **Which treasure kind is the pot** and which the barrel.
- **The inn's price and the starting gold**, if they are not found in code.
- **Whether Ivor's greeting plays as the Hero comes near** or only when he is
  talked to.
- **Which zone roams when and where.** In Angel Falls Region at the slice's
  point in the story: whether bodkin archers and batterflies (its kind-2 zone)
  roam at all, and if so where or when; and whether the mix changes at night
  — its kind 1 has sacksquatches ahead of slimes, its kind 0 slimes first.

**Taken on the tester's word, not read:** the Hero starts with a copper sword
on (`STARTING_EQUIPMENT`).

**Wanted after Slice 1:** weapons on the Hero, the `p_w<nnn>.nsbmd` models in
`chara_pc.gp2`, with how they attach not known.

**Deferred by the plan:** WebGPU (WebGL2 is enough), the DS toon and edge
pipeline outside reference mode, settings, and the ROM hash check and caching
(M8).

**Where to start next time:** the opening past Ivor's call, the largest job
left on the critical path, with audio alongside it; the zones once the
emulator has answered.

---

## Equipment's numbers are found — 15 September

**Where they are** (game-formats' FORMAT.md, "Items", "The stats";
`readItemStats`): each equipment table — weapons, shields, headgear, armour,
gloves, legwear, footwear, accessories — goes on past its records into a second
table, a 32-byte entry an item, from 32 × N, then 100 bytes, then the items'
names, which label the entries in order. **Word 5 holds attack in bits 0–9 and
defence in bits 10–19.** The same in all five languages.

**How it was found**, since every search before missed it: not by a value to
look for — the one in `evidence/` is a character's total, and the "published"
shield values had no source — but by what attack would do, rise with the
price. Scored within each kind of weapon (a sword against a sword), and with
the entries in the bag's order rather than the records', one field stands out
at 0.62 where the next best anywhere in the data or the code is 0.44. Laid out,
it climbs sword by sword — copper sword 7, soldier's sword 13, rapier 19 … —
and its exceptions are the weapons whose worth is not their edge, the poison
needle 1, the falcon blade 12. Defence was the next field up, climbing on every
kind of armour; the Flame shield's is 18, the figure these notes quoted for it.

**INFERRED**: that the two fields are attack and defence, and ten bits wide —
what they do, not what the code says. **Read, and corrected on the way**: an
item record's `u16` at `+0x10` is the offset of the *next* record's item's name;
the Spanish armour's names are fewer than its items, three pairs sharing one.

**The rest of each entry, read the same day** by what the items' own
descriptions say they do: words 5, 6 and 7 are three 10-bit fields each — word
7's deftness, agility and magical might, word 6's second and third evasion and
the chance of a critical hit; word 3 gives a weapon's kind, exactly
`itemsort`'s; and word 4 who may wear a piece, a bit a vocation, `0xfff` on
every accessory. All INFERRED, each with its witnesses (FORMAT.md, "The
stats"). Not found as numbers: charm, max HP and max MP, and the medals' own
effects. **Put to use the same day**: the equipment screen and the menu show each
piece's number, and the Hero and Ivor fight with strength and resilience plus
what they wear. That adding is **ours** — the battle reference
([DQIX/BattleEmulator](https://github.com/DQIX/BattleEmulator)) takes attack and
defence as given, its setups naming them (`lv16_sp22_tamahagane_atk123_def86`),
so it has no rule to cite. A check in the emulator would settle both: a copper
sword's attack should be 7, and the Hero's attack on the status screen should
rise by it when it is put on.

---

## The party on the top screen — 15 September

**From the cartridge** (game-formats' FORMAT.md, "The markers are coloured
dots"): each member's name strip along the top screen's foot — the party
panel, `obj_minimap`'s cell 2, cut to its top sixteen rows, in one of its four
colours — and each one's dot, `marker0` to `marker3`. What it follows is the
capture in `evidence/in-town.png` (not committed): a party of four in
Stornway's church, four strips across the foot and four dots on the church,
two by two.

**Ours:**

- Colour by place in the party: the Hero blue, Ivor green. In the capture each
  character has a colour of their own, and none is one of these; the rule is
  not found.
- The names' face: `fd_s7`, the plainer of the game's two Latin fonts
  (15 September), chosen by how the names look in the capture, and set a pixel
  apart. A name with a space in it falls back to the browser's letters, since
  a space's width is not read.
- Fewer than four strips start from the left; one dot alone on a room's mark.
- Ivor has no strip or dot while he waits in the house at 2.2, as he does not
  follow then.

**Left:** the rest of the panel — HP, MP and the level, with the file's own
digits — which the capture does not show; `obj_mm.pac`'s narrower cuts of it,
perhaps it sliding up; and the town's name in a tab at the map's top right.

---

## The story moves on — 15 September

**What is read** (`game-formats/FORMAT.md`, "Triggers", "The words" —
INFERRED throughout, each reading with its measure): an event's own trigger
record says what follows it — the stage and step the story moves to (`132`),
the flags it sets (`104`), and the map and event it goes on to (`133`) — and
the records that choose a character's talk and events test those flags (`4`
set, `5` not). `story.ts` in `@minstrel/game-formats`.

**What the game does with it** (`followEvent` in `main.ts`): when an event
ends, its record moves the story on, sets its flags and goes where it says.
The cast is placed afresh when the stage moves; a record's label or event is
taken only while its flags hold. The step and flags are kept in the save, as
fields an older save reads without.

**The opening plays through.** The morning ends at 2.2, step 1; at 2.2 Ivor
waits downstairs in Erinn's house, `M01M07`; talked to, he plays `ev02200`,
which goes on to the village and `ev02210`, his call on her doorstep; after
it the story is at 2.2, step 2, with flag 0. Walked through in the browser
with `tools/shot/screenshot.mjs --trace`, which prints the map, position and
status after every step.

**Ours:**

- No doorway is taken while an event plays, and after one the door waits
  until the Hero steps clear. `ev02210` stands them on the doorstep, and the
  door took them back inside with the event still playing.
- A companion the map has standing in it is not also drawn following: Ivor
  waits in the house at 2.2 while the stage rule has him along. The link is
  the model — `attnpc`'s 17 is the cast's `s017`.
- The flags are cleared when the stage moves on.

**Found playing it, and fixed:**

- **Doors open for whoever an event walks**, not the Hero alone: Erinn now
  swings her room's door on the morning. The swing itself is still ours
  (`swing.ts`); who it answers to is anyone the event has put somewhere.
- **Function 221 turns one character to face another** — INFERRED, 17 of 22
  (`docs/event-scripts.md`). Ivor turns back to the Hero at the side of the
  house; the morning's Erinn turns to the bed.
- **The Hero starts with a copper sword on** (`STARTING_EQUIPMENT` in
  `hero.ts`): **the tester's word**, not read — nothing found on the cartridge
  lists a new game's kit. It changes no number, since no item's attack is
  found, and is not drawn, as no equipment is in the slice.

**Open:**

- Whether a character's event plays when the Hero comes near. Ivor's greeting
  plays on being talked to.
- When Ivor joins is still ours, by stage, so outside at 2.2, step 1, he
  follows before he has asked. Flag 0, which his call sets, would say when;
  what it means is not established.
- The second set of flags (`102`, `2`, `3`: 145 of 566), and operations 17,
  141, 197 and 205.

---

## The Hexagon's poison marsh — 14 September

**Where it is, read:** the texture tag `dok` — *doku*, poison, INFERRED — on
the Hexagon's own map, `D01`: three purple patches beside the path up to the
hexagon — two flat layers of 13 and 31 triangles just at the ground — which
the collision lets the Hero stand on
(`game-formats/FORMAT.md`, "Poison marsh"). Six textures on the whole
cartridge carry the tag. `@minstrel/world` keeps each marsh triangle by
triangle, not as a box, as water is, because a box would poison most of the
map.

**What it does, ours** (`apps/game/src/marsh.ts`): 1 HP from the Hero, and
from Ivor while he goes along, for every half second walked in it — counted
in the Hero's own moving ticks, so standing still costs nothing — and never
the last HP. The status line says so. The game's rule is in its code.

---

## Ivor is found — 14 September

**He is an attending character.** `/data/bin/attnpc.gp2` holds the five people
who go along with the Hero for a stretch — Aquila, Ivor, Dr Phlegming,
Sterling and Erinn — each with a model, a level, numbers and what they carry
(`game-formats/FORMAT.md`, "Attending characters"; `readAttendingCharacters`).
Ivor is model `s017`, level 3, 25 HP and no MP, with a copper sword and a pot
lid; the level and the order of his numbers are INFERRED.

**Everything to draw him is on the cartridge**: `s017.chr`, walking, running
and standing on a 12-bone rig, three faces for his head, and battle packs of
his own — `s017b` (damage, death, guard, item, a dodge …) and `s017be` (two
attacks).

**He goes along over story stage 2.2 and is back at 2.3**, by the triggers of
his events: the village and its houses, then map 5101 — `S01M01`, whose
doorways join `F01` to `F02` — where the landslide is. So **`S01M01` is the
mountain pass**, INFERRED. From `ev02220` on, his events treat him as the
party's, `566(10, 1)`.

**Not found: how he joins and leaves.** No script on the way writes a
game-wide variable or hands anything his number or his model's. For the
slice, stage 2.2 until his return at 2.3 says when he is there — ours until
the rule is found.

**The party of two fights (M5).** Over stages 2.2 and 2.3 — or with
`?ivor=1` at any stage — Ivor stands beside the Hero in battle in his own
model, with his own numbers, and swings, flinches and falls in his own
motions (`s017be`'s `attack1a`, `s017b`'s `damage` and `death`); the battle is
lost only when both have fallen, and a heal for one asks whom. The battle
already took a party: nothing in `@minstrel/sim` changed. `companion.ts` holds
the rest.

**Ours, each said so in the code:** when he goes along (2.2 and 2.3); what he
does — an attack on the first monster standing, the battle's default for a
party member with no command, where the game's choice is not read; his attack
and defence, strength and resilience as the Hero's stand in; where he stands,
at the Hero's right; which of his motions plays for what; his wounds carrying
from battle to battle, 1 HP after falling and whole after a loss or a night at
the inn. His face is his model's own: its head, shape 0, carries `s017_00`
(32×64). The three `s017f01`–`03` that the event introducing him hangs from
his head have textures of the same size named after it, `s017_00_f01` …,
which reads as expressions, INFERRED; they are not drawn.

**He follows the Hero in the field (M6).** Over the same span, Ivor walks a
pace behind the Hero on their own footsteps, in his own `walk` and `stand`
from `s017.chr`, with a shadow, and stops when they stop. The Hero's place
goes into a trail on every tick they move (`follow.ts` in `@minstrel/sim`,
whole `fx32` words, nothing allocated once made), and Ivor stands where they
were 20 moving ticks before — so he only steps where they stepped, never into
a wall they went round, and keeps the same gap at any frame rate.

**Ours, each said so in the code:** all of how he follows — the trail, the
gap of 20 ticks (a third of a second, one of the Hero's heights), his walk kept
in step with theirs; coming in on the Hero at a doorway and staying unseen
until they walk off him; hidden in battles and events, which stand him
themselves.

**A party of up to four.** Nothing in the game is Ivor's alone but his rule
for when he goes along (`companion.ts`). The party is the Hero and up to three
more — the game's four, not read from its data here — and whoever goes along
takes the next place: in battle, to the Hero's right, then left, then behind;
in the field, each a pace further back on the Hero's footsteps; with their own
HP kept between battles, the inn restoring and the marsh taking from all of
them. The places, and filling them in `attnpc`'s order, are ours.

---

## The Hero is dressed — 14 September

The Hero is no longer the first part of each kind by name. They wear the
**celestial suit, celestial stockings and celestial shoes** — `p_b007` and
`p_p215` on the rig, the suit's own arms (`p_a007`) and the shoes (`p_r120`)
as textures — with face `p_f006` and a stand-in hair. `hero.ts` holds it,
`dressFigure` in `@minstrel/actor` builds it.

**What made it possible — read, `game-formats/FORMAT.md`, "Character parts"
and "Character presets":**

- A worn part is named by its item's id, as the icon is: 13007 is `p_b007`.
  `p_s` is shields, not shoes as §7's source had it; footwear is `p_r`.
- Arms, gloves, footwear and hair colours are not models but texture files,
  each holding one texture named alike across the files of its kind —
  `p_a000_00` in 254 of the 255 arms and gloves. So the catalogue's first-found-wins
  gave every figure the arms and shoes of whichever file was walked first. A
  figure now carries its own (`Figure.textures`), which `textureFor` asks
  first.
- `charapreset.bin` is the game's character presets, one to each vocation and
  sex, with what each wears; `presetdt_<lang>.bin` has eight more named
  characters and Aquila, Erinn, Patty and Sellma. **The Minstrel's outfit is there**:
  flamenco shirt, loud trousers, acroboots and feather headband for a man;
  dancer's dress, starlet sandals and circlet for a woman.

**Ours, each said so in `hero.ts`:** the outfit — the user's choice for the
slice, by the items' own words ("well-suited to apprenticing Celestrians");
nothing on the cartridge puts it on the Hero, and the three ids are listed
together nowhere — no headgear, a man's face, and the hair, style 00 variant
`a` colour 0.

**`chara_pd.gp2` is the same wardrobe, larger** — every `d_` part numbered as
its `p_` one, arms, gloves and footwear as models there — on a 21-bone rig
with only standing poses, `md02xx` in man's and woman's pairs. The walk and the
Hero's own event motions drive 14 bones, so the field figure is `chara_pc`'s;
`chara_pd` is most likely the equipment screen's figure, INFERRED.

**Not a gap: the hair.** The player chooses it at character creation, which
the slice leaves out, so the Hero's fixed hair is the slice's preset
appearance. Which preset value, if any, holds a character's hair — the first of
the two 90xx values is not hair by any rule tried — matters only for drawing
the presets themselves. See §7.

---

## The equipment screen — 13 September

Equipment opens the game's own screen, its two DS screens on the right:
the eight slots down the bottom screen, and — a slot opened — the frame with
its tabs and a 4×4 grid of the bag's items, a page of sixteen at a time; the
chosen item's name on the top screen's parchment.

**From the cartridge**, every picture: the parchment (`bgii21_en.pac`), the
backdrop, frame, tabs, name plate and sort label (`bg_eq_en.pac`, read with
the new `.bncg`/`.bncl`/`.bnsc` reader — game-formats' FORMAT.md), the slot
boxes, row bars and green corners (`spr_eq.pac`), the hints, L, R and the hand
(`clmm_en.pac`), the slots' small icons (`oiij_en.pac`). **Measured from the
art**: the grid's cells, 24 pixels at a pitch of 26, the equipped bar, the tab
row, and where a raised tab sits. **From two screenshots of the game** (kept
in `evidence/`, not committed): what goes where.

**The item icons are the game's own**: `/data/ani/d_<letter><nnn>.spr`, named
by the item's id in decimal — the copper sword, 20004, is `d_w004` (found in
the explorer; game-formats' FORMAT.md, "Item icons"). 985 of 1,178 items have
one so.

**Ours, each said so in `apps/game/src/equip-screen.ts`:** the exact places
the screenshots give roughly; the text, in the browser's font; the icon of an
item the rule gives none — its slot's small icon; the words "Nothing
Equipped"; ↑/↓ going through the grid in order; where a description's lines
break; and what is left out — the Hero's figure, and the item's numbers,
rarity and who can use it, none of which is read yet. `?bag=w,s:3` fills the
bag with every item of those tables — a debugging aid, ours.

**The item's description is the game's own**: `itemexpl_en.nat`, one for each
of the 1,178 items, keyed by id (game-formats' FORMAT.md, "Item
descriptions"), its markup rendered as the talk's is.

**Each item's kind is the game's own**: `itemsort_en.bin` gives its category
and subtype (game-formats' FORMAT.md, "Item kinds"); a weapon shows its own
kind's icon — spear, axe, bow — in the name bar and where it has no icon.

**Left:** the 193 items without an icon by the rule; the layouts, `lay_eq.lia`
and `lay_iie.lia`; the rest of step 3 — numbers, rarity, who can use what.
Rarity, defence and attack are not beside the item anywhere on the cartridge:
every reference to the copper sword was followed, and 41 shields' published
defence and rarity were tested against every file's fields, plain, packed and
scaled, and against tables by position — none. They want the emulator: a RAM
search on the equipment screen, e.g. for the Flame shield's id `8E 53` beside
18 and 1. "Used by" follows the subtype (the guides agree), but no table of it
was found either.

**Wanted after Slice 1: weapons on the Hero** — noted in the slice plan, left
out of this slice on purpose. The worn models are `p_w<nnn>.nsbmd` in
`chara_pc.gp2`.

---

## The DS's 2D files are read — 13 September

`@minstrel/nitro-gfx` reads NCLR palettes, NCGR characters and NCER cells, and
`drawCell` lays a cell's parts together; `@minstrel/game-formats` reads the
`.pac` packs they come in. Cited to NitroPaint and GBATEK, and checked on the
whole cartridge: 139, 224 and 138 files read, 463 packs each ending at its
end, every cell drawn where its pack holds one set of the three. Evidence in
both FORMAT.md files.

`obj_mm.pac`'s cell 5, the light-blue dot, is drawn by the test but **not by
the game**, which keeps `marker0` until how a character's colour is chosen is
found. The explorer does not show 2D files yet; it would be their first real
user.

---

## The mini-map — 13 September

The DS's top screen's map, drawn in the top right corner; `m` shows and hides
it.

**From the cartridge** (`/data/pack_lv5/minimap.gp2`; game-formats' FORMAT.md,
"The mini-map"): the picture, a `.obg` of 4-bit tiles and sixteen colours;
the `.bmmp` layout naming which picture a map is drawn on, its backdrop paper,
the maps it is for by index id, and its marks. Every one of the 268 pictures
and 279 layouts reads. Where the Hero stands on it — position × scale −
corner × 8 — is **INFERRED** from the marks landing on the doors they name.

**The Hero is a dot, the game's own:** `marker0.obg`, the blue one of five
coloured dots. **Which colour is his is ours**: a screenshot of the game, a
party of four in Stornway's church, shows each member as a dot in their own
colour — the first green, then lime, grey, dark red — matching their name
panels, with no arrow or facing. How the game picks a character's colour is not
found; none of the four is exactly in the palettes read so far.

**A room is shown on its area's picture — observed** in the same screenshot:
inside the church, the town's map with the party on the church. Where on it
exactly is ours: the dot on the room's mark.

**Ours, each said so in `apps/game/src/minimap.ts`:** the corner, the size
and the key; a picture bigger than the screen following the Hero, a smaller one
centred; the backdrop tiled; hidden in a battle. The screenshot also shows the
party's name panels along the map's foot and the town's name in a tab, which
are not drawn here.

**Left:** reading `obj_mm.pac` — the sprite file the code names, a Level-5
wrapper round `NCER`/`NCGR`/`NCLR` holding a blue dot, a red one, a church and
crossed swords — and what each marks; the `z` tile sets; what `0x65`, `0x67`,
`0x68` and `0x6d` say.

---

## Changes of state, and coming round in the church — 13 September

**From the reference** (DQIX/BattleEmulator, `sim/src/battle/states.ts`):
defence and agility levels from −2 to +2, multiplying the stat by 0.25, 0.5, 1,
1.5 and 2; a level held 7 turns, then wearing off by 62, 75, 87 and 100 in 100;
sleep for 2 turns, then waking by 37, 62, 87 and 100 in 100, and a sleeper
neither acting nor defending; poison taking a sixteenth of maximum HP at each
round's end. And the chances of the four ways the reference's boss has, tied to
their action numbers by its six words: Kasap and Deceleratle a level down 75 in
100, Sweet Breath's sleep 25, the poison attack's poison 12. Each told in
`actmsg`'s own lines — falls asleep, is asleep, wakes up, is poisoned, defence
decreases a little, returns to normal.

**Ours, each said so in the code:**
- Snooze and Kasnooze sleeping at Sweet Breath's 25 — their message says
  sleep, the chance is not read; Sap and Decelerate as Kasap and Deceleratle,
  by name; Buff, Kabuff, Accelerate and Acceleratle raising their own side a
  level, always, by name — the reference has none of these four;
- every fighter having states, where the reference keeps them for its player; a
  level's turn off at the round's end; any damage waking a sleeper;
- poison's toll told by the game's plain damage line — no line of its own found;
- what the slice's monsters do that the reference does not — Dazzle, sand in
  the eyes, the bag o' laughs' dances — still an attack.

**Coming round in the church — ours but for its message.** A wiped-out Hero —
`str_bres` 20, the game's — comes round in the village church, `M01M06`, before
its priest (character 13, whose line hands over to `<CHURCH=1>`), whole, with
half the gold. Neither the church nor the half is read: no text says either.

**Ivor is not found.** No monster record and no system string names him; his
numbers, if the game has them as a fighter, are in the event scripts or the
code.

---

## Monsters act — 13 September

**A monster's six words are its six ways of acting**, action numbers
(`game-formats/FORMAT.md`, "Monster data"): the reference's own boss, Ragin'
Contagion, has the reference's six candidates exactly and in order. The slime
attacks and runs away; the bodkin archer uses a medicinal herb on its most
wounded; Hexagoon strikes everyone, 6 give or take 1, a third of the time.

**From the reference** (`sim/src/battle/battle.ts`): a way is drawn from 1 to
256 against six weights, `ProcessEnemyRandomAction2A`; a monster's attack as
before. **Read from the cartridge**: what each way does — its effect, reach and
range. A monster's amount is the range's base, beside the party's (Crack 17
against 30) — INFERRED.

**Ours, each said so in the code:** the even table, 43, 42, 43, 43, 42, 43, for
every monster — the reference has a falling one for its boss, and neither is on
the cartridge as bytes; a monster that runs away always gets away and pays
nothing; one that would heal with no one hurt attacks instead; what the battle
cannot do yet — Buff, Dazzle, sand in the eyes, Sweet Breath and the other
changes of state — is an attack instead; a move with no name, Hexagoon's among
them, is told by what it does alone.

---

## Spells in battle — 13 September

The battle menu has **Spells**, between Attack and Defend as `str_btl`
numbers them. It offers what the Hero has learnt that heals or deals damage —
for the Minstrel, Heal at 3, Crack at 8, Woosh at 12, Crackle at 16 — and asks
whom when a spell could reach more than one monster, or more than one kind.
The cast is told in the game's words: `actmsg` 46 `casts <ACTION>.`, the
spell's own message for each one it reaches, 141 `goes haywire!` on a
critical, 153 `Not enough MP!`; with none learnt, `str_btl` 30023 `doesn't
know any battle spells yet.` The Hero's MP go into a battle and come out of it.

**From the cartridge** (`game-formats/FORMAT.md`, "Actions"): a spell's cost,
its amount for the party — bits 10–19 of its range, which hold exactly the
reference's own Heal 35, Crack 30, Crackle 50 and Woosh 16, where the range's
base is 35, 17, 33 and 14 — and **whom it reaches, the high nibble of
`+0x17`**: one, a group, or everyone, the Ka- spells each a step further than
their plain ones. `0x05` at `+0x24` deals damage.

**From the reference** (`sim/src/battle/battle.ts`): the amount drawn around
that party amount, and a spell going haywire 100 times in 10,000 for 1.5 to 2.0
times as much.

**Ours:** a group is the monsters of the chosen one's kind; each one reached
has its own amount, after one draw for the whole cast going haywire; a spell
without the MP costs nothing; the reference's Woosh takes a quarter off, which
looks like its one foe's resistance and is left out; and the rise of a spell's
amount with magical might or mending is not modelled.

---

## M4 is as far as the cartridge goes — menus, items and spells, 13 September

**The menu speaks the game's words**: `Attributes`, `Items`, `Equipment`,
`Spells & Abilities` from the field menu's `str_tm` (Talk is ours — the game
talks with a button); an item chosen offers `Use`, `Discard` and `Cancel`; an
empty bag says `The bag is currently empty.`; the vocation is `str_tm` 2106,
`Minstrel`.

**Every usable item does what its action says** (`use.ts`): HP and MP restored
by the action's range, or all of it when it has none (Fullheal, the elfin
elixir); the seeds raise the number their own message names, `actmsg` 157 to
166, for good; cures and revivals have nothing to do on a lone, unpoisoned
Hero, and say so. Each result is told in the action's own message — bits 20–31
of its record's `+0x20`, INFERRED (`game-formats/FORMAT.md`, "Actions"). The
skill books' numbers are no actions, and are not used.

**Spells** (`game-formats/FORMAT.md`, "The spell table"): `spelltable.bin`
says who learns what at which level; the Minstrel learns Heal at 3. An action's
MP cost is the low byte of `+0x08`, INFERRED. The spells panel lists what the
Hero has learnt and casts the field half's — Heal, Midheal, Zing — with
`Not enough MP!` when short.

**The Hero keeps MP**, as they keep HP; the inn restores both, which it did
not before; a level's new MP come with it; saves are version 2, keeping HP, MP
and the seeds' gains, and still read version 1.

**Ours, each said so in the code**: the chimaera wing, whose record says
nothing — thrown outdoors (`actmsg` 363) it takes the Hero to Angel Falls, the
slice's one village; indoors they bang their head on the ceiling (`strstd`
57); a spell or item that would do nothing is not spent; the rise of a spell's
amount with magical mending; Evac and holy water, whose records say nothing
either, are not done.

**Left for M4, and needing the emulator:** equipment's numbers — see "What is
still open".

---

## The morning plays — 13 September

A new game opens on the landing upstairs in Erinn's house, `M01M10`, and plays
`ev02130` there: the Hero asleep in bed, Erinn walking round to the bedside,
her four lines, and the Hero set down on their feet and handed back to the
player. `?event=N` plays any event in the map `?map=` names; `?new=1` starts a
new game past a kept save.

**The engine functions read** (`apps/game/src/event.ts`, and the table in
`docs/event-scripts.md` §5 — every reading INFERRED): 206–210 place, walk,
face, turn and pose a character; 204 says whether it is still moving; 566 and
567 name its model and motion packs; 224 keeps the motion to go back to; 300,
303 and 310 aim the camera; 400 and 405 show a message and wait on it.
Character 0 is the Hero, posed from their own pack (`ev7700p000.chr`, `ne_lp`
asleep). The others are drawn in their own models, with the motions of the
packs they are handed (`actors.ts`).

**Script strings count from the code base**, not the file's start: every one of
the 5,968 string pushes that is not a note now reads as a name.

**Ours, or not yet read:** the 21 functions the morning calls that are not
read, answered with 0 (fades, sound and the event's own bookkeeping by their
neighbours); the camera's field of view against the DS's; that a new game
starts here at all — no trigger names the morning; and a message's speaker, as
the text box already finds it.

---

## The smaller gaps, and using an item — 13 September

- **A medicinal herb heals**, from the items panel and from the battle's Items
  command: 30 to 40 HP, drawn as the reference draws Heal
  (`FUN_021e8458_typeD`, golden-tested), and kept rather than used at full HP.
  The way there, all in `game-formats/FORMAT.md`: an item table's record begins
  four bytes before its id, with two action numbers — the field's and battle's,
  INFERRED; the action tables `actdt_a` and `actdt_b` name each action's range
  in `actdamage`, and the herb is action 255, 35 ± 5; and the byte at `+0x24`
  says what an action does — `0x16` restores HP. **What other items do** —
  MP, cures, the seeds, the chimaera wing — is read as far as that byte and not
  done.
- **The battle speaks the game's words**: `strbtl`, `actmsg`, `str_bres`, and
  the commands from `str_btl`, with each name's articles, plural and gender
  from the grammar word beside it (`readGrammar`). **Which message an action
  says is not in its record**; each is chosen by what it says.
- **Who joins a battle**: `encbtl`'s company carries a weight and a count
  range, INFERRED; the monster walked into still comes alone, and how many kinds
  join and the cap of five are ours.
- **The monsters move**: `appear`, their attack, `damage` and `death`, once
  through and held, and a fallen one stays until its page is told. The camera
  watches the middle of the fight. Both ours.
- **Pots and barrels smash** when opened: the `_02` sheets out of
  `icon.nsarc`, which is where the field's code names them, three frames of
  shards, and then nothing. That copy's barrel goes back to its first frame
  and holds it; the smash ending at the first frame shown again is ours.
- **Sprite tiling is resolved.** A frame is built of parts; the "strip" the old
  cut dropped was the top of every villager. The live cut and its keys are gone.
- **The font is still not found.** The NFTR fonts the code names are the Wi-Fi
  utility's.
- **Found on the way**: bit 28 of a GPC header marks archives stored whole —
  the monsters and the action tables — and the bubble slime and liquid metal
  slime models put blended vertices off their bind pose, left out of that check
  by name.

---

## M6 has started — monsters roam the field, 13 September

On a map that has a zone — the fields and the dungeons, not the village —
monsters turn up around the Hero, wander, and start a battle when walked into:
the monster itself and up to two more. Up to three roam at once; they come
6 to 10 people's heights away and are gone past 16. Walking into one after
arriving, or just after a battle, starts nothing for two seconds.

**Read** (`game-formats/FORMAT.md`, "Encounters" and "Field monsters"): which
monsters roam a map's zone and how often each — `encfld` names the map by its
own id — the zone's battle company from `encbtl`, each monster's field speed
(INFERRED) from `fld_mondata`, and its field model, `<code>_f.mon`.

**Ours, each said so in the code** (`packages/sim/src/field/roaming.ts` and
`beginRoaming` in `main.ts`):

- **which of a map's zones** — the first; how the game chooses is not
  established, and the collision attribute tried for it is not it;
- how many roam, where they turn up and vanish, how they wander, and how near
  is walking into one;
- **who joins a battle**: up to two kinds from the zone's company, each by its
  weight and as many as its range — both read, INFERRED — to at most five; the
  roamer's own numbers are not read;
- speed as the Hero's walking speed times the field float;
- no running from a strong party: `fld_mondata`'s first two numbers look like a
  level and a threshold, but are not read.

**Left for M6:** which zone applies where — by day and night, the story, or a
file not read yet; the monsters who flee a strong party; field-to-battle
transitions beyond the cut; the poison marshes; and Ivor.

---

## M5 has started — battles, 13 September

`p` picks a fight — two slimes, or the monsters `?fight=` names by code — and
Shift+P fights Hexagoon, from whom there is no running. The monsters stand in a
row ahead of the Hero, in their own models and playing their stand; the menu
offers Fight, Defend and Flee, and whom to fight when more than one stands; the
round is told a message at a time. A win pays out experience and gold and says
what a level brings; the Hero's wounds carry from one battle to the next.

**The rules are translated, and held to their source.** `packages/sim/src/battle`
takes the random numbers, the damage and the order of a round from
DQIX/BattleEmulator (MIT, © 2024 DaisukeDaisuke), which reproduces the game's own
and names its functions by their addresses: the 64-bit generator, `FUN_0207564c`
for damage — roughly attack/2 − defence/4 with a spread — agility times 0.51 to
1.0 for who goes first, a monster's blow dodged 2 in 100, defending halving
it, and a critical blow of the attacker's own attack times 0.95 to 1.05. All of
it is whole-number arithmetic, and `battle-rng.test.ts` holds it to golden
values taken by compiling the reference's own `lcg.cpp` and damage function.

**The monsters are read** — their battle numbers, names and models; see
`game-formats/FORMAT.md`, "Monster data" and "Monster models". Their bodies
are in `enemy.gp2`, whose members are stored whole and which the cartridge
walk now opens.

**Stand-ins, each said so in the code:**

- the Hero's attack and defence are their strength and resilience — where
  equipment keeps its numbers is not found;
- the critical chance, the reference's 200 in 10,000 for its level-13 case;
- fleeing, 50 in 100 — the reference does not model it;
- a monster always attacks — its six action words are not read — and picks its
  target by a draw;
- a battle of more than two is ordered by the same draw for everyone — the
  reference is one against one;
- the order the numbers are drawn in is not the game's;
- defeat restores the Hero where they stand with half their gold — the game
  sends them to a church;
- which of the game's messages each happening says, chosen by reading them;
- the monsters' motions on each page, and the camera.

**Left for M5:** the party of two, Ivor beside the Hero — his numbers not
found; abilities; the changes of state the reference does not model — Dazzle,
sand in the eyes, the dances; how each monster chooses, where the game keeps it;
Hexagoon's own behaviour beyond its six ways; and the game's own rule for
defeat, which the church stands in for (see the top).

---

## What is still open — 13 September, at `b9b8117`

M0 to M4 are as far as the cartridge goes without the emulator; M5 is next.
What is left, by what it takes.

**Closable here, from the code and the cartridge:**

| gap | milestone | what it needs |
|---|---|---|
| The opening beats, and story flags | M3, and M7's whole sequence | The morning plays (see the top): the cast, the camera and the messages are read as far as it needs. Next, the functions other events call, which event runs when, from the triggers, and the game-wide variables (scope 64) that the talk files' paired labels (192/193 …) most likely test. The largest job left, and on the slice's critical path. |
| Other items | M4 | Done (see the top), bar what no record says: the chimaera wing's destination, Evac, holy water. |
| The game's own font | M3 | The text box uses the browser's; the Latin glyphs are not found — see `game-formats/FORMAT.md`, the bitmap font. |
| The Hero's starting purse and the inn's price | M4 | Both in code, not data, as far as has been looked: `STARTING_GOLD` and `INN_PRICE` stand in. |

**Needs the emulator — questions to bring to it:**

- **Equipment's numbers.** No file keeps attack or defence by item id. The
  attack of a copper sword, a soldier's sword and a leather whip, and the
  defence of a pot lid, a leather shield and leather armour, read off the
  shop's screen, would be enough to search for where they are kept.
- **The Hero's vocation, and a level-1 status screen.** Minstrel (`level6`) is
  a choice; the status screen would also settle which level-table columns are
  resilience and agility, and might and mending.
- **The inn's price and the starting gold**, if they are not found in code.
- **Which parts make the Hero** (§7).
- **Where a field's doorways really are** (§6) — the mountain pass is a field,
  so this blocks M7.
- **Which treasure kind is the pot** and which the barrel.
- **Where the Hero wakes**: `ev02130` puts them at (1.09, 0.61, −2.73), in
  `M01M07` or `M01M10`.

**Deferred by the plan:** WebGPU (WebGL2 is enough for the slice), the DS
toon and edge pipeline outside reference mode, audio (to start during M5),
settings, the ROM hash check and caching (M8).

**Inferences worth checking when the emulator is out** — each marked INFERRED
where it is made: which level-table column is which; kind `0x40` as the grey
chest; the chest monsters' rows; the shop's rate and kind; `<UKE>`/`<YAME>` as
accept and decline; answers side by side sharing a branch; the shadow's size.

---

## M3 has started — event text is read

M2 is walkable end to end, bar the Hero stand-in and the two notes below
(sprite tiling, where the Hero wakes). M3's list is in the Slice 1 plan at the
repo root: the text box; NPC placement, talk and examine, yes/no prompts;
script execution — a VM if one exists, otherwise a small hand-authored event
DSL; chests, the stable, the church and story flags. It is done when every NPC
in Angel Falls says the right thing and the opening story beats play. The slice
opens after the fall, in Erinn's house: the Observatory prologue — chapter `A`
of the talk files — is Slice 2.

The first step, chosen for being under everything else in dialogue:
`readEventMessages` and `parseMarkup` in `@minstrel/game-formats`. An event's
five text files are ordinary tagged tables of `(number, text)` records; the text
is ASCII with accents and a condition language as markup. The evidence and the
vocabulary — mostly not established — are in `game-formats/FORMAT.md`, "Event
text", and `tools/harness/test/events.test.ts` holds every event on a cartridge
to it.

**`SB2` examined, as far as the data goes.** The container is mapped — header,
a section table, a block shared byte-for-byte by 522 of 523 events, then
sections 200, 300 and 100 — and an event's script names its own messages as
typed operands; its code is not read. Scripts name no map and no other event,
so they are not what decides who says what. `game-formats/FORMAT.md` has it.

**What characters say is in `/data/scenario`**, one archive per chapter letter
per area (`M01A0.gp2` … `M01Q0.gp2`), one talk file per character id — 99.7% of
them match the area's cast. Beside them, `trigger<area>.bin` reads as "in this
map, over this span of the story, this character, sometimes this event" — the
characters it names stand in its map 66% of the time against 18% for a
stand-in — but its operations are not decoded.

**Talk picks a line.** `f` talks to the character the Hero faces and says what
`pickLine` chooses for the story stage: the line a trigger labels, the event a
trigger names, or the plain line for the sub-stage, by day or by night — the
status line says which and why. `Shift+F` reads out every line of their file
instead. `Esc` closes; `v`/`b` step the chapter, which otherwise follows the
stage (INFERRED: letter = the stage's major number). The readings behind it are
in `game-formats/FORMAT.md`, all INFERRED.

The story stage is one for the whole game now and opens at **2.1**, where the
triggers put Erinn's morning event; `t`/`y` step it, and the cast stand where
it has them. At 2.1 to 2.5, 17 to 20 of the village's 20 to 22 placed
characters have something chosen for them. What is left: paired labels
(192/193 …) that nothing here chooses between — story flags, most likely — and
tag 2's errand lines and the counters' tags 4 and 5, which talk does not use.

**Prompts work.** A line that asks `<YESNO>` or `<UKEYAME>` shows its answers
under the question — the arrows choose, `f` or `Enter` answers — and the branch
for the answer runs, jumps and all, so a "no" that asks again does. An answer
with no branch of its own ends the line and says so: what follows is a
script's. In the village none does — 236 prompts on 208 of its 1,005 lines,
and all 472 answers have their branch in the line; a cartridge test answers
every one both ways and checks each runs to an end. The grammar and its measures are in `game-formats/FORMAT.md`,
"Prompts". The other mechanics still to do, before the scripted sequences:
chests, examine and story flags.

**Chests work, without a chest — on hold.** Set aside on 12 September for
script execution, with the model and the item encoding unfound; `f` with
nothing in reach names the nearest treasure, for when it is picked up again.
With nobody in front, `f` opens the treasure
in front instead. Every treasure a map's file places is marked by a gold cube,
grey once opened — the village has eight with a position — and an opened one
stays open across maps, by its game-wide number. What is inside is not read
yet, so the box says which treasure it was and the value its contents must be
in. Still to find: the chest model, which no file is named for; which kind is
which; how that value names an item; and the village's four treasures with no
position, which belong with examine. See `game-formats/FORMAT.md`, "Treasure".

**Doors swing.** A door is a map piece of its own, `M01M00D1`, with its
collision under the same name with `A` for `M`, and no animation, so
`apps/game/src/swing.ts` turns it a quarter about its origin, away from the
Hero, when they come within 0.25 of it, and back once they are 0.4 away. Its
collision stands only while it is shut, which is what opens the two rooms off
Erinn's house, `M01M10`: those are the village's only doors whose collision
the loader keeps. The hinge at the origin is INFERRED; the swing, its speed and
its distances are choices. A cartridge test walks through both of Erinn's doors
open and is stopped by them shut. `game-formats/FORMAT.md`, "Doors".

**`M01M12` loads — done, 13 September.** The index calls it the opening's
background. It has two archives with a descriptor, and the loader took the
first, `M01M12.ambl`, whose descriptor names only its textures; it now takes
the first whose descriptor names a model that reads, `M01M12.amdj`.

**Event scripts are read and run — the machine, not yet the game.** The `SB2`
code is a stack machine of three-word instructions, read from the scripts
alone: `readScript` in `game-formats` reads every event's routines, and
`@minstrel/script` runs them, handing each engine function — numbered in
hundreds, 200s the cast, 300s the camera, 400s messages — to a host. Against a
host that answers everything with 0, 504 of 523 events run to their end.
`game-formats/FORMAT.md`, "Event scripts", "The code". Next is the host: the
engine functions the opening event calls, so that Erinn's morning plays in the
room rather than as a list of lines. The technical account is
`docs/event-scripts.md`.

**Cabinets open, and stop swinging.** The `G` pieces — two in the shop, one each
in `M01M09` and `M01M10` — are cabinets whose own animation swings their doors;
played on a loop like everything else, they swung open and shut for ever. Their
`.bcfg` is a motion table naming `closed`, `open` and `opend`, so a cabinet now
stands shut, `f` plays its opening once, and it holds open, saying which
treasure it held: the room's position-less treasure records, paired in order
(INFERRED). `docs/map-objects.md` has doors, cabinets and treasure together.

**Less of the map goes missing.** What looked like aggressive level of detail
was the pass that hides whatever stands between the camera and the Hero: it hid
a whole shape at a time, and a shape is a material group — the village's
windows are one, spanning half the map. Shapes are now cut into squares of two
and a half character heights once per map (`cellsOf` in `packages/render`), and
a shape with a square in the way is drawn without that square's triangles;
only squares whose whole shape is in the way go, so the ground never gets
holes. Over 424 views of the village, the most hidden in any one fell from 15.1%
to 2.2%. The squares are not drawn as pieces of their own — that was tried, at
five times the draw calls, and the frame rate collapsed.

**Shadows blend.** A map's soft shadows, water, windows, light, sky, fire and
smoke are textures with partly transparent pixels, and the renderer drew them
solid — every shadow a dark patch. A texture is now drawn see-through, in a
second pass after everything solid, when at least 5% of its pixels are partly
transparent (`packages/gl/src/alpha.ts`): over the village's 181 textures that
splits 141 with none and one cliff edge at 2.3% from 39 at 10% or more. The
material's own alpha (the DS's polygon attribute) is not read yet.

**Chests are drawn.** The model is `T00GDS01`–`04` in `/data/bin/icon.nsarc`,
two chests shut and open, found among the objects the engine draws itself;
`docs/map-objects.md` and `game-formats/FORMAT.md`, "Treasure", have what is
read and what is inferred. The same archive holds `kage`, a round shadow, now
drawn under every character and the Hero (`apps/game/src/shadows.ts`): a flat
square 1.13 across in the files' own units with a translucent texture, so it
lies soft in the blended pass. That it goes under characters, and at that
size, is INFERRED.

### M3 — what is left

M3 is done when every villager says the right thing and the opening story beats
play. The second is not done. Set aside to move on to M4:

- **The opening beats.** Event scripts run in `@minstrel/script`, but the game
  supplies none of the engine functions yet; Erinn's morning, `ev02130`, calls
  34 of them — the cast, the camera, messages, sound. Then triggers decide which
  event runs when.
- **Story flags.** Talk's paired labels (192/193 …) and the scripts' game-wide
  variables (scope 64) are not read, so whatever depends on them is guessed or
  missing.
- **Examine — done, 12 September.** Things to examine are cast records of
  kind 1, placed and never drawn, whose talk is what examining says — the
  village's bush and statue among them; `f` talks to them. Cabinets open. Pots
  and barrels open, and are drawn with their sprites (`tsubo_01`, `taru_01`);
  `0x10` the pot and `0x20` the barrel is INFERRED from `randTTT`'s name. Their
  `_02` sheets are named for breaking (`tsuboware`) but do not read yet, so
  opening one does not smash it.
- **What is in the treasure — done, 12 September.** Chests name their item;
  kind `0x4` is gold; pots, barrels, cabinets and kind `0x40` draw by rank from
  the random tables, with a stand-in for the game's dice. The item names and
  tables are read (`game-formats/FORMAT.md`, "Items" and "Treasure"). A chest's
  draw can be a monster — the cannibox, mimic or Pandora's box, INFERRED — but
  there are no battles to follow it. Nothing is kept yet: there is no inventory
  until M4.
- **The church works; the stable is not started.** The priest's line hands
  over to the church (`<CHURCH=1>`), whose confession saves — see M4 below.
- **Where the Hero wakes.** `ev02130` puts the Hero at (1.09, 0.61, −2.73),
  0.45 above the floor — in bed, INFERRED — in `M01M07` or `M01M10`, both of
  which have floor there.
- **Also open:** sprite tiling (half-resolved), and a vector font, where the
  text box uses the browser's own. Closed on 13 September: `M01M12` loads, the
  shadow under characters is drawn, the stable (`M01M04`) walks and talks like
  any interior, and the seven type errors from before — five in the game, two
  in the explorer — are fixed, so all three projects type-check clean. A chest
  that is a monster now says so in the game's own message, naming the monster
  from the monster list (`readMonsterList`, `readSystemStrings` — both share a
  head word holding their count and their strings' size).

---

## M4 has started — the main menu

`x` opens the main menu, as the plan lists it: talk, status, items, equip,
spells (`apps/game/src/menu.ts`). The arrows or `w`/`s` choose, `f` or `Enter`
takes, `x` or `Esc` goes back a step. The words are ours: the cartridge's own
menu text, under `/data/menu`, is not read yet.

- **Status works.** The Hero's numbers come from the level tables,
  `/data/prm/level<n>.bin` — one per vocation, 99 levels each, read by
  `readLevelTable`. Which column is which is INFERRED from the status screen's
  own words and the vocations' numbers (`game-formats/FORMAT.md`, "Level
  tables"); resilience against agility is the weakest step, and a level-1
  status screen in the emulator would settle it. The Hero is taken to be a
  Minstrel, `level6` (`apps/game/src/hero.ts`) — a choice; `level0`, the
  Guardian's, is the other candidate. Experience stays at 0 until there are
  battles. Attack and defence wait for equipment.
- **Items works.** Opening treasure fills the bag (`apps/game/src/bag.ts`):
  gold, and a count of each item, named from `itemname`. The bag is ours — how
  the game keeps its own is not read — and neither it nor the opened treasure
  is saved yet.

- **Shops, the inn and the church work.** A talk line that ends
  `<ADD><SHOP=32>`, `<INN=n>` or `<CHURCH=n>` opens its service when it is done
  (`apps/game/src/services.ts`). The shop sells what `shopdata1.bin` lists, at
  each item's price from its table and the shop's rate, and buys back at half —
  a choice. The inn charges a stand-in 10 G, since the line leaves its price to
  the engine and no price table is found. The church's confession saves; its
  divination says how far the next level is. The words on these lists are ours.
- **Equip works, without numbers.** The equip panel puts on and takes off what
  the bag holds, a slot to each item table's category. Attack and defence are
  **not found**: no file, the code included, keeps them by item id
  (`game-formats/FORMAT.md`, "Items"). A few values read off the shop's screen
  in the emulator — a copper sword's attack, a leather shield's defence — would
  be enough to search for them.
- **Save and load, in our own format** (`apps/game/src/save.ts`): JSON in the
  browser's storage, written on confession — where the Hero stands, the story
  stage, the bag, what is worn, the opened treasure and the experience. The
  start screen offers to carry on from it, and says why when a save will not
  read.
- **The Hero starts with a stand-in 100 G** (`STARTING_GOLD`): the game's own
  purse is not read, and the village's treasure comes to two coins.

- **Which stage each service is open at is the story's.** The shopkeeper stands
  at the counter in `M01M03` at stages 2.1 and 2.2 and the priest in `M01M06`
  throughout; the innkeeper is behind the inn's counter only from 2.7, and not
  yet at the slice's opening stage. `apps/game/test/village-services.test.ts`
  holds the village to that. Finding it turned up a talk bug, now fixed:
  answers whose markers stand side by side — `<YES><NO>` — share the branch
  after them, and read as two the first was empty and ended the line. The
  innkeeper's counter line is one of 36 such prompts.

M4's done-when — buy a weapon, equip it, sleep at the inn, save, quit and
reload — can be walked through: buy and equip at 2.1, step the story to 2.7
with `y` for the inn, confess at the church, reload the page and carry on. It
has not been played through in a browser here; the pieces are tested on their
own and against the cartridge. What M4 leaves: attack and defence, using an
item (its effect is not read), the inn's real price, and the stable.

The box is HTML over the canvas in the system UI font. `apps/game/src/talk.ts`
says which markup readings are established and which are inferred; tags it
does not know are left out and listed on the status line.

---

## 0. Everything is read at its own size — **done, 12 September**

The scaling problem behind items 5 and 6 was two misreadings, not a per-map
fact, and every fitted scale constant is gone with them.

- **Models.** A scaled model's render commands bracket each shape: `0x0B`
  scales up by `upScale`, the shape is drawn, `0x2B` scales back down by
  `downScale` (apicula, `render_cmds.rs`). The scale-down is an undo sent after
  the shape; `nsbmd.ts` applied it to every shape, so every model was drawn at
  its size over its own `upScale` — 8 for the village's terrain, 1 or 2 for most
  rooms, 16 for fields. `nitro-gfx/FORMAT.md`, "The position scale".
- **Collision.** A `.col2`'s `+0x04` is a shift: its coordinates were stored
  halved that many times. INFERRED; `game-formats/FORMAT.md` has the evidence.

Read that way the files agree with one another with nothing between them but
one choice of unit, `WORLD_SCALE` in `packages/world` — an eighth of the files'
units, which is what the character was tuned in. `PLACEMENT_SCALE`,
`PLACED_PIECE_SCALE`, the indoor eighth and `INTERIOR_COLLISION_SCALE` are
removed, and the parsers return the files' own values.

| measured on the whole cartridge | before | after |
|---|---|---|
| indoor doorways just inside their drawn room, 677 | 34% | 85% |
| indoor doorways just inside their collision | 16% | 91% |
| doorway arrivals landing on floor | 78.1% | **99.8%** |
| arrivals into a field landing on floor | 87 missed | 116 of 116 |

In the village: House A, the Mayor's House, the church and Erinn's house were
drawn at half size, which is the "still want adjusting" report; the well's
collision was doubled when it should not have been; and the waterfall,
`M01M0001`, stood beyond the edge of the map at twice its size, where by its
bounds it now stands at the head of the river with its foot on the water. The
village's terrain, buildings, doors and main collision mesh come out as before.

**Confirmed in play:** every room at the right scale, and the clouds,
`M01M0002`, which have an `upScale` of 1 and now come out an eighth of their old
size, look right.

**The first map opens at its entrance.** With no doorway to arrive by, the
character used to be put on walkable ground near the map's middle — a guess,
which with the village's collision at its right size landed at the river's edge
by the waterfall. It now comes in the way a neighbouring map's doorway brings
you: for the village, the road from the field. `entranceOf` in
`apps/game/src/load.ts`; the middle is kept only for a map nothing leads into.

**To come back to — reported from play: the Hero starts the game waking up in
Erinn's house.**
Which floor — `M01M07` or `M01M10` — and where in it is not in anything read so
far (no model in either names a bed), so the game still opens at the village
entrance until it is.

Items 5 and 6 below are kept for what they ruled out. Their conclusions are
superseded by this.

---

## 1. Interiors leaked, and no longer do — **done**

A room's collision is one floor quad with walls standing on it, and the walls do
not close it. Walking 64 directions out of a doorway left the world on 7 of them
in `M01M04` and 21 in `M01M08` — the fat radius had been plugging some, which is
why they surfaced alongside the radius fix rather than because of it.

The rule is in `packages/sim/src/character.ts`: **a step whose landing has no
surface anywhere beneath it is refused**, as a step into a wall is, with each
axis tried alone first so walking into an edge at an angle slides along it. The
test is "no ground anywhere below", not "ground lower than here", so an outdoor
drop with ground under it stays a fall.

All three interiors probed now lose the character on none of the 64 headings.
The village is unaffected — the same 7,403 spots — and the harness's walk over
every map on the cartridge is unchanged. A platform floating in nothing can no
longer be walked off, which is the one behaviour this deliberately changes.

Covered by `apps/game/test/travel.test.ts` (the 64-heading probe, on a
cartridge) and `packages/sim/test/character.test.ts` (the rule itself, on built
geometry).

---

## 2. Sprite frames — **resolved, 13 September**: a frame is built of parts

A frame is a list of parts, each placed and sized, as the DS's own sprites are;
read so, 1,314 of 1,316 sheets land exactly on their palette, and every
villager is whole. What follows is the fitted reading it replaced, kept as the
history — the 664-byte pitch below is exactly a villager's frame of two parts.
See `game-formats/FORMAT.md`, "`.spr`".

The pitch was **664 bytes**, not the 648 the parser used and not the 660 the head
measurement suggested, and the mound is an eight-row strip that is part of every
frame rather than a mis-cut neighbour.

**Measured rather than fitted.** The instrument is the period of the sheet's own
bytes: score the block against itself at every candidate lag over the positions
where either copy has ink, and take the peak. `n003a` peaks at 664 with 0.465
against 0.325 for the runner-up. Across 187 multi-frame sheets the peak is 664
on every 32x40 one, at 8, 11, 16 and 20 frames alike — a constant of the
geometry, not a division of the file. It is the same 41.5 rows the empty rows
gave, arrived at independently.

```sh
node tools/sprite/render.ts --period rom/<your>.nds n003a
```

**664 had been ruled out on arithmetic that was wrong** — "sixteen frames at 664
leave no room in front of the palette". Sixteen frames need fifteen pitches plus
the last one's pixels: 10,600 bytes, against the 10,612 there are. It fits.

648 came from scoring how much ink lands in the edge columns, which is a proxy
for the horizontal wrap and is blind to vertical error — and 648 is a whole row
away from 664, so its error is entirely vertical. **A pitch one row short walks
the figure a row down its cell every frame**, which is what the "stray mound"
mostly was: by the end of the sheet the figure had slid far enough for the
strip above it to enter the cell and its hem to be cut off.

The strip itself is real and is now cut out: a frame's 664 bytes are eight rows
of strip and then the figure's 32, and the header's `height` of 40 is the two
together. What the strip is remains unestablished — a squashed copy of the
figure that turns as it does, so a shadow or a reflection, not a hat.

`FORMAT.md` carries the evidence and the list of criteria not to try again;
`tools/harness` now checks the parser's pitch against the measured period on
every sheet it samples, which is the check that would have caught the original.

**Half-resolved, from play.** The sprites rotate correctly, so `standingFrame`
is left as it is — an earlier report had them facing backwards, and the later
one supersedes it. **They still do not tile properly**: some characters are
drawn missing their legs, some their heads. The 664-byte pitch and the eight-row
strip were measured on the 32x40 sheets; which sheets come out wrong, and
whether they share a size, has not been measured yet, and that is where to
start. `?sprite=1` cuts a sheet live. For a picture, `tools/shot` drives Chrome
over CDP, and there is no Chrome on this machine; the inn is the crowded test:

```sh
pnpm build
node tools/shot/serve.mjs rom/<your>.nds       # APP=game
node tools/shot/screenshot.mjs \
  "http://localhost:8765/?rom=/rom.nds&map=M01&door=M01M02" out/inn.png 1600 1000
```

---

## 3. Interiors drew the whole area's cast — **done**

Reported from play: the stable had fifteen characters in it. A cast list is per
*area* and every interior is its own little map about its own origin, so the
"is there floor under them" filter let most of Angel Falls into every room.

The file says which map after all: the word at `+8` of a placement block is
`area x 100 + sub-map`, so `M01`'s placements run 1100 to 1109 and 1104 is
`M01M04`, the Stable. Evidence and the counts are in `FORMAT.md`. The stable
draws 7 now; the village outdoors is unchanged at 18, which is why this survived
so long.

---

## 4. Indoor doorways stood in the middle of the room — **done**

Reported from play as "the door is in the wrong position", alongside the
collision not matching the room. **A doorway is already in the character's own
space — where it stands, where it puts you down, and how big it is — and each
of the three had been scaled with a map at some point.**

It never showed outdoors, because a map's scale is one there: the village's nine
doorways were right the whole time. Indoors it collapsed the trigger onto the
origin, near enough the middle of the room that walking across the floor threw
the character straight back outside.

| indoor doorways (377 of them), how near the edge of their own map | mean | within a quarter of the edge |
|---|---|---|
| scaled with the map | 0.68 | 7% |
| left alone | **0.06** | **90%** |

The arrival had the same treatment, scaled by the map it leads to. What settles
that one without asking the collision anything: **you should come out beside the
door back**. Across 183 doorways into an indoor map the distance from the
arrival to the door leading back the way you came is a median 0.285 units left
alone — a character and a half — against 0.973 scaled.

Recorded because it is what kept the scaling in place: 93% of those arrivals
stand on walkable floor scaled and 26% left alone. That is item 5 below, not
this one — a scaled arrival lands in the middle of the room where there is
always floor, and a correct one lands at the threshold, which is where an
interior's collision tends to stop short.

`apps/game/tools/plan.ts` draws a map from above with both on it, which is how
this was found and is the quickest way to check any map.

---

## 5. An interior's collision does not match its room — **a fitted x2 is applied**

Reported again from play, with the useful addition that the *scaling* looks
right. It does: what is wrong is the collision's extent, and the cartridge's own
characters are the ruler that shows it.

**The ruler is the drawn model's own walls**: take the near-vertical faces that
rise most of the way to the ceiling and see where they stand. It asks nothing of
a bounding box, which counts roofs and aprons the collision was never meant to
cover, and nothing of the characters, whose positions come from records with
unread state words.

| map | drawn walls stand at | collision reaches | |
|---|---|---|---|
| `M01M04`, the stable | x = ±0.50 | x −0.43..0.50 | they meet |
| `M01M02`, the inn | x = ±0.65, ±0.60 | x −0.31..0.37 | **short by ~1.9x** |
| `M01M08`, the well | — | 1.94x the room drawn inside it | **long by ~1.9x** |

The inn's mesh is not broken and nothing is dropped: 46 triangles, a floor quad
with partitions on it and a wall ring with a gap at the doorway, its grid
consistent, its archive holding no second mesh. It is simply smaller than the
room drawn around it, and the well is the same fault the other way.

Weaker but pointing the same way: the inn's cast is authored across the whole
room — `n010a` and `n011a` at **x = 0.53**, `n005a` at **x = −0.55** — so
characters stand where the player cannot walk. Those come from sub-records whose
state words are unread, so they are corroboration rather than proof.

**The `.col2` format is now fully accounted for**, which is what this round
went into: the grid's cell count is `floor(gridZ * (gridX + 1/2))` on all 1,178
files — the rows alternate `gridX` and `gridX + 1` wide — and `gridX`/`gridZ`
are the grid's dimensions over the mesh's own box, covering it on all 1,178.
Both were recorded as underivable; the first was a missing floor. A vertex is
`s16`, so a mesh cannot exceed 16 units across, and the cartridge's widest is
exactly 16.00. `FORMAT.md` and `docs/upstream-findings.md` carry it.

None of it explains the mismatch. **A per-map scale cannot be the cause, and
that is worth stating plainly**,
because it is the natural thing to reach for. `assembleMap` gives a map's own
geometry and its collision **the same factor**: the piece takes `mapScale` and
the mesh takes `mapScale`. Whatever that factor is — the hardcoded eighth, or
something read from a field nobody has found yet — both move together and the
ratio between them does not change. The exterior looking right and the
interiors not is therefore not a sign that the interior scale is wrong; the raw
`.col2` and the raw models simply agree outdoors and disagree indoors.

So the thing to look for is not a scale for the map. It is whatever relates a
`.col2`'s coordinates to the coordinates of the models beside it.

**What else is not the cause**, each checked rather than argued:

- **Not a truncated read.** Every one of the cartridge's **1,154** collision
  meshes is self-consistent: the grid the file carries names exactly the
  triangles that were read, none beyond them. The inn's is 46 triangles, and
  1,908 bytes at 41.5 a triangle leaves nothing over.
- **Not a dropped mesh.** The inn's archive holds two `.col2` and the second is
  its doorway marker, correctly skipped. Its manifest names 8 resources and all
  8 resolve.
- **Not the scale**, the placed-piece scale, or the model's position scale —
  see the list this section already carried.

So the file is read faithfully and the file's floor does not cover the room.
The factors are close to two in both directions — the inn short by ~1.9, the
well long by 1.94, the stable right — which looks like one bit somewhere. No
field found takes those three values apart.

**The other factor of two is not this one.** `nitro-gfx/FORMAT.md` records that
a model's declared bounding box comes out either the same size as its posed
geometry or half it, in two clean peaks — 3,132 models against 2,657 — and the
resemblance is tempting. It is not the same thing: across 86 single-piece maps
the collision is closer to the posed geometry than to the declared box on 62 of
them, within 15% on 33% against 15%, and `F99` and its two sub-maps have
collision matching posed *exactly* while the box is half. Recorded so it is not
tried again.

**Next:** what a `.col2` floor quad *means* for an interior is the open
question. The stable's covers its room and its 44 other triangles are interior
partitions rather than outer walls, so an interior has no wall ring and the
floor's edge is the boundary — which is what the step-into-nothing rule now
holds the character to. If the inn's quad is one walkable region among several
that the game combines from somewhere else, that somewhere else has not been
found.

**Look at it in the game**: `?collision=1`, or `c` at any time, draws the mesh
where it actually is — green what you can stand on, red what stops you, using
the character controller's own test. Side by side it settles what the numbers
only implied: the **stable** is right, its green filling the room to the walls
and its red partitions standing where the wooden stall dividers are drawn; the
**inn** is not, its green covering a fraction of the floorboards and its red
walls standing in the middle of open floor, lining up with nothing.

`node apps/game/tools/plan.ts rom/<your>.nds M01M02 --under=0.12` draws the same
from above, with the collision's walls as lines rather than as the nothing a
vertical face projects to.

### Fitting it by hand, to see whether there is a trend

The same affordance that settled the sprite cut. With the overlay on, the
collision can be **moved and scaled live** until it sits over the room, and the
numbers read off the screen — because no field in any file read here tells a map
that needs a correction from one that does not, and six statistics have already
been tried.

| key | what it does |
|---|---|
| `c` | show or hide the collision |
| arrows | move it in x and z, 0.01 a press |
| `q` / `e` | lower and raise it |
| `-` / `=` | scale it by 0.01, about the map's own origin |
| `[` / `]` | halve and double it |
| `n` / `m` | resize the **room**, leaving the collision alone |
| `g` / `h` | resize **both together**, leaving the character alone |
| `j` / `i` | resize the **character**, leaving the world alone |
| `0` | back to all of the file's own numbers |
| shift | ten times the step |

Four things can move and there are three questions worth asking, because two of
them are the same question from opposite ends:

- **the collision against the room** — `-`/`=` and the arrows, or `n`/`m` from
  the other side. Does the mesh sit where the room is drawn?
- **the pair against the character** — `j`/`i`, or `g`/`h` from the other side.
  If the mesh and the room agree and it still looks wrong, the character is the
  size in question, and it is the one number in the chain no file gives.
- **anything those cannot say** — a rotation, a shear, a stretch that differs by
  axis. If a room wants one of those, that is worth reporting on its own.

`j`/`i` is the better of the two equivalent pair: the camera boom is a multiple
of the character's height, so a doubled room framed by an unchanged character
puts the camera on the floorboards, while a smaller character in an unchanged
room is the ordinary case with a different constant.

Whatever is applied shows on the load line — `— collision scale 2.000 …`,
`— room 0.500`, `— character 0.500` — and nothing shows when it is the file's
own, so a map that has been resized never looks like a map that is wrong.

It moves the mesh the character walks on as well as the one drawn, so a fit can
be walked as well as looked at. The status line reads

```
M01M02  scale 1.030  offset 0.000, 0.000, 0.000
```

which is the line to write down; the same goes to the console. Putting one back
is `?collision=1&fit=scale,x,y,z`.

**What to collect.** One line per room. The village's interiors are `M01M01` to
`M01M08`, and `M01M04` and `M01M01` already fit — so they are the control: if
they do not come out at `scale 1.000`, the method is wrong before the numbers
mean anything. Then the question is whether the corrections land on anything:
powers of two, a constant, or something that tracks a field in the `.col2`
header or the map index.

### The map index answers "which map", exactly

Looking for that scale field turned up something else. **The first slot of a
`maplist9.bin` entry is the map's own id** — 1100 for Angel Falls, 1101 to 1112
for its interiors — and it is what a placement's map word carries. The join is
exact: all **1,289** placements on the cartridge name a value that is some
entry's id, against 96.6% for the decimal `area x 100 + sub-map` reading that
replaced it. `tools/harness` holds it.

Nothing about the scale, but it retires an inferred rule for a stated one.

### The ground test was still throwing characters away — **fixed**

Reported from play: the item shop had no shopkeeper.

A cast used to be narrowed to its map by asking the map's own collision — the
only way to do it before the placement's map word was found. Once the map id
answered that exactly, the collision test stayed on as a second filter, and it
drops anyone standing where the collision does not reach. Which, given item 5
above, is not rare: the shop places three characters and **two of them stand
0.05 and 0.10 beyond the edge of its floor**.

So it is counted and no longer obeyed. A character the file puts in this map is
in this map, and the count goes on the status line as something the *map* is
doing rather than the character. Across the village's interiors that restores
six: the shop 1 to 3, the stable 7 to 9, the church 2 to 3, House A 1 to 2. The
village outdoors is unchanged at 18, and the inn at 5.

### The cast is per story state, and only the first is read

Found while chasing the above, and the other half of the same report — "there is
a character who should be there".

A placement block holds one character in **several places**, as sub-records with
their own two-word marks, each carrying a map, the character's id, seven words
that look like a story state, and often a position. The header repeats the first
of them, and that is all `readNpcPlacements` returns.

So the reading is wrong in both directions. The inn holds **7** characters by
the file and 5 are found: `s017` opens in the village and moves to the inn,
`n005a` opens in Erinn's house and does the same. And of the 5 that are found,
four share the position `0.09, 0.02, -0.10` exactly — a parking spot, not five
authored places.

**Flick between them with `t` and `y`** — decided, for now, as a way to test
where each character stands and at what size rather than as a model of story
progress. `readNpcStates` reads every record; the game lists the stages a map's
records start at (words 0-1) and, at each, puts a character at the first of
their records in that map whose span — words 0-1 to 3-4, never backwards on
1,977 of 1,977 — covers it. Stage 0 is the file's own first placements, which is
what a map opens with. The seven words are still not decoded, and word 6 (2, 1
or 0) is unexplained; day and night is a guess nobody has tested.

---

### Every interior is doubled — the constant now in the code

Decided from the fitting above rather than found in a file: **an interior's
collision is built at twice the size the file gives it.**
`INTERIOR_COLLISION_SCALE` in `apps/game/src/load.ts` is the number, passed to
`assembleMap` as `AssembleOptions.collisionScale`, and it applies to every map
the index marks `indoors` and to no outdoor map. Both places say in the code
that it is fitted and not derived, so nobody later reads it as a format finding.

Two independent measurements moved the right way when it went in, and neither
was the one it was fitted against.

**A doorway now stands inside the floor it opens off.** A doorway's position is
in character space and takes no scale at all, so it does not move when the
collision does — which makes it a ruler. Measured as how far out of the
collision's own half-extent each doorway stands, where 1 is exactly on the edge
and the wall it belongs to:

| map | at x1 | at x2 | |
|---|---|---|---|
| `M01M01` | 1.03 | 0.37 | |
| `M01M02`, the inn | 1.46 | 0.50 | |
| `M01M03`, the shop | 1.00 | 0.36 | |
| `M01M04`, the stable | 1.46 | 0.61 | |
| `M01M05` | 1.66, 1.72 | 0.66, 0.74 | |
| `M01M06` | 1.35 | 0.60 | |
| `M01M07` | 1.42, 1.11 | 0.55, 0.51 | |
| `M01M08`, the well | 0.12 | 0.06 | the exception, in both |

At the file's own size **every** village interior puts its way out beyond its
own floor — 1.0 to 1.7 — which is a room whose exit cannot be reached, and is
the same fault the step-into-nothing rule of item 1 papered over. At twice the
size every one of them lands inside. The well is the sole exception at both
sizes, which is what item 5 already said about it from the other direction: it
is the one map whose collision is *larger* than its room.

It does not land the doorways *on* the wall — 0.36 to 0.74 is inside the room,
where a wall is not — so two is not the whole answer either. What it is not is
arbitrary: it is the only size tried at which no room's exit falls outside it.

**The cartridge's own characters now stand on floor.** The count that item 5's
ground-test fix stopped obeying, before and after:

| map | off the floor at x1 | at x2 | of |
|---|---|---|---|
| `M01M01` | 1 | 0 | 2 |
| `M01M03`, the shop | 2 | 0 | 3 |
| `M01M04`, the stable | 2 | 1 | 9 |
| `M01M06` | 1 | 0 | 3 |
| the rest | 0 | 0 | |

Six characters authored off the walkable floor become one. These come from
sub-records with unread state words, so they corroborate rather than prove — but
they were the original symptom and they were not what the fit was made against.

**Confirmed in play, and three that are not.** Reported after walking them:
the **Inn** `M01M02`, the **Item Shop** `M01M03` and the **Stable** `M01M04`
are right at two. The **Mayor's House** `M01M05`, the **Church** `M01M06` and
**Erinn's House** `M01M07` still want adjusting. `M01M01` House A and `M01M08`
the Well are unreported.

A weak lead on those three, and weak is the word: measure the drawn floor
against the collision floor and the three that need adjusting want 0.41, 0.42
and 0.41 of it in z, against 0.75, 0.99 and 0.69 for the three that are right —
the three agreeing with each other to two decimals, and about a factor of two
from the working set. That would mean those three want the file's own size and
not double it. The ruler is not trustworthy on its own: it takes any
near-horizontal face, so shelving and tabletops widen the drawn floor, and it
puts the shop — confirmed right in play — at 0.67 rather than 1. So this is
something to check with `[` while fitting, not a finding.

**What this does not settle**, and the reason the code says fitted: no field in
the `.col2` header, the manifest, the map index or the model separates a map
that needs two from one that does not, and `M01M08` measures the same factor the
other way. The list below is still the list of things checked and ruled out. The
keys above still fit a room by hand, and a room that wants something other than
two is worth writing down.

---

### Ruled out earlier, and still ruled out

Drawn from above, `M01M08` — the well — is the opposite case: a walkable floor
**1.94x the width of the room drawn inside it**, the same decagon at two sizes,
concentric. The stable is right. So it is not one direction and not one factor.

- **The model's position scale.** Undoing the down-scale that `nsbmd.ts` folds
  into the matrices makes the fit worse, and measurably so once the ruler is the
  drawn model's own walls rather than a floor band: across 86 single-piece maps
  at the origin, the collision matches the posed extent on 46% of `upScale` 2
  maps against 15% before the down-scale, 24% against 0% at `upScale` 4, and
  19% against 0% at 8. The well is the exception that suggested otherwise.
- **Anything in the `.col2`.** The inn and the stable carry the same
  `unknown_0x04`, the same cell size and the same `kind`; their models have the
  same position scale; and the `0x6F` records placing both meshes give scale
  `1, 1, 1`. Two maps, identical everywhere the files can be read, and one needs
  a factor of about two where the other needs none.
- **The placed-piece scale**, and the map scale: both scale the drawn geometry
  and the collision together, so neither can move them apart.
- **A single constant.** The factor each map would need runs continuously from
  0.18 to 2.87 rather than clustering on powers of two, and the `.col2` header's
  two unknown fields do not predict it.

---

## 6. A field's doorways stand on its ground — **resolved 12 September, confirmed 14 September**

**Resolved by the scale fix of 12 September (§0), and measured again on the
14th.** A field's collision and terrain had both been read at half their size.
Read at their own, and asked of every one of the cartridge's 663 maps through
the game's own loader, **113 of the 124 field doorways have ground under
them** — against 24.4% inside the collision below — and every other kind of map
97.9% or more. Angel Falls field's three all do: back to the village, to `D01`
and to `S01M01`. And `apps/game/test/travel.test.ts` walks the character from
where the road out of the village puts them down to both of the others,
moving only by the controller's `step`, as the game moves them.

The 11 without floor are far from the slice: nine lead to `O00`, from `F44`,
`F56`, `F99` and its two sub-maps, and one each is in `F07` and `F27`. The game
puts the character on the nearest ground there, as for any arrival. Nothing of
this waits on the emulator any more. `S01M01` is M7's mountain pass,
INFERRED — see "Ivor is found" at the top.

What follows was measured with a field's collision at half its size, and is
kept for what it ruled out.

Measured further, and the finding is that **this was the wrong way round**. The
field's collision is not missing or partial: its drawn terrain is a grid of
tile models — `F01M<row><col>00`, 21 tiles, each authored in world coordinates —
spanning x −7.08 to 7.36, and its one collision mesh spans −6.00 to 6.42. The
same place. Collision covers the field.

What is outside is the doorways. Across every map with both collision and a link
table:

| map code | doorways inside their own collision box | of the rest: median, max |
|---|---|---|
| `C` `H` `M` `R` `S` `T` | 100% | — |
| `D` | 99.5% | 0.13 |
| `X` | 90.5% | 3.04, 4.81 |
| **`F` — fields** | **24.4%** | **3.33, 11.56** |

A field is about 14 units across, so 11.56 units outside is most of a map's
width — too far to be an edge trigger sitting just past the boundary.

**Next:** unchanged in where it goes, sharper in what to ask. Not "where is the
field's walkable ground" — it is there — but **why a field's doorway coordinates
land in a space its own geometry does not cover**. Scale and translation are
both ruled out and written up in `FORMAT.md`. This one wants the emulator, which
`CLAUDE.md` puts outside what is done here.

`apps/game` keeps doing the sensible thing meanwhile: it puts the character on
the walkable ground nearest the arrival and says so on the status line.

---

## 7. The Hero is dressed — **done, 14 September**

The preset table was found (`charapreset.bin`, FORMAT.md "Character presets")
and the Hero is dressed from real parts — see the top. `chooseFigure` is gone.

The hair — a style of 24, a variant `a` to `e` and a colour of up to ten — is
the player's choice at character creation, which the slice leaves out, so the
fixed choice in `hero.ts` is the slice's preset appearance, not a gap. For
drawing the presets themselves, the two 90xx values beside each outfit are
the lead: the second lands on a face on all 41 presets; the first — 9023, 9024
and 9030 to 9033 — is not a hair style by number, times ten or otherwise.

---

## The rest of a map archive is now written down

Not a defect, and the one thing this round finished. **Every small file in a map
archive is the same tagged data table** — `.bmdj`, `.bmbl`, `.dat`, `.bats`,
`.bcfg`, `.bpos` and `.bmed` all parse as one, so a reader for one is a reader
for all. `packages/game-formats/FORMAT.md` now has a section on each:

- **`.dat`** names the region a map belongs to. 400 of 657 name the file's own
  area, 150 name `T00` which the index does not have, and 107 name another map
  — dungeon maps naming the overworld field they sit in, `B01M28` to `B01M30`
  naming `F16`, *Hermany*. Those maps' own index entries carry **no region**, so
  the `.dat` supplies what the index leaves blank.
- **`.bats`** is per-slot colour and lighting: records of 12, 15 and 18 values
  mixing floats near 1.0 and `fx16` values that read as intensities.
- **`.bcfg`** lists a piece's named states — `open`, `closed`, `opend`,
  `close` — beside the `G1` gate and door pieces.
- **`.bpos`** is an 11 by 18 grid of four-character codes, on the five `Z` maps
  only.
- **`.bmed`** describes the `E1` pieces, and names a `.chr` archive for each.

And `nitro-gfx/FORMAT.md` now lists all six Nitro containers with their stamps
and blocks. Three of them are not read at all — `.nsbta` (`SRT0`), `.nsbtp`
(`PAT0`) and `.nsbma` (`MAT0`), **1,910 files in the map archives** against
4,358 models. Roughly one animated thing for every two models, so anything that
scrolls or pulses in a map is currently still.

## Not defects, but worth doing

- ~~**A doorway costs about three seconds**~~ — **done**. The walk and the
  catalogue are 1.4 of the 1.5 seconds a load takes in Node, and none of it
  depends on the map: the same leaves, the same character parts, every map's
  manifests. `load` now keeps that walk against the cartridge itself, weakly and
  by the paths walked, and folds in only the map's own cast list — which is
  asked for by name and costs milliseconds. A doorway went from about 1,500 ms
  to **70**, and a map already visited to **40**.
- **A foothold for the disassembly**, if that session ever happens: the ARM9 is
  BLZ-compressed, 638,216 bytes at ROM offset `0x4000`, decompressing to
  1,000,984, and carries the sprite loader's own path strings —
  `/data/ani/d_%c%03d.spr` at `0x20ef20b`, `data/chara_sub/%s.chr` at
  `0x20efdc4`. Nothing has been disassembled and no behaviour is claimed.

---

## How to check nothing has broken

```sh
npx biome check .
npx tsc --build
npx vitest run                                     # 717 unit tests
MINSTREL_TEST_ROM=rom/<your>.nds npx vitest run    # 787, the extra 70 on a cartridge
```

The cartridge tests are seconds each and slower again under load; they carry
their own timeout for that reason. Run them on their own if they wobble.
