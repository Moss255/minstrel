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

## The Latin fonts — `/data/pack_lv5/fd_me.bin` and `fd_s7.bin`

Found 15 September, outside the archives the search below covered: two loose
files that are **strips of the Latin glyphs, one bit a pixel**. Their head:

| offset | type | `fd_me.bin` | `fd_s7.bin` | read as |
|---|---|---|---|---|
| `+0x00` | 4 bytes | `1.0` and a zero | the same | a version, INFERRED |
| `+0x04` | `u16` | 1,600 | 1,312 | the strip's width, in pixels |
| `+0x06` | `u16` | 12 | 12 | its height |
| `+0x08` | `u32` | 2,400 | 1,968 | the pixels' size in bytes |
| `+0x0C` | `u32` | 16 | 16 | where they start |

**Width × height ÷ 8 is the size on both** — 1,600 × 12 ÷ 8 = 2,400, and
1,312 × 12 ÷ 8 = 1,968 — and the pixels end the file. Drawn row by row, each
byte's **most significant bit on the left**, both read as text: digits, `A`–`Z`,
`a`–`z`, punctuation, `€ £ © ®`, the accented capitals and small letters of the
European languages, arrows and shapes. With the bits the other way every glyph
is mirrored in eight-pixel pieces. `fd_me` is a serifed face; `fd_s7` a
smaller one without, which also has `+1` to `+9`.

**The index beside each** — `fi_me.bin` and `fi_s7.bin`; `readLatinFont` in
`latinfont.ts` reads a strip and its index together. It is not a tagged table,
though its head passes for one's: a version, then five `u32`s.

| offset | type | `fi_me` | `fi_s7` | read as |
|---|---|---|---|---|
| `+0x00` | 4 bytes | `1.1` and a zero | the same | a version, INFERRED |
| `+0x04` | `u32` | 242 | 245 | the glyphs |
| `+0x08` | `u32` | 105 | 22 | the kerning pairs |
| `+0x0C` | `u32` | 24 | 24 | where the pairs start |
| `+0x10` | `u32` | 444 | 112 | where the glyphs start |
| `+0x14` | `u32` | 2,380 | 2,072 | where their names start |

The sections meet end to end on both — 24 + 105 × 4 = 444, 444 + 242 × 8 =
2,380 — and the names run exactly to the file's end.

**A glyph is eight bytes**: its name's offset (`u32`), its width, a byte of
flags, and where it stands in the strip (`u16`). Every glyph begins one pixel
after the one before it ends — 241 of 241 and 244 of 244 — and the last ends at
the strip's width, 1,600 and 1,312. The names follow one another in glyph order,
each ending with a zero.

**A name is the character as the game's text spells it**: `A`, `0`, `/`, and
for the rest the tags the text uses — `<'A>` Á, `<ss>` ß, `<66>` “, `<1>` the
apostrophe of `warrior<1>s shield`. Every tag `talk.ts` reads — read there from
where each stands in the text — names a glyph in both fonts. Three are the
name-entry keyboard's: `<capslock>`, `<shift>` and `<back>`.

**The flags.** Bit 7 is set on exactly the small letters whose capital is in
the font — 51 in both, a to z and the accented and joined ones — and the one
small letter without a capital here, ß, lacks it: INFERRED, a letter that can
be made a capital (`hasCapital`). Bit 6 is set on the vowels, capital and
small, plain and accented, and on Æ and æ — and on ñ, though not on Ñ, nor on
Œ or œ: 55 glyphs, the same in both fonts. So it is not simply "a vowel", and
what it marks is not established. Neither bit is set on anything but a letter.
The low six bits are 1 on the letters and digits and 3 or 4 on most of the
rest; not established. The seven are carried as `unknown_flags`.

**A kerning pair is four bytes**: the left glyph, the right, a signed byte and
one that is 0 on all 127. The signed byte is −1 on every pair: `AT`, `AV`,
`AW`, `AY`, `LT`, `Ty`, `F.`, `P.` and on in `fi_me`, 22 in `fi_s7`.

**Not established**: which face the game uses where, and the space it leaves
between glyphs — the strip's one-pixel gap suggests one. The party's name
panels in the capture of Stornway's church (kept locally) are in a face without
serifs, as `fd_s7` is; how wide the names stand cannot be measured from that
capture, whose edges its scaling blurs. Nor is the space read: the first glyph
in both, named `< >`, draws a bar — 18 of its 24 pixels inked in `fd_me`, 8 of
12 in `fd_s7` — a cursor or a marker, not a space. The only glyph with no ink
is `//`, zero pixels wide, which is no space either. So how wide the game makes
a space is not in the index.

The game here sets the party's names on the top screen in `fd_s7`, a pixel
apart — the face and the pixel both ours, see `apps/game/src/latin-text.ts`.

## What this does not cover: the Latin font

**The European build's Latin glyphs are not in this format** — they are the
strips above. What follows is the search that missed them, which looked for
them in this format:

**Not found in this format.** Every one of the 529 fonts is Japanese: 70,540 of their codepoints are
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

**The NFTR fonts the code names are the Wi-Fi utility's, not the game's.**
Overlay 31 names three — `msg/lc_s.NFTR.l`, `msg/lc_m.NFTR.l`,
`msg/kc_m.NFTR.l` — and the ARM9 binary carries the `RTFN` stamp, but no file
on the cartridge is called any of them, and every other place those names and
stamps occur is inside `/dwc/utility.bin`: Nintendo's Wi-Fi Connection setup,
which draws its own screens. `/data/pack_lv5/font_lv5.gp2`, which the ARM9 also
names, holds one font, `f8.mes`, whose Latin is the 26 fullwidth capitals and the
ten digits; no `.mes` font on the cartridge has a lowercase letter.

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
Falls field's collision spans −12.00 to 12.84 rather than −6.00 to 6.42.

The doorways themselves, measured again on 14 September over all 663 maps:
113 of the 124 in a field have floor under them, and every other kind of map
97.9% or more. Angel Falls field's three all do, and the character walks from
the village road to the two that lead on (`apps/game/test/travel.test.ts`).
The 11 without are nine leading to `O00` — from `F44`, `F56`, `F99` and its
sub-maps — and one each in `F07` and `F27`.

What follows was measured with both at half size; it is kept for what it
ruled out.

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

# Items — `/data/prm/itemname.gp2` and `/data/prm/itemdt_*.gp2`

**Names**, `itemname_<lang>.nat`: a `u16` record count (1,178 in English) and a
`u16` that differs by language, then 16-byte records — a singular's offset, a
plural's, a word that differs by language, and the item's id — then the strings,
which the offsets count from. `readItemNames` reads it. Record 0 is
`wonder helm` / `wonder helms`, id `0x2F8A`. The third word is the name's
grammar — its articles, packed as a monster's are; see "Articles" below.

**The id is the item's.** Every item table, `itemdt_<c>_<lang>.nat`, is a
32-byte head and then 32-byte records, each holding an id from the names: the
tools table's first is `0x55F0`, medicinal herb, then strong medicine, special
medicine, superior medicine, antidotal herb. Measured by where the names' ids
fall in each file: stride 32 on 1,007 of the combined table's gaps and every
per-category table's. The categories by their first records: `a` gloves, `b`
body, `d` accessories, `h` helms, `l` footwear, `s` shields, `t` tools, `u`
legwear, `w` weapons. `readItemTable` reads one.

