# The bitmap font

Found in this cartridge's `data/pack/font.gp2` and `data/pack_lv5/font_lv5.gp2`,
under names like `f8.mes`, `f10111.mes` and `f12C01B.mes`.

**Not a Nintendo format.** There is no NFTR resource anywhere on the cartridge —
the standard DS font format is not used. Everything here was established by
observation.

## Why this is in `game-formats`

It is not a DS platform format, so it cannot go in `nitro-*`. Whether it is
specific to this title or shared across its developer's output cannot be told
from one cartridge, so it goes in the package for things that are not
game-agnostic, which is the conservative placement.

## Header

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u8` | line height |
| `+0x01` | `u8` | `unknown_0x01`, always 0 |
| `+0x02` | `u8` | cell width |
| `+0x03` | `u8` | cell height |
| `+0x04` | `u8` | `unknown_0x04`, always equal to the cell width |
| `+0x05` | `u8` | `unknown_0x05`, always 0 |
| `+0x06` | `u16` | glyph count |
| `+0x08` | `u32` | character map offset |
| `+0x0C` | `u32` | glyph bitmap offset |

There is no magic number. The header's shape is distinctive enough to identify
one anyway: two reserved zero bytes, a repeated width, and two offsets that must
agree with the glyph count. That test accepts all 529 fonts on the reference
cartridge and nothing else among its 88,000 files.

A glyph count of **zero is legitimate** — 17 fonts are empty, belonging to
scenarios that need no extra glyphs.

## Character map

`count` **big-endian** `u16` codepoints, in glyph order.

Big-endian is not a guess. Read that way the values are Shift-JIS — `0x8140`
the ideographic space, `0x824F`–`0x8258` the fullwidth digits, `0x8260`–`0x8279`
the fullwidth Latin capitals. Byte-swapped they are nothing at all.

## Glyphs

One bit per pixel, most significant bit first, packed **continuously with no row
padding**: a glyph occupies exactly `ceil(width * height / 8)` bytes.

This matters. A 10×10 cell takes **13** bytes, not the 20 that row alignment
would need, and the three 10×10 fonts are unreadable under the other assumption.
It is confirmed arithmetically — `glyphOffset + count * ceil(w*h/8)` lands on the
end of the file, within a few bytes of padding, for every font — and visually,
below.

## Evidence

The decisive check is that decoded glyphs *look like* the characters their
codepoints name. From `f8.mes`, an 8×8 font:

```
0x8250  fullwidth 1      0x8252  fullwidth 3      0x8261  fullwidth B
    ##                     ######                   ########
    ####                 ##      ##               ##      ##
    ##                   ##                       ##      ##
    ##                     ####                     ########
    ##                   ##                       ##      ##
    ##                   ##      ##               ##      ##
    ##                     ######                   ########
