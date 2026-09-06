# M2 — Angel Falls, walkable: status

Against the milestone's own list.

| M2 task | status |
|---|---|
| Map assembly and collision | **both done** |
| Character controller with original movement constants | **done**, with constants tuned by eye — see below |
| Camera behaviour, extended for widescreen | not started |
| Interior/exterior transitions, doors, stairs | not started; the link data is not located |
| Fixed-preset Hero model with the minstrel outfit | not started, and see below |

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

## Two things that change the plan

**The Hero is a parts library, not a model.** `chara_pc.gp2` holds 796 parts —
192 bodies and 79 leg pieces on a shared 14-bone skeleton, plus 121 heads, 142
faces, 200 weapons and 24 others at one bone each — and no whole characters
except three `p_test` models. The slice excluded equipment-on-model to keep
*runtime* assembly off the critical path, and that still holds: nothing has to
re-assemble when equipment changes. But a fixed preset still has to be assembled
once, and **which part ids make the minstrel Hero is not known**. The 27 `.bcfg`
files beside the parts are float-valued configs, not a parts list.

The three `p_test` models are full bodies on the same skeleton, so they are the
obvious way to get a character walking while the preset is worked out.

**"Original movement constants" are not available.** They are not in any data
table read so far; they live in code, and reaching them means the disassembly
this repository does not do. Movement will be approximated and tuned by eye, and
that is a stated deviation from the milestone's wording rather than an oversight.

## Still to establish

- **What places a `G1` resource.** Every other piece of a map carries its own
  coordinates; that one does not.
- **Interior and exterior links.** Which door leads where is not located.
  Most likely in the event scripts, which are extracted but not decoded.
- **The collision attribute word.** Terrain kind — water, and the Hexagon's
  poison marshes — is very likely in it. Not needed to walk.
- **`gridX` and `gridZ`.** Understanding them would let the sim use the file's
  own index instead of building one.
- **Where a map starts.** The walker spawns at the middle of the collision mesh
  because the cartridge's own start positions have not been located.
