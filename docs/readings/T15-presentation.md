# Task 15 — the battle's presentation

Read 6 October 2026 from the USA build's disassembly (`dsd dis` of the
decomp's extract; overlay addresses are the European build's too). Each
answer has its addresses; what was not found says where the search stopped.

## The camera while a command is chosen — overlay 26's fixed shots

**The table** is `data_ov026_021de87c`: 47 records of 28 bytes, ended by a
record whose first word is −1. Each is a key, then an eye and a look-at, three
`fx32` each (`func_ov026_021d8b98` copies the first three, `Vector3i::operator=`
the second).

**The key is a monster's `mon_data` `+0x10`**, the half-word FORMAT.md had as
`unknown_0x10`: `func_ov000_0215fc8c` walks the battle's eight monster objects
(`data_ov000_02182c44`), and for each takes `GameState::GetGameObjectByIndex`'s
`+0x144` — the `mon_data` record `func_02048850` stores there, whose `+0x0c`
is the radius `SetRadius` takes — and compares its `+0x10` with the key. On the
cartridge `+0x10` is 1 to `0x133`, one value to a kind of monster across its
story versions: the bosses are `0x101` (the hexagoon) to `0x133` (Rhapthorne).
INFERRED: that it is the bestiary's kind; the code only compares it.

**The choice** (`func_ov026_021d8aac`, every frame of overlay 26 from
`func_ov026_021d8ba0`, `0x021d8c70`), in the table's order, the first that
holds:

- a key of 0 holds only when `func_ov000_0215fc60` gives 2 — the battle's first
  group (`battle+0x81fe`, the monster number written at `0x0215cf74`) is
  monster 801, the story's first Corvus (800, Aquila, gives 1);
- any other key holds when a monster of that `+0x10` is in the battle;
- key `0x115`, Corvus's last form, has three records: the round
  (`battle+0x8e20`, the round counter) mod 3 picks among them
  (`0x021d8b54`).

The key is kept at `+0x77f0` of overlay 26's task, the eye at `+0x77f4`, the
look-at at `+0x7800`; −1 when none holds, and at the battle's set-up
(`func_ov000_021643d4`, `0x02164d4c`).

**Where it is used**: `func_ov000_0216d600`, the side shot, replaces its eye and
look-at with them when its seventh argument is set and the key is not −1
(`0x0216d830`–`0x0216d880`), before the side's sign is applied (side 1 keeps
them as they are). Only the opening's shot passes it set:
`func_ov000_0216118c` (`0x021611d8`, the argument 1), which overlay 26 calls
for the opening and for each round's cut. Every camera command of overlay 25
that frames a side (modes 0, 8, 9, 15) passes 0 (`0x021e3d78`, `0x021e3fe8`,
`0x021e4050`, and the fourth beside them). The wide half-angle (22°) stays.

## The chase shot's tall target — the yaw offset

`func_ov000_0216e678`, the chase's start, read whole:

- its draws, in order: a hundred (`0x0216e710`), kept at
  `data_ov000_02184270`; when 1 to 4 actions have passed without a forced
  start, one in 5 less those passed (`0x0216e738`) — forced on 0; on 5, forced
  without a draw; then, forced, one of four start poses (`0x0216e8c8`);
- the four start poses, `data_ov000_021832c4`: yaw +162°, −162°, +18°, −18°
  (`0x2d3c`, `0x505` in 4096ths of a radian), height 0.5, distance 5, 5, 10, 10;
- **for a target taller than 2.5** (the draws at `0x0216e918` and `0x0216e968`): the orbit's height
  −1.2 − 0.8 × a float draw, kept at `data_ov000_02184270 + 8`; and, unless
  `func_ov000_0216f728` holds, **the yaw offset**: π × (0.35 − 0.7 × a float
  draw) — ±63° — kept at `+0xc` (to `.L_0216e9a8`, the constants
  `0x3f8cbe4c` = 0.35π, `0x40490fdb` = π, `0x3f333333` = 0.7);
- `func_ov000_0216f728` holds when the turn's action (`+0x27c`, the turn record
  `func_ov000_02160f20` gives, its first half-word) is 9, 10 or 11 — Frizz,
  Frizzle, Kafrizz.