```

Nine consecutive glyphs were checked by hand when the format was first read —
space, period, colon, dash, solidus, both parentheses, plus and minus — and each
matched its codepoint.

| check | result |
|---|---|
| fonts parsed | 529 / 529 |
| glyphs decoded | 70,604 |
| cell sizes | 525 × 12×12, 3 × 10×10, 1 × 8×8 |

## What this does not cover: the Latin font

**The European build's Latin glyphs are not in this format and have not been
found.** Every one of the 529 fonts is Japanese: 70,540 of their codepoints are
in the Shift-JIS kanji range, 54 in the punctuation range, and **none is a
single-byte Latin codepoint**. The `f12C01B`-style names match scenario area
codes, so these are per-scenario kanji subsets — the cartridge ships only the
characters each scene needs.

Searched without success:

- every file matching this header's shape, across the whole extraction;
- files whose names suggest a font;
- the NCGR and NCLR graphics resources, including the per-language `tf_*` set in
  `data/ani/tf.gp2`, which turn out to be 512-byte 4bpp UI graphics, seventeen
  per language, far too small for an alphabet;
- `data/bin`, the ARM9 binary and all 35 overlays, scanned for runs of
  fixed-size 1bpp cells at seven plausible geometries. The only matches were
  data tables that match at *every* offset and *every* geometry, which is the
  tell for a false positive.

Remaining hypotheses, untested: the Latin font is anti-aliased at 2 or 4 bits
per pixel and so was invisible to a 1bpp scan; or it is a tile bank whose glyph
ordering lives in a separate table; or it is compiled into an overlay in a form
that scan missed.

M3 needs it. This is the open question.

---

# The tagged data table

Used by the map descriptors (`.bmdj`), the map attribute tables (`.bats`), and
standalone tables such as `data/bin/mapbgm.bin`. One container, several uses.

## Header

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | `unknown_0x00` |
| `+0x04` | `u32` | string table offset — the file size when there is no table |
| `+0x08` | `u32` | string table size |
| `+0x0C` | `u32` | string count |
| `+0x10` | | the record stream, running up to the string table |

## Records

A `u16` tag, a `u8` value count, a `u8` type, then that many 4-byte values.

Type `0x02` means the values are IEEE floats — confirmed by reading them: the
first record of a map descriptor is tag `0x71`, type `0x02`, value `1.2`. The
other type bytes seen (`0x00`, `0x01`, `0x51`, `0xA5`, `0x55`) are not
identified.

`0xFF` fill appears **between** records as alignment padding, as well as after
the last one. It has to be skipped a word at a time rather than treated as an
end: three files carry eight bytes of it mid-stream and are silently truncated
by a parser that stops at the first run. The fill is `0xFF`, not zero, so
stopping on zeroes reads rubbish first.

The stream ends on a record with tag `0x6E` and type `0xFF`, or by reaching the
string table.

## Evidence

| check | result |
|---|---|
| tables parsed | **1,260 / 1,260**, no failures |
| string count matching the header | 1,260 / 1,260 |
| record stream reaching the string table | 1,260 / 1,260 |
| resource names listed | 5,342 |

Two independent checks hold on every file: the string section decodes to exactly
the count the header declares, and the record stream — walked by nothing but its
own length fields — arrives precisely at the string table rather than before or
past it.

## What a `.bmdj` is for

The string table lists a map's resources by name: `M01M0000.imd`,
`M01M00D1.imd`, and so on, `.imd` being the source-format name for what ships as
NSBMD. That makes the map descriptor the **map-to-model manifest**, which is what
tells an engine which models compose a given map — needed for M2.

## What the tags mean is not established

They are exposed as numbers, with values as raw `u32`s alongside their float
reading, so a caller that works one out can use it without this package having
guessed.

Two tags occur exactly once per map descriptor and hold small integers —
`0x6A` in 1..47 and `0x6D` in 1..57 — which is the shape a music id would have.
**They are not music.** The two track each other almost everywhere, and their
values vary from map to map *within a single village*, which a background track
does not. They are more likely counts.

No field in either file has been shown to select a BGM track. Together with
`mapbgm.bin`, whose values do not fall in the sequence archive's 0–81 index
range either, the map-to-music link remains unfound.

---

# `.col2` — the map collision mesh

No magic. A header, a triangle list, a grid index over it, and a short trailing
section. 1,178 files, 4.3 MiB, one or more per map archive.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | `3` on all 1,178 files |
| `+0x04` | `u32` | `shift`, 0–5: coordinates are stored halved this many times — INFERRED, below |
| `+0x08` | `s16[6]` | bounding box: min x, y, z then max x, y, z |
| `+0x14` | `u32` | triangle count |
| `+0x18` | `u16` | grid cell size |
| `+0x1A` | `u16` | `unknown_0x1a` |
| `+0x1C` | `u32` | `gridX` |
| `+0x20` | `u32` | `gridZ` |
| `+0x24` | `u32` | offset of the triangles |
| `+0x28` | `u32` | offset of the per-cell counts |
| `+0x2C` | `u32` | offset of the per-cell starts |
| `+0x30` | `u32` | offset of the triangle indices |
| `+0x34` | `u32` | count of the trailing records |
| `+0x38` | `u32` | offset of them |

The five offsets ascend on 1,177 of 1,178 files, and the last section runs to
the end. Which words were offsets at all came from asking which of the leading
sixteen are word-aligned values inside the file: indices 9–12 and 14 are, on
1,006 files, and no other index is on more than 159.

## The triangle

Twenty-eight bytes. The count at `+0x14` divides the section exactly on
**1,178 of 1,178** files, which is what fixes the stride.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `s16[3]` | vertex 0 |
| `+0x06` | `s16[3]` | vertex 1 |
| `+0x0C` | `s16[3]` | vertex 2 |
| `+0x12` | `fx16[3]` | face normal |
| `+0x18` | `u32` | attributes |

**The normal is the check.** A triangle stores both a normal and the three
points it was computed from, so the stored value must be the normalised cross
product of the triangle's own edges — and it is, for **108,471 of 108,471**
triangles that have any area. The remaining 651 are degenerate, with no normal
to store and none stored. Nothing about that can be satisfied by a wrong field
layout: the normal is read from one place, the points from another, and they
have to agree.

That also fixes the fixed-point format. The normal is 1.3.12 — `-4096` reads as
`-1.0` — while the positions are plain integers in the same units as the
bounding box.

**Positions are integers, not fixed point.** The header box is `s16[6]` in those
same units, and it encloses every triangle on **1,178 of 1,178** files, exactly
on 1,038. The other 140 are snapped outward to round numbers, never inward.

### The format has a ceiling, and the cartridge reaches it

A vertex is `s16` in the units a `fx32` word counts, so a coordinate cannot pass
**±8.00 units** and a mesh cannot be wider than **16.00**. That is not a
theoretical bound here: the furthest vertex on the cartridge sits at exactly
8.00 and the widest mesh is exactly 16.00, with 8 meshes past 7.9 and 93 past 7.
528 of the 1,178 reach past 4.

Anything the game needs collision for that is bigger than sixteen units across
therefore cannot be stored at the size its models are drawn at. Whatever
reconciles the two is not in this file — see below.

### The attribute word is not established

Its values look like packed nibbles — `0x21`, `0x24`, `0x51`, `0x221` in the
high half, `0x213`, `0x3210`, `0x513` in the low — and terrain kind is very
likely among them, which is what a walkable/water/marsh distinction would need.
Reading it properly means watching what the game does with it, which is the
emulator work this repository does not do. It is carried through whole.

## The grid index

Three parallel sections:

- **counts**, `u8` per cell
- **starts**, `u16` per cell, indexing the third
- **indices**, `u16` triangle numbers

**They tile.** `start[i] + count[i] == start[i + 1]` for every cell, and the last
pair lands on the end of the index list, on **1,178 of 1,178** files — allowing
for the one `u16` of alignment padding the list may carry. Every one of those
indices names a real triangle, again on all 1,178.

**How many cells there are follows from the header.** It is

```
cells = floor(gridZ * (gridX + 1/2))
```

on **1,178 of 1,178** files. Equivalently `gridX * gridZ + floor(gridZ / 2)`:
one extra cell on every other row, so the rows alternate `gridX` and `gridX + 1`
wide.

This was recorded as underivable, and the floor is why. The earlier note had the
formula — `(2·gridX + 1) · gridZ / 2` — and read it without rounding, which is
exact only when `gridZ` is even. **850 of the 1,178 files have an odd `gridZ`**,
and those are precisely the 850 the unfloored form missed: `gridX * gridZ` alone
accounted for 511 and the unfloored formula for 328 more, which is where "and
neither explains the remaining 339" came from. Floored, it is all of them.

The parser derives the count and still checks it against the data, because the
tiling makes that free: a wrong length breaks it.

**`gridX` and `gridZ` are the grid's dimensions in cells, and the grid covers
the box.** `gridX * cellSize >= maxX - minX` and `gridZ * cellSize >= maxZ -
minZ` on **1,178 of 1,178**, and on 77.7% one cell fewer would not cover it. So
the header describes a grid of `cellSize` squares laid over the mesh's own
bounding box, with the rows staggered as the cell count says.

**Where cell (0, 0) sits is still not established**, and the staggering is the
likely reason a rectangular reading fails. Taking the grid's corner as the
mesh's minimum and indexing row-major puts only **36%** of the index references
inside the square that names them; column-major gives 26%, and an origin at zero
4%. Until that is settled the cells are parsed and carried but not used to look
a position up — `packages/sim` builds a uniform grid of its own instead.

The cell size is a power of two on **1,178 of 1,178**: 8192 on 667 files, 2048
on 262, 4096 on 173 and 1024 on 76.

## A mesh is stored halved `shift` times

**INFERRED**, from three measurements that agree. No published reference for
`.col2` is known to this project; the parser carries the value as `shift` and
applies nothing.

`+0x04` runs 0 to 5. On every one of the 511 files where it is not zero, the
mesh's largest coordinate lies in the top octave of an `s16`, 16,384 to 32,768,
while files with 0 run as low as 3,684:

| `shift` | files | largest coordinate: min · median · max | cell size |
|---|---|---|---|
| 0 | 667 | 3,684 · 10,098 · 32,768 | 8192 |
| 1 | 173 | 16,384 · 22,630 · 32,768 | 4096 |
| 2 | 171 | 16,384 · 23,552 · 32,706 | 2048 |
| 3 | 91 | 16,384 · 21,504 · 32,256 | 2048 |
| 3 | 4 | 16,461 · 20,992 · 27,676 | 1024 |
| 4 | 57 | 16,384 · 24,294 · 32,768 | 1024 |
| 5 | 15 | 16,384 · 18,686 · 21,536 | 1024 |

That is what halving a mesh until it fits the format leaves behind. The cell
size halves with it at first — `cellSize << shift` is 8192 on all 1,011 files
with a shift of 0 to 2 — as though the grid were laid out before the halving.

Read at `stored × 2 ** shift`, the collision agrees with the models, drawn at
their own `upScale` (see `nitro-gfx/FORMAT.md`), and with the doorways, which
come from a different file:

| across the reference cartridge | stored | `× 2 ** shift` |
|---|---|---|
| doorways just inside their map's collision, 1,122 | 32% | 86% |
| indoor doorways just inside, 677 | 16% | 91% |
| doorway arrivals standing on floor | 78.1% of 1,132 | 99.8% of 1,098 |
| collision floor lying on drawn floor, outdoor maps | 0.61 | 0.84 |

"Just inside" is 0.35 to 1.1 of the way from the box's middle to its edge. The
floor score is taken where the reading changes anything: better on 58 outdoor
maps and worse on 3. Indoors it is better on 102 and worse on 27; those 27 are
rooms whose one floor quad reaches past their walls, which the score counts
against the larger mesh, and drawn from above their walls trace the room at
`× 2 ** shift` and stand in open floor without it.

### What it retired

Before the shift was read, an interior's collision looked like it did not
match its own room — the inn's short by 1.9x, the well's long by 1.94x, the
stable right — and nothing in the file seemed to tell them apart. A factor of
two, fitted by eye, was applied to every interior.

That was two misreadings meeting, not a property of some rooms. The inn and the
stable have an `upScale` of 1 and a shift of 1, so their collision was drawn at
half a room drawn right; `M01M01`, `M01M05` to `M01M07` have an `upScale` of 2
and a shift of 1, so both were at half size and agreed; the well has an
`upScale` of 2 and a shift of 0. The "stable is right" measurement had set the
drawn walls against the collision's floor rather than its walls.
`apps/game/tools/plan.ts` draws a map from above with both on it.

## Why an indoor map once looked an eighth larger — superseded

**Superseded**, and kept as the record of how it was reached. Indoor and outdoor
maps share one space. What differed was the model reader, which drew every
model at its size over its own `upScale` — see `nitro-gfx/FORMAT.md`. The
village's terrain has an `upScale` of 8 and most rooms 1 or 2, so a room drawn
"at its final size" came out eight times the village around it, and so did a
piece placed in the village. Dividing both by eight — `PLACED_PIECE_SCALE` and
the indoor scale — made the village and the rooms with an `upScale` of 1 agree,
and left every room with an `upScale` of 2 at half its size.

Everything below in this section was measured under the old reading.

`maplist9.bin` is what says which, in slot 17: `1` indoors, `2` outdoors, `0`
neither. The labels in slot 5 are what establish it — of the 520 entries with
`1` they read "Interior", "Church", "Well", "Inn", "Item Shop", "Interior - B1";
of the 119 with `2`, "Exterior" and the named regions. **Nothing inside a map's
own archive distinguishes the two**: the descriptor's scale field is `1, 1, 1`
on every resource of the cartridge, and its per-map float is `1.20` on 728 maps
and `1.00` on 18, neither of which tracks this.

### Why an eighth, and how it was settled

The doorway table cannot answer it, and this is worth stating plainly because it
is the obvious place to look: a map and its own doorways are in the same space,
so scaling both together changes nothing either can see. Measured, the doorways
stand over their own floor on **95.6% before and 95.6% after**. Any similarity
transform is invisible from inside.

It takes a reference from outside that space, and there are three. All say the
same eighth.

**The furniture.** The inn's model draws its contents as separate shapes:

| shape | as shipped | divided |
|---|---|---|
| a stool, 0.31 x 0.34 x 0.27 | **1.9 character-heights tall** | 0.24 |
| a wardrobe, 1.35 x 1.54 x 0.77 | 8.6 tall | 1.07 |
| a bed, 1.32 x 0.99 x 1.75 | 7.3 x 5.5 x 9.7 | 0.9 x 0.7 x 1.2 |

A stool taller than the person sitting on it is not a reading of the data.

**The doorway models**, which are placed and so already divided, and therefore
sit in the character's space whatever the map does. The inn is **36 of its own
doors wide** as shipped and 4.5 divided; `M01M08` goes from 105 to 13.

**The village outside**, whose own props are already right undivided — its
fences stand 0.9 of a character, its low walls 0.44 — so the two cannot be in
one space. Undivided, the inn's floor covers **1,395 square character-heights
against the whole village's 796**, and `M01M08` covers 4,627: a single room with
nearly six times the floor of the village around it.

### Two maps, two spaces

A doorway's position and volume are in the map that holds it; its **arrival is a
spot in the map it leads to** and takes that map's scale instead. Scaling both
by the map that holds them puts the character an eighth of the way to the
village every time they leave a house.

### A doorway's volume is not in its map's space

The three numbers a doorway stores are in **three different spaces**, and this
is the one that is easy to get wrong:

| | space | scales with the map? |
|---|---|---|
| where it stands | the map that holds it | **yes** |
| where it comes out | the map it leads to | **yes, by that map's scale** |
| how big it is | the character's | **no** |

The volume being in neither map's space is measured, not assumed. The ruler is
the **doorway model** standing at the trigger: a model is a placed piece, so it
is already in the character's space whatever its map is doing. 154 of the
cartridge's doorways have one, matched by position, and they say:

| | height | width |
|---|---|---|
| outdoors, 74 of them | 1.30 | 1.42 |
| indoors, volume left alone, 80 of them | **1.12** | **1.49** |
| indoors, volume scaled with the map | 0.14 | 0.19 |

A trigger about half again the size of its own door, indoors and out. Scaled
with the map, an indoor one comes out at a seventh of its door and **narrower
than the character** — 0.13 to 0.43 of their height across, against the 0.44
they measure — so they would have to thread it dead centre to get out.

Left at its own size an indoor trigger covers 4.3% to 31.5% of the room's
walkable floor, against 3.4% for the village outside. That is a large share of a
small room and it is meant to be: a doorway is a large share of a small room's
wall. It still leaves two thirds of the worst of them free, which is what the
character needs to step clear of a doorway they arrived in — see `doors.ts`.

## A field's collision does not reach its own doorways — resolved

**Resolved, 12 September.** A field's collision has a `shift` of 4 and its
terrain an `upScale` of 16, and both had been read at half their size. Read at
their own, all 116 doorway arrivals into a field land on floor, and the Angel
Falls field's collision spans −12.00 to 12.84 rather than −6.00 to 6.42. What
follows was measured with both at half size; it is kept for what it ruled out.

**This is a known gap, and it is systematic.** Whether a map's own doorway has
walkable collision under it, by the kind of map:

| map code | doorways over their own collision |
|---|---|
| `C` `D` `H` `M` `R` `S` `T` | 92.8% – 100% |
| `X` | 87% |
| **`F` — fields** | **19.2%** (23 / 120) |

Every other kind is 87% or better. Fields are 19%. That is not noise and it is
not a few bad maps: 53 field maps carry doorways and the failure is spread
across them.

The Angel Falls field is the worked example. It ships **one** `.col2`, 826
triangles, and its own header box says the mesh spans x −6.00 to 6.42 — which is
what we read, exactly. Its three doorways stand at x −8.68 (the road to the
village), 6.38 and 11.06. All three are at or beyond the edges of that mesh, and
none has ground under it. The village's road arrives at x −8.23, agreeing with
the field's own door back at −8.68, so the two independently stored coordinates
agree with each other and disagree with the collision.

### What it is not

Recorded so the next person does not repeat them. Each was measured, not
reasoned about:

- **Not a scale.** Dividing the doorway coordinates by 4, 8, 12, 16, 20, 24 or
  32 gives fields 4.8%, 19.0%, 42.1%, 76.2%, 73.0%, 76.2%, 83.3% — no peak, just
  a climb, which is what collapsing every point onto a central mesh looks like.
  Every other kind of map peaks cleanly at 8, which is how the old placement
  divisor was fixed in the first place.
- **Not a translation.** The field's doorways span 19.7 units and its collision
  spans 12.4. No offset fits one inside the other.
- **Not missing files.** The archive holds exactly one `.col2` and 24 `.nsbmd`,
  and the manifest names all 25. A search of the whole cartridge finds no other
  collision file for this field. Only 13 of the 1,178 `.col2` sit in an archive
  whose name they do not match, and they look like development leftovers.
- **Not the neighbouring archives.** `F01M01` and `F01M02` exist, but they are
  small separate places centred on their own origins — 2 collision triangles and
  none — not the missing part of the field.
- **Not `.bats`.** The attribute tables are 736–1,072 bytes of what read as
  colour and lighting settings, four to seven records deep. There is no grid in
  them.
- **Not `.dat`.** 48 to 64 bytes. Too small to be terrain of any kind.
- **Not the drawn terrain standing in for collision.** Treating every triangle
  the field draws as ground gets 25.4% against the collision's 18.5%, and both
  together 30.2%. The field's own doorways have no drawn geometry under them
  either.

### The collision is not partial — the doorways are outside the map

Measured after the list above, and it moves the question rather than answering
it.

**A field's drawn terrain is a grid of tile models**, named `F01M<row><col>00`:
rows 1–6 step z and columns 1–6 step x, 21 tiles in a ragged rectangle, each
authored **in world coordinates** rather than at its own origin. Together they
span x −7.08 to 7.36 and z −6.53 to 6.63.

The field's one collision mesh spans x −6.00 to 6.42, z −5.50 to 6.88. That is
the same place. **The collision covers the field's own drawn extent**; it is not
a fragment of a larger mesh and there is nothing missing beside it. Collision
does not follow the tile naming — there is no `F01A<row><col>00` — so it is
authored once for the map rather than once per tile.

What is outside is the doorways. Taking every map that has both collision and a
link table, and asking how far each doorway falls outside its own map's
collision box:

| map code | doorways inside the box | of the rest: median, 90th, max |
|---|---|---|
| `C` `H` `M` `R` `S` `T` | 100% | — |
| `D` | 99.5% | 0.13 |
| `X` | 90.5% | 3.04, 4.23, 4.81 |
| **`F` — fields** | **24.4%** (119 doorways) | **3.33, 8.47, 11.56** |

A field is about 14 units across, so a doorway 11.56 units outside its collision
is most of a map's width away — too far to be an edge trigger placed just past
the boundary, which is what the smaller distances would have suggested.

So the question is not "where is the field's missing walkable ground". It is
**why a field's doorway coordinates land in a space its own geometry does not
cover**, when every other kind of map puts them inside it. Nothing read here
answers that, and the arithmetic that would — a scale or a translation — has
been ruled out above.

### What it means for now

Where a field's doorways stand, relative to its ground, is **not established**,
and finding it means watching what the game does — the emulator work this
repository does not do. What is established is that the ground itself is present
and covers the map, and that no scale or translation in any file read here
brings the doorways onto it.

Callers should expect a doorway onto a field to name an arrival with no floor.
`apps/game` puts the character on the walkable ground nearest the arrival
instead, which keeps which side of the map they came in on. Across the cartridge
136 of 1,132 arrivals need that, 87 of them onto a field, and the ground found is
a median 3.5 units from the arrival.

## The trailing records

Eight bytes each, counted at `+0x34`, which divides the section exactly on
**1,178 of 1,178**. 1,699 records in all, and they repeat: `0,0,0,0` on 488,
`23254,0,0,0` on 240, `23254,9513,32767,0` on 115. `32767` is the largest
positive `s16`, which suggests a sentinel. **Not established.**

## Evidence

| check | result |
|---|---|
| files parsed | **1,178 / 1,178** |
| triangles | 109,122 |
| **stored normal == the normalised cross product of its own triangle** | **108,471 / 108,471 with area** |
| **the header box encloses every triangle** | **1,178 / 1,178** (exact on 1,038) |
| **the cells tile the triangle-index list** | **1,178 / 1,178** |
| **cells == `floor(gridZ * (gridX + 1/2))`** | **1,178 / 1,178** |
| **the grid covers the header box on both axes** | **1,178 / 1,178** (tight on 77.7%) |
| every index names a real triangle | 1,178 / 1,178 |
| cell size is a power of two | 1,178 / 1,178 |
| widest mesh, against the `s16` ceiling of 16.00 | 16.00 units |

`tools/harness/test/cartridge.test.ts` reproduces them.

---

# `.bmdj` — what a map is made of

A map archive holds a dozen loose files with no index between them. The `.bmdj`
beside them is the list, and it is an ordinary tagged data table (above) whose
resource records are what this reads.

| tag | meaning |
|---|---|
| `0x6A` | number of resources |
| `0x6C` | one per resource: position, **byte offset into the string table**, two unknowns |
| `0x6F` | one per resource, in the same order: where the map puts it |

The offset is the detail that matters. Records address a string by where it
begins, not by its position in the list, so a reader that counts names instead
gets the first one right and drifts thereafter.

Names are **authoring** names — `C01M0300.imd` — and the built files beside the
manifest carry the same stem with whatever extension they were compiled to.

**A resource is not one file.** One authored `.imd` compiles to everything it
needs, and they all keep its stem: `C01M0300.imd` is `C01M0300.nsbmd` *and*
`C01M0300.nsbta`, and `C01M03G1.imd` is a model, a joint animation and a config.
`resolveMapResources` therefore returns every match rather than choosing one.
Choosing looks harmless and is not: taking the first match on the reference
cartridge loses a map's **main geometry** to the manifest file sitting beside it
under the same stem, and the map still assembles — just without most of itself.

## Placement — `0x6F`

A map piece is authored **at its own origin** and moved into place. The
village's ten doorways are ten models each spanning about a unit and a half from
the origin; drawn unplaced they stack on top of each other in the air in the
middle of the map, with their collision boxes stacked there too.

Fourteen values per record. Three are established:

| value | meaning |
|---|---|
| 3, 4, 5 | translation, as floats |
| 6 | the slot of the resource this one is attached to, or `0xFFFFFFFF` for none |
| 8, 9, 10 | scale, as floats. `1, 1, 1` on every resource of the reference cartridge |

The rest are carried and not read.

**Attachment matters.** A door's collision has no translation of its own: value 6
names the door model's slot (value 1 of that resource's record) and it goes
wherever the door goes. Following that link is what puts the wall in the doorway
rather than leaving it at the origin while the door moves away. Checked on the
village: each of `M01A00D1`..`DA` names the slot of the `M01M00D1`..`DA` beside
it, and none carries a translation.

**The unit is the file's own**, the one models are in at their own `upScale`
and collision at `2 ** shift`, and nothing divides it.

It once looked an order of magnitude too large — the doors at x −28.56 and 26.10
in a village then drawn −4.38 to 7.61 — because the village's terrain was being
drawn at an eighth of its size (see `nitro-gfx/FORMAT.md`), and a divisor was
fitted to bring the placements in line with it. The fit is kept because of what
it found: over every map with both placed pieces and unplaced ground, counting
the pieces authored to sit at their own origin (local `minY` ≈ 0) that end up
standing on that ground, it peaked at 8 — which is the village terrain's own
`upScale`, rediscovered by fitting:

| divisor | on the ground, cartridge-wide | on the village |
|---|---|---|
| 5 | 62.2% | — |
| 7 | 67.9% | 9/10 |
| **8** | **74.4%** | **10/10** |
| 8.5 | 74.8% | 10/10 |
| 10 | 71.1% | 8/10 |
| 12 | 65.4% | 5/10 |

That was `PLACEMENT_SCALE`, now removed: the engine takes placements into the
world by the same `WORLD_SCALE` as everything else.

**Placements are only used when they pair one-to-one.** They match resources by
position, and 696 of the 755 manifests have exactly one per resource; the other
59 carry *more* placements than resources. Pairing positionally through an extra
record would place every piece after it confidently in the wrong spot, so those
maps are left unplaced and `MapManifest.placementsPair` says so.

## Evidence

| check | result |
|---|---|
| manifests parsed | **755 / 755** |
| the `0x6A` count equals the number of `0x6C` records | 755 / 755 |
| every resource record resolves a string by its offset | 755 / 755 |
| every name so resolved ends in `.imd` | 755 / 755 |
| **resources present in their own archive** | **5,342 / 5,342** |

What they turn out to be: 2,985 models, 1,133 collision meshes, 702 `.nsbta`
texture animations, 521 `.nsbtp` pattern animations.

**Assembly is worth doing, measurably.** A map's collision mesh should sit inside
the ground the map draws. Across the cartridge it does so for 939 of 1,133
meshes against the whole assembly, and 798 against the largest single model in
it — so the pieces beyond the main geometry account for real walkable ground.
The remainder is collision that extends past what the archive draws, which is
what an invisible boundary at a map edge looks like.

## Not established

The manifest also carries a `0x6F` record per resource with fourteen values, and
a small tag after each. Neither is read. The trailing tag is **not** a resource
kind: `.nsbmd` and `.col2` alike are followed by `0x3F` most of the time, and
the `0x6F` records are numbered in order on only 534 of 755 files.

## Placement

**There is none, and none is needed.** A manifest carries no transforms, and a
map's pieces already hold their own world coordinates — on `C01M03` the main
geometry, a lamp and a night overlay occupy three distinct, non-overlapping
regions of one space. Assembly is drawing what the manifest lists.

The exception is the `G1` resource, which is centred on the origin and comes
with a joint animation and a config file. Something places that, and it is not
the manifest.

---

# The rest of a map archive — `.dat`, `.bats`, `.bcfg`, `.bpos`, `.bmed`

A map archive holds more than its geometry, its collision and its two
descriptors. **Every one of the small files in it is the same tagged data table**
(above) — `.bmdj`, `.bmbl`, `.dat`, `.bats`, `.bcfg`, `.bpos` and `.bmed` all
parse as one, on every file of each kind. Only the tags and the record widths
differ, so a reader for one is a reader for all of them.

What follows is the structure of each and, where it can be said, what it is for.
None of these are read by this repository yet; they are written down because
they parse cleanly and because the next person should not have to find that out
again.

**A caveat on the strings below.** A value is reported as a string when it is an
offset that lands on a printable one, and a small integer can do that by
accident. Where a record mixes what look like names and numbers, treat the
first-position names as sound and the rest as unconfirmed.

## `.dat` — which region a map belongs to

**657 files, 48 or 64 bytes**, and the smallest format here: two or three
records.

| tag | values | meaning |
|---|---|---|
| `102` | 1 | `21` on 650 of 657, `8` on 2 |
| `104` | 1 | a **map code**, as a string |
| `109` | 1 | on 15 files |
| `105` | 1 | on 1 file |

**INFERRED: tag `104` names the region the map belongs to.** Of the 657:

- **400 name the file's own area** — every `M01M*` says `M01`, every `F01M*`
  says `F01`, every `M02M*` says `M02`.
- **150 name `T00`**, which the map index does not have at all. They are all
  `B*` archives — 47 in `B01`, 36 in `B02` — plus a handful of `F99`, `S14`,
  `Z01` and `Z02`. It reads as the unset value.
- **107 name some other map the index knows**, and this is the interesting
  group: `B01M28`..`B01M30` name `F16`, labelled *Hermany*; `B01M31` and
  `B01M32` name `F18`, *Snowberia*; `B01M36`..`B01M38` name `F15`, *Djust
  Desert*. Those are dungeon maps naming the overworld field they sit in — and
  **their own index entries carry no region**, so the `.dat` supplies what the
  index leaves blank.

What the region is *used* for is not established.

## `.bats` — per-map colour and lighting

**504 files, 560 to 1,072 bytes.** The attribute tables, in three shapes:

| tag | values | on |
|---|---|---|
| `100` | 1 | 236 files, always `0` |
| `103` | 0 or 1 | 268 files |
| `104` | 12 | 715 records |
| `105` | 15 | 3,529 records |
| `106` | 18 | 1,652 records |

`105` and `106` records open with an index that counts from zero within the
file, so both are per-slot settings. Their values are a mix of IEEE floats
around `1.0` and `0.2` and 16-bit values that read as `fx16` — `32767` for one,
`22528` for 0.6875, `20479` for 0.625 — which is what colour and intensity look
like. A map ships its lit pieces twice, once per lighting, so a per-slot table
of colours is the shape this ought to have.

**What the slots are is not established**, and neither is which value is which.
`docs/findings.md` records that these are float-valued fog and lighting settings
and that they carry no music selection.

## `.bcfg` — a piece's named states

**145 files, 80 or 160 bytes.** They sit beside `G1`-suffixed pieces — gates and
doors — and beside `I00`.

| tag | values | meaning |
|---|---|---|
| `100` | 1 | how many `102` records follow: `1` or `4` |
| `102` | 4 | a **state name**, then three numbers |
| `101` | 0 | a separator |
| `112` | 1 | `0xFFFFFFFF` |

The names are the giveaway: **`open`, `closed`, `close`, `opend`, `open2`** on
the door pieces, and `in` on `C01I00`. So a `.bcfg` is the list of states its
piece can be in, with three numbers each — plausibly a frame range and a speed,
though nothing here confirms that.

## `.bpos` — a grid of codes, on the `Z` maps only

**5 files, 1,056 bytes each**, all `Z01M0100`..`Z05M0100`.

| tag | values | meaning |
|---|---|---|
| `125` | 1 | `18`, the number of `126` records |
| `126` | 11 | eleven codes |

Eighteen records of eleven values is an **11 by 18 grid**, and most values
resolve to four-character codes: `W01A` overwhelmingly, then `W02A`, `W03A`,
`W04A`, `R01A`..`R04A` and `E01A`. `W`, `R` and `E` reading as wall, room and
entrance is the obvious guess and is **not confirmed**.

The `Z` maps are outside this repository's slice, so this is recorded rather
than pursued.

## `.bmed` — the `E1` pieces

**12 files, 80 to 176 bytes**, each named for an `E1` piece — `F17E1.bmed`,
`D04M02E1.bmed`.

| tag | values | meaning |
|---|---|---|
| `102` | 1 | a name, usually the matching `.chr` archive |
| `108` | 1 or 2 | `44` on every record seen |
| `106` | 1 | a float, `2.0` or `4.0` |
| `101`, `100`, `105`, `107`, `103`, `104`, `109` | 1–2 | not established |

A `102` record names a `.chr` — `D04M02E1.chr`, `F18E1.chr` — so an `E1` piece
is backed by a character archive rather than by map geometry. `105` pairs that
name with the string `copy`, which recurs 14 times across the twelve files.

---

# `maplist9.bin` — the cartridge's index of every map

Another tagged data table, and the one that says what the maps *are*.

| tag | meaning |
|---|---|
| `0x66` | number of map entries |
| `0x67` | one per map, 22 values |

Four of the twenty-two values are byte offsets into the string table:

| slot | meaning |
|---|---|
| 4 | region — "Angel Falls", "Gleeba" |
| 6 | **map code**, which is also the name of the map's archive |
| 7 | the name whoever built it wrote — "Inn", "Church", "Erinn's House Lv 1" |
| 13 | a second code, usually one with a real attribute table, but not this map's |

**Zero means empty, not "the first string".** A blank field holds zero, and zero
is also the offset of the build stamp that opens the string table, so a reader
that resolves it produces a list in which every unset field is a date. That is
the one trap in this file and it looks entirely plausible until you notice every
map was apparently built at 10:39:39.

## What it gives

1,010 entries, 872 distinct codes. The code names the archive — `M01` is
`M01.amdj` — so this is the bridge from a place to the files that draw it. 667
of the codes name an archive that ships; the rest are development maps the
cartridge kept an entry for, with names like "Debug Floor", "Bed Test" and
"For Encounter Testing".

## The other eighteen values are not established

They are carried on `MapEntry.values`. One reading was tried and **disproved**:
slots 10 and 12 look like an exterior/interior pair on the ten maps of one
village, and are not — across the whole list, 48 maps labelled "Exterior" and 49
labelled "Interior" share the same combination of them.

## Evidence

| check | result |
|---|---|
| map entries read | **1,010** |
| entries carrying a code | **1,010 / 1,010** |
| distinct codes naming an archive that ships | 667 / 872 |
| entries carrying an archive code with a real `.bats` | 722 / 731 |

---

# `.bmbl` — a map's textures, and the maps it connects to

One per map archive, in the `.ambl` beside the `.amdj` that holds the geometry.
667 of them, 144 to 4,320 bytes, median 432. They share the tagged container
above, and the same `.ambl` also holds the map's `.nsbtx` textures (737), a
`.dat` (657) and, on five maps, a `.bpos`.

There are 681 `.ambl` in all: these 667 per-map ones, and 14 grouping archives
named `ats_B`..`ats_Z` that hold the cartridge's 504 `.bats` attribute tables
instead. Only the per-map ones carry a `.bmbl`.

An earlier revision of `docs/M0-inventory.md` said `.ambl` holds the `.bats`
attribute tables. It does not, and the consequence is not cosmetic: a map's
**textures** are in the `.ambl`, so a map assembled from its `.amdj` alone has
none.

## Header

Identical to the shared table's.

| offset | type | meaning |
|---|---|---|
| `0x00` | `u32` | `unknown_0x00` |
| `0x04` | `u32` | string table offset |
| `0x08` | `u32` | string table size |
| `0x0C` | `u32` | string count |
| `0x10` | | the record stream, running up to the string table |

## Two readers, and why there are two

`readMapLinks` reads the header and the string table and stops. `readMapTransitions`
and `mapDoorways` walk the records.

The split is historical but still earns its place. The records did not decode at
first — a walk of `M01M0000.bmbl` desynchronised after five records and the shared
`readDataTable` threw on **387 of the 667** files — because the record header was
being measured wrong. It is `u16 tag, u8 count, two type bits per value, padded to
four bytes`; the padding was the missing part. With it the records walk on **667 of
667**. The earlier note in this file that "the record stream is not decoded" is
superseded, and so is the conclusion drawn from it, below.

`readMapLinks` survives because the names alone answer the question "what does this
map connect to" without walking anything, and because it is the reader the map index
already uses.

`nameAt` is kept because records address strings by byte offset rather than by
ordinal, as `.bmdj`'s do.

## What the names are

`M01M0000.bmbl` names twelve: its own two textures (`M01M00T1`, `M01M00T2`), the
map itself (`M01M0000`), and **nine other map codes** — `M01M01`..`M01M08` and
`F01`. Every one is a code `maplist9.bin` knows and an archive that ships.

**A name cannot be classified from the file alone.** `M01M00T1` is this map's
texture and `M01M01` is a neighbouring map, and both begin with the map's own
code. So `linksTo` takes the caller's own test for what is a map code — in
practice `readMapList`'s index — and the map's own code, which is dropped.

## The doorways — `0x72`, and `0x73` + `0x74`

A doorway is a volume you walk into, the map it leads to, and where you come out.
Two record forms carry one, and both are live.

| | trigger volume | destination | arrival | tail |
|---|---|---|---|---|
| `0x72`, 25 values | slots 0-6 | slot 8 | slots 11-14 | 15-24 |
| `0x73` + `0x74` | `0x73` slots 1-7 | `0x74` slot 4 | `0x74` slots 7-10 | 11-23 |

The trigger volume is `x, y, z, width, height, depth, angle`. The arrival is
`x, y, z, facing`. Positions are in the units `.bmdj` placements use, the same
ones models and collision are in once each is read at its own size — confirmed
by landing on the destination map's own collision floor, as 1,096 of 1,098
arrivals do. Angles are radians and are not scaled.

**`width`, `height` and `depth` are the whole size of the volume, not half of
it.** Measured against the doorway models the triggers guard, which is the one
reference that does not favour a bigger answer:

| | doorway model, as drawn | its trigger, as stored | ratio |
|---|---|---|---|
| the village's nine doors | 0.193 tall, every one | 0.250, every one | 1.30 |
| the inn, from the inside | 0.179 tall | 0.188 | 1.05 |

A trigger a little bigger than its own door is what a trigger is. Read as half,
the village's would stand 0.50 tall — two and a half doors, and nearly three
times the height of the character walking through.

The `height` is a nominal doorway height rather than a measurement: 2 raw units
on almost every doorway on the cartridge. Nothing should test against it.

### The test that got this wrong

An earlier revision of this file called these half-extents, on the strength of
how often a doorway contains the point you arrive at coming back through it —
45.2% read as half-extents against 8.0% read as full sizes.

**That comparison cannot decide the question.** A box twice as big contains more
points whatever the truth is, so the count favours the larger reading by
construction; the two numbers measure the size ratio and nothing else. It was
also the wrong question, because you arrive *in front of* a doorway rather than
inside it, so neither number should be near 100%.

The consequence was not cosmetic. Every trigger volume stood twice as wide and
twice as deep as it should, which in a room the size of the village inn puts the
way out most of the way across the floor.

**Arrival is always three slots past the destination**, in both forms, and so is
the rest of the tail. That is what makes these one structure rather than two.

A `0x73` is a trigger and the `0x74` that follows it says what the trigger does.
They are adjacent on **2,301 of 2,301** records, and no `0x74` naming a map lacks
a `0x73` before it. Most `0x74` do something other than change map; those are
skipped rather than guessed at, which is why 415 of the 440 read here are the
24-value shape and the rest are shorter.

The destination is taken from a fixed slot rather than by searching, and checked
against the header's type bits. It holds up: **1,418 records mark that slot a
string and none marks a second slot one**, so there is nothing to choose between.
Two `0x72` mark it a string and store `0xFFFFFFFF` — a doorway with no destination,
which reads as `undefined` rather than as a name.

### The tail is not established

Past the arrival each form has a marker and then **three further positions**. On
847 of 1,393 records they repeat the arrival exactly, which invites reading them
as somewhere for the party to stand. On 407 they are more than four units from it
and on one they are 170, which no line-up explains. They are named `unknown` and
carried nowhere.

### Where the two forms overlap

106 maps carry both forms; 315 carry only `0x72` and 23 only `0x74`, so neither is
dead data. Where both describe the same doorway they do not coincide: across the
village's seven shared doors the `0x73` trigger stands **one raw unit from the
`0x72` one every time**, and is a unit deeper. The two agree on the angle exactly,
which is what identifies them as one door rather than two.

`mapDoorways` merges them, keeping the `0x73`/`0x74` arrival, because it is the
better of the two by both measures available:

| | arrival stands on the destination's floor | arrival is within half a unit of the door back |
|---|---|---|
| `0x72` | 736/958 (76.8%) | 755/935 (80.7%) |
| `0x74` | 376/440 (85.5%) | **404/424 (95.3%)** |

A form also repeats a doorway within itself — the village lists three of its ten
`0x74` twice, alike but for two integers this parser does not read — and the
repeat is dropped too. Doors that lead to the same map from different places are
kept: of 196 same-destination pairs, 87 stand within 0.3 units and the rest are
over three times as far apart.

## Superseded: "adjacency, not per-door targeting"

An earlier revision of this file concluded that which doorway leads to which
neighbour "is not here — it would have to come from the record stream." It is
here, and it did.

The observation behind that conclusion was sound: `M01` has ten doorway *models*
(`M01M00D1`..`DA`) against nine named maps, and across the cartridge those two
counts agree on only 60 of the 172 maps that have both. A doorway model is scenery
and a doorway record is a trigger, and there is no reason for them to be in
correspondence — one arch can be decoration and one trigger can have no arch.

The trap recorded alongside it stands, and is worth keeping: scanning records for
values that happen to resolve to a string offset appears to work and does not.
Offset `0` is a valid name and zero-valued fields are everywhere, so the first name
in the table comes back as referenced by almost everything. The type bits are what
make the destination slot readable; without them there is no way to tell a name
from a coordinate.

## Evidence

Reproduced by `tools/harness`; the fixtures in `test/maplinks.test.ts` and
`test/transitions.test.ts` are built in code.

| check | result |
|---|---|
| files whose string table reads | **667 / 667** |
| declared string count matches names found | **667 / 667** |
| files whose records walk exactly to the string table | **667 / 667** |
| `isMapLinks` accepts | 667 / 667 |
| directed links to a known map code | 898 |
| **links that are reciprocal** | **858 / 898 (95.5%)** |
| `0x73` immediately followed by a `0x74` | **2,301 / 2,301** |
| records marking the destination slot a string | 1,418 |
| records marking a *second* slot a string | **0** |
| transitions read | 1,416 — 976 `0x72`, 440 `0x74` |
| doorways after merging the two forms | 1,150, across 444 maps |
| doorways naming a code `maplist9.bin` knows | **1,149 / 1,150** |
| **maps whose doorways match the map codes in their own string table** | **442 / 444** |
| arrival stands on the destination map's collision floor | 884 / 1,132 (78.1%) |
| arrival within half a unit of the door back | 932 / 1,099 (84.8%) |

Two things make the reading trustworthy, and they are independent of each other.

Reciprocity: each interior names exactly its exterior and nothing else — `M01M01`,
`M01M02` and `M01M08` all name `M01` alone — and `F01` names `M01`, `D01` and
`S01M01`. Names that happened to look like map codes would not agree with each
other in both directions 858 times.

Agreement between the two halves of the file: the doorways read out of the record
stream name exactly the map codes found in the string table, on 442 of the 444
maps that have any. Angel Falls' nine doorways are its nine named neighbours —
eight houses and the road out to the field — and their trigger volumes stand where
its doorway models stand. The two exceptions are both explicable: `M07` has a door
to `M07M07` that its string table does not name, and `X05M10` has a door leading
back into itself, which the name test excludes by design.

The arrival checks are the weaker evidence and are reported as found. They fail
where the destination map has no collision mesh assembled, where the arrival stands
on something the mesh does not cover, and — for the door-back check — where a map
is reached from somewhere that does not lead back to it.

---

# `<area>.npc` — who stands in an area, where, and in which of its maps

A NARC beside the map data in `/data/scenario`, holding two files: `<map>npc.bin`
names the cast and `<map>place.bin` puts them. 74 archives, 1,385 names and
1,285 placements between them.

## The cast — `<map>npc.bin`

An ordinary tagged data table (above). Its `0x03` records are the characters,
five values each.

| slot | meaning |
|---|---|
| 0 | `0xFFFFFF01` on every character record of the cartridge |
| 1 | the character's id, which is what a placement refers to |
| 2 | what it is drawn as — see below |
| 3 | `0xFFFFFFFF`, unset |
| 4 | byte offset into the string table, or `0xFFFFFFFF` for no name |

**Slot 2 says whether a character is a model or a sprite.** Across the 33
distinct names of the slice's village the split is exact and it is the byte that
decides:

| value | count | what it is |
|---|---|---|
| `0` | 901 | a 2D sprite: `/data/ani/<name>.spr` exists, and no 3D model of that name exists anywhere |
| `1` | 317 | carried only by records with no name |
| `2` | 132 | a 3D model: `/data/chara_sub/<name>.chr` exists, and no `.spr` does |
| `5` | 35 | not established — the village's one example, `z015d`, has neither |

Every `kind` 0 of the village has a sprite and no model; every `kind` 2 has a
model and no sprite. 24 and 8 of the 33.

## The placements — `<map>place.bin`

**Not a tagged table**, though `isDataTable` says it is: its string offset
happens to equal its length, which is exactly what that check tests. It is a
stream of **variable-length** blocks — the gaps between them run from 76 to 924
bytes — found by a two-word signature.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | `0xA5060003` |
| `+0x04` | `u32` | `0xFFFFFF0A` |
| `+0x08` | `u32` | not established; `0x44C` on only 1 of the 74 archives |
| `+0x0C` | `u32` | the id of the character this places |
| `+0x10` | `f32` | x, in the units map placements use |
| `+0x14` | `f32` | y, likewise |
| `+0x18` | `f32` | z, likewise |
| `+0x1C` | `f32` | facing, in radians |

After the header come sub-records, each one character in one map over a span
of the story. Two forms are read, found by their own marks:

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32[2]` | `0x550D0005 0xFF02A955`, 60 bytes; `0x55090005 0xFFFF0155`, 44 bytes, without a position |
| `+0x08` | `u32[7]` | not established |
| `+0x24` | `u32` | the map, by its own id |
| `+0x28` | `u32` | the character's id |
| `+0x2C` | `f32[4]` | x, y, z and facing — the 60-byte form only |

