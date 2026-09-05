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

### 2. `.ambl` / `.amdj` members

Both are NARCs, so the container is solved. Inside:

- `.amdj` holds `.nsbmd` map geometry (plus `L1`..`L4` and `N1`..`N4` variants,
  probably level-of-detail or day/night) and a small `.bmdj` alongside.
- `.ambl` holds `.bats` files, uniformly 736 bytes for most maps.

`.bmdj` and `.bats` are unidentified. Their leading bytes are small integers
(`04 00 00 00`, `03 00 00 00`, …) that look like counts rather than magic, which
suggests plain headerless record tables rather than a container. Collision and
per-map attributes are the obvious candidates. **Not yet investigated.**

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

| M0 task | status |
|---|---|
| NitroFS parser and file dump | **done** — parser, CLI, and gated integration tests |
| Identify and extract slice assets | **extraction done for everything readable**; *which* files the slice needs is still open |
| Run apicula; record what converts | **not started** — needs a Rust toolchain installed locally |
| Locate the slice's event scripts | **located and extracted** — `data/event/ev#####.gp2` now unpack to an `SB2` container plus per-language string tables |

Extraction is complete and proven against the whole cartridge: every stock asset
is now a plain file on disk. What remains is knowing which of them the slice
needs, one custom container, and an apicula run.
