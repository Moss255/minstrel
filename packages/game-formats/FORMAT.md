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
**The low six bits are the name's length** — 1 on `A`, 4 on `<'e>` — 242 of
242 in `fi_me` and 245 of 245 in `fi_s7`; read 6 October 2026 from the
glyph lookup (`func_0204254c`, USA), which takes the first glyph whose name
matches the text's next bytes over that length (`strncmp`). Bits 6 and 7
stay unread. The seven are carried as `unknown_flags`.

**How the game sets a line** (read the same day, USA): the fonts are
numbered **0 `s7`, 1 `me`** (`func_02042944` fills `data_0210782c` from
`fd_%s.bin` and `fi_%s.bin`). A space is `data_020e7bd8[font] + 1` wide —
**3 in `s7`, 4 in `me`** — and so is a character no glyph names, which draws
glyph 0. **Drawing** (`func_0204f41c`) moves on by each glyph's width + 1,
with no kerning; **measuring** (`func_020420e8`) adds the kerning pair's
signed byte between a glyph and the one before (`func_020425e4`; a space
breaks the pair) and takes 1 off the total. So text placed by its width is
placed by a kerned one and drawn unkerned.

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
| `+0x00` | `u32` | how many records, a terminator among them — the instruction count |
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

## It is the game's `Script` command file

Read 6 October 2026 from the decomp's `Script` class
(`src/Resource/Script.cpp`, `include/Resource/Script.h`): **a record is an
instruction** — an opcode, a parameter count, two bits of type a parameter (0
a string's offset, 1 an integer, 2 a float) — run in order by
`Script::Execute`, which hands each to whatever function its reader put
against that opcode (`Script::SetOpcodeLookup`, a table of number and
function sorted by number). **The header's first word is the instruction
count** (`FileHeader::numInstructions`): it equals the records on all 5,675
tables in the European cartridge's files, counting the `0x6E` terminator
where there is one (854 of them). So a table's tags mean what its reader
says they mean, file kind by file kind — the staff roll's are below, in
"The staff roll".

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
| `0x6C` | one per resource: position, **byte offset into the string table**, its **flags** (the third value, low six bits — below), and a mask of texture sources (INFERRED) |
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

## What a resource is — the `0x6C` flags

Read 1 October 2026 from the manifest's loader (`func_02014a24`, its opcode
table `data_020ef418`, USA): the third value's low six bits say what is
loaded for the resource — `0x01` its joint animation (NSBCA), `0x02` its
material animation (NSBMA), `0x04` its texture animation (NSBTA), `0x08` its
pattern animation (NSBTP), `0x10` a `.bcfg` of motions, `0x20` not tinted.
**An animation is loaded only when its bit is set**, whatever lies beside
the model — 167 of 5,342 resources on the reference cartridge differ from
their files. A name whose fourth letter is `A` is collision; a resource with
`0x10` becomes an `Object3D` with its motions (`func_020151cc`), one for each
placement (`func_020177d4`); the rest are plain models the map draws itself
(`func_02014d80`), their animations attached for good.

**How they are paced** (`func_02015554`, each update): a plain model's
animations, all four kinds, advance by the game's delta — **a frame every
17 ms**, at speed 1 (`Animation3D::AdvanceTimer`, `0x0207e168`;
`GameState::CalculateDeltaTime`) — each round on its **full** frame count, and
on even when it is hidden. A piece with motions moves only when one is asked
for, by its record's rate (`AdvanceAnimations_v0`), all four kinds at the one
time; until then it stands in its rest pose with no animation on it. All 112
such pieces on the cartridge have flags `0x11`: cabinets and gates.

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

**A placement names its resource, and a resource can have several.** A `0x6F`
record's `values[0]` is its instance — what another placement's parent
(`values[5]`) names — and `values[1]` is the index of the resource it places.
This used to pair by position and leave the 56 manifests whose counts disagree
unplaced; they disagree because a resource is placed more than once. `D03M06`
places each of its two door models twice, a pair of doors at z 12.34 and
another at z 17.70, and each door's collision twice, each hanging off one of
the door's instances. `MapResource.instances` carries every one, and
`placementOf` resolves a parent by instance.

**Measured across the cartridge**: 81 resources are placed more than once, 144
placements beyond the first, in 45 maps. 76 are doors (`…D1`, `…D2`), four are
other repeated pieces (`D03M0602`/`03`, `D17M03G5`, `S07M0612`), all at
distinct positions. **One is not several of a thing**: the Hexagon's sliding
statue `D01M01S1` is placed at each end of its slide, and nothing in the
manifest marks it apart — the flags are the doors' own. Which resources are one
thing at several moments is the caller's to say (`AssembleOptions.once` in
`packages/world`); this title's rule is the sliding-piece name, in the game.

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

**`itemdt_<lang>.nat`'s `+0x10`** (read 4 October 2026, `func_020de234`):
bits 0–9 the item's **model number for a man**, 10–19 **for a woman**, 999
meaning the other's; bits 20–27 the model's **letter**, a character code —
`h` on the hairs 9000–9013, `f` on the faces 9020–9033. So face 9024 is
`p_f004` on a man and `p_f014` on a woman, and hair 9006 `p_h060` and
`p_h180`. `ItemDef.model`, `modelName`.

**A record begins four bytes before its id.** It was first read from the id,
behind a 36-byte head, and then each record's last four bytes held the *next*
item's actions: the medicinal herb's ended `(256, 256)`, strong medicine's
action, and the head's own last four were `(255, 255)`, the herb's.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u16` ×2 | what using it does: two action numbers (see "Actions"), 252 for nothing |
| `+0x04` | `u16` | the item's id |
| `+0x06` | `u16` | **what a shop gives for it**, its selling price — see "The price" |
| `+0x08` | `u16` | **what a shop asks for it**: the price itself, or a code on the selling price — `0xFFFF` twice, `0xFFFE` twice and one, `0xFFFD` twice less one, `0xFFFC` ten times; 0 on some that no shop sells |
| `+0x15`, bits 1–3 | | **rarity**, the equipment screen's stars, 0 to 5 — INFERRED, 16 September 2026, from the value alone: the copper sword and the flame shield carry 1, and two captures of the screen show one star for each; the tools carry 0 or 1 and show no stars; of the 268 weapons, 120 carry 1, 59 2, 34 3, 42 4 and 12 5 — the twelve that cost 30,000 G — with the rank correlation against price 0.67, and on every equipment table the counts fall from 1 to 5; the rusty sword and shield, the legendary bases, carry 4. The byte's bit 0 is 1 on the armour tables and 0 on weapons and shields, and its high nibble 5 or 10; neither read |
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

**The price** — every one of the 330 items any
shop sells has one above 0, and none of the 140 items at 0 — quest pieces, the
celestial suit among them — is sold anywhere.

**But the word is not what a shop asks** — found 15 September, against a let's
play of the European release, whose village shop asks for all 18 of its items
on screen. What it asks is the word **scaled by `+0x08`** (`itemPrice`):

| `+0x08` | asks | the village shop's 18 | all 330 sold items |
|---|---|---|---|
| `0xFFFF` | twice the word | 11 of 11 — the herb 8, the soldier's sword 240 | 315 |
| `0xFFFE` | twice, and one | 2 of 2 — the chimaera wing 25, the bandana 45 | 4 |
| `0xFFFD` | twice, less one | 1 of 1 — the leather whip 95 | 2 |
| `0xFFFC` | ten times | 4 of 4 — the copper sword 150, the feather fan 110 | 7 |

The check that does not lean on those 18: of the 13 sold items with one of
the last three values, all 13 then ask a price ending in 0 or 5 — the paring
knife 70, the oak staff 120, the softwort 95, the tangleweb 35, the leather hat
65 among the ones the let's play does not show — where doubling their word
gives one ending so for 1 of them. The two sold items with another value, the
bamboo lance (`0x55`) and the halberd (`0x2BC0`), are taken at twice, as most
are: ours. Why the scale is kept so is not known. A shop's rate (`readShops`)
multiplies it: 100 on all but one.

**The word is what a shop gives, and `+0x08` what it asks — 22 September
2026**, from the guide (see "Level tables"), whose item lists give a buying and
a selling price for every item. That corrects two readings above:

- The two "other" values are prices, not scales: the bamboo lance, `0x55`,
  costs **85** and sells for **8**; the halberd, `0x2BC0`, costs **11,200** and
  sells for **6,600** (printed pages 297–298) — `+0x08` and `+0x06`
  exactly. Taken at twice, they had cost 16 and 13,200. Stornway's weapon
  shop's own table (p. 67) has the lance at 85 too.
- **What a shop gives is the word itself**, not half what it asks: the copper
  sword, `0xFFFC`, sells for **15**, a tenth of its 150; the soldier's sword
  240 and 120, the rapier 480 and 240, the iron lance 450 and 225 — each
  `0xFFFF`, where the word is half; the dragon top 11,200 and 5,600 and the
  dark robe 13,500 and 6,750 likewise. Items no shop sells have a selling
  price all the same, and it is the word: the star's suit 11,750, the
  superstar's suit 16,000, the metal slime spear 22,500, the stud poker
  24,000 (pp. 298, 342). The guide prints the copper sword's buying
  price as 159, against 150 on its own shop pages and in the let's play: a
  misprint.

So `itemPrice` is what a shop asks and the word what it gives. Whether a shop's
rate touches what it gives is not established.

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
| 6 | **the chance of blocking, in tenths of a hundredth** — read from the game's code, 20 September: `func_02084ee8` sums these ten bits over the eleven pieces worn, each over `10.0f`, and the battle's block rate (`func_ov000_02156118`) is that sum behind a shield. Set only on shields, 42 of the 45, 5–100: bronze 5, iron 10, steel 15 | **evasion**, in tenths likewise — `func_02084f58` reads these bits the same way for the evasion rate, which confirms what was INFERRED: all five body pieces that set it say so — the cloak of evasion "makes evading enemy attacks easier" 30, the dark robe "sends enemy attacks astray" 20; on 55 pieces of footwear too, whose words do not say; 5–60 | **the chance of a critical hit**, INFERRED on one witness: the critical acclaim, which "cranks up the chance of a critical hit", 40 |
| 7 | **deftness**, INFERRED: the utility belt "does wonders for deftness" 25, the medal of freedom "upgrades deftness" 100; on 43 of the 78 gloves | **agility**, INFERRED: the agility ring "accentuates agility" 20, the meteorite bracer "insanely agile" 100, the Mercury prize 120 | **magical might**, INFERRED: the sorcerer's stone "a little" 2, the brainy bracer 8, the mager achievement "maximises magical might" 50; on 66 hats and 40 body pieces |

**Word 3**: bit 0 is set on all 936. **Bits 7–10 are a weapon's kind plus
one** — exactly `itemsort`'s subtype + 1 on all 267 weapons, two files agreeing
— 13 on all 44 shields, and 0 on everything else. Its top bits are not
established.

**Four bits, corrected 24 September 2026 — it was read as five.** The game
isolates the field in `func_020dd4c4`, which decides whether a character may
equip something: `arm9 0x020dd5a4: lsl r1, r1, #0x15 / lsr r1, r1, #0x1c`, a
shift of 21 then 28, which is bits 7 to 10 and nothing above. Read as five the
cartridge gives 0 to 13 on 941 items and **16 on exactly three** — 15100,
15103 and 15106, all gloves in table `a`. Sixteen is no weapon tree and armour
is supposed to carry none; read as four they are 0, which is what a glove is.
So **bit 11 is something else**, set on those three and nothing else in 944,
and what it is is not established.

**Word 4**: on the weapons, bits 12–15 are one number for each kind — swords
1, hammers 3, knives 4, wands 5, spears 6, axes 7, boomerangs 8, bows 9, whips
10, staves 11, claws 12, fans 13 — not established. Bits 0–11 are 0 on every
weapon and shield, and **`0xfff` on all 51 accessories** and most armour, with
other patterns on the rest — `0xebe`, `0x5e1`, `0x6a6`, and single bits `0x1`,
`0x4`, `0x8`: INFERRED, who may wear it, a bit a vocation of the twelve the
equipment screen's "Used by" shows.

**Which bit is which — INFERRED, 16 September 2026: bit v − 1 is vocation v in
the level tables' order** (warrior, priest, mage, martial artist, thief,
minstrel, gladiator, armamentalist, paladin, sage, luminary, ranger; `str_tm`
2101 to 2112 name them so, after 2100's Guardian). The evidence is the 23
vocation presets of `charapreset.bin` (see "Character presets"), each named
for a vocation and a sex: every armour, legwear, glove, footwear and headgear
piece a preset dresses in carries one bit and no other — the warrior's armour,
trousers, gloves, boots and helm bit 0, the priestess's pinafore and the
ascetic robe bit 1, the wizard's trousers bit 2, the tussler's top bit 3, the
rogue's robes bit 4, the flamenco shirt and loud trousers bit 5, the tactical
vest bit 6, the fencing jacket bit 7, holy mail bit 8, the sage's robe bit 9,
the star's suit bit 10, the nomadic deel bit 11 — save two that any may wear
(`0xfff`, the thug's mug and the red tights) and two of another's (a thief in
the warrior's gloves). The skill trees named for the vocations, `str_sklc` 15
to 26 — Courage, Faith, Spellcraft, Focus, Acquisitiveness, Litheness, Guts,
Force, Virtue, Enlightenment, Je Ne Sais Quoi, Ruggedness — run in the same
order. An earlier pass matched the entries to the records by position and
found the bits inconsistent; they are matched by name (above), and consistent.

**Bits 27, 28 and 29 are the sex rule — read 24 September 2026.** Bit 27 is
"sex 0 may wear it" and bit 28 "sex 1 may wear it", and `func_020dd4c4` puts
the two in a two-element array and **indexes it by the character's own sex
bit** (`live+0x49C` bit 0) rather than comparing them:
`0x020dd6e0 lsl r2, r1, #4` / `0x020dd6e4 lsl r1, r1, #3` /
`0x020dd6f8 ldr r0, [r0, r6, lsl #2]`. Bit 29 is not a plain restriction: only
with item **18048** in equipment slot 9 does it matter, and a clear bit there
skips the sex test altogether — so it reads as "18048 does not help with
this".

**Which bit is which, off the cartridge and not inferred:** 823 of the 944
pieces are open to both and **none is closed to both**. Of the rest, bit 27
carries *holy mail*, the *rogue's robes*, the warrior's gloves and the
twinkling tuxedo; bit 28 carries *holy femail*, the *roguess's robes*, the
priestess's pinafore and the dancer's dress. The mail/femail and robes/roguess
pairs settle it: **bit 27 is male, bit 28 female**, 40 to 81. Item 18048 is
the **wear-with-all award**, an accessory. `charapreset.bin`'s own `sex` field
agrees on all 33 sex-restricted pieces the 29 presets wear.

**Confirmed in the game, 24 September 2026**, which turns this from INFERRED
into read for the bit order itself: `func_020dd4c4` tests `1 << (v - 1)`
against bits 0 to 11 of this word — `arm9 0x020dd63c: lsl r0, r1, r0` over
`0x020dd644: tst r0, r1, lsr #20`, with `v` taken from `live+0x950` — and does
so **only for the in-RAM categories 2 to 7**, headgear through accessories.
Categories 0 and 1, weapons and shields, skip the mask entirely, which is why
their word is zero. Which vocation is which number is still the level tables'
order and still INFERRED; what is now read is that the mask is a mask and how
it is indexed. See the wiki's `Items`, "Who may wear it".

**Weapons and shields carry no bits.** Their use goes by the vocations' weapon
skills — `str_gskl` 5, "becomes able to equip <str_2> regardless of
vocation", is the Omnivocational passives' line — and which vocation has which
of the fourteen weapon and shield skill trees is in the ARM9 binary, not in
a file: see "Vocation skill trees" below. An item's `kind` (word 3, above) is
the tree's number, so who wields it is who has that tree.

# Vocation skill trees — in the ARM9 binary

**Found 16 September 2026, in the unpacked ARM9** — the binary is BLZ-packed
on the cartridge, which is why searches of the cartridge's bytes found
nothing. `readVocationTrees` in `vocations.ts` finds it by its shape, not at
an offset: twelve rows of five bytes, one a vocation in the level tables'
order, each four distinct trees from 1 to 14 and, last, the vocation's own
tree — 15 for the first row, 16 for the next, to 26. On the reference
cartridge those rows lie at `0xEE75D` of the unpacked binary and read:

| vocation | trees |
|---|---|
| warrior | sword 1, spear 2, knife 3, shield 13, Courage 15 |
| priest | spear 2, wand 4, staff 6, shield 13, Faith 16 |
| mage | wand 4, knife 3, whip 5, shield 13, Spellcraft 17 |
| martial artist | claws 7, staff 6, fan 8, fisticuffs 14, Focus 18 |
| thief | knife 3, sword 1, claws 7, fisticuffs 14, Acquisitiveness 19 |
| minstrel | sword 1, whip 5, fan 8, shield 13, Litheness 20 |
| gladiator | axe 9, hammer 10, sword 1, fisticuffs 14, Guts 21 |
| armamentalist | bow 12, sword 1, wand 4, shield 13, Force 22 |
| paladin | hammer 10, spear 2, wand 4, shield 13, Virtue 23 |
| sage | wand 4, bow 12, boomerang 11, shield 13, Enlightenment 24 |
| luminary | fan 8, whip 5, boomerang 11, shield 13, Je Ne Sais Quoi 25 |
| ranger | boomerang 11, axe 9, bow 12, fisticuffs 14, Ruggedness 26 |

The tree numbers are `str_sklc`'s (1 to 14 the weapons, the shield and
fisticuffs; 15 to 26 the vocations' own, named for them). INFERRED, on three
legs: the shape — no other run of sixty bytes in the binary or its
overlays has it; the own trees running 15 to 26 in the vocations' order; and
the minstrel's row holding the sword, the fan and the shield, which the
let's play's Hero, a minstrel, wields and wears. The search that found it
asked for that row and for the warrior's sword and shield, and nothing else.
`vocationsWielding` turns a tree into the bits `ItemStats.usedBy` uses, so a
weapon's "Used by" comes out as the armour's does.

**The table has a row 0.** Five zero bytes stand before the warrior's row, so
the table itself begins at `0xEE758` and is thirteen rows, indexed by the
vocation's number with 0 for none; the game's code refers to it there, not at
the warrior's row. Seen 17 September in the reference dump and in the USA
build, where the decomp names it `vocationSkillTrees` (`0x020ee748`). The
reader finds the warrior's row and indexes from vocation 1, so it reads the
same rows either way.

**Not read:** whether the Omnivocational passives, which let one character
wield a kind "regardless of vocation", show on the screen's grid.

# Who carries an item — the character's items and the party's stores

Read 2 October 2026 (USA), and kept by `apps/game/src/inventory.ts`,
`items-menu.ts`; the items' kinds and bits from `itemdt.gp2/itemdt_<lang>.nat`
(`readItemDefs`: 1,423 records of 32 bytes from `0x0C`, the count the first
`u16`; `+0x08` bits 0–3 the kind, 8 everyday and 9 important; bit 19 used up
when used, bit 20 kept when all is put in the bag, bit 25 straight to the bag;
`+0x18` the id). **The European file agrees**: 146 everyday, 88 important, 47
used up, 30 kept, 89 to the bag.

- **A character carries eight everyday items**, one to a slot, packed — the
  character record's `+0x454`, eight `int16` ids, −1 empty. A new one takes
  the first empty slot (`func_02083834`); one taken out closes the list up
  (`func_0208386c`). What is worn is apart (`+0x488`, `+0x194`).
- **The party's stores** (`GameState + 0x2a04`): the Bag (`+0x000`, 152
  items), the equipment bag (`+0x1d4`, eight lists by kind) and the important
  items (`+0xe04`, 94), each an id with a count to 99.
- **An item obtained** (`func_0207d300` — chests, pots and barrels, an event's
  `114`, alchemy, a monster's drop): equipment to the equipment bag, important
  items to theirs, one marked for the bag to the bag; any other everyday item
  **to the first member in party order with room, as many as fit, then the
  next**, the rest to the bag. A drop passes over the fallen. A shop asks who
  carries an everyday item bought — a member or the bag (overlay 3, state
  `0xc`).
- **An item taken** (`func_02086d88` — alchemy's ingredients, an event's
  `115`, the mini medals): one from the bag, then the equipment bag, the
  important items, then each member's carried in party order. **`114` gives
  and `115` takes.**
- **The field's Items** (overlay 2, `str_tm`): Everyday Items, Important
  Items (1002, 1003); for everyday, each member then the Bag (1101); on an
  item Use, Transfer, Discard, Cancel (1201–1204); Transfer to whom (1300 —
  the members and the Bag) and, for a member, to which row (1400): an empty
  row takes it, an occupied one changes places, the bag's old item going into
  the bag.
- **In battle a member uses only what they carry** (`func_020ddb38`): a
  used-up item leaves its slot, the list closing up.

# Skill panels — `/data/prm/skilltable.bin`

**Found 24 September 2026.** The ARM9 carries a per-tag handler table for this
file immediately before the file's own path string, and the `0x66` handler
reads exactly nine values into a twelve-byte record — which is where the nine
fields below come from, rather than from counting bytes. `readSkillTable` in
`skills.ts` reads it.

A loose [tagged data table]: one `0x64` record, one `0x65`, and **287 `0x66`
records of nine integers**. 287 is **26 trees × 11 panels**, plus one record
belonging to no tree. The trees are the ones the vocation table numbers, 1 to
26 — fourteen weapon and shield trees, then one per vocation.

| value | meaning | evidence |
|---|---|---|
| 0 | the panel's id, 0–286 | every id present once; it is how `sklname` and `sta_skl` name the same panel |
| 1 | its tree, 1–26; 0 on the one odd record | eleven to a tree for all twenty-six, and **`str_sklc`'s own number for it** — 1 "Sword Skill" holds Dragon Slash and Gigaslash, 20 "Litheness" the Minstrel's, whose own tree the ARM9 table says is 20 |
| 2 | skill points it costs | rises within a tree; each tree has one at 100 and one reading 0, **which is not a price** — see below |
| 3 | the action it teaches, 0 for none | |
| 4 | what it gives — the list below, **INFERRED** | each value goes with exactly one `str_gskl` message, and the message says what it does |
| 5 | how much: the message's `<val_1>` | |
| 6 | a second action, on ten panels — **INFERRED** to be the out-of-battle form | all ten are field-usable abilities, and it equals value 3 on eight of them |
| 7 | `battleOrder`: a second 0–286 index, also eleven to a tree, ordering the trees differently — **the panel's place in the battle's Spells and Abilities lists** (read 2 October 2026: `func_0209a104` keeps it at `+0x0a`; `func_ov026_021dc8fc` places each learnt panel's action by it and closes the gaps) | the game keeps both, so both matter to something |
| 8 | the `str_gskl` message shown when it is bought, 1–23 | |

**What value 4 means — INFERRED**, read off the messages: `0` the message says
it all · `1` an ability · `2` attack · `3` critical hit rate · `4` the tree's
weapon whatever the vocation · `5` shield block · `6` strength · `7`
resilience · `8` agility · `9` deftness · `10` charm · `11` max HP · `12` max
MP · `13` MP absorption · `14` evasion · `15` magical mending · `16` magical
might · `17` spell critical rate.

**The joint witness.** `/data/prm/sklname.gp2` names the same 287 panels in a
separate file, and its tree and cost agree on **every one**, as does its
"grants an ability" flag against value 4 being 1. Two files agreeing
everywhere is better evidence than reading either alone.

## Where the words are

| what | file |
|---|---|
| tree names, the 26 | `str_sklc` **1–26** (system strings) — the same numbers the panels use: 1–14 the weapons, the shield and fisticuffs, 15–26 the vocations' own |
| panel label, long | `/data/prm/sklname.gp2` — 287 `0x66` records of six values |
| panel label, short | `/data/bin/menu/sta_skl.gp2` — `0x67` records, id and string |
| ability name | `/data/prm/skl_art.gp2` |
| ability description | `/data/prm/actexp.gp2`, which `readSystemStrings` already parses |
| the sentence on unlock | `/data/prm/str_gskl.gp2` — 1–22 the messages, 101–114 weapon nouns, 202–216 stat nouns |

## The eleventh panel is unreachable by points — a skill book grants it

**Read 2 October 2026**: each of the 26 skill books (22265 to 22290, kind 8,
`+0x08` bits 4–8 at 31) names a panel at its record's `+0x14` — 10, 21, 32 …,
**every tree's eleventh** — and each round of a battle `func_ov026_021dc8fc`
(`0x021dc980`–`0x021dca0c`) sets that panel's bit (char `+0x8ec`) for a book
among the member's carried items, and clears it for one that is not. So the
marquee ability is had by carrying its book. Whether the field's menus read the
bit the same way is not read.

**Settled 24 September 2026.** Every tree has a record reading cost 0, and in
all twenty-six it is **eleventh**: last in the file and last by value 7, after
the hundred-point panel. Tree 1 reads `3, 7, 13, 22, 35, 42, 58, 76, 88, 100,
0`. It holds the tree's marquee ability — Sword's Gigagash, Shield's Critical
Hit Guard, Courage's Auto Counter.

The game's ownership walk (`arm9 0x0209a678`) goes through a tree's eleven
records in file order, counting while the points *exceed* the cost and taking
one more if they *equal* it, then stopping. A tree's points cap at 100 and the
tenth costs exactly 100, so the walk always stops there. The skill menu agrees
from the other side: it draws **ten** entries a tree, `ov013 0x02187b64: cmp
r7, #0xa`.

So neither of the game's two consumers reaches it. `panelsBought` leaves it
out; treating the zero as a price would hand a character with no points at all
the best thing in every tree. **What, if anything, grants it is not
established** — no code was found that reads it.

## Not established

- What, if anything, grants the eleventh panel.
- The record with tree 0: `[286, 0, 0, 168, 1, 0, 0, 286, 0]`, named "Egg On".

# Builds — in the ARM9 binary

**Found 25 September 2026.** The ten builds a character can be made in — the
"Build" knob of character creation — are **ten pairs of `fx16`**, five to a
sex, and the game picks one with `sex * 5 + rand(5)` (`0x02010c58` on, USA).
`readBuildTable` in `builds.ts` finds them **by shape**, as the vocation skill
trees are found: twenty halfwords in a band around 4096 whose second of each
pair falls strictly across each row of five.

On the European dump that shape occurs **exactly once**, at `0xe6da8`, and
gives the same twenty numbers the USA build has at `0x020E6D98` — two builds
agreeing, found two different ways.

| sex | the five, as (height, width) in 4096ths |
|---|---|
| 0 | (3768, 4255) (3637, 4136) (3850, 4014) (4132, 3891) (3870, 3764) |
| 1 | (3768, 4177) (3641, 4091) (3809, 3973) (4132, 3891) (3768, 3764) |

0.888 to 1.039 of the figure's own size. **Which of a pair is which is
INFERRED**: the second falls steadily across each row and the first does not,
which is what a "slim to broad" row looks like; nothing in the code names
them. The two sexes share the middle build and differ elsewhere, which is what
makes it a table of ten rather than five used twice.

# Bookshelves — `/data/scenario/htana<L>.gp2` and the type-8 regions

Read 4 October 2026 from the bookcase service (`func_ov017_021ac3b0`, overlay
17; US code, European files). `readBookshelves`, `mapBookcases`.

**A bookcase is a region**, not a cast member, a treasure or a trigger: a
`0x73` record of type **8** in a map's `.bmbl` link table, followed by a
`0x74` holding its number (`func_0201d638` case 8). Values 1–3 the centre,
4–6 the whole size, 7 the box's turn, **8 the way the Hero faces to read it**.
The Hero reads one standing in its box and facing within about 117° of value 8
(`func_ov017_021984f4`, `< 8364.2` fx32). 163 on the cartridge, in 64 maps.

**What a shelf holds** is `htana<L>_<lang>.bin`, a tagged data table run as a
script; `<L>` is INFERRED the first letter of the map's code (it holds on all
162 records). Each tag-`0x66` record: the map's `maplist9` id, the bookcase's
number, 1 for a recipe book or 0 for a book to read, the recipe book's number,
three texts (a string offset or `0xFFFFFFFF`), then the recipes it teaches.
The last record naming a map and a number wins.

| | |
|---|---|
| text 0 | a plain book's text; on a recipe book, "There don't seem to be any books of particular interest." |
| text 1 | a recipe book's first reading, ending "…finds recipes for … `<SE_RECIPE>`" |
| text 2 | read again: "…already knows the recipes in this book." |

A recipe book teaches only once **game-wide flag `0x777`** is set — the Krak
Pot sets it when it first opens (`func_ov006_02157a60`) — and its own flag,
`0x114C` + its number, is clear; then, once its text is read, its recipes are
known and the flag set. 54 recipe books, numbered 1 to 55 with no 8, hold 327
recipes, none in two. Stornway inn's *Alchemical Essentials* is a plain book.

# Alchemy recipes — `/data/bin/recipe.gp2`

**Found 25 September 2026** by reading **overlay 6**, the Krak Pot, which
carries `renkin`, the path and the pot's own art side by side. A tagged data
table of one `0x66` record holding the count and **470 `0x67` records of
twenty integers** — no string table, because a recipe has no name of its own
and is shown by the name of what it makes. `readRecipes` in `recipes.ts`.

| value | meaning |
|---|---|
| 0 | the recipe's number, 1–471. **359 is absent**, hence 470 records |
| 1 | **the item it makes**; all 470 distinct |
| 2, 4, 6 | up to three ingredients' item ids, 0 for an empty slot |
| 3, 5, 7 | their counts, 1–3 in the first slot and 0–9 in the others |
| 8 | 0 on 448, 1–7 on the 22 alchemiracles — not established |
| 9 | **the per-cent chance this recipe is what comes out**: 100 on 448, 10 on 17, 20 on 5 |
| 10, 11, 12, 13 | not established, and carried |
| 14, 15 | the result's own item category and subtype — **and the Alchenomicon's own grouping**, see below |
| 16 | **the recipe to reach instead** when an alchemiracle works, `−1` for none |
| 17 | **the recipe to fall back to**, `−1` for none |
| 18 | the Alchenomicon's **By Type** order, by equipment slot |
| 19 | its **By Name** order, alphabetical by the result's name |

The empty ingredient slots are always a suffix, checked on all 470; 331
recipes use three, 135 two and 4 one.

**The game's own reader was not found**, unlike the skill panels: 21 per-tag
handler tables exist across the ARM9 and the 35 overlays and none belongs to
this file, and the load site in overlay 6 was disassembled without locating the
record consumer. So the fields are read from the data and from outside
witnesses, which is a weaker footing than an instruction, and worth saying.

**What holds it up:**

- `/data/prm/itemsort.gp2`, **which this file does not point at**, gives every
  item a category and a subtype. Value 14 matches the result's on **470 of
  470** and value 15 on **469** — the miss is the leather kilt, a skirt filed
  under trousers. That only lines up if value 1 is the result.
- Value 19's order matches `itemsort`'s own alphabetical rank at **all 469
  steps**.
- A published strategy guide agrees on eight sampled recipes, **counts
  included**, which is what pins values 3, 5 and 7.
- The pot's own words: `str_ren` 18 "there's a `<val_2>` per cent chance of
  success", 19 "A successful alchemiracle results in an item superior to the
  one indicated in the recipe", 20 "even if you fail … you shan't go away
  empty-handed". Values 9, 16 and 17 are read as those three sentences.

**The alchemiracle pairs.** 22 recipes name a better one at value 16 and 22
name a fallback at 17; each pairs with the other both ways and **takes the
same ingredients**, at two grades of the same thing. The odds are the *better*
recipe's own value 9, not the one being attempted.

**Values 14, 15, 18 and 19 are the book's own screen**, read 25 September
2026 from `bm_rrb` — a `0x67` table of 48 labels, the same shape as `sta_skl`.
The Alchenomicon groups by category (All Recipes · Weapons = `itemsort`
category 0 · Armour = 1–6 · Accessories = 7 · Items = 8, 9 · `???`), then by
eighteen **By Type** headings — the twelve weapon types, then Shields, Head,
Torso, Arms, Legs, Feet — and sorts each by **By Type** (value 18) or **By
Name** (value 19). Every one of the 470 recipes falls in exactly one category
with none left over, and `???` gets nothing; what it is for is not
established.

**Where a recipe book is found is not read.** No item in any of the nine
`itemdt_*` tables is a recipe, so the books are world objects and quest
rewards driven by scripts.

# Battle weight tables — in the ARM9 binary

**Found 16 September 2026, in the unpacked ARM9**, at `0xE8CBA` on the
reference cartridge: a run of four tables of six bytes, each summing to 256,
the weights a monster's six ways (see "Monster data", `+0x18`) are drawn by
— a draw from 1 to 256 against the six in turn, as the reference battle
emulator's `ProcessEnemyRandomAction2A` has it. `readWeightTables` in
`battle-tables.ts` finds the run by its first table and reads to its end.

| table | weights | who draws by it |
|---|---|---|
| 0 | 43 42 43 43 42 43 | a monster of way 0 — 96 of the 438; the reference's even table |
| 1 | 68 58 48 38 27 17 | way 1 — 281; the reference's table for its own boss |
| 2 | 210 29 10 4 2 1 | way 2 — 2 |
| 3 | 70 70 70 16 15 15 | way 4 — 25 |

The first two are the reference emulator's two tables exactly, which it
took from the game's disassembly — the witness that this run is the one.

**What chooses among them — read 22 September 2026, from the game.** The run
is one array, named `monsterActionWeights` in the decomp's symbols at
`0x020e8caa`, and the only code that reads it is `func_0208a370`: it draws
`NextRandomMax(256) + 1` and walks the six weights down, taking the first the
draw does not pass — which is the draw this repository already made.

Which table, and whether weights are used at all, is **bits 5 to 7 of the word
at `+0x10`** of the monster's battle record — `MonsterBattle.aiType`. The
three bits index eight handlers at `0x020f10b0` (`func_0208a91c`), read by one
instruction in the whole build:

| way | what it does | of the 438 |
|---|---|---|
| 0, 1, 2, 4 | draws by weight table 0, 1, 2 and 3 in that order | 96, 281, 2, 25 |
| 3, 7 | round robin over the six, by a counter kept for the monster | 9 |
| 5 | a counter picks a pair of slots, a coin picks within it | 22 |
| 6 | two passes over the slots, the first often skipped | 3 |

A slot the monster cannot use — no MP, a once-a-battle way already spent, no
target — is not re-drawn: the game scans down from the slot it picked and then
up, and falls back to action 2 if nothing serves.

**The boss bit does not choose the table**, which this file had INFERRED and
`apps/game` acted on. It is bit 4 of the byte at `+0x27` (`MonsterBattle.bossAi`),
set on 144 of the 159 boss-coded monsters and on five grotto bosses with
ordinary codes — Equinox, Atlas, Shogum, Trauminator, Nemean — and clear on
the bosses' minions and every other monster. But the two commonest ways stand
on both sides of it, and **Hexagoon, the slice's own boss, is way 0**: the
even table, where the bit had it drawing by the falling one. What the bit does
is not established. The byte's other bits (`0x09`, `0x0C`, `0x19` are its
other values) are not read.
`docs/binaries.md` keeps the record of what else lies beside them.

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

**What the other columns are was INFERRED**, in two steps, and is now
**confirmed** against a published guide — see "Confirmed by the guide" below.

- **Ten columns, ten words.** The status screen's strings,
  `/data/bin/menu/str_sta.gp2/str_sta_en.bin`, run `Lv` · `Exp.` · `Strength`
  · `Agility` · `Resilience` · `Deftness` · `Charm` · `Magical Mending` ·
  `Magical Might` · `Max. HP` · `Max. MP` · `Attack` · `Defence`. Past `Lv`,
  that is experience and nine numbers — the table's first ten columns — with
  attack and defence, which come from equipment, after. Column 10 is none of
  them: 0 at level 1, 12 at level 10 and 200 at 99 on twelve files, 17 and 350
  on `level0`. It is the skill points gained, all told — see below.
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

The weakest step was the last: it rested on what those vocations are, not on
anything in the files.

**Confirmed by the guide — 22 September 2026.** The *Dragon Quest IX*
Signature Series guide (Prima; the Internet Archive's scan,
`Dragon_Quest_IX_Guide`), kept locally in `evidence/` and not committed:

- **The Minstrel's attribute table** (printed page 36) gives HP, MP and the
  seven stats at levels 1, 5, 15, 25, 40, 60, 80 and 99. `level6` agrees at
  **all 72** of those values, under the reading above; no other file agrees at
  more than 2. That settles columns 1 to 9, including the two taken against
  the screen's order — 2 resilience and 3 agility (22 against 18 at level 5), 6
  might and 7 mending (6 against 7 at level 1) — and that `level6` is the
  Minstrel's. The guide says the Hero "starts the main game as a minstrel".
- **The skill-point table** (printed pages 18–19) gives the points gained at
  each vocation level: 3 at 5, 6, 8, 9, …, rising to 6 in the thirties, then 2
  a level on two levels of every three from 50. Summed, it is **column 10 at
  every level from 1 to 99 on all twelve vocations' files**, 200 at 99. The
  cartridge bears the reading out: `str_bres` 13, among the battle's result
  messages, is "`<val_1>` skill point(s) earned." — so skill points are what a
  level pays, and a column that counts them belongs here. The guide's
  walkthrough adds that the Hero first gets skill points at level 5 (p. 59);
  `level0`, the Guardian's, has them from level 4, and agrees with the table
  at 3 of the 99 levels.
- Column 0, the experience, is not in the guide and stays INFERRED.

The guide has an attribute table for every vocation. Only the Minstrel's has
been checked; the other files' vocations still rest on the order of the names.

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

**Confirmed for the Minstrel — 22 September 2026.** The guide's Minstrel page
(printed page 36; see "Level tables") lists the nine spells above, each at the
level read here, with the MP the actions' own records give: Heal 2, Crack 3,
Evac 3, Woosh 3, Crackle 8, Midheal 4, Zing 8, Swoosh 8, Kaswoosh 26. So the
record is (vocation, place, level), at least on the Minstrel's records; the
other vocations' are read the same way and have not been checked.

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
shut at frame 0 to open at frame 24. **Searched, it opens and shuts again**
(`func_02015554`, set going by the placement's flag `0x100`,
`func_0201ba1c`; read 1 October 2026): playback speed 1.5, `open` forward
and once with sound `0x12` (`open2`, `0x62`, on a gate), held 500 ms, then
**`close` played in reverse** (`0x13`; `close2`), held at its end. `closed`
and `opend` are named by no code.

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

## Sliding pieces — `<area>M<nn>S<x>` and `<area>A<nn>S<x>`

Named as a door is, with `S` for `D`. 13 models are named so across the maps,
7 with a collision beside them. The Hexagon's first floor has one, `D01M01S1`,
with `D01A01S1`: eight triangles, a box exactly under the model as the map
places it — x 0.29 to 0.57, z −1.79 to −1.63 in world units, in the gap between
the big hexagon and the room above.

**It stands where the thing to examine on it stands** — INFERRED, from this one
case. The spot `202`'s record from 2.4, step 5, stands on the piece's middle to
0.006; its record before that stands 0.431 to the left, in the gap. So until
step 5 the piece, and its collision, are 0.431 to the left, shutting the way;
from step 5, where the map puts them. None of the other twelve has a record on
it. No event moves it — `ev02530`, the switch's, calls function 321 sixteen
times, each aiming the camera within 0.01 of the switch over three frames: a
shake — so how the game slides it is in code. The game here slides it at half a
world unit a second, its collision with it; that speed is a choice.

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

**Read from the decomp, 29 September 2026**: `LightingInfo::LoadFromScript`
(`src/Graphics/LightingInfo.cpp`) runs the file as a script, one handler a
tag, and names every value. `readLighting` reads it in that order.

| tag | handler | values |
|---|---|---|
| `100` | `DeclareAdvancedLighting` | the gradient centre's offset, a float |
| `102` | `CreateAdvancedLightingEntry_Alternate` | not on the cartridge |
| `103` | `DeclareBasicLighting` | the same offset |
| `104` | `CreateBasicLightingEntry` | index; a vector; background, horizon and pots-and-barrels colours; two floats; sprite, model and edge colours |
| `105` | `CreateFogEntry` | index; on; colour; type; depth shift; offset; eight packed density words; alpha |
| `106` | `CreateAdvancedLightingEntry` | index; light 1 (on, direction x, y, z, colour); light 0 (the same); background, horizon, ambient, one more, sprite, model and edge colours |

**A slot's index is the time of day**, 0 night, 1 morning, 2 day, 3 evening;
the script refuses one past 6. Colours are `BGR555`. The **background** and
**horizon** colours are the gradient drawn behind everything —
`LightingManager::DrawBackgroundGradient`: the horizon colour on the screen
row a point far ahead of the eye falls on, blending toward the background a
whole change per half screen. Where a map's `.bats` lives: `ats_<letter>.ambl`
by the code's first letter, named `<code>00.bats` — every battle stage has its
own in `ats_B.ambl`. `B01M1600`'s day is `#0073ff` over `#00ffff` at the
horizon; its night `#000052` over `#29527b`. A battle takes its slot from the
battle request's `+5` rather than the clock (`DrawBackgroundGradient`, under
flag `1 << 9`, which every battle's load sets at `0x02164fa0`). **The slot is
the clock's as the battle is asked for** (read 1 October 2026): touching a
roamer stores `LightingManager +0x98` there (`func_ov017_02196430`,
`0x02196bbc`), and so does a set battle's trigger `120` (`func_0206f81c`,
`0x0206fc5c`); `func_020a3578` and the encounter's defaults make it 2, and one
set battle, started by `func_ov000_021bc77c`'s task, stores a fixed 2
(`0x021b8bf0`). `eventbattle.bin`'s record has no slot. The models' lighting
takes the same slot, with no blend between slots
(`GetCurrentAdvancedLightingValues`, `0x02050c20`); the fog keeps to the clock.

