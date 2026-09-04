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
| `tools/inventory` | CLI that catalogues a cartridge, optionally recursing into archives |

All 4,129 NARC archives on the reference cartridge parse, and all 11,179
LZ10-compressed members inside them decompress to exactly their declared length.
See each package's `FORMAT.md` for the evidence.

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

### 1. GPC2 — Level-5's archive container

1,671 files, 72.6 MiB, extension `.gp2`, magic `GPC2`. It holds the event
scripts, the scenario data, the font, and the bulk of the monster models. It is
the one format standing between here and most of M3.

Observed so far, from two samples:

```
0x00  char[4]  'GPC2'
0x04  u8       member count      (6 and 5 in the two samples; both agree with
                                  the entry-table length below)
0x05  u8       0x30              (same in both samples; meaning unknown)
0x06  u16      0x0005            (same in both samples; meaning unknown)
0x08  u16      unknown_0x08      (0x18 / 0x15)
0x0A  u16      unknown_0x0a      (0x24 / 0x20)
0x0C  u16      unknown_0x0c      (0x12 / 0x0F)
0x0E  u16      unknown_0x0e      (0x16 / 0x12)
0x10  u32      unknown_0x10
0x14  u32      unknown_0x14
0x18  entry table, 12 bytes per member:
        +0  u32  looks like a name hash (dense, no obvious structure)
        +4  u32  unknown
        +8  u32  unknown
      followed immediately by a name table that is not a flat string list but
      a trie with interleaved control bytes.
```

The member count at `0x04` is confirmed twice: the entry table ends exactly
where the name table begins in both samples. Everything else above is an
observation, not an interpretation, and is recorded as `unknown_*` rather than
guessed at.

**Plan.** Gather headers across all 1,671 files and correlate the unknown fields
against member count and file size before attempting any interpretation. The
name hash is not needed to extract — index order plus offsets would be enough —
so the trie can stay unsolved for a while. If GPC2 resists, the slice's ~40
events are hand-authorable, which is exactly why the plan chose a slice this
size.

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

`data/event` holds 523 `.gp2` files named `ev#####.gp2`, and `data/evspt_lv5`
another 165. The naming and count are consistent with one file per event. That
is a strong signal that per-event data exists as data rather than as compiled
code — but whether it is an interpreted script for a VM, or parameters for
hardcoded routines, is **not established** and cannot be until GPC2 opens.

Treat the G1 question as open, not answered.

## What is needed from outside

These need the emulator and disassembly work that is human, GUI-driven, and out
of scope for code in this repository:

1. **Which area code the slice opens in.** Reach the village in an emulator and
   observe which map archive loads. This single fact narrows the slice's map,
   scenario and event assets from thousands of files to tens.
2. **Which `ev#####` events belong to the opening.** Same method.
3. **Whether an event VM exists.** A breakpoint on the code that consumes a
   `data/event` file answers the G1 question directly, and would say far more
   than further static analysis of GPC2.

Until (1) lands, M0's "extract the seven or so maps" cannot be finished — the
extraction machinery is ready, but not the knowledge of what to point it at.

## M0 status

| M0 task | status |
|---|---|
| NitroFS parser and file dump | **done** — parser, CLI, and gated integration tests |
| Identify and extract slice assets | **blocked on area identification**, machinery ready |
| Run apicula; record what converts | not started; models are stock NSBMD, so expected to convert |
| Locate the slice's event scripts | **partly** — candidate files located, format not yet open |

The extraction *capability* is essentially complete and proven against the whole
cartridge. What remains is knowing which files the slice needs, and one custom
container.