**A record begins four bytes before its id.** It was first read from the id,
behind a 36-byte head, and then each record's last four bytes held the *next*
item's actions: the medicinal herb's ended `(256, 256)`, strong medicine's
action, and the head's own last four were `(255, 255)`, the herb's.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u16` ×2 | what using it does: two action numbers (see "Actions"), 252 for nothing |
| `+0x04` | `u16` | the item's id |
| `+0x06` | `u16` | its price, INFERRED |
| `+0x08` | `u16` | `0xFFFF` on most, `0xFFFC` and 0 on others; not established |
| `+0x0A` | 22 bytes | carried: a sort position; at `+0x10` a `u16`, **the offset in the names at the table's end of the next record's item's name** — on all but the last record of the weapons (267 of 268), shields (44 of 45) and armour (182 of 183), never its own, which suggests a record begins 16 bytes before where it is read here (not established); a run of numbers that count the records; and an icon |

**The two actions.** 36 of the 234 tools name an action called what they are —
the medicinal herb 255 in both, holy water 259 and 260, the chimaera wing 261,
sage's elixir 410 — and 179 name 252, which has no name, as all but a few
pieces of equipment do. **The 23 skill books name actions that are not
theirs**: their first numbers run 10, 21, 32, 54, 65, 76 … 285 in steps of
eleven — Frizzle, Bang, Moreheal, the seed of magic on the Sage's Scripture —
which is a count, not an action, and is not read. Every other tool's field
action is called what the tool is, so the game here takes an item's field
action only when it is. **Which is which, INFERRED: the field's
first, battle's second.** The chimaera wing, the Evac-u-bell and the nine
seeds, which the series uses only outside battle, have 252 second; the weapons
and shields that do something when used in battle have 252 first and an action
second (370, 384, 396 …).

**The price** — INFERRED, and well supported: every one of the 330 items any
shop sells has one above 0, and none of the 140 items at 0 — quest pieces, the
celestial suit among them — is sold anywhere.

**What an item does is not in its record** — it is in the table after the
records, found 15 September; see "The stats" below. What follows is the search
that missed it. No field of the record climbs with the
price as a weapon's attack would (the best, bits of `+0x11`, agrees with the
price's order at 0.64 over 264 weapons, where attack against price would be
expected far higher), and no file on the cartridge — `itembtlprm.nat`'s 44-byte
records, `itemsort`'s 28, the ARM9 binary and all its overlays, decompressed —
holds the weapons' ids at a fixed spacing beside numbers that do. The tail of
each category table after its records is not strings on the equipment tables
but 32-byte entries with 4096s in them (1.0 in fixed point), which look like
a layout, not per-item numbers: 386 of them for 268 weapons. So attack and
defence are kept somewhere not keyed by item id — by position in a table, most
likely — and finding them wants the disassembly, or a few values read off the
shop's screen in the emulator to search for.

**Nor by position, as far as the price can tell** — 15 September. Without a
trusted value to search for, a table of the weapons' attack was sought by what
it would do: rise with their price. Every run of 268 numbers, 8- or 16-bit, at
every spacing from 1 to 64 bytes, was scored by the sign test over neighbours
in price order — only the 168 neighbours whose price strictly rises — laid
out once by the weapon table's own order and once by `id − 19050`, leaving
room for missing ids. The weapon table's order follows price at only 0.21, so a
counter does not pass. **The test works: the item tables' own price field
scores 1.00, in all ten copies in five languages.** Nothing else reaches 0.35
in 918 sources — every file in `/data/prm` and `/data/bin`, the ARM9 and its
35 overlays, decompressed. In the 10,550 files of `/data/menu`, `/data/skill`,
`/data/enemy`, `/data/tmap`, `/data/pack` and `/data/pack_lv5`, laid out by
the table's own order only, the best is 0.38, in a model's and a background's
pixels — the level chance reaches over that many. So no such table is in those
files or the code at those widths and spacings; wider records, packed bits,
another order or a number worked out in code are left.

The one value on screen in the evidence kept locally — a Rusty sword's
"Attack E 215", on a level-58 character wearing it — is the character's
attack, not the sword's, so it is not one to search for.

## The stats — the table after an equipment category's records

**Found 15 September**, by what attack would do rather than by a value to
search for; `readItemStats` in `itemstats.ts` reads it. Each equipment table —
weapons, shields, headgear, armour, gloves, legwear, footwear and accessories;
not the tools, which do not go on so — goes on past its records:

| where | what | on all eight |
|---|---|---|
| `32 × N` | N entries of 32 bytes, N the head's record count | the first shares its 32 bytes with the last record: its first eight are that record's actions, id and price |
| then | 100 bytes, not read | 100 on all eight |
| the file's end, less the head's `u32` at `+0x08` | N names, each ending with a zero | N on all eight, every one an item's name; the word is their length exactly |

**The names label the entries, in order**: entry *k* is the item named *k*-th.
That order is the bag's — `itemsort`'s `unknown_1` — on most categories, but
not on legwear, where only the names' order reads. Scanning by the weapon
records' own order, as every earlier search did, cannot find the table.

The names are one to an entry in all eight English tables, but not in every
language: **the Spanish armour's hold 180 for 183**, since three pairs of items
share a Spanish name — "atuendo de combate", "chaqueta de esgrima", "vestido de
bailarina" — and the block keeps each once; the records' name offsets (above)
point both of a pair at it. Even the English shields have two records pointing
at one "pot lid". So `readItemStats` gives an entry its name only where the
names are one to an entry, and reads the numbers everywhere: entry *k*'s are the
same in every language.

**Word 5 (bytes 20–23): bits 0–9 attack, bits 10–19 defence** — INFERRED,
from what they do:

- **Within each kind of weapon, attack rises with price**: copper sword 7,
  soldier's sword 13, rapier 19, iron broadsword 27 … dragon slayer 88, and so
  for spears, knives, wands, whips, poles, claws, fans, axes, hammers,
  boomerangs and bows. The sign test over neighbours in price order within
  kinds scores 0.62; the next best field anywhere in the data or the code, laid
  out the same way, scores 0.44. Its exceptions are the weapons whose worth is
  not their edge: the poison needle and the falcon knife earring 1, the falcon
  blade 12, the golden axe 26.
- **Defence rises the same way** on shields (pot lid 1, leather shield 3,
  scale shield 5 … dragon shield 24), headgear (iron helmet 11, iron mask 14,
  steel helmet 15), armour (leather armour 6, scale 9, chain mail 11 … heavy
  armour 35), gloves, legwear and boots. The Flame shield's is 18 — the defence
  this file quoted for it from a published list whose source is not recorded.
- Weapons carry no defence and armour no attack. Accessories carry either — a
  strength ring attack 4, a raging ruby 9, a gold ring defence 2, a dragon
  scale 5 — and one of the 52 both.
- The largest: attack 180, defence 100. Ten bits for each is INFERRED.
- The same in all five languages' tables, on every entry of all eight.

**The rest of the entry**, read the same way — by what the items' own
descriptions (`itemexpl`) say they do, entry by entry. Measured on the 936
entries whose first words are their own (the first of each table left out).
Words 5, 6 and 7 are **three 10-bit fields each**: bits 30 and 31 are set on
none of them.

| word | bits 0–9 | bits 10–19 | bits 20–29 |
|---|---|---|---|
| 5 | **attack**, above — every weapon, and 4 accessories | **defence**, above — 570 | set only on the 24 wands and staff-like weapons, 10–100; not established — the one whose words name a stat, the rune staff, "steps up magical might", but magical might has a field of its own in word 7 |
| 6 | set only on shields, 42 of them, 5–100; not established — no description names it | **evasion**, INFERRED: all five body pieces that set it say so — the cloak of evasion "makes evading enemy attacks easier" 30, the dark robe "sends enemy attacks astray" 20; on 55 pieces of footwear too, whose words do not say; 5–60 | **the chance of a critical hit**, INFERRED on one witness: the critical acclaim, which "cranks up the chance of a critical hit", 40 |
| 7 | **deftness**, INFERRED: the utility belt "does wonders for deftness" 25, the medal of freedom "upgrades deftness" 100; on 43 of the 78 gloves | **agility**, INFERRED: the agility ring "accentuates agility" 20, the meteorite bracer "insanely agile" 100, the Mercury prize 120 | **magical might**, INFERRED: the sorcerer's stone "a little" 2, the brainy bracer 8, the mager achievement "maximises magical might" 50; on 66 hats and 40 body pieces |

**Word 3**: bit 0 is set on all 936. **Bits 7–11 are a weapon's kind plus
one** — exactly `itemsort`'s subtype + 1 on all 267 weapons, two files agreeing
— 13 on all 44 shields, and 0 on 622 of the other 625. Its top bits are not
established.

**Word 4**: on the weapons, bits 12–15 are one number for each kind — swords
1, hammers 3, knives 4, wands 5, spears 6, axes 7, boomerangs 8, bows 9, whips
10, staves 11, claws 12, fans 13 — not established. Bits 0–11 are 0 on every
weapon and shield, and **`0xfff` on all 51 accessories** and most armour, with
other patterns on the rest — `0xebe`, `0x5e1`, `0x6a6`, and single bits `0x1`,
`0x4`, `0x8`: INFERRED, who may wear it, a bit a vocation of the twelve the
equipment screen's "Used by" shows. Which bit is which is not established.

**Word 0** is set on 137 entries, whose descriptions speak of resistances — to
spells, sleep, Fizzle, MP being stolen: several fields packed, perhaps; not
established. Its bits 20–29 are set on 8, four of them about MP. **Words 1 and
2** are packed, and set on every entry; not established.

**Not found as numbers**: charm, max HP and max MP — the spirit bracer "boosts
max. MP by thirty", and there is no 30 anywhere in its entry — and the
vocation medals' own effects. They may be worked by each item's own code.

Nor are the 100 bytes between the entries and the names read. The first
entry's words 0 and 1 are the last record's, and the last record's own bytes 8
to 31 — its sort position, name offset and icon on any other record — are the
first entry's.

## Shops — `/data/bin/menu/shopdata1.bin`

A loose file, a tagged data table (above): a date and a version string, one
`0x66` record holding 37, and 37 `0x67` records of 22 integers, one a shop.
`readShops` reads it.

| value | meaning |
|---|---|
| 0 | the shop's number — **the one a talk line's `<SHOP=n>` names**: the village shopkeeper's line ends `<ADD><SHOP=32>`, and shop 32 is the village's |
| 1 | 1 to 5; not established |
| 2–19 | eighteen item ids, 0 for an empty slot — full on most shops, 1, 6 or 12 on others |
| 20 | 100 on 36 shops and 500 on one, whose six things are the ordinary shops' herbs and wings: a price rate in percent, INFERRED |
| 21 | 0 on every shop that sells only weapons, 1 on shops of armour, 2 on tools and accessories, 3 to 5 on a mix: the kind of shop, INFERRED |

Every item a shop sells is in the item tables, with a price.

## Services in talk — `<SHOP=n>`, `<INN=n>`, `<CHURCH=n>`

A line that hands over to the engine ends `<ADD>` and a service tag: 352
`<SHOP=n>`, 505 `<INN=n>` and 325 `<CHURCH=n>` across the English talk files,
and 48 `<BANK>`. In the village: the shopkeeper's `<SHOP=32>`, the innkeeper's
`<INN=1>` and `<INN=2>` on different lines, and the priest's `<CHURCH=1>`. The
innkeeper's lines leave the price and the party's size to the engine —
"That'll be `<val_2>` gold coins" — and `str_inn.bin` beside the scenario is
empty; no table of inn prices has been found. What the inn's and the church's
numbers select is not established. `str_church.bin` is a tagged table of the
church's words, in Japanese only.

---

# Level tables — `/data/prm/level<n>.bin`

Thirteen loose files, `level0.bin` to `level12.bin`, 5,312 bytes each. Every
one is a tagged data table (above) of 102 records: one `0x65` (`0`), one `0x64`
(`20`), 99 `0x66` and one `0x67` of 22 integers (seventeen `100`s, then `10 2 2
0 0` on eleven files; `level2` and `level10` carry some `75`s and `50`s among
the hundreds). `readLevelTable` reads them; the `0x64`, `0x65` and `0x67`
records are carried, not read.

**A `0x66` record is a level**, eleven integers, and the 99 are levels 1 to 99:
column 0 is 0 on the first of every file and rises on every record after, to
4.3 million on `level1` and 6.9 million on `level0` — the experience a level is
reached at, INFERRED.

**What the other columns are is INFERRED**, in two steps.

- **Ten columns, ten words.** The status screen's strings,
  `/data/bin/menu/str_sta.gp2/str_sta_en.bin`, run `Lv` · `Exp.` · `Strength`
  · `Agility` · `Resilience` · `Deftness` · `Charm` · `Magical Mending` ·
  `Magical Might` · `Max. HP` · `Max. MP` · `Attack` · `Defence`. Past `Lv`,
  that is experience and nine numbers — the table's first ten columns — with
  attack and defence, which come from equipment, after. Column 10 is none of
  them: 0 at level 1, 12 at level 10 and 200 at 99 on twelve files, 17 and 350
  on `level0`. It is not established.
- **Which is which, by vocation.** The same strings name thirteen vocations —
  `Guardian`, `Warrior`, `Priest`, `Mage`, `Martial Artist`, `Thief`,
  `Minstrel`, `Gladiator`, `Armamentalist`, `Paladin`, `Sage`, `Luminary`,
  `Ranger` — and there are thirteen files. Taken in that order, level 1 of each:

  | file | vocation | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | `level0` | Guardian | 10 | 9 | 8 | 8 | 9 | 8 | 8 | 30 | 10 |
  | `level1` | Warrior | 18 | 18 | 4 | 5 | 4 | 0 | 0 | 26 | 4 |
  | `level2` | Priest | 9 | 9 | 14 | 9 | 7 | 0 | 18 | 19 | 14 |
  | `level3` | Mage | 4 | 7 | 18 | 14 | 7 | 18 | 0 | 18 | 16 |
  | `level4` | Martial Artist | 18 | 11 | 23 | 11 | 5 | 0 | 0 | 24 | 2 |
  | `level5` | Thief | 13 | 11 | 18 | 18 | 3 | 0 | 4 | 23 | 6 |
  | `level6` | Minstrel | 9 | 8 | 8 | 12 | 9 | 6 | 7 | 20 | 6 |
  | `level7` | Gladiator | 30 | 19 | 7 | 15 | 5 | 0 | 0 | 32 | 2 |
  | `level8` | Armamentalist | 21 | 15 | 10 | 7 | 11 | 17 | 0 | 32 | 14 |
  | `level9` | Paladin | 21 | 22 | 4 | 1 | 7 | 0 | 10 | 36 | 11 |
  | `level10` | Sage | 12 | 12 | 13 | 3 | 14 | 14 | 12 | 29 | 30 |
  | `level11` | Luminary | 9 | 12 | 22 | 16 | 18 | 5 | 19 | 31 | 13 |
  | `level12` | Ranger | 18 | 14 | 16 | 30 | 4 | 0 | 12 | 31 | 14 |

  Columns 6 and 7 are the pair only some vocations have: both 0 on the
  Warrior, the Martial Artist and the Gladiator; the Mage and the Armamentalist
  have only 6, the Priest, the Paladin and the Ranger only 7. So 6 is taken for
  magical might — attack spells — and 7 for magical mending, the reverse of the
  screen's order. Column 8 is the largest on every file at level 1 and 390 to
  600 at 99: maximum HP. Column 9, highest on the Mage and the Sage: maximum MP.
  Column 5 is highest on the Luminary: charm. Columns 2 and 3 are also taken in
  the reverse of the screen's order — **2 resilience, 3 agility** — because the
  Paladin (22 against 4) and the Gladiator (19 against 7) are high in 2 and low
  in 3, and the Martial Artist (11 against 23) and the Thief (11 against 18) the
  other way about. Column 4, highest on the Ranger and the Thief, is deftness.

The weakest step is the last: it rests on what those vocations are, not on
anything in the files. A level-1 status screen in the emulator, for any
vocation whose resilience and agility differ, would settle columns 2 and 3; and
so would one for the Mage, whose might is 18 or 0.

---

# The spell table — `/data/prm/spelltable.bin`

A loose tagged data table (above), 2,576 bytes: one `0x65` (`0`) and one
`0x64` (`20`), as the level tables open, then 65 `0x66` records of two integers
and 108 `0x67` of three, then the date and version the loose tables carry
(`2010/04/09 00:18:34`, `100203`). `readSpellTable` reads it.

**A `0x66` record is a place in the spell list and the action there**: 0 is
action 9, Frizz; 1 Frizzle; 2 Kafrizz; 3 action 779; 26 Heal, action 30. The
list runs a family at a time, each family's last member one of actions 779 to
784. Places run 0 to 65, and 25 is missing.

**A `0x67` record is a vocation learning a spell**, INFERRED: (vocation, place,
level). The first value is 2, 3, 5, 6 and 8 to 12 — never 0, 1, 4 or 7 — and
the third never falls within a vocation's records and never passes 99. Taken
with the vocations numbered as the level tables are:

- the Priest, 2, learns Heal at 1, Squelch at 3 and Zing at 18; the Mage, 3,
  Frizz at 1 and Crack at 6; the Sage, 10, spells of both kinds;
- the Warrior, the Martial Artist and the Gladiator — 1, 4 and 7 — learn
  nothing, and they are the three whose magical might and mending are both 0
  at level 1 (see "Level tables"). The Guardian, 0, learns nothing either;
- **the Minstrel, 6**, whose level table the Hero is given, learns Heal at 3,
  Crack at 8, Evac at 10, Woosh at 12, Crackle at 16, Midheal at 21, Zing at
  24, Swoosh at 30 and Kaswoosh at 36.

The Hero's vocation names itself three ways at that number: `level6`, `str_tm`
2106 `Minstrel`, and the spell table's 6.

---

# Motion tables — `.bcfg`

A tagged data table (above) beside a model, naming stretches of its animation.
**2,844 of the cartridge's 2,854 `.bcfg` files carry them** — 1,416 in
`/data/effect`, 554 in `/data/event_lv5`, 262 in `/data/chara`, 226 in
`/data/chara_sub`, 197 in `/data/pack_lv5`, 145 in `/data/map`, 26 in
`/data/enemy`, 18 in `/data/bin`.

| tag | values | meaning |
|---|---|---|
| `0x66` | string, number, number, number | **a motion**: its name, first frame, last frame, speed |
| `0x64` | integer | the motion count, on the cabinets |
| `0x65`, `0x70` | | not established |

A cabinet's, `M01M03G1.bcfg`, reads `open` 0 to 25, `closed` 0 to 0, `opend`
(sic) 25 to 25 and `close` 0 to 25, each at speed 1. The model beside it has
three nodes — the cabinet and its two doors, `a` and `b` — and a 25-frame
animation that turns `a` to +135° and `b` to −135° about the vertical, from
shut at frame 0 to open at frame 24. So `closed` and `opend` hold the two ends,
`open` plays between them, and `close` — the same frames — presumably plays
them backwards (INFERRED; nothing here uses it).

**A piece with a motion table plays a motion when asked, not its animation on a
loop.** Before this was read, every piece's own animation was played round and
round, as the waterfall's and the sky's should be, and the cabinets swung open
and shut for ever. `readMotionTable` reads the table; `assembleMap` hands it to
the piece that shares its stem.

---

# Doors — `<area>M<nn>D<x>` and `<area>A<nn>D<x>`

A door is two resources in a map's descriptor: a model, `M01M00D1`, and its
collision under the same name with `A` for `M`, `M01A00D1`. Each is a resource
of its own with its own placement, not two files under one stem. The village
has ten, `D1` to `DA`. Of its houses, `M01M02` and `M01M09` have one each and
`M01M10`, Erinn's house, has two.

- **Every door model in the village is one quad with a corner at its
  origin**: four vertices, 1.52 model units tall — 0.19 world units — and the
  rest of it running out along the ground from there. INFERRED: the origin is
  the hinge.
- **No door has an animation file** beside it, so however the game opens one
  is in code. The game here turns it a quarter about that origin, away from the
  Hero; that is a choice, not a reading.
- **Its collision is two triangles facing the same way** on all of the
  village's doors, and on `M01M02`'s and `M01M09`'s — a marker, which the map
  loader leaves out, since kept it seals the doorway. **Erinn's house's two are
  four triangles, facing both ways**: a wall from either side, which stands only
  while the door is shut.

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
| `+0x08` | `u32[7]` | a span of the story, INFERRED: words 0, 1 and 2 its first stage and step, 3, 4 and 5 its last; word 6 not established — see below |
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

The seven words read as a **span of the story**, INFERRED: that the two pairs
never run backwards is what a span from one stage to another would look like,
and words 2 and 5 are **steps** within the first and last stage — the steps the
trigger records move the story to (see "The words"). Within one sub-stage word
2 is at or before word 5 on **362 of 362**; where a character's next record
begins in the sub-stage the last ends in, it begins one step on — word 2 one
more than the last's word 5 — **121 times of 179**, against 17 for two steps
on. On the Hexagon's first floor, `202`'s first record ends at 2.4 step 4 and
its next, 3.47 units along, begins at step 5 — the step the switch's event
moves the story to. Word 6 is not established.

**Who stands where, as the game takes it** — `castOf` in `apps/game/src/load.ts`,
INFERRED from which characters the trigger records talk to:

| a character's records in the map, at the stage and step | stands | measure |
|---|---|---|
| one covers it and has a position | there | 1,245 character records talk to someone so |
| one covers it without a position | not here | taken as the header's place instead, Angel Falls would have **27** more at every stage — Patty's model in the village at 2.1, a second Ivor at 2.3 while he follows |
| none covers it | not here | as the village's stages had it before; a "none covers it, so the header" rule would put Ivor in the village at 2.1 |
| none at all | at the header's place, at every stage | **596** records talk to such a character in the header's map; in Angel Falls it adds one thing to examine, in the Hexagon its switch, `201` |
| a gap between two of them inside one sub-stage | at the header's place | thin: **19** such gaps on the cartridge. The Hexagon's figure, `204`, has one over steps 2 and 3 of 2.4, when it is talked to, and `ev02500`, which opens step 2, stands its figure on the header's spot to 0.01. `ev02510` then walks it to (−11.74, 11.23), which is not followed: which of an event's actors is which of the cast is not read |

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

# `.spr` — the 2D characters, and the pots and barrels

1,316 sheets, 1,298 of them loose in `/data/ani`. **24 of the slice's 33
villagers are sprites**, not models: every `kind` 0 character in a map's cast
list has a `<name>.spr` here and no 3D model anywhere on the cartridge, and
every `kind` 2 has a model and no sprite. The pots and barrels are sprites too —
`tsubo_01` and `taru_01`, and their breaking, `tsubo_02` and `taru_02`.
`readSprite` reads one.

**The pots' and barrels' sheets are in two places, and the field's are the
second.** All six are in `/data/ani` and again in `/data/bin/icon.nsarc`, with
different bytes; the field's overlay, 17, names all six beside `icon.nsarc` and
`ARC:ev_icon0.spr`, and the archive holds the other things the engine draws in
the world — the chests, the round shadow. The two barrels' breaking differs:
`/data/ani`'s is its three frames of shards, `icon.nsarc`'s the same three and
then the first again, held twice for 60. Of the 24 sprite names that occur more
than once on the cartridge, 18 differ between their copies; none is a
villager's.

## A frame is built of parts

As the DS's own hardware sprites are: rectangles 8, 16, 32 or 64 pixels on a
side, each placed in the frame, each with its own pixels.

| at | type | meaning |
|---|---|---|
| `+0x00` | `u16` | frame count |
| `+0x02` | `u16` | version: `3` on 1,315 of 1,316 |
| `+0x04` | | the frames, one after another; each: |
| | `u16` ×2 | its width and height |
| | `u16` | its part count |
| | `u16` | 0, on all 4,251 frames |
| | | its parts, one after another; each: |
| | `s16` ×2 | where the part goes in the frame, x and y |
| | `u16` ×2 | its width and height as powers: `8 << n` |
| | | its pixels, 4bpp, a row of the part at a time, the low nibble first |
| after | `u32` | the palette's colour count |
| | `u16` × count | the colours, BGR555; index 0 is transparent |
| after | | the animations — below |

**Walked by nothing but the parts' own sizes, 1,314 of the 1,316 sheets arrive
exactly at a palette's count word**, which a wrong reading does not. The two that
do not are `n001a_test`, whose count word is 0, and one whose parts run past the
end of the file.

| check | result |
|---|---|
| sheets whose frames lead exactly to a palette | **1,314 / 1,316** |
| the word after each frame's part count | 0 on 4,251 / 4,251 frames |
| parts inside their frame | 4,250 / 4,251 |
| parts per frame | 2 on 2,928 frames, 4 on 1,303, 1 on 39, 3 on 4, 6 on 2 |
| part sizes | 32x8 on 3,195 and 32x32 on 3,189; then 8x8, 8x16, 16x16, 16x8, 8x32 |
| palette counts | 16 on 1,288 sheets; 14 on 12, 12 on 9, 10 on 3, 8 on 2 |

**The villagers' frames are 32x40, of two parts**: the top eight rows, 32x8 at
0,0, and the 32x32 below them at 0,8. The village's horse, `n099a`, is 40x40 of
four — 32x32 at 0,0, 8x8 at 32,0, 8x32 at 32,8 and 32x8 at 0,32. The breaking
pot's three frames are 56x32, of 8x32, 8x32, 8x32 and 32x32 side by side; the
barrel's of 8x32, 16x32 and 32x32. `tools/sprite/render.ts` draws a sheet's
frames and lists their parts.

## The palette

A count and then that many colours: 16 on most sheets, fewer on some — the
barrel's shards have 12, the pot's 14. A pixel names one of sixteen; past the
count there is no colour, and nothing is drawn. A few sheets — the arrows among
them — set bit 15 of a colour, which is not part of a DS colour and is ignored.

## Animations

Names first, in fixed slots written over a longer string — fragments of
"…create an Animation" survive between them. A real name has an underscore in
it, or is the one word a breaking sheet carries, `tsuboware` or `taruware`.
Then one record each:

```
u32 steps
u32 order[steps]      // the step that follows, INFERRED — see below
u32 duration[steps]   // 8 on a walk step, 60 on a stand, 4 on a breaking one
u32 frame[steps]      // which frame of the sheet to show
```

The records are found by trying every start two bytes apart — a palette of
twelve or fourteen colours leaves them off a four-byte boundary — and keeping
the run that consumes the file exactly, names a frame that exists at every
step, and yields as many records as there are names. A wrong start fails on the
first record or two. A step's duration is taken in 60ths of a second, INFERRED
from the walks' 8 and the stands' 60.

**A step's `order` is the step that follows it**, INFERRED: on 2,502 of the
cartridge's 2,510 records each step names the next and the last names the
first, so the animation goes round. The eight that do not are one character's
turning to talk, `n303`'s `talk_*` records, whose last step names itself —
which would hold its last frame. So nothing in a record says when a looping
animation stops; the breaking pots' and barrels' go round like the rest, and
what takes the shards away is the engine's.

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
`walk_down`. The four diagonals have no walk and take frames 12 to 15. A
breaking sheet carries one animation: frames 0, 1 and 2, each held for 4.

**Which way round the eight stands go is established by looking, not by the
data.** They are listed in a consistent rotation, but nothing in the file says
whether it turns through the character's left or its right. Drawn one way the
village dog stands with its head where its tail should be; drawn the other it is
a dog. `down` and `up` are identical under the mirror, so only a side-on
character can settle it — which is why an animal did and the people did not.

## What a sheet was once taken to be

For a long time a sheet was read as one image — rows of pixels from the header
to the palette — cut into frames, and every reading of that kind was a fit. The
even division put bands of one frame inside another. A pitch measured from the
bytes' own period, 664 on the villagers, cut clean figures, and is exactly a
villager's frame read as parts: its header, two part headers, a 32x8 and a
32x32, `8 + 8 + 128 + 8 + 512`. The eight rows that cut dropped as "a strip in
front of the figure — a squashed copy of it, a shadow or a reflection" were the
top of the figure, its own part, and characters were drawn without their heads
or their legs. The header's "width" was frame 0's; its "unknown" `0x08`, 2 on
some sheets and 4 on others, was frame 0's part count — which is why the
"stride" came out eight narrower on the four-part sheets; and a palette found by
searching for a count of 16 missed the breaking sheets, whose counts are 12 and
14. Those measurements were not wrong about the bytes: they were measuring the
parts without knowing it.

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

## Prompts — `<YESNO>` and `<UKEYAME>`

A small branching language inside the text, the same in all five languages and
almost all of it in what characters say: 6,651 prompts in the English talk
files, against 57 in events.

- `<YESNO>` offers two answers, whose branches open `<YES>` and `<NO>`.
  `<UKEYAME>` offers two more, `<UKE>` and `<YAME>` — **accept and decline**,
  INFERRED from the Japanese, from the system strings listing "Yes", "No",
  "Accept", "Decline" in that order, and from where it stands: at quest offers, where
  `UKEYAME YAME END UKE CLOSE` is the commonest shape in the talk files, 2,087
  times.
- A branch runs to `<END>` (5,449) or `<CLOSE>` (4,591), to another branch's
  marker (675), into a further prompt (583), to a jump (383) or to the end of
  the message (241). **Branches do not rejoin**: 16 messages have anything after
  an `<END>` but a marker, a label or `<CLOSE>`.
- `<LB_x>` is a label and `<JP_x>` a jump to it: **all 1,915 jumps** find their
  label in the same message, 1,075 of them backwards — which is how answering no
  can ask again.
- At most two prompts share a message. Taking an answer's branch as the first
  marker for it after the prompt lands past another prompt on 65 of 13,302
  answers — mostly a quest offer asked twice in a row, or one inside a yes/no
  branch, where the markers differ anyway.
- **Answers whose markers stand side by side share a branch** — INFERRED:
  `<YESNO><YES><NO>` and then the text, 36 times in the English talk files and
  10 in the village, the innkeeper's counter line among them. Read as two
  branches, the first is empty and ends the line; taken together, both answers
  run on into the text after them, and the innkeeper's ends by handing over to
  the inn (`<ADD><INN=1>`).
- 1,380 of the talk files' answers, and 110 of the events' 114, have no branch at
  all: what follows is the script's.

---

# Event scripts — `.stb`, magic `SB2`

736 files: 523 in `/data/event`, one per event; 165 in `/data/evspt_lv5`,
which carry cutscene staging — model files, motions, cameras; 33 in
`/data/scenario`; 13 in `/data/menu`; 2 in `/data/event_lv5`. The event
scripts are read whole — container, routines and code — and run by
`@minstrel/script`; "The code", below, has how. The others are not yet read.

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
and 101); section 100 is the largest, a median 3,632 bytes. Each section is a routine,
whose first word is its entry address — see "The code".

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

## The code

Read from the scripts themselves; nothing about this format is published. The
numbers are over the 523 event scripts.

**Code addresses count from `+0x08`**, the end of the section table: a jump's
target and a routine call's are offsets from there.

**A routine is 14 header words and then instructions to a return.** Sections
are routines, and so is everything in the shared block and after each section.

| offset | meaning |
|---|---|
| `+0x00` | its entry address: its own offset less the code base, plus `0x38` |
| `+0x04` | zero wherever seen |
| `+0x08` | how many locals it has, its parameters among them |
| `+0x0C` | how many parameters it takes |
| `+0x10` .. `+0x37` | a 1 per parameter, where there are any; not established |

The entry address is what recognises a routine. With the usual three sections
the code base is `0x58`, which made it read as "own offset less `0x20`"; the one
event with six sections, `ev03130`, has its base at `0x70` and would not read
until the rule was the entry address. The parameter count is borne out by the
shared routines' bodies, which read exactly their first *parameters* locals as
inputs: the message routine at `+0xDE4` takes 2 of its 3, the wait at `+0x0` 1
of 1.

**An instruction is three `u32`s**, an opcode and two arguments. Walking every
section and every routine it calls to its return finds nothing but the opcodes
below — none unread, on all 523.

| op | reads as | evidence |
|---|---|---|
| `0x03 t v` | push a constant: `t` 1 an integer, 2 a float's bits, 3 a string's offset **from the code base** | the only types, 153,272 pushes; floats read as coordinates, strings as names — see below |
| `0x01 i s` | push variable `i` of scope `s` | |
| `0x02 i s` | push a reference to it | what stores and engine functions that answer through an argument take |
| `0x05` | store: value and reference off the stack, the value back on | `&0 0 store pop` |
| `0x04` | drop the top value | after every routine call whose answer is not used |
| `0x06` | add | `&0 L0 1 add store` counts up; `4 1 add 2 add` builds 7 |
| `0x07` | subtract | the wait routine counts down with it |
| `0x0B` | negate the top value | follows coordinates, which are stored positive |
| `0x0E c` | compare: 40 `==`, 41 `!=`, 42–45 ordered | `==` from its use in "wait while busy is 1"; the rest INFERRED in C's order |
| `0x0F` | return, with the top value | ends every routine |
| `0x10 t` | jump | every target inside its own routine |
| `0x11 t w` | pop, and jump when its truth is `w` | loops' exits |
| `0x12 t w` | short-circuit: jump keeping the value when its truth is `w`, else drop it | `a == 1 ‖ a == 2`; INFERRED |
| `0x13 _ t` | call the routine at `t` | 11,515 calls, **every one onto a routine header** |
| `0x14 1` | drop a string: the developers' notes, Shift-JIS | |
| `0x15 n` | invoke an engine function: `n` values, the first its number | below |
| `0x16 n` | nothing: a label | always at a jump's target |
| `0x17` | wait for the next frame | inside every waiting loop |
| `0x19` | or | only ever of flags, `4 \| 16`, `1 \| 16`; INFERRED |
| `0x1A` | not | before a jump on an engine function's answer |

`0x08` appears in one shared routine that no event calls, and is not read.

**A string's offset counts from the code base**, as jumps and routine calls
do. Of the 9,273 string pushes in the 523 event scripts, 3,305 are handed
straight to a note — Shift-JIS — and **every one of the other 5,968 lands on
the start of a string counted from the code base**: `stand` 2,540 times,
`walk` 685, `chara_sub/s011.chr`, `event_lv5/ev02010s016.chr`. Counted from
the file's start, as they first were, 283 land on a string at all, by chance —
`walk` where `stand` stands, `head` for `kiki` — and the rest read as the tail
of a name (`tand`, `ara_sub/s011.chr`) or as nothing.

**Engine functions are numbered in hundreds, and scripts write the number as a
sum** — `200 9 add` is function 209. That `add` was first taken for a
"begin call" marker, and 98% of invokes fitted it; reading it as the add it is,
**every invoke finds its `n` values**. The hundreds group what the functions
touch: 200s the cast (206 places one, 207 walks one somewhere over so many
frames, 209 turns one, 210 plays a motion by name), 300s the camera, 400s
messages (400 shows one, 405 answers through its argument whether it is still
up), 500s the event and the screen, 700s sound. Those readings are from the
arguments each is handed, and INFERRED; the fuller ones the game plays the
morning by — 303 where the camera looks, 310 a yaw, rise and run it looks
from, 566 and 567 a character's model and motion packs — are in
`docs/event-scripts.md` §5.

**Scopes**: 1 is a routine's own locals; 8 is the event's, shared by its
sections — one section writes a character's position into them and another
reads it back; 64 is the game's (`L0@64 == 0` beside a note about death and
revival). The last two INFERRED.

**The shared block is a library** of 18 routines, the same bytes in 522 of the
523 events: waiting so many frames (`+0x0`, 6,982 calls), showing a message and
waiting for it to be read (`+0xDE4` with a second value handed to 554, 2,352;
`+0xC68` without, 898; `+0x9FC` choosing between two messages by what 560
answers, 26), waiting for a fade, a sound or a character's walk to finish, and a
few for motions.

**Which section runs when is not established.** The game here runs 200, then
100, then 300: 200 loads the cast and sets the event's options, 100 is the
scene, 300 hands control back.

Run that way against an engine that answers every function with 0, **504 of the
523 events run to their end**; the other 19 are still waiting after 20,000
frames, for answers that engine never gives.

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

A file is a tagged data table whose records carry three or four numbers and
then a string offset. With three numbers, tag 2 on 17,241 records, tag 1 on
14,273, tag 4 on 2,149 and tag 5 on 1,101; with four, 1,728, 393, 344 and 135.
What the numbers mean is read, not established:

| | reading | evidence |
|---|---|---|
| numbers 0 and 1, on tags 1, 4 and 5 | a range of sub-stages within the letter's chapter, 99 for "to the end" | first at or before second, or second 99, on **all** 19,779 |
| the extra third number of the four-number form | always 1 — the line for the night | 2,600 of 2,600 are 1; on tag 1, **42.5%** of these lines use night words (night, late, evening, sleep …) against **9.2%** of its three-number ones — weaker on the counters' tags, 29.8% against 12.2% on tag 4 and 9.6% against 4.9% on tag 5 |
| the last number | a label: 16 the plain line, 192–202 alternatives, 80, 81 and 96 at counters | the triggers name these as labels — below |
| tag 2's first number | a condition, not a range — an errand, an item | 174–198 and similar; 0 of 2,657 small-valued ones form a range |

Tags 4 and 5 sit at inn and shop counters. Chapter B's own ranges run 1 to 7,
matching the village cast's stages 2.1 to 2.7, and its sub-stage-1 lines speak
of the Hero's fall as just past.

---

# Treasure — `/data/scenario/treasure.nsarc/<map>.bin`

One member per map that has any: 268 members, two of them empty (`M09M05`,
`D13M02`), and three — `randTBox`, `randTD`, `randTTT` — named for no map.
Every non-empty one is a tagged data table (above) and walks to its string
table, and the first header word, `unknown_0x00` to the table, is the record
count on all 266.

| tag | values | seen | meaning |
|---|---|---|---|
| `0x65` | a string | 266 files | a date and time, 2009 — when the file was written, by the look of it |
| `0x64` | a string | 266 files | the same date as `yymmdd` |
| `0x66` | an integer | 263 files | **the game-wide number of the file's first treasure** — below |
| `0x67` | 3, 5 or 6 | 821 records in 263 files | one treasure |
| `0x6A` | an integer | the three `rand*` tables | their row count |
| `0x69` | an integer | the three `rand*` tables | a row — see "Random treasure" |

**`0x66` numbers every treasure in the game.** Taking each file's span as its
`0x66` value up to that plus its count of `0x67` records, the 263 spans run from
0 to 847 without overlapping, and the only two gaps, 13 wide each, fall where
the two empty files sort (`M09M05` after `M09M04`, `D13M02` after `D13M01`). So
a treasure's number is its file's first plus its place in the file. INFERRED:
that number is what an opened treasure is remembered by — it is the one
numbering that covers every treasure exactly once.

**A number's type bits say how to read it.** A whole number is stored as an
integer (type 1) and anything else as a float (type 2), so one position can mix
the two: 50 coordinates are integer-typed, among them 0, −2, 2 and 7, and two
facings are the integer 1. INFERRED, and tested: in `C04M04` six treasures with
integer-typed x stand in a grid at −2, 0 and 2, 0.035 world units up from a
floor at 0.022 — the same lift as the float-typed treasure in that room.

A `0x67` record, by its number of values:

| values | records | kind (value 1) | reads |
|---|---|---|---|
| 3 | 145 | all `0x30` | `unknown_0`, kind, `unknown_2` |
| 5 | 448 | `0x10` (269), `0x20` (179) | `unknown_0`, kind, x, y, z |
| 6 | 228 | `0x8` (137), `0x40` (65), `0x4` (15), `0x0` (6), `0x9` (5) | `unknown_0`, kind, x, y, z, facing |

- **Position**, values 2–4, is in the files' own units like every other
  position. Times `WORLD_SCALE`, each one tested stands 0.002 to 0.02 world
  units above its floor: the 21 treasures of `M01M04`, `M01M07`, `M01M08`,
  `C02M01` and `C01M12`, and those of `C01M14`, `C01M15`, `C04M04` and `D03M05`.
  At a half, twice, eight or sixteen times that, none of them finds a floor
  under it at all.
- **Facing**, value 5, INFERRED to be radians: the 128 float-typed ones run
  0.05 to 6.28, with 3.14 and 1.57 among the commonest, and 98 of the other 100
  are 0. Only the six-value kinds have one — which a chest would need and a pot
  would not, also INFERRED.
- **Kind**, value 1: which kind is a chest, a pot or a barrel is not
  established. **`0x30`, the three-value kind with no position, is what a
  cabinet holds** — below. INFERRED: `0x10` is a pot and `0x20` a barrel. The
  random table they share with the cabinet is `randTTT` — *tsubo*, *taru*,
  *tansu*: pot, barrel, cabinet — and the cabinet is the third kind, `0x30`, so
  the first two are taken in the name's order. Nothing else says which is which.
- **`unknown_2`**, value 2 of a three-value record: in the village it is the
  number of the room's cabinet holding it, less one — `M01M03`'s two records
  read 0 and 1 beside cabinets `G1` and `G2`, `M01M09`'s and `M01M10`'s one
  reads 0 beside their `G1`. That holds on 45 of the 89 maps that have such
  records. Elsewhere it runs on across an area instead — `M03M05` 93, `M03M08`
  94 and 95, `C01M14` 13 and 14 against cabinets `G1` and `G2` — so what it
  counts is not established.

**Cabinets hold the position-less treasure.** A cabinet is a map piece whose
resource ends in `G` and a number (see "Motion tables" for how it opens). On 62
of the 89 maps with kind-`0x30` records the map has exactly as many cabinets as
records, and in the village every record's cabinet is named by its third value.
INFERRED: a map's cabinets hold its kind-`0x30` records, paired in order; the
game here pairs them that way. The 27 maps whose counts differ are mostly names
this matching does not reach — `H02`'s records against pieces named `H02M00G*`,
and `R05M01` with its 22 lettered copies.
- **What is inside is value 0's low half, read by the kind.** Kinds `0x8` and
  `0x9`: an item's id — **all 142 of their records name an item** in the item
  names below (a mini medal, a seed of strength, linen gloves…). Kind `0x4`: 50,
  210, 1,000, 1,500, 1,700, 2,000, 3,000, 5,000 — gold, INFERRED. Kinds `0x10`,
  `0x20` and `0x30`: 0 to 20, and `0x40`: 1 to 5 — a rank to draw at from a
  random table, below. Kind `0x0`: 0 on all six. The high half runs on within a
  kind — unique on all 269 of `0x10`, 179 of `0x20` and 145 of `0x30`, on 135
  of 137 of `0x8` and 62 of 65 of `0x40` — and is not established.

**The chest model is `T00GDS01`–`04`, in `/data/bin/icon.nsarc`** — the
archive of things the engine draws in the world by itself: speech bubbles,
battle cursors, the pot and barrel sprites, a coffin (`kanoke`) and a round
shadow (`kage`). They are two chests, each shut and open: `01` and `03` a box
0.80 by 0.68 by 0.41 with its lid down, 18 vertices; `02` and `04` the same box
0.23 high with the lid thrown back towards +z, 22 and 24. `01` and `02` bind
one 64×64 texture, red-brown, `03` and `04` another, grey. Nothing names them
as chests: that is read from the shapes. INFERRED: they are in the files' own
units — 0.41 is 28% of a person, where in the characters' space, the coffin's,
it would be 1% — their front is −z, the kinds with a facing are chests, and kind
`0x40` takes the second, grey one.

It was found only after the search below, which went by name. **No file on
the cartridge is named for a chest,**
with every leaf walked, `.gp2` members included. `/data/chara_sub/box.chr` is a
crate of five quads and one texture. `taru` and `tsubo` — barrel and pot — are
2D sprites in `/data/ani` and in the menu icons, and nothing else. The rooms'
own models carry no such object. Each comes in three sheets, the same in both
places:

| sheet | header | reads? |
|---|---|---|
| `taru_01`, `tsubo_01` | 1 frame, 32×32 and 24×32 | yes — the game draws these |
| `taru_02`, `tsubo_02` | 3 frames of 56×32 | no |
| `taru_03`, `tsubo_03` | 1 frame of 16×16 | `tsubo_03` only |

The `_02` sheets name their one animation `taruware` and `tsuboware` — *ware*
is breaking — so they are INFERRED to be the smash. They do not read because no
palette sits where the sprite reader's size rule puts one: three frames of 56×32
need 2,688 bytes of pixels, and every candidate count word of 16 comes before
that (or unaligned, at 48 wide). So their pixels are not laid out like a
villager's, and how they are laid out is not established. `taru_03` has no
candidate palette at all; its animation is named `tsubo_03`, which suggests a
copy of the pot's small sheet, but what `_03` is — a shard, perhaps — is not
established either. The player's figures do carry `takara.nsbca`
(*takara* is treasure) beside `hirou.nsbca`, which is presumably the Hero's
opening motion; it is not used yet.

Nor is one named inside a model or a texture set. Of 8,207 models and the
23,585 textures of 1,495 standalone texture files, the one texture named
`takara` — and the one material — belong to `F99M0000`, which is not a chest:
nine flat panels lying at height 0, `takara` a grid of 52 vertices beside a
`num` grid the same size, with `train`, `umi` and monster names for the rest. A
test sheet of textures, by the look of it. Pots and barrels turn up only as
parts of a few rooms' own models (`tsubo` with a `futa`, lid, in `D04M02E4`;
`taru` in `M08M0300`).

**The item names**, `/data/prm/itemname.gp2/itemname_<lang>.nat`, as far as
they are read: a header word whose low half is the record count (1,178 in
English), then 16-byte records — two offsets, a word that differs by language,
and an id — then strings. An offset counts from the end of the records, and
the two are singular and plural: record 0 is `wonder helm` and `wonder helms`.
A chest's value names its item by that id. See "Items" for the tables.

**Random treasure** — `randTBox`, `randTD` and `randTTT` beside the maps. Each
`0x69` row is one word:

| bits | meaning |
|---|---|
| 26–31 | rank |
| 23–25 | what it gives: 1 gold, 2 an item, 3 a monster (INFERRED, below) |
| 7–22 | the gold amount, the item's id, or the monster's number |
| 0–6 | weight among the rank's rows |

Read off the whole cartridge: taking bits 7–22 as an item id lands on one for
61 of `randTBox`'s 68 rows, 147 of `randTD`'s 162 and 80 of `randTTT`'s 98, and
every row that does not is a gold or a kind-3 row; no other alignment comes
close. `randTBox` has ranks 1 to 5, `randTD` 1 to 10, each rank's weights coming
to 100; `randTTT` has 1 to 20, its weights coming to 20 to 50. INFERRED: kind
`0x40` draws from `randTBox` — its values are 1 to 5 — and pots, barrels and
cabinets from `randTTT`, the shortfall below 100 being their chance of nothing.
`randTD` is no village treasure's; its name and ten ranks suggest the
treasure-map grottoes. The game's own dice are not reproduced.

**Kind 3 is a chest that is a monster** — INFERRED, on three counts that agree:

- **Where its rows are.** All ten are in the chest tables: `randTBox` ranks 4
  and 5, `randTD` ranks 3 to 10. `randTTT`, the pots', barrels' and cabinets',
  has none.
- **How its value climbs.** 38 at `randTBox` 4 and `randTD` 3; 39 at `randTBox`
  5 and `randTD` 4 to 7; 40 at `randTD` 8 to 10 — each a weight of 5 to 15 of
  the rank's 100.
- **What 38 to 40 are.** The monster list,
  `/data/prm/mon_list.gp2/mon_list_<lang>.nat`, holds a code and a name for each
  monster, the codes first from `0x2b24` in English: `z000a` slime, `z000b`
  she-slime… Counting its codes from 1, the 38th to 40th are `z009a`, `z009b`
  and `z009c` — cannibox, mimic and Pandora's box, the three monsters that pose
  as chests, weakest first. And the system strings, `/data/bin/strstd.gp2`,
  run "Oh no! The chest was really <str_1>!" · "<ACTOR> unlocks the chest." ·
  "It's empty!" · "a cannibox" · "a mimic" · "a Pandora's box".

**The monster list's records settle the numbering.** `mon_list_<lang>.nat` is
a head word, then 32-byte records — a zero word, the code's and
the name's offsets from the strings, and a `u16` that is the monster's own
number — then the strings; `readMonsterList` reads it. The numbers run 1 to 64
and then 75 on, with gaps, and **the record numbered 38 is `z009a`, 39 `z009b`
and 40 `z009c`**: the chest rows' values are the monsters' own numbers, not a
count. Still INFERRED: that the row gives that monster, which is what the three
counts above say. The chest's own words are read now (system strings, below):
message 42 is "Oh no! The chest was really `<str_1>`!", and messages 46 to 48
are the three monsters with their article — each "a " and a name in the monster
list, so the phrase for a monster is found by its name.

## The monster list — `/data/prm/mon_list.gp2/mon_list_<lang>.nat`

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | 0 on every record |
| `+0x04` | `u32` | the code's offset from the strings: `z000a` … |
| `+0x08` | `u32` | the name's offset from the strings |
| `+0x0C` | `u16` | the monster's number |
| `+0x0E` | `u16` | not established — 364, 356, 246 … on the first |
| `+0x10` | 16 bytes | not established |

**The head word holds the count and the strings' size.** Its low 12 bits are
345 on all five languages, and its upper 20 the size of the string section —
5,445 bytes in English, 5,785 in German, 5,788 in French — and on all five the
strings start at `4 + 345 × 32` = 11,044 and run exactly to the end of the
file. In English the word happens to read `YQT` (`0x01545159`: 345, and 5,445
× 4,096), which was first taken for a magic number; the other languages' do
not. Every offset lands at the start of a string on all five. Several records share a
name — records 250 and 251 are both named at offset 6, the first monster's —
so the offsets do not climb record by record. Every code is a letter, three
digits and a letter: 278 open `z`, numbered 1 to 298, and 67 open `b`,
numbered 284 to 514. What the two letters divide is not established.

## System strings — `/data/bin/strstd.gp2/strstd_<lang>.nat`

The engine's own short messages, by number. The same head word as the monster
list — low 12 bits 81, the record count; upper 20 the string section's size,
2,225 bytes in English and 2,486 in German, running exactly to the end — then
81 records of two `u32`s, a message number and its offset from the strings.
`readSystemStrings` reads it. The numbers skip — 0 to 69, 83 to 86, 200 to 202,
1000 on — and are the same in all five languages; every offset lands at the
start of a string.

What it settles elsewhere: message 42 and 46 to 48 are the chest's (above),
and **27 to 30 are "Yes", "No", "Accept", "Decline"**, in the order the prompts'
answers are read in — which backs `<UKE>` and `<YAME>` as accept and decline
(see "Prompts"). An earlier reading took the head word's low half as a count of
139 and 8-byte records from there, and found the offsets landing mid-word; it
was the same packing as the monster list's, misread.

## Monster data — `mon_btldata.nat` and `mon_data_<lang>.nat`

Two files of 438 records each, one a monster, both opening with the head word
the monster list and the system strings share: `/data/prm/mon_btldata.nat`,
132-byte records and no strings, and `/data/prm/mon_data.gp2/mon_data_<lang>.nat`,
28-byte records and then the strings. **Each record's monster number agrees
between the two on all 438**, so they are read side by side. `readMonsterBattle`
and `readMonsterNames` read them.

**Battle numbers**, read and not:

| offset | type | reading | evidence |
|---|---|---|---|
| `+0x00` | `u16` | the monster's number, bit 15 set on all 438 | agrees with the names file |
| `+0x04` | `u16` ×2 | its two drops | every one is an item id |
| `+0x08` | `u32` | experience, INFERRED | the metal family: 4,096, 40,200 and 120,040, against a median of 940 |
| `+0x0C` | `u16` | gold, INFERRED | a median of 2,490 on the bosses against 120 |
| `+0x18` | `u16` ×6 | its six ways of acting: action numbers (see "Actions"), INFERRED | 1 Attack on 1,064 of the 2,628 words and 225 Flee on 109; the healslime's Heal, the drakulard's Inferno, the uncommon cold's C-C-Cold Breath. The reference's own boss, Ragin' Contagion (`b006a`), has 1, 275, 1, 48, 44, 228 — the reference's six candidates exactly and in order: attack, poison attack, attack, Deceleratle, Kasap, Sweet Breath |
| `+0x5C` | `u16` | maximum HP, INFERRED | a median of 6,500 on the bosses against 134; the metal slime's 4 |
| `+0x5E` | `u16` | maximum MP, INFERRED | 255 on most bosses and the metal family |
| `+0x60` | `u16` | attack, INFERRED | by order |
| `+0x62` | `u16` | defence, INFERRED | the metal family's 256 and 512 |
| `+0x64` | `u16` | agility, INFERRED | by order; high on the metal family |

**How a monster chooses among its six is not in the record**, as far as has been
looked. The reference draws a number from 1 to 256 against six weights: an even
table, 43, 42, 43, 43, 42, 43, and for Ragin' Contagion a falling one, 68, 58,
48, 38, 27, 17. Neither table is on the cartridge as bytes — not in `/data/prm`,
`/data/bin`, the ARM9 binary or its overlays — and no byte of the record
separates Ragin' Contagion from the rest. The game here gives every monster
the even table.

`+0x14` is 500 to 605 on ordinary monsters and 0 on most bosses — Hexagoon's
among them, though not the Wight Knight's or Morag's — not established.
The rest is carried as it is. Hexagoon, the slice's boss, is `b003a`.

**Names**: a record is the name's offset, the code's offset (both `u32`, from
the strings) and the number (`u16`) at `+0x08`; ten bytes not established; the
plural's offset at `+0x14`; and at `+0x18` the name's grammar, its articles and
gender (see "Articles"). The strings run name, plural, code for each monster —
`slime`, `slimes`, `z000a` — and the plural's offset starts a string on all 438
records in all five languages. **Codes repeat**: 438 records
carry 312 codes, a code naming the story's versions of one monster (the
scarlet fever four times); the lowest number is the ordinary one.

## Monster models — `/data/pack_lv5/enemy.gp2`

601 members, `<code>.mon` and `<code>_f.mon`, stored whole — see the l5-gpc
FORMAT.md on members with no region prefix. Each is a `NARC` of three files:

- `.cchr`, an LZ10-compressed `NARC`: the model (`<code>.nsbmd`), its first
  motions (`appear`, `attack0a`, `run`, `stand` on the slime) and a `.bcfg`;
- `.cmot`, another: the rest of its motions — `attack1a`, `call`, `damage`,
  `death`, `escape`, `sake` on the slime — and a `.bcfg`;
- `.bact`, no Nitro signature in it: not read.

The `_f` members have no `.cmot`. INFERRED: the models are in the characters'
own space, as the cast's are — the slime stands 9 units and Hexagoon 35, to a
person's 23. `/data/effect/<family>000.chr` and its siblings, which a search by
code finds first, are the monsters' attack effects — the slime's a splash
textured `z000a_at1`, the chest monster's smoke, `z009a_kem01` — not their
bodies.

## Event battles — `eventbattle.bin`

`/data/event/eventbattle.bin`, 4,336 bytes: the set battles the story starts —
bosses, and a few others. `readEventBattles` reads it.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | the record count, 98 |
| `+0x04` | `u32` | the file's size |
| `+0x08` | 8 bytes | zero; not read |
| `+0x10` | 44 bytes each | the records |

| record offset | type | meaning |
|---|---|---|
| `+0x00` | `u32[2]` | `0x55090064 0xFFFF0155`, on every record |
| `+0x08` | `u32` | its index: what a trigger's battle word, 120, names |
| `+0x0C` | `(u32, u32)` ×3 | a monster, by its number in the monster data, and how many; `0xFFFFFFFF` for an empty slot |
| `+0x24` | `u32` | not established: 23 to 38, 24 on 46 of them |
| `+0x28` | `u32` | not established: 0 to 30,903 |

| check | result |
|---|---|
| indices | 98, every one different, 0 to 143 — not the records' order |
| slots filled | one on 91, three on 7 |
| monsters | all 112 in the monster data |
| counts | 1 on 106, 2 on 2, 3 on 2, 5 and 8 once |
| trigger battle words | all **40** arguments on the cartridge are indices here |

Index 2 is **Hexagoon alone** — monster 300, `b003a` — and the Hexagon's last
room, 7105, has the trigger `8:22510 120:2`, which Patty's talk plays once she
has asked to be freed. Index 0 is the Wight Knight, 1 Morag, 3 the Ragin'
Contagion. That a slot's second word is a count is INFERRED: it sits beside
every monster, and is 1 on all but six.

## Encounters — `encfld.bin` and `encbtl.bin`

Two loose tagged data tables in `/data/prm`, of the same zones.
`readFieldEncounters` and `readBattleEncounters` read them.

**`encfld`, by map.** A `0x69` record opens a map, and **its first value is the
map's own id** — the first value of the map's entry in `maplist9.bin`: 20001
is `F01`, Angel Falls Region; 7102 to 7104 are the Hexagon's floors. All 210
groups name a map, and the village has none. The zones follow: a `0x68` record
names a zone, a `0x66` holds one word for it, and each `0x67` gives a monster
that roams there — its number in the low 12 bits, and above them, INFERRED, its
weight among the zone's (slime 7, teeny sanguini 6, cruelcumber 5, sacksquatch 3
in `F01`'s first zone) — with a second value, 1 on most, not established.

An earlier reading took the zone numbers for places in the map list, and put
late-game monsters in the village's houses; it is the `0x69` value that names
the map.

**`encbtl`, by zone.** A `0x68` record per zone — 290 of them — then `0x66`
records, **the zone's roamers again: the same monsters as `encfld`'s on all 287
zones it has**, and `0x67` records, monsters that may join a battle there, most
of them not among the roamers (zone 12's company includes a batterfly). The
records' second values are 0 on every company record and carried.

**A companion's bits are three 3-bit fields** above its number — a weight
among the zone's company, then the least and the most of it that join,
INFERRED:

| bits (of the word) | reading | seen |
|---|---|---|
| 12–14 | weight | 0 to 7; 0 on ten, which then never join |
| 15–17 | least | 1 on 1,501, 2 on 20, 3 on 6 |
| 18–20 | most | 1 to 5 |
| 21 up | — | 0 on all 1,527 |

The least is no more than the most **on all 1,527**, as a count's range must
be. The weights are the company's own: they agree with `encfld`'s weight for
the same monster in the same zone on 272 of 829. `F01`'s first zone's company is
the slime and the cruelcumber at 5, the teeny sanguini and the sacksquatch at
3, and the batterfly at 1, one of each.

A roamer's bits hold the same three fields and more above them. There the
second is no more than the third on only 1,027 of 1,058, and the 31 that break
it carry large values above; they are carried, not read. What they say about
the roamer walked into — how many of it there are, how big the battle is — is
not established.

**A zone's `0x66` word, in part.** Its low three bits are 0, 1 or 2 on all
287 — INFERRED a kind:

| kind | where | measure |
|---|---|---|
| 0, then 1 | a pair, always in that order, and **only on fields** (`Fxx`) | the same monsters on other weights on **37 of 40** pairs — `F01`'s 12 and 14 are the slime, teeny sanguini, cruelcumber and sacksquatch, 7-6-5-3 and 4-4-4-5 |
| 2 | the only zone of 170 maps — every dungeon's, the Hexagon's floors among them — and a field's third and fourth | `F01`'s 15 is the bodkin archer, the batterfly and the cruelcumber |

The kinds in a map's order: `2` ×170, `012` ×17, `01` ×11, `0122` ×8, `22` ×2,
`0101` and `2222` once each. Bits 3 to 7 rise with the order the game reaches
its places — 2 and 3 in Angel Falls Region, 5 to 7 in Stornway's, past 30
late on — and a pair's kind 1 is its kind 0 plus one on 28 of the 40; what
they count is not established, and the monsters' battle data has no level to
test it against. Bits 21 to 23 take every three-bit value, dungeons' lone zones
included, so they are no time of day to choose by. The top byte is 0 on all.

The `0x67` records' second value is a float on some — 0.85 and 0.9 in `F06`
— and is carried as its bits.

**How a map chooses among its zones is not established.** Tried, and ruled out:

- **The collision triangles' attribute word.** Bits 25 up, read as an index
  into the map's zones, match the zone count on only 41 of 109 field and
  dungeon maps, and on 61 run past the last zone. The rest is no better: the
  low 24 bits are six nibbles, each only ever from one of {0, 3, 6},
  {1, 4, 7} and {2, 5, 8} — per-edge data, by the look of it — on `F01`,
  `F02`, `F06`, `F17`, `F18` and `D01M02` alike.
- **Night pieces, for kind 1 as the night.** Fields have none: 36 of the 37
  maps with a pair build the same by night, so the test cannot decide it.
- **The `0x69` record's other four values**: 0 on all 210.
- **The map's own tables.** Nothing in `F01`'s `.bmbl`, `.dat` or `.bmdj`
  names 12, 14 or 15 as a zone. Its three `0x72` records — doorways, see
  "The doorways" — match its three zones by chance: the counts agree on 36
  maps and differ on 118.

The game here takes a map's first zone, which is its kind 0 wherever it has
one.

## Field monsters — `fld_mondata.bin`

A loose tagged data table: a `0x64` record holding 438, and a `0x65` record
for each monster of seven values. `readFieldMonsters` reads it.

| value | reading |
|---|---|
| 0 | the monster's number |
| 1, 2 | not established — 1 and 5 on the slime, 7 and 12 on the she-slime, −99 and −99 on the metal slime, 99 on many |
| 3 | a packed word, not established |
| 4 | a float, INFERRED a speed: 0.40 on the slimes, 0.70 the drackies, 0.80 the firespirit, 0.90 the funghouls, 1.20 the meowgician |
| 5, 6 | attack and defence — **equal to the battle data's on all 438** |

Every roaming monster has a field model beside its battle one,
`<code>_f.mon` in `enemy.gp2`, with its `appear`, `attack0a`, `run` and `stand`
motions.

## Actions — `actdt_a.gp2`, `actdt_b.gp2`

What a fighter or an item does, in two halves: `/data/prm/actdt_a.gp2` holds
`actdt_a_<lang>.nat`, 63 actions — the spells and the healing items — and
`actdamage_a.nat`; `/data/prm/actdt_b.gp2` holds `actdt_b_<lang>.nat`, 618 —
the attack, defending, fleeing, the monsters' moves — and `actdamage_b.nat`.
Both archives' members are stored whole; see the l5-gpc FORMAT.md. `actname.nat`
names them by number, and reads with `readSystemStrings`.
`readActions` and `readActionRanges` read them.

**An action table** opens with the head word the system strings share — 618
records and 3,969 bytes of strings in English, which leaves exactly 60 bytes a
record — then the records, then the strings.

| offset | reading | evidence |
|---|---|---|
| `+0x00` | the name's offset | a string's start on every record |
| `+0x04`, bits 0–9 | the action's number | `actname`'s: Heal 30, Midheal 31, the medicinal herb 255, strong medicine 256; no two alike in a table |
| `+0x08`, bits 14–21 | its range: an index into the range table beside it, 0 for none | **every one is there** — 37 in `_a`, 117 in `_b` — and every range is some action's, 17 of 17 and 107 of 107; the word is the same in all five languages |
| `+0x34` | the plural's offset | `medicinal herbs`; a string's start on every record |
| `+0x08`, the low byte | its cost in MP, INFERRED | Heal 2, Midheal 4, Moreheal 8, Frizz 2, Crack 3, Zam 4, Kamikazee 1; 0 on the 488 actions that are no spell — the attack, the items, the monsters' moves — and 255 on four, Magic Burst and Kerplunk among them, the spells that spend all a caster has. 128 on two, not established |
| `+0x20`, bits 20–31 | what it says, INFERRED: a message in `actmsg`, 0 for none | 22 `wounds are healed` on Heal, Midheal and the herb; 84 `no longer poisoned` on the antidotal herb and Squelch; 32 `returns to life` on the leaf and Zing; 106 `MP are replenished` on magic water; 2 `takes <val_1> points of damage` on the attack spells; and **157 to 166 on the nine seeds and the pretty betsy**, each message naming the number it raises — `maximum HP` on the seed of life, `charm` on the pretty betsy, `skill points` on the seed of skill |

**Whom an action reaches is the high nibble of `+0x17`**, INFERRED from the
actions that carry each value: 1 on Defend, Psyche Up and the like — the actor;
2 on Heal, Frizz, Crack, Zam, Buff, the herbs — one; 4 on Crackle, Woosh,
Swoosh, Kaswoosh, Snooze, Thwack; 3 on Multiheal, Bang, Boom, Kaboom, Kathwack
and the breaths — everyone; 7 on Evac, Zoom, the chimaera wing and the seeds,
which are used outside battle. The Ka- spells show the order: Buff and Sap (2)
become Kabuff and Kasap (4), Snooze and Thwack (4) become Kasnooze and Kathwack
(3) — so 4 is between one and everyone: a group. 5 is the attack's alone; 6 and
8 are not established. `ActionReach` names them.

**`0x05` at `+0x24` deals damage**, INFERRED: the attack and every attack
spell carry it, each saying `actmsg` 2.

The byte at `+0x24` — `ActionEffect` — agrees with the message on 125 of the
389 actions that carry both and not on the rest (the attack spells' is 5), so
the two are kept apart. The rest of the record is carried.

**The halves**: `_a` holds the healing items and the spells that do not strike
— Heal, Midheal, Zing, Evac — and `_b` the attack spells, Crack and Woosh among
them. The game here takes `_a`'s spells for those that can be cast outside a
battle, INFERRED.

**A range table** opens with a word holding its count, then 8-byte records:

| offset | reading | evidence |
|---|---|---|
| `+0x00` | the index | — |
| `+0x01` | spread: how far either side of the base, INFERRED | Heal's is 5, and the reference draws Heal as 35 ± 5 |
| `+0x02` | 0 | on every record |
| `+0x04`, bits 0–9 | base, INFERRED | Heal 35, Midheal 85, Moreheal 185: the reference's own bases |
| `+0x04`, bits 10–19 | the amount a party member's action draws around, INFERRED | the reference's own party amounts: Heal `typeD(5, 35)`, Crack `(5, 30)`, Crackle `(8, 50)`, Woosh `(8, 16)` — and these are 35, 30, 50 and 16 here, where the base is 35, 17, 33 and 14. Equal to the base on 78 of 124, every heal and item among them. The base's own part beside it is not established; monsters' casting, which is not read, is the likeliest |
| `+0x04`, bits 20–29 | peak, INFERRED: the base at magical mending 999 | the reference's Midheal, 85 + (mending − 100) × 0.2392, and Moreheal, 185 + (mending − 200) × 0.5194, come to exactly 300 and 600 at 999, which are theirs |
| `+0x04`, bits 30–31 | 0 | on every record |

The reference is DQIX/BattleEmulator (MIT, © 2024 DaisukeDaisuke), which
reproduces the game's arithmetic.

**The medicinal herb** is action 255, range `0x31`: 35 ± 5, peak 35 — it
restores 30 to 40 HP whoever uses it. Strong medicine is range `0x32`, 50 ± 10.
An item names its action in its item table — see "Items".

## Articles — `article_<lang>.nat`, and a name's grammar

`/data/prm/article.gp2/article_<lang>.nat` reads with `readSystemStrings`: 38
articles in English by number — 0 to 5 definite singular (`the`, `the pair
of`, `the book called` …), 100 to 125 indefinite singular (`a`, `an`, `a suit
of`, `a phial of` …), 200 to 202 definite plural, 300 to 302 indefinite plural
(`some`, `some pairs of`).

**A name says which it takes**, in one packed word beside it: `+0x18` of a
monster's name record, `+0x08` of an item's. `readGrammar` unpacks it.

| bits | reading | evidence |
|---|---|---|
| 0–5 | indefinite singular, 100 + n | `an` on every English monster whose name opens with a vowel and `a` on every other, 289 of 289; 679 of 687 items the same, and the eight are English's own — `an honour among thieves`, `a utility belt` — or open with an accent's markup; `a suit of` on leather armour, `a book called` on the books |
| 6–11 | a plural article, n — the indefinite (300 + n) or the definite: which, not established | equal to bits 18–23 on every English record |
| 12–17 | definite singular, n | `the book called` on the books, `the keg of` on the kegs; 0, no article at all, on the story's named monsters |
| 18–23 | the other plural | |
| 24–25 | the name's gender, INFERRED: 0 he, 1 she, 2 it | 2 on 303 of 438 English monsters, 0 on the named men; German, whose nouns have genders, spreads its monsters across all three. The battle text's `<IF_ACTOR_M>`, `_F`, `_N` choose by it |
| 26–31 | not established | bit 26 set on 305 English items, and not on every name the plural suits |

## Battle text — `strbtl`, `actmsg`, `str_tm`

Three files of messages by number, each read with `readSystemStrings`, in the
markup the talk uses and more of it:

- `/data/bin/strbtl.gp2/strbtl_<lang>.nat`, 17: monsters drawing near (5 to 9)
  and fleeing (1 to 3);
- `/data/prm/actmsg.gp2/actmsg_<lang>.nat`, 591: what an action says — 1
  `<DEF_ART_ACTOR> attacks.`, 2 `<DEF_ART_TARGET> takes <val_1> points of
  damage.`, 9 defeated, 10 defends, 12 `uses <INDEF_ART_SGL_I_NAME>.`, 22
  `<DEF_ART_TARGET><1>s wounds are healed.`, 140 `Critical hit!`;
- `/data/bin/menu/str_tm.gp2/str_tm_<lang>.nat`, 329, the field menu's: 9002
  `uses <INDEF_ART_SGL_I_NAME>.`, 9003 `But nothing happens.`, 9004 wounds
  healed, 9012 `it doesn<1>t seem like it<1>d be much use on <DEF_ART_TARGET>`.

Neither healing message names the amount. **Which message an action says is
in its record**, INFERRED: bits 20–31 of `+0x20` — see "Actions". The battle
here still picks its messages by what they say; the field's use of an item
follows the record.

`str_tm` also holds what using something in the field comes to: 9005 `casts
<str_2>.`, 9006 `doesn<1>t know any non-battle spells!`, 9007 `Not enough
MP!`, 9062 `<SGL_I_NAME> discarded.`, 9065 `The bag is currently empty.`; and
the field menu's own words — 1 `Items`, 2 `Attributes`, 3 `Spells &
Abilities`, 4 `Misc.`, 1200 `What would you like to do?`, 1201 `Use`, 1203
`Discard`, 1204 `Cancel`, 1903 `Equipment`, 4351 `MP`, and the thirteen
vocations from 2100, `Guardian` to `Ranger`, in the level tables' order.
`/data/bin/strstd.gp2/strstd_<lang>.nat` 57 is a head banged on the ceiling.

A spell cast in battle says `actmsg` 46, `<DEF_ART_ACTOR> casts <ACTION>.`,
then its own message; 141, `<DEF_ART_ACTOR><1>s <ACTION> goes haywire!`, is a
spell's critical — the reference's 1.5 to 2.0 times; 153 `Not enough MP!`.
The battle menu's `str_btl` numbers its commands 30004 `Attack`, 30005
`Spells`, 30006 `Defend`, 30007 `Abilities`, 30008 `Items`, and says 30023
`<DEF_ART_ACTOR> doesn<1>t know any battle <str_2> yet.` with 30021 `spells`.

The markup's own grammar: `<DEF_ART_ACTOR>` is the actor's name behind its
definite article; `<INDEF_ART_SGL_M_NAME>` a monster's behind its indefinite;
`<IF_SING val_1>` … `<ELSE_NOT_SING>` … `<ENDIF_SING>` choose on a count;
`<IF_TARGET_SING>` … `<ELSE_TARGET_PLR>` on the target being one;
`<IF_ACTOR_M>` … `<IF_ACTOR_F>` … `<IF_ACTOR_N>` … `<ENDIF_ACTOR_MFN>` on the
actor's gender, three branches and one end; `<IF_SOLO>` on the party being one.

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
character — and some go on to name an event. That is **INFERRED**, and so are
the readings below; the other high halves are not decoded.

**Some words choose what a character says.** In records that name a character,
the argument of high half 11 is one of that character's talk labels on **707 of
793**, against 221 for a control; high half 36 with argument 1 goes with a word
whose high half is one of their labels and whose low half is 0, **338 of 519**
against none. Where a record names an event instead, its text is that
character's own talk for the sub-stage: in Angel Falls, one villager's records
at 2.1 to 2.5 name `ev02110`, `ev02370`, `ev02420`, `ev02570` and `ev02620`, one
for each sub-stage, and each opens with her line for it.

**The slice opens at 2.1.** A record for map 1107, Erinn's house, over 2.1 alone,
names her and `2130` — the event in which she greets the Hero in the morning —
and names map 1110, the floor above.

The game uses this to pick a line — `pickLine` in `apps/game/src/talk.ts`: the
first of the character's own records in the map, over a span covering the
stage, naming one of these with its conditions holding, decides a label or an
event; without one, the plain line. A talk record (value 5 = 1) decides only
for a character with no record of their own there — otherwise it makes an
event of the label they choose. INFERRED: **116** talk records with no
condition sit before a record of the same character, map and span, and taking
the first in the file would leave **269** of those records dead — Patty's
among them, whose first-time event would play every time she was talked to.
Across chapter B, that gives 17 to 20 of the 20 to 22 characters placed in the
village at each of 2.1 to 2.5 something to say; the rest have only paired
labels nothing here chooses between.

## The words — `story.ts`

A word is an integer past the record's head: its high half an operation, its
low half an argument. The floats some records carry are not words. Every
reading below is **INFERRED**, each with the measure behind it; across all 75
files (5,761 records read).

| operation | reading | measure | used |
|---|---|---|---|
| value 5 = 11 | the record is an event's own: what follows it | 646 records, **every one** naming its event with operation 8 | yes |
| 8 : event | the event the record is about | as above | yes |
| 132, then three words of operation 0 | the story moves to stage *a.b*, step *c* — their three arguments | 170 so; **166** go to the record's own stage (81), the next minor (74) or the next major (11); under one stage the steps run without a gap in **96 of 99** | yes |
| 104 : n | sets flag *n* | — | yes |
| 4 : n | holds only if flag *n* is set | **518 of 664** 4s and 5s have a 104 of the same *n* in the same area and stage | yes |
| 5 : n | holds only if flag *n* is not set | as above | yes |
| 133 : map, then *event* : 0 | goes on to that map (by id) and plays that event | **16 of 29** name an event whose own record is in that map | yes |
| 118 : character | a label for that character follows, as with 11 | seen in character records beside their talk labels | yes |
| value 5 = 1, with 6 : character, 11 : label and 119 : event | talking to the character, when their chosen label is that one, plays that event instead | of the 179 talk records with a label and an event, **97** have the same character's own record choosing that label in the same map and span, first in the file on all 97 — Ivor's at the landslide, `6:7 118:7 192:0` then `6:7 11:192 119:2350`; the other 82 not established | yes |
| value 5 = 3, with 9 : map and 119 : event | entering that map plays that event | 244 of the 249 open with 9, naming their own map every time; 49 play an event, 24 only while a flag holds — the pass's at 2.2, `9:5101 5:2 203:1 119:2300`, "Finally! We're here at last." | yes |
| 86 : 0 | holds when the Hero has no companion with them | all 7 in Angel Falls have argument 0, and each sits before a character's first-time event, giving the label that follows it instead. Ivor speaks in every one of those events (2222, 2230, 2240, 2250, 2430, 2440, 2450). An earlier guess, day or night, fails: only 2 of 13 across the cartridge have a twin record | yes |
| 102, 2, 3 | a second set of flags, "marks": 102 sets one, 2 holds if it is set, 3 if not | of the 57 sets, **31** sit in a record that also tests 3 of the same mark — the first time a character is talked to — and 24 of those have a partner record for the same character, map and span testing 2 of it: Hugo's `3:7 119:2430 102:7`, then `2:7 118:8 193:0`. Tests (280 and 298) far outnumber sets, so something else sets marks too. An earlier measure, 145 of 566, counted every test against any set | yes |
| 35 : n | holds only at step *n* of the stage | of the 128 records testing it, **94** name a step some event in the same file moves the story to at that stage, against **20** for the step three on. The Hexagon's switch, `201`: nothing at steps 1 to 3, `ev02530` at 4 — "There's a noise of something moving somewhere!" — its after-line at 5 | yes |
| 120 : n | starts set battle *n* — see "Event battles" | all **40** arguments are indices there; **65 of the 66** records carrying one have a value 5 = 15 record in the same map naming the same *n* | yes |
| value 5 = 15, opening with 12 : n | once set battle *n* is won: plays the event, sets the flags | 46 of the 47 open with 12. The Hexagon's `12:2 119:2550` plays Patty's thanks | yes |
| value 5 = 16, opening with 12 : n | once it is lost | all 33 open with 12; INFERRED as the other outcome — the Hexagon's `12:2 104:4 197:10` sets the flag under which Patty offers the fight again | yes |
| 17 : n | — | never paired with anything that sets or tests it | no |

The flags are read as the stage's own: cleared when the story moves on to
another stage. INFERRED — the tests find their setter in the same stage.

**The opening, as the records have it.** The morning's record, in map 1110:
`8:2130 132:0 0:2 0:2 0:1 197:6` — after it the story is at 2.2, step 1. At
2.2 a character record in 1107, Erinn's house, names Ivor and his event,
`6:7 119:2200`; the cast places him there at 2.2 and not at 2.1. His event's
record is `8:2200 133:1100 2210:0` — on to the village, 1100, and `ev02210`,
his call on her doorstep, whose own record is
`8:2210 104:0 132:0 0:2 0:2 0:2 197:7 205:1 141:1`: flag 0, and 2.2 step 2. A
villager's record then holds only with flag 0 set and flag 1 not:
`6:8 4:0 5:1 119:2220`.

Not established: whether a character record that names an event plays it when
the Hero comes near, or only when they are talked to. The game plays it on
being talked to. Operations 141, 197 and 205 are not decoded.

# The mini-map — `/data/pack_lv5/minimap.gp2`

The DS's top screen shows a map of where the party is. It is drawn from this
archive: 283 `.bmmp` layouts and 268 `.obg` pictures, besides files not read
here — `z01` to `z05` as `.bncg` (`CHAR` head, 256 tiles) and `.bncl` (`PALT`
head, 256 colours), `pd_ab_kari.bncg`/`.bncl`/`.bnsc` (`SCRN` head),
`C01M0000.MAP`/`.MBK` and `shipMPos.bin`. The ARM9 names `minimapbg2`,
`z%02d.bncg`, `z%02d.bncl`, `data/ani/obj_mm_w.pac` and `O00M0001.obg`. Read
by `minimap.ts`.

## `.obg` — a picture

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u8` | width, in 8×8 tiles |
| `+0x01` | `u8` | height, in tiles |
| `+0x02` | `u8` | `unknown_0x02` — 0 on all 268 |
| `+0x03` | `u8` | `unknown_0x03` — 137 ×117, 247 ×132, nine others |
| `+0x04` | `u16` | tile count |
| `+0x06` | `u16` | `unknown_0x06` — 0 on all 268 |
| `+0x08` | `u16` × 16 | the colours, BGR555 |
| `+0x28` | 32 bytes × count | the tiles: eight rows of four bytes |
| then | `u16` × width × height | the tile in each cell, row by row |

