# M2 — Angel Falls, walkable: status

Against the milestone's own list.

| M2 task | status |
|---|---|
| Map assembly and collision | **both done** |
| Character controller with original movement constants | **done**; the character's size is measured off the doors, the rest tuned — see below |
| Camera behaviour, extended for widescreen | **done**, including taking the roof off; field of view tuned by eye |
| Interior/exterior transitions, doors, stairs | **the data is read and the doors work**; the rooms behind them are not finished — see "Not done" below |
| Fixed-preset Hero model with the minstrel outfit | **a character walks**, but it is a stand-in — see below |
| The village's own cast, placed | **placed, drawn wrong**; 18 stand in the village, 14 of them 2D sprites, and each interior has its own, but the sheets are still cut wrong — see "Not done" |

**Done when:** you can walk the whole village and enter every building.

All nine of the village's doorways lead somewhere and put the character down on
the floor of it — eight buildings and the road east — and the two upper floors
load. **That is not the same as the slice being finished**, and an earlier
revision of this table said "done" on the strength of it. What that measured was
whether a doorway lands the character on a floor, checked in a script. It did
not measure whether the room behind it is one you can walk around, and it could
not have: nobody had played it.

## Not done

Four things. Every one was found by playing or by looking at a picture; none of
them came from a measurement, and several survived measurements that said they
were fine.

**The character was twice as wide as a person.** `PERSON.radius` was 0.04
against a height of 0.18 — 0.22 of the height, where a person is about 0.14.
Nothing caught it while interiors were being assembled eight times too big,
because nothing in them was ever a tight fit. At their own scale it costs most
of the room: walking every way out of the doorway of `M01M08` reached 1,944
distinct spots at 0.04 and 6,076 at 0.025. Now 0.025.

**Interiors leak.** A room's collision is one floor quad with walls standing on
it, and the walls do not close it. Walking 64 directions out of the doorway of
`M01M04`, **9 of them walk off the floor and fall out of the world**, at either
radius; `M01M08` does it on 20 once the character is thin enough to reach the
gap. The fat radius was plugging some of these, which is why they surfaced
together. Nothing here invents a wall the cartridge does not have — an engine
rule against stepping off into nothing is the likely answer, and it is not
written yet.

**The 2D cast still does not survive being walked around**, though it is closer
and the reason is now known rather than guessed.

*Fixed.* The frames were being cut on an even division of the sheet's rows,
which is marked `INFERRED` in `sprite.ts` and does not hold: a frame is **not a
whole number of sheet rows**. It is `width x height / 2` bytes of pixels with
eight more between it and the next, and eight bytes is half a row of a 32-pixel
sheet — which is what put every other frame half a width out, sliced down the
middle with its halves swapped. Cut at that pitch the village's characters come
out whole, and the ink landing in the edge columns drops 20.2% across the
cartridge. Confirmed on the frames the game itself asks for, not a convenient
sample: cut the old way those are unrecognisable.

Those eight bytes are **transparent padding, not a record** — an earlier
revision of this note and of the parser's comment called them a record, and the
bytes disprove it.

*Not fixed.* Every frame carries a **stray fragment above the character** — a
hat, or the top of a head, detached from the figure. In a crowded room that
reads as debris floating over the cast, which is what the inn looks like.
Rendering the whole block with no frame assumption shows why: the sheet is a
repeating pair of *a small mound, then a character*, so the mound is part of the
repeating unit and there is nothing to remove — only a boundary to place right
relative to it.

*The lead worth following.* The heads sit at a different offset from the bodies,
which is an observation from looking at it rather than measuring it. Traced
numerically, the horizontal centre of a head runs 21.4, 19.1, 15.1, 11.1 across
frames 0 to 3 — a steady sideways slide. Solving for the pitch that flattens it
gives **660 bytes** on three characters independently, against 0.38 to 0.47
pixels a frame of drift at the 648 the parser uses. Whether 660 is right by eye
is not yet checked, which is why the parser still says 648.

Ruled out along the way, each measured: 8x8 tiling in two arrangements, a wrong
row stride (32 wins at 0.691 against 0.554 for the next), the animation table
holding offsets, six criteria for fitting the start, and three hypotheses about
the row count. All written up in `packages/game-formats/FORMAT.md`.

One thing still unsettled and deliberately parked: the sense of the facing
angle. `standingFrame` maps "the character's angle equals the camera's" to
`stand_up` — its back turned — but if `facing` means the direction
`(sin f, cos f)`, which is the convention the player's own facing uses, that
case is the character looking **at** the camera and the table is 180° out. A
test across 119 placed sprites split 26 to 22, which decides nothing. Worth
settling only once the frames are cut right, since a wrongly cut frame cannot be
judged by eye.

*To carry on:* `?sprite=1` in the game and any `.spr` in the explorer both cut
the sheet live, on the same keys, and print the four numbers.

The road east is a fourth, already recorded: `F01` opens, but the arrival it
names has no collision under it, so the character is put down on the nearest
ground instead — see "A field's collision does not reach its own doorways" in
`packages/game-formats/FORMAT.md`.

## What the slice needs, and whether it exists

Everything M2 stands on parses. The three areas the slice uses — `F01`, `M01`,
`D01`, identified from the cartridge's own index — hold 704 models between them,
all of which read, with 246 collision meshes and 199 map descriptors alongside.
The player-character archives read too: 1,915 models across `chara_pc.gp2` and
`chara_pd.gp2`.

## Where the world stands

`.col2` is read, and the simulation can stand on it.

**The collision mesh and the map model share a coordinate system.** Collision
vertices are whole `fx32` words: dividing by 4096 puts them in the same space
the map's geometry occupies, with **no translation at all** — over the maps
where the two describe the same footprint, the median offset between their
centres is exactly zero. So the simulation works in the cartridge's own units
and only converts for rendering, which is what the fixed-point rule wants
anyway.

**78% of a collision mesh is wall.** 85,349 of the cartridge's 109,122 triangles
are exactly vertical. Walls and floors are distinguished geometrically rather
than by a flag, so wall collision needs no attribute decoding — which is
fortunate, because the attribute word is not decoded.

**A map's collision is several meshes, not one.** The village has thirteen, one
per piece, and any single one of them is a handful of triangles with nowhere to
stand. A world is built from all of a map's collision or from none of it. That
was found the way such things usually are: the key that starts walking appeared
to do nothing, because the first mesh had two triangles and the spawn silently
failed to find ground.

**The world builds its own spatial index.** `.col2` carries a grid, and its
cells tile the triangle list exactly, but which region each cell covers is not
established: neither header field that looks like a grid dimension accounts for
the cell count on most files. Using it would mean guessing the mapping, so
`@minstrel/sim` grids the mesh itself. The file's index is parsed and unused.

`groundBelow` answers the question walking asks — the highest surface at or
below a point, with a step-up allowance — and reports the surface's steepness as
a cosine so a slope limit is a comparison rather than an angle. Every walkable
triangle on the cartridge can be stood on: querying above each one's own
centroid never falls through to something beneath it.

## The slice's maps, by name

`maplist9.bin` is the cartridge's own index, and it decodes. **Angel Falls is
`M01`**, and every map the slice needs is named in it:

| index | code | what it is |
|---|---|---|
| 140 | `M01` | Exterior |
| 141 | `M01M01` | House A |
| 142 | `M01M02` | Inn |
| 143 | `M01M03` | Item Shop |
| 144 | `M01M04` | Stable |
| 145 | `M01M05` | Mayor's House Lv 1 |
| 146 | `M01M06` | Church |
| 147 | `M01M07` | Erinn's House Lv 1 |
| 148 | `M01M08` | Well |
| 149 | `M01M09` | Mayor's House Lv 2 |
| 150 | `M01M10` | Erinn's House Lv 2 |
| 151 | `M01M11` | Opening Event |
| 152 | `M01M12` | Opening (Background) |

The region maps are `F01` (Angel Falls Region), with `F01M01` the opening and
`F01M02` the ending.

That closes a question M0 left open — which area code the slice opens in — and
it closes it from the cartridge rather than from an emulator. The code names the
archive directly: `M01` is `M01.amdj`.

## Where map assembly stands

Done, and simpler than expected: **a map needs no placement data.**

The `.bmdj` beside a map's files is its resource list — an ordinary tagged table
whose `0x6C` records name each resource by a byte offset into the string table.
Every one of the **5,342** resources named by the cartridge's **755** manifests
is present in its own archive. They are authoring names, `C01M0300.imd`, and the
built files carry the same stem.

A resource compiles to *several* files under that stem — geometry, a material
animation, a texture animation — so resolution returns all of them and the
caller takes what it wants. That is not a nicety: choosing one arbitrarily loses
a map's main geometry to the manifest file sitting beside it under the same
stem, and the map still assembles, just without most of itself. It cost a
measurement to notice, because a check that every resource resolved to *a* file
passed at 100% while resolving many of them to the wrong one.

No transforms anywhere, and none needed: a map's pieces already carry their own
world coordinates. On `C01M03` the main geometry, a lamp and a night overlay sit
in three distinct regions of one space, and the collision mesh lands inside all
of it.

The measure that assembly is doing something real: a map's collision should sit
within the ground the map draws, and it does for 939 of 1,133 meshes against the
whole assembly versus 798 against the largest single model. The rest is
collision reaching past what the archive draws — an invisible boundary at a map
edge.

One resource resists this. `G1` is centred on the origin rather than placed, and
comes with a joint animation and a `.bcfg`. Something instances it, and the
manifest is not what.

## The character controller

`@minstrel/sim` walks a character over a collision world: horizontal movement
resolved against walls, ground followed underneath, gravity when there is none.
Everything is `fx32` at a fixed 60Hz tick.

**A wall is a surface too steep to stand on.** That is the same test the ground
query uses, so a cliff face and a building stop a character identically without
either being a special case, and the slope limit is one number rather than two
systems.

**Which side of a wall to leave by comes from where the character was, not from
where it is.** Resolving from the current position has no answer when a step
lands exactly on a wall's plane and gives the wrong one when a fast step carries
the character through — both push it out of the far side, which reads as walking
through the wall. It was the first thing the tests caught.

Checked on real geometry, not only on the squares and ramps its own tests build:
a quarter of a million ticks across more than 300 map collision meshes, walking
in four directions from several starting points on each. **Nothing ever left the
world** — no tunnelling, no position the format cannot hold. About two thirds of
those walks travel somewhere; the rest are stopped by a wall or go over an edge
and fall, which is the world working rather than the controller failing.

The viewer will walk an assembled map: press **G**, then WASD. Movement is
relative to the view, which is what a third-person camera needs.

### How big a person is

Twice wrong before it was right, and the second time was the interesting one.

The first `PERSON` was a guess and about a third of the right size. Measuring
the rooms fixed the order of magnitude: every Angel Falls interior has its
ceiling between **1.97 and 2.06 units** across nine rooms.

The second was subtler and survived that fix, because it was in the *renderer*
rather than the constant. The character is scaled to the controller's height, so
model and capsule agree by construction — but the scale was derived from the
model's **bind pose**, and the bind pose is a T-pose: arms straight out, **9.23
units across and only 7.68 tall**. That is the height of a figure holding itself
flat, not the height of the figure, which stands **10.03** once posed. Scaling
by one and drawing the other made the character 30% larger than the capsule
walking it — and made it *grow as it set off*, because the motion pack it uses
has no `stand`, so standing fell back to the bind pose and walking did not.

The scale now comes from the walk cycle, whose nine frames vary by under 2%. Not
from the tallest frame of every motion: reaching up a ladder is legitimately
taller than standing, and sizing by that leaves the character walking too small.

The house is what to measure against, being the comparison a player actually
makes. In `M01` the house is one shape of `M01M0003.nsbmd` —
4.50 wide, standing from y 0.38 to 1.88, so **1.50 units tall**, with its
neighbour in `M01M0004` at 1.57. Which model holds a house is not guessed: the
cartridge names its own nodes, and those two carry `hus` and `hus1` beside their
trees (`tre20`..) and their ground (`base`). Sizing off "the tallest thing in
the map" instead measures the waterfall at 4.41 units, or the sky backdrop at
2.13.

### How big a person is against a house

That is the part the cartridge does not answer.

Reasoning from architecture puts a person at about 1.3 units: a real door is
about two metres, the doorway models are 1.54 units, so a unit is about 1.3
metres. The game draws its people noticeably smaller than that — as games of its
kind usually do — and how much smaller is a fact about the original that is not
in any data table read so far. Seeing it needs the game running, which is on the
list of things this repository cannot do.

So the ratio is **set by eye against the original and written down as such**,
rather than dressed up as a derivation. A person is a little under a third of a
house: **0.45 units**.

To make finding it cheap rather than a round trip through a constant, the viewer
adjusts it live with `[` and `]` while walking, and the overlay reports the
result in units and as a fraction of the map's own house — which it finds by the
`hus` node, the same way the measurement above does.

| | first guess | measured off rooms | now |
|---|---|---|---|
| Height | 0.35 | 0.90 | 0.45 |
| Drawn walking | 0.45 | 0.90 | 0.45 |
| Against a 1.50 house | 0.30 | 0.60 | **0.30** |

### A map's pieces are placed, and were not being placed

The village's ten doorways were drawn stacked on top of each other in mid-air at
the middle of the map, and their collision boxes were stacked there with them.

A map piece is authored at **its own origin** and moved into place by the map:
`M01M00D1.nsbmd` spans −0.50 to 0.01 across and 0 to 1.52 up, and so do the
other nine. The manifest carries the placement and it was not being read — the
`0x6F` record, one per resource in the same order, fourteen values of which
three are a translation and three a scale (1, 1, 1 on every resource of the
reference cartridge).

Two things had to be worked out beyond reading the floats.

**Pieces attached to other pieces.** A door's collision carries no translation
of its own. It names the door model — value 6 is the other resource's slot — and
goes wherever that goes. Following the link is what puts the wall in the doorway
instead of leaving it at the origin while the door itself moves away.

**The unit.** The translations are an order of magnitude larger than the map
they place things in: the doors sit at x −28.56 and 26.10 in a village running
−4.38 to 7.61. The divisor is not in the file, so it is **fitted** and recorded
as such, with the fit: over every map that has both placed pieces and unplaced
ground, count the pieces authored to sit at their own origin that end up
standing on that ground. It peaks at 8 to 8.5 across the cartridge and 7.5 to
8.5 on the village, and 8 is a power of two, which is what a DS pipeline would
use. `PLACEMENT_SCALE` is 8, marked inferred.

