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

The codecs it uses are Nintendo's, so they live in `@vesper/nitro-comp`; this
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
| `0x10` | `u32` | `unknown_0x10` |
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

**The entry table is itself compressed** when it does not exactly fill the space
between the header and the name table: 4-bit Huffman, starting at `0x18`, with
the decompressed size known to be `12 * count`.

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
| 4 | **unidentified** | 7,743 |
| 6 | **unidentified** | 601 |
| 7 | **unidentified** | 5 |

Codecs 4, 6 and 7 are not implemented. They are not the BIOS run-length format —
that was tested against all 334 candidate regions and decoded 3, which is
chance. Rather than guess, `readGpc` marks such members `readable: false` and
`read` throws naming the codec.

The name table decodes to plain NUL-separated names. There is no trie: earlier
readings that appeared to show one were looking at compressed bytes.

## Evidence

Against a retail cartridge, which is not in this repository:

| check | result |
|---|---|
| archives parsed | 1,660 / 1,671 |
| members indexed | 50,746 |
| **member names whose CRC-32 matches the stored hash** | **50,742 / 50,742, zero mismatches** |
| members whose codec is implemented | 42,397 |
| those decoding to exactly the declared size | 42,392 |

The CRC-32 result is the strongest single piece of evidence. The hash is stored,
the name is recovered from a separately-compressed table, and the two are
brought together through a bit-split offset field — three independent decodings
that must all be right for the check to pass, fifty thousand times running.

The Huffman tree walk has a second, independent confirmation: on archives whose
entry table is Huffman-compressed, the decode consumes *exactly* the bytes
between the header and the name table, and yields hashes in ascending order.

`tools/harness/test/cartridge.test.ts` reproduces these checks.

## Known gaps

- Codecs 4, 6 and 7 (8,349 members, about 16%).
- 11 archives where an entry names a byte that is not a name-table entry. All
  are large (`chara_pc`, `chara_pd`, `enemy`, and a few scenario files), which
  suggests the name offset is wider still than 16 bits in some variant, or that
  those archives use a differently-shaped index.
- 5 members whose 8-bit Huffman stream ends early — possibly a third symbol
  width, possibly a different codec sharing the number.
- `unknown_0x05`, `unknown_0x0e`, `unknown_0x10`, `unknown_0x14`.
