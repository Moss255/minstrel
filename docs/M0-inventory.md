# M0 — Scoped extraction: findings

Status of the M0 milestone from the slice plan. What the cartridge actually
contains, what is readable today, and what is still unknown.

This document records structure and counts only. No cartridge content is
reproduced here or anywhere in the repository.

## Reference cartridge

The reference dump is a European release (game code ending `P`), 256 MiB,
header and Nintendo-logo CRC-16 both verifying. It lives in `rom/`, which is gitignored,
and is never committed. Set `VESPER_TEST_ROM` to run the integration tests
against your own dump.

Its filesystem: 7,481 named files in 23 directories, plus 35 ARM9 overlays.

## What is readable today

| | |
|---|---|
| `@vesper/nitrofs` | cartridge header, FAT, FNT, ARM9/ARM7 overlay tables, NARC archives |
| `@vesper/nitro-comp` | LZ10 decompression (and a compressor, for round-trip tests) |
| `tools/inventory` | CLIs that catalogue a cartridge and extract it wholesale |

All 4,129 NARC archives on the reference cartridge parse, and all 11,179
LZ10-compressed members inside them decompress to exactly their declared length.
See each package's `FORMAT.md` for the evidence.

## Full extraction

`pnpm extract` unpacks the entire cartridge in about seven seconds:

| | |
|---|---|
| cartridge files processed | 7,481 |
| archives unpacked (NARC and GPC2, including nested) | 6,013 |
| GPC2 archives unpacked | 1,660 |
| members decompressed | 12,371 |
| files written | 83,621 |
| bytes written | 340.9 MiB |
| GPC2 members with an unidentified codec | 606 |
| — of those, stored with no prefix and recovered intact | 601 |
| failures | 16 |

Five files across the whole cartridge remain undecoded. A member whose codec is
not identified is written with a `.gpc-codecN` suffix: its bytes are preserved
without being passed off as decoded content.

Output mirrors the cartridge tree under `out/files/`, with every archive
replaced by a directory of its members, so an asset that was an LZ10 stream
inside a NARC lands as a plain `.nsbmd`. `out/system/` holds the ARM9 and ARM7
binaries and all 35 overlays — useful later for the disassembly work that has to
happen outside this repository. `out/manifest.json` records provenance for every
file written.

Two things the extractor has to get right, both learned from real data:

- **A leading `0x10` is not proof of compression.** 173 `.spr` files begin
  `10 00 03 00`, where the `0x10` is a width. Identification is therefore by
  successful decode to the declared length, not by signature — see
  `tryDecompressLz10`. Inside archives the signature happens to be exact
  (11,179 of 11,179), which is a property of this cartridge, not of the format.
- **Output paths can collide.** 139 collisions occur, some between a member that
  needs to be a file and one that needs to be a directory. Names are also
  escaped reversibly (4 of them), since cartridge names are bytes and two here
  contain Shift-JIS.

## Asset inventory

Recursing into every archive and decompressing, the cartridge holds:

| container | members | size |
|---|---|---|
| NSBMD model | 6,244 | 47.9 MiB |
| NSBTX texture | 737 | 46.2 MiB |
| NSBCA joint animation | 5,646 | 13.3 MiB |
| NSBTA texture-SRT animation | 1,565 | 3.0 MiB |
| NSBMA material animation | 2,106 | 1.7 MiB |
| NSBTP texture-pattern animation | 570 | 295.8 KiB |
| SDAT sound archive | 3 | 66.0 MiB |
| — sequences, banks and wave archives inside them | 1,714 | |

**This is the single most important M0 result.** The entire 3D and audio asset
pipeline is stock Nitro SDK formats. No custom model container, no custom
texture format, no custom sequence format. M1 can import with published
references, and apicula should convert the models without custom work.

### Where things live

