# GPC2

A Level-5 archive container. Not a Nintendo format, and not publicly
documented — everything here was established by observation against a retail
cartridge, and the evidence for each claim is given below.

Fields whose meaning has not been established are named `unknown_*` in the
parser and carried through rather than skipped.

## Why this package exists

GPC2 is neither a DS platform format (so it does not belong in `nitro-*`, which
must work on any DS cartridge) nor specific to one title (so it does not belong
in `game-formats`). It is a vendor format that appears across Level-5's DS
output. It is kept MIT and game-agnostic on that basis.

The codecs it uses are Nintendo's, so they live in `@minstrel/nitro-comp`; this
package supplies only the framing.

## Header

| offset | type | meaning |
|---|---|---|
| `0x00` | `char[4]` | `GPC2` |
| `0x04` | `u12` | member count — byte 4, plus the low nibble of byte 5 as its high bits |
| `0x05` | `u4` | `unknown_0x05`, the high nibble |
| `0x06` | `u16` | version; `5` on every archive observed |
| `0x08` | `u16` | name-table offset, in 4-byte words |
| `0x0A` | `u16` | data-region offset, in 4-byte words |
| `0x0C` | `u16` | entry-table size in 4-byte words; always `3 * count` |
| `0x0E` | `u16` | `unknown_0x0e` |
| `0x10` | `u32` | `unknown_0x10`; **bit 28: the members are stored whole**, INFERRED — see "Members stored whole" below; the rest not established |
| `0x14` | `u32` | `unknown_0x14` |

**The count is 12-bit, not 8-bit.** Reading only byte 4 works for most archives
and fails silently on large ones. The 12-bit reading was confirmed by the
identity `word count at 0x0C == 3 * count`, which holds for **1671 of 1671**
archives on the reference cartridge and fails for 25 of them under the 8-bit
reading.

## Entry table

At `0x18`, 12 bytes per member, **sorted ascending by hash** — it is a
binary-search index.

| offset | bits | meaning |
|---|---|---|
| `+0` | 32 | CRC-32 of the member's filename |
| `+4` | 0–23 | data offset, in 4-byte words, from the data region |
| `+4` | 24–31 | low byte of the name's byte offset in the name table |
| `+8` | 0–23 | stored region length, **including** its 4-byte prefix |
| `+8` | 24–31 | high byte of the name's byte offset |

The name offset is split across two words. Reading only the byte in `+4` works
for small archives and breaks on any whose names exceed 255 bytes in total —
which is most of the large ones.

### The entry table's own encoding is not recorded

The table is stored plainly when it exactly fills the space between the header
and the name table. Otherwise it is compressed, starting at `0x18`, with the
decompressed size known to be `12 * count` — but **nothing in the header says
which codec**. All three of LZ77, 4-bit Huffman and 8-bit Huffman occur.

Byte counts do not separate them: a correct decode may leave a few bytes of
alignment padding unread, and a wrong one can consume a plausible number.

So the reader checks the *result*. A valid index has two properties a wrong
decode does not reproduce — the hashes are strictly ascending, because the table
is a binary-search index, and every entry's data offset lands inside the
archive. The first candidate satisfying both is accepted, and the choice is
corroborated immediately afterwards: every filename recovered from the
separately-compressed name table must match the CRC-32 in the entry its offset
came from.

## Regions

The name table and every member are stored as a *region*: a `u32` prefix,
then the payload.

| bits | meaning |
|---|---|
| 0–2 | codec |
| 3–31 | decompressed size in bytes |

| codec | meaning | members observed |
|---|---|---|
| 0 | stored, no compression | 32 |
| 1 | LZ77, LZ10 unit encoding, no BIOS header | 39,559 |
| 2 | Huffman, 4-bit symbols | 368 |
| 3 | Huffman, 8-bit symbols | 2,438 |
| 4 | run-length | 7,743 |
| 7 | none — see below | 0 |

Note that the numbering is **not** the BIOS's. Each codec *variant* gets its own
number, so the two Huffman symbol widths take 2 and 3 and run-length lands on 4.
An earlier revision of this file asserted that codec 4 was not run-length, on
the strength of a test that had been pointed at codec 3. Against codec 4,
run-length matches 7,743 of 7,743 regions exactly.

A codec the reader does not know — 5 to 7 — is marked `readable: false`, and
`read` throws naming it; `readRaw` hands over the stored bytes. None is left on
the reference cartridge: the five "codec 7" members an earlier revision listed
were members stored whole, below, their first word misread as a prefix.

### Members stored whole

Three archives hold members with no region prefix, whose bytes are their
content: `/data/pack_lv5/enemy.gp2` (601 members, every one a `NARC`),
`/data/prm/actdt_a.gp2` and `/data/prm/actdt_b.gp2` (six each, the action
tables — see game-formats' FORMAT.md, "Actions"). Read as prefixes, their first
words give nonsense: a codec of 6 on the `NARC`s, 7 on `actdt_a`'s tables, and
on `actdt_b`'s a Huffman region two megabytes long in 41 KB — which decoded,
wrongly, or failed to.

**Bit 28 of the header's `0x10` marks them**, INFERRED: it is set on exactly
those three archives and clear on every other on the cartridge, where the
largest `0x10` seen is `0xE337F`. `readGpc` reports it as `storedWhole`, and
such an archive's members read as their stored bytes, `method` `-1`
(`GpcMethod.Whole`). Before it was found, the `NARC`s were recovered by
recognising them, and the action tables were not recovered at all.

Read whole, every member identifies itself: `enemy.gp2`'s are `NARC`s, and each
action table opens with a head word — record count and string size — that
describes its length exactly (`tools/harness`, "reads the archives stored
whole").

The name table decodes to plain NUL-separated names. There is no trie: earlier
readings that appeared to show one were looking at compressed bytes.

## Evidence

Against a retail cartridge, which is not in this repository:

| check | result |
|---|---|
| archives parsed | **1,671 / 1,671** |
| members indexed | 53,639 |
| **member names whose CRC-32 matches the stored hash** | **53,639 / 53,639, zero mismatches** |
| members that decode, to exactly their declared size | **all**, the 613 stored whole among them |

Before bit 28 was read, 606 members were unreadable and five more — `actdt_b`'s
— failed to decode to their declared size; the two range tables beside them
"decoded" silently to 2 and 13 bytes of nothing.

The CRC-32 result is the strongest single piece of evidence. The hash is stored,
the name is recovered from a separately-compressed table, and the two are
brought together through a bit-split offset field — three independent decodings
that must all be right for the check to pass, fifty thousand times running.

The Huffman tree walk has a second, independent confirmation: on archives whose
entry table is Huffman-compressed, the decode consumes *exactly* the bytes
between the header and the name table, and yields hashes in ascending order.

`tools/harness/test/cartridge.test.ts` reproduces these checks.

## Known gaps

Every archive parses and every member decodes. What is left:

- `unknown_0x05`, `unknown_0x0e`, `unknown_0x14`, and `unknown_0x10` below
  bit 28.
- Bit 28 rests on three archives. A fourth that set it and still prefixed its
  members would break the reading; none does here.

An earlier revision listed eleven archives whose index could not be followed,
and guessed the name offset must be wider than 16 bits in some variant. That was
wrong: the name offset is 16 bits throughout. Those archives simply encoded
their entry table with a codec the reader did not try.
