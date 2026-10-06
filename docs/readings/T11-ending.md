# Task 11 — the ending: opcode `0x1E` and the staff roll

Read 6 October 2026 from the decomp's USA build (`~/Projects/dqix-decomp`,
symbols and relocations); every address below is USA. The cartridge minstrel
reads is the European one; the files named are the same on both.

## Where it stood

The story walk reaches 19.2, and winning set battle 25 at 17.2 plays
`ev29300`. That chains on through `538` — `ev29301` … `ev29306`, `ev29310`,
`ev29320`, `ev29350`, `ev29352` … `ev29373` — on one stage. `ev29350` stopped
on VM opcode `0x1E`; it is the only script on the cartridge with `0x1D` or
`0x1E` (two of each, at `0x6bfc`, `0x6c68`, `0x6fec`, `0x7058` from its code
base). `811`, `812` and `838` were read as the staff roll's start, stop and
stopwatch, and nothing was drawn.

## `0x1D` and `0x1E`

The interpreter is overlay 17's `func_ov017_021d4e38`, a jump table on the
opcode at `0x021d4e5c`, cases 0 to `0x1E`. A stack value is two words, a type
(0 integer, 1 float) and the value.

- `0x1D` (`0x021d5d6c`): pop; an integer is made a float (`_fflt`); widened
  (`func_0200c578`); `func_02009424`; narrowed (`_d2f`); pushed as a float
  (`func_ov017_021d4ad8`). Any other type is a fatal error (`func_0200159c`).
- `0x1E` (`0x021d5de4`): the same through `func_02008dcc`.

`func_02009424` and `func_02008dcc` are fdlibm's `sin` and `cos`: |x| against
`0x3fe921fb` (π/4) for the kernel directly, `0x7ff00000` for NaN and
infinity (`x − x`, `func_0200b608`), else `__rem_pio2` (`func_02007028`) and
the quadrant `n & 3` choosing kernel sine (`func_020085cc`) or cosine
(`func_020076f0`), negated by `0 − y` for the two that need it. `02009424`'s
small-angle branch calls the kernel sine, so it is `sin`; `02008dcc`'s calls
the kernel cosine.

`ev29350` uses them as `a = r × cos θ + x`, `c = r × sin θ + z` — a point on a
circle.

Read alongside: the comparison's sub-table (`0x021d55a4`) is 40 `==`, 41
`!=`, 42 `<`, 43 `<=`, 44 `>`, 45 `>=`, the second value against the top, an
integer against a float compared as floats (`_feq` … `_fgeq`) — which settles
what was INFERRED past `==`. `0x18` is `and`, `0x19` `or`. `0x0A`, `0x0C`,
`0x0D`, `0x1B`, `0x1C` are not used by any script and were not read.

## The staff roll: overlay 28

`811` (`func_ov001_0216224c`) pages in overlay group 5
(`func_020a1ef0(5)`), sets bit `0x1000` of a display word
(`func_0203b4a0`), and calls `func_ov028_021d96bc` with overlay 1's heap.
`812` (`func_ov001_0216227c`) clears the bit, calls `func_ov028_021d9714`,
and pages the overlay out (`func_020a1f4c(1)`). `838`
(`func_ov001_02163228`) writes `func_ov028_021d9748`'s answer through its
reference.

Overlay 28 is the roll, whole: 34 functions, `0x021d8a40`–`0x021d9a54`. Its
one object is `data_ov028_021d9b14` (`0xB0` bytes):

| offset | what |
|---|---|
| `+0x00` | **speed**, a float, 1.0 until the file sets it (`func_ov028_021d98b8`) |
| `+0x04`, `+0x08`, `+0x0A` | the lines: an array of 12-byte records, the count, the room |
| `+0x40` | a 32 KiB 4-bit bitmap: the sub screen's BG1, 256 × 256 |
| `+0x60` | how far it has scrolled, `fx32`; `+0x68` how far since the last band was cleared |
| `+0x64` | where the next line goes, `fx32` |
| `+0x6C` | the next line's index; `+0x6E` the bitmap wants copying |
| `+0x80` | the state, 0 to 3; `+0x81` the step within state 0 |
| `+0x84` | the timestamp the scroll began at; `+0x98` frames since; `+0x94` the frames last time |
| `+0x9C` | which of the two jobs the next V-blank does |
| `+0xA0` | the timestamp `811` was called at; `+0xA8` the ticks since, a 64-bit |

