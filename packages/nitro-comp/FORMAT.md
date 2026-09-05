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

## Headerless streams

Some containers record the decompressed size in their own index and store the
codec payload bare, with no 4-byte header. `decompressRawLz77` and
`decompressHuffman` in `src/raw.ts` take the size from the caller for that case.
The unit encodings are unchanged; only the framing differs.

### Huffman

| offset | meaning |
|---|---|
| `+0` | `u8` tree table size / 2 - 1 |
| `+1` | tree table, root node first |
| `+(n+1)*2` | bit stream, 32-bit little-endian words, most significant bit first |

A node's low six bits give the offset to its child pair; bit 6 marks the
1-child as a leaf, bit 7 the 0-child. The child pair sits at
`(currentOffset & ~1) + (offset + 1) * 2`, where offsets are measured **from the
tree-size byte**. GBATEK leaves that base implicit; this one is what the data
confirms.

Symbol width is 4 or 8 bits. With 4, two symbols make a byte, low nibble first.
A bare stream has no header nibble to declare the width, so the caller supplies
it.

**Confirmed by observation.** Huffman was previously left unimplemented here for
want of samples. Samples turned up: the Level-5 GPC2 container on the reference
cartridge uses it for both index tables and member payloads. On 4-bit index
tables the decode consumes *exactly* the bytes between the header and the name
table and yields an index whose hashes are in ascending order and whose 50,742
filenames all match their stored CRC-32 — checks a wrong tree walk does not
pass. See `packages/l5-gpc/FORMAT.md`.

### Run-length

| flag bit 7 | meaning |
|---|---|
| 0 | `(flag & 0x7F) + 1` literal bytes follow |
| 1 | `(flag & 0x7F) + 3` copies of the single byte that follows |

**Confirmed by observation.** All 7,743 GPC2 regions on the reference cartridge
that select this codec decode to exactly their declared size *and* consume
exactly their stored payload — two independent exact matches on every sample.

An earlier revision of this file claimed the run-length format did not appear on
this cartridge, on the strength of a test that decoded 3 of 334 candidate
regions. That test was pointed at the wrong regions: it assumed the container
numbered its codecs the way the BIOS does. It does not — it gives each codec
*variant* its own number, so Huffman-4 and Huffman-8 take 2 and 3, and
run-length is 4. Tested against codec 4, it matches 7,743 of 7,743.

## BLZ — backwards LZ

Used for the ARM binaries and overlays. It runs from the end of the buffer
towards the beginning, which is what lets a binary decompress in place at load
time, and it keeps its parameters in a footer rather than a header:

| offset from end | type | meaning |
|---|---|---|
| `-8` | `u24` | encoded length: the compressed region, measured back from the end |
| `-5` | `u8` | header length: trailing bytes that are footer, not data |
| `-4` | `u32` | increase length: how much larger the decompressed data is |

Everything before the compressed region is copied through verbatim. The rest is
decoded backwards: a flag byte read from the top down, most significant bit
first; a clear bit is a literal, a set bit a two-byte back-reference with
`length = (high >> 4) + 3` and
`displacement = ((high & 0x0F) << 8 | low) + 3`.

**The displacement bias is 3**, where the forward LZ77 uses 1.

It compresses the **ARM9 binary as well as the overlays** — 638 KB expanding to
1,000,984 on the reference cartridge, with entropy falling from 6.83 bits to
6.09. That is easy to miss, and a megabyte of the game's code and strings stays
unreadable until it is handled.

**Confirmed by observation.** All 35 ARM9 overlays on the reference cartridge
decode with three independent checks passing:

| check | result |
|---|---|
| output is the length the overlay table declares | 35 / 35 |
| the backwards walk consumes input to exactly where the verbatim prefix ends | 35 / 35 |
| byte entropy falls, ~7.2 bits to ~5.9 | 34 / 35 (the exception is a 20-byte overlay) |

The second is the one a wrong decoder fails: it has to land on the boundary
precisely, having taken a different number of steps for every overlay. The first
decoded overlay opens `E92D4010 E1A04001` — `push {r4, lr}` then a register
move, an ordinary ARM function prologue.

## Not implemented

The diff filter (`0x8`), which does not appear on the reference cartridge.
Writing a codec from documentation alone with no sample to verify against would
put untested code that looks correct into a package other code trusts.

## The compressor

`compressLz10` exists so the decoder can be round-trip tested and so tooling can
re-pack a modified asset. It is a plain greedy longest-match search and makes no
claim to reproduce Nintendo's encoder byte for byte — only to emit a stream the
format's decoder accepts.
