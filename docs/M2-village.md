# M2 — Angel Falls, walkable: status

Against the milestone's own list.

| M2 task | status |
|---|---|
| Map assembly and collision | **both done** |
| Character controller with original movement constants | **done**, with constants tuned by eye — see below |
| Camera behaviour, extended for widescreen | **done**, with the field of view tuned by eye |
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

The viewer will walk an assembled map: press **G**, then WASD. There is no
character model yet, so the camera follows the feet and the overlay reports
where they are. Movement is relative to the view, which is what a third-person
camera needs.

### The constants are tuned by eye

`PERSON` — radius, height, step-up height, slope limit, gravity — is a starting
point, not the game's own numbers. Those live in code this repository does not
read. Inventing values and presenting them as original would be worse than
saying so, which is why they are named as tuned and kept in one exported
constant that is easy to replace when the real ones turn up.

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
would feel different depending on the hardware. It also comes forward when a
building stands between it and the character, using the same "too steep to stand
on" test that walking uses to decide what a wall is.

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

- **What places a `G1` resource.** Every other piece of a map carries its own
  coordinates; that one does not.
- **Interior and exterior links.** Which door leads where is still not located,
  and three candidates have now been ruled out. The map list carries no link
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
