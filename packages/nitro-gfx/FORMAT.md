# NSBMD and the geometry display list

## Sources

- Nintendo DS file formats wiki: *NSBMD*, *NSBTX*
- GBATEK, [DS 3D Video](https://problemkaputt.de/gbatek.htm#ds3dvideo), for the
  geometry commands and their parameter counts

## Container

| offset | type | meaning |
|---|---|---|
| `0x00` | `char[4]` | `BMD0` |
| `0x04` | `u16` | byte-order mark, `0xFEFF` |
| `0x06` | `u16` | version |
| `0x08` | `u32` | file size |
| `0x0C` | `u16` | header size, `0x10` |
| `0x0E` | `u16` | block count |
| `0x10` | `u32[n]` | block offsets |

Each block is a `char[4]` stamp and a `u32` size. `MDL0` holds models.

## Resource dictionary

The same structure indexes models, bones, materials and shapes.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u8` | revision, 0 |
| `+0x01` | `u8` | entry count |
| `+0x02` | `u16` | total size, from the dictionary's start |
| `+0x04` | `u16` | patricia header size, 8 |
| `+0x06` | `u16` | **patricia section size, measured from `+0x00`** |
| `+0x08` | `u32` | constant `0x17F` |
| `+0x0C` | | `count` × 4 bytes of patricia nodes |
| then | `u16` | item size |
| | `u16` | data section size |
| | | `count` × item |
| then | | `count` × 16-byte names |

**The patricia section size is relative to the dictionary start, not to its own
header.** Reading it the other way puts the data header four bytes late. The
parser cross-checks it against `4 + headerSize + count * 4`; the two agree on
every model on the reference cartridge, which is what settles the question.

The patricia tree is for the hardware's name lookup. Enumeration in order is all
this package needs, so the region is stepped over rather than interpreted.

## Model

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | model size |
| `+0x04` | `u32` | render commands offset |
| `+0x08` | `u32` | material section offset |
| `+0x0C` | `u32` | shape section offset |
| `+0x10` | `u32` | matrix section offset, and the model's end |
| `+0x14` | `u8[8]` | flags and counts, individually unidentified |
| `+0x1C` | `fx32` | position up-scale |
| `+0x20` | `fx32` | position down-scale |
| `+0x24` | `u16` | vertex count |
| `+0x26` | `u16` | surface count |
| `+0x28` | `u16` | triangle count |
| `+0x2A` | `u16` | quad count |
| `+0x2C` | `fx16[3]` | bounding box origin |
| `+0x32` | `fx16[3]` | bounding box **extents** |
| `+0x38` | `fx32` | box scale |
| `+0x3C` | `fx32` | its reciprocal |
| `+0x40` | | object (bone) dictionary |

Counts come from the dictionaries, which are self-validating — each declares its
own size and that size must land exactly on the end of its name table. The eight
bytes at `+0x14` also encode counts, but which byte is which has not been
established, so they are carried through as `unknownFlags`.

### The bounding box is an origin and extents

Not two corners. On a model checked by hand, `origin + extent` lands exactly on
the geometry's far corner on all three axes, while reading the second triple as
a maximum does not.

**Do not rely on the box to contain the geometry.** Across 6,889 models, no
combination of the position scale and box scale puts every vertex inside its own
box in more than 42% of cases. Something scales one or the other that has not
been identified. `measureBounds` measures decoded geometry instead.

## Shape

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u32` | unknown |
| `+0x04` | `u32` | unknown |
| `+0x08` | `u32` | display list offset, relative to the shape |
| `+0x0C` | `u32` | display list size |

Confirmed by arithmetic: offset plus size lands on the end of the shape section.

## Display list

Four command bytes, then every command's parameters in order, four bytes each.
A command byte of 0 is a no-op taking none, which is how a list is padded to a
multiple of four commands.

Only the commands that affect geometry are interpreted. **The rest are stepped
over by their documented parameter count**, which is what keeps the stream in
sync — a wrong count desynchronises the whole list into garbage rather than
failing visibly.

| command | meaning |
|---|---|
| `0x14` | `MTX_RESTORE`; recorded as the vertex's matrix id |
| `0x20` | `COLOR`, 5 bits per channel |
| `0x21` | `NORMAL` |
| `0x22` | `TEXCOORD`, 1.11.4 texels |
| `0x23` | `VTX_16`, two parameters: x and y, then z |
| `0x24` | `VTX_10`, 4.6 in three 10-bit fields |
| `0x25`–`0x27` | `VTX_XY`, `VTX_XZ`, `VTX_YZ`: set two coordinates, **keep the third** |
| `0x28` | `VTX_DIFF`, three signed 10-bit deltas added to the current position |
| `0x40` | `BEGIN_VTXS`: 0 triangles, 1 quads, 2 triangle strip, 3 quad strip |
| `0x41` | `END_VTXS` |

Quads split on the `a-c` diagonal. Triangle strips alternate winding, so every
other triangle is flipped back to give the run one consistent winding.

## Evidence

Against a retail cartridge, which is not in this repository:

| check | result |
|---|---|
| NSBMD files parsed | 6,889 / 6,889, no failures |
| shapes decoded | 57,192 |
| **decoded vertex count == the model header's own count** | **6,889 / 6,889** |
| **decoded triangles == `numTriangles + 2 × numQuads`** | **6,889 / 6,889** |

Those two are independent, and both come from the file rather than from this
code. An interpreter with a wrong parameter count or a missed partial-vertex
command desynchronises and fails both.

`tools/harness/test/cartridge.test.ts` reproduces them.

## Not implemented

- **Bone transforms.** A model's render commands drive the matrix stack, and
  skinned models bind vertices to it with `MTX_RESTORE`. The display list
  records each vertex's matrix id but nothing applies the transforms, so a
  skinned model's geometry is decoded correctly but positioned wrongly. 5,968 of
  the reference cartridge's 6,889 models use a single matrix and render
  correctly today; 766 are skinned and need this; 155 have no geometry at all.
- **Textures.** `TEX0` blocks and NSBTX are not read yet, so materials are names
  only.
- **Normals and lighting.** `NORMAL` is stepped over rather than captured.
