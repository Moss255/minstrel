# Things in a room — doors, cabinets, treasure

Written 12 September 2026. The format-level evidence is in
`packages/game-formats/FORMAT.md` ("Doors", "Motion tables", "Treasure"); this is
the technical account of how the game here reads and runs them, and where it has
had to choose.

---

## Map pieces and their resources

A map's descriptor (`.bmdj`) names resources; each resource compiles to files
under one stem in the map archive — a model, a collision mesh, an animation, a
motion table. `assembleMap` (`packages/world`) turns each into a `MapPiece` and
now keeps the resource's stem on it (`source`) and on each collision mesh, and
the motion table from its `.bcfg` (`motions`). The stem is what the game uses to
tell a door, a cabinet or a lamp from the room.

| stem ends | is | how it moves |
|---|---|---|
| `00` | the room, or the village | its own animation, looped |
| `D1`…`DA` | a door | swung by the game — no animation of its own |
| `G1`, `G2`… | a cabinet | its own animation, by the motions its `.bcfg` names |
| `L1`…, `N1`… | the day and night lighting of the same geometry | only the current lighting's is built |
| `F1`, `E1`… | fires, effects | their own animation, looped |

---

## Doors

**Data.** A door is two resources: its model `<area>M<nn>D<x>` and its
collision `<area>A<nn>D<x>` — the same name with `A` for `M`, placed separately.
Every door model in the village is one quad, 0.19 world units tall, with a
corner at its origin; none has an animation file.

**Collision.** On all of the village's doors but two, the collision is two
triangles facing the same way — a one-sided marker. The map loader leaves those
out (kept, they seal the doorways). Erinn's house's two, `M01A10D1` and `D2`,
are four triangles facing both ways, a wall from either side; the loader keeps
them, and until doors opened they shut those rooms off for good.

**Behaviour** (`apps/game/src/swing.ts`, all choices except the hinge):

- the hinge is the model's origin (INFERRED from the corner there);
- within 0.25 of a door's middle it turns a quarter, away from the Hero, in a
  quarter of a second; past 0.4 it swings back — the gap stops it flapping;
- its own collision stands only while it is fully shut.

A cartridge test walks through both of Erinn's doors open and is stopped by them
shut.

---

## Cabinets

**Data.** A cabinet is a piece named `…G<n>` — the shop has `M01M03G1` and
`G2`, `M01M09` and `M01M10` one each. Its model has three nodes, the cabinet and
its two doors `a` and `b`, and a 25-frame animation turning `a` to +135° and `b`
to −135°. Its `.bcfg` names four motions over that animation:

| motion | frames | reads as |
|---|---|---|
| `closed` | 0–0 | shut |
| `open` | 0–25 | opening |
| `opend` (sic) | 25–25 | open |
| `close` | 0–25 | closing — the same frames, presumably backwards; unused |

**The bug it explains.** The map renderer played every piece's own animation on
a loop, which is right for the sky and the waterfall and made every cabinet swing
open and shut for ever. A piece with a motion table now plays a motion when
asked instead.

**What is inside.** Treasure records of kind `0x30` have no position. In the
village each one's third value is its cabinet's number less one, and across the
cartridge 62 of the 89 maps that have such records have exactly as many
cabinets; elsewhere the third value counts on across an area. INFERRED: a map's
cabinets hold its kind-`0x30` records, paired in order.

**Behaviour** (`apps/game/src/cabinets.ts`): a cabinet stands `closed`; `f`
facing it within talking reach plays `open` once and holds the last frame, says
which treasure it held, and remembers it by that treasure's game-wide number, so
it is `opend` when the Hero comes back. A cartridge test finds the shop's two,
shut, each holding a different record, each reachable from the floor in front.

---

## Motion tables in general

The cabinet's `.bcfg` is not special: 2,844 of the cartridge's 2,854 `.bcfg`
files are motion tables — characters', effects', events' and map pieces'. Each
motion is a name, a first and last frame, and a speed (`readMotionTable`). Only
the cabinets use them yet; characters' will matter when events drive the cast.

