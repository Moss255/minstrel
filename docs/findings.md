# Findings

What has been established about the cartridge's formats, by what evidence, and
what is still unknown.

This is the consolidated record. Each package's `FORMAT.md` carries the full
struct layouts; this document is the account of *how* they were arrived at and
what the results actually are. No cartridge content is reproduced here — only
structure and counts.

---

## Contents

1. [The reference cartridge](#the-reference-cartridge)
2. [The rule, and why it is the rule](#the-rule-and-why-it-is-the-rule)
3. [What counts as an oracle](#what-counts-as-an-oracle)
4. [The containers](#the-containers)
5. [Compression](#compression)
6. [GPC2 — the Level-5 container](#gpc2--the-level-5-container)
7. [Audio](#audio)
8. [Title-specific formats](#title-specific-formats)
9. [Models](#models)
10. [Animation](#animation)
11. [Three renderer bugs animation exposed](#three-renderer-bugs-animation-exposed)
12. [Where the method caught a wrong answer](#where-the-method-caught-a-wrong-answer)
13. [Still open](#still-open)
14. [Evidence ledger](#evidence-ledger)

---

## The reference cartridge

A European release, game code ending `P`, 256 MiB. Header and Nintendo-logo
CRC-16 both verify. It is not in this repository and never will be; point
`VESPER_TEST_ROM` at your own dump to reproduce any of this.

| | |
|---|---|
| named files | 7,481 in 23 directories |
| FAT entries | 7,516 (7,481 files + 35 ARM9 overlays) |
| archives unpacked, including nested | 6,045 |
| members decompressed | 12,371 |
| files written by full extraction | 88,356, 346.9 MiB, about seven seconds |
| **files that remain undecoded** | **5** |

Those five are all in `data/prm/actdt_b.gp2`, one per language, and all use GPC2
codec 7 — the one compression variant on the cartridge that has not been
identified. Everything else on a 256 MiB cartridge comes out.

The single most consequential finding of the survey came early: **the entire 3D
and audio asset pipeline is stock Nitro SDK formats.** No custom model
container, no custom texture format, no custom sequence format. The custom work
is confined to one archive container and a handful of title-specific tables.

---

## The rule, and why it is the rule

**Never invent format details.** No guessed struct layouts, no guessed field
offsets, no guessed enum values. Parse only what is confirmed by observed bytes
or published documentation; carry unknown regions through as named opaque bytes
rather than skipping them; mark an inference `// INFERRED:` with its reasoning.

This is not fastidiousness. A plausible-looking invented offset is *worse than
no parser at all*: it produces code that appears to work on the samples in front
of you, fails silently on real data, and costs days to find. Every hard bug in
this project so far has been of exactly that shape — a reading that was right
for small inputs and wrong for large ones.

The practical consequence is that the work is not "read bytes until something
looks right". It is: form a hypothesis, then find something in the file that can
*disprove* it, and run that against every sample on the cartridge.

---

## What counts as an oracle

An oracle is a check the file itself can fail — something derived from the data
rather than from the code reading it. Five kinds have carried nearly all the
work here.

### Exact consumption

A size, a count or a length that must land precisely on a boundary the file
declares independently. This is the strongest routine check available, because a
decoder that is off by any amount lands somewhere else.

- A per-bone animation track's length, computed from its flag bits, has to land
  exactly on the *next* track's offset: **144,379 of 144,379**.
- BLZ decodes backwards; the walk has to consume input to exactly where the
  verbatim prefix ends, having taken a different number of steps for every
  overlay: **35 of 35**.
- A GPC2 archive's Huffman-compressed entry table has to consume exactly the
  bytes between the header and the name table.
- Animation curve data has to tile its region without any curve overlapping
  another: **no overlaps in any animation on the cartridge**.

### Cross-table agreement

Two independently-decoded things that must agree, where agreement by accident is
implausible.

The strongest single result in the project: a GPC2 member's name is recovered
from a separately-compressed name table, reached through an offset split across
two words, and checked against a CRC-32 stored elsewhere in the header. Three
independent decodings have to be right simultaneously. **53,639 of 53,639, zero
mismatches.**

Similarly: where a compressed member's filename carries a known extension, the
decompressed bytes must begin with that container's four-byte magic. A subtly
wrong decompressor does not land on the right stamp 7,274 times running.

### Mathematical invariants

Where the data is geometry, mathematics supplies checks the format does not.

- A compact "pivot" rotation stores two values that must be a cosine and a sine:
  `a² + b² == 1` holds for **all 93,811** entries in the animation pools and all
  4,644 in model nodes.
- A rotation matrix must be orthonormal with determinant +1. That forces the
  sign of the pivot cell — expanding the determinant along it gives
  `det = (-1)^(row+col) · sign`, so the sign is not a free parameter to guess.
- The five-value "basis" rotation stores row 0 and two cells of row 1; the
  missing cell is recovered from `|row1| == 1` and `row0 · row1 == 0`.
  **6,963 of 6,963** reconstruct orthonormal.
- Scale is stored as a value beside its reciprocal, so `v × next == 1` identifies
  the field: **367,707 of 367,811** sixteen-bit scale samples.

### Independent artefacts agreeing

The best oracle of all, when it exists: two files written by different parts of
the toolchain that must describe the same thing.

A model and the animation beside it are separate files. Posing the model with
frame 0 of its own animation reproduces the model's **own bind pose for 21,306
of 21,808 bones** across 1,795 same-named pairs. That single check exercises the
flag bits, the field order, the curve headers, both rotation pools and the
matrix construction at once — and none of it was fitted against the models.

For a long time this document's predecessor recorded that this oracle was
unavailable, because "an animation's archive usually does not contain the model
it drives". That was simply not checked hard enough: there are 2,404 model/animation pairs
sharing an archive and a bone count, and 1,795 of them share a name as well.

### Physical sanity

Weaker, but useful for triage.

- Byte entropy must *fall* when data is decompressed: **34 of 35** overlays (the
  exception is 20 bytes long).
- The first decompressed overlay opens `E92D4010 E1A04001` — `push {r4, lr}`
  then a register move, an ordinary ARM function prologue.
- Decoded glyphs must *look like* the characters their codepoints name.

### What is not an oracle

"Does the parser reach the end without throwing." Several hours were lost to a
weak version of exactly this — a check that accepted a render-command stream
terminating on a stray `0x01`. Refitted to require the terminator to land on the
material section, it discriminated properly. **An oracle that a wrong answer can
also pass is not an oracle.**

---

## The containers

### NitroFS and NARC

The cartridge filesystem and the archive format inside it share a FAT and an
FNT. Published references exist and are cited in
`packages/nitrofs/FORMAT.md`.

| check | result |
|---|---|
| named files walked | 7,481 across 23 directories |
| NARC archives parsed | 4,129 / 4,129 |
| members enumerated | 24,556 |
| header and logo CRC-16 | both match |

One correction to the obvious implementation: **filenames are bytes, not
ASCII.** A strict decode rejected two archives outright; two names contain
Shift-JIS. Names are now decoded byte-transparently and escaped reversibly on
extraction — 207 of them need it.

---

## Compression

### LZ10

Every LZ10 stream inside every NARC decompresses to *exactly* its declared
length: **11,179 of 11,179**.

The practical trap: **a leading `0x10` is not proof of compression.** 173 `.spr`
files begin `10 00 03 00`, where the `0x10` is a width. Identification is
therefore by successful decode to the declared length, not by signature. Inside
archives the signature happens to be exact — that is a property of this
cartridge, not of the format, and code that relies on it will break elsewhere.

### BLZ — backwards LZ

Used for the ARM binaries and overlays. It runs from the end of the buffer
toward the beginning, which is what lets a binary decompress in place at load
time, and keeps its parameters in a footer rather than a header. **The
displacement bias is 3, where forward LZ77 uses 1.**

This one mattered out of proportion to its size. **All 35 ARM9 overlays are BLZ
compressed, and so is the ARM9 binary itself** — 638 KB expanding to 1,000,984
bytes. Everything that had ever searched them, including two font hunts, was
reading compressed bytes. A megabyte of the game's code and strings was
unreadable and nothing had noticed.

| check | result |
|---|---|
| output is the length the overlay table declares | 35 / 35 |
| backwards walk lands exactly on the verbatim prefix | 35 / 35 |
| byte entropy falls (~7.2 → ~5.9 bits) | 34 / 35 |

### Huffman and run-length

Both BIOS variants, implemented headerless because GPC2 uses them that way.
Evidence is in the GPC2 results below, since that is where they occur.

---

## GPC2 — the Level-5 container

The one genuinely custom container on the cartridge: 1,671 files, 72.6 MiB,
magic `GPC2`. It holds the event scripts, the scenario data, the fonts, and the
bulk of the monster models.

| check | result |
|---|---|
| archives parsed | **1,671 / 1,671** |
| members indexed | 53,639 |
| **member names matching their stored CRC-32** | **53,639 / 53,639, zero mismatches** |
| members whose codec is implemented | 53,033 |
| those decoding to exactly the declared size | 53,028 |

Codecs, numbered by the container's own scheme rather than the BIOS's — each
*variant* gets a number, so the two Huffman symbol widths take 2 and 3 and
run-length lands on 4:

| codec | meaning | members |
|---|---|---|
| 0 | stored | 32 |
| 1 | LZ77, LZ10 unit encoding, no BIOS header | 39,559 |
| 2 | Huffman, 4-bit symbols | 368 |
| 3 | Huffman, 8-bit symbols | 2,438 |
| 4 | run-length | 7,743 |
| 7 | **unidentified** | 5 |

Three details made this hard, and all three are the kind of mistake that yields
a parser that works on small files and fails silently on large ones:

1. **The member count is 12-bit, not 8-bit.** The extra nibble sits in the high
   half of byte 5. An 8-bit reading works until an archive holds more than 255
   members.
2. **A name offset is split across two words**, a byte in each. Reading only the
   first byte works until an archive's names exceed 255 bytes.
3. **The index table is itself compressed** whenever it does not exactly fill
   the space before the name table — and the codec varies. The reader identifies
   it by *validating the result*: hashes strictly ascending, offsets in range,
   trying LZ77, then 4-bit Huffman, then 8-bit, then run-length.

---

## Audio

SDAT, the stock Nitro sound archive. All three on the cartridge open.

| check | result |
|---|---|
| archives parsed | 3 / 3 |
| files indexed | 1,714 |
| **file ids resolving to the stamp their record kind implies** | **1,714 / 1,714** |
| overlapping file ranges | 0 |
| sequence → bank → wave-archive chains resolving | 64 / 64 |

The chain check is the strong one: it walks a sequence's bank id into the bank
list, reads that bank's wave-archive ids, and resolves each — three lookups
through separately-parsed tables, all of which must be right. It is also
self-consistent by name, `BG_001` selecting `BANK_BG_001` selecting
`WAVE_BG_001`.

`bgm.sdat` holds 82 named sequences, 82 banks, 81 wave archives and 3 streams.
They extract under their own names.

What remains is **playback** — nothing decodes SSEQ's sequence commands, SBNK's
instruments or SWAR's ADPCM. That is a different job, scheduled late, and having
the resources named, extracted and chained is its prerequisite.

An important subtlety in the record table: only sequence, sequence-archive,
bank, wave-archive and stream records carry file ids. Treating every record kind
as file-bearing produces plausible-looking garbage.

---

## Title-specific formats

### The bitmap font

There is no NFTR resource anywhere on the cartridge; the standard Nintendo font
format is not used. The `.mes` files are a custom bitmap font, and that format
is fully read.

| check | result |
|---|---|
| fonts parsed | 529 / 529 |
| glyphs decoded | 70,604 |
| cell sizes | 525 × 12×12, 3 × 10×10, 1 × 8×8 |

The decisive check was rendering glyphs and confirming they look like the
characters their Shift-JIS codepoints name — nine consecutive ones verified by
hand when the format was first read, then the whole set by eye.

**Every one of those fonts is Japanese.** 70,540 of their codepoints are in the
kanji range and not one is a single-byte Latin codepoint. See
[Still open](#still-open) for where the European build's Latin font is not.

### The tagged record table

`.bmdj`, `.bats` and `mapbgm.bin` share one container of tagged records followed
by a string table.

| check | result |
|---|---|
| tables parsed | **1,260 / 1,260** |
| string count matching the header | 1,260 / 1,260 |
| record stream reaching the string table | 1,260 / 1,260 |
| resource names listed | 5,342 |

Two independent checks hold on every file: the string section decodes to exactly
the count the header declares, and the record stream — walked by nothing but its
own length fields — arrives *precisely* at the string table rather than before
or past it.

The useful outcome: a `.bmdj`'s string table lists a map's resources by name,
which makes it the **map-to-model manifest** — the thing that says which models
compose a map.

---

## Models

NSBMD, stock Nitro. Two independent self-consistency checks, both from the file
rather than from the code reading it:

| check | result |
|---|---|
| NSBMD files parsed | 6,889 / 6,889 |
| shapes decoded | 57,192 |
| **decoded vertex count == the model header's own count** | **6,889 / 6,889** |
| **decoded triangles == `numTriangles + 2 × numQuads`** | **6,889 / 6,889** |

An interpreter with a wrong parameter count or a missed partial-vertex command
desynchronises and fails both.

Three findings inside NSBMD were not obvious:

**A full 3×3 node rotation is stored as eight cells, not nine.** The ninth —
cell `[0][0]` — lives in a `u16` at `+0x02` that reads like padding. Taking nine
consecutive cells makes every such node two bytes too long, and the 4,578 nodes
that use this form then land off the dictionary's offsets.

**The pivot cell's sign is forced, not stored.** Determinant +1 requires
`sign = (-1)^(row+col)`. With that, all 4,644 pivot nodes come out orthonormal.

**The material dictionary is not the texture-name dictionary.** Reading the
wrong one put 23% of shape material indices out of range; the material dictionary
sits at `materialSection + 4`.

Render-command parameter counts were *fitted, not assumed*: every one of the
8,804 models parses to a clean `End` under them, and no other combination tried
does.

---

## Animation

NSBCA, and the largest single piece of work so far. The container and the
per-bone entry sizes had been read earlier; the *contents* of those entries had
not, and guessing them would have produced animation that looks approximately
right and is wrong — which is worse than none.

### Entry sizes

An entry's length is fully determined by its flags. A least-squares fit of
length against the flag bits over every distinct flags value gives whole
numbers, and they reproduce the length for all 202 of them:

```
length = 60 - 12·bit1 - 4·(bit3 + bit4 + bit5 + bit6 + bit8) - 24·bit9
```

Confirmed by exact consumption: **144,379 of 144,379** tracks land on the next
track's offset, across 10,473 animations.

### What the flags mean

| bit | meaning |
|---|---|
| 0 | the bone is not animated at all |
| 1 | no translation |
| 3, 4, 5 | translation X, Y, Z is constant |
| 6 | no rotation |
| 8 | rotation is constant |
| 11, 12, 13 | scale X, Y, Z is constant |

Bit 0 is redundant: set **exactly** when bits 1, 6 and 9 all are, 18,108 times,
and clear on the other 136,744, with no exception either way.

Bits 11–13 were the last to fall, because **they do not change an entry's
length** — a constant scale axis and an animated one both take eight bytes — so
the size fit could not see them. They were found by asking which flag bit
predicts whether an axis's eight bytes hold a value beside its reciprocal:

| | bit set | of those, a `(v, 1/v)` pair | bit clear | of those, a pair |
|---|---|---|---|---|
| X, bit 11 | 14,685 | 14,678 | 23,792 | **0** |
| Y, bit 12 | 15,354 | 15,353 | 23,123 | **0** |
| Z, bit 13 | 18,680 | 18,643 | 19,797 | **0** |

The separation is total in the direction that matters: a slot whose bit is clear
is *never* a reciprocal pair. The handful of set-but-not-a-pair slots have a
value of zero, which has no reciprocal.

### Curves

An animated quantity is a curve header: a first frame, a last frame in 13 bits,
a three-bit code above it, and an offset. Sample counts were *measured*, not
assumed — taking each curve's span as the distance to the next distinct sample
offset in the same animation:

| kind | code | bytes per frame | curves |
|---|---|---|---|
| translation | 0 | exactly 4.000 | 33,274 |
| translation | 1 | exactly 2.000 | 50,997 |
| rotation | 0 | exactly 2.000 | 88,017 |
| scale | 0 | exactly 8.000 | 4,026 |
| scale | 1 | exactly 4.000 | 56,120 |

So the code's low bit selects the sample width, translation samples are `fx32`
or `fx16`, rotation samples are always `u16` pool references, and a scale sample
is a value with its reciprocal beside it. With those sizes, **no curve in any
animation on the cartridge overlaps another**.

### The two rotation pools

A rotation reference's top bit picks the pool; the remaining fifteen bits index
it.

- **Bit set — the pivot pool**, six bytes: a `u16` whose low nibble is the pivot
  index, then two `fx16`. The same encoding a model's bind-pose nodes use, down
  to the forced sign. All 9,543 such references land inside the pool, and every
  one of the 93,811 reachable entries satisfies `a² + b² == 1`.
- **Bit clear — the basis pool**, ten bytes: five values in **1.0.15**, not the
  1.3.12 the geometry engine takes. All 6,963 land in the pool at a stride of
  ten, all have a unit vector in their first three values, and all reconstruct
  to an orthonormal 3×3.

Recovering the basis's missing cell straight from `row0 · row1 == 0` divides by
`row0[2]` and loses 525 of them to precision. Taking the magnitude first —
`|row1| == 1` fixes the size, the dot product fixes only the sign — brings all
6,963 out clean.

### What an absent component means

The identity, not "keep the bind pose". Where a track carries no translation the
model's bind pose has that bone at the origin — **5,883 of 5,884** — and where
it carries no scale the bind scale is one — **7,828 of 7,828**.

### The check that ties it together

Posing a model with frame 0 of its own animation reproduces the model's own bind
pose for **21,306 of 21,808 bones** across 1,795 pairs. The remainder are
animations that genuinely do not open on the bind pose.

All 10,473 animation files also sample at five frames each without a single
out-of-range read.

---

## Three renderer bugs animation exposed

Two of these are invisible in the bind pose and glaring the moment a model
moves. The third made one model look like a decode failure when its display list
was fine.

### Blend terms need an inverse bind transform

A blend command's terms are three values each, and the middle one had been
treated as padding. It is the node whose **inverse bind** transform the term
composes with: a valid node index for all **12,543** terms, differing from the
stack slot beside it in 7,061 of them, so not the slot restated. In the bind
pose the slot holds exactly that node's world transform — 12,504 of 12,543 — so
`slot × inverseBind[node]` is the identity there.

With it applied, **all 6,093 blend commands resolve to the identity** at the
point they are computed. Without it, a blend resolves to the identity only by
accident.

### Stack slots are reused

A model draws a shape, overwrites the slots it bound, and draws the next. The
stack left after the last command is not the one most shapes saw; each shape has
to be posed against the stack as it stood when *that* shape was drawn.

### The position scale

A model's positions are stored small and scaled up when drawn. Three things
carry that scale and all three were being ignored:

- **`MTX_SCALE` in a display list is always the model's own `upScale`**, uniform
  on all three axes — **126,616 of 126,616**.
- **The `PositionScale` render command applies it before the shape is drawn**,
  outside the display list. A model emits it exactly when `upScale` is not one:
  of the 2,901 models that never emit it, 2,898 have an `upScale` of 1.
- **`MTX_RESTORE` drops it**, by loading a stored matrix over the current one. A
  list that restores mid-shape re-applies `MTX_SCALE` immediately; one that does
  not never emits another vertex — **0 of 1,637,744** — so no vertex is ever
  left at the wrong scale. That is what confirms the reading.

A separate detail fell out of the same investigation: **every** shape emits
vertices before its own display list's first `MTX_RESTORE` — 1,864,237 of them —
and those belong to the slot the render commands left current, which for 3,610
shapes is not slot 0.

Together these make skinning exact: every genuinely blended vertex on the
cartridge stays where the display list put it, **1,018 of 1,138 models to the
last bit, and nothing anywhere out by more than 0.03** — a fixed-point rounding,
on models tens of units across.

---

## Where the method caught a wrong answer

Four times, so far. Each is recorded here because the failure mode is more
instructive than the fix.

### GPC2 codec 4 was declared "not run-length" on a test pointed at codec 3

The test decoded 3 of 334 regions and the conclusion was written down as fact.
Against codec 4, run-length matches **7,743 of 7,743**, each decoding to exactly
its declared size and consuming exactly its stored payload. *A negative result
is only as good as the thing it was actually run against.*

### Eleven archives were blamed on a wider name offset

The reader could not follow the index of eleven archives, including the ones
holding the player-character models, and the recorded explanation was that the
name offset must be wider than 16 bits in some variant. It is 16 bits
throughout. Those archives simply encoded their **entry table** with a codec the
reader did not try. *A theory that explains the symptom is not the same as one
the data supports.*

### The name table was called "a trie with interleaved control bytes"

It is a plain NUL-separated list. It was compressed. *Structure inferred from
the shape of undecompressed data is not structure.*

### A skinning measurement counted the wrong vertices

The first report of the inverse-bind fix said 718 of 1,138 models were correct
and blamed the remainder on an undecoded flag. The measurement classified a
vertex as "blended" if its matrix slot was a blend destination *anywhere in the
model*. Slots are reused, so vertices drawn against a slot that had since been
overwritten were scored as broken skinning — on one model that read a 113-unit
error into output that was correct. Judged per shape, the real figure is 1,018
of 1,138 with nothing out by more than 0.03. *An oracle needs auditing as much
as the code it tests.*

---

## Still open

Honest list. None of these blocks current work.

**GPC2 codec 7.** Five members, one archive, one per language. The only files on
the cartridge that do not come out.

**The European build's Latin font.** There is no NFTR resource; the `.mes` fonts
are all Japanese. Searched without success: every file matching the font
header's shape across the whole extraction; files named like fonts; the NCGR and
NCLR graphics; `data/bin`; and — after the BLZ discovery — the decompressed ARM9
binary and all 35 overlays, at 1, 2 and 4 bits per pixel across thirteen cell
geometries. Nothing.

Two facts constrain it sharply. **Accents are ASCII markup, not high bytes** —
French reads `B<'e>rang<`e>re`, German `Gef<:u>hl` — so the font needs about 95
plain ASCII glyphs, roughly 1.7 KB at 12×12 and one bit per pixel. It is small
enough to hide almost anywhere. And **the only font resources the ARM9 names are
the Japanese ones**. What the ARM9 does contain is the markup parser as *code* —
instruction immediates comparing characters against accent prefixes. Reading
further means disassembly, which is outside what this repository does.

It is also not a dependency: the dialogue system is specified to render with a
vector font, so the cartridge's 12×12 bitmap glyphs are a reference for metrics
and letterforms, not an input. Recorded as an unresolved reference.

**The `0x40` node-transform parameter.** Still undecoded, though nothing
measurably depends on it now.

**Animation step codes.** Bits 14–15 of a curve header take the values 0, 1 and
2 and are read as a frame step of 1, 2 and 4. Only step 1 is confirmed. The
wider steps cover about 1% of curves; the sample count used for them is inferred
from their layout not overlapping, and it never over-reads.

**What the model header's bounding box describes.** Posed geometry comes out
either the same size as the box or exactly twice it, in two clean peaks — 3,132
models at ~1 and 2,657 at ~2, on both sides of the `upScale` divide, so it is a
property of the box rather than of the scaling. Nothing reads it.

**The map-to-music link.** All 82 sequences are extracted and named, so this is
a selection problem rather than an extraction one. `mapbgm.bin` looked like the
answer and is not: its second `u16` takes values from `0x0580` to `0x0857` where
a sequence index would sit in 0–81, and 68 records is far too few to cover ~1,400
maps. The per-map `.bats` and `.bmdj` files parse completely and carry no music
field. Recorded as an unsolved lead, not an answer.

**`SB2` event script bytecode.** Every event unpacks to one `.stb` carrying
magic `SB2\0` plus one string table per language. Per-event data exists as data,
with its text separated from its structure — a strong signal — but whether `SB2`
is bytecode for an interpreter or parameters for hardcoded routines has not been
examined.

**`.col2`.** 1,178 members, 4.3 MiB. The name suggests collision. Not
investigated.

**SSEQ/SBNK/SWAR playback.** Resources are named, extracted and chained;
nothing decodes sequence commands, instruments or ADPCM.

---

## Evidence ledger

### Reproduced by the harness

`tools/harness/test/cartridge.test.ts` runs these against a real dump. They are
skipped by default and never run in CI.

The harness walks the cartridge filesystem and the NARC archives in it. It does
**not** recurse into GPC2, which is why its model population is 6,889 files
where a scan over the full extraction sees 8,804 models — the difference is the
monster and character models that live inside `.gp2` archives. Both populations
are stated where they are used; neither is a superset of the other by accident.

| area | check | result |
|---|---|---|
| NitroFS | NARC archives parsed | 4,129 / 4,129 |
| NitroFS | header and logo CRC-16 | both match |
| LZ10 | streams decoding to exactly the declared length | 11,179 / 11,179 |
| LZ10 | decompressed bytes matching the extension's magic | 7,274 members |
| BLZ | overlays decoding to the declared length | 35 / 35 |
| BLZ | backwards walk landing on the verbatim prefix | 35 / 35 |
| BLZ | byte entropy falling | 34 / 35 |
| GPC2 | archives parsed | 1,671 / 1,671 |
| GPC2 | member names matching their stored CRC-32 | 53,639 / 53,639 |
| GPC2 | members decoding to exactly the declared size | 53,028 / 53,033 |
| SDAT | file ids resolving to the stamp their kind implies | 1,714 / 1,714 |
| SDAT | sequence → bank → wave-archive chains | 64 / 64 |
| SDAT | overlapping file ranges | 0 |
| font | fonts parsed, glyphs decoded | 529 / 529, 70,604 |
| tables | tagged tables parsed | 1,260 / 1,260 |
| tables | record stream reaching the string table | 1,260 / 1,260 |
| NSBMD | files parsed | 6,889 / 6,889 |
| NSBMD | decoded vertex count == the header's own | 6,889 / 6,889 |
| NSBMD | decoded triangles == `numTriangles + 2 × numQuads` | 6,889 / 6,889 |
| NSBMD | bones and render commands read without failure | all models walked |
| NSBMD | blended vertices staying put in the bind pose | nothing over 0.1; over 85% of models exact |
| NSBTX | texture data sizes tiling their block | over 95% |
| NSBCA | track sizes landing on the next track's offset | 144,379 / 144,379 |
| NSBCA | curves overlapping another curve | 0 |
| NSBCA | files sampling without an out-of-range read | every animation, five frames each |
| NSBCA | frame 0 reproducing the model's own bind pose | over 95% of bones |

The harness asserts thresholds rather than exact counts where a count would
change with the dump — a different regional build has a different number of
files, and a test that hard-codes one is a test that fails for the next person
who runs it.

### From scans over the full extraction

These reach into GPC2 as well, so they see more models. They are one-off
measurements rather than standing tests; the figures are what the fits and
oracles were established against.

| area | check | result |
|---|---|---|
| NSBMD | render-command streams reaching a clean `End` | 8,804 / 8,804 |
| NSBMD | blend commands resolving to the identity in the bind pose | 6,093 / 6,093 |
| NSBMD | blend terms whose middle parameter is a valid node index | 12,543 / 12,543 |
| NSBMD | blended vertices staying put in the bind pose | 1,018 / 1,138 models; nothing over 0.03 |
| NSBMD | `MTX_SCALE` values equal to the model's `upScale` | 126,616 / 126,616 |
| NSBMD | vertices left at the wrong scale after a restore | 0 / 1,637,744 |
| NSBCA | pivot pool entries satisfying `a² + b² == 1` | 93,811 / 93,811 |
| NSBCA | basis pool entries reconstructing orthonormal | 6,963 / 6,963 |
| NSBCA | frame 0 reproducing the model's own bind pose | 21,306 / 21,808 bones, 1,795 pairs |
| NSBCA | scale axes whose flag bit predicts a reciprocal pair | 0 false positives in 66,712 |

---

## What the record is for

Two things.

Every claim above is falsifiable against a dump anyone can supply, and the
harness reproduces the standing ones. If a future change breaks a reading, one of
those checks stops passing and says so immediately — which is the entire reason
they are counted rather than spot-checked. The one-off scans are not standing
tests; where a figure from one matters enough to defend, it belongs in the
harness, and moving them there is worth doing.

And the corrections are kept deliberately. Three of the four wrong answers above
were written down as established fact before they were disproved, and each was
caught only because something later contradicted a number. That is the argument
for the rule at the top: the cost of a plausible guess is not that it is wrong,
but that it stops looking like a question.
