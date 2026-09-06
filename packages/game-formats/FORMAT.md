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
| `+0x04` | `u32` | `unknown_0x04`, 0–5 |
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

**How many cells there are is read, not computed.** The obvious answer,
`gridX * gridZ`, holds for only 511 files. `(2·gridX + 1) · gridZ / 2` accounts
for another 328, and neither that nor any grid derived from the box and the cell
size explains the remaining 339. Since the tiling identifies the end of the list
unambiguously, the parser walks it rather than deriving a count it cannot
justify — and the walk is self-checking, because a wrong length breaks the
tiling.

What `gridX` and `gridZ` do mean is therefore **not established**. They are
plausible grid dimensions — `ceil(extent / cellSize)` matches `gridX` on 963
files and `gridZ` on 1,024 — but "plausible on 82%" is not a reading.

The cell size is a power of two on **1,178 of 1,178**: 8192 on 667 files, 2048
on 262, 4096 on 173 and 1024 on 76.

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
| every index names a real triangle | 1,178 / 1,178 |
| cell size is a power of two | 1,178 / 1,178 |

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