`docs/findings.md` records that these carry no music selection.

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

Four of the twenty-two values are byte offsets into the string table, and
three more are read. Slots count from 0 with the record header read as the
shared table's (`u16` tag, `u8` count, two type bits a value, padded to a
word); an earlier revision of this table, with a four-byte header, had each
two higher.

| slot | meaning |
|---|---|
| 0 | the map's own id, which is how placements and triggers name it |
| 2 | region — "Angel Falls", "Gleeba" |
| 4 | **map code**, which is also the name of the map's archive |
| 5 | the name whoever built it wrote — "Inn", "Church", "Erinn's House Lv 1" |
| 6 | **the music**: an index into `bgm.sdat`'s sequence list — INFERRED, below |
| 11 | a second code, usually one with a real attribute table, but not this map's |
| 17 | the space: `1` indoors, `2` outdoors, `0` neither |

### The music — INFERRED, 16 September 2026

Slot 6 is read as the track that plays on the map, from the values alone; no
code has been read. On every one of the 871 shipping entries it holds an
index into the music archive's sequence list: 844 name a sequence with a
file, 25 hold 80 — the grotto boss floors, and 80 is `BG_100`, the one
sequence past the `ME_` jingles, which pins the numbering to the list's own —
and 2 hold 25, which has no file on the reference cartridge. The values
follow what the labels say: all nine "Church" maps and the one "Chapel" hold
10 and nothing else does; the castle's 26 maps 11; the observatory's 22
maps 12; the abbey 13; the 85 field regions 14; the temple 15; the ship's
five 17; "Field - Sky" 18; 94 dungeon maps across 67 regions 19; the 140
grotto floors 22; every `B01` battle stage 23 — 137 of them, with the
"Monster Modifier" test floor; the `B02` boss stages 24; and each of the
twelve legacy bosses' stages its own value from 27 to 38, in the bosses'
order. A village and its houses share one value, its church another. Angel
Falls is 5, its church 10, the region round it 14, the Hexagon 19, and the
Hexagoon stage, `B02M15`, 24.

Not read: whether anything else changes the track — the time of day, the
story — and `data/bin/mapbgm.bin`, 68 records pairing map ids with values
from `0x0580` to `0x0857`, which are not sequence indices.

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

## Values 1 and 17, read from the code — 6 October 2026