---

## Treasure

**Data.** `/data/scenario/treasure.nsarc/<map>.bin`, a tagged table per map
(`readTreasure`):

- `0x66` gives the file's first game-wide treasure number; across every file the
  numbers run 0 to 847 without overlapping, gaps only where the two empty files
  sit. INFERRED: an opened treasure is remembered by it.
- `0x67` is a treasure: `unknown_0`, a kind, then either a position and on some
  kinds a facing (radians, INFERRED), or — kind `0x30` — no position, which is a
  cabinet's.
- Values are typed by their table bits: a whole number is an integer, the rest
  floats. Positions are in the files' own units and stand on the floor at
  `WORLD_SCALE`.

**What is inside** (`findInside`): a chest of kind `0x8` or `0x9` names its
item by id; kind `0x4` holds gold; pots, barrels and cabinets (`0x10`, `0x20`,
`0x30`) and kind `0x40` give a rank to draw at from a random table — `randTTT`
and `randTBox`, INFERRED — weighted, with the chance of nothing where the
weights come to less than 100. The game's dice are not reproduced: a draw uses
a stand-in roll fixed by the treasure's number, and the status line says the
rank, the roll and the weights. Item names are read from
`/data/prm/itemname.gp2`. A chest's draw can also be a monster — kind 3 of a
random row, INFERRED: the cannibox, mimic or Pandora's box by the monster
list's number, 38 to 40. The box says so by number, since the monster names are
not read, and nothing follows: there are no battles yet.

**Behaviour** (`apps/game/src/treasure.ts`): `f` facing a treasure opens it and
the box says what was inside. A placed treasure that is neither a chest nor a
pot or barrel would be marked by a gold cube, grey once opened — **the marker
is ours** — but the village has none.

**Pots and barrels** (`apps/game/src/pots.ts`): drawn with their sprites,
`tsubo_01` and `taru_01` in `/data/ani`, standing where the treasure is and
turned to the camera, at the villagers' pixel scale — a frame of 32 rows is a
person's height, so their 24 rows are three quarters of one. INFERRED: `0x10` is
the pot and `0x20` the barrel, from `randTTT`'s name — *tsubo*, *taru*, *tansu* —
the cabinet, *tansu*, being the third kind, `0x30`. Erinn's room, `M01M07`, has a
pot and two barrels. They look the same opened as shut. The `_02` sheets, three
56×32 frames named `taruware` and `tsuboware` (*ware*, breaking), are likely
the smash, but do not read yet: their pixels are not laid out like a villager's.
See `game-formats/FORMAT.md`, "Treasure".

**Chests** (`apps/game/src/chests.ts`): the model is `T00GDS01`–`04` in
`/data/bin/icon.nsarc`, the archive of things the engine draws in the world by
itself — two chests, red-brown and grey, each shut and open. A placed treasure
with a facing is drawn as one, turned by its facing, shut until it is opened and
open after; the gold cube is left for placed treasure that is not a chest.
INFERRED: that faced treasure is a chest, which kind is which colour (`0x40`
grey), the scale (the files' own units) and the front (−z, the side away from
where the open lid falls). None of the names say "chest": the search by name
found nothing, and the models were found among the engine's own.

**Not found** (set aside on 12 September):

- how the pot's and barrel's `_02` sheets — the smash, INFERRED — are laid out,
  and what `_03` is;
- which kind is the pot and which the barrel, beyond `randTTT`'s name;
- the monster list's records, which would let a chest monster be named rather
  than numbered.

---

## Things to examine

A cast record of kind 1 has no name and no model, and is placed like any
character; what its talk file says is what examining a thing says — the
village's three are a bush with something buried under it and a statue's
inscription, outside, and one in map `1106` that says nothing in chapter B.
INFERRED from those. The game keeps them as the cast's `spots`, and `f` talks to
them like anyone else, with no marker.