| check, across the cartridge | result |
|---|---|
| sub-records | 1,977, in 1,289 blocks |
| map in the block's own area | 1,976 |
| id the block's own | 1,876 — so a record names its own character |
| header repeats the first positioned record | 485 of the 636 blocks that have one |
| words 3-4, read as a pair, at or after words 0-1 | **1,977 of 1,977** |
| word 6 | 2 on 1,227, 1 on 378, 0 on 371, one other |
| bytes between blocks that are neither form | 91,652 — not read |

The seven words are **not decoded**. That the two pairs never run backwards is
what a span from one story stage to another would look like, and the game uses
it that way only as a testing affordance: `t` and `y` show the cast at each
stage a map's records start at. Nothing claims that is what a stage is.

**Positions are in the units map placements use.** Taken as though they were
already world units, only 23 of the village's 49 characters fall inside its
collision at all; taken into the world by the same `WORLD_SCALE` as the map,
**49 of 49** do. The earlier reading — that the positions "do not stand on the
village's collision" — was measuring against a map whose doorway markers were
still being read as walls.

**The facing angle is established beyond reasonable doubt**: across all 1,285
blocks it lies within 0 to 2π, and 71% sit on an exact multiple of 90°.

## A cast list is the whole area's, and the file says which map is which

`M01.npc` holds **49** characters: the village outdoors and everyone inside its
houses. Each is placed in the coordinates of the map it stands in, so five
copies of `s097a` sit inside a circle 0.8 units across — a room, in that room's
own coordinates.