`func_ov000_0216ea38`, the follow, for a target taller than 2.5
(`0x0216ee60`–`0x0216eeb8`): the look-at's height max(h/2, 2.5), the orbit's
height **the kept `+8`**, the yaw **plus the kept `+0xc`** unless
`0216f728` holds, the distance at least 8. **The two are kept between
chases**: only a forced start on a tall target draws them, and the follow uses
whatever they hold — a chase that was not forced takes the last forced one's
(both start at 0, `.bss`).

**Settling** (`0x0216ecd0`, to `.L_0216ece8`): the start sets a count
(`data_ov000_02184270 + 2`) of 5 when forced, 0 otherwise; each follow takes
one off it, and once it is 0 marks the chase settled (`+0x261`) when the
look-at is less than 5 from where it wants to be.

## State 6 — what brings a blow's line up

Overlay 25's action loop keeps its state at `+0xeac` (`func_ov025_021db038`,
`0x021db36c`–`0x021db3bc`: 6 → `func_ov025_021dc324`, 3 → `021dc590`,
4 → `021dc694`, 5 → `021dc880`). **What sets 6** is `func_ov025_021dc220`,
called as the action begins (`func_ov025_021db8d8`, `0x021dbde8`,
`0x021dbdf4`) or, after state 2, once every struck one is ready
(`func_ov025_021dc168`, `0x021dc214`): state 6 when `func_ov000_021627fc` holds, else 3.

`func_ov000_021627fc`: the turn's action — 1 for those `func_ov000_02163690`
turns into the Attack — looked up in the action table
(`func_02079e2c`), **its `+0x14` bits 28–31 being 2 or 5** — `+0x17`'s high
nibble, which minstrel already reads as the action's reach (INFERRED: 2 one
ally, 3 all, 4 a group; the wiki's Actions page has 3 and 4 roll one critical
for the whole action). On the cartridge 5
is the Attack's two records alone; 2 is the heals, Zing and the herbs that
take one ally (189 records). The other values: 1 (238, Defend and the like),
3 (162, the many-target spells), 4 (58), 6 (the five Fources), 7 (15, Zoom,
Evac, the seeds), 8 (7), 0 (5).

**State 6** (`func_ov025_021dc324`) waits for the window (`func_ov025_021ea46c`)
and, while the chase runs (`+0x260`), for it to settle (`func_ov000_0216f0bc`,
`+0x261`); then hides two objects, and puts the line up (`func_ov025_021ea474`,
`0x021dc4cc`), then waits for the struck to be ready before state 3. A camera
command of the script stops the chase (`func_ov000_0216d370`), so a script that
moves the camera has its line up at once. **Any other action** goes to state 3,
and its line goes up with its script's first camera, as read before
(`func_ov025_021e9b2c`).

## The rates

**The field's loop waits for two vblanks a pass**: overlay 17's loop
(`func_ov017_0218b688`, `0x0218c78c`–`0x0218c7b4`) waits for the vblank
interrupt (`func_020c9820`: `WaitForInterrupt(true, 1)`) `2 − GameState+0x3c8`
times less one, and then once more. `+0x3c8` is the count of vblanks since the
last pass — `func_02012bd8`, set as an interrupt handler at `0x02012cf8`
beside `IME`, adds 1 to it (`0x02012c08`–`0x02012c10`), and `CalculateDeltaTime` takes it
as `numTicks_` and clears it. So a pass is two vblanks at least: **30 a
second**, the DS's 59.8261 Hz halved (GBATEK, "LCD Dimensions and Timings":
355 dots × 263 lines × 6 cycles at 33.513982 MHz).

`GameState::CalculateDeltaTime` (decompiled, `src/GameState/GameTime.cpp`)
takes the pass's microseconds — the OS timer's ticks × 64000 ÷ 33514
(`0x0218c840`–`0x0218c874`) — capped at 50 ms, as whole milliseconds; the
effective time is that × the game's speed, and **an animation frame is 17 ms**
of it.

