# NSBMD and the geometry display list

## Sources

- Nintendo DS file formats wiki: *NSBMD*, *NSBTX*, and for the animation
  containers below, *NSBCA*, *NSBTA*, *NSBTP*, *NSBMA*
- GBATEK, [DS 3D Video](https://problemkaputt.de/gbatek.htm#ds3dvideo), for the
  geometry commands and their parameter counts
- apicula, [`src/nitro/render_cmds.rs`](https://github.com/scurest/apicula), for
  the render commands' scale up (`0x0B`) and scale down (`0x2B`)

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
| `0x14` | `MTX_RESTORE`; recorded as the vertex's matrix id, and drops the scale |
| `0x1B` | `MTX_SCALE`; **applied** to the positions that follow — see below |
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

### The position scale

A model's positions are stored small and scaled up when they are drawn. The
scale is the model header's `upScale`. `downScale` is always exactly its
reciprocal, and it is **not** applied to the shape.

The render commands say so. The commonest shape on the reference cartridge —
1,897 models, and hundreds more repeating it once per shape — is `0x0B`, the
shape, `0x2B`: scale the current matrix up by `upScale`, send the vertices,
scale it back down by `downScale`. apicula reads `0x0B` as `ScaleUp` and `0x2B`
as `ScaleDown`. A vertex is transformed by the matrix current when it is sent,
so the scale-down only undoes the scale-up for whatever comes after it.

Three things carry the scale up, and all three are needed:

- **`MTX_SCALE` in the display list is always the model's `upScale`**, uniform
  on all three axes — 126,616 of 126,616 on the reference cartridge. Since the
  bone transform is deferred, folding it into the positions as they are emitted
  is the same thing the hardware does by folding it into the current matrix.
- **The `PositionScale` render command applies it before the shape is drawn**,
  outside the display list, and its `0x20` form undoes it after. A model emits
  that command exactly when its `upScale` is not one: of the 2,901 models that
  never emit it, 2,898 have an `upScale` of 1.
- **`MTX_RESTORE` drops the scale**, because it loads a stored matrix over the
  current one. A display list that restores mid-shape re-applies `MTX_SCALE`
  immediately; one that does not never emits another vertex — **0 of 1,637,744**
  across the 4,719 models whose lists carry no `MTX_SCALE` at all. So no vertex
  is ever left at the wrong scale, which is what confirms the reading.

**Applying `downScale` to the shape was a misreading**, and an expensive one. It
was adopted because `s107` then matched its own declared bounding box: 7.358 x
0.189 x 0.200 against 7.360 x 0.187 x 0.198. But the declared box is stored at
the scaled-down size, like the positions — across the 3,015 map models with an
`upScale` above one, the raw box contains the geometry drawn that way on 1,531
and the geometry at its own size on 3 — so matching it was never evidence.

Drawn that way, every model came out at its size over its own `upScale`: 8 for
the slice village's terrain, 1 or 2 for most rooms, 16 for the fields. The map
scale constants that followed were compensating for it — see
`game-formats/FORMAT.md`. With models at their own size, across 315 indoor maps
the doorways stand just inside the drawn room on 85% of 677, against 34%.

### A shape starts on the matrix the render commands left current

**Every** shape on the cartridge emits vertices before its own display list's
first `MTX_RESTORE` — 1,864,237 of them. Those belong to the slot the render
stream last restored, which for 3,610 shapes is not slot 0.

## Evidence

Against a retail cartridge, which is not in this repository:

| check | result |
|---|---|
| NSBMD files parsed | 6,889 / 6,889, no failures |
| shapes decoded | 57,192 |
| **decoded vertex count == the model header's own count** | **6,889 / 6,889** |
| **decoded triangles == `numTriangles + 2 × numQuads`** | **6,889 / 6,889** |
| **a blended vertex stays put in the bind pose** | **1,018 / 1,138 models exactly; nothing anywhere out by more than 0.03** |
| **every rotation reference resolves to an orthonormal matrix** | **16,506 constant and 1,662,623 curve samples** |
| **every `MTX_SCALE` carries the model's own `upScale`** | no exception |
| **every material's texture run names real materials, none claimed twice** | **8,804 / 8,804 models** |

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

### The cells are stored column by column

Both forms — the full 3x3 above and the two compact ones — store their cells
**column-major**, which is the order the DS keeps a matrix in. Read as rows they
come out transposed, and a rotation's transpose is its inverse, so every
rotation on the cartridge comes out backwards.

Almost nothing catches it. Both readings are orthonormal, both have determinant
+1, and the two sides of the strongest check available — an animation's first
frame against its model's own bind pose — transpose together, so that agrees at
95% either way. It only says the *two* readings match each other, not which one
is right.

**What settles it is a character standing up.** The slice's player model is
built in a T-pose 7.68 units tall, and every one of its nodes is the identity,
so its bind pose is the same either way. Posed, it should stand about as tall as
it was built:

| motion | read as rows | read as columns |
|---|---|---|
| `stand` frame 0 | 9.71 | **7.89** |
| `walk` frame 2 | 9.98 | **7.77** |

Read as rows the figure is a quarter taller than the body it is posing, because
it has raised both arms straight over its head; read as columns it stands with
its arms at its sides. The same holds for `run` and every other `mp0200` motion.

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
command mixes stack slots by weight, where `0x100` is one — and the weights sum
to exactly `0x100` for all 6,093 blends on the cartridge.

### A blend term is a slot, a node, and a weight

The middle parameter of each three is the node whose **inverse bind** transform
the term is composed with. It is a valid node index for all 12,543 terms on the
cartridge, and it differs from the stack slot beside it in 7,061 of them, so it
is not the slot restated. In the bind pose the slot holds exactly that node's
world transform — 12,504 of 12,543 — so `slot * inverseBind[node]` is the
identity there, and a blended vertex, which is stored in bind-pose space, stays
where the display list put it.

**That is the check.** With the inverse bind matrices applied, every one of the
cartridge's 6,093 blend commands resolves to the identity at the point it is
computed. Without them, a blend resolves to the identity only by accident.

### Stack slots are reused

A model draws a shape, overwrites the slots it bound, and draws the next, so the
stack left after the last command is not the one most shapes saw. Each shape has
to be posed against the stack as it stood when its own draw command appeared.

Together with the inverse bind matrices and the position scale, every genuinely
blended vertex on the cartridge stays where the display list put it: **1,018 of
1,138 models exactly, and nothing anywhere out by more than 0.03** — a
fixed-point rounding, against models tens of units across.

*Genuinely* blended has to be judged per shape. A slot holding a blend when one
shape is drawn often holds a plain node's transform by the time the next one is,
and counting every slot that is a blend destination somewhere makes correct
output look wrong: on `s107` that reads a 113-unit error into vertices whose
slot had been reused.

## Textures — `TEX0` and NSBTX

A `TEX0` block appears standalone in an NSBTX file and, on some models, inside
the NSBMD itself.

| offset | type | meaning |
|---|---|---|
| `+0x00` | `char[4]` | `TEX0` |
| `+0x04` | `u32` | section size |
| `+0x0C` | `u16` | texture data size, in 8-byte units |
| `+0x0E` | `u16` | texture dictionary offset |
| `+0x14` | `u32` | texture data offset |
| `+0x1C` | `u16` | 4x4-compressed data size, in 8-byte units |
| `+0x24` | `u32` | 4x4-compressed texel data offset |
| `+0x28` | `u32` | 4x4-compressed block-palette index offset |
| `+0x30` | `u32` | palette data size, in 8-byte units |
| `+0x34` | `u32` | palette dictionary offset |
| `+0x38` | `u32` | palette data offset |

A texture dictionary entry is 8 bytes: a `u16` offset in 8-byte units, then a
`u16` of parameters — the upper half of the hardware's `TEXIMAGE_PARAM`.

| bits | meaning |
|---|---|
| 4–6 | width, `8 << n` |
| 7–9 | height, `8 << n` |
| 10–12 | format |
| 13 | palette entry 0 is transparent |

| format | meaning |
|---|---|
| 1 | `A3I5` — a 5-bit index and 3 bits of alpha |
| 2, 3, 4 | 2, 4 and 8 bits per texel, palettised |
| 5 | 4x4 block compression |
| 6 | `A5I3` — a 3-bit index and 5 bits of alpha |
| 7 | direct 16-bit colour, alpha in bit 15 |

Palettes are 16-bit BGR555. Expanding a 5-bit component needs its high bits
replicated into the low ones, so 31 maps to 255 rather than 248.

A palette's size is not recorded; it runs to the next palette's offset.

### The evidence: texture sizes tile

Computing a texture's byte length from its format and dimensions lands exactly
on the next texture's offset, and the last lands on the declared data size. A
wrong format or dimension reading fails that immediately.

| check | result |
|---|---|
| texture sets read | 5,575 |
| textures | 32,861 |
| palettes | 32,852 |
| sizes tiling onto the next texture | 98.8% (the rest is alignment) |
| decoding to the right pixel count | 32,861 / 32,861 |

Formats present: 20,668 palette-16, 7,065 `A5I3`, 4,366 `A3I5`, 725
palette-256, 29 palette-4, 8 direct. **No 4x4-compressed texture occurs**, so
that decoder is written from the documentation and has never been checked
against a sample; it is marked as such in the source.

## Materials and their textures

The material section opens with two `u16` offsets — to a texture-name
dictionary and a palette-name dictionary — and its own material dictionary
follows at `+4`. Reading the first offset as the material dictionary yields the
*texture* names, which look enough like material names to pass unnoticed; the
symptom is shape material indices that run out of range.

### The binding is in the file, not in the names

A texture-name dictionary entry is a `u16` offset and a `u8` count naming a run
of `u8` material indices, packed just before the material records and relative
to the material section start. Palettes are bound the same way.

That is exact, and it is self-consistent in two ways that a wrong reading would
break: every index named is a real material — **8,804 of 8,804 models** — and no
material is claimed by two different textures, on all 8,804. **52,380 of 52,512
materials** are claimed by some texture.

**An earlier revision guessed the texture from the material's name**, stripping a
`Mat_` or `M_` prefix and a trailing `_\d*`. That resolves **41%** of them, and
the failures are not edge cases: a material is as likely to be called
`Material3166` and bind `eb0000_3`, or `a1_flash1` and bind `kaisin_1`. Reading
the run instead takes the shapes that can be drawn with their own texture from
41% to **99.3%**. `textureNameForMaterial` is kept only as a fallback for the
few materials that bind nothing.

## NSBCA — joint animation

Stamp `BCA0`, holding a `JNT0` block: a resource dictionary of animations.

Each animation:

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u8[4]` | `4A 00 41 43` — the only stamp observed |
| `+0x04` | `u16` | frame count |
| `+0x06` | `u16` | bone count |
| `+0x08` | `u32` | `unknown_0x08` |
| `+0x0C` | `u32` | offset of the pivot rotation pool |
| `+0x10` | `u32` | offset of the basis rotation pool |
| `+0x14` | `u16[bones]` | per-bone entry offsets, relative to the animation |

Every offset inside an animation is relative to the animation's own start.

A per-bone entry begins `u16 flags`, `u8 unknown` (always 0), `u8 bone index`.
**The index always equals the entry's own position** — 154,852 of 154,852.

### The entry size formula

An entry's length is fully determined by its flags: across the reference
cartridge every distinct flags value maps to exactly one length. A least-squares
fit of length against the flag bits gives whole numbers, and they reproduce the
length for all 202 distinct values:

```
length = 60 - 12*bit1 - 4*(bit3 + bit4 + bit5 + bit6 + bit8) - 24*bit9
```

**Confirmed by the files' own numbers:** a track's computed length lands exactly
on the next track's offset, **144,379 of 144,379**, across 10,473 files and
10,473 animations.

### The flag bits

| bit | meaning |
|---|---|
| 0 | the bone is not animated at all |
| 1 | no translation |
| 3, 4, 5 | translation X, Y, Z is constant |
| 6 | no rotation |
| 8 | rotation is constant |
| 9 | no scale |
| 11, 12, 13 | scale X, Y, Z is constant |

Bits 2, 7, 10, 14 and 15 are never set on the reference cartridge.

Bit 0 is redundant: it is set **exactly** when bits 1, 6 and 9 all are, 18,108
times, and clear on the other 136,744 tracks, with no exception either way.

Bit 6 implies bit 8: `b6=1, b8=0` never occurs.

Bits 11–13 do not change the entry's length — a constant scale axis and an
animated one both take eight bytes — which is why the size fit could not see
them. They were found instead by asking which flag bit predicts whether a scale
axis's eight bytes hold a value beside its reciprocal:

| | slots with the bit set | of those, a `(v, 1/v)` pair | slots with it clear | of those, a pair |
|---|---|---|---|---|
| X, bit 11 | 14,685 | 14,678 | 23,792 | **0** |
| Y, bit 12 | 15,354 | 15,353 | 23,123 | **0** |
| Z, bit 13 | 18,680 | 18,643 | 19,797 | **0** |

The separation is total in the direction that matters: a slot whose bit is clear
is *never* a reciprocal pair. The handful of set-but-not-a-pair slots have a
value of zero, which has no reciprocal.

### Track layout

Sections follow the four-byte header in the order translation, rotation, scale.

**Translation** — three axes. A constant axis is one `fx32`; an animated one is
a curve header. **Rotation** — a constant rotation is a `u16` reference and two
bytes of zero (16,506 of 16,506); an animated one is a curve header whose
samples are those references. **Scale** — three axes, eight bytes each either
way: a constant axis is an `fx32` value and its `fx32` reciprocal, an animated
one is a curve header whose samples are value and reciprocal side by side.

### Curve headers

| offset | type | meaning |
|---|---|---|
| `+0x00` | `u16` | first frame the curve covers — always 0 on the cartridge |
| `+0x02` | `u16` | last frame in bits 0–12; a three-bit code in bits 13–15 |
| `+0x04` | `u32` | where the samples begin, relative to the animation |

`(word & 0x0fff) == frameCount` for 192,747 of 195,947 curves, which is what
identifies the low bits as a frame. The code's low bit selects the sample width;
the two bits above it were only ever observed as 0, 1 or 2 and behave like a
frame step of 1, 2 or 4.

For codes 0 and 1 — step 1 — the sample count is exactly `endFrame - startFrame`.
That is measured, not assumed: taking each curve's span as the distance to the
next distinct sample offset in the same animation gives

| kind | code | bytes per frame | curves |
|---|---|---|---|
| translation | 0 | exactly 4.000 | 33,274 |
| translation | 1 | exactly 2.000 | 50,997 |
| rotation | 0 | exactly 2.000 | 88,017 |
| scale | 0 | exactly 8.000 | 4,026 |
| scale | 1 | exactly 4.000 | 56,120 |

so translation samples are `fx32` or `fx16`, rotation samples are always `u16`
references, and a scale sample is a value with its reciprocal beside it. The
reciprocal is confirmed on the samples themselves: 367,707 of 367,811 sixteen-bit
scale samples satisfy `v * next == 1` at 1.3.12.

**The whole layout, checked end to end:** with the sizes above, no curve in any
animation on the cartridge overlaps another — **8,877 of 8,877** animations that
use only codes 0 and 1, and 10,253 of 10,253 once the inferred steps are
included. Before bits 11–13 were understood, 1,510 animations overlapped.

### The two rotation pools

A rotation reference's top bit picks the pool; the remaining fifteen bits index
it.

**Bit set — the pivot pool**, six bytes per entry: `u16` whose low nibble is the
pivot index, then two `fx16`. This is the same encoding a model's bind-pose
nodes use, down to the forced sign of the pivot cell. All 9,543 references with
the bit set land inside the pool, and every one of the 93,811 entries reachable
that way satisfies `a² + b² == 1`.

### An animation may end where it began

**2,654 of the cartridge's 6,230 animations end on a repeat of their first
frame**, and the rest do not, so it is a property of each one rather than a
convention to assume. Playing every frame and wrapping shows that pose twice
running — a hitch once per cycle, which on a nine-frame walk at a normal pace is
several times a second.

The pattern behind it shows in the frame counts, which are overwhelmingly odd —
9, 7, 11, 13, 5, 17, 3 — a whole number of segments plus the frame that closes
the last one. All 140 of the three-frame animations close.

`loopFrames` answers it by sampling both ends. The slice's character `walk` (9
frames) and `stand` (17) both close, and both loop one frame shorter than they
are stored.

**Bit clear — the basis pool**, ten bytes per entry: five values in **1.0.15**,
not the 1.3.12 the geometry engine takes. The five are the whole of the **first
column** and the first two cells of the second. The second column's third cell
is recovered, and the third column is the cross product of the two.

All 6,963 constant references with the bit clear land inside the pool at a
stride of ten, and all 6,963 have a unit vector in their first three values.

**Recovering the missing cell is the delicate part.** A rotation gives two ways
to do it and both are unstable, in opposite regimes, against values this
coarsely quantised:

- `row0 . row1 == 0` fixes the cell directly, but divides by `row0[2]`. That
  loses the matrix when the cell is near zero — 525 stored rotations.
- `|row1| == 1` fixes its magnitude, with the dot product supplying only the
  sign. That divides the error by the cell itself, so it fails when the true
  value is near zero: a rotation about one axis stores its neighbour as 0.9998,
  the closest 1.0.15 comes to 1, and `sqrt(1 - d² - e²)` turns that rounding
  into a spurious 0.022 where the dot product says 0.0001 — 300 more.

So pick by conditioning, taking whichever denominator is larger, and where both
are zero — a turn about the z axis whose `d² + e²` quantises to just over one —
the magnitude form gives the right answer of zero while the other divides by it.
Then normalise: the stored values are a quantised rotation, and the nearest true
rotation is what they mean.

With that, **every rotation reference on the cartridge resolves to an
orthonormal matrix** — all 16,506 constant ones and all 1,662,623 samples of the
curves, which reach far more of the pools than the constants do. Checking only
the constants, as an earlier revision did, missed both failure modes entirely.

### What an absent component means

A component the flags omit is the identity. Where a track carries no translation
the model's bind pose has that bone at the origin — 5,883 of 5,884 — and where it
carries no scale the bind scale is one — 7,828 of 7,828. Both across
same-named model/animation pairs.

### The check that ties it together

A model and the animation beside it are separate files. Posing a model with
frame 0 of its own animation reproduces the model's own bind pose for
**21,306 of 21,808 bones**, across 1,795 pairs. The remainder are animations
that genuinely do not open on the bind pose.

That is the strongest available oracle: it exercises the flags, the field
order, the curve headers, both pools and the matrix construction at once, and
none of it was fitted against the models.

### What is not established

- **The step codes.** Bits 14–15 of a curve header's second word take the values
  0, 1 and 2 and are read as a frame step of 1, 2 and 4. Only step 1 is
  confirmed. The wider steps cover about 1% of curves; the sample count used for
  them, `floor(frames / step) + 1`, is inferred from their layout not
  overlapping, and it never over-reads.
- **`unknown_0x08`.** A `u32` that is 1 on most animations.
- **The byte at `+0x02` of a track entry.** Always zero.

## The six containers, and which are read

Every Nitro container on the reference cartridge is the same shape — a four-byte
stamp, a byte-order mark, a block count and its offsets — and each kind carries
exactly one block, with no exceptions worth the name:

| file | stamp | block | files in `/data/map` | read here |
|---|---|---|---|---|
| `.nsbmd` | `BMD0` | `MDL0` | 4,358 | yes |
| `.nsbtx` | `BTX0` | `TEX0` | 737 | yes |
| `.nsbca` | `BCA0` | `JNT0` | 317 | yes |
| `.nsbta` | `BTA0` | `SRT0` | 873 | **no** |
| `.nsbtp` | `BTP0` | `PAT0` | 525 | **no** |
| `.nsbma` | `BMA0` | `MAT0` | 512 | **no** |

The 12 `.nsbmd` that carry a second block carry `TEX0`, a model with its
textures packed in beside it.

The three unread kinds are animation, as the block stamps say: `SRT0` a
texture's scale/rotate/translate over time, `PAT0` a texture pattern swapped
frame by frame, `MAT0` a material's own values animated. Those readings are the
published ones rather than anything measured here; what is measured is the
stamp, the single block and the counts.

**They matter more than their size suggests.** 1,910 of them sit in map
archives, against 4,358 models — so roughly one animated thing for every two
models. A map that looks static in this repository's viewer is a map whose
`SRT0` is not being run: water, fire, and anything that scrolls or pulses.

## Not implemented

- **The `0x40` flag's parameter on node-transform commands.** Its meaning is not
  established, and it is skipped. Nothing now measurably depends on it: with the
  inverse bind matrices, the per-shape stack and the position scale, skinning
  reproduces the bind pose to within a rounding.
- **What the header's bounding box describes.** Posed geometry comes out either
  the same size as the box or twice it, in two clear peaks — 3,132 models at ~1
  and 2,657 at ~2, on both sides of the `upScale` divide, so it is a property of
  the box rather than of the scaling. Nothing reads it, so nothing is wrong
  because of it; `measureBounds` over real geometry is what the viewer frames on.
- **4x4 block compression.** Implemented from documentation, but the reference
  cartridge contains no texture that uses it, so it is unverified.
- **Normals and lighting.** `NORMAL` is stepped over rather than captured.
- **Texture transforms.** The material's coordinate-transform mode is ignored;
  texture coordinates are used as the display list gives them.
- **Interpolation between animation samples.** A frame takes the sample that
  covers it. For step 1, which is all but about 1% of curves, that is every
  frame and there is nothing to interpolate.
- **NSBTA, NSBTP and NSBMA.** Texture, pattern and material animation are not
  read — 1,910 files in the map archives. See the container table above.