**The word at `+8` of a placement block is the map's own id**, the one
`maplist9.bin` carries in the first slot of each entry. The join is exact: all
**1,289** placement blocks on the cartridge name a value that is some entry's
id. So `1104` is `M01M04`, which the index calls the Stable — and that is where
the five `s097a` and `s001` stand.

Angel Falls runs 1100 for the village and 1101 to 1112 for its interiors, and
`S07` 5700 to 5707, so within an area the ids read as `area x 100 + sub-map`.
That was how this was first read, and it is a habit of the numbering rather than
a rule — ids elsewhere run to 20001, and 3.4% of placements do not match a code
spelled that way. Nothing needs to take the number apart now the index gives it
outright.

It is the same in every 60-byte record of a block, so it belongs to the
character rather than to one of their placements.

| check | result |
|---|---|
| areas whose placements all share one `x / 100` | 73 / 73 |
| placements whose word is an id in `maplist9.bin` | **1,289 / 1,289** |
| placements tagged 1100 with floor under them in `M01` | **all of them** |
| placements tagged anything else with floor under them in `M01` | **none** |

The map list's first slot was read as an unknown until this; it is `0` on the
139 entries for maps that do not ship, and distinct on the rest.

### Asking the collision instead does not work

Recorded because it was the reading here until the word was found, and because
it looked sound. The characters that belong outside miss the village's ground by
0.006 to 0.030 and the rest by 0.156 to 0.175, so a threshold in that gap sorts
the *village* correctly.

