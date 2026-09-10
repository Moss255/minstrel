# Findings worth sending upstream

Notes on this title's asset formats, written to be useful to a decompilation
project rather than to this repository.

Everything here was arrived at by parsing a retail cartridge and checking the
result against the whole of it — not by reading disassembly, which this project
does not do. That cuts both ways: the *file layouts* below are checked against
tens of thousands of records, and the *meanings* are only ever as good as the
oracle that confirmed them. Each finding says which it is.

No cartridge content is reproduced here. Offsets, structures and counts only.

**Confidence**

| | |
|---|---|
| **Confirmed** | a check that a wrong answer fails — exact consumption, cross-file agreement, a mathematical invariant |
| **Inferred** | consistent with everything seen, but nothing rules out an alternative |
| **Open** | stated so nobody repeats the search |

---

## 1. Nitro rotations are stored column-major

**Confirmed.** Applies to any DS title using NSBMD/NSBCA, not just this one.

A rotation 3x3 — the full form in a model's nodes, and both compact forms in an
animation's pools — is stored **column by column**. Read as rows you build the
transpose, which for a rotation is its inverse, so every rotation in every model
and every animation comes out backwards.

This is unusually hard to catch, and worth flagging for that reason:

- both readings are orthonormal;
- both have determinant +1;
- the obvious cross-check — an animation's first frame against the model's own
  bind pose — **transposes on both sides at once**, so it agrees at ~95% either
  way and cannot decide.

What decides it is a character standing up. The player model is built in a
T-pose 7.68 units tall and every one of its nodes is the identity, so its bind
pose is the same either way. Posed, it should stand about as tall as it was
built:

| motion | read as rows | read as columns |
|---|---|---|
| `stand` frame 0 | 9.71 | **7.89** |
| `walk` frame 2 | 9.98 | **7.77** |

Read as rows the figure raises both arms straight over its head. Read as columns
it stands with its arms at its sides.

## 2. A node's full 3x3 has its first cell in the header

**Confirmed** by exact consumption.

In a bind-pose node that stores a full rotation, cell `[0][0]` is the `u16` at
`+0x02` — which reads like padding — and the other **eight** follow. Read nine
consecutive cells instead and every such node is two bytes too long: 4,578 nodes
then land off the dictionary's own offsets. With eight, all **69,336 nodes** end
exactly where the next begins.

## 3. The pivot cell's sign is forced, not stored

**Confirmed** by a mathematical invariant.

The compact "pivot" rotation stores a rotation about one axis: one cell is ±1,
its row and column otherwise zero, and the remaining two rows and columns carry
`[[a, b], [-b, a]]`. Expanding the determinant along the pivot cell gives
`det = (-1)^(row+col) * sign`, so a rotation forces `sign = (-1)^(row+col)`.

Under that rule all **4,644** pivot nodes come out orthonormal with determinant
+1, as do all **1,269** nodes using the full form. That `a² + b² = 1` for every
pivot node is the independent check that the two values were being read right.

## 4. The basis pool's missing cell needs care

**Confirmed**, and a trap worth documenting.

Ten bytes per entry: five values in **1.0.15** — not the 1.3.12 the geometry
engine takes. They are the first column and the first two cells of the second.
The third cell of that column is recovered, and the third column is the cross
product.

Recovering it has two closed forms and **both are unstable, in opposite
regimes**, against values this coarsely quantised:

- the orthogonality form divides by the third cell of the first column, and
  loses the matrix when that is near zero — **525** stored rotations;
- the magnitude form divides the error by the cell itself, and fails when the
  true value is near zero: a rotation about one axis stores its neighbour as
  0.9998, the closest 1.0.15 comes to 1, and `sqrt(1 - d² - e²)` turns that
  quantisation into a spurious 0.022 where orthogonality says 0.0001 — **300**
  more.

Choosing by conditioning — whichever denominator is larger — and normalising
afterwards resolves all of them. All **9,543** pivot references and **6,963**
basis references land inside their pools, and all **93,811** reachable pivot
entries satisfy `a² + b² = 1`.

## 5. A node description sets the current matrix, not just a stored one

**Confirmed** by what it draws.

In the render-command stream, a node description computes that node's world
transform, and its flag bits say which stack slot to *store* it in. It also
makes that matrix **the current one**, whether or not it stores. The stored slot
and the slot the next shape's vertices read are different things — only a
restore command changes the latter.

