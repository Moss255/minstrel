# Nintendo DS compression

## Sources

- GBATEK, [BIOS Decompression Functions](https://problemkaputt.de/gbatek.htm#biosdecompressionfunctions)
- Nintendo DS file formats wiki, *Compression*

## Common header

Four bytes at the start of every compressed stream:

| offset | bits | meaning |
|---|---|---|
| `0x00` | 4–7 | compression type |
| `0x00` | 0–3 | format-specific flags |
| `0x01`–`0x03` | — | decompressed size, 24-bit little-endian |

The payload begins at `0x04`.

Types the BIOS defines: `0x1` LZ77, `0x2` Huffman, `0x3` run-length, `0x8` diff
filter.

### The 32-bit size extension is not implemented

Some third-party tools read a zero 24-bit size as "a 32-bit size follows at
`0x04`", so that streams above 16 MiB can be expressed. This package reads a
zero as a zero, because:

- the extension is not in the reference above;
- the reference cartridge contains **no** stream that uses it — all 11,179
  compressed members declare a non-zero 24-bit size;
- honouring it would misread a legitimately empty stream, whose size field is an
  ordinary zero.

If a cartridge that needs the extension turns up, add it *with samples*.

## LZ77 variant 10 (`0x10`)

After the header, a sequence of blocks. Each block is one flag byte followed by
up to eight units, processed from the flag's **most significant bit downwards**:

| flag bit | unit |
|---|---|
| `0` | one literal byte, copied straight through |
| `1` | a two-byte back-reference |

Back-reference encoding:

```
length       = (byte0 >> 4) + 3                      -> 3..18
displacement = ((byte0 & 0x0F) << 8 | byte1) + 1     -> 1..4096
```

The copy reads from the output written so far and **must proceed one byte at a
time**: a displacement smaller than the length legally repeats a short pattern,
and that overlapping case is the format's main way of encoding runs. A
block-copy implementation silently produces wrong output for it.

Decoding stops as soon as the declared output length is reached; any trailing
padding is ignored, as the BIOS does.

## Evidence

**Confirmed against 11,179 real samples.** Every LZ10 stream inside every NARC
on the reference cartridge decodes to *exactly* its declared length — no
truncations, no overruns, no exceptions — in about 0.5 s total.

An independent cross-check: where a member's filename carries a known extension,
the decompressed bytes begin with that container's magic, without exception.

| extension | magic | members |
|---|---|---|
| `.nsbmd` | `BMD0` | 4,328 |
| `.nsbta` | `BTA0` | 873 |
| `.nsbtx` | `BTX0` | 737 |
| `.nsbtp` | `BTP0` | 525 |
| `.nsbma` | `BMA0` | 512 |
| `.nsbca` | `BCA0` | 299 |

A decoder that were subtly wrong would not land on the right four-byte stamp
7,274 times running. `tools/harness/test/cartridge.test.ts` reproduces both
checks.

## Not implemented

Huffman (`0x2`), run-length (`0x3`) and the diff filter (`0x8`).

This is a decision, not an omission: LZ10 is the **only** codec present on the
reference cartridge (11,179 members; the others appear zero times). Writing the
other three from documentation alone, with no sample to verify against, would
put untested code that looks correct into a package other code trusts. They can
be added when a cartridge that uses them provides the samples to prove them.

## The compressor

`compressLz10` exists so the decoder can be round-trip tested and so tooling can
re-pack a modified asset. It is a plain greedy longest-match search and makes no
claim to reproduce Nintendo's encoder byte for byte — only to emit a stream the
format's decoder accepts.
