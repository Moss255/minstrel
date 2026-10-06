# Task 16b — the ship

Read 6 October 2026 from the US ARM9 and overlays 2 and 17 of the decomp
(`~/Projects/dqix-decomp`, USA build). Addresses are US. The functions are
logged in `docs/decomp-contributions.md`, "Read since"; what is built is in
`apps/game/src/ship.ts` and `main.ts`.

The ship is a vehicle of its own, as the Starflight Express is. It **sails only
on the ocean, map 10000 (`O00`, "Field - Ocean")** — the whole world at a
sixth, as the sky (10100) is, and wrapping at the same ±144 by ±112. In a field
it is **moored**, a model standing at one of the field's mooring regions, and
it is boarded by the A Button there.

## What the game keeps — `func_02012fe4()`, "W"

| at | what | new game (`func_020134e0`, `0x020136b8`–`0x02013704`) |
|---|---|---|
| `+0x2774` | **the ship's place on the ocean**, x y z × 4096 | (25, 0.1, 56.8) — `0x19000`, `0x199`, `0x38ccc` |
| `+0x2780` | its facing there, radians × 4096 | 0 |
| `+0x2784` | **the mooring** it is tied up at: a type-10 region's number | 0 |
| `+0x2786` | **the map** it is moored in | **1900, Bloomingdale** (`0x76c`) |
| `+0x2788` | **at sea**: 1 while the party is out on it | 0 |
| `+0x278c`, `+0x2790` | the field's place in the world, kept as the party sails out (`func_020a696c`, `0x020a6a54`) — not read further | |
| `+0x2794` | **the sea's encounter count** | 80 (`0x50`) |

`func_020a6aac` puts the default place back whenever it finds x and z both 0
(`0x020a7240`).

## A mooring — a `.bmbl` region of type 10

`func_0201d638` case 10 (`0x0201dd98`–`0x0201de3c`) reads the `0x74` after a
type-10 `0x73`. The region's own `0x73` gives its box as every region's does,
its centre at `+0x08` and its value 8 at `+0x20`.

| `0x74` value | kept at | what |
|---|---|---|
| 0 | `+0x2c` | its number |
| 1–3 | `+0x30` | **where the party is put ashore**, x y z (`ToVec3fix`) |
| 4 | `+0x2e` | the facing there, radians × 4096 (`ToFloat` × 4096) |
| 5 | `+0x3c` | **its reach** on the ocean, × 4096 |
| 6–8 (only with more than six values) | `+0x40` | **where the ship goes to sea**: its place on the ocean |
| 9 | `+0x4c` | the facing it puts out at |

**The ship stands at the region's centre, turned by its value 8**
(`func_020a6aac`, `0x020a6e7c`–`0x020a6e9c`; `func_020a72ac`, `0x020a7398`–
`0x020a73b8`). The values are integers on the cartridge — whole units and whole
radians — which the game turns into floats (`Script::Parameter::ToFloat`,
`0x02030b44`).

**204 on the cartridge, in 30 fields** (`F02` to `F63`; 18 in `F05`, 16 in
`F10`). No other map has one. Region types on the cartridge, for the record:
0 ×283, 1 ×184, 2 ×670, 3 ×22, 4 ×63, 5 ×113, 6 ×160, 8 ×163, 9 ×56, 10 ×204,
11 ×360, 12 ×23.

The `.bmbl`'s `0x7c` record, a box with an angle the steering would turn the
ship to along (`func_0201e8fc`, reading `+0x80`/`+0x84`; handler `0x0201e018`),
appears on **no** map: every `0x7b` on the cartridge, 509 of them, allocates
none. So that turn is never taken, and is not built.

## The ship's object — ARM9 `func_020a6728`, made with each map

Made on the ocean (10000), the sky (10100) and every field region (20000 to
29999) whose code has no `M` (`strstr`, `data_020f1b50`), from
`data/chara_sub/s201.chr` (`data_020f1b52`), object 201 (`0xc9`):

- **turning** `+0xb0` = `0xc9` radians × 4096 a vblank; **most speed** `+0xb4` =
  `0x106`; **speeding up and slowing down** `+0xb6` = 10 a vblank;