- **Every one of the 268 is exactly `40 + 32 × count + 2 × width × height`
  bytes.** The village's `M01M0001` is 35×19 cells of 659 tiles, 22,458 bytes;
  the field's `F01M0001` 32×28 of 822, 28,136; the pass's `S01M0100` 21×25 of
  507, 17,314.
- No cell names a tile past the count, and none sets a bit above bit 9, so
  there is no flip or palette bit in use.
- **A pixel is a nibble, the low one on the left.** Drawn so, the village's
  `INN` sign reads; with the nibbles swapped every pair of pixels is mirrored.
  That is the DS's own order for sixteen-colour tiles (GBATEK, "LCD VRAM
  Character Data").
- **Colour 0 is taken as clear — INFERRED.** It is the DS's rule for a
  sixteen-colour background, and here colour 0 lies only outside a picture's
  torn paper edge: 5,735 pixels of the village's, none of the field's, whose
  paper fills its rectangle.
- The sixteen colours of the village's picture are the first sixteen of
  `z01.bncl`, `1f 7c 0f 09 71 0d …`. What the `z` sets are for is not
  established.
- Besides the maps, `.obg` holds the screen's other pieces: `minimapbg`,
  `minimapbg2` to `4` (8×8 tiles of paper), `marker0` to `4`, `name*`,
  `barhp`, `barmp`, `pd_ab_*`. The maps, the backdrops and `marker0` are drawn.

