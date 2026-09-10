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

## 5. An interior's collision does not match its room — **open**

The other half of the same report, and **not** the same cause. Drawn from above,
`M01M08` — the well — has a walkable floor **1.94x the width of the room drawn
inside it**: the same decagon at two sizes, concentric. `M01M02`, the inn, is the
other way round, its collision covering about half the drawn room. `M01M04`, the
stable, is right.

**Ruled out**, each measured rather than reasoned about:

- **The model's position scale.** Undoing the down-scale that `nsbmd.ts` folds
  into the matrices makes the fit worse across 86 single-piece maps, not better.
- **The placed-piece scale**, and the map scale: both scale the drawn geometry
  and the collision together, so neither can move them apart.
- **A single constant.** The factor each map would need runs continuously from
  0.18 to 2.87 rather than clustering on powers of two, and the `.col2` header's
  two unknown fields do not predict it.

**Next:** the plan tool makes it visible per map, and that is the place to
start. What it is worth knowing first is whether the collision or the geometry
is the one in the wrong space — the doorways now say the collision is, since a
correctly placed arrival lands at the threshold and the collision does not
always reach it.

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