Placements are only trusted when there is exactly one per resource, because they
pair by position: 696 of the 755 manifests pair one-to-one, and the other 59
carry *more* placements than resources. Pairing positionally through those would
place every piece after the extra one confidently in the wrong spot, so those
maps are left unplaced instead. A wrong placement is worse than none.

### The village was barely walkable

Reported as getting stuck, and worse than it sounded. Flood-filling the
exterior from its spawn, over a grid of the map's own walkable ground:

| | reachable |
|---|---|
| As it was | **12%** |
| Snap height 0.15 instead of 0.032 | 23% |
| …and step height 0.10 instead of 0.056 | **24%** |
| …and a point-sized character | 36% |

The cause was a distinction this document got wrong twice. The radius is a fact
about the character and scales with it. **The step and snap heights are not**: a
step in the world is the same size whoever is climbing it, and shrinking the
character to a fifth with its tolerances shrunk alongside left it able to reach
an eighth of the village.

What sets them is the *movement*, not the body. Walking at 0.05 units a tick
down the steepest surface `maxSlope` allows — 50 degrees, a gradient of 1.19 —
drops the ground **0.06 units under the feet in one tick**. A snap height below
that means leaving the ground on every downhill step; a step height below it
means being unable to climb the steepest slope one is allowed to stand on. Both
are now above that with margin, and both have a test that walks a slope at
exactly the limit and requires the character never to leave it.

The doorway collisions were the first suspect and are not the cause: they are
two vertical triangles each, but removing them *lowers* reachability, from 24%
to 17%.

**36% is where it stops with a point-sized character**, so a fifth of the ground
is still not reachable for reasons the tolerances do not explain. That is the
next thing to look at, and it may be the same scale tension as everywhere else:
terrain tessellated for a character rather larger than 0.18 units.

### The clouds needed their animation, not a placement

The village sky, `M01M0002`, has four cloud nodes `s_1_` to `s_4_` and all four
carry **the same translation**, so in the bind pose the four cloud shapes sit
exactly on top of one another. Nothing is misplaced: the model ships a
**541-frame joint animation** that drifts them apart, and at frame 270 they are
at x −2.10, −2.60, −3.60 and −4.10.

The viewer played animations only for a single model chosen in the scrubber, so
an assembled map stood still. Each map model now plays the animation compiled
from its own authored resource — the one beside it under the same stem, matched
by bone count — driven at the DS's 30 frames a second, and it keeps running
while the map is being walked.

### The trees were in a pile at the model's origin

The rainbow fix below introduced this one, which is a fair trade only because
the measurement caught it. Making a node description set the current matrix was
right; also moving the **slot the next shape reads** when a node *stores* its
matrix was not. Storing keeps a matrix for later. Only a restore changes which
slot a shape's vertices look up.

With both, a model's tree billboards — twelve flat quads in `M01M0003`, one per
`tre` node — read slot 0 while their own matrices had been written to another,
so all twelve drew on top of each other at the model's origin, in the air. With
only the current-matrix part, shape 36 lands at (−3.25, −1.88), which is
`tre20`'s translation over eight exactly, 37 at `tre21`'s and 38 at `tre22`'s,
and they sit within 0.08 units of the ground under them.

### Every rotation on the cartridge was inverted

The heels pointed upwards, and rendering the figure to look at it showed why:
posed, it raised both arms straight over its head.

Nitro stores a rotation's cells **column by column**, the order the DS keeps a
matrix in. They were being read as rows, which builds the transpose — and a
rotation's transpose is its inverse. So every rotation in every model and every
animation came out backwards.

Almost nothing catches that. Both readings are orthonormal, both have
determinant +1, and the strongest check in the harness — an animation's first
frame against its model's own bind pose — **transposes on both sides at once**,
so it agrees at 95% either way. It says the two readings match each other, not
which one is right.

What settles it is a character standing up. The player model is built in a
T-pose 7.68 units tall and every one of its nodes is the identity, so its bind
pose is identical either way. Posed, it should stand about as tall as it was
built:

| motion | read as rows | read as columns |
|---|---|---|
| `stand` frame 0 | 9.71 | **7.89** |
| `walk` frame 2 | 9.98 | **7.77** |

That is now the harness check: a posed figure stands within 15% of its bind
pose's height. The test that used to assert the *opposite* — that the posed
figure is a fifth taller, which is what a T-pose measured against a broken pose
gives — was pinning the bug, and is replaced.

One inconsistency had to be fixed with it. A node may store its 3x3 in full
rather than compactly, and that path was reading row-major while the compact
pools now read columns. With both on columns the bind-pose agreement returns to
where it was, which is the check that they still describe the same rotation.

**How it was found:** by rendering the posed figure to an image from Node — a
flat-shaded orthographic rasteriser over the same `poseGeometry` output — and
looking at it. Numbers had been saying for several rounds that something was
0.2 units out; the picture said the arms were over the head.

### The character had no head, because a head is not part of the rig

Rendering the figure's top showed a collar and a small neck tab and nothing
above it.

A character is not one model. `chara_pc.gp2` holds **796 parts** whose names say
what they are, and the vocabulary reads straight off the counts:

| prefix | count | | prefix | count |
|---|---|---|---|---|
| `p_w` weapon | 200 | | `p_p` legs | 79 |
| `p_b` body | 192 | | `p_s` shoes | 35 |
| `p_m` | 142 | | `p_f` face | 24 |
| `p_h` hair | 121 | | `p_test` | 3 |

**Only the bodies and legs carry the shared fourteen-bone rig** — 274 of the
796. Those pose themselves and, put together, make a figure that ends at the
neck. Everything else carries a single bone of its own and sits at the origin
until something hangs it off the skeleton.

So the head is an attachment. The rig's `head` bone sits at y 16.27 on a body
reaching 16.57, and a face put through that bone lands at 15.94 to 20.26 — on
the neck, and a fifth of the finished figure's height, which is the proportion
this game draws.

The `p_test` parts that had been standing in for a character are skipped now.
They are a **half-scale test figure** — 7.68 units where a real body reaches
16.57 — and they have no head at all, which is why one could not be found on
them.

Which parts make the Hero is still not known, so the viewer takes the first of
each kind by name: arbitrary, reproducible, and a complete figure. Shoes and
weapons are not placed — a shoe belongs to two feet and a weapon to a hand that
is holding it, and neither is established.

### The walk held one pose twice a cycle

Rendering the nine frames of the walk side by side, with a ground line to judge
them against, showed frames 0, 4 and 8 in the same pose. The last frame is a
repeat of the first.

That is common and it is not universal: **2,654 of the cartridge's 6,230
animations end that way and the rest do not**, so it has to be asked of each one
rather than assumed. The pattern shows in the frame counts, which are
overwhelmingly odd — 9, 7, 11, 13, 5, 17, 3 — a whole number of segments plus
the frame closing the last one, and all 140 three-frame animations close.

Played over all nine frames, the walk holds one pose for two frames every cycle.
At three cycles a second that is a hitch three times a second. `loopFrames` in
`@minstrel/nitro-gfx` asks the animation, and the character's `walk` and `stand`
both loop one frame shorter than they are stored.

### The legs did not reach the floor, and the walk stuttered

Two more, both from the same habit of taking a measurement once and assuming it
holds.

**The floor is measured once per motion.** A character is placed by putting its
model's origin at its feet, and the motions do not keep it there — `walk`
reaches down to −1.05 in model units while `stand` never comes below 0.79 — so
the offset has to be measured. How often turned out to matter more than the
measurement.