### The markers are coloured dots

`marker0` to `marker4` are one tile each: a round dot with a darker rim, in
**blue, green, pink, yellow and red**, in that order. The same five dots, in the
same order, are cells 3 to 7 of `/data/ani/obj_minimap.NCER`. The party panels
beside them in that file come in four colours, **blue, green, pink and orange**,
which reads as one dot a party member, blue the first. `/data/ani/obj_mm.pac`,
the sprite file the ARM9 names for the screen, holds a blue dot and a red one
among its cells (5 and 7), with a church, crossed swords and the HP/MP panels.

**On screen, each party member is a dot in their own colour.** A screenshot
of the game, in Stornway's church with a party of four (kept locally, not
committed), shows four dots in a two-by-two cluster on the town's map, no
arrow and no facing, each in the colour of that member's name panel along the
screen's foot: the first member green, then lime, grey and dark red. So a
dot's colour belongs to the character, not to a place in the party, and **the
first member's is not blue**. None of those four is exactly a marker's colour
or one of `obj_minimap`'s or `obj_mm.pac`'s palette entries; the screenshot is
blurred, and where the game takes a character's colour from is not
established. No string in the code names `marker`. The game here draws the
Hero, alone, as `marker0` — **ours**, until the rule is found. What the red dot
marks is not known.

