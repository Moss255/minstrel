# SDAT

The Nitro sound archive.

## Sources

- GBATEK, "DS Files"
- Nintendo DS file formats wiki: *SDAT*, *SSEQ*, *SBNK*, *SWAR*

## Container

| offset | type | meaning |
|---|---|---|
| `0x00` | `char[4]` | `SDAT` |
| `0x04` | `u16` | byte-order mark, `0xFEFF` |
| `0x06` | `u16` | version |
| `0x08` | `u32` | file size |
| `0x0C` | `u16` | header size, `0x40` |
| `0x0E` | `u16` | block count, 4 |
| `0x10` | `u32`×2 | `SYMB` offset and size |
| `0x18` | `u32`×2 | `INFO` offset and size |
| `0x20` | `u32`×2 | `FAT` offset and size |
| `0x28` | `u32`×2 | `FILE` offset and size |

The four blocks tile the archive exactly: each ends where the next begins, and
the last ends on the declared file size. That arithmetic is the first check the
parser gets for free, and it holds on all three archives on the reference
cartridge.

The FAT stamp is **`FAT ` with a trailing space** — four characters like the
others.

## The eight record lists

`SYMB` and `INFO` both hold eight lists, in the same order, which is what lets a
name be paired with a record by index:

| index | kind | refers to a file |
|---|---|---|
| 0 | sequence (SSEQ) | yes |
| 1 | sequence archive (SSAR) | yes |
| 2 | bank (SBNK) | yes |
| 3 | wave archive (SWAR) | yes |
| 4 | player | **no** |
| 5 | group | **no** |
| 6 | player2 | **no** |
| 7 | stream (STRM) | yes |

Each list is a `u32` count then that many `u32` offsets, relative to its own
block's start. A zero offset is an empty slot: archives leave gaps in the
numbering, and about a third of the reference cartridge's records are gaps.

### Not every record starts with a file id

**Confirmed by observation, and it matters.** The kinds marked "yes" put a FAT
index in their leading `u16`. The others do not — a player or group record
starts with something else, and reading it as a file id gives a small integer
that happens to index an early file. It looks entirely plausible.

The evidence: taking the leading `u16` of every record and resolving it, the
four file-bearing kinds plus streams land on a file whose stamp is exactly the
one that kind implies — **1,714 of 1,714** across the three archives. The
excluded kinds produce stamps that contradict their type and, for the single
`player2` record, an index past the end of the file table.

## Records

Sequence, 12 bytes:

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u16` | file id |
| `+0x04` | `u16` | bank id |
| `+0x06` | `u8` | volume |
| `+0x07` | `u8` | channel pressure |
| `+0x08` | `u8` | polyphonic pressure |
| `+0x09` | `u8` | player priority |

Bank, 12 bytes: a `u16` file id, then four `u16` wave-archive ids at `+0x04`,
with `0xFFFF` marking an unused slot.

Wave archive: a `u16` file id.

Records do not declare their own length, so each is taken to run to the next
one's offset. Only the fields above are interpreted, so an over-long extent
costs nothing.

## FAT

`u32` count at `+0x08`, then 16-byte entries of `u32` offset, `u32` size and two
reserved words. Offsets are absolute within the archive.

## Evidence

Against a retail cartridge, which is not in this repository:

| check | result |
|---|---|
| archives parsed | 3 / 3 |
| files indexed | 1,714 |
| **file ids resolving to the stamp their record kind implies** | **1,714 / 1,714** |
| overlapping file ranges | 0 |
| sequence → bank → wave-archive chains resolving | 64 / 64 |

The chain check is the strongest of these: it walks a sequence's bank id into
the bank list, reads that bank's wave-archive ids, and resolves each — three
lookups through separately-parsed tables, all of which must be right. It also
comes out self-consistent by name, `BG_001` selecting `BANK_BG_001` selecting
`WAVE_BG_001`.

## The files inside: SSEQ, SBNK, SWAR

Read since 15 September 2026 (`sseq.ts`, `sbnk.ts`, `swar.ts`). Sources:
Gota7's *Nitro Studio 2* specifications (sequence, bank, wave, wave archive),
https://gota7.github.io/NitroStudio2/specs/; fincs's FeOS Sound System,
https://github.com/fincs/FSS (WTFPL), whose `sbnkswar.h` reads the same
layouts; GBATEK, "DS Sound Notes", for IMA-ADPCM. Every field below is one of
theirs; nothing is inferred here.

### The common header

| offset | type | meaning |
|---|---|---|
| `0x00` | `char[4]` | `SSEQ`, `SBNK`, `SWAR` |
| `0x04` | `u16` | byte-order mark, `0xFEFF` |
| `0x06` | `u16` | version |
| `0x08` | `u32` | file size |
| `0x0C` | `u16` | header size, `0x10` |
| `0x0E` | `u16` | block count, 1 |
| `0x10` | `char[4]` | `DATA` |
| `0x14` | `u32` | DATA block size |

### SSEQ

`0x18` holds the absolute offset of the command stream, which runs to the end
of the DATA block — `0x1C` on every sequence of the reference cartridge. The
commands are a player's to interpret (`@minstrel/audio`); the reader gives the
stream and where it starts, as jump and call targets are offsets into it.

### SBNK

| offset | type | meaning |
|---|---|---|
| `0x18` | `u32[8]` | reserved |
| `0x38` | `u32` | instrument count |
| `0x3C` | 4 bytes each | instrument records: `u8` type, `u16` absolute offset, `u8` pad |

Types: 0 empty; 1 PCM, 2 PSG, 3 noise, 4 direct PCM, 5 null — each a single
10-byte note definition at the offset; 16 a drum set — `u8` low key, `u8` high
key, then one `u16` type and 10-byte definition per key from low to high; 17 a
key split — eight `u8` region-end keys (zero past the last region), then a
`u16` type and 10-byte definition per region.

A note definition: `u16` wave (or PSG duty), `u16` wave archive (0–3, the
bank's slot), `u8` base key, `u8` attack, decay, sustain, release, `u8` pan.

### SWAR

| offset | type | meaning |
|---|---|---|
| `0x18` | `u32[8]` | reserved |
| `0x38` | `u32` | wave count |
| `0x3C` | `u32[count]` | absolute offset of each wave |

Each wave is a 12-byte info block then its samples — a SWAV without its file
header: `u8` format (0 PCM8, 1 PCM16, 2 IMA-ADPCM), `u8` loops, `u16` sample
rate, `u16` timer (16756991 / rate, the ARM7 clock over the rate), `u16` loop
start in 32-bit words, `u32` length after the loop start in words.

IMA-ADPCM (`decodeWave`): a four-byte header, the initial PCM16 value and
table index, then two nibbles a byte, low first; the step table and index
table are the standard IMA ones GBATEK lists, the value clamped to ±0x7FFF and
the index to 0–88. A loop start counts words of the file with its header, so
its sample is `words × 8 − 8`.

### On the reference cartridge

`bgm.sdat`'s 64 sequences with files read; their banks hold 996 instruments
(225 notes, 456 key splits, 35 drum sets, 280 empty), whose 2,079 PCM notes
every one resolve to a wave in the bank's archives; all 2,079 waves are
IMA-ADPCM, 1,793 of them looping, and every one decodes.

## Not implemented

**Streams** (`STRM`), which `bgm.sdat` has three of, and **sequence archives**
(`SSAR`), which the two effects archives are made of: 1,398 between them.