The game reads the list as a `Script` (`func_020995f8`, opcode `0x67`) into a
16-byte map record. **Value 1 is the map's area**, the record's `+0x02` (15
bits): a village and its houses share their exterior's id (1100 for Angel
Falls), a dungeon and its floors theirs (7100, the Hexagon), every field 1 —
but Stornway's maps are 198, not their exterior's 100. Evac's table is matched
by it. **Value 17**, already read from the labels as indoors or outdoors, is
the record's `+0x0E` bits 0–1, and **what Zoom and the chimaera wing do** on
the map (`func_ov002_02165b44`): 2 they go (119 maps — fields, exteriors, the
sky's ocean), 1 a bump on the ceiling (520), 0 nothing (232 — the sky, the
Observatory's exteriors, the Realm of the Almighty, event and test maps).
`MapEntry.area`, `MapEntry.zoom`.

## The other fifteen values are not established

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
| `0x00` | `u32` | the instruction count — see the shared table |
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

**A `0x73`'s first value is the region's type**, read from the game's code
(`func_0201d530`, and `func_0201d638` for the `0x74`, which fills the region
by its type). Type 2 is a doorway; **type 3 is an area of the map**, numbered
by its `0x74`'s first value — see "Areas" under "Triggers". On the cartridge:
283 of type 0, 184 of 1, 670 of 2, 22 of 3, 63 of 4, 113 of 5, 160 of 6, 163
of 8, 56 of 9, 204 of 10, 360 of 11 and 23 of 12. The rest are not read.

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
| `+0x08` | `u32[7]` | a span of the story: words 0, 1 and 2 its first stage and step, 3, 4 and 5 its last; **word 6 the time of day** — read from the game's code, see "Who stands where, read from the game's code" |
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

**Who stands where, as the game takes it** — superseded on 28 September
2026 by the game's own rule, read from its code (below). It was INFERRED from
which characters the trigger records talk to, and it was wrong in two ways
the code shows: it read only records for this map, where **a record for
another map is what takes a character away from this one**; and it took "has
records, none covering" as "not here", where the game leaves them at their
block's place. Kept for the record:

| a character's records in the map, at the stage and step | stood | measure |
|---|---|---|
| one covers it and has a position | there | 1,245 character records talk to someone so |
| one covers it without a position | not here | taken as the header's place instead, Angel Falls would have **27** more at every stage |
| none covers it | not here | a "none covers it, so the header" rule would put Ivor in the village at 2.1 — which the game's rule does not, because his record for the mayor's house at 2.1 takes him out of the village |
| none at all | at the header's place | **596** records talk to such a character in the header's map |
| a gap inside one sub-stage | at the header's place | thin: **19** gaps |

### Who stands where, read from the game's code — 28 September 2026

US ARM9. The field's cast loader (`func_ov017_021a2c14`) opens
`data/scenario/<area>.npc` and **runs its `place.bin` as a script**
(`func_0206da80`, opcode table `0x020f0994`, tags 3 to 22), with the story's
stage, sub-stage and step and the map's id as its context. It is a tagged
table like the others, and read as one (`readPlaceRecords`) rather than by
the byte patterns above, which miss **89 of 1,378** blocks and **40 of 2,017**
spans: 72 blocks with no place at all, and records whose coordinates are
written as integers. Each record places a character or takes them away, **in
the file's order** — `castAtPoint` in `npc.ts`:

| tag | values | what it does |
|---|---|---|
| 3, a block (`func_0206c010`) | map, character, then where (x, y, z, facing, and a byte on some) | for this map only: places them; with no place, takes them away |
| 5, a span (`func_0206c2c0`) | from and to — stage, sub-stage, step each — then **the time of day**, map, character, then where | counts only while `from ≤ now ≤ to`, each weighed `major × 1000 + minor × 10 + step`, and only at its time. Then: **for another map, it takes the character away from this one**; with no place, it takes them away; otherwise places them |
| 17, while flags (`func_0206d4e0`) | pairs of a condition and whether it must be set (1) or clear (0), then time, map, character, where | a condition's high half 1 is a game-wide flag by its bit, 2 by its number — displaced from `0x400` as the script function `603` displaces (`func_0206eb98`); any other and the record does not count. Otherwise as a span, and **before all others** |
| 4, at one point (`func_0206c0f8`) | stage, sub-stage and step, then time, map, character, where | counts only when all three are now's, and at its time; another map takes the character away, as a span's does; otherwise places them, ordered as a span that ends at a sub-stage 0 (their minor set, no "to"). Coffinwell's `26` is placed only so — in the scholar's house (1311) at 4.1 steps 1 and 2, outdoors at step 3 |
| 6, **a talk box** (`func_0206c4e8`) | character, four floats, a label | a box on the ground — x and z at most, then at least, in a placement's units — and the label a talk from it asks with. Kept on the character's first placement in this map at the time, so a box read before the character is placed, or after they are taken away, is none. **The Hero talks to whoever's box holds them**, and a thing to examine only so — see "How a talk runs" under "Triggers". 570 on the cartridge; Yggdrasil's is `199, 3.24, 1.27, −3.36, −2.52, 80`, and the village shopkeeper's three are over his counter |

**Word 6 of a span is the time of day**: 0 by day (morning, day or
evening), 1 by night, 2 either — `GameState::IsMorningDayOrEvening`. On the
cartridge: 1,227 either, 378 by night, 371 by day. Angel Falls' `15` is in
the stable by day and the village by night; Erinn is upstairs at 2.6 only by
night.

**The order a character's placements keep** (`func_0206db48`), by six
classes: tag 17's first (a bit of `+0xa`, `0x04`); then one with another bit,
`0x40` (class 1 — tag 14's, perhaps, not read); then one whose `+0x46` is set
(class 2, not read); then a span whose to-stage has a sub-stage of 0 but whose
from-stage does not, and a point's (tag 4); then any other span; a block's
last. Between spans of class 4 (and class 1), **the one that starts earliest**,
and then the first in the file; otherwise the first. One
that comes after all the others is dropped. Taking a character away
(`func_0206dd68`) clears where they stand, and a later record can place them
again.

**Not read**: tag 14, which places by a quest's state (`func_0206e120` —
see "A talk file is a script"); tag 7, which keeps four floats on the
placement and sets a mode byte of 7 (`func_0206c614` — a wander box,
perhaps); and 4, 8, 11, 15 and 18 to 22, which name a character and carry
what looks like a path, a facing, flags and a model with its motion. A
character placed only by those stands nowhere here.

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

Each event unpacks from its own `ev#####.gp2` to a `.stb` and five text files,
`_de`, `_en`, `_es`, `_fr` and `_it` — **in one of two folders**:
`/data/event` holds 523 of them, and `/data/evspt_lv5` 164 more, numbered 21500
to 29791. No number is in both, and the second folder's are packed the same
way; two of them, `ev21593` and `ev23190`, carry a plain `ev#####.bin` besides,
not read. The slice's there: the scene at Angel Falls' Guardian statue,
`ev22590`, Patty's talk before the Hexagoon fight, `ev22510`, and the pass's
`ev22591` and `ev22592`. The game looks in `/data/event` and then
`/data/evspt_lv5`. The `.stb` is
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
which carry cutscene staging — model files, motions, cameras — 164 of them
events of their own (see "Event text"); 33 in `/data/scenario`; 13 in
`/data/menu`; 2 in `/data/event_lv5`. The event scripts, in both event
folders, are read whole — container, routines and code — and run by
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

**A routine's code runs to its last return, not its first.** A return is the
end only when no jump in the routine lands past it: the accolade scripts
(`data/scenario/title_*.stb`) end every candidate's `if` with `push 1;
return` and jump over it to the rest, which a reader stopping at the first
return cut off — and the machine then refused the jump as landing outside its
routine. Read 6 October 2026.

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
| `0x08` | multiply | only in `/data/evspt_lv5`'s 164, where it is common — 4,777, in 127 of them. **4,761 follow `1 negate`**: a value times −1. The rest: `3.14 1.5` — a three-quarter turn in radians — `2.0 3.14`, a whole one, and `30 0.2` |
| `0x09` | divide, the second value by the top | the same folder, 9 times: `4.5 180 divide 3.14 multiply` turns 4.5° into radians; `0.95 L6 divide`. Every one divides a float, so what an integer division does is not seen |
| `0x0B` | negate the top value | follows coordinates, which are stored positive |
| `0x0E c` | compare the second value against the top: 40 `==`, 41 `!=`, 42 `<`, 43 `<=`, 44 `>`, 45 `>=` | read from the interpreter, 6 October 2026 (below) |
| `0x0F` | return, with the top value | ends every routine |
| `0x10 t` | jump | every target inside its own routine |
| `0x11 t w` | pop, and jump when its truth is `w` | loops' exits |
| `0x12 t w` | short-circuit: jump keeping the value when its truth is `w`, else drop it | `a == 1 ‖ a == 2`; INFERRED |
| `0x13 _ t` | call the routine at `t` | 11,515 calls, **every one onto a routine header** |
| `0x14 1` | drop a string: the developers' notes, Shift-JIS | |
| `0x15 n` | invoke an engine function: `n` values, the first its number | below |
| `0x16 n` | nothing: a label | always at a jump's target |
| `0x17` | wait for the next frame | inside every waiting loop |
| `0x19` | or | only ever of flags, `4 \| 16`, `1 \| 16`; read from the interpreter |
| `0x1A` | not | before a jump on an engine function's answer |
| `0x1D` | sine of the top value, in radians, pushed as a float | read from the interpreter |
| `0x1E` | cosine | read from the interpreter |

`0x08` and `0x09` are the second event folder's (see "Event text"): in the 523
of `/data/event`, `0x08` appears only in one shared routine that no event
calls. That folder also has `0x1D` and `0x1E`, twice each and only in
`ev29350`: `r θ 0x1E multiply cx add` and the same with `0x1D` and `cz`, the
two coordinates of a point on a circle.

**The interpreter, read 6 October 2026**: overlay 17's
`func_ov017_021d4e38` (USA), a jump table on the opcode at `0x021d4e5c` for
0 to `0x1E`; a value on its stack is a type word (0 integer, 1 float) and a
word. `0x1D` (`0x021d5d6c`) and `0x1E` (`0x021d5de4`) pop a value, make an
integer a float, widen it to a double and hand it to the ARM9's `sin`
(`func_02009424`) and `cos` (`func_02008dcc`) — fdlibm's, by their shape:
the |x| ≤ π/4 test against `0x3fe921fb`, the π/2 reduction, the quadrant's
kernel — and push the answer narrowed to a float. The comparison is the
sub-table at `0x021d55a4`, the second value against the top, an integer
against a float compared as floats. `0x18` is an `and` (`0x021d5c2c`) and
`0x19` an `or` (`0x021d5c9c`); `0x0A`, `0x0C`, `0x0D`, `0x18`, `0x1B` and
`0x1C` are cases no script on the cartridge uses, and are left unread.

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
morning by — 303 where the camera looks, 310 a yaw, rise and straight-line
distance it looks from, 566 and 567 a character's model and motion packs — are
in `docs/event-scripts.md` §5.

**The camera, read further** — INFERRED, from how the calls agree with each
other across every script played. 302 is where the camera is: within a shot,
it and 303 give the yaw, rise and distance 310 does on **1,024 of 1,032**
second-folder shots, and on 9 of 14 in the first folder — **when the distance
is the straight line from target to eye**; read as the distance across the
ground, as it first was, they agree on 539. 304 moves both — camera, then
target, then frames — and its pair agrees with the 311 beside it (yaw, rise,
distance, frames) on 506 of 511. 321 moves where the camera looks over so many
frames — read from its shape alone, a point and a count like 304's; there is
nothing for it to agree with.

**The second event folder waits its own way.** Each of its 164 scripts has one
wait routine of 27 instructions: it doubles the frames asked for, then each
frame calls function 840 with a reference and takes what 840 wrote off the
count — where the first folder's wait takes 1 off. 840 is called nowhere else,
in either folder. The two folders ask for waits of the same sizes — the
commonest 1, 10, 5, 30, 20 and 15 in both, medians 10 and 12 over 7,714 and
5,182 waits — so 840 reads as the frame's length in halves, and the game
answers 2. INFERRED.

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

# The event lists — `data/event/eventlist6.bin`, `data/evspt_lv5/eventlist_lv5.bin`, `data/event/evl_quest.bin`

**Every scene plays in a map of its own, and these say which.** Read from the
game's code, 28 September 2026 (overlay 17). A scene's task opens a list by
the scene's number (`func_ov017_021bbc10`) — below 21,000 `eventlist6`, below
40,000 `eventlist_lv5`, from there `evl_quest` — and runs it as a script
(`func_02071488`, one opcode, 102, handled by `func_02071208`), keeping the
record whose event is the scene's. **If that record's map is not the Hero's,
the scene does not play here** (`func_ov017_021bbfc4`): it fills the
map-change request with the map and the scene's number (`func_0200fd0c`, as
the trigger queue's `133` and the script function `807` do) and ends, so the
map changes and the scene plays in its own. A script a scene chains into
(`538`) goes back through the same start, so a chain can walk the Hero
through several maps: talking to `106` on the Starflight Express at 4.7 plays
`ev24598` (map 6401), which chains `ev24500` (5102), `ev25500` (4510) and
`ev5110` (4507) — and `ev5110`'s record, which moves the story to 5.1, is the
Observatory's, in 4507. A scene's own record (kind 11) is looked for in the
map it ended in.

A tagged table: `0x65` and `0x64` once each, then one `0x66` record (tag 102)
per scene — 414, 165 and 137 on the reference cartridge, no scene listed
twice. Its 23 values, as `func_02071208` stores them:

| value | kind | kept at | read as |
|---|---|---|---|
| 0–3 | integers | `+0`–`+3`, bytes | **0 and 1 are the stage the scene belongs to**, and the scene's start raises the live thread's stage to it when the story is behind and the major is 19 at most (ov017 `func_ov017_021bbfc4`, at `0x021bc424`; see "How a record runs") — the Starflight Express's arrival scenes are listed at 20.1 for that reason, and `ev29300`, the credits, at 19.1 is the one scene a record plays before its listed stage. 2 and 3 are `unknown` — 5, 100 for `ev5110`, 11, 100 on most of `eventlist6`'s, the first pair again on `eventlist_lv5`'s |
| 4 | integer | `+0xe` | **the map it plays in** — compared with the Hero's, and put in the request |
| 5 | integer | `+0xa` | **the scene**, which the list is searched by |
| 6 | integer | `+0xc` | `unknown` — the first scene of its chain on the ones looked at (`ev5110`'s is 24500) |
| 7, 8 | strings | `+0x12`, `+0x32` | a name, and the script file, `ev05110.stb` |
| 9–11 | integers | `+0x3e`–`+0x42` | `unknown` — 100, 200, 300 on all looked at |
| 12–15 | floats | `+0x48`, `+0x54` | a place and a facing (×4096); where they are used was not followed |
| 16–19 | integers | `+5`, `+0x46`, `+4`, `+6` | `unknown`. The second, where not negative, becomes the record's index in the list, and the scene's start tests game-wide flag `910 + it`, and does not play the scene when it is set — not read further |
| 20 | string | `+0x56` | a font's name |
| 21 | integer | `+0x44` | **flags**: `0x80`, the map is the Hero's own — the scene plays wherever they are (13 scenes); the rest not read |
| 22 | integer | `+0x10` | `unknown` — 6401 on the Starflight Express chain's |

`data/event/evl_quest_d.bin` is shaped otherwise and is not opened by the
scene's start. Read by `readEventList` in `eventlist.ts`.

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
then a string offset: 8,461 English files. With three numbers, tag 2 on 17,739
records, tag 1 on 14,357, tag 4 on 2,167 and tag 5 on 1,113; with four, tag 1
on 1,733, tag 4 on 395, tag 2 on 347 and tag 5 on 137.

41 English files — the king's for chapter C among them — begin with the word
16 and were read as empty until 28 September 2026: the cartridge walk took them
for empty compressed streams (see `tryDecompressLz10` in `@minstrel/nitro-comp`).

## A talk file is a script — read from the game's code, 28 September 2026

**The talk opens `data/scenario/<area><letter>0.gp2` and the character's
`<id>_<lang>.bin` in it** (ov017 `func_ov017_021b8e8c`), the letter being the
live major stage's in `ABCDEFGHIJSTKLMNOPQ` (`func_ov017_0218d2c4`) — so
majors 11 and 12 are `S` and `T`, and 13 to 19 `K` to `Q`, where the
alphabet was once read. **It then runs the file as a script**
(`func_ov017_021ba810`, opcode table `0x021d7c58`): a record's tag is its
opcode, and every record is visited in turn. A line that holds is kept, so
**the last that holds is said**; with none, nothing is said and the talk ends.

| tag | handler | holds when |
|---|---|---|
| 1 | `func_ov017_021b9d00` | numbers 0 and 1 are a range of sub-stages holding the live minor (`GameState` `+0x5cb4`; a first number below 0 holds always). With four numbers the third is the time: not 0, only by night — and by night, once such a line is in range, no three-number line after it holds. Then the label, below |
| 2 | `func_ov017_021b9e30` | a quest's line: its number, then a test of its two bits of state (`func_0206e120`) — −1 for 0, 0 for 2, 2 for 3, 3 for 1, and 1 and 4 flags beside them — then as tag 1 from the time on. `129 : q` sets a quest's to 1; that 0 is untouched, 1 open, 2 taken and 3 done is **INFERRED** from the lines — Sister Cindy's at 0 reads "THIS IS A BUG!", at 1 she introduces herself, at 2 her lines carry `<QUEST=109>`. One that holds silences every tag-1 line, and the first quest with one the others' unless their own states say otherwise |
| 3, 4 | `func_ov017_021ba124`, `…280` | in a game played together (`func_0202b7d8`), by whether `func_0202c1a4` holds — none of tag 3 on the cartridge |
| 5, 6 | `func_ov017_021ba3dc`, `…524` | as 1 and 2, only while `func_0202c540` does not hold and a value of the Hero's is 0 or below — **INFERRED** to be their HP, see `OP_HERO_DOWN` in `story.ts`. One that holds silences tags 1 to 4 |

**A line's label holds by the one the talk asks with** (`func_ov017_021b9bcc`).
Both are in the same group of 80, and within the group by the line's place:

| place | holds while |
|---|---|
| 0–15 | its count is within the character's talks since the Hero came into this area |
| 16–31 | its count is within their talks since the Hero came into this map |
| 32–63 | it is the label asked, exactly |
| 64–79 | its count is within the live step (`+0x5cb8`), the highest such |

So asked 0, a character's 0 and 16 are their plain lines, and 17 holds once
they have been talked to in this map; asked 192, only 192. **The two counts**
are nibbles per character (`func_0206ec1c`), both going up to 15 each time a
line is said (`func_0206ec64`). A new sub-stage clears them (`func_020703c8`),
`106 : c` clears one character's, entering a map clears the second, and
entering one the game counts as another area the first (ov017
`func_ov017_0219d250`, by three bytes of each map's record in a table
`GameState` keeps at `+0x468` — which file that is, is not read).

**Which label the talk asks with** — see "How a record runs": the character's
own records' `118`, or the label of the talk box the Hero stands in (tag 6 of
the cast's `place.bin`), or 0.

**Evidence**, besides the code: tag 1's numbers 0 and 1 are in order on all
19,902 records of tags 1, 4 and 5; the four-number form's third number is 1 on
all 2,612; a signpost's box asks 80 and its line is 96, the Hexagon's
inscription's and Yggdrasil's both.

---

# The staff roll — `/data/evspt_lv5/staffroll.bin`

A command file (the tagged data table, above), run by overlay 28 when `811`
starts the roll; read 6 October 2026, `docs/readings/T11-ending.md` has the
overlay. `readStaffRoll` in `staffroll.ts`.

| tag | values | does |
|---|---|---|
| `0x66` | speed, a float | pixels the roll moves a frame: **0.86** |
| `0x64` | count | room for that many lines: 470 |
| `0x65` | group, flags, gap, text | one line |

A line's **flags**: bits 0–3 its size — 12 is set in font 1 (`me`),
anything else in font 0 (`s7`); bits 4–5 where it stands — 0 at x 0, 1
centred, `(256 − w) / 2`, 2 ending at x 120, 3 starting at x 136; bits 7–10
the colour of its letters. Bit 6 and bits 11 up are read by nothing. Lines of
**one group** stand at one height; a **new group** goes `gap` pixels below
the last, once the roll has scrolled far enough to show it.

On the European cartridge: 472 instructions, 470 lines in 418 groups.
Headings — "Development Staff", "Chief Scenario Planner" — are size 10,
centred, colour 5; names are size 12, colour 15, centred or, on the pages of
two columns, a pair in one group ending at 120 and starting at 136. Gaps are
209 between companies, 37 between roles, 23 under a heading and 13 between
names. The text spells accents as the fonts name their glyphs, `Micha<:e>l`.

---

# Treasure — `/data/scenario/treasure.nsarc/<map>.bin`

One member per map that has any: 268 members, two of them empty (`M09M05`,
`D13M02`), and three — `randTBox`, `randTD`, `randTTT` — named for no map.
Every non-empty one is a tagged data table (above) and walks to its string
table, and the first header word, the table's instruction count, is the
record count on all 266.

| tag | values | seen | meaning |
|---|---|---|---|
| `0x65` | a string | 266 files | a date and time, 2009 — when the file was written, by the look of it |
| `0x64` | a string | 266 files | the same date as `yymmdd` |
| `0x66` | an integer | 265 files | **the game-wide number of the file's first treasure** — below |
| `0x67` | 3, 5 or 6 | 847 records in 265 files | one treasure |
| `0x6A` | an integer | the three `rand*` tables | their row count |
| `0x69` | an integer | the three `rand*` tables | a row — see "Random treasure" |

**`0x66` numbers every treasure in the game.** Taking each file's span as its
`0x66` value up to that plus its count of `0x67` records, the 265 spans run from
0 to 847 without overlapping and without a gap. So a treasure's number is its
file's first plus its place in the file. It was INFERRED to be what an
opened treasure is remembered by; **it is not** — the game keeps value 0's
high half, the container's id (corrected 6 October 2026, below). (Until 28 September 2026 two files, `M09M05` and
`D13M02`, read as empty and left two gaps 13 wide where they sort: their first
word is 16, which the cartridge walk took for an empty compressed stream — see
`tryDecompressLz10` in `@minstrel/nitro-comp`.)

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
- **Kind**, value 1, **read 6 October 2026 from the game's own reader**,
  `LootManager_CreateContainer` (US `0x0207ba90`, decompiled in the decomp's
  `src/World/LootableContainer.cpp`): **bits 4–6 the container** — 0 a red
  chest, 1 a pot, 2 a barrel, 3 a cupboard, 4 a blue chest — **bits 2–3 what
  it holds** — 0 nothing, 1 gold, 2 an item, 3 a monster — and bits 0–1 not
  read here (1 on the five kind-`0x9` chests). So `0x4` is gold, `0x8` an
  item, `0x10` a pot, `0x20` a barrel, `0x30` a cupboard, `0x40` a blue chest.
  The code tells the chests (0, 4) from the rest by the position it reads, and
  blue from red by the table it draws from; that 1 is the pot and 2 the barrel
  is the decomp's naming, the two taking different sprite sheets
  (`func_02013d24`). (Until then the pot and barrel order and `0x40`'s table
  were INFERRED from `randTTT`'s name.)
- **Value 0** is **the container's id** in the high half and the item, gold or
  rank in the low (`packedID >> 16`, `& 0xffff`). The ids run 0–206 for the
  red chests and 0–699 for the rest over the cartridge, repeated only by
  `C04M04` and `C04M05`, one room's two versions. **An opened one is
  remembered by a flag of its id** — a red chest's `0x212 + id` for ever, the
  rest's `0x79e + id` until play next begins, which clears all 700. See
  `docs/readings/T13-gathering.md`. (This replaces the running number below,
  INFERRED until then to be the key; `0x66`'s first number is kept by the game,
  `LootManager_Unknown_66`, and read by nothing found.)
- **What a drawn container holds is drawn at every load of its map**
  (`LoadZoneContainers`): a blue chest from `randTBox` at its rank, a pot, a
  barrel or a cupboard from `randTTT`, by a draw below 100 against the rank's
  rows in file order — past their weights, nothing.
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
shadow (`kage`). **They are two chests, each a body and a lid**: `01` and `03`
the body, a box 0.80 by 0.68 by 0.41 whose top face is drawn as the dark
inside, 18 vertices; `02` and `04` the lid alone, a dome 0.23 high reaching
0.68 along +z from its own origin, 22 and 24. `01` and `02` bind one 64×64
texture, red-brown, `03` and `04` another, grey. (First read as a chest shut
and the same chest open; drawn so, a chest stood open until it was opened and
then showed only its lid.)

**How the two go together is read from the casino's prize chest**,
`/data/enemy/z077a_i0.chr`: its model's nodes are `light_off`, `T00GDS01` and
`T00GDS02`, and the lid's node stands at (0, 6.3, −5.2) over a body 6.29 high
and 5.21 either side — on the body's top, its origin on the body's −z edge, the
dome then covering the body exactly (the icon files are the same pieces at a
fifteenth of the size). The lid's origin is its hinge: **the back is −z, the
front +z**, as the chest in `M01M08` stands, with no floor behind its −z side.
Neither of the casino chest's motions, `GGG_i` and `777_i`, turns the lid; no
file found animates one. Nothing names these as chests: that is read from the
shapes. INFERRED: they are in the files' own units — 0.41 is 28% of a person,
where in the characters' space, the coffin's, it would be 1% — the kinds with a
facing are chests, and kind `0x40` takes the second, grey one.

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
(*takara* is treasure) beside `hirou.nsbca`: 14 frames, a crouch to the
forearms' lowest on frame 5, at a chest lid's height, and a lift up and forward
to their highest on 9. The game plays it as the Hero opens a chest, the lid
going back with the hands — INFERRED from the motion's shape.

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
| 23–25 | what it gives: 1 gold, 2 an item, 3 a monster (`LootDistribution_DeclareOutcome`; "ambush" in the decomp) |
| 7–22 | the gold amount, the item's id, or the monster's number |
| 0–6 | weight among the rank's rows |

Read off the whole cartridge: taking bits 7–22 as an item id lands on one for
61 of `randTBox`'s 68 rows, 147 of `randTD`'s 162 and 80 of `randTTT`'s 98, and
every row that does not is a gold or a kind-3 row; no other alignment comes
close. `randTBox` has ranks 1 to 5, `randTD` 1 to 10, each rank's weights coming
to 100; `randTTT` has 1 to 20, its weights coming to 20 to 50. Kind `0x40`, the
blue chest, draws from `randTBox` — its values are 1 to 5 — and pots, barrels
and cupboards from `randTTT`, the shortfall below 100 being their chance of
nothing: the game's own reader says so (above).
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

# What equipment does in a battle — `itembtlprm.nat`

Read 22 September 2026, from the game. `/data/prm/itembtlprm.nat` is **1,423
records of 44 bytes** behind a `u32` count — its low 12 bits, as
`func_0209a088` masks them (`0x0209a0b0`; corrected 3 October 2026 from 20) — in order of the item they belong to, which is how
the game finds one (a binary search, `func_0209a004`, on the id at `+0x28`).
`readItemBattleParams` reads it.

| offset | type | reading | evidence |
|---|---|---|---|
| `+0x00` | `u32` | flags, one bit to an accessor. **Bit 16: the wearer's share of a battle's experience ×1.05**, theirs alone and once however many — read 3 October 2026; the only record carrying it is 17189, the elevating shoes. The other bits are not read | `func_0208538c` tests bit 16 of each of the eight worn places' copied records (place pairs at `0x020e8b6c`); the share multiplies by `1.05f` at ov023 `0x021f43a0` |
| `+0x08` | 10 bytes | not established | 1,178 of the 1,423 carry something |
| `+0x14` | `i8` ×20 | **what it adds to a resistance**, one an element — elements 1 to 7 and 9 to 21, never 8 or 22 | the game's own loop (`func_02083e28`), which writes the eighth byte to the ninth element's place |
| `+0x28` | `i16` | the item's id | strictly ascending across all 1,423, from 994 to 22,290 |
| `+0x2A` | 2 bytes | 0 on every record | |

**How the game uses it.** Overlay 17's `func_ov017_021b3780` walks the eight
equipment places it keeps battle numbers for — the slot order is a byte table
at `0x021d6b20` — looks the worn item up here, and copies the whole 44 bytes
into the character's own block at `char + 0x2F4 + entry × 0x2C`. The stat
recompute then sums the twenty numbers over the eight entries onto **a hundred
each**, holds them at nothing below, and writes 22 bytes to `char + 0x21`;
building a combatant copies those into the battle's status at `+0x3E`
(`CopyResistances`), which is where `GetResistance` reads them. `func_02083e28`
runs the sum; `wornResistances` is that sum here.

**Only 183 of the records carry any number**, and the values seen are whole
multiples of five, mostly negative — `-20`, `-25`, `-30`, `-35`. Nothing the
slice's Hero can wear carries one.

---

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
| `+0x02` | `u8` ×2 | each drop's chance, a step — the ordinary's at `+0x02`, the rare's at `+0x03`: 0 always, 1–6 one in `2^(step+2)`, 7 none | the game's own table, below |
| `+0x04` | `u16` ×2 | its two drops, the ordinary and the rare | every one is an item id; the guide's, below |
| `+0x08` | `u32` | experience | the metal family: 4,096, 40,200 and 120,040, against a median of 940; the guide's, below |
| `+0x0C` | `u16` | gold | a median of 2,490 on the bosses against 120; the guide's, below |
| `+0x18` | `u16` ×6 | its six ways of acting: action numbers (see "Actions"), INFERRED | 1 Attack on 1,064 of the 2,628 words and 225 Flee on 109; the healslime's Heal, the drakulard's Inferno, the uncommon cold's C-C-Cold Breath. The reference's own boss, Ragin' Contagion (`b006a`), has 1, 275, 1, 48, 44, 228 — the reference's six candidates exactly and in order: attack, poison attack, attack, Deceleratle, Kasap, Sweet Breath |
| `+0x5C` | `u16` | maximum HP | a median of 6,500 on the bosses against 134; the metal slime's 4; the game's code and the guide, below |
| `+0x5E` | `u16` | maximum MP | 255 on most bosses and the metal family; likewise |
| `+0x60` | `u16` | attack | likewise |
| `+0x62` | `u16` | defence | the metal family's 256 and 512; likewise |
| `+0x64` | `u16` | agility | high on the metal family; likewise |
| `+0x6C` | `u8` ×22 | **resistances**: what it takes of each of the game's 21 elements, a hundredth each, by `element − 1`. From the game's code — see below | firespirit 50 fire, 150 ice; slime 125 of all seven; metal slime 0 of every status; **element 8, the plain Attack's, 100 on all 438**. Fifteen values in all: 0, 1, 5, 10, 15, 25, 30, 35, 50, 60, 75, 100, 125, 150, 200 |
| `+0x82` | `u8` ×2 | copied into the battle beside them; not established | 0 on every monster looked at |
| `+0x10`, bits 3–4 | | **its AI mode** — 3 October 2026: 0 and 1 choose their way and target in the command phase, 2 at its own turn; mode 1 takes each action's targeting handler at `+0x0C`, mode 2 at `+0x0E`, mode 0 always the first. `MonsterBattle.aiMode` | `func_ov000_02159d94`, `func_ov024_021f66cc`. 0: 102, 1: 253, 2: 83, 3: none |
| `+0x10`, bits 5–7 | | **how it chooses among its six ways**: one of eight handlers, four of which draw by a weight table — see "Battle weight tables" | the game's own selector, `func_0208a91c` |
| `+0x10`, bits 8–10 | | **its actions more a round**, by a rule: 0 none, 1 one on a coin, 2 one, 3 two, 4–7 one or two by a status bit — 3 October 2026. `extraRule` | `func_ov000_0215f57c`, the table at `0x02182a6c`. 151 of 438 not 0; rule 2 on 105, 3 on 30 |
| `+0x10`, bits 20–25 | | **which of its six ways its group may use once**, a bit a way. `oncePerGroup` | `func_0208a03c`; drackmage's Kasap, bit 5 |
| `+0x10`, bit 26 | | **it weighs who last struck it** in choosing whom: 2 more for the last, 1 for the one before. `remembers` | `func_ov000_02154f30`; 263 of 438 |
| `+0x81` | `u8` | the 22nd resistance byte, which no element reaches, is **the charm's**: a monster with it not 0 draws for each of the party at its turn | `func_ov000_0215704c`; 387 of 438 not 0 |
| `+0x24` | `u32` | **two statuses a blow of its can carry, and a chance for each**: bits 0–6 the first status, 7–13 its chance, 14–20 the second, 21–27 its chance | the one reader, ov024 `0x021eb124`, compares the requested status against each field and a draw below 100 against each chance; the chances in the file are 0, 25, 50, 75 and 100 |
| `+0x27`, bit 4 | | set on the bosses, and **read by nothing** | set on 149 records — 144 of the 159 boss-coded monsters and five grotto bosses — and clear on the bosses' minions and every ordinary monster. It is bit 28 of the word above, which its reader never touches; six searches over the ARM9 and all 35 overlays found no instruction that tests it. It is not what chooses the weight table, which this file had INFERRED |

### Confirmed by the guide — 22 September 2026

The *Dragon Quest IX* Signature Series guide (see "Level tables") prints, for
each monster in its bestiary, HP, MP, attack, defence, agility, experience,
gold, and an ordinary and a rare drop with the chance of each. For the seven
monsters around Angel Falls (printed page 255: slime, cruelcumber, teeny
sanguini, sacksquatch, batterfly, dracky, bodkin archer) **every one of the
seven numbers and both items agrees with the record** — 49 numbers and 14
items — the first item being the ordinary drop and the second the rare. The
walkthrough's table of the area's monsters (p. 59) gives the same HP,
experience and gold.

**The drop chance** — INFERRED from the same pages. The two bytes at `+0x02`,
one a drop, run 0 to 7, and against the chances the guide prints:

| step | the guide's chance | where it was checked |
|---|---|---|
| 0 | 100% | King Godwyn, Barbarus, Corvus — each with one drop and 7 beside the empty second |
| 1 | 1/8 | slime, cruelcumber, restless armour, purrestidigitator |
| 2 | 1/16 | slime, batterfly, dracky, teeny sanguini, bodkin archer |
| 3 | 1/32 | sacksquatch |
| 4 | 1/64 | sacksquatch, batterfly, dracky, teeny sanguini, bodkin archer |
| 5 | 1/128 | cruelcumber, wight emperor (both) |
| 6 | 1/256 | restless armour, purrestidigitator |
| 7 | — | beside item 0 on every record but ten, all legacy and grotto bosses; not established there |

So one in `2^(step+2)`, with 0 a certain drop — `dropOneIn`. Over all 438:
step 0 on 31 first drops, 7 on 14 first and 128 second.

**And the game's own table says the same — 22 September 2026.** The drop roll,
`func_ov023_021f454c` in overlay 23 of the USA build, indexes the table of
eight words at `0x021fd888` by this byte: `1 8 16 32 64 128 256 0`. It loads
it at `0x021f49ac` for the byte at `+0x03` and at `0x021f4a74` for the one at
`+0x02` — which settles that **`+0x02` is the ordinary drop's chance and
`+0x03` the rare's**, and that a step of 7 never drops (its entry is 0). No
other copy of that table is in the ROM. How the roll runs is in
`packages/sim/src/battle/drops.ts` and `docs/conformance.md`.

### Resistances, and the five numbers — from the game's code

Read 20 September 2026. The game builds a monster's battle status from this
record **at `+0x2C`** (`func_02089630`, called from overlay 0 at `0x0215eed0`
with `record + 0x2c`): HP from that block's `+0x30`, MP `+0x32`, three `u16`s
`+0x34` to `+0x38`, a packed word at `+0x3C`, and **24 bytes copied from its
`+0x40`** to the status's `+0x3E` (`func_02082d38`). That is this record's
`+0x5C`, `+0x5E`, `+0x60`–`+0x64`, `+0x68` and `+0x6C` — so HP, MP, attack,
defence and agility above are where the game reads a monster's numbers from,
and no longer only INFERRED from their sizes.

The battle reads a resistance with `func_ov000_02156b38(target, element)`: the
byte at status `+0x3E + element − 1`, over `100.0f`; whole for an element
outside 1 to 21. Everyone's bytes start at a hundred (`func_020891cc`
`memset`s 22 of them); a monster's are then these.

**The elements**, from the actions that carry them (`Action.element`,
`Action.landingElement`): 1 fire (Frizz, Fire Breath) · 2 ice (Crack, Cool
Breath) · 3 wind (Woosh) · 4 blast (Bang) · 6 dark (Zam) · **8 the plain
Attack** · 9 Dazzle · 10 sleep · 13 Fuddle · 16 poison · 18 attack down (its
rider's handler reads this byte) · 19 defence down (Kasap) · 20 agility down.
5, 7, 11, 12, 14, 15, 17 and 21 are not established; the 22nd byte is reached
by no element.

**A monster's HP is drawn** in the same function: unless a flag says not
(`func_020a3694` of the battle — INFERRED: a grotto's or a legacy boss's), it
is `(int)(HP × NextRandomFloatBetween(0.8, 1.0) + 0.5)`, from `GetBTRandom()` —
the world's generator, not the battle's. The table's HP is the most it can
have. `monsterHp` in the sim; `docs/conformance.md`, "The two generators".

**How a monster chooses among its six**: the reference draws a number from 1
to 256 against six weights, an even table, 43, 42, 43, 43, 42, 43, and for
Ragin' Contagion a falling one, 68, 58, 48, 38, 27, 17. Both are in the ARM9
binary once it is unpacked (an earlier search of the packed bytes missed
them), and `+0x27` bit 4 says which a monster draws by — see "Battle weight
tables" and the row above.

`+0x14` is 500 to 605 on ordinary monsters and 0 on most bosses — Hexagoon's
among them, though not the Wight Knight's or Morag's — not established.
The rest is carried as it is. Hexagoon, the slice's boss, is `b003a`.

**Names**: a record is the name's offset, the code's offset (both `u32`, from
the strings) and the number (`u16`) at `+0x08`; then the body, below; six bytes
not established; the plural's offset at `+0x14`; and at `+0x18` the name's
grammar, its articles and gender (see "Articles"). The strings run name, plural, code for each monster —
`slime`, `slimes`, `z000a` — and the plural's offset starts a string on all 438
records in all five languages. **Codes repeat**: 438 records
carry 312 codes, a code naming the story's versions of one monster (the
scarlet fever four times); the lowest number is the ordinary one.

**The body — `+0x0C` and `+0x0E`**, from the code rather than from the bytes:

| offset | type | meaning |
|---|---|---|
| `+0x0C` | `s16` | collision **radius**, in 1024ths — shifted left 2 into `fx32` |
| `+0x0E` | `s16` | collision **height**, `fx32` already |

Overlay 17 builds a field monster's `Object3D` in `func_ov017_021a2128` and
ends it with

```
ldrsh r1, [r5, #0xc] ; lsl r1, r1, #2 ; bl Object3D::SetRadius
ldrsh r1, [r5, #0xe] ;                 bl Object3D::SetHeight
```

`r5` is an entry of the collection at `+0x2F8` of the resident map — a slot of
four, 0x318 bytes each, found by map id (`func_02028bd0`) — and `0x021b5250`
fills that collection from this file. `Object3D::SetRadius` and `SetHeight` are
the decomp's names; `radius_` and `height_` are `fix32_t` and default to
`1 << 12` in its constructor, so a monster that named neither would be a
one-unit ball. Units are the files' own, which `WORLD_SCALE` divides by 8.

**The size in battle — `+0x12`**, an `s16` in 4096ths, read 1 October 2026
(USA). Overlay 0 loads this file into the battle request's `+0x678`
(`func_ov000_02165490`, `0x02165bd0`), finds each monster's record by number
(`func_ov000_02166070`, `0x0216629c`) and keeps it with the model
(`func_020484f8`); `func_02048588` copies `+0x12` onto the battle object's
`+0x18e` (`ldrsh [rec, #0x12]` at `0x02048608`, `strh` at `0x0204860c`). The
only other write sets 1.0 on every battle object (`func_02048614`). The value
is read by the actor close-up's distance, tags 115 and 117's scale
(`func_ov000_0216352c`), the death effect's scale (`func_02048690`) and the
battle shadow's (`0x02161134`). It is 1.0 for the slime, 1.40 for the bodkin
fletcher, 1.44 for the brownie and 3.12 for the hexagoon; 1.0 to 6.8 over all
438. Not a model's scale: every monster model is drawn at `0x10a`.

**The kind — `+0x10`**, a `u16`, read 6 October 2026 (USA): overlay 0's
`func_ov000_0215fc8c` takes each of the battle's eight monster objects
(`data_ov000_02182c44`), their record at `+0x144` — this file's, stored by
`func_02048850`, which reads its `+0x0c` — and compares `+0x10` with a key of
overlay 26's fixed shots (`data_ov026_021de87c`; "The camera while a command
is chosen", below, and `docs/readings/T15-presentation.md`). On the cartridge
it is 1 to `0x133`, one value to each kind of monster across its story
versions (Baramos's 607–609 all `0x129`), the bosses `0x101` (the hexagoon)
on; 0 on nine records, among them the claws and monsters 800 and 801.
INFERRED: that it is the bestiary's kind — the code only compares it.
`readMonsterNames` gives it as `kind`.

**The witness is that the numbers sort the bestiary.** The slime is 0.80 wide
and 0.80 tall, a ball; the metal slime as wide and 0.60 tall; the bag o' laughs
0.78 and 0.84. The largest are Lleviathan, Barbarus and Greygnarl at 7.80 and
5.25, the alphyn and the Nemean at 6.40 and 3.50. Ten times the slime for the
great dragons, and not one of the 438 negative. A wrong offset does not order
a bestiary by size. `tools/harness/test/monster-body.test.ts` pins it.

Two of the ten bytes this section used to carry as not established are these;
`+0x0A`, `+0x10` and `+0x12` have since been read, and one more remains. `readMonsterNames` gives them
as `radius` (already shifted into `fx32`) and `height` since 29 September
2026; overlay 0 lines monsters up in battle by the radius — see "Who stands
where on the stage".

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
| `+0x24` | `u32` | **the track**, INFERRED: 23 to 38 — 23 the ordinary battles', 24 the bosses' on 46 — and the stage's own track on 75 of the 82 with a stage |
| `+0x28` | `u32` | **the stage**, a map id, or 0 for the one the ground names — INFERRED; see "Where a battle is fought" |

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

## Where a battle is fought — the stages

Read from the game's code (US ARM9, overlays 0 and 17) on 29 September 2026.
**A battle is not fought where it starts.** It is fought on a map of its own,
a *stage*: one of the `B` archives — 80 `B01` stages for the fields, by region
and ground ("F01 - Field", "F01 - Forest", "F03 - Poison Swamp (Flat)"), and
`B02` on for the dungeons, the bosses and the rest. Each is a small patch of
ground: `B01M16`, "F01 - Field", is one model of 457 triangles and no
collision.

**The ground names the stage.** A collision's trailing records, which a
triangle's top seven bits index (see "The Starflight Express in flight"),
hold in their first halfword three five-bit digits, and `func_0204bd7c` reads
them as **30000 + 100a + 10b + c** — the sky's own decoder, `func_0204bef4`,
reads the same digits from 20000. The field's encounter code in overlay 17
(its calls at `0x021b76ac`, `0x021b7750`, `0x021b7840`) takes the record
under the encounter and hands it to the battle request, whose `+0x02` it is
(`func_ov017_021b848c`, `strh` at `0x021b865c`; the request is made with
30116 there, `func_020a3578`).

| collision | its records, as stages (triangles) |
|---|---|
| `F01A0000`, Angel Falls Region | 30116 "F01 - Field" (714), 30117 "F01 - Forest" (112) |
| `F03A0000`, Zere Region | 30105 Field (301), 30106 Forest (24), 30107 Barley Field (1), 30108 Poison Swamp (21) |
| `F02A0000`, Western Stornway | 30103 (698), 30112 Forest (37), 30113 Field (115) |
| `D01A0100`–`0400`, the Hexagon | 30214 "D01 - Inside" |
| `D01A05E2`, Hexagoon's piece | 30215 "D01 - Hexagoon" |

**A stage the map list does not have is 30116.** Overlay 0, switching to the
stage (`0x021668e4` on), looks the id up in the map list (`func_02099950`)
and puts 30116 in its place when it is not there or is 30000, the record of
nothing — so Western Stornway's 30103, which the list has no entry for, is
fought on Angel Falls' field.

**A set battle names its own**, INFERRED: `eventbattle.bin`'s `+0x28` (see
"Event battles"). Overlay 0 takes the request's `+0x20` over `+0x02` when
`+0x20` is not 0 and the request's `+0x0c` is not negative
(`0x021668c8`–`0x021668dc`); that the set battle's stage is what fills
`+0x20` is not read.

**A stage's kind of ground** is the map list's value 18 (0 field, 1 forest, 2
coast, 3 wilderness, 4 flowers, 5 barley, 6 pampas, 7 swamp, 8 the `B02` on),
which the game keeps in its entry's byte `+0x0e` and turns into a bit
(`func_02099a68`, 8 giving none). Overlay 17 asks it of the ground under a
field object (`func_ov017_021a26e8`); what for is not read. The kinds are
INFERRED from the stages' labels.

The stage's pieces: `B01M1600` the ground and its backdrop, `B01M1601`, and
`L1`–`L4` and `N1`–`N4`, the day's and the night's — the sky, two layers of
fog and a backdrop — told apart by their names' last letter and digit as a
field's lighting sets are (`lightingOf` in `@minstrel/world`). The fog's
polygons are see-through, alpha 11 and 14 of 31 (see nitro-gfx's FORMAT.md,
"A material's polygon alpha").

### Who stands where on the stage

Read from overlay 0, 29 September 2026. **The fight is centred on the stage's
own origin**: the stage's `.bmbl` places its ground model at (0, 0, 0)
(`B01M16`, `B02M14`, `B02M15` looked at), and every place below is built
about x 0, z 0. Every fighter's height is `0xcc`, 0.05, from the templates;
nothing is read that puts them on the ground, and the stage has no
collision to put them on. **The party is on +z facing π, the monsters on −z
facing 0** — toward each other.

The set-up (`func_ov000_02164d74`, from `0x02164f08`) fills two formations
for everyone and then puts them all on the second:

- **The grid** (`func_ov000_0216f74c`): slot s is column s mod 9, row s div
  9, at x = 2.598 × column − 10.392, plus 1.299 on an odd row, and z = 2.25 ×
  row − 9 — a staggered 9 by 9, computed in floats (`0x462646e1`,
  `0xc72646e1`, `0x45a646e1`). By how many there are, the slots are the
  tables at `0x02183108` (the party) and `0x02183118` (the monsters):

  | how many | party slots | places (x, z) | monster slots | places (x, z) |
  |---|---|---|---|---|
  | 1 | 58 | (0, 4.5) | 22 | (0, −4.5) |
  | 2 | 57, 59 | (±2.598, 4.5) | 21, 23 | (±2.598, −4.5) |
  | 3 | 48, 58, 50 | (−1.299, 2.25), (0, 4.5), (3.897, 2.25) | 29, 22, 32 | (−3.897, −2.25), (0, −4.5), (3.897, −2.25) |
  | 4 | 56, 66, 67, 60 | (−5.196, 4.5), (−1.299, 6.75), (1.299, 6.75), (5.196, 4.5) | 20, 12, 13, 24 | (−5.196, −4.5), (−1.299, −6.75), (1.299, −6.75), (5.196, −4.5) |
  | 5 to 8 | — | — | 28 11 22 14 33; 20 11 12 13 14 24; 20 11 12 22 13 14 24; 19 10 11 12 13 14 15 25 | by the same sum |

  The party's three is lopsided as read — 48 and 50 are not mirror images.
  A fighter's own slot, once it has one, is taken over the table's.
- **The row**: the party at z +2.5, 1.5 apart and centred, x = (n − 1) × 0.75
  − 1.5i, turned in by the table at `0x02183158` (π ± 0.2 at the ends); the
  monsters at z −2.5, facing 0, side by side by their widths — each its
  radius (monster data `+0x0C`) × 4, × 0.7 for monsters `0xbd`–`0xbf`,
  `0x110` and `0x155` in company — with a gap of 0.7, or less to keep the row
  within 4 + 0.1(n − 1), down to 0.1 (`func_ov000_02167b5c`).

Everyone starts on the grid (`0x02167dd8`); `0x02167e6c`, called from
overlays 4, 25 and 26, moves them to the row — from an action's script, and
the scripts ask for it only in calling for help and some special attacks
(see "The action scripts"), so an ordinary battle stays on the grid. Fighters change slot during a fight (`func_02048cf0`, from overlays
23 and 25). A fighter's two places are kept in its battle record at object
`+0x13c` (`+0x04`/`+0x0c` the row's x and z, `+0x10`/`+0x18` the grid's,
`+0x1c` the slot); its drawn place is the object's `+0x44`.

Around the fight: the party's field places are kept (`func_ov000_021643d4`)
and put back after (`0x02168d08`); the other roamers in the fight — the
list the encounter keeps — are each moved toward the one touched until they
stand the mean of their radii plus 1 from it, and turned to face it
(`0x02164600`–`0x02164710`).

### The battle camera

Read from overlay 0, 29 September 2026. **The camera is the code's, not a
file's.** The camera object keeps an eye (`+0x04`), a look-at (`+0x10`), a
field of view (`+0x58`), an orbit — yaw `+0x70`, height `+0x74`, distance
`+0x78`, the eye being the look-at plus (0, h, √(d² − h²)) turned by the yaw
— a roll, and a frame (`+0xf0`) that eye and look-at pass through when its
flag is set (`0x0202e0a4`). A battle resets it to a field of view of 15, a
half-angle: 30° (`func_ov000_0216d370`).

- **Framing a side** (`func_ov000_0216d600`): no frame; the eye at (0, h,
  ±d) looking at (0, h, 0), on the stage's z axis — the sign by which side.
  d is the larger of width × cos 15° ÷ (sin 15° × 2.2) and depth × cos 15° ÷
  (sin 15° × 1.5), less 2.5, and at least 6.5; h is half the depth, at least
  1.2, the eye at most 2. A wide variant sets a half-angle of 22 (44°) and
  the same sums by 22°, at least 3. The extents are the formation's: the
  party row's width (n − 1) × 1.5 + 1 and depth 1.5; the monster row's width
  and its tallest monster's height + 0.5.
- **The opening** (`func_ov000_0216118c`): the wide side shot, with side 1,
  eased in by 0.95 a frame (INFERRED: what reads the 0.95 is not). Which side
  1 is, is not read.
- **Shots on the fighters**, each in a frame on a fighter (`0x0216d234`): a
  close-up on one (look-at 1 up, height 3, distance 8, the yaw one of eight
  at 22.5° + 45°k drawn at random, closing by 20/4096 a frame); a two-shot
  from the midpoint of two (height 1, distance 8, the yaw 0 or π ± 17.2°); a
  group orbit fitted to the farthest member; over the shoulder; an actor's
  close-up fitted to its height.
- **An action chooses its shots**, from its script (below): the camera
  command, `func_ov025_021e3c80`, by the mode at `+8`:

  | mode | shot |
  |---|---|
  | 0 | the side shot on the monsters, 30° |
  | 1 | a close-up on the actor (`0x0216d90c`) |
  | 2 | a two-shot |
  | 3, 11 | the group orbit |
  | 4 | over the shoulder |
  | 5, 13 | the actor close-up (`0x0216df00`) on the actor |
  | 6, 14 | the same on the target |
  | 7 | `0x0216e250`, on up to `+9` targets |
  | 8, 9 | the side shot on the actor's side, or the target's |
  | 10 | **a freeze**: the frame dropped with the camera left where it is on screen, its spin, drift and chase stopped (`0x0216d370(cam, 0, 0, 0)`) — **not** a reset to 15: the field of view, the roll and `127`'s turn stay. Corrected 1 October 2026 |
  | 12 | everyone hidden, the target made visible, then its actor close-up (a 0, b 1.8) |
  | 15 | the opening's: side 1, wide |

- **The actor close-up** (`func_ov000_0216df00`), a cut: a frame on the
  fighter along its own facing, so the eye is in front of it. L = max(h/2, 1);
  the distance 1.8h + 4 for a monster and `b`·h + 4 for a party member, at
  least (L + 0.5)·cot of the half-angle; the look-at (0, L − `a`, 0), `a` only
  for a party member; the orbit's height max(L − 1.5, 0), its yaw 0; pulling
  in 20/4096 a tick, never nearer than 3 (`0x0216d464`). A monster adds a
  value from its object's `+0x18e`, not read. `a` and `b` are the command's
  floats — `default.bact`'s sections give 0.21 and 1.1 — and each one struck
  in turn gets a close-up with 0 and 1.8 (`ov025 0x021dcf14`, from a list the
  action player fills).
- **The close-up on one object** (`func_ov000_0216d90c`), a cut: look-at
  (0, 1, 1), height 3, distance 8, the yaw one of eight at 22.5° + 45°k,
  drawn; kept to the four in front when the other fighter is shorter.
- **After every command and every frame** (`func_ov000_0216f2b8`): the eye
  no further than 17 out and no higher than 5.
- **The victory's shot** (`func_ov000_0216e3c4`, called only from overlay 23's
  experience step, `0x021f04b8` — **corrected 1 October 2026**: it was taken
  for the camera while a command is chosen, overlay 23 for the battle menu's;
  overlay 23 is the results, states 9 and 10), a cut: the party's places
  averaged, height and all; the distance 12 less how far that is from the
  stage's middle, and when that is under 8 the middle drawn in by it over 8
  and the distance 12; the look-at that middle 0.5 up, the orbit 1 up; turning
  `0xe`/4096 a frame for as long as it is up. **Its yaw is −0x999, −0.6 rad,
  always**: the code takes the angle to the monsters' middle (`FX_Atan2Idx`,
  ±0x8000), divides it by 0xffff as a whole number, which leaves 0, shifts
  that up 12 and adds −0x999. The camera while a command is chosen is
  overlay 26's — see "The way into a battle, and out".
- **While commands are chosen** (overlay 26, state 7; read 1 October 2026):
  each round, sub-state 3 (`0x021d8fd0`) cuts to the opening's wide shot
  (`func_ov000_0216118c(battle, 1)` → `0216d600(cam, 1, wide, …)`, half-angle
  22) — eased in on round 0 only — and nothing moves the camera after: no shot
  on the one choosing, none on a target, no orbit. **The party is hidden and
  the monsters shown** (who 38 and 39, `0x021d9018`–`0x021d9034`), each
  monster turned at once to face (0, 0, the eye's z) (`func_ov026_021daec8`),
  their idles staggered from round 1. For 47 kinds of monster a table in
  overlay 26 (`0x021de87c`, `func_ov026_021d8aac`) replaces the eye and
  look-at with fixed ones — not read here.
- **An action begins** (`ov025 func_021db8d8`): unless its script opens on a
  camera of its own — a `12` other than mode 10 before any `61` or `7`, or a
  `34` — everyone is made visible, put on the grid, and **the chase shot is
  always taken** (`0x0216e678`), cut to at once and followed (`0x0216ea38`).
  **Corrected 1 October 2026**: it is not "perhaps", nor "never on the first
  action". The draw decides only its start pose — forced on a round's first
  action (`0x021dbb2c`), else on the fifth without one or a draw of one in 5
  less those passed. Its pose: the look-at on the actor's side or the
  target's — the one at least 2.0 tall against one that is not, else the
  draw's parity — carried toward the other by half the gap, at most 2, at
  three quarters of that one's height **capped at 1.0**; the yaw along the
  line ±162° (+180° on the target's side), whichever is nearer the yaw it had;
  on a draw under 30 height 1 and distance the larger of 1.6 times the gap and
  7, else by the pair's indices mod 3 — distance 10, 12, 14, height 1, 1.75,
  2.25 (`0x02183268`, `0x02183298`); a target taller than 2.5 looked at half
  its height, at least 2.5, at least 8 away, its orbit height the start
  pose's −1.2 to −2.0; the roll by the indices mod 5 (`0x0218325c`). It
  follows each update: the look-at 5% of the way, the yaw 5%, height and
  distance 2%, the roll 10%, each within a cap that grows a tick. The
  half-angle goes back to 15. **An action ends** with the camera left where
  it is (`0x021dcbf4`).
- The battle's states (the jump table at `0x021607d4` counts from 0): 0
  load, 1 set-up, 4 leave, 6 the field back, 7 overlay 26's command phase, 8
  overlay 25's action loop, 9 the victory and 10 the wipe-out (overlay 23's),
  11 a flight (overlay 26's), 17–19 the round's working-out; 16 is the
  table's default and runs nothing (corrected 1 October 2026). Overlays 22 to
  30 share one address, so one of 23, 25 and 26 is in at a time.

### The command phase — overlay 0's menu, overlay 26's round

Read 2 October 2026 (USA), and played by `apps/game/src/battle-commands.ts`.
Overlay 0's `func_ov000_021735d0` runs the menu every frame of state 7 from
two stacks of menu states, the party's and each member's (`0x448`-byte
records at ui `+0x958`, ui = battle `+0x3760`); a member's state `100` is
done.

- **Each round** (state 7, sub-state 3): the monster targets rebuilt —
  the living, group by group, slot by slot — each member's record reset, and
  **the party menu opened** (`func_ov000_02174c14`): one column, **Fight,
  Examine, Flee, Misc.**, the words `strstd` 23, 24, 25, 22 (not `str_btl`
  30000–30003). Each member's lists are built then (`func_ov026_021dc8fc`).
- **Fight** asks the members in the party's order. A member is asked when
  present, standing, not paralysed, asleep or "Inactive" (status `0x8`,
  `0x10`, `0x80000`; `func_ov000_021719f8`), and **following orders**: the
  character's tactic, `+0x94c`, at 5 (`0x0217f748`). None to ask: the phase
  ends at once. **Flee** is the party's: every asked member's record becomes
  done with command 6 (`func_ov000_02180394`).
- **A member's commands**: six, **two columns by three rows**, drawn row by
  row from `data_ov000_021834f8` = {0, 3, 1, 4, 2, 5} — Attack and
  Abilities, Spells and Items, Defend and Coup de Grâce — each `str_btl`
  30004 + its number. Defend is done at once; Attack asks a monster unless
  one is left; the Coup de Grâce is greyed and does nothing until its
  combatant's `+0x138 → +0x3b` bit 3 is set; a member with no spells,
  abilities or items is told so (30023 with 30021 or 30022; 30024).
- **The Spells and Abilities lists**, built each round: the actions of the
  **skill panels held** (char `+0x8ec`), placed by the panel's value 7
  (`battleOrder`), then **the vocation's spells** in `spelltable`'s order up
  to the member's level in it; each kept only where its action's `+0x08`
  bits 10–11 have bit 1 set, and put by `+0x18` bits 12–15 into Spells (2)
  or Abilities (1). Four rows a page, names only; the cost is in a box beside
  (`strstd` 1004). Short of MP: 30020 "Not enough MP!", as it is chosen; an
  ability of `+0x2c` kind 6 costs gold (34).
- **Items** are the member's own carried items (char `+0x454`), then what
  they wear — not the bag.
- **Whom** (`func_ov000_02171210`), by the action's side (`+0x08` bits 8–9:
  1 the monsters, 2 the party) and reach: all — done; a group — done with one
  group, else a monster; one monster — done with one, else the choice, which
  walks the living monsters one by one, the group's line ("<name> × n",
  30031) highlighted; oneself, or all the party — done; one ally — the party
  in order, the member themselves left out for reach 8. A fallen ally is
  refused, but for a revival (kind 18), and Zing, Kazing and the Zing stick
  take either.
- **B**: in a member's commands, the member before is asked again, their
  choice discarded; on the first, the party menu (`func_ov000_0217f78c`).
  **No confirming**: the last choice ends the phase; the flight is then tried
  (`func_ov026_021dd3dc` → `func_ov000_0215f7a8`), and one that fails costs
  the party its round (`func_ov000_02169850` `0x02169978`; `0x0215dabc`).
- **Tactics** (Misc. → Tactics, Misc. being 30010 Tactics, 30011 Equipment,
  30012 Line-Up): any member but the player's own, or "Whole Party" (`strstd`
  26), to one of `str_btl` 30014 + 0–5 — Show No Mercy, Fight Wisely, Mix It
  Up, Focus On Healing, Don't Use MP, **Follow Orders**, the default
  (`func_02082828`). A member not following orders hands in the Attack, which
  the AI replaces when their turn comes (`func_ov024_021f9030`,
  `021f8f20`); the AI is not read.
- **The hand-off** (`func_ov000_02169850`, before `ProcessCombatTurn`):
  each member's action, target and group into their object's `+0x19c`.
  **Targets are resolved when the action runs** (`func_ov000_021540fc`): a
  fallen monster gives way to a living one of its group, or of another; a
  fallen ally to the actor.

### The command phase's screens

Read 2 October 2026 (USA), and drawn by `apps/game/src/battle-screen.ts`. The
battle swaps the screens (POWCNT1 bit 15, set at `0x02164dec`), so the 3D
view and **the target markers** are on the top screen and **everything of the
command phase on the bottom**, the sub engine (`func_ov000_021729ac` builds
it, `func_ov000_02173954` draws it every frame).

- **The art**: `data/ani/bg_btl3.pac` — the parchment backdrop `bg_bt.bnsc`,
  the panels `bg_bt_large` (32×9 tiles) and `bg_bt_small` (30×5), the target
  line, the "Lv" by language, the window's three tiles; the panels in BG
  palette **2 + the member's party place** (blue, green, red, orange).
  `data/ani/obj_bt3.gp2/obj_bt3_<LG>.pac`, 40 cells: the hand (0–5), "OK!"
  (6), the digits (7–16), the HP and MP bars (17, 18), the status icons
  (21–31). The markers are `bt_cursor.spr` and `bt_cursor_oth.spr` in
  `btarc.nsarc`.
- **The panels** stand down the bottom screen in party order from y 0 when
  one is large, else 32: **the member choosing has the large one, 72 px, and
  their menu in it**; everyone else 40 (`func_ov000_02174b14`,
  `02175258`). The places on each (`func_ov000_02170538`, `0x02173b9c`…,
  `data_ov000_021833c8`…): the name at (37, 11) or (40, 8); HP and MP ending
  at (55, 28) and (55, 44), or (106, 1) and (106, 15); the bars at (13, 40)
  and (13, 56), or (72, 13) and (72, 27), the value over the most times 1.52,
  or 1.28, of the 32-px sprite (`func_ov000_021741e0`). A small panel's art
  is laid a tile in, its places still from x 0.
- **"HP"/"MP" by what is left** (`func_ov000_02170c7c`, `021750e4`): the
  panel palette's entry 10 white, yellow at a quarter, orange at 8 %, red at
  none (`data_ov000_021833a0`).
- **A small panel's box** says, first found: a status (`str_btl` 4 Dead, 2
  Paralysed, 3 Asleep, 38 Inactive), a tactic other than Follow Orders,
  what was chosen, or 30030 "Waiting...". "OK!" stands at x 224 once a
  command is chosen.
