# M2 — Angel Falls, walkable: status

Against the milestone's own list.

| M2 task | status |
|---|---|
| Map assembly and collision | **collision done**; map assembly not started |
| Character controller with original movement constants | not started, and see below |
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

- **The map-to-model manifest in practice.** `.bmdj` lists a map's resources by
  name, and 1,260 of them parse, but assembling a map from one has not been
  tried. Whether it also carries placement, or whether every model is simply
  drawn at the origin, is unknown.
- **Interior and exterior links.** Which door leads where is not located.
  Most likely in the event scripts, which are extracted but not decoded.
- **The collision attribute word.** Terrain kind — water, and the Hexagon's
  poison marshes — is very likely in it. Not needed to walk.
- **`gridX` and `gridZ`.** Understanding them would let the sim use the file's
  own index instead of building one.
