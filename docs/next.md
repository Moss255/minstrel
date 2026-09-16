# Where to pick up

Written 10 September 2026 against `2c8fd7f`, and revised the same day: items 1
and 2 are done, item 3 has been measured further and the question has moved, and
the doorway cost is gone. The evidence behind each is in
`packages/game-formats/FORMAT.md`; this is the short version and what to do next.

Ordered by what is blocking the milestone, not by how interesting it is.

---

## What is still open — 16 September, at the end of M8

This replaces the list of 15 September. Each gap's evidence is in the section
it names, below.

**Where the milestones stand.** M0–M2 are done. M3 plays the whole story from
the Guardian statue scene at 2.1 to Patty's rescue, moved on by the trigger
records, with the scenes' cameras, fades, motions and figures read from their
scripts; M4 has shops, the inn, saving and equipment with its numbers; M5 has
battles, spells, states, monsters acting and a party of up to four; M6 has the
field's monsters, the marsh and Ivor following; M7 is complete — the pass, the
Hexagon, Hexagoon, Patty and the title card — and walked start to finish by the
tester. **M8 is done**: the music and each map's track, the scenes' effects
and jingles, the controls panel, the text speed, the licence and the guide,
and the cartridge checked and kept. The slice's definition of done is met,
with the one reading that "converted and cached" became "kept, unconverted"
at the owner's word. What is left is what an ear or the emulator settles.

**Against the definition of done:**

| | | |
|---|---|---|
| 1 | the ROM's hash checked, its assets converted and cached | the hash is checked; the cartridge itself is kept in the browser, and nothing is converted — by the owner's word, the game reads the ROM |
| 2 | wake in Erinn's house and explore all of Angel Falls | yes; the slice opens a day earlier, at the statue, as the game does |
| 3 | NPCs, shops, the inn and the save point work | mostly: 17 to 20 of the 20 to 22 villagers at each stage have their line; the inn's price is a stand-in |
| 4 | fight, level up, buy and equip gear | yes; equipment changes the numbers and is drawn on the Hero and Ivor |
| 5 | cross the pass, clear the Hexagon, beat Hexagoon, rescue Patty | yes, played through by the tester |
| 6 | the monitor's resolution, widescreen, remappable input | yes: resolution and widescreen, and the controls panel remaps keys and pad |

**Open, by milestone:**

| gap | milestone | what it needs |
|---|---|---|
| **Music: the tempo** | M8 | See "The music plays". The tempo waits on an ear with the `?tempo=` knob. Which track plays where is read now, from the map index. Then the menus' sounds (`728`? `712`?), the three streams, and fades on a map change. |
| The rest of M8 | M8 | Done: the hash check and the kept cartridge, input remapping, text speed, the scenes' effects and jingles, which track plays where, the licence and contribution guide. |
| The scenes' rough edges | M3 | The camera's pace over a move and its field of view, both waiting on a measurement against the let's play; `223`, 14 calls, unread. Done: who shows (`570`), Ivor's faces (`235`), sprites walking, doorway fades. |
| The time of day | M6 | Done as the let's play has it: the evening and night of 2.2, with the night pieces, the night lines and the night's zone. Open: how the game keeps time, and what ends the night; the field's seconds are not saved. |
| Equipment's rest | M4 | The layouts (`lay_eq.lia`), and rarity and "Used by", which want the emulator. Done: the figure on the equipment screen; a shield on the back seen. |
| What battles still lack | M5 | Dazzle, sand and Weird Dance, read and not modelled; `calls for backup`; how the monsters weight their ways. Done: the damage checked against the let's play, the fight winnable from level 5 as the video won it, each action's own opening line. |
| M4's stand-ins | M4 | `INN_PRICE` — no table on the cartridge; the binaries or the emulator. Done, as ours: Evac to the region's outside, holy water's calm. The wing's one destination is the slice's. |
| The top screen's rest | M6 | Done: the place's name tab. HP, MP and the level are not on the game's field panel; the fuller panel in the sprite set is for a screen not seen; the `.bmmp` tags left are constant. |
| The explorer | explorer | Done: cell sets and the SDATs' sequences and effects. Left: lone tile sheets, textures on their own, streams, a Worker for the scan. |

**Needs the emulator — questions to bring to it:**

- **The tempo of one track against ours** — and whether the village's theme
  carries on into a house unbroken or starts again, and what the church plays.
- **Equipment's numbers, a check now they are read**: a copper sword's attack
  should be 7, a leather shield's defence 3. Rarity and "Used by" are not
  found: open the equipment screen on the Flame shield (defence 18, rarity 1),
  search RAM for its id, `8E 53`, and look for 18 and 1 near it.
- **A party member's colour** on the top screen: how the game picks each one's
  strip and dot, which in the capture of Stornway's church are the characters'
  own and none of the panel's four.
- **Ivor's numbers**: in a battle beside him, his HP — 25 if `attnpc`'s numbers
  are in the level tables' order.
- **How a monster chooses**: the weights for its six ways; the critical chance;
  fleeing's chance.
- **The Hero's vocation, and a level-1 status screen**, to settle which
  level-table columns are which.
- **Which treasure kind is the pot** and which the barrel.
- **The inn's price**, if it is not found in code.
- **Whether Ivor's greeting plays as the Hero comes near** or only when he is
  talked to.
- **Which zone roams when and where**, and whether the mix changes at night —
  ours takes kind 0 by day, 1 at dusk, 2 by night. And **what ends the night
  of 2.2**: sleeping, or time.

**Where to start next time:** the tempo, with the knob; M8 is otherwise done.

---

## The cartridge checked and kept — 16 September

**The last of M8's definition of done.** A dropped dump is hashed with the
platform's SHA-1 (`cartridge-id.ts`) and checked against the reference —
the dump the slice was read from: `ff761d34…`, 268,435,456 bytes, game code
`YDQP` — and the start screen says which of three it is: the reference, the
same title but another dump (by the game code; another region's, trimmed,
patched — "what was read here may differ"), or something else. Nothing of
the cartridge is in the code but the hash, the size and the code.

**Kept, not converted.** The file itself, whole, goes into the browser's
IndexedDB (`cartridge-store.ts`) and is offered on the next visit — "Load
it" / "Forget it" — so the game reads the cartridge's own formats from that
file every time, as it does on a first drop. There is no middle format, on
purpose: the owner's word, 16 September, and the repository's first rule.
What is derived at runtime — catalogues, decoded models, textures, waves —
lives in memory for the session, as before; a map opens in under two
seconds from the cartridge, so nothing more is cached. `?keep=1` on a
`?rom=` address keeps that one too, for checking the path headless.

---

## The explorer hears and sees in 2D — 16 September

