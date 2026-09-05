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

## Not implemented

**Playback.** Nothing here decodes SSEQ's sequence commands, SBNK's instrument
definitions or SWAR's ADPCM waveforms — this package finds and extracts the
resources, it does not synthesise them. That is the AudioWorklet sequencer the
slice plan schedules for M8 and calls the hardest TypeScript-specific problem in
the project. Having the resources named, extracted and chained is the
prerequisite, not the solution.