The lowest point *moves* through a cycle, and it should. Over the walk it runs
−1.05, −0.38, −0.16, −0.22 and back: a foot leaving the ground and returning.
Through the idle it is a smooth arc, 0.79 up to 2.50 and down again — breathing.
Measuring each frame and subtracting it pins that foot to the floor and
translates the whole body instead, so the figure jerks 0.90 units, **4% of its
height, several times a second**. On screen that is the head bobbing and the
feet snapping, which is exactly how it was reported.

Taken once over the cycle, the offset is the planted foot at its lowest and
everything the motion does above it survives: the walk rises 4% between steps,
the idle holds it still to within 0.0001 units — 0.0% of its height.

**That last number was 7%, and it was this bug wearing a plausible name.** An
earlier revision recorded the idle as "breathing through 7%" and left it. It was
not breathing: every part of the figure moved 1.7 model units in lockstep, feet
included, which is the whole character lifting off the floor. See "Three
animations are called `stand`" below.

**Walking is a fact about the keys, not about the clock.** Whether the character
was moving was taken from inside the simulation loop, so it was only true on a
frame in which a tick actually ran. At a 60Hz tick with 60Hz rendering, most
other frames run none — and on those the motion flipped to standing, which
**resets the frame count**, so the character stuttered between two poses several
times a second. It now comes from the keys held, and the idle advances on
elapsed time rather than on whole ticks so the same quantisation cannot reach
it by another route.

### The animation ran on the clock, at the wrong clock

Two complaints, one cause. The character shuddered while standing still, and
its legs did not agree with the ground it was covering.

The frame was advanced **once per simulation tick**. At 60Hz that runs the
nine-frame walk cycle nearly seven times a second, and the idle with it — which
is not a walk or a breath but a shake, and it happened whether or not the
character was going anywhere.

Standing now runs at the DS's 30 frames a second. **Walking runs on distance
covered** rather than on time: one cycle to a stride, so a character held
against a wall stops stepping instead of running on the spot, and one slowed by
a slope slows with it. The stride is set so that at full speed the cycle plays
at that same 30 frames a second, which is what keeps the two cases consistent
rather than two unrelated rates. The frame resets when the motion changes,
because a count left over from a nine-frame walk means something else in a
seventeen-frame idle.

The maths is in `apps/viewer/src/motion.ts` with tests, rather than four lines
in the middle of the movement loop, because the last two versions of it were
wrong in ways that were only visible on screen.

Ruled out on the way: **there is no root motion to fight**. The root node's
translation is zero on every frame of `walk`, `run` and all three `stand`
variants, so nothing in the animation was moving the character.

### The character: one figure, a family of packs, and a walking pace

Three things, all the same kind of mistake — taking the first thing the data
offered and stopping.

**It was being drawn twice.** The three `p_test` parts are not three pieces of
one figure. `p_test0` is a whole figure of four shapes; `p_test1` is its upper
two and `p_test2` its lower two, to the same bounds exactly. All three were
drawn, so the character was doubled, and it showed on the head first. A part
whose geometry another part already covers is now dropped — which on a real
character, assembled one part per slot, drops nothing.

**Its motions live in a family of packs, not one.** The `.bcfg` beside a part
names `mp0200ne`, and that pack holds exactly one animation: `walk`. Standing is
in `mp0200n` and `mp0200f`; smiling in `mp0200b`, attacking in `mp0200be`, items
in `mp0200bi`, casting in `mp0200bm`. Of the cartridge's 136 packs, **56 carry a
`stand`, 13 carry a `walk`, and not one carries both** — so reading the pack the
config names and stopping gives a character that can walk and cannot stand
still, which is why standing fell back to the T-pose. Every pack of the family
is read now.

**Three animations are called `stand`, and the name does not pick between
them.** `mp0200n` and `mp0200f` hold an eight-frame idle each; `mp0200n2` holds
a sixteen-frame one. Keeping only the last one read chose between them by
archive order, and the one it chose was `mp0200n2` — which lifts the whole
figure **1.706 model units, 7.5% of its own height**, off the floor. Since a
character is placed by putting the lowest point of its whole motion at its feet,
that left it standing in the air for most of the cycle.

Measured rather than assumed: the variant that translates the figure least is
the one authored to be played in place. `mp0200n` holds it to 0.009 units,
`mp0200f` to 0.227, `mp0200n2` to 1.706. Whole-figure lows are compared rather
than a root bone, because the lift is in every part at once and the rig's root
is still on every frame — which is why the earlier "there is no root motion"
check did not catch it.

The walk is untouched by this and always was correct: only the lower-leg part
travels (0.899 against 0.17–0.41 for the body), which is one foot leaving the
ground and coming back. Walking, a foot is within 0.002 units of the floor on 43
of any 180 frames — twice a cycle, as a gait should be.

**It was sprinting.** The speed was a fixed 0.05 units a tick, chosen when a
person was 0.9 units tall. At 0.18 that is **sixteen of its own heights a
second**, which reads as sliding rather than walking. Speed is now given in
character heights, so it survives the next resize, and it stays inside the step
and snap heights, which are derived from the same speed.

**And then it was still stepping too fast, for a reason no speed could fix.**
The stride — the ground one gait cycle covers — was *derived from the speed*:
`unitsPerTick * TICK_RATE * frameCount / ANIMATION_FPS`. The speed therefore
appeared on both sides of the cadence and cancelled, so the walk played at
exactly 30fps however fast the character moved. On an eight-frame cycle that is
3.75 cycles a second — **7.5 steps a second**, against the two a person manages
— and halving the walking speed changed it by nothing at all, which is how the
circularity was noticed.

A stride is a length, so it is one now: `STRIDE_HEIGHTS`. Cadence is ground over
stride and follows the pace, which makes the two independent: raising both
together moves the character faster without the legs churning. At three heights
a second and a stride of one and a half, the cycle runs 2.0 a second — 4.0 steps
— and the village, twelve units across, takes about twenty-two seconds corner to
corner.

Both numbers were needed. Halving the speed alone changed the cadence by exactly
nothing, because of the circularity above; it was the measurement, not the eye,
that caught that.

**What the feet actually do is measured.** Over the walk cycle the animation's
feet sweep **0.402 of the character's height** front to back, so anything
covering more ground than that per cycle is sliding them to keep up. Declaring
one and a half heights per cycle slides them 3.7x, against the 2.6x the old
derived stride happened to give. Declaring the measured 0.402 instead would
plant the feet exactly and demand **ten cycles a second** at any ordinary pace,
which is worse than the sliding. So the stride is a tuned compromise, like the
speed it works with, and the number it is compromising against is written down.

### The village ships twice: a day copy and a night one

Beside the terrain sit two resources the descriptor names together,
`M01M00L1` and `M01M00N1`, both at the origin and both 8.1 units across. They
are the same buildings lit two ways. `L1` binds `m01m00win01` and the rainbow;
`N1` binds `m01m00win02` and nothing else, and the two window textures cover
**the same 840 opaque pixels** and differ only in colour — `win02` is brighter
and yellower, luminance 165 against 123. That is a lit window, so `N` is night
and `L` is day.

Assembling both, which is what was happening, draws a village whose windows are
lit and unlit at once.

**It is a paired set, cartridge-wide.** 234 archives carry both an `L` and an
`N` resource, and on 168 of them the two counts are equal. The suffixes run
`L1`..`L6` and `N1`..`N6`, with `L1` (255) and `N1` (239) much the commonest. An
earlier note guessed these were "level-of-detail or day/night"; the window
textures settle it.