**The party panel is `obj_minimap`'s cell 2**: one 64×64 part, a dark name
strip with a coloured bar at each end, then HP and MP bars and `:Lv`. Its other
cells are the five dots (3 to 7, all in palette slot 4, a colour to each
tile), the level's digits `0`–`9`, `+1`–`+9`, and two HP and MP bars. Drawn in
palette slots 0 to 3 — the part is in slot 0 — the end bars are **blue, green,
pink and orange** (slot 0's is `(115, 189, 230)`); slots 4 to 7 recolour the
whole panel and are not member colours. The strip is rows 0 to 15: a border,
the dark from row 2 to 14 with the bars in columns 2–6 and 57–61, and a white
line on row 15. **The screenshot shows exactly these strips**: four side by
side across the screen's foot, 64 pixels each — the screen's 256 — each with a
name in white, and nothing of the rest of the panel. `obj_mm.pac` holds the
same panel cut narrower in four steps, perhaps a slide; its slots 0 to 3 are
all blue.

The game here draws each member's strip and dot by their place in the party —
the Hero blue, Ivor green — which is **ours**, for the reason above.

## `.bmmp` — which picture, and where on it

A tagged table (see "The tagged data table"). 279 read; `F07`, `H07`, `M05` and
`M12` are empty files. The tags, with the value kinds the table's type bits
give:

| tag | kinds | on | read as |
|---|---|---|---|
| `0x66` | integer, string | 279 of 279, once | `unknown` (0 on all), then the picture's name — an `.obg` in the archive on 279 of 279 |
| `0x6a` | string | 219 | the backdrop: `minimapbg2` ×205, `minimapbg3` ×13, `minimapbg4` ×1. The fields have none |
| `0x69` | float ×264, integer ×15 | 279, once | the scale — INFERRED, below. 3.2 in the village, 1 on the field, 2 in the pass; the integers are 4 on fourteen `C02`/`C04`/`D17` maps and 1 on `O00` |
| `0x64` | two integers ×278, two floats ×1 | 279, once | the picture's corner, in tiles — INFERRED, below. −18, −12 in the village; `S07M01`'s are the floats −15, −12 |
| `0x6b` | integer, one or more records | 278 | the maps the picture is drawn for: **the map index's id for the file's own map on 242 of 279** — `M01` 1100, `F01` 20001, `S01M01` 5101. Most of the 37 others are the `H` overviews, whose ids are fields' (`200xx`); `T00` has none |
| `0x6c` | float, float, integers | 249 records | a mark: a position, then the maps it stands for |
| `0x70` | (integer, string) pairs | 264 | map codes by id: **the id is the map index's for the code on 497 of 498 pairs** (`C02M07` has 206; the index 207) |
| `0x65`, `0x67`, `0x68`, `0x6d` | | | `unknown`: `0x65` 1, `0x67` 1 and `0x68` 0, 0, 0, 0 on all 279; `0x6d` 3 ×60, 0 ×10, 4 ×6 |

The village's marks, beside its doorways in `M01M0000.bmbl`:

| mark | stands for | at | the doorway to it |
|---|---|---|---|
| 1101 | `M01M01` | −3.29, 3.60 | −4.78, 3.74 |
| 1102 | `M01M02` | −20.20, −14.50 | −19.50, −13.00 |
| 1103 | `M01M03` | 18.44, 0.16 | 16.56, 0.38 |
| 1104 | `M01M04` | −28.28, −1.45 | −26.70, 0.27 |
| 1105, 1109 | `M01M05`, `M01M09` | −32.40, −10.09 | −28.80, −9.00 |
| 1106 | `M01M06` | −8.66, −6.44 | −7.36, −3.90 |
| 1107, 1110 | `M01M07`, `M01M10` | 27.58, −15.48 | 26.80, −13.50 |
| 1108 | `M01M08` | 31.10, −6.23 | 31.25, −6.00 |
| 20001 | `F01` | −7.16, 16.31 | −6.50, 18.00 |

So a mark is in the map's own units, the units a doorway is in. Every mark is
within four units of its doorway, and eight of nine within three. A mark
naming two maps stands for a house and the floor above it.

## Where a point falls on the picture — INFERRED

**pixel = position × scale − corner × 8**, x across and z down. Drawn so, the
village's eight house marks land on its eight houses and the road's mark
(z 16.31) at pixel row 148 of 152, on the road off the bottom edge. The
field's marks land on the village, the pass and its other ways off, and the
pass's two at rows 4 and 187 of 200, its two ends. That the scale is pixels per
unit and the corner counts tiles is read from these fits, not from the code.

## Not established

- `0x65`, `0x67`, `0x68`, `0x6d`, `0x66`'s first value, and the `.obg`'s
  `unknown_0x03`.
- Where exactly a room's party stands on its area's picture. That a room is
  shown on its area's picture is now **observed**: the screenshot above, taken
  inside Stornway's church, shows the town's map with the party's dots on the
  church, just below its icon — as the village's `0x70` and marks, which name
  all its rooms, suggested. Whether the dots sit on the room's mark or beside
  it is not measured.
- How the DS moves a picture larger than its 256×192 screen, and how it lays
  the backdrop.
- Which dot the game gives the Hero, and what the others and `obj_mm.pac`'s
  church and swords mark. `obj_minimap`'s `.NCGR`, `.NCLR` and `.NCER` are
  standard Nitro 2D files, and `obj_mm.pac` wraps the same three; nothing here
  reads them yet.
- The `z` sets, `pd_ab_*`, `C01M0000.MAP`/`.MBK` and `shipMPos.bin`.


# `.pac` — a plain pack of named files

The 2D screens' palettes, characters and cells, and some models and effects,
come packed in `.pac` files — `/data/ani/obj_mm.pac` holds the mini-map's
sprites. Read by `pac.ts`; what is inside is read by `@minstrel/nitro-gfx`
(see its FORMAT.md, "2D graphics").

| offset | type | meaning |
|---|---|---|
| `+0x00` | `char[0x40]` | the name, to a NUL; what follows is left over — one holds `\test\test` |
| `+0x40` | `u32` | the head's size, 0x50 |
| `+0x44` | `u32` | the data's size |
| `+0x48` | `u32` | from this entry to the next |
| `+0x4C` | `u32` | `unknown_0x4c` |

The data follows the head. Evidence, over the cartridge's 468 files named
`.pac`:

- **463 are this.** The other five are `/data/tmap/tdata.gp2`'s
  `tdata_<lang>.pac`, whose word at `+0x40` is `0x1600` to `0x1687`: some other
  format, refused.
- **Every entry's step to the next is its head and data rounded up to 16**,
  on every entry that is not an end.
- **The chain ends on an end marker that ends the file**, 463 of 463: on 456 a
  head of 0x50 zero bytes; on the seven in `/data/effect/`, a head whose size
  and step are both `0xFFFFFFFF`, its name field holding leftovers.
- Members are Nitro 2D files (`RECN`, `RGCN`, `RLCN`, and `RNAN` animations),
  this cartridge's own `CHAR`, `PALT` and `SCRN` files (`.bncg`, `.bncl`,
  `.bnsc`), models (`BMD0`) and effect files.