- **The menus** stand in the large panel's coloured part, at tile (9, 1) of
  it (`func_ov000_02176634`); the monster window one line a group, "<name> ×
  n" (30031, the count at `<X=118>`). The hand stands 8 px left of the line it
  points at and 2 above (`0x021755ac`). Choosing sounds 1; no sound was found
  for moving or going back.
- **The markers** (`func_ov026_021dddcc`): over each monster a member has
  aimed at, at its place raised by its height — the chooser's `bt_cursor`,
  bobbing, the rest `bt_cursor_oth`, spread 10 px apart.
- **During the actions** the panels stay; the acting member's border pulses
  yellow and grey, and one hit flashes orange and shakes 2 px (setters not
  found).

### The way into a battle, and out

Read 1 October 2026 (USA release). Times are in the game's ticks and frames,
taken at 60 a second — the tick source is not read.

**In.** A roamer touched makes the encounter's task (overlay 17
`func_ov017_02196430` → `021b6f18`), which makes the battle request and puts
the transition's task ahead of itself; the field runs only its first task, so
the encounter waits for it. **The battle's track cuts in at once**:
`func_0209c480`, track 23 (`0x17`) — or a set battle's record's `+0x24`,
which settles that field — the field's music cut for a roamer, faded over 10
for a set battle. A set battle's stage, its record's `+0x28`, is the request's
`+0x20`. Then **the swirl** (`func_0204700c`, once a frame): the field's
camera's roll −8° a tick and its field of view, set to a 15° half-angle as it
begins, narrowed by 0.4333° a tick; the model `data/effect/ev999991500.chr`
played in front of it (polygon ID `0x3d`, at (0, −10, 1) — how that is placed
is not read); past the 15th tick both screens to black over 20 frames
(`SetMainBrightness`/`SetSubBrightness(−16, 20)`); done past the 35th. A set
battle from a trigger record's `120` waits 15 frames first; event function
547 brings its own model. **The load** is black — state 0 sets
`SetBrightness(−16, 0)` each frame. **Up**: the opening's camera starts
(`func_ov000_0216118c`, the eased wide shot), and the next frame both screens
come up over 15 frames (`SetBrightness(0, 15)`, overlay 26 `0x021d9d18`)
while the opening's line goes up (`func_ov026_021dd8a8`, `strbtl` 6, 7, 8 or
9 by the monsters' kinds). **The line closes itself**: it ends
`<TIME=45><CLOSE>` (`<TIME=30>` after a surprise's second sentence), and no
key is read. When the monsters play `appear` is **not read** — no code in
overlay 0 or 26 names it.

**Out.** As the last action ends (overlay 25, `0x021db3c4`–`0x021db430`), the
battle's `+0x8e14` says which: 2 no one of the party standing → **state 10, the
wipe-out**; 1 → **state 9, the victory**; else the next round's commands. No
hold.

- **The victory** (overlay 23, 17 steps from `data_ov023_021fe148`): the
  camera frozen where the last action left it (`0216d370(cam, 0, 0, 1)`), the
  battle's tune stopped at once, the field monster hidden; the first line
  ("… defeated", `str_bres` 1 or 50) with the fanfare **`ME_005`** (sequence
  54, `func_0209c6d8` at `0x021ef464`). Then the experience step: the
  victory's shot, everyone back on the grid, the living idle — **no victory
  pose** — and "receives some experience!" (25, or 26 for several). Each level
  gained: its line, **`ME_004`** (53), "attributes improve!", spells, skill
  points. Then gold, treasure. **Every line waits for a key** — A, B, X, L, R,
  the pad or a touch — and nothing times out; the last step waits for the
  jingle to end.
- **A wipe-out** (state 10): the tune fading (`func_0209c678(snd, 30)`), the
  last frame held 1000 ms, the camera frozen; "… wiped out!" (20) with
  **`ME_009`** (58); a key, the jingle cut, and out.
- **A flight** is no action: overlay 26 settles it as the commands are taken
  (`func_ov000_0215f7a8`), and state 11 puts up a `strbtl` line with sound 9,
  **closing itself 30 frames after**; the field monster is hidden. No
  `escape`, no music change.
- **Leaving** (state 4): both screens to black over 15 frames
  (`SetBrightness(−16, 15)`, `0x02168768`), the battle freed. State 6 puts the
  party back where it stood, the light to 1 at once, and the sounds back to
  `se_norm.sdat`. **The field brings its own screen up** over 30 frames
  (`SetMainBrightness(0, 30)`, overlay 17 `0x021b7f3c`), starts its tune again
  (`func_0209c530`), and sets the party's `+0xc3` to 150 (`0x021b7bd4`;
  INFERRED a count before another encounter).