`assembleMap` now takes a lighting and builds one, defaulting to day. The game
takes `?lighting=night`. What the *rest* of night is — whether the sky, the fog
in the `.bats` attribute tables and the lamps change too — is not established,
so this changes the buildings and nothing else.

### The doors' scale was the placement divisor all along

A placed piece is authored in a space an order of magnitude larger than the map
it goes into. That is why the translation is divided by eight. Its **geometry is
in that space too**, and dividing one and not the other is what put a doorway
1.54 units tall into a building facade of 1.57.

That the two are the same number was not assumed. The value was found by
resizing the doors against the buildings until they looked right, twice,
landing on 0.12 and then 0.13. One eighth is 0.125 — between them, and exactly
the divisor the translations need. `PLACED_PIECE_SCALE` is now
`1 / PLACEMENT_SCALE` rather than a number someone chose.

A doorway comes out **0.19 units** tall, which is the height of the character
walking through it. That was the check worth making and it passes.

Three other explanations were tested and are not it:

- **A rotation in the placement.** There is none. Across all 4,242 placement
  records on the cartridge, values 11 to 13 — where a rotation would sit — are
  zero every time. The record is now fully accounted for: three values of
  translation, one parent, three of scale, and the rest zero or integers.
- **Sinking or floating.** The doors' bases sit 0.015 units under the ground
  beneath them, and that figure does not change with the scale.
- **A wrong height.** 0.12, 0.125 and 0.13 all ground equally well; the scale
  is not what decides whether a door meets the floor.

### Spawning in the river

The village's spawn landed on a sandbank in the middle of the river.

The map's own textures say where the water is, and the naming is a convention
worth having: a map texture is the map's code, then **three letters saying what
the surface is**, then a number. `m01m00wtr01` is water; `m01m00grs01` is the
grass beside it. Across the 4,337 models under `/data/map` the tags come out as
a level artist's vocabulary — `grd` 3,694, `wal` 2,332, `clf` 2,124, `grs`
1,934, `tre` 1,632, `stn` 1,451, `sdw` 868, `dor` 739, **`wtr` 726**, `hus` 694,
`sky` 606. `hus` and `tre` are also node names in the same models, which is how
the houses and trees were found earlier, so this is the same convention seen
from the other side.

The village has eight water surfaces: the river straight across the middle of
the map, and the pools at the falls.

The catch was the threshold. The spawn stood at y −0.14 on a riverbed whose
water surface is at −0.31 — **above** the water, so a test for "below the
surface" called it dry. For a character 0.18 units tall, standing 0.17 above the
surface of a river is standing knee-deep in it. Within a character's height of a
water surface is in the water, and with that the village's spawn moves from
(1.62, −0.14, 0.08) to (2.94, −0.14, −0.04), clear of the river and still open
in seven of eight directions.

**Only the `wtr` tag is used, and only for this.** What the tags mean to the
game — which surfaces are solid, which sound different underfoot, which are the
Hexagon's poison marshes — is not established and nothing here claims it.

### The doorways were sealed

The character could walk a few steps and then met something. Not the step
tolerances, not the wall resolver — at a trapped spot the push code fired on
zero triangles — but geometry very close by, everywhere.

A map's collision arrives as several meshes. The village has thirteen, and
**eleven of them are a single quad**: two triangles, standing vertically, with
no surface anyone could stand on. Ten sit one across each doorway; the eleventh
is four units by six, standing 2.5 units tall in the middle of the map. They are
taller than any building there and they are invisible.

| village collision | walkable ground reachable from the middle |
|---|---|
| with them as walls | **24%** |
| without them | **61%** |

The largest connected region goes from 24% to **93%**. Nothing is lost by
dropping them — they hold no standable surface, so no ground goes with them —
and across the cartridge's 124 maps that have at least one, reachable ground
rises from 66.8% to 72.7%.

**What they are is not established**, and `isMarkerVolume` says so. Doorways are
the obvious guess for the ten and a trigger of some kind for the eleventh, but
nothing read so far says it, and the attribute word does not distinguish them:
the values on these come from the same set as the terrain's and look like packed
orderings — `0x543210` and its permutations — rather than surface flags. So the
rule is about **shape** rather than meaning: two triangles or fewer, and nothing
to stand on. It is marked inferred.

Of 358 such meshes on the cartridge, 335 have no standable surface.

### The sky was the ceiling

The exterior kept reading as **indoors**, so the camera tucked in and tilted
down in the open street. Standing anywhere on the village, the piece over the
character's head was `M01M00E3` shape 2: a single piece **15.70 by 12.08 units**
wrapped around a map whose walkable ground is 12.3 by 9.1. Every one of the 41
spots sampled across the village read as indoors, and always for that reason.

An earlier attempt at this looked for a piece covering most of the map and
sitting above everything else in it, and found **none**, because the waterfall
at 3.75 pokes above the sky at 2.63. Being the tallest thing was never the
point.

The test now is containment: a piece reaching past the map's own collision **on
all four sides** is not part of the place being stood in. That is the least the
geometry can be asked, and it has to be the geometry — no map on the cartridge
has collision above head height, not one downward-facing raised triangle
anywhere, so there is nothing to cast a ray at.

The village goes from 41 of 41 spots indoors to 7. Across the cartridge the
effect is real but milder — a quarter of all open ground stops being ceiling —
because most maps are interiors, where something overhead is the truth.

The seven that remain are under a piece 3.83 by 1.59 units and half a unit
thick, sitting 0.02 above the character's head. That is a canopy, and being
under it is not a bug.

### Somewhere to stand is not somewhere to walk

The village's spawn had standable ground in all sixteen directions around it and
the character could not leave: 0.03 units in forty ticks, whichever of eight
ways it was pushed. It sat inside a wall 2.5 units tall spanning x 1.55 to 2.34,
with a dozen more faces at eighty degrees within a third of a unit.

The spawn rule was "walkable ground nearest the middle of the map", which asks
whether a spot can be *stood* on. It now asks whether it can be *walked away
from*: candidates nearest the middle first, each tried by walking eight ways for
sixteen ticks, and the first that gets somewhere in six of them wins. Across the
cartridge more than nine maps in ten offer such a spot, and the harness pins
that.

Of the village's 77 walkable triangles, 24 are open in six directions or more.
The other 53 are places a character can stand and not leave, which is the same
finding as the 36% reachability ceiling seen from the other side, and still
unexplained.

### The rainbow, the trees, and the current matrix

A node description in a model's render-command stream computes that node's world
transform, and its flag bits say which stack slot to leave the result in. What
was missed is that it also makes that matrix **the current one**, whether or not
it stores it: the stack slot is where a matrix is *kept* for later, and the
current matrix is what the next shape is drawn with.

Reading only the stored ones leaves every shape under an unstored node drawn at
the model's own origin. In `M01` that is the rainbow: `M01M00L1` has a node
called `rai` carrying a translation of (12.50, 1.50, −18.71), and its shape came
out at exactly its raw position divided by eight — the node's translation never
reached it, so the rainbow sat on the ground at the map's origin.

`resolvePose` now tracks the current matrix, set by a node description and by a
restore command, and writes it into a shape's own copy of the stack at the slot
that shape will look up. The stack itself is untouched, so a matrix stored for
something else cannot be clobbered. `M01M00L1` goes from 8.13 × 0.44 × 2.63 to
8.13 × 0.51 × 3.01 as the rainbow moves off the origin.