It cannot sort the interiors, and nothing in that measurement says so. Every
interior is its own little map about its own origin, so a character standing at
(0.1, −0.1) of one room is over the floor of every other room too. The stable
drew **fifteen** of the area's characters; it has seven. The village outdoors
was right the whole time, which is exactly why this survived.

## Evidence

Reproduced by `tools/harness`; the fixtures in `test/npc.test.ts` are built in
code.

| check | result |
|---|---|
| archives holding both files | 74 |
| cast lists read | 73 / 74 (one is zero bytes) |
| placement blocks read | 1,285 |
| **every block's id is an id in the cast list** | **73 / 74** |
| placements joined to a character | 1,283 of 1,285 |
| archives with fewer placements than names | 26 |
| archives with as many placements as names | 45 |
| archives with **more** placements than names | 1 (`R01`, by one) |
| village characters inside its collision, raw | 23 / 49 |
| **characters drawn in more than one map of the village** | **none**, since the map word is read |
| **village characters inside its collision, ÷ 8** | **49 / 49** |
| facing within 0 to 2π | 1,285 / 1,285 |
| kind 0 with a sprite and no model (village) | 24 / 24 |
| kind 2 with a model and no sprite (village) | 8 / 8 |

---

# `.spr` — the 2D characters

1,316 files in `/data/ani`, a directory nothing had opened. **24 of the slice's
33 villagers are sprites**, not models: every `kind` 0 character in a cast list
has a `<name>.spr` here and no 3D model anywhere on the cartridge, and every
`kind` 2 has a model and no sprite.