Read only the stored ones and every shape under an unstored node draws at the
model's origin. In this title's opening village that is the rainbow. Move the
*read* slot when a node stores, and a model's twelve tree billboards all draw in
one pile at the origin instead of at their twelve node positions.

## 6. An animation may end on a repeat of its first frame

**Confirmed**, and it is per animation rather than a convention.

**2,654 of 6,230** animations end on a repeat of their first frame; the rest do
not. Playing every frame and wrapping then shows that pose twice running — a
hitch once per cycle, several times a second on a nine-frame walk.

The pattern shows in the frame counts, which are overwhelmingly odd — 9, 7, 11,
13, 5, 17, 3 — a whole number of segments plus the frame closing the last one.
All **140** three-frame animations close.

## 7. Map pieces are placed, and the placement has a parent link

**Confirmed** for the structure; **inferred** for the unit.

The `.bmdj` map manifest is a tagged table. Two records per map matter:

| tag | meaning |
|---|---|
| `0x6C` | one per resource: position, **byte offset into the string table**, two unknowns |
| `0x6F` | one per resource, same order: where the map puts it |

The `0x6C` offset is a byte offset, not an ordinal — a reader that counts names
gets the first right and drifts after it. Across **755** manifests naming
**5,342** resources, every resource is present in its own archive when resolved
by stem.

The `0x6F` record has fourteen values. Three are established:

| value | meaning |
|---|---|
| 3, 4, 5 | translation, as IEEE floats |
| 6 | the **slot** of the resource this one is attached to, or `0xFFFFFFFF` |
| 8, 9, 10 | scale, as floats — `1, 1, 1` on every resource of this cartridge |

Values 11–13 are zero in **all 4,242** placement records, so there is no
rotation there.

**The parent link matters.** A doorway's collision carries no translation of its
own; it names the doorway model's slot and goes where that goes. Ignore it and
the wall stays at the origin while the door stands in the doorway.

**The unit is inferred.** The translations are an order of magnitude larger than
the map — a village's doors sit at x −28.56 and 26.10 in a village running −4.38
to 7.61. Dividing by **8** is the best fit, found by asking how many pieces
authored to sit at their own origin end up standing on the map's own collision:
74.4% at 8 against 71.1% at 10 and 62.2% at 5. Eight is also a power of two.
Nothing in the file states it.

Placements pair with resources **by position**, and 696 of the 755 manifests
have exactly one per resource. The other 59 carry more placements than
resources; pairing through those would misplace everything after the extra one.

## 8. Some collision meshes are volumes, not ground

**Inferred**, with a large effect.

A map's collision arrives as several meshes. **335 of 358** meshes of two
triangles or fewer have no standable surface at all: a single quad standing
vertically. In the opening village there are eleven — one across each of the ten
doorways, plus a four-by-six quad 2.5 units tall in the middle of the map, all
taller than any building there and all invisible.

Treated as walls they seal every doorway: walkable ground reachable from the
village's middle drops from **61% to 24%**, and its largest connected region
from 93% to 24%. Nothing is lost by passing through them — they hold no
standable surface, so no ground goes with them.

What they *are* is not established. The shape is the only signal found.

## 9. A collision grid's rows are staggered, and its cell count says so

**Confirmed**, on all 1,178 collision meshes.

The header carries `gridX`, `gridZ` and a cell size, and three parallel arrays:
a `u8` count per cell, a `u16` start per cell, and a `u16` list of triangle
indices the starts address. How many cells there are is

```
cells = floor(gridZ * (gridX + 1/2))
```

which is `gridX * gridZ + floor(gridZ / 2)`: **one extra cell on every other
row**, so the rows alternate `gridX` and `gridX + 1` wide.

Worth flagging because the unfloored form is a trap. `(2·gridX + 1) · gridZ / 2`
is exact only when `gridZ` is even, and **850 of the 1,178** files have an odd
`gridZ` — enough that the formula looks wrong rather than nearly right. Read
without the floor it accounts for 328 files, `gridX * gridZ` for 511, and the
remaining 339 look like they need a third rule. They do not.

`gridX` and `gridZ` are the grid's dimensions in cells over the mesh's own
bounding box: `gridX * cellSize >= maxX - minX` and likewise for z, on 1,178 of
1,178, and on 77.7% one cell fewer would not cover it.