### The action scripts — `.bact`

Read from overlays 0 and 25 on 29 September and, opcode by opcode, on 1
October 2026 (USA release; overlay addresses are the same in the European
one). `readActionScript` reads them; `apps/game/src/action-player.ts` plays
them.

**How one is read.** A `.bact` is a data table the game runs once through the
decomp's `Script` (`func_ov000_0216d1c4`). Each record's tag picks a builder
from overlay 0's table at `0x02183b5c` (139 `{tag, builder}` pairs), and the
builder turns the values into a command of the same number, appended to the
section being filled (`func_ov000_02169b78`). `1 k…` opens a section keyed by
action numbers — **a key of 1 brings 2 and 219 with it** (`0x02169bf0`) — and
`16` opens one keyed exactly {1, 2, 219}, the blow files' opening
(`0x0216a438`). **`2` and `17` build nothing**: a section runs on to the next
`1` or `16`, and a command with no section open is built and dropped
(`0x02169b88`). **Values a record lacks are stale, not zero**: `Script` fills
only as many parameters as the record has (`ExecuteSingleInstruction`,
`src/Resource/Script.cpp`), so a bare `10` or `26` reads the record before
it.

**Which script an action plays** (`func_ov025_021dbe10`, then
`021dc694` once a file is in), in order:

1. the fighter's own file, its first section keyed by the action's number —
   a party member's `chara_mp.gp2/<set>b.chr/<set>.bact`, a story companion's
   `chara_sub/s%03db.chr`, a monster's `.mon`; read when the battle loads;
2. for action 1 by the same fighter on the same target as the action before,
   the **second** section keyed 1, when there is one (`func_ov025_021dfa9c`;
   INFERRED a double attack's second swing);
3. in battles 800 and 801, the Hero's: `default.bact`'s section 221;
4. otherwise **the action's own file**: the action's record (`actdt`) `+0x18`
   bits 12–15 pick the archive — 2 `data/skill/actspl.nsarc`; 1 or 4 with a
   party actor `actskl.nsarc`; else `actetc.nsarc` — and the file is
   **`sp%03d.bact`, the action's own number** (`+0x04` bits 0–11). **Its first
   section plays whatever its keys.** Kind 34 (`+0x18` bits 5–11) plays
   `func_ov025_021d8a40` instead of a script (not read);
5. failing that, `data/bin/actdef.nsarc/default.bact`'s section keyed by the
   number — **344** for an action of kind 12 — read once a battle.

`data/bin/defaultaction.bact` is named nowhere in the code read.

**How one is played** (`func_ov025_021e9778`, once a frame). Nothing starts
before the action's message file is in (`actmsg`, `+0x839`), nor while a
hold at `+0x5ce` runs (not read what sets it). Then commands play one at a
time: kind k by the word at `0x021ef538 + 4k`, as `player(cmd, action,
battle+0xb30, state)`. **A player returning 0 is not done** — the run stops
for this frame and plays it again next; **−1 is done but ends the frame**
(only `31`); anything else is done and the next plays at once. So one command
at a time, as many a frame as finish at once; what a command starts — a
motion, a move, an effect, a camera move — carries on by itself. While a skip
is open only `10` is played, `11` included in what is passed over; `11` ends
the run, as does the section running out. **Waits are in effective
milliseconds** — the real time since the last frame, at most 50, times the
game's speed (`GameState::CalculateDeltaTime`) — so the hit-stop slows every
`8`. **The action ends** when the run is over and the message box's line is
down (`func_ov025_021e9528`; see `128`); the tidy-up (`func_ov025_021e9558`)
frees every effect resource from 100 up and every instance of it, so nothing
a script spawns outlives its action.

**Who a command acts on.** Many take a number the battle resolves to objects
(`func_ov000_021820bc`, the table at `0x0218409c`, 58 entries). Objects:
the party 0–3, the monsters `0xc0`–`0xc7`, the effects `0xd0`–`0xdf`, a party
member's parts `id×12 + 0x13…`, object 200 (`0xc8`).

| who | what |
|---|---|
| 0, 1 | the actor's side, the first target's side |
| 2, 3 | the side facing the actor, facing the first target |
| 4 | everyone: the party present, then the monsters |
| **7**–14 | **the one acting**, then actors 1–7 |
| **15**–22 | **the first one acted on**, then targets 1–7 |
| 23, 24 | all who act, all acted on |
| 25 | nothing to the resolver; `3` and `26` take it as **the camera's animated object** |
| 26–33 | **effect slots 0–7**, filled by `21` |
| 34–37 | actor k's part `id×12 + 0x1c` — INFERRED **its weapon** (`91 34 28 "weapon"`, `22 34 0`) |
| 38, 39 | the party present, the monsters present |
| 40 | object 200 |
| 50, 52 | target 0's, target 1's receiver: the last of its slots, at most the third |
| 51 | the targets walked by result code (6, 7, 8 count further slots); the whole party if any is one |
| 5, 6, 25, 41–49, 57 | nothing |

**The commands.** "Instant" is a player returning 1. Fractions written as
ints are thousandths. Builders are overlay 0's, players overlay 25's.

| tag | what | builder · player | waits |
|---|---|---|---|
| 3 | `[who] "name" [flags] [fx]` play a motion at speed 1 from its start (`MaybeSetRegularAnimation`; flags 1 once and held — the default — 0 loop, 8 restart, 0x10 blend). **The integer is who, never a motion.** A fighter not idle, dying or dead is made idle; `magic` falls back to `magic1`, then `magic_in`. Unless fx bit 1 (or the action is 1, 2 or 219) the scene dims, `LightingManager::BeginFade(0.6, 300)`, once; a magic motion plays sound 100 or 102 unless fx bit 0, dims to 0.3 over 1000 ms and starts the actor's `"1"` cast effect. `3 25 "name"` plays the animated camera's motion | `0x02169d08` · `0x021e2980` | no |
| 5 | `from to gap` **the lunge**: the actor's motion timed at 16.666 ms a frame; a straight move to `gap` edge to edge from the target over `from`–`to`, after the delay to `from`, and a turn along the line in at most 250 ms, queued (`func_ov025_021eee48`, run by `021eedb0`: linear, no easing); the target turns to face it | `0x02169e80` · `0x021e2ca4` | no |
| 6 | two fractions, kept; its player does nothing | `0x02169fa4` · `0x021e2f4c` | no |
| 7 | every target's reaction with the defaults: `61` then `62` | `0x0216a018` · `0x021e3048` | no |
| 8 | `ms [hold]` wait; `hold` ≠ 0 also keeps `ms` at battle `+0x6fd0` | `0x0216a1a4` · `0x021e30e8` | yes |
| 9, 10 | `9 id type v…` skip to `10 id` when the condition holds; one skip at a time (below) | `0x0216a208`, `0x0216a300` · `0x021e3178`, `0x021e3c3c` | no |
| 11 | the end | `0x0216a350` · the run itself | — |
| 12 | `mode [variant] [f0 f1 f2]` **a shot, cut to** — "The battle camera"; modes 5 and 6 take f2 = 1.8 unless given | `0x0216a364` · `0x021e3c80` | no |
| 18, 29 | queue a file under `data/` (`.pac` read as `.chr`), or an effect by number; 8 tracked | `0x0216a4c8`, `0x0216ab74` · `0x021e40e4`, `0x021e4a08` | no |
| 19 | wait for the queued files | `0x0216a55c` · `0x021e413c` | yes |
| 20, 30 | register a loaded file, by path or number, as effect `id` (−1 the next from 100); a file not yet in registers nothing | `0x0216a570`, `0x0216abc4` · `0x021e4168`, `0x021e4a58` | no |
| 21 | `id slot "motion" [flags] [overlay]` **play an effect on the one acting** — below | `0x0216a68c` · `0x021e41a0` | no |
| 22 | `who show` show or hide (`func_ov000_021626a0`, `MakeVisible`/`MakeHidden`); who 5 and 6 first set everyone the other way, then act on the actor's side, the target's | `0x0216a8d8` · `0x021e4450` | no |
| 24 | the actor turns to face the first target | `0x0216a948` · `0x021e45c4` | no |
| 25 | `n speed` fly effect n + 100 from the actor, half its height up, at the target; done within the mean of their heights | `0x0216a95c` · `0x021e4624` | yes |
| 26 | `[who] [point]` wait for a motion to be so far through (normalized time, `Object3D +0x24`); to the end when no point — then a looping idle (`stand`, `stand_battle`, `guard`, `sleep`, `slip`, `smile`, `dance`, `tenchi`) is taken as done. **Never in the frame a `3` started a motion** (`0x021ef9a4` bit 2) | `0x0216a9dc` · `0x021e4868` | yes |
| 27 | a sound from the battle's own archive (INFERRED) | `0x0216aad4` · `0x021e49e0` | no |
| 31 | done for this frame | `0x0216ac68` · `0x021e4a88` | one frame |
| 33 | `who "pack"` add a loaded pack's motions; the one playing carries on | `0x0216ac90` · `0x021e4aac` | no |
| 34, 35, 39 | an animated camera from a model's `eye` and `lookat` bones, made the game's camera; back to the battle camera, the framing kept; the camera follows a fighter | `0x0216ad0c`, `0x0216ad7c`, `0x0216adcc` · `0x021e4be4`, `0x021e4e10`, `0x021e4f00` | no |
| 36, 37 | push and pop a memory level | `0x0216ad90`, `0x0216ada4` | no |
| 40, 41 | remove a slot's effect; attach it to someone (255 detaches) | `0x0216ae1c`, `0x0216ae70` · `0x021e4fc8`, `0x021e5014` | no |
| 42 | `who mode …` place someone or something: 0 the stage's middle; 1/2 the actor's/target's side (0, 0, ±2.5) facing in; 5/6 the other side; 3 a vector turned by the camera's yaw; 4/11 in front of the target by its half-radius (11 raised by half its height, held between 0.4 and 1.15); 7 on another; 8 by the eye; 9 a place; 10 the actor, half its height up | `0x0216aed0` · `0x021e514c` | no |
| 43 | scale: 0 the free-standing 0.065 (`0x10a`), 2 by the camera's distance, 3 a value; as read only the first object | `0x0216b088` · `0x021e56e8` | no |
| 44, 45 | the screen's brightness, −16 to 16, over ms; wait for it | `0x0216b110`, `0x0216b16c` · `0x021e58b4`, `0x021e58d4` | 45 |
| 47 | `who alpha ms` fade (`TransitionInheritedAlpha`) — Flee's `47 7 0 500` | `0x0216b204` · `0x021e59b4` | no |
| 48–50 | the camera's eye, look-at, orbit: set, scaled by the target's height (mode 2), or added | `0x0216b26c`… · `0x021e5a2c`… | no |
| 55 | the hit's own effect, battle sound and own sound — "The reaction" | `0x0216b564` · `0x021e5f54` | no |
| 58 | lets the camera be reset each frame while set (what sets the bits it watches, not read) | `0x0216b754` · `0x021e6030` | no |
| 59 | attach one effect to another's bone | `0x0216b7b8` · `0x021e509c` | no |
| 60 | those called for appear: `appear`, and the monsters turn to the camera | `0x0216b870` · `0x021e604c` | no |
| 61–72 | the reaction record — below | | 67 |
| 73–75, 94 | a second body for a thrown weapon, object 200: load it (waits), load its pack (waits), show it striking and hide the weapon in hand; free it | `0x0216bbc4`… | 73, 74 |
| 76 | end a palette effect | `0x0216bc00` · `0x021e697c` | no |
| 77 | `gap` **the step in** — below | `0x0216bc54` · `0x021e6a08` | yes |
| 78 | `1`: a close-up (a 0, b 1.8) on each one before its reaction | `0x0216bcac` · `0x021e6cd4` | no |
| 79 | `mode [who] [face]` **the formation**, everyone placed at once: 0 to the rows, 1 to the grid (no script), 2 actor and target on a line through the stage's middle, 6 plus their mean radius apart, 3 a group to its grid places squeezed to fit 4 wide | `0x0216bcf0` · `0x021e6cf4` | no |
| 85 | wait for the caster: the party's motion 70% through, a monster's at its end | `0x0216be58` · `0x021e6f44` | yes |
| 86–89 | ease the camera's orbit, roll, look-at, eye (accelerating, then braking onto it) | `0x0216be6c`… · `0x021e6ff8`… | no |
| 91, 92 | attach to another's bone; detach | `0x0216c144`, `0x0216c1ec` | no |
| 96 | dim the lights to a level over ms | `0x0216c314` · `0x021e74f4` | no |
| 106 | hide (0) or show (1) the stage | `0x0216c584` · `0x021e7fdc` | no |
| 112, 128 | how long the line on show stays; how long new lines stay (750 ms unless set) | `0x0216c734`, `0x0216cec0` | no |
| 113 | shake the camera, falling linearly to nothing | `0x0216c7a0` · `0x021e8100` | no |
| 115 | scale a slot's effect to a fighter once it is there | `0x0216c85c` · `0x021e8148` | yes |
| 116 | **the hit-stop** `speed ms after`, in real time | `0x0216c8e4` · `0x021e821c` | no |
| 123 | the field of view's half-angle; every shot but `12 10` resets it to 15 | `0x0216cd28` · `0x021e8510` | no |
| 127 | turn the eye about the look-at, a step a tick | `0x0216ce5c` · `0x021e8584` | no |
| 129 | the action's start sound now: 7 for the party, 8 for a monster | `0x0216cf04` · `0x021e85c8` | no |
| 140 | set a facing, in degrees, at once | `0x0216d110` · `0x021e87f4` | no |

Read and nothing to show, or used by a handful of scripts and not yet played:
80 (an int and a float kept, read by nothing found), 90, 98–101, 103, 105,
107, 109, 110, 111, 114, 119–122, 124–126, 130–139, 141, 142.

**The skip's conditions** (`9 id type v`, `func_ov025_021e3178`):

| type | skip when | uses |
|---|---|---|
| 0, none, > 23 | always — a goto | 4,765 |
| 1–4 | the gap `<`, **`>`**, `≤`, `≥` v: the mean place of all who act to that of all acted on, less each side's mean half-radius | 518, all type 2 at 2.0 |
| 5 | one actor, one target, the same object | 1 |
| 7 | any target has result code 2–5 | 671 |
| 8 | any actor has any results of its own | 2,949 |
| 10 | any target has result code 3 | 660 |
| 11 | target 0 has code 6, 7 or 8 | 1,646 |
| 15 | the script has moved the camera (`+0x6fd5`) | 0 |
| 6, 9, 12–14, 16–23 | by the action's number or the results' flag bits | ≤ 26 each |

**Corrected 1 October 2026: type 2 skips when the gap is *more* than its
bound** (`0x021e33b8`: `cmp gap, v; ble` past the skip). So a blow from the
grid does not step in: the Hero's `mp0200.bact` —

```
9 3 2 2f       more than 2 apart → on to 10 3
77 0.75f         (near: step in)
10 3
9 2 2 2f       more than 2 apart → on to 10 2
3 7 "attack1b"   (near: the close swing …
26 7 0.5f         … to half way)
9 1            (near: on to 10 1)
10 2
3 7 "attack1a" (from apart: the running blow,
5 60 330 0.25f   its lunge from 6% to 33% to 0.25 apart,
26 7 60 / 70 40 / 26 7 0.61f   landing at 61%)
10 1
```

— **from apart, `attack1a`'s lunge covers the whole way**; the step in and
`attack1b` are for one already within 2. The slime's `z000a.bact` has the
same shape, `attack0a` its near swing. (Earlier this file had both the wrong
way round.)

**The step in** (`77`): a pass at a time, a quarter of the way toward `gap`
plus the two radii's mean short of the target, at most 0.2 a pass, running
(mode 1, `run` blended); on the pass a step is 0.2 or less the actor goes
idle and the command is done — so it stops up to 0.6 short. The target is
turned to face it; the actor is not.

**An effect** (`21`, the effect manager at ARM9 `0x021079ec`): one of 16
instances, game objects `0xd0`–`0xdf`; with all 16 in use none is spawned.
Every `21` on the cartridge is `21 id slot "motion" [flags] [overlay]`: the
effect registered as `id`, **attached to the one acting** at its feet,
following its place, facing and scale every frame (`func_02057ab8`), playing
its `.bcfg` motion of that name — **once, then gone** (flags 1, the default),
or looping (0) until `40` or the action's end. Its handle goes into slot
`slot − 26`, which the scripts name as 26 + slot. With `overlay` it is
unattached, at half scale, drawn in a later pass with its own projection.
`41 X 255` then `42 X …` detaches and places it — 319 of the 366 times a `21`
is followed by a `41`. An effect archive holding a `.beff` is a particle
effect (98 on the cartridge); the rest are models.

**The reaction.** `61` opens a record, the tags between fill it, `62`
submits it as one entry per fighter with something to show into a queue of
12 (`func_ov025_021ecc54`), and **`67` waits** until the queue is empty, no
target is dying and no effect is playing. The queue plays one entry at a
time, after the script each frame (`func_ov025_021ebb90`): the effect at
`64`'s time, the sound (`71`, from `69`'s archive) at `72`'s, the results
from `65`'s time, **each result waiting until its line is no longer up**; an
entry stays `63`'s hold before the next may start, never after the last.
`93`'s bit 1 skips the actor's own results and bit 2 the targets', so a plain
hit or a spell is `93 1` or `93 5`; 0x10 and 0x20 queue the targets for a
two-part showing (INFERRED: a counter-attack, then its blow landing). `66`
names the effect on the one struck, raised by half its height with `68 1`,
scaled (`117`) and offset (`118`); `109` and `110` replace it and its sound
when a result carries flag 3.

**What is shown on the one struck** (`func_ov025_021d8c30`, a result at a
time) is decided by **the result's own flag bits**, not by the script: damage
(flag 1) — **the fighter drawn untextured for a moment** (one frame for a
monster; a 100 timer on a party member and its parts), `damage` (flags 9), a
sound from `se_btl.sdat`'s archive 101 (`55`'s, 30 unless set; 31 on a party
member), **the hit effect — `55`'s, id 1 unless set — on its surface facing
the one acting**, and the number (kind 0, or 1 with flag 42); recovery (37,
or 34 for MP) the green numbers; tension (35 or 7) the pink, worth 5, 20, 50
or 100; `guard` (6), the dodge `sake` (5), fleeing (36: `escape`, alpha to 0
over 500 ms, sound 9), revival (3), and a death (flag 1 with 2, or 13). The
names of the flags are INFERRED from what is shown for them.

**A death**: object state 4, which plays `death`; when it ends, state 6 —
and a monster then fades to alpha 0 over 500 ms, effect 2 at its shadow and
sound 50 (`func_02048690`). For a target also the lights to 0.5 over 300 ms,
a hit-stop (0.1, 600, 150), effect 27 and sound 66. (The 300 ms fade at `ov025
0x021ddbc0` is a different sequence, for fighters gathered by slot codes 6–8.)

**Sound.** Every number is a sequence in a sequence archive of
`data/sound/se_btl.sdat`, which a battle mounts as 101 (`ov000 0x02164028`):
the presenter's from the base archive 101, `70`'s and `71`'s from the
archive `69` names — or a monster actor's own, set as its action starts. The
Hero's are `70 40` on the swing and **`70 85` on the hit**.

## The battle's numbers — `btarc.nsarc`

Read from the game's code, 29 September 2026 (ARM9 `0x02039f04` on;
`battle-numbers.ts`). **Five kinds**, each ten 8×16 digits and a 32×32 frame
behind them (the table at `0x020e7844`, loaded by `func_02039f04`):

| kind | digits | frame | colours |
|---|---|---|---|
| 0 damage | `damage_num.spr` | `damage_waku.spr` | orange on a yellow burst |
| 1 MP damage, INFERRED | `damage_m_num.spr` | `damage_m_waku.spr` | blue on an orange burst |
| 2 recovery | `recovery_num.spr` | `recovery_waku.spr` | green on a green cloud |
| 3 MP recovery, INFERRED | `recovery_m_num.spr` | `recovery_m_waku.spr` | blue on a pale cloud |
| 4 tension | `tension_num.spr` | `tension_waku.spr` | pink on a violet star |

- **Spawned** (`func_0203a48c`, into a ring of 16) by the hit's presentation
  (overlay 25, `0x021da790` for damage, `0x021da880` for recovery) at the
  fighter's place raised by its height — the reaction record, at 61% of a
  blow. A later hit on the same fighter takes the offsets (0, −16, 16, 0, −16,
  16) and (0, 8, 16, 24, 32, 40) px (`0x021eeea4`, `0x021eeebc`). 0 shows
  none; there is no "miss" sheet.
- **Each frame** (`func_02039fec`): the frame's spring — scale += speed;
  speed += (1 − scale)/2; speed ×0.8, truncated; from 1.2 and 0.2 — and the
  timer, from 37, freed at 0. At 34 it is nudged clear of the others (below).
- **The nudge** (`func_0203a5e8`), in screen pixels against every number
  already showing, tension never against tension: tried in order (0, 0),
  (24, −4), (0, 0), (24, −24), (0, 20), (24, 16), (0, −20), (24, −44) … until
  none is nearer than 8 across and 14 up or down (heights kept to 36–196);
  after sixteen, 80 down untried.
- **Drawn** (`func_0203a0b4`) at the point projected to the screen, moved by
  its offset and 20 up, kept 16 px in from the edges: hidden while the timer
  is 35 or more; alpha 31, then 7 × (timer − 5) over its last four; the
  digits 8 px apart and centred, each popping in 3 frames after the one to its
  left, swelling by (0.5, 1, 1, 1, 0.5) (`0x020e7830`); the frame behind,
  centred, at its spring's scale.

## A blow's swing trail and hit-stop

Read from overlays 0 and 25, 29 September 2026. **Corrected 1 October 2026:
a plain hit does put an effect on the one struck** — the presenter's own,
`55`'s, id 1 unless a script names another (`0x021da884`), on its surface
facing the one striking — besides any the reaction record names (tag `66`,
`0x021e62a8`), which only some monsters' blows do. **Each weapon's set plays its own
trail on the one striking** as the blow's motion begins: tag `29` loads an
effect by number, `30` gives it an id, `21` plays it (`0x021e4a08`,
`0x021e4a58`, `0x021e41a0`) — the swords' `eb0500`, the spears' `eb0600`. An
effect's number is its file: the millions pick `em`, `et`, `eb`, `b` or `z`,
the rest the number (`ov025 0x021e278c`, `0x021ef520`); `eb0500.chr` holds a
model, its joint, material and texture animations and a `.bcfg` (`"0"`,
frames 1 to 15 at 0.25). Tag `21` hands it the actor's object (INFERRED: tied
to them).