**`811`** (`021d96bc`): resets the object (`021d9494`), allocates the bitmap
and a 20 KiB heap and takes the timestamp into `+0xA0` (`021d9530`), and
sets a periodic V-count alarm (`func_020c93d0`, which reads `VCOUNT`,
`0x4000006`) at line `0xD7`, delay `0x1E`, calling `func_ov028_021d9668`
once a frame.

**State 0, the set-up** (`func_ov028_021d8dd0`), one step each time overlay
17 calls `021d9734` → `021d9624` (from `0x0218cfd4`):

0. ask for something numbered `0x7A`, `0x20B` (`func_02094b34`) — not followed;
1. wait for it (`func_02094b4c`);
2. the sub screen: BG1's control `0x400100A` to `(old & 0x43) | 0x1000`; the
   window colours through `func_0204b3a0` from the resource at
   `GameResources+0x2C`; **colour 5 of the sub screen's backgrounds set to
   `0x67F5`** (`LoadToSubBGStandardPalette`, offset `0xA`); BG1's map the
   tiles 0 to `0x3FF` in order, palette 0; the bitmap filled with `0x11` —
   **every pixel colour 1**; the four layers' priorities 1, 0, 2, 3; the sub
   screen showing BG1 alone (`0x200`), the top screen BG0 and the sprites
   (`0x1100`);
3. queue `data/evspt_lv5/staffroll.bin` (`data_ov028_021d9aa0`);
4. once it is loaded, run it (`func_ov028_021d98e0`) — below;
5. `SetBrightness(…, 0, 0x1E)`: a 30-frame fade to normal;
6. when the fade is over (`IsBrightnessTransitionActive`), state 1.

Then `021d9624` takes the timestamp into `+0x84` and zeroes `+0x98`.

**Each frame** (`021d9668`), alternately: with `+0x9C` clear,
`021d9574` — if the state is not 0, frames = (now − `+0x84`) × 60 ÷
`0x7FD88` (the tick rate, 523,656 a second), and **if that has changed**,
the state's job (`021d8d40`, the table `data_ov028_021d9a34`) with the
frames since last time, `+0x9C` set, and `+0xA8` = now − `+0xA0`; with it
set, `021d9188` — BG1's vertical offset (`0x4001016`) to the scroll's whole
pixels mod 256, the bitmap copied if `+0x6E` says so — and `+0x9C` cleared.
So the roll moves on every other V-blank, by the frames that have passed by
the clock.

**State 1** (`func_ov028_021d9208`, handed `d` frames): the scroll and the
band counter go on by `ffix(2 × (d × speed × 0.5) × 4096)` — `speed` pixels a
frame (`021d8a74`). Once the band counter reaches 32 px, the 32-pixel band
the scroll has passed is filled with colour 1 again and 32 taken off
(`021d8ad4`). Then lines are placed while they fit:

- a line with the **same group** as the line before is placed at once, at the
  same height;
- a line of a **new group** waits until `scroll + 192 ≥ next + gap`, then
  `next += gap` and it is placed there.

A line is drawn at `y = next mod 256` (again at `y − 256` where it would run
past the bottom), at an x by its alignment — 0 at 0; 1 centred,
`(256 − w) / 2`; 2 ending at 120, `120 − w`; 3 from 136 — where `w` is the
text's width (`func_020420e8`). It is drawn by `func_0204f41c` in font 1 if
its size is 12, else font 0, in its colour. When there is no line left,
state 2.

**State 2** (`021d942c`): the scroll goes on; when `next + 16 ≤ scroll`, state
3, which has no job — the roll has run out and stands still.

**`812`** (`021d9714`): the alarm off (`func_020c949c`), then `021d94e4` →
`021d8c20`: **brightness −16 at once** (`SetBrightness(…, −16, 0)`), the
bitmap freed, the display put back as it was.