- its place from `+0x2774`, its facing from `+0x2780`;
- its scale **`0xa0`** on the ocean and the sky, **`0x180`** in a field
  (`func_020a6aac`, `0x020a6be8`, `0x020a6cf0`).

**Where it is drawn** (`func_020a72ac`, `func_020a6aac`):

- moored, in the map it is moored in: at the mooring, as above;
- **Bloomingdale**: the ship is the town's own pieces 4 and `0x28` — shown when
  it is moored there, hidden while it is at sea (`func_0201b600`,
  `func_02013380`);
- the ocean: where it is; the sky: at its place on the ocean, the two maps
  sharing their units;
- anywhere else, or at sea in the map it was moored in: not at all.

## Boarding — the A Button at the mooring

ov017 `func_ov017_02198618`: for each type-10 region the Hero stands in
(`func_02094b9c`, the box test every region's is), **if it is the mooring the
ship is at, in the map it is moored in**, the A Button's check is offered as
kind 11. A pressed (the dispatcher at `0x0219acec`, table
`data_ov017_021d64f4`) runs kind 11, `func_ov017_02199360`:

- the ship's place on the ocean and its facing become the mooring's values 6–9;
- **at sea** is set;
- the map is asked for: **10000**.

No question is asked. Nothing tests flag `0x2b`: before 9.4 the ship is in
Bloomingdale, which has no mooring regions.

## Sailing — `func_020a654c` each pass of the field

Unless the field is busy (`func_02046b24`), on the ocean:

**Steering** (`func_020a78dc`): the +Control Pad held gives one of eight
directions, the same table as the Express's (`data_020e90a8`: up π, down 0,
left 3π/2, right π/2, the diagonals between), **turned by the camera's own
turn** (`func_0202e7f0`); the object is set going (state 1) and its facing to
be that way. Nothing held: the state is set to stop. A drag on the touch screen
steers too (`data_02114e54`, more than 5 held, by `func_020968c4`) — not built.

**Moving** — the object's own mover (`func_020332ac`):

- `func_02033710` turns the facing toward the one wanted by at most
  `+0xb0` × the vblanks of the pass;
- `func_0203348c`: going, the speed rises by `+0xb6` a vblank to `+0xb4`;
  stopped, it falls by as much to 0 — **the ship coasts to a stop**. The speed
  used is the least of that and the most speed × (1 − the turn still to make
  ÷ π): it slows while it turns. It moves that far a vblank along its facing.
- `func_020a75ec` keeps `+0xb4` as it was across the mover.

**The ocean wraps** exactly as the sky does (`0x020a7688`–`0x020a7740`).

**The party rides it**: each member is put at the ship's place
(`0x020a777c`–`0x020a77e4`), and the Hero's facing becomes the ship's
(`+0x2780` written).

**Distance sailed** (`func_020a7ce0`, on 10000): every 3 units (`0x3000`) of it
takes one from the encounter count `+0x2794`.

**Reaching a shore** (`func_020a7d74`): the ship's wall contact (`+0xe0` bit
6), the wall's collision record (`+0x11c`) one whose **land bits** (bits 5–9
of its second halfword, `func_0204be78`) are set, the ship being steered, and
the ship heading into the wall — its facing against the wall's normal,
**below −0.75** (`-0xc00`). The vblanks of passes that hold are added up; any
that does not puts it back to 0; **at 40 (`0x28`)** the shore is reached. The
record gives **the field** — 20000 + 100a + 10b + c, as the sky's
(`func_0204bea0`) — and **its kind**, bits 10–14 (`func_0204be90`): kind 1 is
**Bloomingdale** (1900).

**Then** (`0x020a6648`–`0x020a668c`) a task asks (`func_ov017_021a9454`, kind
`0x39`): **`strstd` 58, "Disembark?"**. Yes asks for that map with no place
(`0x100000, 0, 0x100000`); no lets the ship sail on (`func_020a7f34`).