## Header

| offset | type | meaning |
|---|---|---|
| `0x00` | `u16` | frame count |
| `0x02` | `u16` | version; `3` on 1,315 of 1,316 |
| `0x04` | `u16` | frame width — **overstates the stride on most files, see below** |
| `0x06` | `u16` | nominal frame height — one short of the pitch |
| `0x08` | `u32` | `unknown_0x08` |
| `0x0C` | `u32` | zero on every file seen |

An earlier note in `docs/findings.md` said the leading `0x10` on these files was
a width. It is the frame count: `arrow3.spr` carries `01 00` and holds one 8x8
frame, `n003a.spr` carries `10 00` and holds sixteen.

## The palette, and how it is found

At the end of the pixel data behind a count word: a `u32` equal to `16`, then 16
`u16` in BGR555 with bit 15 clear.

**It has to be found by the size equation, not by scanning.** A backward search
for the count word lands on stray `16`s in the animation tables at the end of
the file. Enumerating candidates and keeping the one where the pixels implied by
the header fit between the header and the candidate resolves **1,265 of the
1,316** files.

## The stride is not always the header's width

On sheets whose `0x08` is `2` it is: **186 of the 187** such files read cleanly
at the header's width. On the rest it overstates by exactly eight pixels —
**1,001 of the 1,063** files with `0x08` of `4` are coherent at `width - 8` and
none at `width`. The village's one such character, `n099a`, is a 32-wide sheet
whose header claims 40; read at 40 it is diagonal noise.

Keying off `0x08` would be wrong on the sixty-odd exceptions, so the two
candidates are put to the data instead. A sheet read at its true stride has
pixels that agree with the one below far more often than one read at the wrong
stride, where every row is offset from the last and the image shears. The
margin is not fine: `n099a` scores 0.79 at 32 against 0.53 at 40, and `n003a`
0.69 at its header's 32 against 0.53 at 24.

What the header's field means on those files, if not the stride, is not
established.

## Pixels

4bpp indices, one row of the stride at a time, ending exactly where the count
word begins. The start is a whole number of rows before it — anything else
shears the sheet sideways rather than shifting it up, which is what made this
look unreadable for a long time.

Index 0 is transparent whatever colour the palette gives it.

## Frames are not the header's height — INFERRED

`n003a` holds **663 rows for 16 frames**, or 41.4375 each, and the header says
40. Every fixed pitch drifts across the sheet.

Cutting on rows where the sheet goes quiet gives seams at 40, 81, 124, 164, 206,
247, 289, 330, 371, 413, 454, 496, 537, 579 and 620 — fifteen seams, so sixteen
frames, agreeing with the header — and their spacings run 40, 41, 43, 40, 42 …
averaging 41.4. Each of those fifteen sits within two rows of `k x rows /
frames`, with a **constant** offset rather than a drifting one.