**Each fighter's own script says its blow** — the lunge, its gap and when it
lands differ: the Hero's lunges from 6% to 33% to 0.25 apart and lands at
61%; the slime's `z000a.bact` from 12% to 40.7%, to 0.3, landing at 58%; Ivor's
`s017b.bact` from 0 to 55%, to 0.75, at 60%. And **a monster's blow from apart
is `attack1a`**, as a party member's is (537 of the scripts); `attack0a` is
the one it swings when already within 2 — corrected 1 October 2026, see "The
action scripts". Tag `18` only preloads a file; tag
`20 id "path"` names an effect by path as `30` does by number (`0x021e4168`).
A reaction's effect on the one struck is `66 id`, raised by half their height
when `68 1` (`0x021e6304`, `0x021de380`–`0x021de3e0`): three monster scripts'
plain blows have one, `z069000.chr`. 564 of the 602 monster scripts play
their own trail with `21`; of the story companions only Ivor
(`chara_sub/s017b.chr/s017b.bact`, his own `effect/s017000.chr`) and Aquila
(`s019f.bact`, the swords' `eb0500`) have a script.

**The hit-stop**, tag `116` (`func_ov000_02163440`): `116 0.1 200 100`, just
before the reaction, is 100 ms on, then the game's speed at 0.1 for 200 ms
(`ov000 0x021609bc`–`0x02160a60`, `GameState::SetGameSpeed`). Tag `70` is a
sound (`0x021e6340`): 40 on the swing, **85** on the hit, from `se_btl.sdat`.
**Corrected 1 October 2026: the one struck flashes** — drawn untextured for a
moment (`SetNoTextureTimer(2)` on a monster, `0x021da408`; the party's parts
by `func_02054028(obj, 100)`); the earlier search had looked for a colour.

## A party trick's files

Read 4 October 2026 (USA code; the European files).

- **`/data/chara/sg<nn><m|w>.chr`**, 64 of them, `sg00` to `sg31` in each sex:
  a pack of one `.bcfg` and its `.nsbca`s, no model. `<nn>` is the trick's
  number, the sex letter `"mw"[sex]` (`func_0205308c`). **What plays is what
  the `.bcfg` names** — `sigusa` once, or `in`, `loop`, `out` — not which
  `.nsbca`s are there: `sg11w.chr` holds a `sigusa.nsbca` its table does not
  name. The motions are on the player's 14-bone rig (`mp0200`'s), animated on
  bones 2 to 13. `sg00`'s table names `sigusa` with no such motion: nothing.
- **`/data/bin/menu/str_sgs.gp2`** › `str_sgs_<lang>.nat`: the tricks' names by
  number, 0 `------`, the same as `str_tm` 4509 + n.
- **`/data/ani/sg.gp2`**: the bubbles, one-frame sprites — `sg12`, `sg13`,
  `sg14` in each language (`_en`, 48 × 24; `sg14_it` 56 × 24), `sg15` and
  `sg16` (24 × 24) and `sg30` (16 × 16) once.

## How fast a motion plays — the `.bcfg` speed

Read from the decomp, 29 September 2026. **A motion's speed is its own**,
the fourth value of its `.bcfg` record (`readMotionTable`, `Motion.speed`;
`BCFGScript_Opcode_66`, `src/Resource/BCFG.cpp`, stores it ×4096). Each frame
the game's clock gives animation a delta of 1 for every 17 ms that passed
(`GameState::CalculateDeltaTime`: `4096 × ms / 17`), and an object's motion
advances by speed × delta × its own playback speed — 1 unless something sets
it — through its frames less one, looping or held at its end
(`Object3D::AdvanceAnimations_v1`). So time, not frames drawn, sets the pace.

| the swords' set, `mp0201` | frames | speed | once through |
|---|---|---|---|
| `attack1a` (`be`) | 19 | 0.25 | 72 × 17 ms, 1.22 s |
| `stand` (`f`, `n`) | 9 | 0.1 | 80 × 17 ms, 1.36 s |
| `run` (`f`, `n`) | 13 | 0.4 | 30 × 17 ms, 0.51 s |
| `damage` (`b`) | 9 | 0.2 | 40 × 17 ms, 0.68 s |

A set's packs disagree about a name — `stand` is 0.1 in `f` and `n`, 0.3 in
`n2` — so the packs a battle loads are taken first (`f`, `b`, then the blow's,
the item's, the spell's). A monster's and a story companion's own `.bcfg`
name theirs.

## Where a weapon is carried — `wpnpos.bin`

`/data/bin/wpnpos.bin`, read 29 September 2026: a data table the game runs as
a script (`func_02099f6c`), its one handler for tag `100` (`0x02099ef4`)
filling a table of `0x1c`-byte entries at `0x02109a54`. `readWeaponPlaces`
reads it. A record:

| value | what |
|---|---|
| 0 | the kind of weapon, 0 to 11 — the entry's index |
| 1 | the first placement's bone slot |
| 2–4 | its offset, `fx16` |
| 5–7 | its turn about x, y and z, radians |
| 8 | the second placement's bone slot |
| 9–11, 12–14 | its offset and turn |

**A bone slot** names one of seven bones a character looks up by name when it
is made (`func_02053e10`, into its `+0x1a0` on): 0 `head`, 1 `waist`, 2
`chest`, 3 `arm1L`, 4 `arm1R`, 5 `leg1L`, 6 `leg1R`.

**How it is hung** (`func_ov017_021917f0`): the weapon's object is attached
to the slot's bone, its position set to the offset (`func_020407b4`) and its
rotation to the turn (`func_0203db34`); drawn attached, its transform is
composed onto the bone's — translate, then turn about z, y and x
(`Object3D::Draw` with `COMPOSE_TRANSFORM`, `SendTransformToFifo`).

| kind | first | second |
|---|---|---|
| 0, 1, 3, 5, 8, 9 | `chest`, a turn of its own | `arm1R` at (−2.4, −0.4, 0) |
| 2, 7, 10 | `chest` at (2.3, 1, 2.3), turned (6.23, 2.62, 4.88) | `arm1R` at (−2.4, −0.4, 0) |
| 4 | `chest`, nothing | `chest`, nothing |
| 6 | `arm1R`, nothing | `arm1R`, nothing |
| 11 | `chest` at (0, 0, −3) | `arm1L` at (2.4, 0, 0) |

**What a piece adds to a coup de grâce's chance** is word 4, bits 20 to 26,
of its stats entry (`ItemStats.coupBonus`) — read 4 October 2026 (USA):
`func_02085038` sums this field over the eleven places worn, reading the
item def's `+0x04`, which is this word, and the battle's resolver adds the
sum to the vocation's own term before a member's draw after acting
(`func_ov024_021eb5d0`, `0x021ed298`–`0x021ed3c8`). **Observed** on the
European tables: 3 on the combat action medal (18051), 6, 7, 8 and 10 on the
critical, overcritical, hypercritical and dire critical fans (20120–20123),
and 0 on every other piece.

**The motion set a weapon gives** is word 4, bits 12 to 19, of its stats
entry in `itemdt_w` (`ItemStats.motionSet`): the second number of the packs
`mp%02d%02d` its wielder moves by (`func_02072c9c`, `sprintf` at
`0x02072d48`; 0 with no weapon), the body's the first. It is one value a kind
— 1 the swords, 6 the spears, 4 the knives, 5 the wands, 10 the whips, 11
the staves, 12 the claws, 13 the fans, 7 the axes, 3 the hammers, 8 the
boomerangs, 9 the bows — 2 on every body piece and 0 on the rest: `mp0200`
is bare-handed, and the Hero with the copper sword moves by `mp0201`.

**INFERRED**: that the first is the back and the second the hands — the
second names a forearm on eleven, the first the chest on eleven; and that the
kind is the item's subtype, `itemsort`'s 0 to 11 — the weapon kinds the
equipment screen's icons count, and 11, the one held in the left hand, the
bow, 6 the claws, worn on the hand. What the game reads the kind from is its
character's `+0x29c`, bits 4 to 8, not traced to the item. The shield is not
in the file.

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
| 1 | the monster's level, INFERRED: excluding the 149 bosses (value 2 is 0 on all of them and no other), its rank agrees with maximum HP's at 0.84 and experience's at 0.88 over 280 monsters — slime 1, dracky 3, spirit 5, skeleton 12 |
| 2 | the margin by which the party's level must pass value 1 before the monster runs, INFERRED: −99 on the metal family (whose value 1 is −99: they run at once), 99 on 185 (never), 5 to 22 on most of the rest; 1 and 5 on the slime, 7 and 12 on the she-slime |
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
| `+0x10`, bit `0x2000` | tension works on it and is spent by it — 1 October 2026 | read in the decomp: `func_ov024_021e6a90` multiplies by the dealer's tension under it (`0x021e6b9c`) and `func_ov024_021eb5d0` spends tension after an action carrying it (`0x021ed48c`). On 223 of 681: the Attack, Frizz, Heal; not Defend nor Psyche Up |
| `+0x2C`, bit 27 | its blows chain into a combo — 1 October 2026 | read in the decomp: the chain counter `func_ov024_021ea584` counts only such an action's blows and resets for any other; the damage's combo table is under it (`0x021e7a8c`). On 112: the Attack, Frizz, Crack, Zam, Double-Edged Slash; not Heal |
| `+0x08`, the low byte | its cost in MP, INFERRED | Heal 2, Midheal 4, Moreheal 8, Frizz 2, Crack 3, Zam 4, Kamikazee 1; 0 on the 488 actions that are no spell — the attack, the items, the monsters' moves — and 255 on four, Magic Burst and Kerplunk among them, the spells that spend all a caster has. 128 on two, not established |
| `+0x20`, bits 10–19 | how it opens, INFERRED: a message in `actmsg` said first, 0 for none — 16 September 2026 | 1 `attacks` on the attack; 45 `flees` on fleeing; 46 `casts <ACTION>` on 83 spells; 70 `uses <INDEF_ART_SGL_I_NAME>` on the herbs and 46 named items; 15 `does the <ACTION>!` on the dances; and on the monsters' unnamed moves their own lines — 394 `sends rubble raining down` on the hexagoon's 546, seen in a let's play, 286 `spews forth a cloud of sand`, 350 `is just fluffing around`, 55 `calls for backup`. 669 of the 681 index one of the 591 messages |
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

**Read from the game's code on 20 September 2026, and all four borne out.**
`GetAttackBaseDamage` (overlay 24, USA `0x021e7bc0`) is handed a range and
reads: the spread as **ten bits, word 0 bits 8–17** (the byte at `+0x01` and
two more above it — no range on the cartridge uses them); bits 0–9 of word 1
for **a monster**; bits 10–19 and 20–29 as **one of the party's least and
most**, between which the amount runs as the user's magical might or mending
runs between two numbers in the *action's* record (see the actions' table
below), or between which it is *drawn* when the action names no number. The
reference's slopes are these: Midheal's 0.2392 is (300 − 85) / (999 − 100).

**The medicinal herb** is action 255, range `0x31`: 35 ± 5, peak 35 — it
restores 30 to 40 HP whoever uses it. Strong medicine is range `0x32`, 50 ± 10.
An item names its action in its item table — see "Items".

**Three fields read from the code that reads them** (20 September 2026) —
`docs/conformance.md`, "The resolver of a blow", has the disassembly:

| at | type | meaning | evidence |
|---|---|---|---|
| `+0x08` bit 29 | flag | **always a critical**: the battle's critical roll hands back 1 without a draw | 18 of 681; one is named `Critical Claim` |
| `+0x10` bit 5 | flag | **can be dodged**: the evasion roll makes no draw without it | the plain Attack has it; the herb and fleeing do not. 156 of 681 |
| `+0x10` bit 6 | flag | **can be blocked** | 162 of 681 |
| `+0x14` bits 21–27 | `u7` | the critical chance's multiplier, in hundredths | 100 on the plain Attack |
| `+0x14` bits 28–31 | `u4` | **how the battle brings its line up** (`lineKind`): 2 or 5 sends the action loop to state 6 (`func_ov025_021dc220` through `func_ov000_021627fc`), its line up once the chase shot has settled; any other to state 3, its line up with its script's first camera. Read 6 October 2026; `docs/readings/T15-presentation.md` | 5 on the Attack's two records alone; 2 on 189, the heals, Zing and the herbs that take one ally; 1 on 238, 3 on 162, 4 on 58, 6 the five Fources, 7 on 15, 8 on 7, 0 on 5. INFERRED: what the values other than 2 and 5 mean |
| `+0x10` bit 3 | flag | **spoilt by a status on the attacker**: the accuracy roll's die of eight misses on five faces. INFERRED: dazzle | 110 of 681, every one a blow that can be dodged |
| `+0x18` bits 16–17 | `u2` | how the accuracy is come by: at 1 it scales | 202 of 681; not the plain Attack |
| `+0x14` bits 7–13, 14–20 | `u7` ×2 | a scaling action's least and most accuracy, in a hundred | |
| `+0x18` bits 18–26 | `u9` | which of the battle's 67 damage handlers its damage goes through; 0 is none | 570 of 681 on 0, the plain Attack among them; Dragon Slash alone on 1; Thunder Thrust and Hatchet Man sharing 45 |
| `+0x18` bits 5–11 | `u7` | its **kind**. The final-damage function (`func_ov024_021e6a90`, `0x021e7a68`) tests it for 1 and halves only that; the other numbers' meanings are INFERRED from who carries them | 242 of 681 are 1 — Attack, Frizz, Dragon Slash; Defend is 0; Heal and the medicinal herb are 2; 93 numbers in use |
| `+0x1C` low 14 bits | `u14` | the most it can deal; 0 is no limit. Taken after the damage is a whole number | 211 of 681: Frizz 999, Frizzle 1999, Kafrizz 2999, and Heal's three the same; none on the plain Attack |
| `+0x10` bit 24 | flag | **works on a metal body**: without it a blow that comes to nothing on one gets no 0-or-1 | 208 of 681: Attack and the blade skills have it, every attacking spell lacks it |
| `+0x0C`, `+0x0E` | `u16` ×2 | **the targeting handlers a monster's AI takes for it** in modes 1 and 2 — 3 October 2026; an index from `0xA1`, or 0, is the first. `Action.aiTargets` | `func_ov024_021f66cc`, the table at `0x021ff790`. Attack 0 and 1; Heal 11 and 11; Frizz 7 and 2; Buff 18 and 19; Kasap 24 and 25; Snooze 42 and 43; Psyche Up 96; Flee 112 |
| `+0x18` bits 16–17 at 2 | | its **amount scales** by a number of the user's — the same two bits as the accuracy's, read by `GetAttackBaseDamage` for one of the party. Means something only with a range: the plain Attack has the 2 and none | Frizz, Crack, Heal |
| `+0x10` bits 14, 15 | flags | the number it scales by: **magical might**, **magical mending** | 14 on the attacking spells, 15 on the heals |
| `+0x04` bits 12–21, 22–31 | `u10` ×2 | the number at which the amount leaves its least, and at which it reaches its most | Frizz 50 and 999; Crackle 100 and 999; Heal 50 and 999 |
| `+0x14` bits 0–6 | `u7` | **a monster's chance with it**, in a hundred: its accuracy where the accuracy scales — which is the whole of whether a change of state lands — and its rider's chance | Kasap 75, Deceleratle 75, Sweet Breath 25: the reference's three, found in play. Snooze 37, Kasnooze 50 |
| `+0x18` bits 0–4 | `u5` | **what rides on its blow**: a slot of 22 (`func_ov024_021e4b14`), 0 none. 2 lowers attack and 8 defence, from their handlers; 4 poison, 7 sleep, 11 paralysis, 20 death INFERRED from who carries them | Toxic Dagger 4 at 50; Helm Splitter 8 at 75; **action 275, the reference's poison attack, 4 at 12** |
| `+0x30`, `+0x32` | `s16` ×2 | the levels it moves, and its rider's; held to two either way | Buff 1, Sap −1, Oomph 2, Blunt −2; and tension's steps — 1 on Psyche Up and Egg On, 2 on 330, 3 and 4 on 0x151 and 0x152, which go straight to theirs (`func_ov024_021dc93c`, 1 October 2026) |

These are not INFERRED from values: each is what a named function tests before
it acts. The runtime record the battle reads is laid out as the file's is.

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
| 104 : n on an entry record | sets flag *n* as its event plays | of the 49 entry records that play an event, **7** set a flag themselves and **every one** holds only while that flag is unset — so it plays once — while only one of their events has a record of its own, not setting it. The village's at 2.1 plays the Guardian statue scene, `ev22590`, and sets flag 0 | yes |
| 86 : 0 | holds when the Hero has no companion with them | all 7 in Angel Falls have argument 0, and each sits before a character's first-time event, giving the label that follows it instead. Ivor speaks in every one of those events (2222, 2230, 2240, 2250, 2430, 2440, 2450). An earlier guess, day or night, fails: only 2 of 13 across the cartridge have a twin record | yes |
| 102, 2, 3 | a second set of flags, "marks": 102 sets one, 2 holds if it is set, 3 if not | of the 57 sets, **31** sit in a record that also tests 3 of the same mark — the first time a character is talked to — and 24 of those have a partner record for the same character, map and span testing 2 of it: Hugo's `3:7 119:2430 102:7`, then `2:7 118:8 193:0`. Tests (280 and 298) far outnumber sets, so something else sets marks too. An earlier measure, 145 of 566, counted every test against any set | yes |
| 35 : n | holds only at step *n* of the stage | of the 128 records testing it, **94** name a step some event in the same file moves the story to at that stage, against **20** for the step three on. The Hexagon's switch, `201`: nothing at steps 1 to 3, `ev02530` at 4 — "There's a noise of something moving somewhere!" — its after-line at 5 | yes |
| 120 : n | starts set battle *n* — see "Event battles" | all **40** arguments are indices there; **65 of the 66** records carrying one have a value 5 = 15 record in the same map naming the same *n* | yes |
| 205 : n on an event's own record | brings the attending character at place *n* of `attnpc` (from 0) into the party | the three events whose own text says who joins carry that one's place: `ev02210`, "Ivor joins the party", `205:1`; `ev04080`, Dr Phlegming, `205:2`; `ev28991`, Sterling, `205:3`. 6 event records carry it, all with 1 to 3. On a character's record (31) not read | yes |
| 204 : 1 on an event's own record | sends whoever goes along away | all **6** event records carrying it have 1, in Ivor's stretch, Dr Phlegming's and Sterling's alike, so the 1 does not name who. Ivor's two, `ev22591` and `ev02400`, are where a let's play shows him go — on ahead to the landslide, home with his father — and he joins again at the landslide, `ev02350`, `205:1`. On a character's record (35) not read; nor is `203`, on two entry records (the pass's `203:1`, the mayor's `203:0`) and 71 characters' | yes |
| 16 : n on a talk record with a label and an event | the event plays once the label's line is read, and only on the prompt's answer *n*, from 0 — Yes | in Angel Falls, the pass and the Hexagon, 7 of the 9 such records carrying it have a line that asks (one more is the inn's welcome, one has no line found), against 3 of the 17 without. The Hexagon's switch, `6:201 11:194 16:0 119:2530`, asks "Press the button?"; a let's play answering No is told the Hero decides not to, and nothing moves. A talk record's event is read out after its label's line, not instead of it — the let's play reads the inscription, "Path ahead sealed…", before `ev02500` | yes |
| value 5 = 15, opening with 12 : n | once set battle *n* is won: plays the event, sets the flags | 46 of the 47 open with 12. The Hexagon's `12:2 119:2550` plays Patty's thanks | yes |
| value 5 = 16, opening with 12 : n | once it is lost | all 33 open with 12; INFERRED as the other outcome — the Hexagon's `12:2 104:4 197:10` sets the flag under which Patty offers the fight again | yes |
| value 5 = 20, with 143 : n and six floats | defines area *n*: a box, its greater corner and then its lesser, x y z, in the units placements use, and then **its angle in degrees** about the vertical — read from the game's code, see "Areas" below | all **108** area words have six floats, and the first three are at or above the last three on every axis on **108 of 108**; the boxes sampled lie inside their maps | yes |
| value 5 = 2, with 7 : n | walking into area *n* plays the record's event | **102 of the 110** name an area a trigger defines in their map; the rest are the map's own, in its link table — see "Areas" below. The mayor's house at 2.1, `7:15 5:1 119:2120`, plays his scene with Ivor, whose record sets flag 1 | yes |
| 133 on a talk record, with 177 : n | once the line is read, goes on to that map and event — when the prompt's answer *n*, from 0, was given | thin: two records carry 177 beside a 133. Erinn's at 2.1, `6:98 11:193 16:0 177:0 1:0 133:1110 2130:0`, goes on to the morning; her line's first answer, Yes, is dinner, and a let's play answers it and wakes to the morning. `1 : 0` is not read | yes |
| 17 : n | — | never paired with anything that sets or tests it | no |

The flags are read as the stage's own: cleared when the story moves on to
another stage. INFERRED — the tests find their setter in the same stage.
**Confirmed from the game's code**, with a correction for marks — see below.

## Quests — read from the game's code, 28 September 2026

**A quest's state** is a nibble, 204 of them (`func_0206e120` refuses `0xcc`
and on), at the trigger object's `+0x2cc`: two bits of state — **0** not on
offer, **1** on offer, **2** taken, **3** cleared — then a first flag (bit 2,
`func_0206e260`; set with state 1 by `func_0206e218`) and a second (bit 3,
`func_0206e2a0`/`func_0206e2dc`), which only the online service sets: **the
quest has been delivered**. Overlay 23, whose strings are the DQVC shop's
auction, an encryption key and `quest_btl_%d.stb`, sets it for a list of
quests (`0x021f5a74`); overlay 17 copies every quest's from another console
(`0x021c3bc8`).

**`questorder3.bin`**, a data table: a tag-`0x66` record a quest, **who
offers it** — read from its loader (`func_02094d88`), run as a script's
opcode over the file each time a map loads (`func_02095578`, with the map
and the story's major and minor):

| value | meaning |
|---|---|
| 0 | the quest |
| 1 | the map. The loader keeps only the map's own, and on any of the Quester's Rest's floors, 50101 to 50405, those for 50101 |
| 2 | the character who offers it, the node's `+4` byte |
| 3, 4 | the major and minor stage it is offered from: kept only once 100 × major + minor has reached them |
| 5 | bit 9 — not established: the offer passes a record without it to a guest in a session. 171 of 184 |
| 6 | a quest that must be cleared first, or −1 |
| 7, 8, 9, 10 | bits 11, 10, 12, 13. **Bit 10 is "offered only once delivered"**: 64 quests — quest 2 and most of 122 to 202, the game's downloaded ones, the Quester's Rest's 174 to 193 among them. 11, 12, 13 are not established |
| 11 on | conditions, as trigger words, parsed by the trigger parser itself (`func_0205ec70`) |

Its first record, quest 0, has six values and names map 1: a placeholder,
INFERRED, and left out. 184 givers, one a quest.

**The offer** (`func_02095924`) is the talk's: talking to someone runs it
over the map's givers before their records and lines are asked (ov017
`0x021a4d40`), and discards what it returns. For each giver of the one talked
to, in order: one wanting delivery that is not is passed; one whose conditions
hold (`func_02064704`, the one talked to in the context) and whose quest is at
0 or 1 puts it at 1, and that ends it; one taken or cleared is passed; one
whose conditions do not hold takes its quest back to 0 unless it is taken or
cleared. Lines and records then read the states it left.

**The quest log** (the object `func_02094d6c` returns): a count at `+0`, eight
at most, and 16-byte entries from `+4`, each a quest in its low nine bits and
a progress of 0 to 7 in bits 11 to 13.

| action | what |
|---|---|
| `125 : q` | **accept**: into the log (`func_020961b0`, refused when it holds eight) and taken (`func_020962f4`). The first quest ever taken also sets bit `0x119d` and starts a task, not read |
| `127 : q` | **clear**: the clock's date and time packed into the log's `+0x178` + 4q, then `func_02095cfc` — cleared (`func_0206e100`), and out of the log |
| `129 : q` | on offer (`func_0206e164`, 1) |
| `130 : q`, `131 : q` | set, clear the flag the value's high half names, by its number (`func_0206eb64`); q is for a session's other players |
| `144 : q` | a taken quest's progress, the value's high half |
| `176`, `190`, `191` | a taken quest's own numbers: a bit, a random value, one of a table of 14 — not built |

| condition | holds when |
|---|---|
| `20 : q`, `21 : q`, `22 : q` | the quest is taken, has its first flag, is cleared (`0x0205ff84`; a guest in a session cannot use quests from 174) |
| 53 to 61 | a character, and a quest by the first value's halves — the quest and a mode (`func_0206474c`): −1 and 5 at 0, 0 taken, 1 the first flag, 2 cleared, 3 on offer. Then: 53 a label and an answer, 54 an item held (`18`), 56 `36`, **57 and 58 the flag the third half names set and clear, and players**, **59 and 60 the flag set and clear**, 61 players |

**`questidtbl.bin`**: tag-`0x68` records, a quest and its number in
`questmsg` — internal 3 is `questmsg`'s 2, "Pleased as Punch", which
`ev50030` clears with `127:3` and whose clear text says it teaches Pirouette.

**`questmsg_<lang>.bin`** (`questmsg.gp2`): tag-`0x67` records, a quest's
number and twelve string offsets: its name, then — INFERRED from reading
them — as offered, eight by the quest's progress, once cleared, and a hint
before it is found. "The Puff-Puff Performance"'s second by progress says
the goods are got and to go for the reward. `questcancel.bin` is not read.

## The Starflight Express in flight — read from the game's code, 29 September 2026

**The sky is a map of its own**: O01, 10100, "Field - Sky" — the whole world,
drawn small, in two archives, `O01a` and `O01b`, both named by its link table
(`O01.bmbl`: `O01M00T1`, `O01a`, `O01b`) and every piece placed at the origin.
Its collision, `O01A0000.col2` in `O01b`, is kind 3: **each triangle's top
seven bits index a trailing record** (799 triangles, every top byte even,
halved 0 to 56, all 57 records used — INFERRED from that, the vehicle's code
taking the index from the query `func_02017d90`), and a record is a region:
its field map packed as three five-bit digits, 20000 + 100a + 10b + c
(`func_0204bef4`), and **whether the Express may land**, bits 5 to 9 of the
second halfword (`func_0204bedc`). 56 regions, 20001 to 20063, and one all
zero, the sea. The vehicle keeps the record under it at `+0x114`, cast down
from its height each frame (ov017 `func_ov017_02193dc4`).

**The map list's values 14 and 15** place maps in the world: integers on the
field regions — the region's place, in the maps' own units (see
`MapEntry.world`) — and floats on towns and dungeons — **the map's place in
the sky** (`MapEntry.sky`). The sky holds the world at a sixth: taking off
from a field region, the Express starts at (the Hero's place + the region's)
÷ 6 (`func_020acecc`, `0x6000`); from a town, at the town's sky place; landing,
the Hero is put at the sky's place × 6 − the region's (`0x020acf40`), at the
nearest of the region's landing places (category-11 objects, not read).

**The vehicle** (US ARM9 `0x020ac020`–`0x020ae4c8`; `func_020ad61c` each
frame, only in 10100): a fixed height 10 (`0xa000`); the +Control Pad held
turns it toward one of eight directions against the camera's turn (table
`0x020e9118`: up π, down 0, left 3π/2, right π/2, the diagonals between) by at
most `0xcc` radians × 4096 a frame; it moves `0x1eb` − `0x28` a tick
(INFERRED that it never coasts to a stop); the sky wraps past x ±144 by 288
and z ±112 by 224; two carriages follow 0.9 behind each (`func_020adda4`). Its
models are `chara_sub/s203.chr` and `s204.chr`, and `s203s`/`s204s` their
shadows, at a scale of 192 of 4096 (`func_020aca88`).