**`838`** (`021d9748`): `+0xA8 × 64 ÷ 0x82EA` — ticks to milliseconds,
truncated (`_ll_udiv`). It is **0 until the first frame of state 1** (`811`
zeroes it), and from then the time since `811` itself, set-up included,
renewed on the frames the roll moves.

## `staffroll.bin` is a command file

`data/evspt_lv5/staffroll.bin` is the same container as the tagged data table
(`.bmdj`, `.bcfg`, `mapbgm.bin`): the decomp's `Script` class
(`src/Resource/Script.cpp`), whose header's first word is the **instruction
count** — the table's `unknown_0x00` — and whose records are instructions
handed to a table of functions by number. Overlay 28 gives it three
(`data_ov028_021d9ac0`, run by `Script::Execute`):

| tag | function | values | does |
|---|---|---|---|
| `0x64` | `021d97b0` | count | makes room for that many lines (`021d9940`) |
| `0x65` | `021d97d8` | group, flags, gap, text | adds a line (`021d999c`): `+0x00` group (`s16`), `+0x02` gap (`s16`), `+0x04` flags, `+0x08` the text, copied by `sprintf` |
| `0x66` | `021d9898` | speed | sets `+0x00` |

The flags, as `021d9208` takes them apart: bits 0–3 the **size** (12 or 10;
12 picks font 1 and is passed as the size), bits 4–5 the **alignment**, bits
7–10 the **colour**. Bit 6 and bits 11 up are read by nothing there.

On the European cartridge: 472 instructions — speed **0.86**, room for 470,
then 470 lines in 418 groups, from "SQUARE ENIX CO., LTD." to "Shuhei
Yamaguchi". Headings are size 10 in colour 5; names size 12 in colour 15;
the two-column pages put a name right-aligned to 120 and one from 136 in the
same group. The gaps are 209 between companies, 37 between roles, 23 under a
heading and 13 between names. The last line lands at 13,650 px, so the roll
runs out after 13,666 ÷ 0.86 = 15,891 frames, **264.8 s** of scroll.

The events agree: `ev29352` … `ev29373` wait on `838` for set times —
21,500 ms, …, 238,500 ms — and `ev29373` waits for **268,550 ms** before
calling `812`: three seconds after the roll has run out, with the set-up's
half a second.

## The fonts

`data_0210782c` holds the two fonts by number (`func_02042944`): **0 is
`s7`, 1 is `me`** (`fd_%s.bin` and `fi_%s.bin`). A space is
`data_020e7bd8[font] + 1` wide — **3 in `s7`, 4 in `me`** — and so is a
character with no glyph, drawn as glyph 0.

- A glyph is found by its name (`func_0204254c`): the first whose name
  matches the text's next bytes for the name's length — `strncmp` with the
  length in **the low six bits of the glyph's flags**. Those bits are the
  name's length, 242 of 242 in `me` and 245 of 245 in `s7`.
- **Drawing** (`func_0204f41c`) advances each glyph by its width + 1, **with
  no kerning**.
- **Measuring** (`func_020420e8`) adds the kerning pair's adjustment
  (`func_020425e4`) to that, the pair being the glyph before and this one;
  a space or an unknown character breaks the pair. The total less 1.

So a line is placed by a width that is kerned and drawn without it — a pixel
or so to the left of true centre on a line with pairs in it.

## Not read

- **Colours 1 and 15** of the sub screen: set by `func_0204b3a0` from the
  resource at `GameResources+0x2C`, which was not followed. Colour 1 is the
  roll's ground and 15 its names' ink.
- **What the fade covers**: `SetBrightness` on `GameResources`; whether the
  top screen fades with the bottom is not read.
- **Step 0's request** (`0x7A`, `0x20B`) and how long the loads take.
- Whether overlay 17's caller at `0x0218cfd4` runs every frame (INFERRED: it
  is the field's frame).
- `592`, `593` and `594` (`func_ov001_021619bc`, `02161a1c`, `02161a60`): a
  second, untimed roll object at the event scene's `+0x160` — started, asked
  whether it has run out, freed — stepped two frames at a time by
  `func_ov001_02155d54`. **No event on the cartridge calls any of the three**
  (a census of all 687 scripts); `595` and `596`, beside them, are other
  things.