So frame `k` runs from `round(k x rows / frames)` to `round((k + 1) x rows /
frames)`, which alternates 41 and 42. **Nothing in the file has been found that
states this**, so it is marked inferred: it is a reading that agrees with the
measured seams and puts a complete, correctly coloured villager in every cell
for 22 of the village's 24 sprite characters.

Two other readings were tried and disproved: rows stored bottom-up, and 17
frames of 39 — which divides 663 exactly and shears worse.

## Animations

Names first, in fixed slots written over a longer string — fragments of
"…create an Animation" survive between them, and a real name is told from them
by having an underscore. Then one record each:

```
u32 steps
u32 order[steps]      // 0..steps-1, rotated; meaning not established
u32 duration[steps]   // 8 on a walk step, 60 on a stand
u32 frame[steps]      // which frame of the sheet to show
```

The records are found by trying every aligned start and keeping the run that
consumes the file exactly, names a frame that exists at every step, and yields
as many records as there are names. A wrong start fails on the first record or
two.

A villager carries twelve: four walks of four steps, and eight one-frame
stands.

| animation | frames |
|---|---|
| `walk_down` | 0, 1, 2, 1 |
| `walk_up` | 3, 4, 5, 4 |
| `walk_left` | 6, 7, 8, 7 |
| `walk_right` | 9, 10, 11, 10 |
| `stand_down` / `stand_l_down` | 1 / 12 |
| `stand_left` / `stand_l_up` | 7 / 14 |
| `stand_up` / `stand_r_up` | 4 / 15 |
| `stand_right` / `stand_r_down` | 10 / 13 |

Every one of the sixteen frames is reached, and a stand is the middle frame of
the walk that faces the same way — `stand_down` is frame 1, the neutral pose of
`walk_down`. The four diagonals have no walk and take frames 12 to 15.

**Which way round the eight go is established by looking, not by the data.**
They are listed in a consistent rotation, but nothing in the file says whether
it turns through the character's left or its right. Drawn one way the village
dog stands with its head where its tail should be; drawn the other it is a dog.
`down` and `up` are identical under the mirror, so only a side-on character can
settle it — which is why an animal did and the people did not.

## Evidence

Fixtures in `test/sprite.test.ts` are built in code.

| check | result |
|---|---|
| `.spr` files | 1,316 |
| version `3` | 1,315 / 1,316 |
| palette located by the size equation | **1,265 / 1,316** |
| village sprite characters that read | **14 / 14 placed outdoors** |
| **village sprite characters that decode to a recognisable figure** | **24 / 24** |
| sheets where the header's width is the stride (`0x08` = 2) | 186 / 187 |
| sheets where it overstates by eight (`0x08` = 4) | 1,001 / 1,063 |
| village sprite characters with a decoded animation table | **24 / 24** |
| …with all eight standing directions | **24 / 24** |
| readable sheets cartridge-wide carrying an animation table | 181 / 1,317 |
| frame heights summing to the sheet's rows | by construction |
| sheets whose cut pitch is the block's own measured byte period | **checked on every sampled sheet, in `tools/harness`** |
| 32x40 sheets whose measured period is 664, at 8/11/16/20 frames | **all of them, 187 surveyed** |

## The frame segmentation, and the two ways it was got wrong

**Settled**: the pitch is `width x height / 2 + 24` bytes and the figure is the
last `height - 8` rows of it. What follows is how that was reached, because
every wrong answer on the way was reached by a measurement that looked sound.

It was first cut by the even division — frame `k` at `round(k x rows / frames)`
— which is inferred and does not hold. That put a band of the neighbouring frame
inside the cell: the first five rows of `n003a`'s frame 7 were a slice of another
frame, wrapped so that its ink sat against the left and right edges with a gap
between. In play a villager came apart as the camera turned around them, because
each facing is a different frame and only some were mis-cut.

An earlier check here — "ink fills 33 to 41 of the 41 rows" — was fooled by
exactly that: the foreign band counts as ink. So was its successor, "the ink
starts on row 0 and ends on row 39 in almost every frame, so the frames do not
creep": the strip holds the top rows whether the figure has crept or not, and
the figure was creeping a row a frame.

### What has been ruled out

- **A constant offset on the even division.** Sweeping every offset scores at
  best 5 to 7 frames of 16 with their ink in one piece, and the best offset is
  not the same for two characters (40, 42, 42, 35).
- **A fixed pitch with a leading offset.** Better, and interestingly so: pitch
  **41** at an offset of 3 to 6 scores 9 to 13 of 16, against the even
  division's 5 to 7. 41 is the header's own `height` of 40 plus one. But the
  offset is not constant across characters, and `n099a` — 839 rows, a nominal
  height of 51 — scores 1 of 16 at every pitch and offset tried, so the model
  does not generalise.
- **A per-frame table in the file.** Searched `n003a.spr` for a run of sixteen
  values between 35 and 55 at byte, `u16` and `u32` strides through the first
  4 KiB. There is none.

### The 23 rows were a red herring

Recorded because it was chased and cost time. The guess was that `rows` — walked
back from the palette — includes data that is not pixels, that the giveaway was
663 rows for 16 nominal 40-row frames leaving 23 spare (and 839 for 16 nominal
51-row frames leaving 23 as well), and that the pitch would then be the header's
`height`. **All three parts are wrong.**

- **The gap is not 23 and not constant.** Taking the pixels as exactly
  `frames x width x height / 2` bytes ending at the palette, the rows the
  current start adds in front of them are 2 on 999 sheets, 23 on 163, 9 on 42,
  and other values below that. 23 looked constant because both sheets examined
  happened to be in the same group.
- **The header's `height` is not the pitch.** On `n003a` the rows that are
  entirely empty fall at 81, 249, 330, 413, 496, 579 and 662 — a period of
  **83 rows for two frames**, so 41.5 each, against a header height of 40.
  `n017a` gives the same 83.
- **Cutting from the header's byte count is worse, not better.** It makes
  `n003a`'s frame 7 clean and its frame 0 broken, and across the cartridge it
  takes frames whose ink is in one piece from 2,306 of 4,096 to 1,922.

### The frames are not a row grid: the pitch is `width x height / 2 + 24` bytes

**Found by rendering a sheet to a PNG and looking at it** — `tools/sprite`,
which writes to `out/` and is local-only. Three separate measurements had said
the sheets were broadly fine, and all three were blind to this.

Frame 1 of `n003a` is a whole, centred villager. Frame 0 was the *same figure
sliced down the middle with its halves swapped* — right half against the left
edge, left half against the right. That is a **horizontal wrap**, and no count
of rows or of ink was ever going to show it.

The cause is that a frame is not a whole number of sheet rows. On the village's
32x40 characters the pitch is **664 bytes — 41.5 rows**, which is
`width x height / 2 + 24`.

**The pitch is measured, not fitted.** The instrument is the period of the
sheet's own bytes: score the block against itself at every candidate lag, over
the positions where *either* copy has ink so the transparent majority cannot
vote for every lag alike, and take the peak. `tools/sprite/render.ts --period`
is that measurement, and `n003a` peaks at 664 with 0.465 against 0.325 for the
runner-up — not a marginal call.

It is a constant of the geometry rather than a division of the file. Across 187
multi-frame sheets the peak is 664 on **every 32x40 sheet**, at 8, 11, 16 and 20
frames alike; `ceil(block / frames)` agrees only where there happen to be 16.

41.5 rows is the same 41.5 the empty rows give — they fall every 83 rows, two
frames apart — arrived at independently.

### 664 was rejected once, on arithmetic that was wrong

Recorded because it cost the most. An earlier revision of this section chose 648
and ruled 664 out on the grounds that "sixteen frames at 664 leave no room in
front of the palette for a start above the header". **Sixteen frames do not need
sixteen pitches.** They need fifteen, plus the pixels of the last one:
`15 x 664 + 512` is 10,600 bytes, and `n003a` has 10,612 between its header and
its palette. It fits, with twelve to spare.

648 came from sweeping the pitch and scoring by how much ink lands in the two
edge columns. That is a proxy for the wrap, and it found a pitch that does not
wrap — 648 is a whole number of rows away from 664, so it shifts the figure
vertically rather than horizontally, and the proxy cannot see vertical error at
all. **A pitch one row short does not slice a figure; it walks the figure a row
further down its cell with every frame**, which is what put a fragment above the
character and cut the hem off by the end of the sheet.

`tools/harness` now checks the pitch the parser uses against the measured period
on every sheet it samples, which is the check that would have caught this.

### A frame is an eight-row strip and then a thirty-two-row figure

The 664 bytes divide as **8 rows, then the figure's 32**, and the header's
`height` of 40 is the two together. Cut at 32 rows, eight rows into the unit,
every frame of the village's characters is a whole figure with nothing above it.

The row structure is plain once the block is folded on its 83-row period: ink
rises through the strip, drops to almost nothing for one row, then rises again
through the figure and tapers to nothing at its hem.

**What the strip is has not been established.** It is a squashed copy of the
figure rather than a constant blob — `n017a` carries the blue of her dress above
the grey of her apron, and it turns as she does — so a shadow and a reflection
are both consistent with it, and a hat is not. It is separate from the figure
either way, and read as part of the frame it drew as debris floating over the
cast.

`SHADOW_ROWS` in `sprite.ts` carries the eight. It replaced a `LEAD_ROWS` of
six, which was fitted by eye against the drifting cut and is not a measurement
of anything now the pitch is right.