The trees turned out to be fine already — the `tre20`..`tre39` nodes of
`M01M0003` do store, and their shapes were spread across 4.07 units, matching
their translations. The whole cartridge's 38 integration checks still pass,
including the two that pin vertex placement and blend resolution.

### One doorway's wall was left at the origin

Nine of the village's ten doorway collisions carry a clean zero translation and
take their door's. The tenth, `M01A00D1`, carries a **denormal of about −1e−9**,
and the check for "no translation of its own" was `!== 0`. So that one wall
stayed at the map's origin while its door stood in the doorway. The test is now
against a tolerance.

### The sizes, set by eye

Two constants, both chosen by resizing them in the viewer against the village
until they looked right, and both recorded as chosen rather than derived:

| | value | what it gives |
|---|---|---|
| `PLACED_PIECE_SCALE` | **1/8** | a doorway of 0.19 units — see below |
| `PERSON.height` | **0.18** | a person 0.11 of that same facade, and about a doorway's height |

A person about as tall as a doorway is the sanity check that the two agree.

**`PLACED_PIECE_SCALE` is no longer only by eye.** The interior-scale work below
corroborates the same eighth from three references that have nothing to do with
how it looks: the inn's furniture, the doorway models, and the village's own
props. `PERSON.height` is still chosen rather than derived.

Two consequences of a person this small. Gravity lands on three `fx32` words a
tick, so it is quantised at a few per cent; if the height is revised upwards
that goes away on its own. And the camera's boom is measured in character
heights, so indoors the eye sits under a roof more often than behind it, and the
share of angles with something in the way falls from 89% at 0.90 units to about
65% — the same rule, a smaller camera.

Two harness checks had been measuring the character against fixed tolerances
larger than the character now is, and one of them called a roof over the
character's head "the ground under its feet". Under the feet now means **below**
them — inside the piece's footprint with its top at or below where the character
stands — rather than merely near them.

### The exterior on its own terms

Focusing on `M01` alone, and using only what is in it, here is everything the
exterior says about its own scale:

| | units |
|---|---|
| Village ground, by its collision | 8.96 × 5.75, with **1.00** of relief |
| Whole exterior, all pieces | 12.0 × 9.1 |
| Building facades — the two tall shapes of the `hus` models | **1.50** and **1.57**, standing from y 0.38 to 1.88 |
| Whole building models, roofs and trees included | 2.19 and 2.18 |
| Waterfall | 4.41 |
| Doorway models, all ten | **1.54** |
| Doorway trigger boxes, in collision | **2.50** |

Two of those do not belong with the rest.

**A doorway is as tall as the wall it is in.** The facades are 1.50 and 1.57;
the doors are 1.54. A door should be perhaps two thirds of the wall it opens.

**A doorway's trigger box is taller than any building on the map.** At 2.50 it
is above the 1.88 the tallest facade reaches, and two and a half times the whole
map's terrain relief.

The doors are the piece that does not fit, and they are also the piece the
format marks out: every placed piece on the cartridge is `upScale` 1 (276 of
283) while the map geometry around them runs 16, 8, 32, 4, 2 and 1. Nothing in
the manifest asks for them to be resized — its scale field is 1, 1, 1
everywhere — so nothing resizes them, and the viewer reports what it would look
like at any multiplier instead. Walking a map, the overlay now gives the placed
pieces' height in units and as a fraction of the tallest wall, so the value can
be found by eye and then written down.

### Interiors and the exterior are not at the same scale

This is the finding that explains a run of confusing results, and it means an
earlier derivation in this document was measuring the wrong thing.

Every Angel Falls map, by its own collision:

| map | | height | width |
|---|---|---|---|
| `M01` | Exterior | 1.00 | **8.96** |
| `M01M01` | House A | 2.46 | 7.30 |
| `M01M02` | Inn | 2.29 | 5.45 |
| `M01M03` | Item Shop | 2.46 | 7.75 |
| `M01M04` | Stable | 2.44 | 7.50 |
| `M01M05` | Mayor's House Lv 1 | 2.63 | 10.16 |
| `M01M06` | Church | 2.50 | 5.00 |
| `M01M07` | Erinn's House Lv 1 | 2.56 | 6.13 |
| `M01M09` | Mayor's House Lv 2 | **5.60** | 10.91 |
| `M01M10` | Erinn's House Lv 2 | **5.85** | 11.99 |

Two things fall out of that table and neither survives the assumption that the
village and its rooms share a scale.

**A single house's interior is wider than half the village.** House A's interior
is 7.30 across; the whole village exterior is 8.96. The Mayor's house is 10.16
inside — wider than the village it stands in.

**The two-storey houses need 5.6 to 5.9 units of interior**, and the tallest
building on the exterior map is 2.19 units from ground to roof. A building
cannot hold two floors it is less than half the height of.

The observation was right and the number was wrong. It is not two and a half.

**An indoor map is authored an eighth larger than it looks**, and the cartridge
says so: `maplist9.bin` carries the flag, `1` indoors against `2` outdoors, and
its own labels are what establish it — "Interior", "Church", "Well", "Inn",
"Item Shop" on the 520 entries with `1`; "Exterior" and the named regions on the
119 with `2`. Nothing inside a map's own archive distinguishes the two, which is
why this took so long to find: the descriptor's scale field is `1, 1, 1` on
every resource of the cartridge.

Outdoors, only the pieces a map *places* are in the larger authored space and
want `PLACED_PIECE_SCALE`. Indoors the whole map is — its terrain, its
collision, its furniture and its placements alike.

**The doorway table cannot settle this**, which is worth stating because it is
the obvious place to look. A map and its own doorways are in the same space, so
scaling both together is invisible from inside: doorways stand over their own
floor on 95.6% before and 95.6% after. It takes a reference from outside that
space, and there are three, all agreeing on the same eighth:

- **The furniture.** A stool in the inn stands 1.9 character-heights tall as
  shipped and 0.24 divided; its beds go from 7.3 x 9.7 to 0.9 x 1.2.
- **The doorway models**, which are placed and so already divided, and therefore
  in the character's space whatever their map is doing. The inn is 36 of its own
  doors wide as shipped and 4.5 divided.
- **The village outside**, whose own props are already right undivided — its
  fences stand 0.9 of a character — so the two cannot share a space.

So the earlier mistake here is now explained rather than merely suspected. The
character's height was derived from "every interior has its ceiling at almost
exactly two units" and then judged against houses on the *exterior* map. Those
ceilings are eight times what they look; the two numbers were never comparable,
which is why the figure kept having to be halved by eye and never settled.

**What follows:** a map carries its own scale, taken from the index rather than
guessed, and `assembleMap` applies it. A doorway's three parts then need care,
because they are in three different spaces — see below.

### Forward was backwards

The camera sits at `focus + (sin yaw, cos yaw) · distance`, so the direction the
player is looking — into the screen, away from the camera — is the **negative**
of that. The movement code used the positive, so W walked towards the camera.
Strafing was right, which is why it read as "inverted" rather than as scrambled.

It was wrong from the first day of walking and only became obvious once there
was a character on screen to watch: with the camera following the feet, walking
backwards away from the view looks much like walking forwards.

