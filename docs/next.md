# Where to pick up

Written 10 September 2026 against `2c8fd7f`, and revised the same day: items 1
and 2 are done, item 3 has been measured further and the question has moved, and
the doorway cost is gone. The evidence behind each is in
`packages/game-formats/FORMAT.md`; this is the short version and what to do next.

Ordered by what is blocking the milestone, not by how interesting it is.

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

## 2. Sprite frames carried a stray mound — **done**

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

**Still parked, for a new reason:** whether `standingFrame`'s facing table is
180° out. The cut is no longer the obstacle — `stand_down` is frame 1 and shows
the face, `stand_up` is frame 4 and shows the back, both clean now. What is
missing is a picture of the game: `tools/shot` drives Chrome over CDP and there
is no Chrome on this machine. Run it where there is one, with the inn as the
crowded test:

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

## 5. An interior's collision does not match its room — **open, and now measurable**

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

`node apps/game/tools/plan.ts rom/<your>.nds M01M02 --under=0.12` draws the
floor plan, with the collision's walls as lines rather than as the nothing a
vertical face projects to from above.

### The map index answers "which map", exactly

Looking for that scale field turned up something else. **The first slot of a
`maplist9.bin` entry is the map's own id** — 1100 for Angel Falls, 1101 to 1112
for its interiors — and it is what a placement's map word carries. The join is
exact: all **1,289** placements on the cartridge name a value that is some
entry's id, against 96.6% for the decimal `area x 100 + sub-map` reading that
replaced it. `tools/harness` holds it.

Nothing about the scale, but it retires an inferred rule for a stated one.

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

**Next:** the seven words are not decoded and nothing should pretend otherwise.
What a decision is needed on is which record the engine ought to take when it
does not model story progress at all: the earliest, which is what happens today
by accident, or the one matching some fixed state. `packages/game-formats/src/npc.ts`
records the layout.

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
npx vitest run                                     # 707 unit tests
MINSTREL_TEST_ROM=rom/<your>.nds npx vitest run    # 772, the extra 65 on a cartridge
```

The cartridge tests are seconds each and slower again under load; they carry
their own timeout for that reason. Run them on their own if they wobble.
