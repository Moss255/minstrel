# NitroFS, NARC and the DS cartridge header

What this package parses, what is confirmed, and what is deliberately left alone.

## Sources

- GBATEK, [DS Cartridge Header](https://problemkaputt.de/gbatek.htm#dscartridgeheader)
- GBATEK, [DS Cartridge NitroROM and NitroARC File Systems](https://problemkaputt.de/gbatek.htm#dscartridgenitroromandnitroarcfilesystems)
- GBATEK, [BIOS Decompression Functions](https://problemkaputt.de/gbatek.htm#biosdecompressionfunctions) (for the CRC-16 polynomial in use)
- Nintendo DS file formats wiki, *NitroFS* and *NARC*

Every field this package reads is named in one of those. Nothing is inferred.

## Cartridge header

Read from offset `0x000`, size `0x200`. Fields parsed and their offsets are
listed in `src/header.ts`; the reserved and DSi-only regions are not surfaced.

### CRC-16

Reflected polynomial `0xA001` (reversed `0x8005`), initial value `0xFFFF`, no
final XOR — the algorithm the CRC RevEng catalogue calls CRC-16/MODBUS.

**Confirmed by observation.** On the reference cartridge (see below), this
implementation reproduces both stored checksums exactly:

| region | stored | computed |
|---|---|---|
| Nintendo logo, `[0x0C0, 0x15C)` | `0xCF56` | `0xCF56` |
| header, `[0x000, 0x15E)` | `0xF9CC` | `0xF9CC` |

`0xCF56` is a fixed constant for every retail cartridge, so a match is a useful
signal that an image is an unmodified retail dump.

Checksums are **not** enforced by `parseRomHeader`. A trimmed or patched image
is still worth reading; call `checkHeaderIntegrity` if you care.

## FAT

`fatSize / 8` entries of two little-endian `u32`s: `start` and `end`, exclusive,
absolute within the image. Overlay files occupy the leading entries; the FNT's
root `firstFileId` is therefore normally equal to the overlay count.

## FNT

A directory table of 8-byte entries, root first:

| offset | type | meaning |
|---|---|---|
| `+0` | `u32` | sub-table offset, relative to the FNT start |
| `+4` | `u16` | file ID of the first file listed in the sub-table |
| `+6` | `u16` | parent directory ID; **for the root, the total directory count** |

Sub-tables are runs of variable-length entries ended by a `0x00` type byte:

| type byte | meaning |
|---|---|
| `0x01`..`0x7F` | file; that many name bytes follow |
| `0x81`..`0xFF` | directory; `type & 0x7F` name bytes, then a `u16` directory ID |

Directory IDs are `0xF000`-based; the root is `0xF000`.

### Filenames are bytes, not text

**Confirmed by observation, and it matters.** Two archives on the reference
cartridge carry names containing Shift-JIS bytes, apparently because a developer
typed fullwidth characters by accident:

| archive | name bytes | rendering |
|---|---|---|
| `/data/chara/ms04_tanatos.chr` | `6d 73 30 34 5f` **`82 94`** `61 6e 61 74 6f 73 2e 62 63 66 67` | `ms04_` `ｔ` `anatos.bcfg` |
| `/data/chara_sub/s043f01.chr` | `73 30 34 33` **`82 86`** `30 31 2e 6e 73 62 6d 64` | `s043` `ｆ` `01.nsbmd` |

An ASCII-only decoder rejects both archives. This package therefore decodes
names byte-transparently — each byte becomes the code unit of the same value —
so names round-trip losslessly, compare exactly, and carry no encoding
assumption. See `byteString` in `src/bytes.ts`.

Callers that need to *display* a name should treat it as bytes and apply
whatever encoding they have evidence for. This package does not guess.

## NARC

A whole NitroFS packed into one file. Header:

| offset | type | value |
|---|---|---|
| `0x00` | `char[4]` | `NARC` |
| `0x04` | `u16` | byte-order mark, `0xFFFE` (little-endian) |
| `0x06` | `u16` | version, `0x0100` |
| `0x08` | `u32` | total file size |
| `0x0C` | `u16` | header size, `0x10` |
| `0x0E` | `u16` | chunk count, `3` |

Then three chunks, each a `char[4]` stamp and a `u32` size covering the stamp
and size themselves:

| stamp | contents |
|---|---|
| `BTAF` | `u16` file count, `u16` reserved, then a FAT whose offsets are **relative to the `GMIF` payload** |
| `BTNF` | an FNT, byte-identical in layout to the cartridge's own, padded to 4 bytes with `0xFF` |
| `GMIF` | the file image |

**Stamp spelling.** Some references transcribe these reversed, as
`FATB`/`FNTB`/`FIMG`. Only the spelling in the table above was observed on the
reference cartridge, across all 4,129 archives. Both are accepted; the observed
one is preferred.

Many NARCs elsewhere carry a names-free FNT (a single root directory with an
empty sub-table) and are addressed purely by index. That case is supported —
`hasNames` reports it — though it does not occur on the reference cartridge.

## Evidence

The claims above were checked against a retail cartridge that is **not** part of
this repository and never will be. `tools/harness/test/cartridge.test.ts`
reproduces the checks; point `MINSTREL_TEST_ROM` at your own dump to run them.

Results on the reference cartridge:

| check | result |
|---|---|
| named files walked | 7,481 across 23 directories |
| FAT entries | 7,516 (35 ARM9 overlays + 7,481 named files) |
| NARC archives parsed | 4,129 / 4,129 |
| archive members enumerated | 24,556 |
| header and logo CRC-16 | both match |

## Not parsed

Deliberately out of scope for this package, and left as opaque bytes:

- The icon/title banner at the header's `bannerOffset`.
- The secure area, RSA signature and any DSi-only header extension.
- Anything *inside* an archive member. That is what the format packages are for.
