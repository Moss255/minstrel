# Task 17 — the battle's AI

Read 6 October 2026 from the USA build's ARM9 and overlays 0 and 24, with
the decomp's symbols and relocations (`~/Projects/dqix-decomp`). Addresses
are the USA build's; the overlays' are shared with the EU cartridge.

## 1. How a monster chooses among its ways — the eight rules

`func_0208a91c` reads bits 5–7 of the monster record's word `+0x10`
(`ldr r0,[r0,#0x10]; lsl #0x18; lsr #0x1d`, `0x0208a944`–`0x0208a94c`) and
calls one of eight pointers-to-member in the table at `0x020f10b0`:

| rule | handler | what it does |
|---|---|---|
| 0 | `func_0208a4ac` | `func_0208a370` with table 0 |
| 1 | `func_0208a4cc` | table 1 |
| 2 | `func_0208a4ec` | table 2 |
| 3 | `func_0208a52c` | in turn, by the monster's own count |
| 4 | `func_0208a50c` | table 3 |
| 5 | `func_0208a5d8` | a pair in turn, a coin within it |
| 6 | `func_0208a700` | the first way, then one of the others, by turns |
| 7 | `func_0208a840` | in turn, by the group's count |

Every one of them tries a way with the usable test `func_0208a03c` and,
when it says yes, hands back the way's action (`+0x18 + 2w` of the record).
When none is usable each ends the same way: the target cleared, then
`func_ov000_02154a04(battle, actor, 2, …)` — the first handler with action 2,
the Attack — and 2 handed back.

**By the weights** (`func_0208a370`): `NextRandomMax(256) + 1` walked down
the six bytes of table `t` at `0x020e8caa + 6t` — while the weight is below
what is left, subtract it and go on (`cmp r0,r1; bge` at `0x0208a3c8`) — a
draw past the sixth taking the sixth; then that way, the ones before it down
to the first, and the ones after it. Unchanged from what was modelled.

**Rule 3** (`func_0208a52c`). The count is the byte at `+0x38` of the
monster's status — the fighter's `+0x138` pointer (`ldr r4,[r0,#0x138]`,
`0x0208a554`). Six times: the way is the count; the count becomes
`(count + 1) mod 6` (`_s32_div_f` by 6, `0x0208a56c`–`0x0208a574`); the way
is tried. No draw of its own.

**Rule 7** (`func_0208a840`). The same, with the count the first byte of
`battle + 0x81c0 + 0x18 × g`, `g` the fighter's byte at `+0x17c` — its
group (`0x0208a868`–`0x0208a884`). No monster on the EU cartridge has rule 7.

**Rule 5** (`func_0208a5d8`). The count first taken modulo 3 and stored
(`0x0208a604`–`0x0208a60c`). Three times: `NextRandom` (a raw draw — not
below a maximum) and its low bit `b`; with `c` the count, the pair is
`2c + b` and `2c + (b xor 1)`; the count becomes `(c + 1) mod 3`; the first
of the pair is tried, then the other (`0x0208a624`–`0x0208a6c8`).

**Rule 6** (`func_0208a700`). The count first taken to its low bit
(`0x0208a734`–`0x0208a73c`). Twice: at 0 the range is way 0 alone (first 0,
`n = 1`), at 1 ways 1 to 5 (first 1, `n = 5`); `NextRandomMax(n)` — a draw
even when `n` is 1 — is where to start; the count flips; then `n` ways from
there, round within the range (`(at + 1) mod n`, `0x0208a7d4`–`0x0208a7e8`).
So a monster of rule 6 takes its first way one turn and one of the rest the
next, and on when either is unusable.

**What the counts start at is not found.** Nothing but these three handlers
writes `+0x38` of the status (a search of every `strb …,#0x38]` reached
through `#0x138`, over the ARM9 and all overlays), and nothing addresses
`battle + 0x81c0` by that sum. **INFERRED**: both are cleared with the rest
of the status and the battle as a battle sets up, and start at 0.

On the cartridge (EU, `mon_btldata.nat`): rule 3 — 9 monsters (two slimes,
cruelcumber, Greygnarl in mode 0; Mortamor, Rhapthorne, Corvus,
Tyrannosaurus Wrecks, Nokturnus in mode 1); rule 5 — 22; rule 6 — 3
(hammerhood, slugger, scarewolf); rule 7 — none.

**Built**: `chooseFoe` in `packages/sim/src/battle/battle.ts`,
`Fighter.wayRule`, `FighterState.wayCount`, `BattleState.groupWayCount`;
held by `packages/sim/test/battle.test.ts`, "a foe".
