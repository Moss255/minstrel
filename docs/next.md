# Where to pick up

Written 10 September 2026 against `2c8fd7f`, and revised the same day: items 1
and 2 are done, item 3 has been measured further and the question has moved, and
the doorway cost is gone. The evidence behind each is in
`packages/game-formats/FORMAT.md`; this is the short version and what to do next.

Ordered by what is blocking the milestone, not by how interesting it is.

---

## M3 has started — event text is read

M2 is walkable end to end, bar the Hero stand-in and the two notes below
(sprite tiling, where the Hero wakes). M3's task list is waiting on
`docs/PLAN.md`, which is not in the repo yet; the one bullet recorded elsewhere
is "text box rendering with a vector font and resolution-independent layout".

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

**Talking works as a test affordance.** `f` talks to the character the Hero
faces and pages through every line of their talk file — which line the game
would pick is not established — `Esc` closes, and `v`/`b` step the chapter,
which otherwise follows `t`/`y` (INFERRED: letter = the stage's major number).
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

## 2. Sprite frames — **half-resolved**: the mound is gone, the tiling is not right yet

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

## 6. A field's doorways stand outside its own ground — still for the emulator

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

## 7. The Hero is a stand-in — blocked on a finding, not on work

`chooseFigure` takes the first part of each kind by name, which is arbitrary but
reproducible and gives a complete figure. Which parts make the Hero needs the
preset table, and that has not been found. Nothing here can settle it by
measurement: unlike the sprite pitch, there is no property of the bytes that
says "these four parts go together" — it wants either the table or the game
running. Not blocking anything meanwhile.

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