### The six criteria that were tried, and are not to be tried again

These chose the start, back when the pitch was a row short. Every one renders
wrong, and they are listed so the same ground is not covered twice:

| criterion | what it actually does |
|---|---|
| least ink in the top rows | slides the window until the head is cut off — picks 192, 160, 208 |
| clear air above the head, feet on the floor | satisfied by 0 or 1 frame in 16; these characters fill their cells |
| least ink against the left edge | finds the right phase within a row, but lands a row high, and rendering it clips every head |
| anchor the last frame to the palette | clips every head |
| least ink in the two edge columns | picks 648: blind to vertical error, which is the error there was |
| a per-frame table in the file | there is none — searched `n003a` for a run of sixteen values between 35 and 55 at byte, `u16` and `u32` strides through the first 4 KiB |

The lesson is the one that keeps recurring here: a criterion that scores how a
cut *looks* will find a cut that scores well. The period of the bytes is a
property of the data, and it answered in one run.

### The loader in the cartridge's own code

`CLAUDE.md` puts disassembly outside this repository, so this is a foothold
rather than a finding. The ARM9 binary is BLZ-compressed — 638,216 bytes at ROM
offset 0x4000, decompressing to 1,000,984 — and carries the sprite loader's own
path strings:

| RAM address | string |
|---|---|
| `0x20ef20b` | `/data/ani/d_%c%03d.spr` |
| `0x20e6e98` | `/data/ani/d_i127.spr` |
| `0x20efdc4` | `data/chara_sub/%s.chr` |

Whatever computes a frame's offset is reached from the code that loads those
paths. Nothing here has been disassembled and no behaviour is claimed from it.

### What is established

**1,031 of the 1,264 sheets have `rows` divisible by `frames`.** For those the
even division is exact, the pitch is a whole number, and there is nothing wrong.

**233 do not**, and they are where the mis-cutting lives. Adding a single row to
the count makes 48 of them exact and three rows makes 2 more; **183 stay
fractional** under any small correction, so a one-row error in finding the start
is not the general answer either.

On the affected sheets the measured period (83 rows per two frames, 41.5 each)
and the computed one (663/16 = 41.44) differ by about a row across the whole
sheet, which is too small to account for a five-row band of foreign pixels. So
the artefact seen in play is **still unexplained**, and what has been narrowed is
where to look: the 233, and what makes their row count fractional.

---

# Event text — `ev#####_<lang>.bin`

Each event unpacks from its own `/data/event/ev#####.gp2` — 523 of them — to a
`.stb` and five text files, `_de`, `_en`, `_es`, `_fr` and `_it`. The `.stb` is
the script, magic `SB2\0`, and is not read yet. The text files are **ordinary
tagged data tables** — see "The tagged data table" — and read with the same
code.

| check | result |
|---|---|
| text files | 2,615, five per event |
| read as a table | 2,590; the other 25 are zero bytes, five events' worth |
| records | 18,245, **every one tag `0x64` with two values**: a number, then a string offset |
| events whose five languages carry the same message numbers in the same order | **518 of 518** |
| bytes of 0x80 or above in any string of any language | **none** |

A message whose string offset is `0xFFFFFFFF` says nothing — 40 of the 18,245;
none points at an empty string. `readEventMessages` returns each message's
number and its text.

## The text is ASCII, and markup does the rest

Accents are markup in every language — Spanish `<'i>` (1,705) and `<~n>`,
German `<:u>` (1,569) and `<ss>`, French `` <`e> ``, `<^e>` and `<,c>`, Italian
`` <`e> `` — which is why no string needs a byte above 0x7F. Spanish and French
also mark some punctuation this way: `<^!>`, `<^?>`, `<!>`, `<?>`, `<:>`. A line
break is written as the two characters `\n`, 454 times in English.

`parseMarkup` splits a message into text, line breaks and tags — `<name>` or
`<name=a,b,c>` — and gives no tag a meaning. Across the cartridge no `<` is left
open and no `>` stands alone.

## What the tags mean — mostly not established

49 names occur in the English text. The few with a meaning are the ones
`docs/M0-inventory.md` records from reading the text:

| tag | English | what it is |
|---|---|---|
| `<1>` | 3,435 | an apostrophe |
| `<,>` | 3,395 | a pause |
| `<HERO>` | 317 | the player's name |
| `<Cap>` | 218 | capitalise |
| `<SE_014>` | 16 | a sound effect, by number |
| `<IF_x>` … `<ELSE_…>` … `<ENDIF_x>` | 91 `HERO_MALE`, 34 `MALE`, 11 `SOLO` | conditional text — they nest properly in **all 1,159** messages, in any language, that use them. What each condition tests is only named |

French adds conditions of its own — `IF_VOWEL_FR_HERO`, `IF_FEMALE_PARTY` —
which is what choosing between *de* and *d'* before a name looks like. The rest
are **not established**: `<ADD>` (1,303), `<6>`, `<9>`, `<-->`,
`<PAD_WAIT_NOCUR>`, `<CLOSE>`, `<LEADER>`, `<CEN>`, `<QUEST…>`, `<YESNO>`,
`<TIME=…>`, `<ME_…>`, `<END>`, `<PAGE>` and a dozen rarer ones.

704 English messages open with `*:`, which is how the text writes a line said
by someone; what the game does with it is not established. A named speaker is
written `//Name//` instead.

---

# Event scripts — `.stb`, magic `SB2`

736 files: 523 in `/data/event`, one per event; 165 in `/data/evspt_lv5`,
which carry cutscene staging — model files, motions, cameras; 33 in
`/data/scenario`; 13 in `/data/menu`; 2 in `/data/event_lv5`. Only the
container is read. What the code in it does is not.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `char[4]` | `SB2\0` |
| `+0x04` | `u32` | size of the shared block below — `0x1500` on 522 of the 523 event scripts |
| `+0x08` | `u32` | end of the section table: its start plus 8 × the count, on 523 of 523 |
| `+0x0C` | `u32` | start of the section table: `0x40` on all 736 |
| `+0x10` | `u32` | number of sections |
| `+0x14` | | zero, bar `+0x18`, which is 0 to 5 on 122 files and not established |
| `+0x40` | `u32[2]` × n | the sections: a number, then an offset into the file |

On all 523 event scripts the sections run in rising offset order and start past
the table and the shared block. **The shared block is byte-identical on 522 of
the 523** — common to every event, not part of one. The sections are numbered
200, 300 and 100, in that order, on 522 (the other has 200, 201, 300, 301, 100
and 101); section 100 is the largest, a median 3,632 bytes. Each section's
first word is its own offset less `0x20`, which is observed and not explained.

**A script names its own messages.** 3,522 of the 3,649 message numbers an
event's text carries occur in its own script as a word, against 43 of 3,649
control numbers it does not carry — mostly in section 100. The words around them
are regular: in 7,692 of 8,963 occurrences the two before are `3, 1`, which
reads as a typed operand. What the types are is not established.

**A script does not name maps, or other events.** Event numbers occur as words
in scripts no more often than control numbers do — 1,655 against 1,514 — and no
village event names an Angel Falls map id. What a script does carry as strings
is its cast by model file (`chara_sub/s016.chr`), motions (`stand`, `walk`),
fades (`EFADE`) and, in some, its own name in brackets. Which event runs when is
decided elsewhere: see the triggers below.

---

# What characters say — `/data/scenario/<area><letter>0.gp2`

Each area has a set of archives, one per letter — Angel Falls has fourteen,
`M01A0.gp2` to `M01Q0.gp2` — each holding numbered text files in the five
languages. **The number is a character's id** from the area's cast list: 7,974
of the 7,994 English talk files in areas that have a cast list.

**The letters follow the story.** Only Angel Falls has an `A`; other areas start
later — `C01` at `B`, `D04` at `D`. 22 of Angel Falls' 46 talk characters
change between letters and the rest say the same throughout. Villager 2 has five
versions, and read in order they move from the prologue, through the village
chapter and its aftermath, to the end of the game.

A file is a tagged data table whose records are tag 1, 2, 4 or 5 — 17,241,
14,273, 2,149 and 1,101 of the four-value form across the cartridge — carrying
three or four numbers and then a string offset. **The numbers are not
established.** Within a letter the first two often read as a range of
sub-stages — 1 to 1, 2 to 3, 4 to 4, 5 to 5, and 99 for "to the end" — which
is the shape the cast's stage words have; the last is one of a few values, 16,
192, 193 and so on.

---

# Triggers — `trigger<area>.bin`

75 files, one per area: a tagged table whose records are all tag 1 — 5,805 of
them, 352 in Angel Falls. Each opens with a map id — Angel Falls' records name
the village, 1100, on 156 and its interiors 1101 to 1112 on the rest — then four
numbers in the shape of the cast's stage span, then one small number (0, 1, 11,
3, 20 …), then words that split cleanly into a high and a low half.

| check | result |
|---|---|
| records with a high half of 6 or 118 whose low half is a character of the area | 4,067 of 5,805 |
| that character placed in the record's own map | **3,433 of 5,200 (66%)**, against 945 (18%) for another character of the same area |
| the same, in records that also carry a high half of 119 | 233 of 306 (76%), against 81 (26%) |
| Angel Falls words with a high half of 119 whose low half is an event number | **58 of 64** — 2110, 2370, 2420, 2620 and more |

So a record plausibly reads: in this map, over this span of the story, this
character — and some go on to name an event. That is **INFERRED**; the other
high halves are not decoded, and nothing here yet acts on them.