**Sound in the explorer**: every `SDAT` the cartridge holds is listed by its
named sequences and its sequence archives (an archive's first filled entry),
each played on selection through `@minstrel/audio`'s sequencer in an
AudioWorklet — the game's own, game-agnostic; a stop/play button, and the
worklet's report (ticks, seconds) shown under the name. **Cell sets**: an
`NCER` with an `NCGR` and `NCLR` under the same name is one entry, every cell
drawn with `drawCell` into the grid the sprite sheets use. Both are any
cartridge's formats; nothing of one title is in the explorer for them (the
`.spr` sheets, which are this title's, were there already). **Seen headless**:
`obj_minimap`'s 44 cells, and `BG_001` playing. **Left:** lone `NCGR`+`NCLR`
tile sheets, `NSBTX` textures on their own, streams (`STRM`), and moving the
scan into a Worker.

---

## The stand-ins: Evac, holy water, the inn's price — 16 September

**Evac and holy water do something now — ours, both**, their records saying
nothing of what they do (no effect, no range, no message; only how they
open). Evac, cast in a dungeon's rooms — the `D` maps' — takes the Hero for
its 3 MP to the place's outside: the map the index labels "Exterior" in the
same place, `D01` for the Hexagon's rooms (`Loaded.regionExterior`), the
place being the region's name before its " - B1" — the index names each
floor "The Hexagon - B1" (INFERRED, thin; the corner's tab names the place
the same way) — at its entrance; anywhere else it says "But nothing happens"
and costs nothing. Holy water,
sprinkled in `actmsg` 362's words, keeps the field's monsters away for a
minute (`HOLY_WATER_CALM`), where the game's keeps the weaker ones off for a
while; the duration and the "all of them" are ours.

**The chimaera wing's destination stays as it was**: the slice has one town,
and the game's list of places is not read.

**The inn's price stays a stand-in**, 10 G. Looked for again: `str_inn.bin`
is empty; `shopdata1.bin`'s 37 shops are the `<SHOP=n>` table and hold no
inn; the innkeeper's `<INN=1>` and `<INN=2>` select something not
established, and no file on the cartridge names an inn or a price. The
number is the engine's — a table in the binaries, or the emulator.

---

## The map corner's tab — 16 September

**The place's name in a tab** at the picture's top right (`drawTab`,
`minimap.ts`): the map index's region — "Angel Falls" in the village and its
houses, "Angel Falls Region" on the pass, "The Hexagon" — set in the strips'
own face. The capture of Stornway's church shows the tab, dark with a light
edge and the name in white; its place, size and colours are taken from it by
eye, ours. The sprite set has no tab of its own.

**HP, MP and the level on the field's panel: not the game's.** The capture
shows the party's strips with their names alone, and so does the let's play
wherever its map screen shows. The sprite set does hold a fuller panel
(`obj_minimap` cell 2, 64 × 64: the name strip over HP and MP bars) and the
digits 0–9, +1 to +9 and a star — for a screen not seen here, unread. The
`.bmmp` tags `0x65`, `0x67`, `0x68` are constant and `0x6d` all but, so there
is nothing in them to read.

---

## Battles against the let's play, and how an action opens — 16 September

**The damage formula holds against the video.** The fourth let's play,
read at the top screen through the Hexagon and its boss, shows the Hero's
blows and the monsters': 8 and 9 to drackies at level 5 with the copper
sword, 4 to the mecha-mynah at level 6, 10 to the hexagoon at level 7 with
the feather fan, and 1 from a dracky and 5 from the hexagoon on the Hero in
the celestial kit, bandana and leather shield. Every one falls inside what
`physicalDamage` draws from the cartridge's own numbers — 8–11, 3–6, 8–12,
0–1 and 5–8 — and a gated test keeps it so
(`tools/harness/test/lets-play.test.ts`: the video's numbers in the test,
the cartridge's read when it runs). **The fight is winnable as the video
won it**: simulated 2,000 times a level, solo, healing under 16 HP, the Hero
beats the hexagoon every time from level 5 up — 15 rounds and 3 Heals at 5,
11 rounds and 1 at 7 — where the docs had it played at level 20 here.

**How an action opens is read** (`Action.opening`, game-formats' FORMAT.md,
"Actions"; INFERRED, 669 of 681 indexing `actmsg`): bits 10–19 of the word
at `+0x20`, beside the message: 1 `attacks`, 45 `flees`, 46 `casts <ACTION>`
on 83 spells, 70 `uses <item>` on the herbs, 15 `does the <ACTION>!`, and the
monsters' unnamed moves' own lines — the hexagoon's 546 says 394, **`sends
rubble raining down`**, as the video does. The battle now says each action's
own opening instead of choosing cast, used or nothing by its shape; a
monster's idle ways — effect 0, the sanguini's 364 `is just fluffing around`,
the bag o' laughs' 366 `is assessing the situation` — are a turn spent saying
so (`wait`, in the sim) where they were attacks.

**Read now, not modelled:** Dazzle, 59, `starts to hallucinate`; the
sacksquatch's 323, `spews forth a cloud of sand` … `gets sand in his eyes`;
Weird Dance, 243, `MP decrease by <val_1>`; the bag o' laughs' 344, `calls
for backup`. The first three are the states the reference does not model and
the last brings a monster the sim has no way to add; each still lands as an
attack. **Abilities** are the vocations' skills, out of the slice. **Not
read:** how a monster weights its six ways (the reference's even table
stands), the critical and flee chances.

---

## Equipment: the figure on the screen, and a shield seen — 16 September

**The equipment screen's figure** (`heroPortrait`, `main.ts`; `PORTRAIT` in
`equip-screen.ts`): the Hero as they stand dressed, facing out, drawn by a
second renderer onto a clear ground (`ModelRenderer`'s new `transparent`
option) and laid on the bottom screen's left half above the name plate,
where the screenshots have it. The figure and its dress are the game's; the
framing — the camera at the waist, a figure and a quarter away — and the
frame's place are ours. **Seen headless**: the Hero with the copper sword
and the catty shield on the screen.

**A shield on the Hero's back, seen at last**: `?wear=21003` (a debugging
aid, ours: the items put in the bag and worn on load) shows the catty shield
upright behind the left hip as `BACK_TURNS` places it. On the way: itemsort's
`unknown_1` runs 1 to 628 across the equipment in table order — an ordering,
not the worn part's number, which stays the item's own (35 of 45 shields
and 148 of 228 weapons have a part by it; 9 and 56 by `unknown_1`).

**What an empty slot shows** (`BARE_OUTFIT`, `hero.ts`; the tester found
the suit staying on when taken off). A slot with nothing in it used to keep
the Hero's starting piece, there being no bare body known. There is one:
of the cartridge's 192 body models, 79 legwear models and 89 footwear
textures, 36, 2 and 2 have no item behind their number, and **090 is the one
number all three share** — `p_b090`, `p_p090`, `p_r090`: a blue vest, shorts
and bare feet, seen headless on the Hero in the field and on the screen
with every slot emptied. INFERRED from the parts alone; a cartridge without
them keeps the starting piece. A weapon or shield taken off was already
leaving the model.

**Still open:** the layouts (`lay_eq.lia`, `lay_iie.lia`), which would give
the screen's exact places instead of the screenshots'; rarity and "Used by",
which no file on the cartridge holds beside the item and want the emulator.

---

## The time of day — 16 September

**Ours, from the let's plays** (`daytime.ts`). Read at the top screen: the
day at 2.1 and its village stay daylight through twelve minutes of talking
and shopping; at 2.2, after Hugo at the gate, the field is daylight at 33:00,
dusk by 35:20 and night by 35:40 — the bodkin archer under a starry sky — and
the village is dark at 38:40; the fourth video's twenty minutes of field and
Hexagon at 2.3 and 2.4 never turn. So the turn is the story's evening, not a
clock: **at 2.2 the time runs with the seconds spent in the field** — dusk
after 120, night after 150, the video's own spacing — and at every other
stage it is day; a night at the inn brings the morning. How the game keeps
time is not read, and nor is what ends that night in the game — the let's
play's next video opens by day.

**Shown:** the view is multiplied by a colour (`#tint`) — white by day, a
warm dimming at dusk, a dark blue by night, set by eye against the frames
(the night field's grass a fifth as red and a third as green as by day);
into and out of the night the map is rebuilt where the Hero stands with its
**night pieces**, the lit windows the manifest already carried
(`lighting: 'night'`); the villagers say their **night lines** (the
four-number form, read before); and the field's monsters roam by the time's
zone kind — 0 by day, 1 at dusk, 2 by night (`ZONE_KIND_BY_TIME`; INFERRED,
thin: the one bodkin archer, only after dark, is in `F01`'s kind-2 zone, the
only zone with one). `?time=evening` forces a time. **Not kept in the save:**
the field's seconds — a game saved at 2.2 wakes to day. **Seen headless:**
the village and the pass by night, the village at dusk.

---

## Scenes: who shows, Ivor's faces, sprites walking, doors fading — 16 September

**Three more script functions read** (`event.ts`'s header; INFERRED, from
every event's calls):

- **`570(character, shown)` hides and shows a character.** 5,395 calls: a
  hidden character is put somewhere (`206`) 242 times before it is shown,
  1,080 of the 2,935 hidings are never undone — a scene's double gone at its
  end — and the Hero is shown, `570(0, 1)`, on the last frame of most scenes.
  The Hexagon's effect on `ev02350` is hidden on frame 18, shown 51 to 108.
  Scene characters `570` has hidden are no longer drawn.
- **`235(character, character, bone)` hangs one character on another's
  bone**: "head" on 280 of 325 calls, and the hung one is a face — the
  `sNNNfNN.chr` models, one material and one bone each, 86 of them, whose one
  texture is a variant of the parent's (`s017_00_f02`). Ivor's `s017f02` on
  `ev02210`, shown by `570` from frame 172 to 179, seen in the browser: a
  second expression over his head. Drawn as a **decal** — the renderer's new
  pass, pulled a hair towards the camera over the head it lies on; ours. A
  face hung on the Hero is not drawn: the Hero is the figure, not a scene
  model.
- **`571(character, flag)`, thin:** taken to be solidity — 0 on 1,660 of
  2,011 is never undone, and where it is, a `207` walk lies between 470
  times, a character let through others as it walks. Read and not acted on;
  the scene needs nothing of it. Out of `unhandled` either way.

**Sprite characters walk in scenes** (`walkingFrame`, `cast.ts`): while a
`207` has one on its way, the sheet's walk nearest its facing relative to
the camera plays, its steps round in the order the sheet names them, each
held its own duration — 8 ticks on a villager's. The sheet is read; that a
scene's walk runs on the scene's frames is ours. Not yet watched in the
browser — the Hexagon's figure walks in `ev02510`, and the shot at the
frames tried looked elsewhere.

**Doorways fade** (`doorFade`, `main.ts`; ours, the let's play showing a
fade through every door): the screen goes black over a quarter of a second,
the map changes behind it — the load blocks, and the screen stays black for
it — and the field comes back over the same three tenths a scene's end has,
without its hold.

**Not touched:** the camera's pace over a `304`/`311` move — ours is even,
and whether the game's eases is a thing to measure against the let's play at
its twelve frames a second — and the field of view, 50° vertical, which needs
a known object's size on the DS's screen. Both wait on a measurement, not on
code.

---

## The licence and the contribution guide — 16 September

**Both written.** `LICENSE.md` says which packages are MIT — the parsers and
tools, so any DS tool can use them — and which GPL-3.0-or-later — the engine
and both apps — with the texts in `LICENSES/` and a copy in every workspace
package as its `LICENSE`, matching the `license` field each `package.json`
already carried. The copyright line names "the minstrel authors", the people
in the commit history, rather than a person; change it if a name is wanted.
`CONTRIBUTING.md` puts the three hard rules in front of people as `CLAUDE.md`
puts them in front of the tooling, with the setup, the package boundaries,
the two habits worth naming (say what was read and what is ours; every
parser has a `FORMAT.md`), what a pull request needs, findings without code,
and what will not be merged. The README links both and gains `@minstrel/script`
and `tools/sprite` in its table.

---

## Which track plays where — 16 September

**Found in the map index** (`maplist9.bin`, `MapEntry.music`, slot 6 of the
22; `packages/game-formats/FORMAT.md`, "The music"). Not `712`, which the
lead named: its 452 calls repeat one value ten times in a scene and take a
variable as a second argument, which is no way to start a track — it is
some other sound. **INFERRED from the values alone, no code read:** on every
one of the 871 shipping maps the slot holds an index into `bgm.sdat`'s
sequence list — 844 with a file, 25 the grotto boss floors' 80, which is
`BG_100` and pins the numbering, and 2 an index with no file — and the
values follow the labels: all nine churches and the chapel 10 and nothing
else; the castle 11; the observatory 12; the abbey 13; the 85 field regions
14; the ship 17; 94 dungeon maps 19; the grottoes 22; every `B01` battle
stage 23; the `B02` boss stages 24; each of the twelve legacy bosses' stages
its own, 27 to 38, in the bosses' order.

**For the slice:** Angel Falls and its houses `BG_005`, the church
`BG_010`, the region round it `BG_014`, the Hexagon `BG_019`, battles
`BG_023`, Hexagoon `BG_024` (`B02M15`, "D01 - Hexagoon"). **Played:** a map's
track starts on entering it (`playMapMusic`); a battle's on starting it,
the boss stage's for a set battle in a dungeon with one (`Loaded.bossMusic`);
the map's again after. **Ours:** a map naming the track already playing lets
it run on, so the theme carries into the houses; after a battle it starts
again; `b` stops and starts it; `?bgm=` overrides. **Not read:** which `B01`
stage a field's battle is on — they all name 23, so it makes no difference to
the music; whether the time of day or the story changes a track;
`mapbgm.bin`'s 68 records, whose values `0x0580`–`0x0857` are not sequence
indices. **Checked headless:** `M01` plays `BG_005`, `M01M06` `BG_010`, `F01`
`BG_014`, `D01` `BG_019`. **Not heard.**

---

## The scenes sound, and the text has a speed — 16 September

**Sound effects and jingles** (`ssar.ts`, `packages/audio`, `music.ts`,
`event.ts`). The sequence archive, `SSAR`, is read from Gota7's specification
(`packages/nitro-snd/FORMAT.md`, "SSAR"): many short sequences in one command
stream, each entry with its own bank and volume. `se_norm.sdat` holds 279 of
them with a file, `se_btl.sdat` 481, and every one reads. **INFERRED, with
the counts in `event.ts`'s header:** `726(n)` sounds `se_norm` archive `n` —
all 240 distinct values are such indices; `730` likewise; `720(n)` plays
`bgm.sdat`'s sequence `n`, the six values falling among the `ME_` jingles;
`727` on a scene's last frame and `729(0, frames)` stop the sounds. Ivor's
"Hero!" scenes sound `ME_006`; the statue sounds 204, the Hexagon's figure
261, 208 and the switch 225.

**Played:** `Ensemble` in `render.ts` — the music's sequencer and four
effect sequencers mixed together, an effect taking a free voice or the one
that has played longest; a jingle pauses the music (its notes released, its
tracks kept) and lets it go on after. The sequencer takes a `start` offset
into the stream. The worklet takes `effect`, `jingle` and `stop-effects`
messages and reports how many effects sound. **Ours:** which of an archive's
filled slots plays — they are variants, the same phrase at rising keys or
softer, and the first is taken; sixteen channels for every voice where the
DS shared sixteen by priority; no fade on `729`; the menus' sounds, which no
script calls, are not found — `728(n)`, 1,174 calls with small values, 0 to
36, may be them by a table, and `712`, `713`, `721`, `723` and `731` are not
read either. `?se=113` or `?se=113:2` sounds an archive, or a slot of it, on
load, for finding them by ear.

**Checked:** 44 audio and sound tests, the ensemble's among them; every
effect renders; 72 of the 279 hold a looping wave until stopped, which FSS
also does (`Track_Run`'s `END` only marks the track), and 134 of the 137
scenes sounding one call `727` after — so `727` releases them. In headless
Chrome the worklet runs with an effect sounding. **Not heard.**

**Text speed** (`settings.ts`; ours): slow, normal, fast or instant — 20, 45,
90 characters a second or the page whole — set at the foot of the controls
panel (`k`, then ←/→ on the last row) and kept in the browser under
`minstrel.settings`. A page comes up a character at a time; confirm while it
is still coming shows the rest. The game's own message speeds are not read.

**The README** now says where the slice stands, lists `@minstrel/audio`, and
gives the keys and the address parameters.

---

## The Hero runs, and the sword rides the hips — 16 September

**Found by the tester:** the walk did not match the game, nor did the sword's
place. The let's play, read at twelve frames a second (`evidence/`, not kept):

- **The Hero runs everywhere** — field and village alike, leaning forward,
  arms pumping, the legs alternating on every frame. The cartridge's `run` is
  13 frames looped, which at the DS's 30 frames a second is 2.3 cycles, four
  and a half steps, a second: the gait in the video. So `run` plays while the
  Hero moves, on time like every other motion (`motion.ts`), and the tuned
  stride that paced `walk` by ground covered is gone — the rate is the game's,
  the stride was ours. Whoever follows runs too. **Ours, kept:** a Hero pushing
  against a wall holds still rather than running on the spot.
- **The sword lies across the back**, grip up over the right shoulder — that
  is what shows from the front — and blade down to the left hip, **flat against
  the back whatever the legs do**; a shield stands upright at the left side.
  Read wrong three times first: hung from the hip, then from the back, then
  blade up; the tester's eye settled it. The first video's statue scene, seen
  over the Hero's shoulder, is the plain view. So both hang from `usiro`, the rig's bone
  behind the shoulders, which moves with the trunk and not the hips (`hero.ts`,
  `Carry`) — hung from the waist first, they swung with the run. The angle, 50°
  below level, and the offsets are matched by eye — ours.

**Seen in the browser:** the sword across the hips from behind; the run
mid-stride. **Not measured:** the Hero's speed over the ground against the
video's — `WALK_HEIGHTS_PER_SECOND`, 3, is still the old tuned figure, and the
feet slide against the run's own 0.405 heights a cycle by about 3×, as the
DS's chibi run may well do too. The video could settle it: a landmark passed
against the Hero's own height.

---

## The controls can be changed — 16 September

**M8's remappable input** (`controls.ts`, `controls-panel.ts`; ours, all of
it — the DS had one layout). The game asks for actions, not keys: up, down,
left, right, confirm, cancel, menu, map, music. Each has the keys and the
standard-layout pad buttons bound to it; the defaults are the keys the game
has always read (`WASD` and the arrows, `f` and Enter, Esc, `x`, `m`, `b`)
and the usual pad — d-pad, the bottom face button to confirm, the right one
to cancel, Start for the menu, Select for the map, the top face button for
music. `k` opens the panel: arrows choose a row, Enter waits for a key or a
pad button and binds it (taking it from any other action), Backspace clears,
`r` restores the defaults, Esc closes; a row can be clicked too. The panel's
own keys are fixed, so no layout can lock it, and a saved layout with an action
left keyless falls back to the defaults. Changes are kept in the browser under
`minstrel.controls`.

**The pad's buttons now act**: before, only its sticks were read. A press fires
its action once as it goes down; the d-pad walks while held.

**Moved:** the chapter-flicking development keys were `v` and `b`; `b` is music,
so they are `v` and `n` now.

**Left:** the sticks' axes are still chosen by `?axes=` and `?lookbuttons=`,
not in the panel; text speed and the two-screen layout, which M8 also asks
for, are not started.

---

## The music plays — 15 September

**M8's first piece, begun.** `bgm.sdat`'s tracks play in the browser through an
AudioWorklet: `?bgm=BG_001` starts one, `b` starts or stops it. Which track
plays where is still unread — `mapbgm.bin` was looked at in M0 and is not it —
so a track is chosen by name for now.

**Read, with its sources** (`packages/nitro-snd/FORMAT.md`, "The files
inside"): SSEQ, SBNK and SWAR, from Gota7's *Nitro Studio 2* specifications
and fincs's FeOS Sound System; IMA-ADPCM from GBATEK. On the cartridge, all
64 sequences read, every one of their 2,079 PCM notes resolves to a wave, and
every wave decodes.

**Played, with its sources** (`packages/audio`, GPL): the sequencer follows
FSS's `Track_Run` and `Note_On` — 192 driver ticks a second, a tempo count of
240, note-wait and tie, the shared call and loop stack, the envelope in
loudness with seven fractional bits, the LFO, portamento and `Timer_Adjust`,
which FSS took from the SDK driver's disassembly. The channel mixing follows
GBATEK's registers as melonDS reads them: volume over 128, the divider, pan as
`(128 − pan) / 128` and `pan / 128`. The BIOS tables are generated from
formulas checked against a dump: the pitch and sine tables exactly, the volume
table on 721 of 724 entries with the three exceptions set by hand.

**Ours:** samples read between the wave's own by a straight line, where the
hardware holds each; the SDAT sequence record's volume applied as the player's
volume; the `?bgm=` and `b` choice; the fade the page can ask for. **Checked:**
39 unit tests on synthetic songs — a note's length and pitch, loops, calls,
tracks, volume, pan, tie, release, and mixing at 32768 and 48000 Hz; `BG_001`
rendered offline is sound throughout at 0.2 RMS with 13 clipped samples in
20 seconds; in headless Chrome the context runs and the worklet's ticks climb
at the track's tempo. **Not checked:** by ear. Nobody here has heard it.

**The tempo is in question — 16 September.** Heard, the tempo "seems a bit
off". Checked and consistent with the references on every side: the player
makes exactly tempo × 0.8 sequence ticks a second on four tracks — the tempo
value read as beats a minute at 48 ticks a beat, as FSS plays it and as
VGMTrans and sseq2mid write MIDI from it; `BG_001`'s stream disassembles
cleanly (many tempo commands, 126, 139, 83 …, a written rubato, not a desync);
and in the browser the worklet's frames and ticks run at the rates the maths
gives. So the fault, if there is one, is in the reading and not the code, and
only an ear can place it. **To finish:** `?bgm=BG_001&tempo=0.8` and `1.25`
scale the tempo through the driver's own `tempoRate` (FSS's 8.8 multiplier,
`Sequencer.tempoRate`); the value that sounds right says what is wrong — 0.5
or 2 the 192 Hz tick rate, 0.8 or 1.2 a tempo unit — and then the game's own
rule for it is to be found, not the factor kept. Pitch is worth judging at the
same time: a misread sample rate can pass for tempo.

**Left:** which track plays where — the video has no sound, so that needs
either the emulator or a table not yet found (found the next day, in the map
index: "Which track plays where"); sound effects, which are 1,398 sequence
archives (`SSAR`) in `se_norm.sdat` and `se_btl.sdat`, and the events' `720`
(done: "The scenes sound"); the three streams; fading between tracks on a
map change.

**Also on the way:** `pnpm typecheck`, which checks the game app too, had six
old errors in tests and one call; all fixed. `tsc -b` at the root does not
cover the app.

---

## The Hero and Ivor in what they wear and wield — 15 September

**Brought into the slice** at the owner's word (CLAUDE.md, the slice plan):
equipment drawn on the Hero and Ivor, which the plan had left out.

**Read** (game-formats' FORMAT.md, "Character parts"; INFERRED): a weapon,
`p_w<nnn>`, and a shield, `p_s<nnn>`, are parts of one bone of their own,
numbered as their items are — the copper sword `p_w004`, the pot lid `p_s296`.
The Hero's rig has, besides its limbs, a bone behind the shoulders called
`usiro`, Japanese for behind. A shield is modelled lying along the forearm: from
the forearm bone `arm1L`'s origin, the elbow, it runs along the arm to the wrist,
on its outer side.

**What a let's play shows:** in battle the Hero holds the copper sword in the
right hand, and Ivor fights with his sword and pot lid; in the Hexagon and at the
inn the Hero carries a shield on the back and a fan at the left side.

**What ours does:**

- The Hero is dressed in what they wear — armour, legwear, footwear, gloves and
  headgear, by their items' parts — and again whenever it changes; a slot with
  nothing in it keeps the starting piece, as no bare body or legs are on the
  cartridge (ours).
- In battle, the weapon hangs from `arm1R` and the shield from `arm1L`, as they
  are modelled; otherwise both hang on `usiro`, **turned by us** — the shield
  stood upright facing out, the weapon pointing down to the left hip — to look as
  the let's play does. The game's own turn is in its code.
- Ivor holds his `attnpc` weapon and shield in battle the same way. His rig has
  no `usiro`, so nothing hangs on him in the field.

**Seen in the browser:** the copper sword hanging behind the Hero in the village;
in a fight with Ivor along, the Hero's sword in hand, and Ivor's sword and pot
lid. **Not seen:** a shield on the Hero's back — the starting kit has none — or
what changing equipment looks like on the equipment screen's figure.

---

## Motions end, lines come before their scenes, and marks show — 15 September

**Motions played once** (`docs/event-scripts.md`, 210 and 224; INFERRED): bit 1
of `210`'s flags plays a motion once — a `224` follows at once 1,471 of the
2,534 with it set, and 21 of the 4,345 without — and it then goes on to the
motion the `224` names, or holds its last frame where none is named (ours). The
morning's `cyotto_loop` and Ivor's `bk` and `talk` on Erinn's doorstep had gone
round for ever.

**A talk record's line before its scene** (game-formats' FORMAT.md, "The
words", 16; INFERRED): the line the character would say is read first and the
scene plays once it is — the inscription's text before `ev02500`, "Press the
button?" before `ev02530`, as the fourth let's play shows — and `16:n` has it
wait for answer n, 0 being Yes: the switch's scene plays on Yes alone. Where no
line has the label, the one that would be said is read — the inscription's
record names label 80 and its one line is 96 (thin: the one such case seen).
**Found on the way:** an answer whose branch says nothing, the statue's
`<YES><END>`, ended the talk and was lost; it is kept now (`answerNow`).

**The marks over the Hero's head** (`bubbles.ts`; INFERRED from the sheets'
names and the let's play): `fuki_com`, a speech bubble, for someone to talk to
in front of them; `fuki_hkn`, "!", for something to examine; `fuki_in` for a
doorway just ahead. When each shows is ours — while nothing else is going on,
for what talking would reach, talking before a door — and so are its steps'
lengths, taken as sixtieths.

**Walked in the browser:** the "!" at the inscription, the speech bubble facing
the Hexagon's figure, and the door mark at Erinn's front door; the inscription
read out and then `ev02500`; the statue's question, Yes playing `ev02530` and No
telling the Hero decides not to press it. **Not walked:** the morning and Ivor's
call — that their motions now end is tested, not watched.

**Left:** sprite characters' walking frames in scenes; who is shown and hidden
when (`570`, `571`, `223`); a fade on going through a doorway, which the let's
play shows; equipment on the party, out of the slice as its plan stands.

---

## Scenes fade to black and back — 15 September

**Read** (`docs/event-scripts.md`, 101, 120 and 121, 560; INFERRED):

- `101(n)` fades the screen to black over n frames and `121(n)` back from it;
  the script waits n frames after each. The commonest shape, 188 scenes: 101 as
  it opens, `120(0)` and 121 once the scene is set, 101 as it ends. The fourth
  let's play shows `ev02510` darkening as it opens and as it ends, and
  `ev02500` as it ends.
- `560` answers whether the scene carries straight on from a conversation:
  answering 1, 100 of the 118 scenes that ask skip their opening fade, and 89
  of those are begun by talking or examining. The let's play's `ev02500` and
  `ev02520`, begun so, do not fade in.

**Ours:** a black cover over the 3D view alone, the text box and map above it;
`560` answering 1 only for a scene a talk record plays; and after a scene that
ends in the dark, the field coming back after half a second of black, over a
third of one — the let's play's measure, not the game's code.

**Checked in the browser**, by reading the cover's opacity from the page as the
scenes play (the screenshot tool's new `--eval`), since a fade is over before a
screenshot is taken: `ev02510` is black as it opens and clear a quarter of a
second later; `ev02500`, begun by examining, opens with no fade, ends into black,
holds, and the field comes back.

**Left:** `120`, and a fade to any colour but black; a talk record's text before
its event — the let's play reads the inscription out, "Path ahead sealed…",
before `ev02500` plays, and asks "Press the button?" before `ev02530`.

---

## The Hexagon's figure fades in — 15 September

**Read** (`docs/event-scripts.md`, 219, 220 and 566; INFERRED):

- `566(3, file, character)` draws the character from a sprite sheet — all 203
  name a `.spr`; `ev02500`'s figure is `n012g.spr`.
- `219(character, n)` sets how much of it shows and `220(character, n,
  frames)` fades it there, n from 0 to 31 — the DS's 5-bit polygon alpha: all
  313 of `220`'s targets are whole numbers in that range, and all but three of
  `219`'s 998 (255, taken as whole: ours). `ev02500` sets the figure to 1 and
  fades it to 31 over 90 frames; `ev02520` fades it out, as the fourth let's play
  shows both.

**The renderer** (`@minstrel/gl`) takes a piece's opacity, 0 to 1, and draws
anything under 1 in its blended pass.

**Found on the way, and fixed**: a shot that only moves where the camera looks
— `300`, then `321`, as `ev02500` pans from the Hero to the tile — was aimed
from a distance of 0 since the cameras were read (`c64407a`), and the screen
went black. 19 shots are so, `ev02320` on the pass among them. Such a shot now
keeps the field camera's angle and moves where it looks from where it looked
(`cameraAngled`, `looking` in `event.ts`), as the let's play's pan does.

**Walked in the browser**: examining the inscription at 2.4, step 1, the camera
pans to the empty tile, the figure comes up through half-seen to whole, and
the story moves to step 2. **Not walked**: `ev02320`, or `ev02520`'s fade out.
**Left:** ours plays `ev02500` on examining the inscription at once, where the
let's play reads it first ("Path ahead sealed…"); `223`, which comes with fades,
is not read.

---

## The Hexagon's figure leads the way — 15 September

**Found by the tester**: on the Hexagon's first floor the figure, `204`, stood
on its tile after being talked to, where the fourth let's play has it walk off
through the arch to the statue room and wait there; its "On the… back of…
this statue…" (`ev02520`) and the statue's button follow. Ours left it on the
tile — talked to again there it played on, but nothing led the Hero to it, and
the statue says nothing until step 4.

**Read** (`docs/event-scripts.md`, 566; INFERRED): `566(5, id, character)`
makes an event's character one of the map's cast, by placement id — 186 of the
217 such numbers are in the event's own map's cast. `ev02510`'s `566(5, 204,
1)` is the figure, and its four `207`s walk it to the statue room.

**Ours:** while an event plays, a cast member it has a character for is drawn,
shadowed and talked to where that character is; when it ends, the member stays
where it was left until the story's step next moves or the map changes — over
2.4, step 3, whose records leave the figure in a gap that would stand it on its
tile.

**Walked in the browser**: talked to on its tile at 2.4, step 2, the figure walks
off past the stone table towards the arch with the camera after it, as the let's
play shows, and the story is at step 3 with the tile empty. **Not walked**:
finding it by the statue and talking to it there — no headless walk reaches the
statue room. **Left:** `566`'s form 3, a sprite file — the figure fading in on
`ev02500` is not drawn until that event ends.

---

## Ivor leaves as the records say — 15 September

**Who goes along is the events' records'** (game-formats' FORMAT.md, "The
words", `205` and `204`, and "Attending characters"; INFERRED): an event's own
record brings a character in with `205:n`, n their place in `attnpc` from 0,
and sends whoever goes along away with `204:1`. The three events whose text
says who joins carry that one's place — Ivor `205:1`, Dr Phlegming `205:2`,
Sterling `205:3` — and all six `204`s carry 1. In the slice Ivor joins as his
call ends (`ev02210`), goes on ahead at the pass (`ev22591`), joins again at
the landslide (`ev02350`) and goes home once the mayor has heard the news
(`ev02400`) — as the fourth let's play shows him do.

This replaces ours — Ivor along by stage, over 2.2 once flag 0 was set and all
of 2.3 — which kept him following up the pass after he went ahead, and after
`ev02400`. The party is kept in the save; an older save reads with the Hero
alone.

**Walked in the browser**: in the mayor's house at 2.3 with Ivor along, `ev02400`
plays and goes on to `ev02410`, after which the top screen has the Hero alone,
and Erinn's line is her prayer for Patty. The pass's leave and rejoin are read
and tested on the cartridge, not walked.

**Ours:** `?ivor=1` now opens a game with Ivor in the party, where an event may
send him away, rather than keeping him along; a record's leave is taken before
its join, though none has both. **Not read:** `203`, on the pass's entry
(`203:1`) and the mayor's (`203:0`), and 71 characters' records; the `204`s and
`205`s on characters' records.

---

## The scenes' cameras move — 15 September

**Their characters stand in them** (`63da9ff`): the second event folder dresses
a character by slots — `200` loads a model, `229` its motion packs, `202` puts
it on a character — and Ivor, Hugo and Erinn stand in the statue scene.

**And their cameras move** (`event.ts`, game-formats' FORMAT.md, "The camera,
read further"; INFERRED): `302` is where the camera is, `304` moves it and what
it looks at over so many frames, `311` its yaw, rise and distance, `321` what
it looks at. Reading them showed **310's third number is the straight-line
distance** from what the camera looks at, not the distance across the ground:
so it agrees with where `302` puts the camera on 1,024 of 1,032 shots, where
the ground did on 539. Every event shot is a little steeper for it — the
morning's 37° down, not 31°.

**Not read yet:** a character's `570` and `571` — hide and show, it seemed,
but the measure does not bear it out; Ivor's faces, `s017f01` to `f03`, hung
on his head by `235`; the camera's field of view.

---

## The slice opens at 2.1 — 15 September

**A new game opens in the village at 2.1**, where coming in plays the scene at
the Guardian statue, `ev22590`, by the village's own entry record — as a let's
play of the European release opens it. The morning in Erinn's house, the
opening before, is now reached the way the game reaches it:

- **Areas, and walking into them** (game-formats' FORMAT.md, "The words";
  INFERRED): a map's settings records define boxes — `143 : n` and six floats,
  its greater corner then its lesser, on 108 of 108 — and records of value
  5 = 2 play an event on walking into one, 102 of 110 naming an area their map
  defines. In the mayor's house at 2.1, walking up to him plays his scene with
  Ivor, `ev02120`, which sets flag 1.
- **A talk that goes on**: with flag 1 set, Erinn asks the Hero in for the
  night, and her talk record, `… 177:0 1:0 133:1110 2130:0`, goes on upstairs
  to the morning — when the first answer, Yes, is given. Thin: two records
  carry 177.

**Ours:** an area plays only on walking into it, not while standing in it; its
box is tested across the ground and for any overlap with the Hero's height;
Esc out of Erinn's question does not go on.

---

## The second event folder — 15 September

**`/data/evspt_lv5` holds 164 events** the game did not read: numbered 21500 to
29791, packed as `/data/event`'s are, no number in both. The slice's there: the
scene at the Guardian statue on entering the village at 2.1, `ev22590`;
Patty's talk before the Hexagoon fight, `ev22510`; the pass's `ev22591` and
`ev22592`. Events are now looked for in both folders (game-formats' FORMAT.md,
"Event text").

Their scripts wanted three more readings, each from the cartridge's own use:

- **`0x08` multiplies, `0x09` divides** — 4,761 of the 4,777 multiplies follow
  `1 negate`; `4.5 180 divide 3.14 multiply` turns degrees to radians.
  `0x1D` and `0x1E`, twice each in one event outside the slice, look like a
  sine and a cosine and are not read.
- **Function 840 answers 2**: the second folder's wait doubles its count and
  takes 840's answer off each frame, and the two folders ask for waits of the
  same sizes. INFERRED.
- **An entry record's own flag is set as its event plays**: 7 entry records set
  one, every one guarded by that flag, so each plays once. INFERRED.

Walked in the browser: entering the village at 2.1 plays the statue scene —
the Hero at the statue, its twenty messages — and hands them back there.
Patty's scene plays before the fight. **Not drawn yet**: the characters the
scene brings on (Ivor, Hugo and Erinn, by functions 506 and 507, which load
their event models) and its camera moves (302, 304, 311); 37 functions it
calls are not read.

**Fixed on the way:** the screenshot tool left Chrome running and its profile
behind whenever a run was cut short, and filled the temporary folder; it now
stops Chrome's whole process group and deletes the profile however it ends.

---

## What a let's play showed — 15 September

A let's play of the European release, read frame by frame (not kept in the
repository), covers the slice from the day before our opening to the first
fights and a night back in the village at level 3. **Against ours:**

- **Matches**: the morning, Ivor's call and Hugo at the gate, line for line
  (`ev02130`, `ev02200`, `ev02210`, `ev02220`); the 2.1 villagers' lines;
  Erinn's evening question going on to the morning; attack as strength plus
  the weapon and defence as resilience plus armour — level-1 and level-3 rows
  exactly, and every piece in the village shop; deftness; evasion, whose field
  counts tenths of a percent.
- **The slice opens a day earlier**: at 2.1, with the Guardian statue scene
  and a day in the village; ours opens on the morning.
- **Ivor joins as his call ends** — "Ivor joins" — which is flag 0; ours has
  him following from the start of 2.2.
- **The Hero starts in the Celestial suit, stockings and shoes** as well as the
  copper sword — defence 14, not 8 — **with 180 gold**, not the stand-in 100.
- **Prices**: 11 of the village shop's 18 cost twice the item table's price
  field, 4 ten times it, and 3 one off from twice — so the field is not the
  price as read. **Now read** (15 September): the word after it says which —
  twice, twice and one, twice less one, or ten times — and every sold item it
  marks then costs a round price (game-formats' FORMAT.md, "Items", "The
  price"; INFERRED).
- **Heal comes at level 3**, as the spell table's vocation 6, the Minstrel,
  has it — first misread as level 2 from frames two seconds apart, which ran
  two battles together. Read at two frames a second: the Hero reaches level 2
  after a cruelcumber and learns nothing; the next battle, which the video cuts
  into at its results, brings a level and "learns a new spell: Heal!"; and the
  Hero is level 3 at the shop after, with no level between. The spell lists
  also name the vocations in the level tables' order — Priest, Mage, Paladin,
  Sage, Ranger each by its spells.
- **The time of day moves** — evening before the Hero goes home, night in the
  field — and a bodkin archer turned up only after dark: zone 15, kind 2, the
  only zone with one. One sighting.
- The mayor's scene with Ivor at 2.1 is a value-5 = 2 record, not played here.

---

## The slice plays through — 15 September

**Walked in the browser, one run from a new game**: talking to Patty in the
Hexagon's last room starts set battle 2; Hexagoon falls in four rounds; her
thanks, `ev02550`, play and go on outside to `ev02555`; the story moves to
2.5, and the title card comes up. The run starts at level 20 —
`?map=D01M05&stage=2.4&flags=6&level=20&at=0.13,-1.93` — as a level-1 Hero
alone does not win it pressing Attack.

**For testing, ours:** `?level=20` opens a new game at that level, with its
experience. What level the game expects the fight at, and with whom, is not
read.

---

## The slice's title card — 15 September

**Ours, all of it** (`card.ts`). The slice plan closes the slice with Hexagoon
beaten, Patty rescued and a cut to a title card before Stornway; the records
say when — Patty's thanks after the fight, `ev02550`, go on outside to
`ev02555`, "See ya, sweetie! And thanks a bunch for your help!", whose own
record moves the story to 2.5, step 1. On that move the card comes up: "The
end of the first slice", the slice's name, and a line of ours. It takes every
key until `f`, Enter or Esc puts it away, and the Hexagon is still there to
walk.

Walked in the browser from `ev02555` on — `?map=D01&stage=2.4&event=2555` —
and, since, through the fight to it (see the top).

---

## The Hexagon's statue slides aside — 15 September

The statue on the first floor is a map piece of its own, `D01M01S1`, with its
collision beside it, `D01A01S1` — named as a door is, with `S` for `D`
(game-formats' FORMAT.md, "Sliding pieces"). **It stands where the spot on it
stands**, INFERRED: `202`'s record from step 5 is on the piece's middle to
0.006, and the one before stands 0.431 to the left, in the gap into the room
above. So until the switch is pulled the statue and its collision shut the
gap, and at step 5 they slide aside (`slide.ts`).

Walked in the browser: going straight north through the gap, the Hero stops at
the statue at step 4, and walks through into the room above at step 5.

**Ours:** the slide, at half a world unit a second, its collision going with
it — the game's own slide is in code; `ev02530`, the switch's event, only shakes
the camera (function 321, each call aiming it within 0.01 of the switch).

---

## The Hexagon plays to Hexagoon — 15 September

**What plays now**, moved on by the trigger records (game-formats' FORMAT.md,
"The words", "The placements", "Event battles"; INFERRED throughout):

- **The first floor goes by the story's step.** Examining the spot `202`
  plays `ev02500`: step 2, and a figure, `204`, stands ahead of the entrance.
  Talking to it plays `ev02510` (step 3) and then `ev02520`, "On the back of
  this statue…" (step 4), and it is gone. The switch in the side room, `201`,
  then plays `ev02530`, "There's a noise of something moving somewhere!":
  step 5, and `202` stands 3.47 units along.
- **Patty, in the last room**: `ev02535`, "you couldn't be a hero and shift
  some of this rubble for me", sets flag 6; talked to again, `ev22510` starts
  **set battle 2 — Hexagoon alone**, out of `eventbattle.bin`.
- **After it**: won, `ev02550`, Patty's thanks, which goes on outside to
  `ev02555` and **2.5, step 1**; lost, flag 4, under which she offers the
  fight again.

Walked through in the browser: the first floor's four steps, and Patty's plea
into the fight — and, since, winning it (see "The slice plays through"). **For testing, ours:** `?step=4` opens
at that step, and `?at=x,z` stands the Hero there.

**New readings:** 35 tests the step; a cast record's words 2 and 5 are the
span's steps; a character's own records choose before a talk record; a
character with no records stands at their header, and so does one in a gap
between two records inside one sub-stage (thin: 19 such gaps); 120 starts a
set battle, and records of value 5 = 15 and 16 say what follows winning and
losing it. A record that says nowhere is *not* the header's place — that
would have put 27 more in Angel Falls at every stage.

**Ours:** there is no running from a set battle; losing one wakes the Hero in
the village church, as any loss does; a stage opened without an event is at
step 0, where steps are not read.

**Left:** which of an event's actors is which of the cast, so the
figure's walk off in `ev02510` is not followed; word 6 of a cast record; the
title card; `ev02500` and `ev02510` have only "DEBUG!" for text — they are
scripted scenes.

---

## The way back reaches 2.4 — 15 September

**What plays now**, moved on by the trigger records as before (game-formats'
FORMAT.md, "The words"; INFERRED throughout):

- **Hugo, on the way back** at 2.3 — talking to him with Ivor along plays
  `ev02430`, "Hey, Ivor, you're back! Manage to clear up that landslide, did
  you?", once; after it he says "Sounds like it might be good news…".
- **The mayor's house, on entering it** at 2.3 — `ev02400`, the news of
  Stornway's soldiers, which goes on upstairs in Erinn's house to `ev02410`,
  and the story is at **2.4, step 1**.

Walked through in the browser: both, and Hugo's line after his event.

**Two readings make it go** (game-formats' FORMAT.md, "The words"):

- **A second set of flags, "marks"** — `102` sets one, `2` holds if it is set,
  `3` if not. Of the 57 sets, 31 sit in a record that also tests `3` of the same
  mark — the first time a character is talked to — and 24 of those have a
  partner record testing `2` of it. Hugo's are `3:7 119:2430 102:7` and then
  `2:7 118:8 193:0`. Tests far outnumber sets (280 and 298 against 57), so
  something else sets marks too.
- **`86:0` — the Hero has no companion with them.** All 7 in Angel Falls sit
  before a character's first-time event and give the label that follows it
  instead, and Ivor speaks in every one of those events (2222, 2230, 2240,
  2250, 2430, 2440, 2450). Read before the first-time record, as the records
  stand; without it, Hugo's `86:0 118:8 194:0` came first and his event never
  played.

**Ours:** marks are cleared with the story's flags when the stage moves on,
and neither is saved yet; whether the Hero is alone is whether any companion
follows — and when Ivor follows is ours, by stage.

**Fixed on the way:** `?door=` now plays the map's entry event, as walking
through the door does.

**Left:** what else sets marks; the words still not read — 16, 17, 105, 107,
141, 197, 203, 204, 205; the pass's value-5 = 2 records; what value 5 = 20
gates. **Next**: the Hexagon.

---

## The story reaches the landslide — 15 September

**What plays now**, all moved on by the trigger records (game-formats'
FORMAT.md, "Triggers", "The words"; INFERRED throughout):

- **Hugo at the village's edge** — once Ivor's call has set flag 0, talking to
  him plays `ev02220`, "Here comes another lamb to the slaughter!": step 3, and
  flag 1.
- **The pass, on entering it** at 2.2 — `ev02300`, "Finally! We're here at
  last". A record of value 5 = 3 plays an event on entering its map: 244 of
  the 249 name their own map first, 49 play an event (`entryEvent`).
- **The landslide** — talking to Ivor there plays `ev02350`, "Is this it? …
  You and I will never be able to shift this on our own", and the story moves
  to 2.3. A character's own record chooses their label, and a talk record (value
  5 = 1) makes an event of it — 97 of the 179 talk records with a label and an
  event pair so (`labelEvent` in `talk.ts`).

Walked through in the browser: Hugo's scene, the pass's arrival, and Ivor's at
the landslide. **For testing, ours:** `?stage=2.2` opens a new game at a stage
and `?flags=0,1` with those flags set.

**Ours:** an entry event is not played on a save carried on from, nor on a map
an event goes on to, whose own event plays instead.

**Left, on the way:** the pass's records of value 5 = 2, which play
`ev22591` and `ev22592` by something in the map (`7:20`, `7:22`), not played;
what value 5 = 20's records gate — the village's `149`/`150` on 26 to 28,
changing with flag 1, perhaps the way out; and the words not read — 17, 105,
107, 141, 197, 203, 204, 205. **Next**: the way back at 2.3 — the mayor's house
plays `ev02400` on entering it, which goes on to Erinn upstairs and 2.4 (both
read and tested, not walked) — and then the Hexagon.

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