**Still open:** which square a cell index names. Taking the grid's corner as the
mesh's minimum and reading it row-major puts only 36% of the index references
inside the square that names them; column-major gives 26%. The staggering is
the obvious suspect.

## 10. A collision vertex is `s16`, and the cartridge reaches the bound

**Confirmed.** Positions are `s16` in the units an `fx32` word counts, so a
coordinate cannot pass ±8.00 units and a mesh cannot be wider than 16.00. The
cartridge's furthest vertex sits at exactly 8.00 and its widest mesh at exactly
16.00. Anything needing collision over sixteen units across cannot be stored at
the size its models are drawn at, and what reconciles the two is not in the
file.

## 11. The collision attribute word is not a terrain type

**Negative result**, offered to save the search.

It looks like it should carry water, terrain kind and so on. It does not, or not
in any form found: the opening village's **82** non-vertical triangles carry
**51 distinct** attribute values, nearly one per triangle. The values read as
packed orderings — `0x543210` and its permutations — rather than surface flags,
and the same values appear on marker volumes and on terrain alike.

Water is identifiable, but from the **texture name**, not from collision.

## 12. Map textures are named for what they are

**Confirmed** by census.

A map texture's name is the map's own code, then **three letters saying what the
surface is**, then a number: `m01m00wtr01` is water beside `m01m00grs01`. Across
the 4,337 models under `/data/map` the tags come out as a level artist's
vocabulary:

| tag | count | | tag | count |
|---|---|---|---|---|
| `grd` ground | 3,694 | | `sdw` shadow | 868 |
| `wal` wall | 2,332 | | `dor` door | 739 |
| `clf` cliff | 2,124 | | `wtr` water | 726 |
| `grs` grass | 1,934 | | `hus` house | 694 |
| `tre` tree | 1,632 | | `sky` sky | 606 |
| `stn` stone | 1,451 | | `flw` flower | 452 |

`hus` and `tre` also appear as **node** names inside the same models, so the
vocabulary is shared between geometry and materials. It is how the village's
houses and trees were identified.

Only the tag is read here. What each means to the game — which are solid, which
sound different underfoot — is not established.

## 13. A character is assembled, and the head is not part of the rig

**Confirmed** for the structure.

The player-character archive holds **796 parts** whose names say what they are:

| prefix | count | | prefix | count |
|---|---|---|---|---|
| `p_w` weapon | 200 | | `p_p` legs | 79 |
| `p_b` body | 192 | | `p_s` shoes | 35 |
| `p_m` | 142 | | `p_f` face | 24 |
| `p_h` hair | 121 | | `p_test` | 3 |

**Only the bodies and legs carry the shared fourteen-bone rig** — 274 of the
796. Those pose themselves, and together they make a figure that ends at the
neck. Everything else carries a single bone of its own and sits at its own
origin until something hangs it off the skeleton: the `head` bone sits at y
16.27 on a body reaching 16.57, and a face put through that bone lands at 15.94
to 20.26, which is a fifth of the finished figure's height.

The rig's bones are `root`, `waist`, `chest`, `arm0L`, `arm1L`, `arm0R`,
`arm1R`, `head`, `usiro`, `leg0L`, `leg1L`, `leg0R`, `leg1R`, plus one named
after the part itself.

**Which parts make a given character is open.** The obvious candidate table was
checked and rejected: its ids match no part and are probably equipment.

## 14. A character's motions are spread across a family of packs

**Confirmed**, and a trap.

The config beside a part names one motion pack. That pack holds **one**
animation. For the opening character, `mp0200ne` is `walk`; standing is in
`mp0200n` and `mp0200f`, smiling in `mp0200b`, attacking in `mp0200be`, items in
`mp0200bi`, casting in `mp0200bm`.

Of the cartridge's **136** motion packs, **56 carry a `stand`, 13 carry a
`walk`, and not one carries both**. A reader that takes the pack the config
names and stops has a character that can walk and cannot stand still.

## 15. An NPC placement names its map by the index's own id

**Structure confirmed, positions open.**

`/data/scenario/<map>.npc` is a NARC holding `<map>npc.bin` and
`<map>place.bin`.

The npc file is a tagged table; its tag-3 records carry five values, the last a
string offset naming the NPC. The opening village names 49.