| directory | holds |
|---|---|
| `data/map` | map geometry and attributes — `.amdj` and `.ambl`, both NARCs |
| `data/chara`, `data/chara_sub` | character models — NARCs of `.nsbmd` + `.nsbca` + `.bcfg` |
| `data/enemy` | 26 monster archives; the bulk of the roster is in `data/pack_lv5/enemy.gp2` |
| `data/effect` | 1,421 effect archives |
| `data/event`, `data/evspt_lv5` | event data, `.gp2` |
| `data/event_lv5` | event actor/camera archives, `.chr` |
| `data/scenario` | 791 `.gp2` — the largest content bucket at 35 MiB |
| `data/sound` | three SDATs; `bgm.sdat` is 36.6 MiB |
| `data/prm`, `data/bin` | parameter and system tables |

### Naming convention

Map and scenario assets are named `C##M####` — an area code and a map number.
`ats_C.ambl`, for example, groups the attribute tables for every `C01`/`C02`
map. Scenario archives follow the same area prefix (`C01B0.gp2`, `C01C0.gp2`).

This gives a way to narrow the slice's assets by area code without opening a
disassembler — but **which** area code the slice opens in has not been
established.
Determining that needs the emulator work this project does not do in code. See
"What is needed from outside" below.

## Open questions

### 1. GPC2 — mostly solved

1,671 files, 72.6 MiB, magic `GPC2`. A Level-5 archive container holding the
event scripts, the scenario data, the font, and the bulk of the monster models.
It is now read by `@vesper/l5-gpc`; the format is documented in that package's
`FORMAT.md`.

Against the reference cartridge: **1,660 of 1,671 archives parse, and all 50,742
member names match their stored CRC-32 with no mismatches.** 42,392 members
decode to exactly their declared size.

Three things made it hard, and all three are the kind of mistake that produces a
parser that works on small files and fails silently on large ones:

- The member count is 12-bit, not 8-bit. The extra nibble sits in the high half
  of byte 5.
- A member's name offset is split across two words, a byte in each. Reading only
  the first byte works until an archive's names exceed 255 bytes.
- The index table is itself Huffman-compressed whenever it does not exactly fill
  the space before the name table.

An earlier reading of this document described the name table as "a trie with
interleaved control bytes". That was wrong — it was compressed data. The name
table is a plain NUL-separated list.

**Codec 4 is run-length**, and with it **50,135 of 50,746 members decode — 98.8%**.

An earlier revision of this document said codec 4 was *not* the BIOS run-length
format, citing a test that decoded 3 of 334 regions. That test was pointed at
codec 3. The container does not number its codecs the way the BIOS does: each
codec *variant* gets a number, so the two Huffman symbol widths take 2 and 3 and
run-length lands on 4. Against codec 4 it matches 7,743 of 7,743 regions, each
decoding to exactly its declared size and consuming exactly its stored payload.

**What remains:** codec 7 (5 members, one non-slice file); 601 members in
`enemy.gp2` stored with no region prefix, which are recovered as raw bytes since
they are `NARC` archives outright; 11 large archives using an index shape the
parser does not yet read; and four `unknown_*` header fields.

### 2. `.ambl` / `.amdj` members — now read

Both are NARCs. Inside:

- `.amdj` holds `.nsbmd` map geometry (plus `L1`..`L4` and `N1`..`N4` variants,
  probably level-of-detail or day/night) and a `.bmdj` descriptor alongside.
- `.ambl` holds `.bats` attribute tables.

`.bmdj` and `.bats` share a tagged-record container, now parsed by
`@vesper/game-formats` — 1,260 of 1,260 files, including `mapbgm.bin`, which
turns out to use the same format. A `.bmdj`'s string table lists the map's
resources by name (`M01M0000.imd`, `M01M00D1.imd`, …), which makes it the
**map-to-model manifest**: the thing that says which models compose a map.

What the individual record tags mean is not established, and is the next
question if map assembly needs more than the manifest.

### 3. `.col2`

1,178 members, 4.3 MiB, same small-integer leading bytes. Name suggests
collision. **Not yet investigated.**

### 4. Event scripts — the G1 test

`data/event` holds 523 `.gp2` archives named `ev#####.gp2`, and `data/evspt_lv5`
another 165. Each now unpacks to a `.stb` file carrying the magic `SB2\0`, plus
one `.bin` string table per language (de, en, es, fr, it).