**B** (`func_02012444(pad, 2)`, `0x020a7858`–`0x020a78c0`), with flag `0x2b`
set: the ship stopped, the same task asks **`strstd` 59, "Switch to the inside
of the boat?"**; yes asks for **the deck, 5900 (`S09`), at (5.94, 3.38, 0.34)
facing 3π/2** (`0x5f0a`, `0x3614`, `0x570`, `0x4b66`).

## Coming ashore — `func_020a6aac`, a field entered from the ocean

- **From the ocean into a field** (`0x020a6d00`–`0x020a6d84`): the mooring
  nearest the ship (`func_0201b678`): the ship's ocean place × 6 less the
  field's place in the world, against each mooring's centre; **the nearest
  within its reach** (`+0x3c`) if any is, else the nearest of all. The party is
  put at its value 1–3 place, facing its value 4; **the ship is moored there**
  (`+0x2784`, `+0x2786`) and **at sea is cleared**.
- **Into Bloomingdale from the ocean** (`0x020a7018`–`0x020a70a4`): the party
  at (−28.5, −1.8, −7.5) (`data_020e909c`) facing `0x570`; the ship moored
  there, mooring 0; at sea cleared.
- **Into a field from the deck** (`0x020a6dc4`–`0x020a6e30`): the party at the
  mooring's value 1–3 place.
- **The field the ship is moored in** (`0x020a6e4c`–`0x020a6ebc`): the ship
  stands at the mooring, and its ocean place becomes the mooring's values 6–8.

## The deck — 5900, `S09`

- **Leaving it** (`func_020a696c`, from the map request `0x0219e4a0`): a
  request from the deck for a field or Bloomingdale is turned to **the map the
  ship is moored in**, with the place left for the field to fill (above). The
  deck's own doorway names Bloomingdale (`M09`).
- **At sea** (`func_020a72ac`, `0x020a7444`–`0x020a74b8`): walking toward the
  gangway — z 6 or more and x between −8.2 and −5.8 — puts the Hero back at
  (−7, 0.18, 5.9).
- **Back to sea**: **the ship's wheel** — character 1, a talk box where the party
  arrives from the sea (checked running, 6 October 2026) — has a talk record
  `6:1 164:1`. **Trigger action 164** (`func_02061c04` case 64, `0x0206313c`)
  starts task `0x37` (`func_ov017_021c1a98` with 0, run by
  `func_ov017_021c1af0`): the map asked for is **10000, at the ship's place and
  facing** (`0x021c1be8`–`0x021c1c18`).
- The deck's pieces 10 and 11 (the sea about it, or the quay) and its lighting
  pieces are switched by at-sea (`func_0201b8c8`) — not built.

## Zoom — overlay 2, `func_ov002_02165b44`

With flag `0x2b` and a game of one's own (`0x02165e94`–`0x02165f0c`): **the
ship is moved to the place's `loola` values 9 to 12** — its map
(`+0x2786`), **value 10 its mooring** (`+0x2784`), and its ocean x and z
(`+0x2774`, y kept). At sea is not changed: flown from the ocean, the field
entered from it moors the ship again, as above.

## Encounters at sea — `func_ov017_02196c4c`

On the ocean with flag `0x2b`: when the count `+0x2794` is 0 or less, it is
drawn again **between 30 and 100** (`NextRandomBetween(GetBTRandom(), 0x1e,
0x64)`) and a battle is asked for, its zone **the floor record under the ship**
(`+0x114`), its third halfword packed as 100a + 10b + c
(`func_0204be3c`). The ocean's floor records name zones 276 to 279.

## The ocean's collision — `O00A0000.col2`

Kind 3, as the sky's: each triangle's top seven bits index a trailing record of
eight bytes. **936 triangles, 36 records**: the shores are low walls (−0.06 to
0.09 high), each with its field and land bits (26 fields), one of kind 1
(Bloomingdale), and walls with no land (508 triangles) where no ship may land;
the floor is flat at 0, four records naming encounter zones 276–279.

## What was not found

- **The ship's size against the walls**: no radius is set on object 201
  (`func_020a6728`); the field's collision against objects is not read.
- **What the camera does at sea.**
- How the sea's battle chooses its monsters from the zone (`func_ov017_021b6e70`
  onward, the battle request with no roamer).