That math now lives in `moveRelativeToCamera` in `@minstrel/render` rather than in
four lines inside a key handler, and it is tested against the **view matrix**
rather than against the sign of a sine: pressing forward has to put the
character deeper into the picture and further from the eye, at six different
camera angles. A sign error cannot pass that.

### The doors are placed, and their size is settled

Placing them was the fix above. Their *size* is now settled too, by the section
above: a placed piece is authored in the larger space and wants
`PLACED_PIECE_SCALE`, which is the same 8 the translations need. A door comes
out **0.19 units** tall against a character of 0.18 — the check that wanted
making, and the one the two self-consistent worlds below could not choose
between.

What follows is what the data does and does not say on its own, kept because the
reasoning still holds:

- The door models decode at **1.54 units** tall, at `upScale` 1, while the
  terrain around them is at `upScale` 8 — and placed pieces are almost all at 1
  (276 of the 283 on the cartridge) while unplaced map geometry runs 16, 8, 32,
  4, 2 and 1.
- The manifest's own scale field is **1, 1, 1 on every resource of the
  cartridge**, so the file does not ask for them to be resized.
- The divisor for the *translation* really is a constant 8 and not the map's own
  scale: scored against the ground, a constant 8 puts 74.1% of placed pieces on
  it, the map's up scale 65.5%, the piece's own up scale 12.5%.

So no scale is applied, and the viewer resizes placed pieces live on `,` and `.`
instead — the same approach as the character, for the same reason.

The two are linked, and the link is what settled it. A door is the best
human-scale reference a village has, and it is the reference the interior scale
above rests on twice over. Divided by 8 a door is 0.19 and a person 0.18, which
is the world the furniture and the village's own props both agree with.

A doorway's *trigger* is a third thing again, and not in either map's space:
across the 154 doorways that have a doorway model standing at them, a trigger is
1.42 times its door's width outdoors and 1.49 indoors when left at its own size
— against 0.19 if it is scaled with the map it stands in.

### The camera was sinking into the ground

A second regression, from the previous commit rather than this one. Taking the
roof off replaced the old answer to geometry in the way — pulling the camera
forward — and the ground is the one thing the culling rule must never remove.
So an eye that ended up inside a hill looked straight through the world.

Halving the character halved the camera's boom and its height with it, which is
what made a latent problem visible. The fix is not to pull in: the eye is
**raised** to stay a clearance above whatever ground is under it, so the camera
keeps its distance and the framing survives. Falling was scaled to the character
at the same time — a terminal speed near a character's own height per tick reads
as teleporting rather than falling.

### The cartridge's own characters cannot settle it

Worth recording, because it looks as though they should.

The village has its own cast, and it is all there: `/data/scenario/M01.npc` is a
NARC holding `M01npc.bin`, which names **49 NPCs** for Angel Falls (`n003a`,
`s017`, `n001a`, …), and `M01place.bin`, which places them.

The placement file is not a tagged table — `isDataTable` says yes because its
string offset happens to equal its length, and it is not. It is a stream of
blocks, each led by the word `0xA5060003` followed by `-246`. Cartridge-wide
there are **1297** such blocks across 74 `.npc` archives, and:

- the block count matches the name count exactly in 45 of the 74, and never
  exceeds it, which is what you would expect if some NPCs are placed by events
  rather than by the file;
- each block carries an index and four floats, and the fourth is **in 0 to 2π in
  all 1297 cases**, with **71% landing on an exact multiple of 90°**. That is a
  facing angle beyond reasonable doubt — authored data, not bytes that happen to
  decode.

**The three floats are a position, divided by the same 8 the map's own
placements need.** Raw, only 23 of the 49 fall inside the village's collision;
divided by 8, **49 of 49** do. The earlier reading here — that they "do not
stand on the village's collision" — was measured against a map whose doorway
markers were still being read as walls, and it is wrong. `readNpcPlacements` in
`@minstrel/game-formats` parses them.

**Most of the cast is not 3D.** Slot 2 of a character record says what it is
drawn as, and the split across the village's 33 names is exact: `kind` 0 has a
`.spr` in `/data/ani` and no model anywhere (24 names), `kind` 2 has a `.chr` in
`/data/chara_sub` and no sprite (8). So the "unsolved preset problem" those 24
were thought to share with the Hero is not their problem at all — they are
sprites, and want a decoder and a billboarding pass rather than a parts list.

**And a cast list is not only that map's characters.** Five copies of `s097a`
sit inside a circle 0.8 units across at one height, 0.157 above the ground
beneath them — nine tenths of a character. They are on a shop floor, in the
shop's coordinates. Asking the map's own collision separates them cleanly: the
ones that belong outside miss the ground by 0.006 to 0.030 and the rest by 0.156
to 0.175. Each interior gets the ones that stand on its own floor, which is
what the ground test already decides: 18 draw in the village, 14 of them 2D, and
the inn's 20 are the inn's own. This is also the check that caught the interior
scale — before it, an interior's collision covered the same range of coordinates
the exterior's cast was placed in, and the village's own characters were drawn
standing inside the inn.

What the NPCs do settle is a different question. `s001.nsbmd` stands **10.03
units** — exactly the player's posed height. Every character on the cartridge is
modelled in one space, so placing NPCs shows whether the characters agree with
each other, not how big any of them should be against a house. The reference had
to come from outside the data either way.

Eight of the village's 33 distinct NPCs ship as whole models in
`/data/chara_sub/*.chr`; the other 25 are `n###a` names that assemble from
`chara_pc` parts — the same unsolved preset problem as the Hero.

The rest of `PERSON` — radius, step-up height, slope limit, gravity — is still a
starting point rather than the game's own numbers. Those live in code this
repository does not read. Inventing values and presenting them as original would
be worse than saying so, which is why they are kept in one exported constant
that is easy to replace when the real ones turn up.

## The camera

`@minstrel/render` holds the camera and, more importantly, the rule for what a
screen that is not the DS's should show.

**A wider screen never shows less than the hardware did.** Above 4:3 the
vertical field of view is held and the width follows the aspect, so a widescreen
player sees further to the sides. Below it — a tall window — the same principle
reverses and the horizontal field is held instead, so the sides are not cropped.
Either way the visible frustum contains the DS's.

That is worth stating because the other convention is just as common and is
wrong here: holding the *horizontal* field and letting height follow crops the
top and bottom on a wide monitor, which for a game whose maps were composed for
a particular vertical framing is not a widescreen mode but a worse one. The
invariant has a test at eight aspect ratios from 1:2 to 4:1.

The follow camera trails the character rather than being welded to it, and the
lag is a rate per second rather than a fraction per frame — a fraction per frame
makes the camera tighter on a fast machine and looser on a slow one, so the game
would feel different depending on the hardware.

### How the game frames it

The first attempt at this was wrong in the ordinary way: a chase camera of the
console-RPG kind, close in and shallow, coming forward when something got in the
way. The game does something else, and it is recorded in `camera.ts` in the
words it was described in rather than paraphrased into constants:

- Pulled **back further and raised higher** than the era suggests, because the
  screen is small and you must see wandering monsters before they see you.
- Angled down **25 to 40 degrees**. True perspective, but the elevation gives it
  a three-quarters, near-isometric feel.
- The character sits **centred, low, and small in the frame** — the framing
  holds a party of four in a line plus a good radius of ground.
- Free, smooth orbit. No snapping to increments.
- Indoors and in tight streets it **tucks in closer and tilts down further**.
- Field and town are one continuous world at character scale, so the camera does
  not change behaviour between them.