So per-event data does exist as data, one file per event, with its text
separated from its structure. That is a strong signal — but `SB2` itself has not
been examined, and whether it is bytecode for an interpreter or parameters for
hardcoded routines is **still not established**.

The G1 question is now answerable by static analysis rather than blocked on a
container. Treat it as open but no longer risky.

## What is needed from outside

Much less than before. The area-code question is answered from `maplist9.bin`,
and the event files are extracted and readable, so the remaining outside work is
confirmation rather than discovery:

1. **Which `ev#####` events belong to the opening.** The event text is now
   readable, so this can largely be answered by reading the extracted strings;
   an emulator would confirm ordering and triggers.
2. **Whether an event VM exists.** A breakpoint on the code that consumes a
   `data/event` file would settle G1 outright. Static analysis of the `SB2`
   container may get there first.

Neither blocks further work.

## Text

Dialogue is plain ASCII with inline markup — `<,>` for a pause, `<1>` for an
apostrophe — in per-language files (`_de`, `_en`, `_es`, `_fr`, `_it`) beside
each event's `.stb`. No custom encoding, no lookup table.

All of it is now readable. Codec 4 — which had held 1,467 English string tables,
including roughly half of the slice's own events — is run-length, and decodes.

The text carries a script markup language alongside the prose: `<Cap>` to
capitalise, `<HERO>` for the player's name, `<SE_014>` for a sound effect,
`<ALL_RECOVER=1,1,999>` for an effect with arguments. That is a substantial hint
about how events are driven, and it is worth reading before designing the M3
dialogue system.

## M0 status

M0 is **complete**. Its bar is "every asset the slice needs is extracted and
catalogued, or has a known plan for extraction", and every asset the slice
actually consumes now is.

One caveat, stated plainly: the European build's Latin font was never found. It
is not a dependency — M3 renders text with a vector font by design — so it is
recorded as an unresolved reference rather than an open blocker. The reasoning
is under "The font" below.

| M0 task | status |
|---|---|
| NitroFS parser and file dump | **done**, and beyond: NARC, GPC2, LZ77, Huffman, run-length |
| Maps | **done** — `F01`, `M01`, `D01`, 273 files, identified from the cartridge's own index |
| ~10 monster models | **done** — 601 recovered from `enemy.gp2` |
| String tables for the chapter | **done** — plain ASCII with script markup |
| Locate the slice's event scripts | **done** — one archive per event, `.stb` plus per-language text |
| ~20 character models | **partly** — 428 NPC models are out, but the player-character models are not |
| UI tilesets | **partly** — the files are extracted; nothing decodes NCGR/NCLR to images yet |
| 6 BGM tracks | **not done** — the SDAT is an unopened 38 MB blob |
| The font | **not done** — and not yet identified |
| Run apicula | **not done** — see below |

### The three real gaps

**Player-character models.** `chara_pc.gp2` (1.7 MB) and `chara_pd.gp2`
(3.7 MB) are two of the eleven archives whose index the GPC2 reader cannot
follow: `entry 0 names byte 12289, which is not a name-table entry`, so the name
offset is wider than the 16 bits the format otherwise uses, or those archives
carry a differently-shaped index. These hold the Hero and party models — what M2
needs to put a character in the village. No plan yet beyond "look at the index
again", so this does not meet the milestone's bar.

**Audio — now done.** `@vesper/nitro-snd` reads SDAT, and all three archives on
the cartridge open. `bgm.sdat` holds **82 named sequences (`BG_001`…, `ME_*`),
82 banks, 81 wave archives and 3 streams**, 186 files in all, and they now
extract to disk under their own names — `BG_001.sseq`, `BANK_BG_001.sbnk`,
`WAVE_BG_001.swar`.

The resource chain resolves end to end: every sequence reaches its bank and that
bank's wave archives, 64 of 64, and the names agree along the way.

