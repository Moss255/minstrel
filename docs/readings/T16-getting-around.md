# Task 16 — getting around: ladders and vines, locks, the ferry, the ship

Read 6 October 2026 from the decomp's USA build (`~/Projects/dqix-decomp`,
symbols and relocations; the disassembly is `dsd dis` of its extract). Every
code address below is USA. The files named were read on the European
cartridge with the project's own parsers.

## Where it stood

- Nothing handled a ladder or a vine. The guide (p. 5): "a few climbable
  vines or ladders … approach the object and push toward it."
- No lock logic anywhere.
- The ferry and the ship: see their sections.

## Ladders and vines

**A ladder is two regions of a map's link table**, its `.bmbl`: a `0x73` of
**type 9** at each end, each with its `0x74`. Nothing else — no object, no
collision attribute, no map flag. The guide's vines are the same thing: there
is one climbing code, and every type-9 region on the cartridge is read by it.

### The records

`func_0201d530` (`0x73`) reads, as for every region: the type (`+0x04`), a
centre (`+0x08`), a size (`+0x14`), value 7 an angle reduced to 0..2π
(`+0x22`), value 8 a second angle (`+0x20`), and the squared radius of width
and depth (`+0x24`). **The second angle is the ladder's facing**: the way the
Hero faces climbing up.

`func_0201d638` case 9 (`0x0201dbf8`–`0x0201dd94`) gives the `0x74`:

| value | kept at | what |
|---|---|---|
| 0 | `+0x2c` | **this end's number** |
| 1 | `+0x2e` | **the other end's number** |
| 2 | `+0x30` | 0 on all 56; not read by anything found |
| 3 | `+0x31` | **flags**: bit 0 this end is the **top**; bit 1 leaving by this end **changes map**; bit 2 the map is entered **on a ladder** |
| with bit 1: 4 | `+0x32` | the map, a code (`func_0209998c` looks it up) or an id |
| 5, 6 | `+0x34`, `+0x36` | −1 or 0; not read |
| 7–9 | `+0x38` | where the Hero arrives, x y z |
| 10 | `+0x68` | the facing there, × 4096 |
| 11 | `+0x6a` | handed on as the request's `+0x0b`; not read further |
| 12–20 | `+0x44`, `+0x50`, `+0x5c` | three more positions, handed on with it (a doorway's `0x74` carries the same three) |
| 21 | `+0x6c` | with bit 2: how far up the ladder entered, × 4096 |
| 22 | `+0x6e` | with bit 2: which ladder end in the new map |

The regions are kept in a list per type (`func_0201e838(list, 9)`, `+0x3c +
type × 4`), each linked on by `+0x70`; `func_0201e6d4` finds an end by its
number.

**On the cartridge: 56 type-9 regions, 28 ladders, in 20 maps** — Dourbridge
(`M08`), the Heights of Loneliness (`D07M01`, `M02`, `M03`, `M08`), `D08`
(`M03`, `M05`, `M06`), the Bad Cave (`D09M01`), `D13M01`, the Tower of Nod
(`T02M08`) and the Realm of the Mighty (`X04` and its `M01`, `M04`, `M11`,
`M16` to `M20`). Every pair names each other, and one end of each is the top.
Five lead out of their map by one end: `D07M02` ↔ `D07M03`, `D08M05` ↔
`D08M06`, `X04M16` ↔ `X04M17`, `X04M18` ↔ `X04M20`, `X04M19` → `X04M03`.
`D07M08`'s ladder enters other maps on a ladder (bit 2), by ends that do not
exist there (`D07M01` has ends 1 and 2, not 4; `D07M07` has none); its
destination places are all zero, and nothing on the cartridge leads to it.

### Starting a climb — `func_ov017_021975e4`

The first of the field's per-pass checks (`func_ov017_0219755c`, before the
doorways and the areas). It returns at once when:

- B or X is held (`func_02012430(pad, 0x402)`);
- the Hero is already on a ladder (`+0x26c`), or something holds them
  (`func_020535c8`, `func_0203402c`);
- the field is busy: any of `0xc`, `0x2d`, `0x26`, `0x35` in the list at
  `field+0x36fc` (`func_02046b60`);
- the Hero is not walking (`+0xbe` other than 1).

Then for each type-9 region the Hero stands in (`func_02094b9c`, the same
box test as an area's): with `l` the ladder's facing as a direction
(`sin, 0, cos` of `+0x20`, normalised), `f` the Hero's facing and `p` the
+Control Pad's direction (`field+0x4438`, normalised, written by
`func_ov017_0218d8cc`):

- at the **bottom** the Hero must face it, `l·f > 0`; at the **top**, face
  away, `l·f < 0` — otherwise the region is passed over;