`obj_mm.pac` holds `obj_mm.NCER`, `.NCGR` and `.NCLR`: 28 cells — the HP and
MP panels, the digits, a church, crossed swords, and dots. **Cell 5 is an 8×8
light-blue dot in a black rim**, cell 7 a red one. The game here still draws
the Hero as `marker0` — see "The markers are coloured dots": which dot is his,
and in what colour, is not established.

# `.bncg`, `.bncl` and `.bnsc` — the menus' backgrounds

This cartridge's own tile, palette and screen files: beside Nitro files in the
`.pac` packs, and alone in archives — the mini-map's `z01` to `z05`. Read by
`screens2d.ts`; `drawBnsc` draws a screen with its tiles and palette.

| `.bncg` | type | meaning |
|---|---|---|
| `+0x00` | `char[4]` | `CHAR` |
| `+0x04` | `u16` | tile count |
| `+0x06` | `u16` | width in tiles |
| `+0x08` | `u16` | height in tiles |
| `+0x0A` | `u16` | `unknown_0x0a` |
| `+0x0C` | `u32` | the tiles' size |
| `+0x10` | | the tiles: 32 bytes each at four bits a pixel, 64 at eight |

| `.bncl` | type | meaning |
|---|---|---|
| `+0x00` | `char[4]` | `PALT` |
| `+0x04` | `u32` | `unknown_0x04` |
| `+0x08` | `u32` | the colours' size |
| `+0x0C` | | the colours, BGR555 |

