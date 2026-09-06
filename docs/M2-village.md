# M2 — Angel Falls, walkable: status

Against the milestone's own list.

| M2 task | status |
|---|---|
| Map assembly and collision | **both done** |
| Character controller with original movement constants | **done**; the character's size is measured off the houses, the rest tuned — see below |
| Camera behaviour, extended for widescreen | **done**, including taking the roof off; field of view tuned by eye |
| Interior/exterior transitions, doors, stairs | not started; the link data is not located |
| Fixed-preset Hero model with the minstrel outfit | **a character walks**, but it is a stand-in — see below |

**Done when:** you can walk the whole village and enter every building.

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
`@vesper/sim` grids the mesh itself. The file's index is parsed and unused.

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

`@vesper/sim` walks a character over a collision world: horizontal movement
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

### Forward was backwards

The camera sits at `focus + (sin yaw, cos yaw) · distance`, so the direction the
player is looking — into the screen, away from the camera — is the **negative**
of that. The movement code used the positive, so W walked towards the camera.
Strafing was right, which is why it read as "inverted" rather than as scrambled.

It was wrong from the first day of walking and only became obvious once there
was a character on screen to watch: with the camera following the feet, walking
backwards away from the view looks much like walking forwards.

That math now lives in `moveRelativeToCamera` in `@vesper/render` rather than in
four lines inside a key handler, and it is tested against the **view matrix**
rather than against the sign of a sine: pressing forward has to put the
character deeper into the picture and further from the eye, at six different
camera angles. A sign error cannot pass that.

### The doors are placed, and their size is unresolved

Placing them was the fix above. Whether they are the right *size* is not
settled, and nothing in the data settles it:

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

The two are linked, and the link is worth stating. A door is the best
human-scale reference a village has. If the doors at 1.54 units are right, a
person is about 1.3 units. If the person at 0.45 is right, the doors should be
about 0.53. Those are the two self-consistent worlds and the data does not
choose between them.

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

**The three floats before it are not established.** They look like a position
and are in the right range for one, but the ones belonging to the village
exterior do not stand on the village's collision, so something about the frame
they are in is still missing. They are not parsed, and no parser claims them.

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

`@vesper/render` holds the camera and, more importantly, the rule for what a
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
  the translation, three the scale, one the parent; the rest are unread.
- **Interior and exterior links.** Which door leads where is still not located,
  and three candidates have now been ruled out. A fourth is now in view: `M01`
  carries ten single-shape models `M01M00D1`..`DA`, each 1.54 units tall with a
  two-triangle collision box beside it — one per building entrance. Flat planes
  standing in doorways are what a trigger volume looks like.
- **What the placement floats are in.** See the NPC section: the facing angle is
  established, the three floats before it are not. The map list carries no link
  field; its eighteen numeric values do not include one that indexes another
  map. The per-map `.bats` attribute tables are float-valued — fog and lighting,
  four and seven records for a village with ten doors. And `apinfo.bin`, which
  looked promising at 144 KB, is battle-road and network data.

  What remains is the event scripts. Doors in this kind of game are usually
  events rather than geometry, which fits: it is `SB2` bytecode that is not yet
  examined, and that makes transitions an M3 problem wearing an M2 hat.
- **The collision attribute word.** Terrain kind — water, and the Hexagon's
  poison marshes — is very likely in it. Not needed to walk.
- **`gridX` and `gridZ`.** Understanding them would let the sim use the file's
  own index instead of building one.
- **Where a map starts.** The walker spawns at the middle of the collision mesh
  because the cartridge's own start positions have not been located.