**A** asks "Disembark here?" (`str_ark` 36): yes descends (0.1 a frame for
16 frames) and lands in the region below; where it may not, "It's not
possible to disembark here. Head for the Realm of the Almighty?" (38), and
yes climbs and plays `ev29510`, the Realm's arrival. **B** asks "Switch to the
view inside the Starflight Express?" (35): yes goes aboard, map 6401 at
(3.5, 0.6, −3.5). Both from ov017 `func_ov017_021a7378`.

**Sterling's whistle** (item 22256, `0x56f0`) is its own case in the field
item code (ov002 `func_ov002_02157634`, by the item): in a field region or
one of 19 towns (`0x020e6ea8`) it summons the Express — an effect, waits, a
fade (ov017 `func_ov017_021a6c2c`) — and the sky map follows; elsewhere its
lines say it cannot reach (`str_ark` 13, 14, INFERRED from the messages
0x7530 on). It is given at 19.1 by `114:22256`, on the record for winning set
battle 27.

**`114 : i` and `115 : i`** give and take an item — both queued (queue cases
`0x0206fcc0`, `0x0206fd74`); which is which is INFERRED from the items: `114`
carries the fygg, the party popper, the whistle; `115` the Drunken Dragon and
the Gittish seal handed back.

## Triggers, read from the game's code — 28 September 2026

Addresses are the US release's ARM9 (`YDQE`), from the decompilation's
extract. Nothing below is copied into the repository. The functions are
logged for the decomp in `docs/decomp-contributions.md`, "Read since".

**The file is a script.** `func_0206461c` builds the name with
`data/scenario/trigger%s.bin` (`0x020f05dc`) from the area's three letters,
with the second blanked for an `F` area. It loads the file and runs it as a
`Script`, through `func_02064574`, with the opcode table at `0x020f05bc`:
tags `0x64` and `0x65` do nothing, and **tag 1 is the record**
(`func_0205f9cc`).

**A record is kept only for the current map and the current stage.**
`func_0205f9cc` reads value 0 and drops the record unless it is the map
being entered. It reads values 1–4 as a span and keeps the record only if
`from ≤ now ≤ to`, each taken as `major × 1000 + minor`, where `now` is one
stage read from `GameState` at `+0x5cb0` (major) and `+0x5cb4` (minor). That
confirms the span reading above, and that a record is for its own map. The
kept record is `u16` map, `u8` from-major, to-major, from-minor, to-minor,
`u8` value 5, then its words.

**The story is five threads, and the map decides which is live.** The
trigger object (`0x02108844`, returned by `func_0205ec34`) opens with five
records of `0x1c` bytes, one per thread, and holds the live thread's index
at `+0x332`:

| offset | size | what | written by | cleared when |
|---|---|---|---|---|
| `+0x00` | `u8` | stage, major | `132`, and `GameState`'s setters | — |
| `+0x01` | `u8` | stage, minor | as above | — |
| `+0x02` | `u8` | step | as above | — |
| `+0x03` | 32 bits | **marks**: `102` sets, `103` clears | `func_0206df6c` | the major changes |
| `+0x08` | 64 bits | not established | — | the major changes |
| `+0x10` | 32 bits | **flags**: `104` sets, `105` clears | `func_0206df6c` | the major or minor changes |
| `+0x14` | 64 bits | not established | — | the major or minor changes |

`func_02064b98(object, map)` picks the live thread from the map's id, then
copies that thread's stage, minor and step into `GameState` through the three
setters (`func_02010774`, `func_020107a8`, `func_020107dc`). Each setter also
writes its value back into the live thread's record.

| thread | maps | the chapter `214` starts it at |
|---|---|---|
| 1 | 4200–4202, 9000–9008: Alltrades Abbey, the Tower of Trades | 6.1 |
| 2 | 1700–1706, 1800–1808, 6000–6001, 7700–7709: Zere Rocks, Dourbridge, the Lonely Plains, the Heights of Loneliness | 8.1 |
| 3 | 200–219, 7802–7809: Gleeba, the Plumbed Depths | 11.1 |
| 4 | 2100–2109, 8301–8303: Swinedimples Academy and its Old School | 12.1 |
| 0 | every other map | 7.1 |

**`214 : n` sets thread n's stage**, followed by three words of operation 0
as `132` is. `ev25524` on the Starflight Express at 5.2 starts all five, and
the table above is the check: each thread's maps are where that chapter's
records are. **`132` sets the live thread's stage.** Both queue their record
(`func_0206445c`) instead of writing the stage on the spot. `func_02064b24`
runs a record's actions with a fresh queue, and what applies the queue has
not been read. `132` also clears the banks as the table says, when the major
or minor it goes to differs from the live one (`func_0206e080`,
`func_0206e0d0`).

**The actions are one switch.** `func_02061c04` dispatches on `op − 100` for
operations 100 to 233. Operations below 100 are the conditions, tested
elsewhere. Read so far:

| op | what | where |
|---|---|---|
| 100, 101 | set, clear a bit in a bank at `+0x8c` of the object, outside any thread, so no stage move clears it | `func_0206df6c` |
| 102, 103 | set, clear a mark (`+0x03` of the live thread) | as above |
| 104, 105 | set, clear a flag (`+0x10` of the live thread) | as above |
| 132 | queue a move of the live thread's stage | `0x02062644` |
| 214 | queue a move of thread *n*'s stage | `0x02063e40` |
| 216 | store its argument at `+0x27b4` of the object `func_02012fe4` returns; what reads it is not established | `0x02063eac` |

### Areas — read from the game's code, 28 September 2026

**An area is a box turned about the vertical through its centre, and two
things define them**, which the field tests the Hero against each on its own.

- **A trigger's `143`.** The parser takes six floats and an integer as
  `143`'s own, and the integer is the **angle in degrees**: the action (US
  ARM9 `0x02062a94`) multiplies it by π and divides by 180. It keeps the box,
  its centre, the angle and a squared radius for a quick refusal in a list
  on the trigger object (`+0x494`, through `func_02064af8`). **That radius is
  made from the box's width and height, not its width and depth**, and the
  test compares it with the distance across the ground, so a deep, low box
  is refused short of its far end. The game does so, and so does `inArea`.
  31 of the cartridge's 113 are turned. `143` is on 80 settings records and
  also on 3 entry, 3 talk and one event's own record: it adds its area when
  its record runs. Batsureg's areas 72 and 73 at 10.6 are an entry record's
  with no event.
- **A map's own link table**, the `.bmbl`: a `0x73` region of **type 3**, its
  first value (see "The doorways" for the other types; 2 is a doorway). The
  handler for `0x73` (`func_0201d530`) reads a type, a centre, a size (width,
  height, depth), an angle in radians and one more angle, and makes its
  squared radius from the width and depth. The handler for `0x74`
  (`func_0201d638`) gives a type-3 region its number from its first value.
  22 on the cartridge, in 15 maps. Stornway's throne room has areas 0 and 1,
  the only definitions of the areas its records at 3.1 and 3.3 name. Zere's
  one is turned 45°.

**The test** (`func_020321e0`): for a turned box, refuse a point further
across the ground from the centre than the squared radius allows; otherwise
turn it back about the centre by the angle (`RotationMatrixY(−angle)` applied
as a row vector: `x' = x cos a − z sin a`, `z' = x sin a + z cos a`) and test
it against the corners, edges included, on all three axes. The point is the
Hero's own position. An unturned box skips the radius.