| `.bnsc` | type | meaning |
|---|---|---|
| `+0x00` | `char[4]` | `SCRN` |
| `+0x04` | `u16` | width in tiles |
| `+0x06` | `u16` | height in tiles |
| `+0x08` | `u16` | `unknown_0x08` |
| `+0x0A` | `u16` | `unknown_0x0a` |
| `+0x0C` | `u32` | the entries' size |
| `+0x10` | `u16` × width × height | the entries, row by row |

An entry is the DS's text background entry — GBATEK, "LCD VRAM BG Screen Data
Format (BG Map)": bits 0–9 the tile, 10 a horizontal flip, 11 a vertical one,
12–15 the palette, "unused" at 256 colours. A four-bit tile's low nibble is its
left pixel, as GBATEK's "LCD VRAM Character Data" has it.

Evidence, over the cartridge's 408 `.bncg`, 370 `.bncl` and 690 `.bnsc`:

- **Every file is exactly as long as its head says**: 16 bytes and the tiles,
  12 and the colours, 16 and the entries.
- A `.bncg`'s tiles are 32 bytes each on 376 and 64 on 32. **Its width × height
  is its count on 408 of 408**, and its `+0x0A` is `0x7C00` on exactly the 376
  four-bit files and `0x7C01` on the 32 eight-bit ones.
- A `.bncl` holds 256 colours on 370 of 370; its `+0x04` is 0 on 276 and
  `0x101` on 94.
- A `.bnsc`'s entries are width × height × 2 bytes on 690 of 690. **Its `+0x08`
  is 1 exactly where its pack's tiles are eight-bit**, 32 screens, and 0
  elsewhere. `+0x0A` follows no pattern found: `0x1300` on one full 32×24
  screen, `0x1304` on another.
- **On all 659 screens whose pack holds tiles and a palette, the tile numbers
  stay inside the pack's largest `.bncg` and the palettes inside its `.bncl`**;
  171 screens use the flip bits.
- Drawn so, the equipment screen's pieces come out whole — its backdrop, the
  frame of sixteen slots, the eight tabs, the sort buttons, and `bg_ii1.pac`'s
  parchment for the top screen — and match the game's screenshots of it.

Not established: `.bncg`'s `0x7C00` beyond its lowest bit, `.bncl`'s `+0x04`,
`.bnsc`'s `+0x0A`; which `.bncg` a screen takes when its pack holds two — the
largest is drawn, and all 659 fit it; and where a screen goes on the DS's
screen, which the `.lia` layouts would say and which are not read.

# Item icons — `/data/ani/d_<letter><nnn>.spr`

**An item's icon is named by its id in decimal**: the thousands choose a
letter, the rest a three-digit number. The copper sword, id 20004 (`0x4E24`), is
`d_w004.spr` — found in the explorer, and the rule followed from it. The icons
are 1,021 sprites, loose in `/data/ani`, each one 24×24 frame (`readSprite`).

| id | items | letter | items with an icon so |
|---|---|---|---|
| 12xxx | helms | `m` | 108 of 132 |
| 13xxx | armour | `b` | 157 of 183 |
| 15xxx | gloves | `g` | 62 of 78 |
| 16xxx | legwear | `p` | 77 of 85 |
| 17xxx | footwear | `r` | 87 of 101 |
| 18xxx | accessories | `c` | 52 of 52 |
| 19xxx | knives | `w` | 27 of 40 |
| 20xxx | weapons | `w` | 148 of 228 |
| 21xxx | shields | `s` | 35 of 45 |
| 22xxx | tools | `i` | 232 of 234 |

985 of the 1,178 items have an icon by the rule. The letters were found by
which one each thousand's remainders land on, then checked by eye: one item
of each thousand drawn with its icon is the thing it is named — a gold helm,
red armour, a glove, purple shorts, boots, a ring, a knife, the copper sword, a
shield, a herb. The gloves' remainders land on `i` a little more often than on
`g`, 68 to 62, because the tools' icons share the numbers; drawn under `i` a
glove is a medicinal herb, under `g` a glove.

Not established: the icon of the 193 items the rule gives none — the wonder
helm, the tracksuit top and others; whether the item record names it among
its undecoded bytes. The worn parts beside the icons in
`/data/pack_lv5/chara_pc.gp2` take the same letters and numbers — see
"Character parts".

# Item descriptions — `itemexpl_<lang>.nat`

In `/data/prm/itemexpl.gp2`, and again byte for byte in
`/data/prm/iteminfo_<lang>.gp2`. **`readSystemStrings` reads it as it is**: a
record per item, keyed by the item's id. In English there are 1,178, one for
every item in `itemname_en.nat` and nothing else — the copper sword, 20004,
"A commonplace cutter made of copper." None is longer than 82 characters, and
none holds a line break: the screen breaks the lines.

The text carries the talk's markup: `<1>` ×212, `<,>` ×92, `<6>` ×8, `<9>` ×8,
`<^a>` ×5, `<'e>` ×4, `<^e>` ×2, `<-->` ×1. What each stands for is the talk's
business — see the game's `talk.ts`.

# Item kinds — `itemsort_<lang>.bin`

In `/data/prm/itemsort.gp2`. **A tagged table** (see "The tagged data table"):
after its date and version records, one record of tag `0x67` for each item —
1,178 in English — of five integers: the item's id, two values not read, the
category and the subtype. Read by `itemsort.ts`.

| value | meaning | evidence |
|---|---|---|
| 0 | the item's id | every one is an id in `itemname_en.nat`, each once |
| 1 | `unknown_1` | **an order over the whole bag**, INFERRED: each category a run of its own — the weapons 1 to 268, the shields 269 to 313, the headgear 314 to 445, the armour 446 to 628, the gloves 629 to 706, the legwear 707 to 793, the footwear 794 to 894, the accessories 895 to 946, the tools from 947 — and 9,999 on the blarney stone alone |
| 2 | `unknown_2` | 1 to 1,178, each once: **alphabetical order by English name**, INFERRED — the names rise along it at 1,159 of 1,177 steps; the skill books, whose names open with markup, come first |
| 3 | the category | 0 on the 268 weapons, 1 the 45 shields, 2 the 183 armour, 3 the 85 legwear, 4 the 132 headgear, 5 the 78 gloves, 6 the 101 footwear, 7 the 52 accessories, 8 and 9 the 234 tools — **exactly the item tables' members** |
| 4 | the subtype | 0 to 31, below |

**The subtypes**, by the items in each: 0 swords, 1 spears, 2 knives, 3 wands
(the staffs), 4 whips, 5 staves (the poles), 6 claws, 7 fans, 8 axes, 9
hammers (and clubs), 10 boomerangs, 11 bows; 12 shields; 13 armour, 14
clothes, 15 robes, 16 trousers, 17 skirts; 18 helmets, 19 hats; 20
gauntlets, 21 gloves; 22 boots, 23 shoes; 24 accessories; 25 medicines, 26
seeds, 27 keys, 28 alchemy materials, 29 important items, 31 skill books.