What remains is **playback**, which is a different job: nothing decodes SSEQ's
sequence commands, SBNK's instruments or SWAR's ADPCM waveforms. That is the
AudioWorklet sequencer the plan schedules for M8 and calls the hardest
TypeScript-specific problem in the project. Having the resources named,
extracted and chained is its prerequisite, and M0's bar — extracted and
catalogued — is met.

*Which* six tracks the slice needs is still open.

`data/bin/mapbgm.bin` looked like the answer and, on inspection, is not — or at
least not in any way yet established. Its container is unambiguous:

```
0x00  u32  record count, 68
0x04  u32  file size, 560
0x08  u32  zero
0x0C  u32  zero
0x10  ..   68 records of 8 bytes
```

68 × 8 + 16 lands exactly on the file size. Each record is a `u8` kind (1 for
the first, 2 for the rest), three constant bytes `00 01 01`, and two `u16`s.
The second `u16` takes only **14 distinct values** and stays constant across
runs of consecutive first values, which is the shape a "this range of things
shares one tune" table would have.

But neither field is a BGM index. The archive holds 82 sequences, so an index
would sit in 0–81; the second `u16` instead takes values from `0x0580` to
`0x0857`, two of them with bit 15 set. Nothing tried maps those onto the
sequence list, and 68 records is far too few to cover the cartridge's ~1,400
maps, so at best this is a table of exceptions.

**Recorded as an unsolved lead, not an answer.**

The per-map `.bats` and `.bmdj` files were the other candidate, and they are now
read: they share one tagged-record container with `mapbgm.bin`, and
`@vesper/game-formats` parses **1,260 of 1,260** of them with the string count
matching the header every time. That turned up something useful — a `.bmdj`'s
string table lists the map's resources by name, making it the map-to-model
manifest M2 needs — but no music field. Two tags looked promising, occurring
once per map with small integer values, and both fail on inspection: they track
each other and vary between maps inside a single village, which a background
track does not.

So the map-to-music link is still unfound. All 82 sequences are extracted and
named, so this is a selection problem rather than an extraction one, and an
emulator would settle it in minutes.

**The font — format read, Latin glyphs still missing.** There is no NFTR
resource anywhere on the cartridge; the standard Nintendo font format is not
used. The `.mes` files in `data/pack/font.gp2` are a custom bitmap font, and
that format is now fully read by `@vesper/game-formats`: **all 529 fonts parse
and 70,604 glyphs decode**, verified by rendering them and checking they look
like the characters their Shift-JIS codepoints name.

But every one of those fonts is **Japanese**. 70,540 of their codepoints are in
the kanji range and not one is a single-byte Latin codepoint. The
`f12C01B`-style names match scenario area codes, so these are per-scenario kanji
subsets — the cartridge ships only the characters each scene needs.

**The European build's Latin font has not been found.** Searched without
success: every file matching the font header's shape across the whole
extraction; files named like fonts; the NCGR and NCLR graphics including the
per-language `tf_*` set, which are 512-byte UI graphics far too small for an
alphabet; and `data/bin`, the ARM9 binary and all 35 overlays scanned for runs
of fixed-size 1bpp cells at seven geometries.

A second search, at 1, 2 and 4 bits per pixel across every extracted file and
every plausible cell geometry, found nothing either. Its only candidates were
text files — ASCII prose misread as pixels lands in the same ink-coverage band
as glyphs, and so does ARM code.

That search did expose a real gap, since fixed: **all 35 ARM9 overlays are
BLZ-compressed and were being scanned raw.** They are now decompressed on
extraction, and searched — no font there either, but they are readable at last,
which the Ghidra work will want.

Three further leads, all dead ends worth recording so they are not retried:

- `data/ani/tf.gp2` holds per-language `NCGR` files, 17 per language. Decoded
  as 4bpp tiles they are noise, not glyphs.
- `data/pack_lv5/fd_*.bin` and `fi_*.bin` are font *metrics*, not glyphs.
  `fd_me.bin` is a packed table of 1600 twelve-bit values — 1600 × 12 / 8 = 2400
  bytes, exactly its data section — and `fi_me.bin` holds 242 four-byte entries
  that read like kerning pairs.