- a count at `field+0x42ee`: while it is 0 or 1, it goes up by one when
  `|l·p| > 0.8` or `|l·f| > 0.8` (`0xccc`), and back to 0 otherwise; **when it
  is past 1 the climb starts** and it goes back to 0. So the third pass in a
  row of pushing toward it.

The climb (`0x02197878`–`0x02197a3c`) is a record handed to the Hero
(`func_020398b4`, kept at `+0x26c`), with `b` the bottom end, `t` the top and
`d` the direction of the end it started from:

| at | what |
|---|---|
| `+0x00` | on a ladder |
| `+0x01` | the step, below; 0 to start |
| `+0x03` | started from the top |
| `+0x06` | the facing on the ladder: the starting end's `+0x20` |
| `+0x08` | the facing leaving at the bottom: `b`'s − π, in 0..2π |
| `+0x0a` | the facing leaving at the top: `t`'s |
| `+0x0c` | the bottom: `b`'s centre |
| `+0x18` | the top: `t`'s centre, **one lower** (`− 0x1000`) |
| `+0x30` | where it is left at the bottom: `b − d/4` |
| `+0x3c` | where it is left at the top: `t + d` |
| `+0x53` | 1: the pad is read (`func_02038508` sets it) |
| `+0x58`, `+0x5c` | `b`'s and `t`'s regions |

### Climbing — `func_02038598`, each pass

Called from the Hero's update (`func_02037d88`, `0x02038124`) after the
object's own (`func_02052ae8`), on the field's pass — two vblanks.

0. **Turn to it.** Face the starting end's centre (`atan2`), at once
   (`func_02033834`); then `hasigo_in`, once (`MaybeSetRegularAnimation`
   flags 1), and step 1, the Hero's place kept (`+0x24`).
1. **Get on.** Face `+0x06`. From the bottom the motion is advanced **twice
   more** each pass (`AdvanceAnimations`). The Hero goes from where they were
   toward the bottom **+ 0x51** up, or the top **− 0xa3**, by the motion's
   normalised time: `from + (to − from) × t`. When it stops: there, step 2,
   `hasigo_loop`.
2. **Climb.** Down held (`0x80`) goes down, Up (`0x40`) up, `0xf5` a pass;
   nothing while the field is busy (`4`, `0x26`, `1`, `3`, `0x3e`) or `+0x53`
   is 0. **x and z follow y** along the line from bottom to top
   (`fix32_Divide` of the height). Going **down plays `hasigo_loop`
   forward, going up backward** (flags 0, 4); held still, it stops where it
   is (flag `0x1000`) and goes on from there (`+0x48`). Below the bottom:
   leave there (step 5, toward `+0x30`, facing `+0x08`), or by that end's
   map (step 6). Above the top: clamped, `hasigo_out` once, step 4 — or that
   end's map.
4. **Get off at the top.** Once the motion has begun, y goes a tenth of the
   way to the top's own each pass (`0x199`, rounded). When it stops: step 5,
   toward `+0x3c`, facing `+0x0a`.
5. **Walk off** (`func_02033e18`): straight toward the place, `+0xb4` a
   pass — `0x189`, the default every object is given (`func_02032e58`) —
   running (`+0xbe` 1), arriving when nearer than that (`func_02033e38`).
   Then the record is cleared.
6. **Another map** (`0x02038fe0`): a map request (`func_0200fcfc`) of that
   end's map, place, facing and three positions, as a doorway's; with bit 2
   the ladder end and how far up (`+0x6c`, `+0x6a` of the request), which
   the arrival (`func_020399b0`) uses to put the Hero on it at step 2.

The touch screen's drag also climbs (`data_02114e54`, held more than 5;
`func_ov017_0218d268`'s `+0x220`–`+0x223`); not built here.

### Built, 6 October 2026

`mapLadders` (`game-formats`, `transitions.ts`) reads the ends;
`tryClimb` and `climbPass` (`sim`, `ladder.ts`) are the two functions above;
`apps/game/src/ladders.ts` and `main.ts` (`maybeClimb`, `climbOn`,
`leaveByLadder`) put them in the field. Seen in Dourbridge: on from the top of
the bridge, down, off at the bottom, back on, up, and off at the top.

**Corrected**: `readMapTransitions` took the 11 ladder ends that lead out of
their map (type 9, a map's code in the doorway's slot) for doorways, so
walking into one changed map as a doorway does. It now reads the `0x73` form
only for type 2.

**Ours**: the sines are `Math.sin`, not the game's table; what the party does
while the Hero climbs (they keep to the Hero's steps); X held, which the game
also tests, since this engine opens the menu as X goes down; the Up and Down
of a stick, past half. **Not built**: the touch screen's drag; entering a map
on a ladder (bit 2) — `D07M08`'s, the only one, names ends that do not exist;
the motions' own sounds, which their `.bcfg` names and the field does not yet
play.
