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
