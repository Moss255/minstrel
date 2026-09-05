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

## Nodes — the bones

The object dictionary at `+0x40` names them; each entry's offset is relative to
`+0x40`, and the first lands exactly where the dictionary ends.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u16` | flags |
| `+0x02` | `u16` | the rotation's `[0][0]` cell, as `fx16` |
| then | `fx32[3]` | translation, unless flag bit 0 |
| then | | rotation, unless flag bit 1 — pivot form if bit 3, else eight `fx16` |
| then | `fx32[3]`×2 | scale and its reciprocal, unless flag bit 2 |

| flag bit | meaning |
|---|---|
| 0 | translation is zero |
| 1 | rotation is the identity |
| 2 | scale is one |
| 3 | rotation uses the compact pivot form |
| 4–7 | pivot index: which cell holds ±1 |
| 8, 9 | set on many pivot nodes; they do **not** affect the rotation |

### A full rotation is eight cells, not nine

Cell `[0][0]` is the `u16` at `+0x02`, which looks like padding. Read nine
consecutive cells instead and every such node is two bytes too long: 4,578 nodes
then land off the dictionary's own offsets. With eight, **all 69,336 nodes on
the reference cartridge end exactly where the next begins**.

### The pivot cell's sign is forced

The compact form stores a rotation about one axis: one cell is ±1, its row and
column are otherwise zero, and the remaining two rows and columns carry
`[[a, b], [-b, a]]`.

Expanding the determinant along the pivot cell gives
`det = (-1)^(row + col) × sign`, so a rotation — determinant +1 — forces
`sign = (-1)^(row + col)`. Nothing else is free. Under that rule **all 4,644
pivot nodes come out orthonormal with determinant +1**, as do all 1,269 nodes
using the full form. That `a² + b² = 1` holds for every pivot node is what
confirms the two values were being read correctly all along, and that only their
placement was ever in question.

## Render commands

The low five bits of an opcode select the operation; the top three add
parameters. The counts were **fitted, not assumed**: every one of the reference
cartridge's 8,804 models parses to a clean `End` under them, and no other
combination tried does.

| opcode | operation | parameters |
|---|---|---|
| `0x00` | no-op | 0 |
| `0x01` | end | 0 |
| `0x02` | node visibility | 1 |
| `0x03` | restore matrix | 1 |
| `0x04` | bind material | 1, +1 per flag bit |
| `0x05` | draw shape | 1 |
| `0x06` | node transform | 3, +1 per flag bit |
| `0x07` | billboard | 1 |
| `0x08` | billboard about Y | 1 |
| `0x09` | blend matrices | 2, then 3 per term |
| `0x0A` | call display list | 1 |
| `0x0B` | scale by the model's position scale | 0 |
| `0x0C` | environment map | 1 |
| `0x0D` | projection map | 1 |

A node-transform command names a node and its parent, so a node's world
transform is its parent's composed with its own local one; with the `0x20` flag
its fourth parameter is the matrix stack slot to leave the result in. A blend
command mixes stack slots by weight, where `0x100` is one.

## Not implemented

- **The `0x40` flag's parameter on node-transform and material commands.** Its
  meaning is not established, and it is skipped.
- **Inverse bind matrices.** A blend command's weights are applied to the stack
  slots directly. The hardware composes each term with the named node's inverse
  bind transform first, which this does not, so a blended vertex is placed
  approximately rather than exactly. On the reference cartridge that shows up as
  a few stray polygons on heavily-blended models.
- **Slots no command assigns.** 859 of 1,682 models that use the matrix stack
  leave at least one used slot unwritten, which then stays the identity. That is
  most likely the `0x40` parameter above doing the assigning.
- **Textures.** `TEX0` blocks and NSBTX are not read, so materials are names
  only.
- **Normals and lighting.** `NORMAL` is stepped over rather than captured.
- **Animation.** NSBCA is not read; a model is posed in its bind pose only.