The place file is **not** a tagged table — a naive check says it is, because its
string offset happens to equal its length. It is a stream of blocks led by the
word `0xA5060003` followed by `-246`. Cartridge-wide there are **1,297** such
blocks across 74 archives, and:

- the block count matches the name count exactly in 45 of the 74 archives and
  is smaller on 26, consistent with some NPCs being placed by events. It is
  **not** true that it never exceeds it, as an earlier revision of this document
  said: `R01` has 39 placements against 38 names. 1,283 of the 1,285 blocks
  join to a character;
- each block carries an index and four floats, and the fourth is **in 0 to 2π in
  all 1,297 cases**, with **71% on an exact multiple of 90°**. That is a facing
  angle beyond reasonable doubt.

**The three floats before it are a position**, divided by 8 as map placements
are. What made that look doubtful was the frame, not the scale: a cast list is
per **area**, not per map, so most of a village's 49 characters stand inside its
houses and cannot be expected to land on the village's own ground.

**The word at `+8` of a block says which map**, and it is the map's own id —
the first value of a `maplist9.bin` entry. The join is exact: all **1,289**
placement blocks carry a value that is some entry's id. Angel Falls runs 1100
for the village and 1101 upward for its interiors, so within one area the ids
read as `area x 100 + sub-map`; that is a habit of the numbering rather than a
rule, and taking the number apart that way fails on 3.4% of the cartridge where
using the id outright does not.

Narrowed by it, every placement tagged with the village's own id has floor under
it in the village, and none tagged anything else does.

**A block holds the same character in several places.** After the header come
sub-records, each with its own two-word mark: `0x550D0005 0xFF02A955` carries
seven words, a map, the character's id and a position; `0x55090005 0xFFFF0155`
carries the same without a position. The header repeats the first positioned
one. The seven words look like a story state — the first two climb through a
block, 1/1, 1/2, 2/1, 2/7, 19/2 — and are **not established**. A sub-record's
map need not be the block's, so a character can stand in several maps as the
story moves them.

---

## What was ruled out

Offered so nobody repeats it.

- **Map-to-map links are not in the map index.** `maplist9.bin` gives every map
  a region, a code and a human label — enough to name a village's inn, church
  and shops — but none of its numeric slots indexes another map.
- **Nor in the per-map attribute tables.** Those are float-valued: fog and
  lighting, four to seven records for a village with ten doors.
- **Nor in `apinfo.bin`**, which is battle-road and network data.

  What remains is the event bytecode, which is untouched here.
- **The collision attribute word is not terrain type** — see above.
- **There is no root motion** in this character's animations: the root node's
  translation is zero on every frame of `walk`, `run` and all three `stand`
  variants.
- **A model's declared bounding box does not contain its geometry.** Across
  6,889 models, no combination of the model's position scale and box scale puts
  every vertex inside its own box in more than 42% of cases. Something scales
  one or the other that was not identified; measuring the decoded geometry is
  the reliable route.

## Still open

- What the six unread values of a `0x6F` placement record mean.
- What the collision attribute word *is*, given it is not terrain type.
- What the seven words of an NPC placement sub-record mean, and therefore which
  of a character's several placements the game takes.
- Which parts make a named character.
- The map-transition data, presumed to be in the event bytecode.
- One GPC2 codec, which is carried as raw bytes.
- Where cell (0, 0) of a collision grid sits. The count and the dimensions are
  settled (below); the mapping from cell index to world square is not, and the
  staggered rows are the likely reason a rectangular reading fails.

## How any of this can be re-checked

Every figure above comes from a test that runs against a cartridge dump and is
skipped without one. They are deliberately about *self-consistency* rather than
about specific offsets in one title, so most hold for any DS cartridge: a parser
that agrees with tens of thousands of independent samples is not guessing.

The interesting ones for a reader of these formats:

| check | what it would catch |
|---|---|
| every node ends where the next begins | a field read at the wrong width |
| every rotation resolves orthonormal, determinant +1 | a mis-decoded rotation pool |
| every animation's first frame equals its model's bind pose | almost everything — but **not** a transposed rotation |
| a posed figure stands as tall as its bind pose | a transposed rotation |
| every render-command stream ends on a clean terminator | a mis-sized command |
| every declared resource is present in its archive | a mis-read manifest |