- **The action dispatcher** runs once a battle update (`func_ov000_02160620`
  → overlay 25's state 8 loop): a pass every two vblanks, handing the pass's
  whole milliseconds. INFERRED: that the battle's task runs once a pass of the
  field's loop, as every field task does — the encounter is the field's task
  and the battle its request.
- **The rising numbers** step once a battle update (`func_02039fec`, called
  from `func_ov000_02160620` at `0x021606c0` with no count), not by time: their
  37 steps take 74 vblanks.
- **A tick of the results windows** is a vblank: their row counter `+0x11d`
  is taken down by `GameState::GetTickCount` (`func_ov023_021d8f2c`,
  `0x021d8f38`), at least 1.
- **The menus** take `GetTickCount` too (`func_ov000_021735d0`, called at `0x021606b8`).
- **The swirl** (`func_0204700c`) counts vblanks (`GetTickCount` at `0x0204702c`, added at
  `.L_020470e8`) to its 35, but turns the camera by 8° and narrows the view by
  0.4333° **once a pass**.
- **Brightness** fades are timed: a count × 16.667 ms (`SetMainBrightness`,
  `src/Resource/Brightness.cpp`) — as minstrel already had.

## The panels — the acting member's pulse, and the level

**The pulse** (`func_ov000_02170b0c`, for each member from
`func_ov000_021754fc` with the vblanks since the last update): while the
member record's `+0x43c` bit 0 is set, a phase `+0x438` grows 0.2 a vblank and
wraps at π; t = 1 − sin(phase); the colour is red and green 10 + ⌊21t⌋, blue
10 + ⌊−10t⌋ (`0x41a80000` = 21, `0xc1200000` = −10) — from grey (10, 10, 10)
to yellow (31, 31, 0) — written to **colour 15 of the member's panel palette**
(sub BG palette 2 + their place, `LoadToSubBGStandardPalette` at
`(+0x4c + 2) × 32 + 0x1e`). Bit 1 asks it to stop: the colour goes back to
white (`0x7fff`) and both bits clear. **What stops it**: `func_ov000_021754e0`,
from overlay 25 as an action ends (`0x021dcbc8`), for a party actor.
**What starts it is not found**: no store setting bit 0 was found in overlays
0, 23–26 or the ARM9 (searched for every store to `+0x43c`, to `+0x3c` from
`+0x400`, and for `0x43c` in a literal pool).

**A hit's flash and shake: not found.** The member record's other fields
(`+0x80`–`+0x87`, `+0x430`–`+0x43e`) were followed: `+0x80`/`+0x82`/`+0x86`
are the menus' lists, `+0x430` the coup de grâce's glow (`func_ov000_021707f0`,
reading `+0x3b` bit 3), `+0x43d`/`+0x43e` the menu's. Nothing found shakes a
panel.

**The level number** (`func_ov000_02174738`, `sprintf` at `0x021748f0`): `sprintf("%d", …)` of the
member's level in their vocation (the character's `+0x150` record, `+0x16c` +
2 × its `+0x950`), measured in font 0 (`func_020420e8`) and drawn right-aligned
into a 16-pixel-wide sprite in colour 15 (`func_0205b234`, x = 16 − width),
sprite `0x24 +` member. **Placed** (`func_ov000_021811f4`) at the panel's
corner plus **(44, 22)** on both panels (`0x02173dcc` and `0x021740e8`, the large and the small) — when no
status icon is shown there (`func_ov000_02174324` returns 0); sprite
`0x20 +` member (a 128-byte image, `func_020421b0(0x28 + 4 × +0x950)`) at
(12, 22) on the large panel, (20, 22) on the small. INFERRED: what that image
is — not read.

## Going in and out

- **The swirl's model** (`func_02046cc8`): `ev999991500.chr`, polygon ID
  `0x3d`, placed at (0, −10, 1) through `+0x44` (`func_020407b4`), its `.bcfg`
  animation 0, advanced each pass (`Object3D::AdvanceEffects`), drawn by
  `Object3D::Draw(true)` from `func_ov017_021b65bc` while the transition's
  state is 3. Under which view it is drawn — the field's camera, rolled and
  narrowed, or another — **is not read**, so the model is not drawn.
- **The transition** (`func_ov017_021b6290`, `0x021b6438` on): the battle's
  track (`func_0209c480`), then, unless a value from `func_020709ac` is over 30
  or the main screen is already black, the swirl (state 3); otherwise both
  screens to black at once (sub over 15) and no swirl. What `func_020709ac`
  gives is not read.
- **A set battle's 15-frame wait** and **the music's fade over 10** are as read
  on 1 October (FORMAT.md, "The way into a battle, and out").

## Questions for the emulator (`docs/still-open.md` §1b)

- Does a battle hold 30 updates a second? A rising number should stay 74
  vblanks, about 1.24 s.
- What view the swirl's model is drawn under.
- What turns the acting member's pulse on, and what flashes and shakes a hit
  member's panel.