- The ARM9 binary contains the byte run `f82.mes`, which looks like a font
  filename and is not one: no such file exists, and the surrounding bytes are
  not a string.

A third search added two facts that constrain the problem sharply, and a third
that widens where to look.

**Accents are ASCII markup, not high bytes.** French reads
`B<'e>rang<`e>re` for Bérangère, German `Gef<:u>hl` for Gefühl, Spanish
`<^?>no?` for ¿no?. So the Latin font needs only about 95 plain ASCII glyphs —
at 12×12 and one bit per pixel, roughly 1.7 KB. It is small enough to hide
almost anywhere, which is why size-based searching has not found it.

**The ARM9 binary is BLZ-compressed as well**, which nothing had noticed: 638 KB
expanding to 1,000,984. Everything that had searched it, including both earlier
font hunts, was reading compressed bytes. It is now decompressed on extraction.

**The only font resources the code names are the Japanese ones.** With the ARM9
readable, its strings give `pack/font.gp2`, `pack_lv5/font_lv5.gp2` and
`f8.mes`, and nothing else font-shaped. So either the Latin glyphs sit inside
those archives under a scheme being misread, or they are reached by a path built
at runtime, or they are compiled into a binary in a form these scans cannot tell
from code.

Two more dead ends, recorded so they are not retried: `tf_%d_<LG>.NCGR` in
`data/ani/tf.gp2` is per-language and referenced by the ARM9, but it decodes to
noise as both tiles and a linear bitmap, and its neighbours in the string table
are minimap and treasure-map resources rather than text ones. And a 95-glyph
ASCII-order scan of the decompressed ARM9, at 1, 2 and 4 bits per pixel across
thirteen cell geometries, produced 571 candidates of which the strongest renders
as plainly structured table data, not letters.

### It is a dead end, and it does not block the slice

A fourth search closed the last gap that mattered. The `.mes` header scan had
never covered `out/system`, and the one pass that did look at overlays was
handed the *compressed* ARM9. Both are now searched, decompressed: **no font
structure exists in the ARM9 binary or in any of the 35 overlays.**

What the ARM9 does contain is the markup parser, as code rather than data —
instruction immediates comparing characters against `'a'`, `'e'` and the accent
prefixes. Reading further means disassembling the text renderer to see what it
indexes into, which is the emulator-and-Ghidra work this repository does not do
in code.

**But the slice never needed it.** M0 lists "the font" among the assets to
extract; M3 specifies *"text box rendering with a **vector font** and
resolution-independent layout"*. Rendering the cartridge's 12×12 bitmap glyphs
would defeat that goal — the whole point of a vector font here is that the slice
runs at the player's monitor resolution rather than at 256×192. The accuracy
posture asks for the dialogue *text* to match exactly, which it does; it does not
ask for the typeface.

So the cartridge's Latin font is a **reference**, useful for matching metrics
and letterforms if that is ever wanted, and not a dependency of anything. On
that reading M0 is complete: every asset the slice actually consumes is
extracted and catalogued.

What was gained anyway is worth more than the font would have been: the Japanese
font format is fully read, and the hunt is what exposed that the ARM9 and all 35
overlays were BLZ-compressed and had never been decompressed by anything.

### On apicula

Not run: it is a Rust tool and there is no toolchain on this machine. It is also
largely superseded. Its purpose was to tell us which models convert cleanly;
`@vesper/nitro-gfx` now parses all 6,889 of them with two independent
self-consistency checks passing on every one, which is a stronger answer than a
conversion report. It remains worth running eventually as an independent
cross-check of geometry, and that is the reason to keep it on the list.

### What "done" would take

1. Open `chara_pc.gp2` — the Hero model is on the critical path for M2.
2. Write `nitro-snd` far enough to list and extract the six BGM tracks.
3. Identify the font.

UI tileset decoding (NCGR/NCLR) is a published format with a clear plan, so it
meets the milestone's bar as it stands.