**The weapon kinds 0 to 11 are in the order of the item-info icons**,
`obj_iteminfo`'s cells 1 to 12 in `oiij_<lang>.pac`: a sword, a spear, a
knife, a wand, a whip, a staff, a claw, a fan, an axe, a hammer, a boomerang,
a bow — and cell 13, a shield, is subtype 12's. The equipment screen draws a
weapon's kind with them.

Neither follows price in any category — 0.33 at best, the shields'
`unknown_1`, by the sign test over neighbours in price order — so neither is
a stat.

Not established: where an item's numbers, rarity and who may use it are kept
— none of them is in this file, the item tables, `itembtlprm.nat` or
`itemsort`, at any position, width or scale tested against 41 shields'
published defence and rarity. Where those published values came from is not
recorded, which weakens that test.

# Character parts — `/data/pack_lv5/chara_pc.gp2` and `chara_pd.gp2`

**A worn part is named by its item's id, as the item's icon is** (see "Item
icons"): the thousands choose a letter, the rest a three-digit number. The
celestial suit, 13007, is `p_b007`. `partName` in `parts.ts` makes the name.

| id | worn | letter | in `chara_pc` | in `chara_pd` |
|---|---|---|---|---|
| 12xxx | headgear | `m` | 142 models, a bone of their own | 142 models |
| 13xxx | armour | `b` | 192 models on the 14-bone rig | 192, on a 21-bone rig |
| 14xxx | a body's bare arms — no item | `a` | 192 texture files | 192 models |
| 15xxx | gloves | `g` | 63 texture files | 63 models |
| 16xxx | legwear | `p` | 79 models on the rig | 79 |
| 17xxx | footwear | `r` | 89 texture files | 89 models |
| 20xxx | weapons | `w` | 200 models, a bone of their own | 178 |
| 21xxx | shields | `s` | 35 models, a bone of their own | 35 |
| — | faces | `f` | 24 models, a bone of their own | 24 |
| — | hair | `h` | 121 models, a bone of their own; 207 texture files | 122; 207 |

The letters are the icons' on every category both have, and the counts agree:
35 shields have icons and there are 35 `p_s` — which were taken for shoes
before this; 87 footwear have icons and there are 89 `p_r`. Every `d_` number
is a `p_` number (175 of `d_w`'s 178). And the presets below wear parts by the
rule: 141 of the 155 ids the vocations' presets wear name a part that exists.
The other 14 name none — mostly legwear, 16190 on five women (an id with no
item either), 16101, 16102, 16110, 16112 and 16201 — so something maps some
items to another's part, and it is not found.

**Arms, gloves, footwear and hair colours are textures, named alike.** A
`p_a`, `p_g` or `p_r` file is an NSBTX holding one 8×16 texture and its
palette: `p_a000_00` in 191 of the 192 arms files and all 63 gloves,
`p_r000_00` in all 89 footwear. Every body has a material bound to
`p_a000_00` — 188 of the 192 name it after their own number, `p_b002`'s
`p_a002_00`, and every body has an arms file of its number — and every legs
model one bound to `p_r000_00`. So the file loaded decides the arms and the
footwear; **resolved by name, first found, every character wears the first
file walked**, which is what the game's figure did until `Figure.textures`.

Hair the same way: each of the 207 `p_h<ss><c>a.nsbtx` holds one texture,
`p_h<ss>0a_00`, which the style's models bind. Styles 00 to 19 have ten such
files, `c` 0 to 9, and 20 to 23 one or two — a colour, INFERRED. A hair model
is `p_h<ss>0<v>.nsbmd`: 24 styles, each in variants `a` to `e` (style 01 also
`f`). The variants differ in height — style 00's `a` reaches 7.41 above its
origin, its `e` 4.04 — which reads as hair cut to fit headgear, INFERRED.

**Hung from the head, INFERRED.** Faces, hair and headgear each carry one bone
of their own and are modelled about their origin in one space: headgear
`p_m200` spans y 1.82 to 7.93, hair `p_h000a` −0.73 to 7.41, face `p_f006`
−0.32 to 4.00. The faces and hair were shown to land on the neck through the
rig's `head` bone (`docs/M2-village.md`). Where weapons and shields hang is not
established: `chara_pc`'s rig has no hand bone.

**`chara_pd` is the same wardrobe on another rig**, of 21 bones — `root`, the
part's own, `waist`, `chest`, `arm1L` to `arm3L`, `weaponL`, `arm1R` to
`arm3R`, `weaponR`, `head`, `manto1`, `leg1L` to `leg3L`, `leg1R` to `leg3R`,
`skirt` — whose only motions are one standing loop to each of 28 packs,
`md0200m` and `md0200w` to `md0213m` and `md0213w` with no `0202`, and
`md0200m_start` and `md0200w_start` of 51 frames. Every motion in
`chara_mp.gp2`, the walk among them, and the Hero's own event poses
(`ev7700p000.chr`: `ne_lp`, `oki`) drive 14 bones, so the figure that walks is
`chara_pc`'s. That `chara_pd`'s is the equipment screen's is INFERRED from its
standing-only motions. Beside its parts: wings, `d_hane`, on 8 bones of their
own with `d_hane_m` and `d_hane_w` motions of 51 frames; `d_wa`, a ring whose
node is named `d_m805` — the halo's part, 12805; `d_wing`; and a coffin,
`d_kanoke`.

Not established: the four bodies whose arms material is named otherwise
(`p_b003`, `p_b016`, `p_b490`, `p_b505`); the one arms file whose texture is
named for itself; where weapons and shields attach; which hair variant goes
with which headgear; and the items worn with no part of their own.

# Character presets — `/data/bin/charapreset.bin` and `presetdt_<lang>.bin`

**`charapreset.bin`**, a loose tagged data table: a `0x64` record holding 29,
then 29 `0x65` records of 102 values. Every value is an integer by its kind
bits but value 76, a string, and 90 and 91, floats. The strings are Shift-JIS.
Four are names — ナイン, シャノン, テンバタラ, ミーナ, the last two used by two
records each — and twenty-three name a vocation and a sex: せん (warrior), ぶと
(martial artist), そう (priest), まほ (mage), ぞく (thief, a man only), たび
(minstrel) and the six vocations after them, each おとこ, man, or おんな, woman.

| value | meaning | evidence |
|---|---|---|
| 0–74 | `unknown_items`: item ids, `0xFFFFFFFF` for none, in runs — weapons, then shields, legwear, footwear, gloves, armour, then headgear | every one an item's id; what the lists are for is not established |
| 75 | `unknown_75` | 64, 66 and 55 on the vocations; 18 to 25 on the named four |
| 76 | the name | a string, as above |
| 77 | `unknown_77` | 9024 on all 23 vocations; 9023 or 9024 on the named |
| 78 | a face, 9000 and its number — INFERRED | `f006` on every man's vocation record, `f005` on every woman's, and on all 41 presets here and in `presetdt` it lands on a face that exists |
| 79 | armour worn | 13xxx |
| 80 | legwear worn | 16xxx; 8001 on the sage man, which names nothing |
| 81 | gloves worn, or the arms when there are none | 15xxx or 14xxx |
| 82 | footwear worn | 17xxx |
| 83 | headgear worn | 12xxx |
| 84 | weapon | 20xxx |
| 85 | shield | 21xxx |
| 86 | sex: 0 a man, 1 a woman | on all 23 vocations, as おとこ and おんな say |
| 87 | the arms, 14xxx, numbered as the armour | 28 of 29; ナイン's is 1825 |
| 88, 89 | `unknown_88`, `unknown_89` | 1 or 2; 0 |
| 90, 91 | floats, 1.0 on most — 0.95 and 0.98 on the mage woman, 1.154 to 1.195 on テンバタラ; a figure's proportions, INFERRED | |
| 92–101 | `unknown_92` to `unknown_101` | the same ten on most vocations |

**What each vocation wears**, by the item names. The minstrel man: flamenco
shirt, loud trousers, acroboots and feather headband, no weapon. The minstrel
woman: dancer's dress, starlet sandals and circlet, her legwear 16190 naming
no item. The warrior man: the warrior's armour, trousers, gloves, boots, helm,
sword and shield — which ナイン wears too.

**`presetdt_<lang>.bin`**, one to a language in `/data/bin/presetdt.gp2`: a
tagged data table whose `0x66` and `0x68` records each list 20 string offsets,
then a `0x69` record holding 12 and 12 `0x6a` records of 35 values — value 1 a
string, the rest integers. The strings are 40 Shift-JIS names and, in English,
Aquila, Erinn, Patty and Sellma, whom the last four records name. **So the
village's Erinn is built of parts**: "Erinn's outfit" 13622 (`p_b622`), her
boots 17140, her headkerchief 12432.

| value | meaning |
|---|---|
| 0 | the record's number |
| 1 | its name |
| 2 | 0 on Aquila, 1 on Erinn, Patty and Sellma — a sex, INFERRED |
| 3 | the arms, 14xxx — numbered as the armour on 11 of 12 |
| 4–8 | `unknown_4` to `unknown_8` |
| 9 | armour |
| 10 | legwear |
| 11, 12 | as `charapreset`'s 77 and 78 — 12 a face, INFERRED |
| 13 | none on all 12 — gloves, INFERRED |
| 14 | footwear |
| 15 | headgear |
| 16 | weapon — a knife, 19061, on Patty |
| 17 | shield |
| 18 | an accessory, 18039, on Patty |
| 19–34 | `unknown_19` to `unknown_34` |

55 of the 57 ids these records wear name a part that exists.

Not read by anything yet — the game dresses the Hero by hand, `hero.ts`. Not
established: the first of the two 90xx values, and where a preset's hair
style, variant and colour are kept, if in it at all. The Hero's own are the
player's, chosen at character creation.

# Attending characters — `/data/bin/attnpc.gp2`

`attnpc_<lang>.bin`, one to a language: a tagged data table of five `0x64`
records of 19 values, value 2 a string and the rest integers, the same in
every language but for the name's offset. In English the five are **Aquila,
Ivor, Dr Phlegming, Sterling and Erinn** — the characters who go along with
the Hero for a stretch of the story, INFERRED from who they are.
`readAttendingCharacters` reads it.

| value | meaning | evidence |
|---|---|---|
| 0 | its number, 1 to 5 | |
| 1 | its model, `/data/chara_sub/s<nnn>.chr` | Ivor's 17 is the `s017.chr` the event introducing him loads (`ev02210`), Erinn's 16 the `s016.chr` of her morning (`ev02130`); so Aquila's is `s019`, Dr Phlegming's `s012` and Sterling's `s051`, INFERRED |
| 2 | the name | |
| 3 | `unknown_3` | 1, 1, 0, 0, 0 |
| 4 | `unknown_4` | 3, 0, −1, −1, 3 |
| 5 | a level, INFERRED | Aquila 20, Ivor 3, the rest 1 |
| 6 | `unknown_6` | 1 on Erinn, 0 on the rest |
| 7–15 | numbers — INFERRED to be in the level tables' column order: strength, resilience, agility, deftness, charm, magical might, magical mending, maximum HP, maximum MP | on Ivor and Erinn, who cast nothing, both magic values are 0 and the largest value is where maximum HP is; Aquila, who has a casting pack, has a maximum MP of 84. His agility reads 0, which fits nothing, so the order is not settled |
| 16 | `unknown_16` | 26 on Aquila, −1 on Ivor and Erinn, 0 on the others |
| 17 | a weapon's item id, 0 for none | Ivor's 20004, the copper sword; Aquila's 20006 |
| 18 | a shield's item id, 0 for none | Ivor's 21296, the pot lid |

Read so, **Ivor** is level 3 — strength 15, resilience 13, agility 16,
deftness 22, charm 10, 25 HP and no MP — with a copper sword and a pot lid.

**Only the fighters have battle motions.** A character's motion packs in
`/data/chara_sub` are its model's name and a suffix, as the Hero's are in
`chara_mp` (`mp0200b`, `be`, `bm`). Ivor's `s017b` holds damage, death,
guard, item, `sake` (a dodge), side- and backsteps, sleep and more, and
`s017be` two attacks. Aquila's `s019` has `b`, `be` and `bm`, the last a
casting pack as the Hero's `mp0200bm` is. Erinn, Dr Phlegming and Sterling
have none. Ivor's field set is `s017.chr` — the model, on a 12-bone rig, with
`walk`, `run` and `stand` — with three faces, `s017f01` to `s017f03`, which an
event hangs from his head (`235(10, 1, "head")` in `ev02210`), and a night
version, `s017n`.

**When he goes along: story stage 2.2, back at 2.3.** The triggers (see
"Triggers") put the events that speak with him at stage 2.2 — `ev02200` in
Erinn's house, `ev02220` and `ev02222` in the village, `ev02230` to `ev02250`
in its houses — then `ev02300`, `ev02320` and `ev02350` in map 5101, at the
landslide ("We're here at last. The landslide's…"), and his return at 2.3,
`ev02400` to `ev02450`. From `ev02220` on, those events do not load his model:
they call `566(10, 1)` and hand character 1 his motion pack, which reads as
"character 1 is the party's", INFERRED. **How he joins is not found**: no
script on the way writes a game-wide variable, or calls anything with his
number or his model's, and no table found holds a party by story stage.

Not established: values 3, 4, 6 and 16; the order of the numbers; how a
character joins and leaves the party.

# Poison marsh — the `dok` texture tag

A map texture's name carries three letters saying what the surface is (see
`materials.ts`: `wtr` water, `grs` grass, and so on), and some of those
letters are Japanese words — `iwa` rock, `zou` statue, `kabe` wall, `yane`
roof. **`dok` is taken for *doku*, poison — INFERRED.** Six textures on the
cartridge carry it:

| texture | drawn on | as |
|---|---|---|
| `d01dok01`, `d01dok02` | `D01M0000`, the Hexagon's own map | two flat planes, 13 and 31 triangles, at y −0.20 to −0.16 and −0.08, winding across x −12 to 10, z −5 to 12 in the model's units |
| the same two | `D14M04`'s `D14M0499` | the same, reused |
| `f49dok01`, `f49dok02` | `F49M0000` | two flat planes, 11 and 26 triangles |

`D01` is the Hexagon — its floors are 7102 to 7104 by the map index, and it is
7100 — and the slice plan puts its poison marshes there. The planes lie as
water's do, flat and just at the ground, and the ground under them can be
stood on: under the middle of the marsh's triangles the collision has ground
within a character's height of the surface on nearly all of them
(`apps/game/test/marsh.test.ts`). Drawn, they are **three purple patches**
either side of the path up to the hexagon, as the explorer shows the map from
above.

`isMarshTexture` reads the tag; `@minstrel/world` keeps each marsh surface
triangle by triangle (`MarshArea`, `inMarsh`) — not as a box, as water is,
because the box around the three patches covers most of the map between them.

Not established: what the marsh does, and how much — the game's rule is in
its code (the game's toll here is ours, `apps/game/src/marsh.ts`); whether
`mud`, on the fields, does anything; and whether the collision marks the marsh
too — the attribute word is not read.