Those become two styles, `OUTDOORS` and `INDOORS`, whose distance and look-at
height are given **in character heights** rather than world units — so the
framing survived the character's dimensions being revised, which they were.

### Taking the roof off

The last point is the one that changes the code rather than a constant. The game
does not answer a building standing between the camera and the party by moving
the camera; it stops drawing the building. Roofs come off as you walk in, and
the near-side walls of a room are simply absent. Pulling the camera forward is
the usual answer and it cannot work indoors, because there is nowhere to pull it
to.

`occludes` decides this geometrically — nothing on the cartridge marks a piece
as a roof, and a rule that guessed from a name or a height would be inventing
one. A piece is in the way if the segment from the eye to the character enters
its box **and leaves again** before reaching them. That last clause is the whole
trick: the ground the character is standing on is a box the segment *ends
inside*, so it is never removed, and neither is terrain whose bounding box
reaches up into a hill somewhere else on the map. Without it the rule deletes
the world the moment the camera looks across a slope.

Indoors is decided the same way, by fact rather than threshold: `covered` asks
whether any piece's **underside** is above the character's head. The obvious
proxy — a map's footprint, since a room is smaller than a village — cuts through
a continuum, and the cartridge's maps measure 7, 10, 11, 12 and 13 units across
with no gap to put a line in.

Measured over 485 assembled maps, from eight camera angles each:

| | |
|---|---|
| Pieces removed that the character was standing on | **0** |
| Angles with something in the way, under a roof | 88.8% |
| Angles with something in the way, in the open | 11.2% |
| Share of a map's pieces removed | under 20% |

The first row is the assertion the rule exists to satisfy. The gap between the
second and third is the described behaviour: decisive indoors, occasional
outdoors, which is what walking behind a building looks like.

The reference mode benefits: rendering at 256x192 now goes through the same
projection, so it is the hardware's framing by construction rather than a
letterboxed crop of a widescreen one.

The field of view itself, 50 degrees vertical, is **tuned by eye** like the
character's dimensions. What is faithful here is the framing rule, which does
not depend on knowing the original number.

## The character system

Found, and it is a system rather than a model.

- **Parts** live in `chara_pc.gp2`: 796 of them, sharing one fourteen-bone
  humanoid rig whose bones are named `root`, `waist`, `chest`, `arm0L`, `arm1L`,
  `arm0R`, `arm1R`, `head`, `usiro`, `leg0L`, `leg1L`, `leg0R`, `leg1R` — plus a
  second bone named after the part itself, which is where it attaches.
- **Motions** live apart, in `chara_mp.gp2`: 137 packs, 29 distinct motion names
  on that rig. `walk`, `run` and `stand`, and beside them `attack0a`, `guard`,
  `damage`, `death`, `dance`, `sleep`, `smile`.
- The `.bcfg` files beside the parts name the pack: `mp0200ne` sits in both
  archives, so a part knows which motions drive it.

A character is therefore several models drawn together and posed by one
animation — which the renderer already did for maps, so no new machinery was
needed beyond placing and scaling it.

**The scale is derived, not chosen.** Parts are modelled at about 7.7 units tall
where a village is a dozen across, so they are shrunk to the height the
character controller already assumes a person is. That way the model and the
collision capsule agree by construction rather than by a number someone tuned
twice.

### Which parts make the Hero is still unknown

The three `p_test` models — whole figures on the same rig — stand in, and the
overlay says so rather than implying the Hero is on screen.

`charapreset.bin` looked like the answer and does not survive inspection. It is
a data table carrying 29 of something and records of 102 values holding
five-digit ids with prefixes 12, 13, 15, 16, 17, 20 and 21 — which look exactly
like a category and a part number until you check: several of them, `13083`,
`20591`, `20692`, match no part in any group. They are more likely equipment
ids, which would make the preset a description of what the Hero *wears* rather
than what he is built from, with another table in between.

## One thing that changes the plan

**"Original movement constants" are not available.** They are not in any data
table read so far; they live in code, and reaching them means the disassembly
this repository does not do. Movement will be approximated and tuned by eye, and
that is a stated deviation from the milestone's wording rather than an oversight.

## Still to establish

- **What the six remaining placement values mean.** Three of the fourteen are
  the translation, three the scale, one the parent, one the slot and one the
  position in the list; the rest are unread. The scale is `1, 1, 1` everywhere,
  so nothing is lost by not applying it.
- ~~**Interior and exterior links.**~~ **Answered, and by the same file.**
  `M01.ambl` holds `M01M0000.bmbl`, whose string table names the map's own
  textures and then **nine other map codes** — `M01M01`..`M01M08` and `F01`.
  Cartridge-wide **858 of 898 such links are reciprocal**.

  And its **record stream says which door leads where**, which an earlier
  revision of this list said it could not. The stream did not decode because a
  record's header carries two bits of type per value and is padded to four
  bytes; read as a flat four bytes it desynchronised on 387 of the 667 files.
  With the padding they walk exactly, 667 of 667, and a doorway comes out of
  them whole: a volume standing in the map, the map it leads to, and where you
  come out.

  The check that makes it trustworthy is that the two halves of the file agree
  without being read by the same code — the doorways in the record stream name
  exactly the map codes in the string table above them, on **442 of 444** maps.

  The doorway-model count was the misleading part and is now explained: a model
  is scenery and a record is a trigger, and there is no reason for them to be in
  correspondence. `M01`'s ten models against nine named maps was never evidence
  of anything.
- ~~**What the placement floats are in.**~~ **Answered**: they are a position,
  divided by the same 8 the map's own placements need — see the NPC section.

  The paragraph that used to sit here concluded that doors must live in `SB2`
  event bytecode, "an M3 problem wearing an M2 hat". **That was wrong**, and it
  is left recorded rather than deleted because the reasoning was plausible and
  cost time: doors in this kind of game usually *are* events, so the conclusion
  looked safe once the obvious tables had been searched. What it missed is that
  the table beside the map had not actually been read yet — only walked, with a
  header that did not decode.

  Two of the map list's eighteen numeric values are also answered since: slot 17
  says whether a map is built indoors, which is what gives a map its scale.
- **The collision attribute word.** Terrain kind — water, and the Hexagon's
  poison marshes — is very likely in it. Not needed to walk.
- **`gridX` and `gridZ`.** Understanding them would let the sim use the file's
  own index instead of building one.
- **Where a map starts.** The walker spawns at the most open walkable spot
  nearest the middle of the collision mesh, because the cartridge's own start
  positions have not been located. Coming through a doorway is different — that
  has an arrival to aim at, and `findSpawn` takes it as the spot to search out
  from.
- **What a field uses for walkable ground.** New, and the one functional gap
  left in the slice. A field's collision does not reach its own doorways, on
  **19.2% of them against 87-100% for every other kind of map**, and the road
  east out of the village is one of the misses. Scale, translation, `.bats`,
  `.dat`, the sub-archives, the drawn terrain standing in for collision and
  collision shared between archives are all ruled out **in the file** — see
  `packages/game-formats/FORMAT.md`, which records each one so they are not
  tried again. Settling it means watching the game run.
- **The three positions in a doorway's tail.** Past the arrival each doorway
  record carries three more positions. They repeat the arrival exactly on 847 of
  1,393 and stand more than four units from it on 407, which no reading yet
  explains. Carried nowhere.
