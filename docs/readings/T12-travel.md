# Task 12 — travel: Zoom and the chimaera wing, Evac, a wipe-out

Read 6 October 2026 from the decomp's USA build (`~/Projects/dqix-decomp`,
symbols and relocations; the disassembly is `dsd dis` of its extract). Every
code address below is USA. The files named were read on the European
cartridge with the project's own parsers; the tables are the game's `Script`
command files (`table.ts`).

## Where it stood

- The chimaera wing took the Hero to `M01`, the slice's one village; indoors
  it said `strstd` 57 and was kept. Zoom did nothing at all.
- Evac went to `Loaded.regionExterior` from any `D` map.
- A wipe-out halved the purse (that part read: `func_02010604`,
  `0x020106e4`) and stood the Hero before the priest of `M01M06`, ours.

## The places reached

**A game-wide flag each, `0x200 + n`**, in the bank at `+0x8c`
(`data_02108844`, the bank `storyGlobals` keeps).

- **What sets them**: `func_ov017_0219e290(_, map)`, called from the map's
  load (`func_ov017_0219d250`, `0x0219d7b0`, with the new map's id from
  `GameState+0x3f8`). It looks the map up in **a table of 18 halfwords**,
  overlay 17 `data_ov017_021d6638`, and sets `0x200 + index` when found
  (`func_0206df6c`, `0x0219e2d4`). Then, in a game of one's own
  (`func_0202c508`), it tells the ship (`func_ov017_021d0924`) — task 16.
- **The table** (overlay 17, `0x021d6638`), in order: 1100, 1200, 100, 1300,
  20007, 1500, 5800, 1800, 1700, 1900, 200, 2000, 2100, 2200, 2300, 8612,
  5700, 400 — Angel Falls, Zere, Stornway, Coffinwell, **Newid Isle** (the
  field the Abbey stands on, not the Abbey's own 4200), Porth Llaffan,
  Slurry Quay, Dourbridge, Zere Rocks, Bloomingdale, Gleeba, Batsureg,
  Swinedimples, Wormwood Creek, Upover, the Magmaroo's summit, Gortress,
  Gittingham. Each is a village's exterior (its maps' area, below) save
  Newid Isle and the summit, which are the maps themselves.
- **Its shape, for finding it**: 18 halfwords, the n-th being either the area
  of the n-th place's revival map in `loola` or that place's own Zoom map —
  true of all 18, and of no other run in overlay 17.

## `data/map/loola.gp2` › `loola_<LG>.bin` — the list

Read by `func_020a818c` (`data_020f1b97`, `data_020f1baa`) as a command file
with four opcodes (`data_020f1b6c`): `0x64` and `0x65` do nothing (the
version and date), `0x66 n` allocates n entries of `0x2C` (`func_020a8218`),
and **`0x67` adds a place** (`func_020a7f88`), thirteen values:

| value | kept at | what |
|---|---|---|
| 0 | `+0x00` byte | **its number**: the flag `0x200 + n` that offers it, and the list's order |
| 1 | `+0x02` byte | 1 to 6, not read by anything found |
| 2 | `+0x04` | **its name**, as the list shows it (through `sprintf("%s")`) |
| 3 | `+0x18` | **the town's revival map** — a church in all but Dourbridge (its exterior), Zere Rocks, the summit and Gortress; see the wipe-out |
| 4 | `+0x08` | **the map Zoom lands on** |
| 5 | `+0x0A` | the facing there, × 4096 — 0 on all 18 |
| 6–8 | `+0x0C` | **where**: x, y, z, × 4096 (the map's own units) |
| 9 | `+0x1A` | the map **the ship** moves to, if the party has one |
| 10 | `+0x1C` | a number handed with it to `func_ov017_021d1a18` |
| 11, 12 | `+0x20`, `+0x24` | the ship's x and z, × 4096 |

The European file has 18, the table's 18, in the same order: Angel Falls
(F01), Zere, Stornway, Coffinwell, Alltrades Abbey (lands on F07), Porth
Llaffan, Slurry Quay, Dourbridge, Zere Rocks, Bloomingdale, Gleeba, Batsureg,
Swinedimples Academy, Wormwood Creek, Upover, The Magmaroo - Summit (D16M12),
Gortress, Gittingham Palace.

**The list offered** (`func_020a8304`, `func_020a8458`): every entry marked
unplaced, then, repeatedly, **the unplaced entry with the lowest number whose
flag is set** is given the next row, until none is left. So the rows are the
places reached, by number; the count is `+0x0C`.

**Looked up by revival map** (`func_020a83fc`, from the wipe-out's ship
placement only): the entry whose value 3 is the map — **5801 (Slurry Quay's
inn) and 4506 (the Observatory) both look up 1800, Dourbridge**.

## Zoom and the wing, as the field menu runs them (overlay 2)

**Zoom, cast** (`func_ov002_02157d40`, the field's spell dispatcher, on action
`0xCA`, `0x02158504`): the opening line is `str_tm` 9005 "X casts Zoom."
(`0x02158c6c`); with too little MP (`func_02048448`), 9007 "Not enough MP!".

1. `func_ov017_0219ff58(_, 1, 0, 0)` — bit 0 of `GameState+0x63dc`
   (`func_02011b50`) — sends the party off at once (`func_ov017_021acd30`).
   Not identified; clear here.
2. The list is built (above). **None**: `str_tm` 9016 "But the spell fails."
   and sound 100, no MP spent.
3. Otherwise the list window opens (state `0x14`).

**The chimaera wing, used** (`func_ov002_02157634`, on item `0x5603`,
`0x021576b4`): the list is built the same way; **none**: 31001 "But nothing
happens." (`0x7936 − 0x1d`), the wing kept; otherwise the same window.

**The window** (`func_ov002_0215f224`): title `str_tm` **1400 "To where?"**,
**six rows a page** (`_s32_div_f` by 6), each an entry's name, and below,
when there are two pages or more, **"n/m"** (`data_ov002_0216d2a8`, `%d/%d`)
centred on 120 (`0x78`) at y 99.

**A row chosen** (`func_ov002_02165b44`, state `0x14`):

- The caster fallen → back (state `0x11`).
- **How the map takes it**: when game-wide flag **`0x113a`** is clear, the
  current map's **value 17** in `maplist9.bin` — the map record's `+0x0E`,
  bits 0–1 (`func_020995f8` copies parameter 17 there); when it is set, 0.
- **2 — off it goes**: the line is 9005 for the spell (MP spent,
  `func_02048350` with the action's `+0x08` byte) or **31090 "X flings a
  chimaera wing!"** for the wing (spent, `func_ov002_0215a7b4`). The map
  request (`GameState+0x3f8`, `func_0200fcfc`) takes value 4 as the map,
  6–8 as the place and 5 as the facing. With the ship (flag `0x2b`, set at
  9.4) the ship goes to 9–12. Then the flight (`func_ov017_021acd30(_, 0,
  0, 0)`).
- **1 — the ceiling**: the same line, **nothing spent**, and the flight with
  its third argument 1 (`0x021ad428`: state 10), which says `strstd` **57**
  ("… bangs … head on the ceiling!", `0x021ad8a4`) and lands where it began.
- **0 — not here**: the wing says 31030 "X tries using the chimaera wing."
  and 31001 "But nothing happens."; the spell 9005 then **9016 "But the
  spell fails."** and sound 100. Nothing spent.

Value 17 on the European cartridge: 2 on every field and town or dungeon
exterior, 1 indoors (houses, churches, dungeon floors, grottos, the ending's
maps), 0 on a few (`X04`, the Observatory's exterior). It is what
`maplist.ts` called "which space the map is built in" from the labels.

**Flag `0x113a`** is trigger action **107** (`func_02061c04` case 7,
`0x02062090`): in a game of one's own, `0x113a` = (argument = 0). 57 records
carry it — Stornway's castle at 3.1 to 3.7, Zere at 3.5–3.6, Coffinwell at
4.2–4.6, the Magmaroo at 14.1–14.2, Gortress at 14.4–14.6, … — closing and
opening Zoom and Evac around a story's scenes. A wipe-out clears it at 16.2
step 1 (below).

## Evac

On action `0xCD` (`0x02157f34`) the dispatcher asks `func_ov017_021ab860`:

- flag `0x113a` set → **1**: 9016 "But the spell fails.";
- in a grotto → the grotto's way out (`GetGrottoStruct`) — grottos are not
  built;
- otherwise it runs **`data/map/riremito.bin`** (`data_ov017_021d78c4`) with
  opcodes `0x64`, `0x65` (nothing) and **`0x66`** (`func_ov017_021ab6b0`) into
  a result (`data_ov017_021d83b0`): the current map's record, then `+4` area,
  `+6` map, `+8` destination, `+0xC` place, `+0x18` facing, all 0 first.

**A `0x66` record**: value 0 an **area**, value 1 a **map** (0 for any), then
**destinations of five**: a map, then the facing, x, y and z as floats. Each
record, in the file's order (the return value is not looked at,
`Script::ExecuteSingleInstruction`):

1. skipped unless its area is the current map's — the map record's `+0x02`,
   15 bits, **`maplist9.bin` value 1** (1100 for Angel Falls and every one of
   its houses, 7100 for the Hexagon and its floors, 1 for a field);
2. skipped when its area is the one already taken and that was taken by a
   map-specific record (`+6` ≠ 0);
3. skipped when it names a map and that is not the current one;
4. with no destinations, it clears the destination when it names the current
   map;
5. otherwise **the first destination whose map is the last field the Hero
   stood in**, or, with none, **the last one**, is taken, with the record's
   area and map.

**The last field**: the protagonist's `+0x566`, written as a map is entered
whose kind (value 3, the record's `+0x0C` low nibble) is 0, a field
(`Zone3D::SwitchZone`, `src/World/Zone3D.cpp`).

The answer: no destination → **0**, 9003 "But nothing happens."; otherwise
the map request is made (map, place, facing, `+7` = 1) and the Evac task
started, and it is **3**: the line becomes **9020** "X casts Evac." and the
MP is spent. The European file: 21 records, 19 areas — the Hexagon to F01 at
(50.93, 0.20, 28), Gittingham's two (400 and 8701) to F34, Zere Rocks (7700)
to its own D07 at (0, 0.17, −20.11) except from D07 itself (7700, map 7700,
destination 0: nothing happens), and so on.

## A wipe-out

`func_02010604(gs, _, halve, map)` (from `func_ov017_021b790c`, `0x021b7c98`
and `0x021b7cbc`, when `GameState+0x5729` says the party fell):

1. **each fallen member** gets up (status bit 0) with **full HP**
   (`func_02048150(m, 0, 1)`) and **full MP** (`func_020482bc`); the living
   are left as they are;
2. the purse is halved (`GameState+0x3970`, `lsr #1`) — the bank is not;
3. `func_ov017_0219bfb4(2, map)`: **the map is the argument, or, when 0, the
   revival map** — `GameState+0x2A04+0x2c94`. A **set battle** (its
   `+0x28` ≥ 0) passes its request's `+0x3e`; what fills that is not read;
4. at story **16.2 step 1** (`+0x5cb0` 16, `+0x5cb4` 2, `+0x5cb8` 1) flag
   `0x113a` is cleared.

**The revival map** (`GameState+0x5698`):

| what | sets it to | where |
|---|---|---|
| a new game | **1106**, Angel Falls' church | `func_0208660c`, `0x02086770` |
| a save with bit 0 (a church's) | **the map saved in**, `Zone3D::currentZoneID_` — unless flag `0x113c`, when it is put back after | `func_020a9eb8`, `0x020a9fac` |
| a save with bit 3 | 109, Stornway's church | the same |
| trigger action **208**, in a game of one's own | its argument (and `+0x7e74`) | `func_02061c04` case 108, `0x02063ce4` |
| trigger action **179** | its second value, setting flag `0x113c`; with 0, clears `0x113c` and puts back `+0x7e74` | case 79, `0x02063310` |
| the battle after which the postgame begins | 109, with flag 3 | `func_ov000_02169770` |
| loading a save | the saved `+0x2c4c` | `func_020a95a4` |

Action 208 is on 12 records: 1106 at 1.4 (the Observatory, X01), 4201 at
6.5, 1800 at 8.2, 2005 at 10.7, 216 at 11.4, 2104 at 12.2, 2205 at 13.2,
109 at 12.1 and 16.1. Action 179 is on none.

**Arriving** (`func_ov017_0219bfb4`, mode 2): the map request is reset
(`func_02070378`) and given only the map — **no place** (`+7` 0). Then
**what the priest says** is chosen from **`data/scenario/chur_messet.bin`**
(`data_ov017_021d75dc`): a command file of `0x67` records, a map then twelve
strings, three groups of four — a **lowest and highest story major**
(`func_0201079c`, `GameState+0x5cb0`), then a value **by day** and **by night**
(`IsMorningDayOrEvening`). The first group whose range holds the major is
taken (an empty range holds always); the value, by `atoi`, defaults to 1.

- **3**: nothing is said.
- Otherwise the church (overlay 3) runs in **mode 2** (`func_ov003_02159174`,
  `+0x587`) with **voice value − 1** (`+0x5a0`, `str_ch<value − 1>`): its state
  10 (`func_ov003_0215af9c`) says line **1080 + mode = 1082** — "O Almighty
  One, may You watch over and protect these poor children! Amen!" in most
  voices, Gleeba's own — and its state 11 ends the visit.

The European file: 18 maps — 1106 says nothing at major 1 and voice 1 from 2
to 17; 216 (Gleeba) voice 1 by day and 2 by night to 16, 1 at 17; Dourbridge
5; Batsureg 6; Wormwood 2; the Observatory (4106, 4506) 4; Gittingham and
Gortress 7; the rest 1.

## Not read

- Where in the revival map the party stands: the request carries no place,
  and how the map's load places a party then is not read.
- What fills a set battle's `+0x3e`.
- The flight itself (`func_ov017_021acd30`'s task, overlay 17
  `0x021ad3c8`–`0x021ada40`): the party's rise, the fade (`SetBrightness`, 30),
  the landing.
- Bit 0 of `GameState+0x63dc` (`func_02011b50`), which sends Zoom straight off.
- Value 1 of a `loola` entry, and value 10 (the ship's).