**Walking into one** (`func_ov017_02198e30` for a trigger's, and
`func_ov017_0219814c` for the map's own): each source keeps the first area
that holds the Hero. On a new one it runs kind 5 for the one left, then
kind 2 for the one entered, with the area's number as the context. No record
on the cartridge is of kind 5. A map region also carries flags that can make
it hold once and then no more (`func_02094b9c`); what sets them for an area
is not read.

**Marks last the major stage, not the minor.** `minstrel` cleared them with
the flags on any move. That was marked "ours" in `moveStory`, and the code
corrects it.

### How a record runs — read later the same day

**Which record runs.** Records are kept grouped by value 5, their **kind**.
The game asks for a kind with a context (who is talked to, the map, the area,
the event, the set battle) and takes **the first record of that kind, in the
file's order, whose conditions all hold** (`func_02064490`). It then runs
**every one of that record's actions** (`func_020649b0` → `func_02064530`), and
applies what they queued (`func_0206f81c`). So a stage move on a talk, entry
or battle record is part of running that record. It is not only an event's
own record that can move the story.

**The parser** (`func_0205ec70`) makes a word whose operation is below 100 or
from 500 a **condition**, and one from 100 to 499 an **action**. Each then
takes a fixed number of the values after it as its own: `132`, `148` and
`214` take three, `133` one (an event, `value >> 16`), `143` six floats and an
integer. The full table is `PARAMS` in `story.ts`. So the `0 : n` words after
`132` are its stage, not conditions.

**The conditions** (`func_0205faf4`, a switch on the operation):

| op | holds when |
|---|---|
| 0, 1 | a game-wide flag (`+0x8c`) is set, clear |
| 2, 3 | a mark of the live thread is set, clear |
| 4, 5 | a flag of the live thread is set, clear |
| 6, 7, 8, 9, 12 | the context's character, area, event, map, set battle is the argument (`+0`, `+4`, `+8`, `+0xc`, `+0x18`) |
| 11 | the context's label (`+0x14`) is the argument — the label the talk was asked with; see "How a talk runs" |
| 16 | the text system's last answer (`func_020457e0`, `+0x954`) is the argument, from 0 — Yes. A talk's window sets it to 0 as it opens (`func_0204500c`), so after a line with no prompt `16 : 0` holds. 432 records |
| 17 | `17 : 1` by night; any other argument by morning, day or evening (`GameState::IsMorningDayOrEvening`) |
| 18, 19 | the bag holds the item, holds none (`func_02086aec`). Not read by the engine |
| 20 | a quest's state is 2 and it may be taken (`func_0206e120`, `func_0206e31c`) |
| 23 | a test of a session object's first word and one more state: 0 with no session, 1 with one, 2 with none or one kind of player, 3 only the other. INFERRED multiplayer; alone, 0 and 2 hold |
| 26, 27 | a game-wide flag named by its number is set, clear (`func_0206eb98`): below `0x400` the bit itself, from there displaced by 1,786 — the cast script's rule, `flagBit`. 427 records |
| 35 | the step is the argument |
| 36 | a value of game object 0 (`+0x130`, then `+4`) is above 0 for `36 : 0`, at or below 0 otherwise. **INFERRED, the Hero's HP**: the same block holds another beside it at `+6`, and the block at `+0x134` two more at `+0x30` and `+0x32`, and the field copies all four from a packet together (ov017 `0x021c9fac`) — HP, MP and their maximums. 545 records; the engine holds the Hero up |
| 41 | the Hero stands in one of the context character's talk boxes (`41 : n`, n not 0) or in none (`41 : 0`) — see the cast's tag 6. 72 records, all characters' own, at the Quester's Rest and Stornway's counters |
| 52 to 63 | **composites**: each names a character (`6`, its argument) and tests more, taking each of its values as its high and low half in turn (the parser stores them so). 52 is `6`, `5` (a flag clear) and `23`: Stornway's lobby at 2.7, `52:205 3:2 119:2940 104:3`, is talking to 205 with flag 3 clear. 62 and 63 are `6`, a game-wide flag set (`0`) or clear (`1`), and `23`. 53 to 61 also call `func_0206474c(quest, mode)` on their first value, which holds by the quest's state: modes −1 and 5 at 0, 0 at 2, 1 while its first flag is set, 2 at 3, 3 at 1, 4 never. 53 adds `11` and `16`, 54 an `18`, 56 a `36`, 57, 58 and 61 a `23`. 1,495 records carry one |
| 88, 89 | a game-wide flag of the block from bit 830 is set, clear: `88 : n` tests bit `830 + n`, for n below 73 (from 73, 88 fails and 89 holds). The Quarantomb's records test 71 and 72; what sets them is not read |
| 86 | partly read: someone of a kind the game marks (`func_02061bd8`) in the party is up, or failing one its object `0xce` is there, for `86 : 1`; `86 : 0` otherwise. INFERRED, whoever goes along — Ivor |
| 13, 14, 15 | the party's size — the filled slots of four, the Hero among them (`func_02010890`) — is at least, at most, exactly the argument. Gortress's captain at 14.3 speaks one way to two or more (`13:2`) and another to the Hero alone (`15:1`) |
| 32, 33 | the party tricks performed — see "Kind 19 is a party trick" below |
| 81 | `81 : 0` holds with no session (`func_0202b7d8`), `81 : n` never — INFERRED multiplayer, as 23 |

**The queue** (`func_0206f81c`) applies:

| op | what |
|---|---|
| 132 | the live thread's stage and step |
| 148 | **all five threads'**: `ev28800` at 13.1 brings the threads back together at 13.2; winning set battle 25 at 17.2 plays `ev29300` and sets all five to 19.2 |
| 214 | thread *n*'s |
| 118 | **a talk**: `118 : c` and a value whose high half is a label (`func_0206445c` queues it; the parser keeps `value >> 16`). The queue looks up character `c` and starts the talk with that label — see "How a talk runs". 3,340 records |
| 119 | starts the event |
| 133, 138, 226 | a map change and the event played there, one case. 138 and 226 each set one flag on it that 133 does not; what the flags do is not established |

Each stage move goes through `func_020703c8(thread, major, minor, step)`, and
**the story only moves forward**. The thread's point and the new one compare
as `major × 10000 + minor × 100 + step`, and a move to one at or before where
it stands does nothing. A move forward clears the thread's banks as `132`'s
action does: all four on a new major, the flags and `+0x14` on a new minor.
`132`'s action also clears before queuing, by the live stage, whichever way
the move goes.

**Kind 6 runs every frame in the field.** The field's frame update
(`func_ov017_0218cbd4`, which reads the tick count and updates everything)
calls `func_ov017_0219ca88`. Once the map's doorways, fades and transitions
have had their turn, that asks for the first kind-6 record whose conditions
hold, with the map's id as the context, and runs it. The table only ever holds
the current map's records, so kind 6 is "while the Hero is in this map and
these conditions hold, do this". Angel Falls' church and stable at 1.2, `4:4
4:5 … 132:0 0:1 0:3 0:1`, move the story on the moment both flags are set.

**Who asks for which kind**, as far as read. Each is a call to the lookup with
the kind as a constant:

**The only way a record runs whole is `func_020649b0`**: the first record of
the kind whose conditions hold (`func_02064490`), then every action
(`func_02064530` → `func_02061c04`). Its callers, and so **every kind that is
ever asked for**, read on 28 September 2026 from every call in the ARM9 and
the overlays — three of them through a thunk that fixes the kind
(`func_020649f4` is kind 3, `func_02064a08` kind 15, `func_02064a24` kind 16):

| kind | asked for by |
|---|---|
| 0, 1 | the field's talk (`func_ov017_021a4cf0`, `func_ov017_021b8e8c`) — see "How a talk runs" |
| 2, 5 | the field (`func_ov017_0219814c`, `func_ov017_02198e30`, and at `0x02198f48`) |
| 3 | **the field, whole, on arriving in a map** (ov017 `0x0219f3a0` and `0x0219fd80`, through `func_020649f4`). So an entry record runs every action — `119`, `124`, `143`: Batsureg's areas 72 and 73 at 10.6 are one's. Map loading and a doorway transition also run kinds 3 and 20, and 17, **for their `108` alone** (`func_02017a94`, `func_02018300`, through `func_02064b24`, which runs one operation of the first holding record) |
| 6 | the field's frame update, above (`0x0219cd7c`) |
| 9 | `func_02064a40`, from the protagonist's area byte — **no record on the cartridge is of kind 9** |
| 10 | a script function (ov001 `0x021551dc`) |
| 11 | the end of an event (`func_ov017_021bc77c`, at `0x021bcab8`) |
| 12 | ov003 `0x02159f58` |
| 15, 16 | the end of a set battle, won and lost (ov017 `0x021b7c54`, `0x021b7c3c`, through the thunks) |
| 17 | the field's doorways (`func_ov017_02198f84`, at `0x02198fe4`) |
| 18 | ov017 `0x02199280` |
| 19 | **a party trick performed** — the trick's object, `func_02053634`, through `func_02064a9c`; see below |
| 20 | loading the trigger file (`func_02064574`), which takes the areas |
| 22 | ov002 `0x02155b30` |
| 23, 24 | ov017 `0x02199190`, `0x021ac9bc` |
| 25 | ARM9 `0x0208b1cc` |
| 26 | ov017 `0x021b9b34`, `0x021b9ba0` |
| 27 | ov004 `0x021648c4`, ov017 `0x021a9f04` |
| 29, 30 | ov017 `0x02199608` and `0x02199660`, `0x0219e720` |

**Kind 19 is a party trick.** The field object that plays one loads
`data/chara/sg<nn><m|w>.chr` (`func_0205308c`; each holds a `sigusa.nsbca` —
仕草, a gesture — for a man or a woman, `func_02052e2c`'s bit), and when its
tricks are done and it is the leader's, its update (`func_02053634`, at
`0x020539ac`) copies the up to four it performed to the context's `+0x2a` and
asks for the first kind-19 record whose conditions hold; the context's `+4` is
the Hero's area, which `7` reads. **Condition `33`** (`0x02060214`) takes the
next word as four bytes and holds when each nonzero one is among the four
performed, no two the same; `32` takes a word too and is not read (INFERRED,
the same four in order — the quest "We Like to Party", `32:0 4866:2307`).
**The tricks are numbered as the field menu's strings are**, `str_tm` 4509 +
*n*: Bow 1, Clap 2, Air Punch 3, Bye Bye 4, Weep, Despair, Tantrum, Surprised,
Jump 9, Sit, Recline, Hello! 12, Thanks!, Goodbye!, Eek!, Hmm... 16, Pray 17,
Dive, Pirouette 19, Belly Dance, Royal Regards, Swinedimples Salute 22, Cap'n's
Curtsy, Sultry Dance, Weird Dance, Wallop, Cheer, Provoke, Salute 29,
Inspiration, Professor's Pose 31. **Action `142 : n` teaches one**
(`0x02062a80` → `func_0206e348`): the game orders the tricks by a table at
`0x020e87c0` — `0, 3, 2, 4, …, 11, 18, 12, …, 17, 19, 1, 20, …, 31` — and
**the first seventeen places are known from the start** (the setter refuses
them; `func_0206e384` reads the rest as a mask), the others learnt as a bit
each of the game-wide bank from `0xbf1` + place. 11 records: Gleeba's Drak
answers a Clap in area 10 at 11.2 (`7:10 33:0 512:0 1:322 5:1 23:2
119:11200`), Porth Llaffan wants a Bow in area 34 at 6.4 — taught at 6.3 by
`142:1` — and the Quester's Rest's two quests an Air Punch and the sequence.

**The thread record, and `601`/`602`.** The story bank is **five records of
28 bytes, one a thread**, and the byte at `+0x332` says which is live. A
record's first three bytes are its stage — major, minor, step
(`func_0206df14` reads them into `GameState`) — and it has two bitfields:
**action `102` sets bit *n* of the one at `+0x03`** (`0x02061ee4`, the marks)
and **`104` of the one at `+0x10`** (`0x02061f9c`, the flags), each through
`func_0206df6c`. The scene functions `601` and `602` read those two fields of
the live record: **`601 : n` is mark *n*, `602 : n` flag *n***. Gortress's
`ev14640` sums `602(11..14)` — the four flags its `155` records set — and
chains into `ev14903` at four.

**Starting a scene raises the story to the scene's own stage.** The scene's
start (`func_ov017_021bbfc4`, at `0x021bc424`) compares the live thread's
major and minor, as 1000 × major + minor, with the list entry's (the context's
`+0xc`, `+0xd`), and **sets the entry's when the story's is less**, the major
19 at most and not 0.0; the step is left. This is why the Starflight Express's
arrival scenes are listed at 20.1, and it is what opens 16.1: no record moves
the story there — the ride's scene at 16.1 does.

**The Starflight Express** is one task of the field's (overlay 17: started by
`func_ov017_021a8614`, run by `func_ov017_021a86d0`), read whole on 28
September 2026; the engine's `express.ts` follows it.

- **Started** by action **`215 : mode`** (`0x02063e80`), whose two values'
  halves, high first, are up to four **stops**; or by the talk service's
  facility 11 with the stops 1, 2, 3, 4. Mode 0 is Stella (the Hero turns to
  character 2), mode 1 Sterling (203). 16 records, all on the conductors.
- **Its words** are `data/bin/menu/str_ark` (箱舟, the ark): the stops' names
  at 1 to 5 — the Observatory, Alltrades Abbey, the Realm of the Almighty,
  Gittingham Palace, the Realm of the Almighty — "Cancel" at 6, Stella's lines
  from 100 and Sterling's the same lines 100 on (`func_ov017_021a933c`).
- **The list**: line 100, then the non-empty stops in the record's order and
  Cancel. Cancel or the B Button closes it.
- **The stop it is at** is the field state's halfword at `+0x27b4`: action
  **`216 : n`** sets it (`0x02063eac`) and every ride sets it to the stop
  (`func_ov017_021d1c2c`). `ev5110` sets 1, `ev25524` 2.
- **Choosing the stop it is at**: line 101, a yes or no. Yes — 102, then a
  map change to the stop's own place, no scene (a table at `0x021a8d88`:
  map 4504, 20007, 4301, 20034, 4400; at the two field stops it also calls
  `func_ov017_021a65c4`, not read). No — 103 and the list again.
- **Another stop is a ride**, two scenes: one **leaving** the stop it is at
  (the Observatory 29506, the Realm 29509, the Realm beyond 29512; the Abbey
  29500 bound for Gittingham, else 29515; Gittingham 29503 bound for the
  Abbey, else 29516), and one **arriving** at the stop chosen (29507, 29501,
  29510, 29504, 29513), parked behind the first (`func_ov017_021bbbf8`) — the
  leaving scenes end `834`, `810`, carrying on into it. **Two of the story's
  own replace the arrival**: Stella, to the Observatory, at 10.8 step 1 with
  game-wide flags 4 to 10 set — one at each thread's end — **`ev28800`**
  (`0x021a8fe0`), whose record brings the threads together at 13.2; and
  Sterling, to the Realm, at 17.1 step 1 with flag 21, `ev29210`.
- **A parked scene outlives a map change**: a scene that ends with its
  second still parked stores it in `GameState` (`+0x63d8`, `0x021bca4c`), and
  the field plays it once the next map is in (`0x0218c5fc`).

**`225 : map`** is queued, and not read; it sits on records that end in a
new map (`ev29004`'s `225:4301`). **`110 : n`** is `GameState::SetTimeOfDay(n)`. **`197 : n`** sets
**the Story So Far's number**, `GameState+0x5CBC` (`func_02010810`) — read
4 October 2026: the page the Y Button shows is message *n* of
`/data/scenario/str_ol.gp2` (tag `0x67`), one number for the whole game,
1 on a new game, saved, and set to *n* at once with no forward-only rule;
when the old and new fall in different ranges of a table (`0x020636b4`) a
40-byte block is cleared, the ranges being `cmtFileTbl.bin`'s groups, the
continue screen's comments. On nearly every event's own record; the
Hexagoon's lost battle sets 10, "…he was defeated", and the won one 11. See
`apps/game/src/story-so-far.ts`.

**`124 : c` takes character *c* out of the map** (queue case `0x0206fca0`):
the object is found by its id (`func_0203df78`) and bit `0x8000` of its first
word set, which every lookup of the map's objects skips from then on
(`func_0203df78`, `func_0203dce4`) — gone until the map is next placed. Drak
leaves so after his talk at 11.2, `124:200`; his placement is a tag-17 record
"while game-wide flag 322", which `ev11200`'s record sets and `ev11210`'s
clears. The placement script's tag 17 tests **the same bank** for both its
kinds: kind 1 the raw bit (`func_0206dfb0` on `+0x8c`), kind 2 by number
(`func_0206eb98`, `flagBit`).

**The opening, as the records have it.** The morning's record, in map 1110:
`8:2130 132:0 0:2 0:2 0:1 197:6` — after it the story is at 2.2, step 1. At
2.2 a character record in 1107, Erinn's house, names Ivor and his event,
`6:7 119:2200`; the cast places him there at 2.2 and not at 2.1. His event's
record is `8:2200 133:1100 2210:0` — on to the village, 1100, and `ev02210`,
his call on her doorstep, whose own record is
`8:2210 104:0 132:0 0:2 0:2 0:2 197:7 205:1 141:1`: flag 0, and 2.2 step 2. A
villager's record then holds only with flag 0 set and flag 1 not:
`6:8 4:0 5:1 119:2220`.

**`220`, the Quarantomb's switches** (`func_020aee04`): parsed as two bytes,
which switch (1 or 0) in the high and whether it is on in the low
(`func_0205ec70`). Nothing outside map 7402; there it turns the map's pieces
`0x4e`–`0x58` (which 1) or `0x37`–`0x4b` (which 0) to on, and **sets
game-wide flag 830 + 71 or 830 + 72 to it** (`func_020ae4ec`) — the block
that conditions `88` and `89` test. `220:257` sets 901, `220:1` sets 902, and
`ev24590`'s record clears both with `220:256 220:0`. Talking to `107` and
`108`, in either order, is what sets both and plays `ev24590`. All 14 records
with it are the Quarantomb's; the pieces are not modelled.

**`149` and `150`** set a map piece on and off (`func_02019508`,
`func_02013380`), or, for a piece not in the map, a bit of the thread's bank
at `+0x08`/`+0x14`. Not built.

Operation 141 is not decoded; 197 is read above as far as a counter; 205 brings Ivor into the party (see its row below).

### How a talk runs — read from the game's code, 28 September 2026

**Whom the Hero talks to** (ov017 `func_ov017_021a4e88`): of the cast, anyone
whose talk box (the cast's tag 6) holds the Hero, strictly, on the ground; and
anyone within 1.5 across and 1.75 away (`0x1800`, `0x1c00` in fx32) — but a
thing to examine (the cast's kind 1) only from a box. Of those, the one most
nearly faced (by `func_ov017_021a4700`, under `0x3244` — π, if it is fx32
radians, not established). **The talk's label is the box's**, or 0. The
engine keeps its own reach for the near (`talkTarget`), and takes the boxes
as read.

**Then three steps** (`func_ov017_021a4cf0`, then the talk's own machine,
`func_ov017_021b8e8c`):

1. **Kind 0, the character's own records**, with who is talked to at `+0` and
   the label at `+0x14`. The first that holds runs — every action — and its
   queue: a `118` starts the talk with its label, a `119` plays an event, and
   one with neither runs and says nothing. With none holding, the talk starts
   with the label asked.
2. **The line** — see "A talk file is a script". With none, the talk ends and
   nothing more runs.
3. **Kind 1, the talk records**, once the line's window has closed, with who
   and the label the talk was asked with. The first that holds runs, its
   queue with it: a `119`, a hand-on, a stage move, or another `118` — and the
   talk goes round again with the new label.

Ivor at the landslide, `6:7 118:7 192:0` then `6:7 11:192 119:2350`: his own
record asks 192, his line for it is said, and the talk record for 192 plays
`ev2350`. Yggdrasil has no record of its own: talked to from its box, it asks
80, its line 96 asks "Offer the benevolessence up to Yggdrasil?", and on Yes
`6:199 11:80 16:0 119:21510` plays. Stornway's #11 asks 192 only once mark 4
is set, which talking to #4 from its box sets.

**Actions that set a game-wide flag of their own** (read 4 October 2026,
`func_02061c04`; all through `func_0206df6c` on the bank at `+0x8c`;
`bankBit` in `story.ts`):

| action | case | sets | carried by |
|---|---|---|---|
| `223 : x` | 123, `0x02064038` | `0x799` := *x* ≠ 0 — Alltrades Abbey open | the two outcome records of `ev26510`, Tower of Trades map 9008, 6.5 |
| `224 : x` | 124, `0x02064054` | `0x798` := *x* ≠ 0 — not established | `R01`–`R04` records from 4.1 |
| `231 : x` | 131, `0x0206414c` | `0x796` := *x* ≠ 0 — revocation offered; unless `func_0202ae18`→`func_0202c540` holds (INFERRED a wireless guest); then once stamps a record with the clock, the Hero's `+0x134` and the play time (INFERRED "cleared") | the credits' record, `ev29300`, map 4403, 17.2 |
| `160 : v` | 60, `0x02062fd8` | `0x113F + v` — advanced vocation *v* unlocked | six records, each beside a `127` quest cleared: quests 25, 27, 26, 124, 128, 28 give vocations 7–12 |
| `202 : n` | 102, `0x02063a34` | `0x1198 + n` | the Krak Pot's first talk, `0x1198` |

None takes a parameter; nothing on the cartridge clears `0x799` or `0x796`.

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

A tagged table (see "The tagged data table"). All 283 read. (`F07`, `H07`,
`M05` and `M12` read as empty until 28 September 2026: their first word is 16,
which the cartridge walk took for an empty compressed stream.) The tags, with
the value kinds the table's type bits give:

| tag | kinds | on | read as |
|---|---|---|---|
| `0x66` | integer, string | 283 of 283, once | `unknown` (0 on all), then the picture's name — an `.obg` in the archive on 283 of 283 |
| `0x6a` | string | 221 | the backdrop: `minimapbg2` ×207, `minimapbg3` ×13, `minimapbg4` ×1. The fields have none |
| `0x69` | float ×267, integer ×16 | 283, once | the scale — INFERRED, below. 3.2 in the village, 1 on the field, 2 in the pass; the integers are 4 on fourteen `C02`/`C04`/`D17` maps and `M05`, and 1 on `O00` |
| `0x64` | two integers ×282, two floats ×1 | 283, once | the picture's corner, in tiles — INFERRED, below. −18, −12 in the village; `S07M01`'s are the floats −15, −12 |
| `0x6b` | integer, one or more records | 282 | the maps the picture is drawn for: **the map index's id for the file's own map on 245 of 283** — `M01` 1100, `F01` 20001, `S01M01` 5101. Most of the 38 others are the `H` overviews, whose ids are fields' (`200xx`); `T00` has none |
| `0x6c` | float, float, integers | 273 records | a mark: a position, then the maps it stands for |
| `0x70` | (integer, string) pairs | 268 | map codes by id: **the id is the map index's for the code on 519 of 520 pairs** (`C02M07` has 206; the index 207) |
| `0x65`, `0x67`, `0x68`, `0x6d` | | | `unknown`: `0x65` 1, `0x67` 1 and `0x68` 0, 0, 0, 0 on all 283; `0x6d` 3 ×62, 0 ×10, 4 ×6 |

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

**Weapons and shields hang from the rig; where is partly read.** Each is one
bone of its own, named for the part, and sits about its origin: the copper
sword, `p_w004`, runs along +z from −1.30 to 12.80, its guard across x; the pot
lid, `p_s296`, is a disc from x −2.22 to 3.60, y 0.26 to 1.48 and z ±2.91. The
rig's forearm bones, `arm1L` and `arm1R`, start at the elbows, (±5.81, 13.49,
−0.50) in the bind pose, where the arms reach ±9.23 — so **a shield is modelled
in the left forearm's space**, lying along it from elbow to wrist on its outer
side (INFERRED, from those extents). Besides its limbs, trunk and head the rig
has one bone more, **`usiro`**, at (0, 13.00, −2.00): behind the shoulders, and
Japanese for behind — where what is carried on the back hangs, INFERRED from the
name and from a let's play, whose Hero carries a shield there and a fan at the
side outside battle, and holds the sword in hand in battle. How the game turns a
part to hang on the back, and where exactly a weapon sits in the hand, is in
its code, not read; ours are in `hero.ts` ("Carry"). Ivor's rig,
`s017`, has the same limbs and no `usiro`.

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

`readCharacterPresets` in `presets.ts` reads it. **Everything below was
written from a reading of the file in September 2026 and nothing read it until
24 September**, so the description and a parser had never been held against
each other; `tools/harness/test/presets.test.ts` now does that on a real
cartridge, and every claim here survived it — the count, the 27 distinct names
over 29 records, the face band, the sex values, value 77's two values, and the
item bands including the sage man's 8001 that names nothing.

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
| 77 | **the face**, an item, 9020–9033 — INFERRED, by the order below | 9024 on all 23 vocations (`p_f004` a man, `p_f014` a woman); 9023 or 9024 on the named |
| 78 | **the hair**, an item, 9000–9013 — INFERRED the same way | 9006 on the men (`p_h060`), 9005 on the women (`p_h150`) |
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
| 3 | the arms, 14xxx — numbered as the armour on 11 of 12 |
| 4–8 | `unknown_4` to `unknown_8` |
| 9 | armour |
| 10 | legwear |
| 2 | **the sex**, to record `+0x174` bit 0 (read: `func_02089b90`, then `func_02086f24` `0x02087080`) |
| 5, 6, 7 | **skin tone**, **hair colour**, **eye colour** — `+0x174` bits 1–3, `+0x175` bits 0–3, `+0x174` bits 4–7 |
| 8 | the build, 0–5, two floats from `data_020e8c58`/`5c` by sex |
| 9–18 | the ten slots h0–h9 in order (`0x02087070`): armour, legwear, **11 the face**, **12 the hair**, gloves, footwear, headgear, weapon, shield, accessory |
| 11, 12 | **11 the face (9020–9033), 12 the hair (9000–9013)** — read 4 October 2026; this file had 12 as the face, which was wrong |
| 13 | none on all 12 — gloves, INFERRED |
| 14 | footwear |
| 15 | headgear |
| 16 | weapon — a knife, 19061, on Patty |
| 17 | shield |
| 18 | an accessory, 18039, on Patty |
| 19–34 | `unknown_19` to `unknown_34` |

55 of the 57 ids these records wear name a part that exists.

**Read 4 October 2026** (US): the game loads `presetdt_<lang>.bin` by
`func_02089de8`, running its records as a script (opcodes `0x64`–`0x6a`,
table at `0x020f1048`); action `219 : n` builds record *n* + 7 into the roster
(`func_02086f24`). **`charapreset.bin` has no reader in the code** — its name
is in no string and its FAT id in no constant — so its 77 and 78 are read by
analogy with `presetdt`'s slots: the same h0…h8 order with 77 and 78 in h2's
and h3's places. A face or a hair is an **item**, drawn as `itemdt`'s `+0x10`
names it (see Items). `charapreset`'s hair colour is not established.

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
"character 1 is the party's", INFERRED.

**How he joins and leaves: the events' own records** (see "Triggers", `205`
and `204`; INFERRED). No script does it — none on the way writes a game-wide
variable or calls anything with his number or his model's — but the record
that says what follows an event does: `205:n` brings in the character at
place n of this table, from 0, and `204:1` sends whoever goes along away.
Ivor joins as his call ends (`ev02210`, whose last message is "Ivor joins the
party"), goes on ahead at the pass (`ev22591`, "I'll go on ahead!"), joins
again at the landslide (`ev02350`) and goes home once the mayor has heard the
news (`ev02400`), which a let's play shows: he walks off along the pass and is
found at the landslide, and from 2.4 the Hero goes to the Hexagon alone.

Not established: values 3, 4, 6 and 16; the order of the numbers.

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

# Character colours — `/data/chara/palette.bin`

**Read 27 September 2026, from the game's code as well as the file.** What a
made character's skin, eyes and brows are recoloured with. `readCharaColours`.

**The file is a script.** It is an ordinary tagged data table, and the ARM9
does not read it as data: `func_02099cb8` loads it with `LoadFileIntoMemory`
and runs it with `Script::Execute` against an opcode table at `0x020f1574` —
six `{tag, handler}` pairs, ended by a zero pair. Each handler reads its
record's values with `Script::Parameter::ToInt` and stores each as a
**halfword**, in rows, into a table of its own. The tables stand back to back
from `0x02109928`:

| tag | handler | table | rows × each | read as |
|---|---|---|---|---|
| `0x64` | `0x02099ac4` | `0x02109928` | 10 × 2 | brows, a pair per hair colour |
| `0x65` | `0x02099b20` | `0x02109950` | 8 × 2 | skin, two shades a tone |
| `0x66` | `0x02099b7c` | `0x02109970` | 8 × 4 | skin, four shades a tone |
| `0x67` | `0x02099bd8` | `0x021099b0` | 8 × 8 | skin, eight shades a tone |
| `0x68` | `0x02099c34` | `0x02109a30` | 8 × 2 | eyes, a pair per colour |
| `0x69` | `0x02099c90` | `0x02109a50` | 1 | **the characters' outline colour**, BGR555, `0x1086` on the EU cartridge: overlay 23's `func_ov023_021e5628` copies it into all eight halfwords of the 3D engine's EDGE_COLOR table (`0x04000330`, by `func_020c555c`) before drawing a menu or creation figure; overlay 15's viewer the same. Read 4 October 2026. Not drawn: `render` has no edge marking |

Colours are BGR555. On the reference cartridge the skin rows run pale to dark
by tone and each ramp light to dark by shade; the eye pairs are greys, browns,
red, gold, green, blue and purple.

**How they are applied** — `func_020730e0` recolours a character part by part,
by a part index 0–7:

- **The face, index 2** — `func_02099e18(model, skin, hair colour, eye
  colour)` copies into the start of the face's palette data, three copies from
  byte offsets `{4, 8, 16}` (`0x020e8e20`) with lengths `{4, 4, 16}`
  (`0x020e8e14`): the hair colour's brow pair at slots 2–3, the eye pair at 4–5,
  the tone's eight shades at 8–15. Checked against the parts: every face
  palette on the cartridge holds brow pair 0 at slot 2, eye pair 0 at 4–5, and
  tone 3's eight shades at 8–15 (seven of eight to the bit) — the colours it is
  painted in.
- **Indices 0, 1, 5, 6, 7** — `func_02099d34(model, kind, tone, 4)`: `kind` 1,
  2 or 4 picks the two-, four- or eight-shade table, and the tone's ramp is
  copied **once** into the model's TEX0 palette data at byte
  `D = (S > 32 ? S mod 32 : 0) + 4`, `S` the palette data's whole size
  (`TEX0+0x30 << 3`). *Corrected 3 October 2026*: this file said "every
  32-byte palette", but the copy loop at `0x02099dd4`–`0x02099df0` never
  advances its destination — only the count drops. Index 4 — the hair's
  colour texture — the same at `+ 16`. Index 3 is skipped. On the cartridge
  `S` is 16, 32, 64, 80 or 96, so the write lands at colour 2 (8 for the
  hair), or 10 for 80, always in the palette at offset 0; the parts' own
  colours agree (`p_p213` two skin shades there, `p_a042` four, `p_b617`,
  `S` 80, two at colour 10).
- **`kind` comes from the item worn, not the part.** `func_020de2a4` reads a
  four-bit field from a record found by item id among eleven at `+0x194`
  (`func_02083554`): bits 15–18 of its first word for a man, 23–26 for a woman;
  1, 2 or 4, or none. **The records are `itemdt_<lang>.nat`'s** (read 3
  October 2026): the field is the first word of the record's block —
  `ItemDef.skinShades`, see `itemdefs.ts`. A slot with no item counts from a
  part that is no item, kind 11 in the same table: the bare body 1000, legs
  8001, arms 8010, feet 994 (`func_02072afc`'s fallbacks). The indices: 0 the
  armour, 1 the legwear, 2 the face, 3 the hair's shape, 4 the hair's colour
  texture, 5 the gloves or else the arms, 6 the footwear, 7 the headgear;
  weapon, shield and accessory are never recoloured.

**The appearance fields**, from the same caller: the skin tone is bits 1–3 of
the appearance record's `+0x14` byte, the eye colour bits 4–7, and the hair
colour the low four bits of `+0x15`.

**The hair's colour texture takes its count from the hair item** (slot h3,
`GetItemSkinShades` at `0x020731f0`, read 4 October 2026): on this cartridge
items 9008, 9009 and 9010 give a man eight shades and every other hair none;
the texture's model is `p_h<number + hair colour>a`. **The shape's letter is
the headgear's** (`func_02072e94`, `0x02072f68`–`0x0207300c`): `a` with none,
else the headgear's model number ÷ 100 into `"bbdcc\0cea\0"` (`data_020e883c`)
— a `\0`, or ten and over, draws no hair; a man of hair 9001 under a 3xx
takes `f`.

**Overlay 23's second skin path** (`func_ov023_021e540c`) is the menu's and
creation's figure, built of `d_` parts from `chara_pd.gp2` (not battle, as
this was first taken): the face's brows, eyes and skin at `+0x24`, `+0x28`,
`+0x30` of its palette, and parts 0, 1, 5, 4, 6, 7 each by
`GetItemSkinShades(rec, 0, sex)` — bits 11–14 a man, 19–22 a woman. Not drawn
here.

# Mini medals — Cap'n Max Meddlin's service

**Read 27 September 2026, from overlay 4's code** (US addresses). `readMedalRewards`,
`facilityFor`.

**Reaching him.** Max (`s083`, cast member 103 in `M08M07`, map 1807) has no talk
file of his own. His record is `6:103 145:7`: operation `145` names a facility
that talking to the character opens. It occurs 58 times on the cartridge, always
beside `6` on a character's record, and always where there is a counter — 0, 2,
3 in Stornway, 2, 5, 6 at the Quester's Rest — and 7 only on Max. INFERRED from
that distribution; the numbering is not the line-tag facility codes', where 7 is
the Krak Pot.

**The tables** are two arrays of `(u16 medals, u16 item)` back to back:
six exchanges then ten milestones (US overlay 4 `0x1c918` and `0x1c930`). Found
by shape: six rising pairs, then ten rising pairs ending at 80, each naming an
item. On the reference cartridge: milestones 4 thief's key, 8 Mercury's bandana,
13 bunny suit, 18 jolly roger jumper, 25 transparent tights, 32 miracle sword,
40 sacred armour, 50 meteorite bracer, 62 rusty helmet, 80 dragon robe;
exchanges 3 prayer ring, 5 elfin elixir, 8 saint's ashes, 10 reset stone, 15
orichalcum, 20 pixie boots.

**The service** (`str_mdl`'s lines, tag `0x67` records of number and text):

| function | what it does |
|---|---|
| `func_ov004_02167d90` | where a visit starts: a guest in another player's session (`func_0202c540`, INFERRED guest) → label 200, line 200 alone — **not a count of medals**; nothing handed in → 10; every milestone passed → 100; else 30 |
| `func_ov004_0216794c` | the numbers: handed in so far (progress `+0xf74`), held (item 22039 in the bag), the next milestone — the first above the total — and whether handing in reaches it |
| `func_ov004_02167b78` | fills the lines: `val_1` so far, `val_2` held, `val_3` the next milestone, `val_4` the total after, held to 80; the reward's name |
| `func_ov004_02167adc` | hands over: **only as many as the next milestone needs** when they reach it, and its reward; otherwise all; **with no milestone left, none** (`0x02167b14`) |
| `func_ov004_02167a0c` | takes that many item 22039 out of the bag and adds them to `+0xf74`, **held to 500** |
| `func_ov004_02167a6c` | gives an item |
| `02167e28`, `02167e6c`, `02167eb0`, `02167f1c`, `02167fb0` | what follows, by the progress read **before** each hand-over: medals held → hand them over; none → the tally (50) on a later visit; reached → 40; after 21 or 32 not reached → 51; after 41 every milestone passed → 60, otherwise 50 then 51 — **50 follows a reward, or a later visit with nothing** (corrected 3 October 2026) |
| `02167fd4` | label 60: starts `ev28590` and **teaches trick 23, the Cap'n's Curtsy** (`func_0206e348(…, 0x17, 1)` at `0x02168014`, as action `142` teaches one) |

The eightieth medal's scene is `ev28590`, whose own record is in map 1807; its
lines are `str_mdl` 60 to 63 again.

**His script** is `/data/menu/medal.stb`, an SB2 script whose sections are
numbered by label (2, 3, 10 … 151, 200, 0); engine function 39 *n* runs
handler *n* of overlay 4's table at `0x02170038`, 64 (3, *m*) shows
`str_mdl` line *m*, 48 closes the service. Section 20 is 20, 21, then the
hand-over; 31 is 31, 32, then the hand-over — so 21 and 32 count the medals
**before** they go. **Not built**: Max's motions and pauses — `"fr"`, `"cp"`,
`"stand"`, `"yb"` (INFERRED motion names) and the 48- and 40-frame waits;
handler 20, on a list move.

**The exchange after 80** (`func_ov004_021680cc` on): after his greeting, 110,
medals held → 120 and the list, none → 151 (`02168074`). The list is the six
exchanges at their prices, titled by line 100 (`021680cc`); choosing one sets
`val_3` to its price and, with enough held, says 130 and asks, else 132
(`02168318`). Yes takes the price through the same hand-over as a milestone —
**so exchanges count towards the total** — gives the item, and says 140, which
asks if there is more (`02168400`); no says 131; more says 141; leaving says
150 and 151 (`02168244`, `02168268`).

# Experience adjust — `expadj.nat`

**Read 27 September 2026, from the code that loads and reads it** (US overlay
23). `readExperienceAdjust`.

The victory state loads `data/bin/expadj.nat` (its name at `0x021fe338`,
`func_ov023_021f5340`) and copies it in (`021f5448`):

| bytes | what |
|---|---|
| `+0x00` u32 | bits 0–11 the number of bands (`021f5524` sizes them, four bytes each); bits 12–30 the size of a second block after them — **not established**, and none on the reference cartridge, carried as `unknown_tail` |
| `+0x04` u32 × n | a band: bits 0–25 the most experience it holds, **0 for no bound**; bits 26–31 its number |

`func_ov023_021f5534` walks the bands and takes the first whose bound the
battle's total does not pass (`cmp; bgt` — signed), or that has none;
`021f5578` returns its number, or 4 when none is found. The share of the
experience adds it to each member's level before weighing — see
`experienceShares` in the simulation.

On the reference cartridge, sixteen bytes: three bands, up to 10,000 → 4, up
to 20,000 → 3, unbounded → 2.

---

# Travel — `loola`, `riremito.bin`, `chur_messet.bin`

Three of the game's `Script` command files (see the tagged data table), read 6
October 2026 from the code that runs them; `game-formats/src/travel.ts`, and
the whole reading with addresses in `docs/readings/T12-travel.md`.

## `data/map/loola.gp2` › `loola_<LG>.bin` — Zoom's places

Opcodes `0x64`, `0x65` (version, date: nothing), `0x66 n` (room for n) and
**`0x67`, a place** (`func_020a7f88`), thirteen values:

| value | what |
|---|---|
| 0 | its number: flag `0x200 + n` offers it, and the list is in its order |
| 1 | 1 to 6 — not read by anything found |
| 2 | its name |
| 3 | the town's revival map (a church, or Dourbridge's exterior …) |
| 4 | the map Zoom lands on |
| 5 | the facing there (0 on all) |
| 6–8 | x, y, z, in the map's units |
| 9 | the map the ship is moved to |
| 10 | a number passed with it (not read) |
| 11, 12 | the ship's x and z |

The European file holds 18. The list offered is the places whose flags are set,
by number (`func_020a8304`).

## `data/map/riremito.bin` — Evac

Opcodes `0x64`, `0x65` (nothing) and **`0x66`** (`func_ov017_021ab6b0`): an
area (a map's value 1), a map (0 for any), then destinations of five — a map,
the facing, x, y, z. Each record in order holds when its area is the map's, it
names this map or none, and the area was not already taken by a record naming a
map; it takes the destination on the last field the Hero stood in, or else its
last; one whose destination is map 0 (Zere Rocks' own top) goes nowhere. 21
records, 19 areas.

## `data/scenario/chur_messet.bin` — the waking priest's voice

**`0x67`** records (`func_0207267c`): a map, then twelve strings, three spans of
four — the lowest and highest story major (both "0": always), then the voice by
day and by night (`atoi`; empty is 1). The first span holding the major gives
the voice; voice 3 says nothing, any other is `str_ch<voice − 1>`'s line 1082.
18 maps on the European cartridge.

## Accolades — `ttldata`, `ttlname0`/`ttlname1`, and the `title_*.stb` that award them

Read 6 October 2026 from the decomp's USA build; `docs/readings/T14-records.md`
has every address.

**`/data/bin/ttldata.gp2/ttldata_<LG>.bin`** is a command file (the tagged data
table). Tag `0x65` a date, `0x64` a version string, `0x66` four integers (151,
21, 260, 12 on the European cartridge, not read), and **`0x67`, one accolade**:
its number; where its man's name and its woman's name fall in alphabetical
order, from 1, 0 when that sex has none (observed: the English names sorted
give exactly these, 442 of 442 for each sex — the Accolades Earnt list's "By
Name"); two values not read, kept as `unknown_3` (0, 1, 2, 6 — the twelve
revocation titles 101–112 — or 7, the 260 skill titles 121–380) and
`unknown_4` (0, 1 or 2); and the line describing it. 445 records, numbered 2
to 454 with gaps. The ARM9 loads it (`func_020a13c4`) and finds a record by
number (`func_020a15bc`). `readAccoladeData`.

**The names** are system strings, keyed by the accolade's number:
`/data/bin/ttlname0.gp2/ttlname0_<LG>.nat` a man's, `ttlname1` a woman's —
every reader builds `ttlname%d` from the Hero's sex (bit 0 of `+0x49c` of the
protagonist's data). An empty name is the other sex's only (116 "Cool
Customer" a man's, 117 "Haughty Beauty" a woman's). `ttlname_<LG>.bin`, a
command file pairing each number with two names of its own, is named by no
code found.

**Four scripts award them** (`data/scenario/title_btl.stb`, `title_skl.stb`,
`title_clr.stb`, `title_gyalel.stb`), run on a machine of their own: the event
interpreter with a table of 95 functions (overlay 23 `data_ov023_021fddb8`,
pairs of handler and number, registered by `func_ov023_021eb000`). Section 100
calls one routine a candidate, each beginning "has it already?" and ending 1
when it is due; when it is, function **0** adds the number to a list of up to
50 (`func_0209ffe0`). `title_btl` and `title_skl` award every one due;
`title_clr` and `title_gyalel` return after the first. Which accolades:

| script | accolades | due when |
|---|---|---|
| `title_btl` | 89–100 | the Hero (member −1) at level 99 in vocation 1 to 12 (`101`) |
| | 2 | eleven monsters, 296 to 306, each defeated (`251`) |
| | 3–6, 7–10 | a grotto boss of level 25, 50, 75, 99 beaten; a grotto of that level cleared (`253`, `252` — 0 outside a grotto) |
| `title_skl` | 121–380 | points in a skill tree (`106`) |
| `title_clr` | 425–454 | the first completion's records (`201`–`215`) |
| `title_gyalel` | 11–88, 113–120, 381–424 | counts kept in the records block, outfits worn (`103`), and more (`102`–`165`) |

The functions the scripts call, as read: **0** award; **1** whether earned,
into a reference; **101** a member's vocation and that vocation's level;
**102** a member's sex; **106** a member's points in a skill tree; **110** the
grottoes cleared; **201** the first completion's time; **251** a monster's
defeated count; **252**, **253** a grotto's level cleared and its boss's.
Member −1 is the character `GameState+0x3ac` names (`func_020100a8`) —
INFERRED the Hero. The rest are listed, not read, in the reading.

**The earned bits** are `GameState+0x7504`, 0x3C bytes, bit `n` for accolade
`n` (`func_020ac460`; set only by `func_020ac3c8`, from overlay 23's
`func_ov023_021ed724`, which every awarding screen calls).

**A routine runs past a return** when a jump lands beyond it — every
candidate here ends `push 1; return` with its `else` jumped over it; see
"Event scripts".

## Evidence

| check | result |
|---|---|
| `loola_en.bin` places | **18**, their numbers 0 to 17 |
| overlay 17 runs with the place maps' shape | **1** |
| `riremito.bin` records read, each with ≥ 1 destination | **21 / 21** |
| `chur_messet.bin` maps | **18**: 16 of them `loola`'s revival maps, and 4106 and 4506, the Observatory's |



# Gathering spots — `/data/scenario/flditem.pac`, `/data/bin/izmitm.bin`

Read 6 October 2026 from the code that reads them (US ARM9 `func_0208e520`
and the opcodes it hands the command reader); the whole reading is
`docs/readings/T13-gathering.md`. All three are the game's `Script` command
files (tagged data tables, above).

**`flditem.pac`** is a NARC of `F01flditem.bin` … `F63flditem.bin` — 40 of
the fields — and `fldbias.bin` (with a `.svn` folder's copies the game never
names). A field's file is loaded as its map is entered, by `F%02dflditem.bin`.

`F<nn>flditem.bin`, tag `0x66`, one gathering spot each, 32 integers:

| value | meaning |
|---|---|
| 0 | the spot's id, 0–97, game-wide — 87 spots, none repeated |
| 1 | the item it gives |
| 2 | when it is there: 1 always, 2 once flag `0x798` is set, 3 once `0x796` is; 1 on all 87 |
| 3 | `unknown_3`: nothing reads it; 1 on all 87 |
| 4 | 8: values 5–7 are the spot's own; 0–7: they come from that row of `fldbias.bin` |
| 5 | minutes between refills: 30, 60, 90, 120, 240, 360 |
| 6 | the fewest an empty spot refills with |
| 7 | the most it holds — where value 4 is 8, the number of places listed |
| 8–31 | eight places, x y z in the files' units; the unused at 0 |

`fldbias.bin`, tag `0x67`, eight rows: the row's number, then for each of
eight variants (minutes, fewest, most). A game uses one variant, drawn at its
first start and saved. The rows are one cycle a step apart: (60, 1, 3),
(120, 1, 3), (180, 1, 3), (360, 1, 3), (60, 3, 4), (120, 4, 5), (180, 5, 6),
(360, 7, 8).

**`izmitm.bin`**, for Stornway's Guardian Fountain, `R01M07`: tag `0x66` its
two spots, 98 and 99, an id and seven places as floats; tag `0x68` a variant's
number and 16 items, of which the first 8 are given before story 19.
