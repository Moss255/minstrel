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

**Correction to the rule-7 note above**: the group's record is at
`battle + 0x81b0 + 0x18 g` (its member count `+0x0e` low four bits, its
members `+0x06…` as fighter − `0xc0`, the group count in bits 4–5 of
`battle + 0x81b1` — `func_ov024_021f8628`, `0x021f864c`–`0x021f871c`), so
rule 7's count is the record's byte `+0x10`.

## 2. The party's tactics — the frame, read; the scoring, not

**Where it is reached.** Two places, both overlay 0, both with a fresh AI
object on the stack (`func_ov024_021f73b8` clears it):

- **The command phase** (`ProcessCombatTurn`, `0x0215db18`–`0x0215dbb8`):
  for each of the party's four slots whose command record
  (`func_02053dc0`) holds an action, `func_ov024_021f9030`. Afterwards, an
  action of `0x92` (Whipping Boy) marks the member it covers (`+0x138`
  `+0x2c`/`+0x2a`).
- **The member's turn** (`func_ov000_0215767c`, `0x02157888`–`0x021578a0`):
  unless the action is `0x1f6`, `func_ov024_021f8f20`.

Both look first at the tactic, the signed byte at the character record's
`+0x94c` (`0x021f9068`, `0x021f8f60`): 0 Show No Mercy, 1 Fight Wisely,
2 Mix It Up, 3 Focus On Healing, 4 Don't Use MP, 5 Follow Orders. **Both act
only when the action handed in is 1, the Attack** (`0x021f909c`,
`0x021f8f50`) — the action a member not asked in the menu keeps.

**The command phase's part** (`021f9030`, tactics 0–4, a member who can
act — `func_ov000_02155f9c`): no choosing in general, only ten actions that
must be decided before anyone acts, the list at `0x021fefc2`: `0x201`
Knight Watch, `0x45` Mercurial Thrust, `0x86`, `0x60` Counter Wait, `0x8a`
Back Atcha, `0x87` Defending Champion, `0x92` Whipping Boy, `0xb6`
Forbearance, `0xb9` Selflessness, `0x1dc` Pincushion. Each the member holds
and can pay for (`func_ov024_021f8874`; under Don't Use MP only those that
cost nothing) is noted; then, in order:

1. Knight Watch, when nobody in the party has status `+0x18` bit 11, nobody
   else has chosen it, the tactic is not Show No Mercy, (for Fight Wisely
   and Don't Use MP) the turns needed, `+0x0c`, are over 2, and either the
   member has no free heal or the weakest member's HP fraction is below the
   tactic's threshold `+0x124` (`0x021f9344`–`0x021f93cc`);
2. Mercurial Thrust, when the AI's own damage forecast for it
   (`func_ov024_021fa7ec`) on the first monster beats that monster's HP
   (`0x021f93d0`–`0x021f94a8`);
3. at a quarter of its HP or less, Defending Champion (else Defend, `3`) under
   Focus On Healing with nobody else covering (`0x021f94ac`–`0x021f951c`);
4. one of Forbearance, Selflessness, Whipping Boy for the weakest member, at
   half HP or more and with that member's maximum HP no more than half the
   actor's (`0x021f9520`–`0x021f9648`).

**The member's turn** (`021f8f20`): tactic 5 does nothing; above 5, the
Attack on the weakest monster (`021f8628`, below); 0 to 4 by the table at
`0x021ff054`: `021f8144`, `021f81dc`, `021f84f0`, `021f83f8`, `021f8300`.
Each sets a threshold `+0x124`, scores every action the member could take
(`func_ov024_021f9660`), then takes the best of lists in an order, and the
Attack on the weakest monster when every list is empty:

| tactic | `+0x124` | lists, in order |
|---|---|---|
| 0 Show No Mercy (`021f8144`) | 0.08 | 6, 2 |
| 1 Fight Wisely (`021f81dc`) | 0.4 | 6, 5, (`+0x0c` ≥ 4: 8), then `+0x0c` ≥ 4: 0, 2 — else 3 |
| 2 Mix It Up (`021f84f0`) | 0.25 | 6, 5, (≥ 4: 8), then ≥ 2: 0, 2 — else 1, 3 |
| 3 Focus On Healing (`021f83f8`) | 0.6 | 6, 5, (≥ 2: 8, 1), 3 |
| 4 Don't Use MP (`021f8300`) | 0.4 | 6, 5, (≥ 4: 8), 0, 3 |

A list is four entries of 12 bytes at `ai + 0x3a8 + 0x30 n`, kept best
first by score (`func_ov024_021f6830`: an entry not above the fourth's
score is dropped; one above is put in place and the rest moved down); an
entry is the action (`+0`), an item's bag place or −1 (`+2`), the score
(`+4`, a float; −1 when empty), the target group (`+0x0a`) and target
(`+0x0b`), 0xff for none. A list is taken (`func_ov024_021f691c`) when its
first entry's score is above 0.

**The weakest monster's Attack** (`func_ov024_021f8628`): over the groups
and their members, skipping any `func_02010088` says is out, the one whose
HP fraction (`func_ov024_021db358`) is lowest, strictly, from 1.1 — action
1 at that group and member.

**The setting up** (`func_ov024_021f7478`, at every call):

- the monsters standing (`+0x7c…`, count `+0x9c`), each with a size
  (`+0xc4`), its HP — under Show No Mercy instead `0.9 × max HP + 0.1 × HP`
  truncated (`0x021f75a0`–`0x021f75fc`; the 0.9 made as `0x7e000000 −
  0x3e99999a`); under the others, at a third of its HP or less, the larger
  of its HP and `0.3 × max HP + 0.1 × HP` (`0x021f7604`–`0x021f766c`);
- the party: each HP fraction (`+0x114`), the weakest (`+0x128`), the
  first fallen (`+0x12c`), how many are at 0.08 or less (`+0x130`) and at a
  quarter or less (`+0x134`; two or more sets `+0x139`), and the highest
  attack among them (status `+0x08`);
- for each monster the member's own blow on it, `max(1, (attack − its
  defence ÷ 2) ÷ 2)` from status `+0x08` and `+0x0a` (`+0xe4…`,
  `0x021f7840`–`0x021f789c`), the same with the party's highest attack, and
  `+0x0c`, **the turns the party needs**: the sum over the monsters of
  `⌈size ÷ (0.9375 × (both blows' mean) + 0.5)⌉ + 1`
  (`0x021f78d4`–`0x021f79d8`) — the classic `(attack − defence ÷ 2) ÷ 2`,
  which is what settles that status `+0x08` is the attack and `+0x0a` the
  defence (INFERRED from the formula's shape; the handlers below agree);
- the candidates (`+0x178`, count `+0x174`, at most 128): the Attack;
  the coup de grâce when ready (`+0x3b` bit 3, `func_ov000_02159cb4`); the
  member's spells and abilities that may be used in battle; the items in
  the bag whose action may be used in battle;
- **and, on the member's turn only** (not when `+7` is set, as the command
  phase sets it), draws from the battle's own generator: one
  `NextRandomFloat01`, then for each of 21 behaviours a `NextRandomMax(100)`
  against the tactic's chance and a `NextRandomBetween(lo, hi)` (§2b: the second byte is a gate on the turns needed, not an MP need), then a
  `NextRandomFloatBetween(0, 0.9)` (`0x021f801c`–`0x021f8104`). The four
  tables of 21 × (chance, gate, lo, hi): Show No Mercy `0x021ff084`,
  Fight Wisely and Don't Use MP `0x021ff0d8`, Mix It Up `0x021ff12c`, Focus
  On Healing `0x021ff180`.

**Scoring an action** (`021f9660`): each candidate's record
(`func_02079e2c`), passed over when `+0x08` bit 28 is set or `+0x2c` bits
14–19 are not 0, or it cannot be paid for (`021f8874`: usable in battle,
the MP — `func_ov024_021f87dc` — within the member's, and not silenced for a
spell or an ability), or under Don't Use MP costs anything; then the
evaluator its kind (`+0x18` bits 5–11) names in the table at `0x021ffeac` —
79 pointers, 22 of them null and 21 empty functions. Kind 1, a harm, is
`func_ov024_021fb490`: the amount's mean and least (`func_ov024_021f8938`,
from the range record and the user's might or mending), a forecast for each
monster (`021fa7ec` — tension, Critical Claim, the families' killer
weapons, the elements, …), then a score per target set
(`func_ov024_021f9874`) into the lists.

### 2b. The scoring — read 6 October 2026 (task 17b)

Read whole from overlay 24: the scorer, the forecast, the 79 evaluators and
their helpers. Every float operation is the runtime's single-precision
`_fadd`/`_fsub`/`_fmul`/`_fdiv`, except where a double is named; the
runtime's double helpers are `func_0200b0f0` (**`_dmul`**: the two
exponents added, `umull` of the mantissas) and `func_0200b608`
(**`_dsub`**: a mixed-sign pair sent to the adder), `func_0200c578` is
`_f2d`, and ARM9 `func_02008f5c` is fdlibm's **`ceil`** (a magnitude under
one goes to `0x3ff00000`, 1.0, when positive). All three are exact in a
JavaScript double, so a port can hold them bit for bit.

**The 21 behaviours** (`021f7478`, `0x021f8058`–`0x021f80f0`). Per
behaviour *i* the tactic's table holds four bytes (*chance*, *gate*, *lo*,
*hi*). The flag `ai+0x10+i` is set on `NextRandomMax(100) < chance`, and
cleared again when the party's turns needed (`ai+0x0c`) are fewer than
`gate × ai+0x78 ÷ 10` (`_s32_div_f`); `ai+0x78` is
`func_ov000_0215e9fc(battle, buf, 4, 1)`, not read. **This corrects §2**,
which took the second byte for an MP need. Then `ai+0x54+i =
NextRandomBetween(lo, hi)` for every *i*, and `ai+0x30 =
NextRandomFloatBetween(0, 0.9)`; the first `NextRandomFloat01` is drawn and
thrown away. An evaluator asks a behaviour with `func_ov024_021fe698(ai,
i)` — false when the flag is clear, else it records *i* at `ai+0x38`; the
scorer weighs the evaluator's state entries by `0.01 × ai+0x54[ai+0x38]`.
Read from the evaluators, what each governs:

| behaviour | asked by |
|---|---|
| 0 | always set (100, 0, 100, 100 in every table) |
| 1 | a foe's state: sleep (kind 8), kinds 10, 16, 19, 21, Whack's kind 17 via 4, kind 49 |
| 2 | an ally's levels raised (kinds 3–5), kinds 15 and 46 |
| 3 | a foe's levels lowered (kinds 3–5) |
| 4 | Whack and its like (kind 17); and, in the scorer, the second pass over sure kills (`ai+0x14`) |
| 5, 6, 7 | an ally's attack, defence, agility (kinds 3, 4, 5) |
| 10, 11, 12 | an ally's protections: kind 22; kinds 23, 32, 61, 62; kind 39 |
| 13, 14, 15 | a foe's attack, defence, agility (kinds 3, 4, 5) |
| 16 | a foe's kind 22 |
| 18 | the coups de grâce (kinds 10's two, 26, 68–74) |
| 8, 9, 17, 19, 20 | not asked by any evaluator read |

Show No Mercy's table sets only 0 and 4; Focus On Healing's never sets 2,
4, 5, 8, 14 or 20.

**An evaluator's entries.** Each evaluator fills a target set — up to 16
entries of 12 bytes, count at `+0xc0`, a float bonus at `+0xc4`
(`func_ov024_021f6a1c`) — and hands it to the scorer `021f9874` with a
group and a target. An entry: `+0` a float, `+4` an effect number, `+5`
whether it lands on a monster, `+6` the target's index, `+7` a chance in
100, `+8` a category, `+9` bits 0–5 the hits, bit 6 "a several-hit
action", bit 7 "weigh by the slot `ai+0x3c` instead".

**The scorer** (`func_ov024_021f9874`, `0x021f9874`–`0x021fa718`), in its
order:

1. category 0 on a monster: `dealt[t] += value × hits`, × 1.2 when the
   target is the combo chain's (`ai+0x34`); `dealt ≥` its HP marks it
   killed. Bit 6 notes "several hits".
2. with behaviour 4's flag: category 2 on a monster is a chance of a
   kill — `p = 0.01 × chance`; unless Show No Mercy, `p = (float)((double)p
   − 0.005 × cost)`; then `dealt[t] += (HP − dealt) × min(p², 0.9)` for
   each monster not already killed.
3. categories 3 and 4 on the party: HP and (INFERRED) MP given, summed as
   whole numbers per member.
4. the cost: `float(MP)`, + 30 for an item.
5. **harm** = Σ over monsters `100 × min(dealt, HP) ÷ max HP`; 0 for an
   item unless Show No Mercy.
6. **heal** = Σ over the party `100 × given ÷ max HP`, doubled for the
   weakest (`ai+0x128`). Action `0x310` multiplies it by 0.66 when two or
   more are at 0.08 or less, else 0.55, and zeroes it unless two or more
   are at a quarter or less (`ai+0x139`); action `0x21`, by 0.9. Action
   `0x28` sets it to 400.
7. category 5: Σ chance. Categories 5–8 (state changes) each set a weight
   in one of four slots from the tables below, zeroed when the behaviour
   asked is clear and −1.5 × weight when the entry's value is negative,
   then add `weight × chance × 0.01 × w` to their slot, where
   `w = 0.01 × ai+0x54[behaviour]`: category 8 (slot A) by
   `0x021ffc98` (6 × effect, weight; 10 otherwise), category 7 by
   `0x021ffca4` (11 × effect, slot, weight; effect `0xd` instead
   `ai+0x16c × 13 ÷ 100`, effect `0x11` on the party × `ai+0x44[t]`),
   category 6 adds the value to slot D, category 5 on a monster not
   killed by `0x021ffcc5` (13 × effect, slot, weight; effect `0x12`
   instead `min(100 × (status+0x36 ÷ 4) ÷ max HP, 29)`).
8. the lists, each entry's score less the cost × a factor: **list 2**
   harm (+ slot D when `ai+0x2c`; × `ai+0x30` when "several hits") −
   0.01 × cost, and **list 3** too when it costs nothing; **list 5**
   category 5's sum − 0.1 × cost; **list 6** heal − 0.1 × cost, when
   someone is under the threshold (`ai+0x655`); **list 8** slot A −
   0.1 × cost + 0.01 × heal; Mix It Up multiplies harm by 0.3 here unless
   the action is Critical Claim (`0x1f9`); **lists 9, 10, 11** slots B,
   C, D − cost × 0.1 (0.01 under Show No Mercy); **list 0** the bonus +
   B + C + D + harm − cost × that factor; **list 1** the same entry when
   harm is not above 0 or it costs nothing. One of the party with an
   MP-taking weapon (character record `+0x2ac` > 0, `+0x29c` bits 4–8 =
   3), Attacking a monster that has MP, adds 50, 30 and 10 to the bonus at
   a tenth, three tenths and half their MP or less.

The tables (overlay 24, USA): `0x021ffc98` `(2,20) (3,22) (4,20) (5,19)
(6,20) (7,21)`; `0x021ffca4` `(17,1,20) (18,2,15) (19,2,8) (20,1,7)
(21,2,7) (22,2,16) (23,2,16) (14,2,14) (15,2,14) (16,2,10) (11,2,17)`;
`0x021ffcc5` `(2,1,20) (3,3,40) (4,3,25) (5,3,21) (6,3,22) (7,3,30)
(8,3,10) (17,3,14) (18,1,0) (19,2,8) (20,3,7) (21,3,7) (22,1,12)`.

**The forecast** (`func_ov024_021fa7ec`): a blow's mean and least on one
monster. It starts from the amount (`021f8938`; for the Attack, the
member's own blow `ai+0xe4[t]` and 0.9375 of it) and multiplies, in order:
tension (`func_02074738`, plus `CalculateTensionBonus` unless the target's
`+0x144` bit 12); the action `ai+0x170`-weighted mean; action `0x1f9`
(Critical Claim) from the member's level-like `+0x134 +0x34` and 1.2/0.95
caps; the twelve families' killer bonuses of what the member wears
(`func_ov000_02156068(battle, target, n)` then `func_02085968`,
`02085818`, … on `member+0x150`), or the vocation's table `ai+0x654`
(`func_ov000_02156b38`); the target's susceptibility bytes `+0x3e`–`+0x44`
by the action's element for an element-8 action; 0.75 for a target with
status `+0x18` bit 1 or 2 against elements 1 or 2; the target's defence
and agility levels (`func_020748d0`, `020748a8`); its `+0x21`
(`func_02074938`); 0.5 when `func_ov024_021dd260` and kind 1; the combo
chain (`0x021fefa0`: 1.0, 1.2, 1.5, 2.0 by its length + 1, at most 3);
action `0x79` by the monsters' count (`1 + 0.125 n`); a metal body
(1, or 1 + 1 with one equipment flag, unless the action works on metal —
`+0x10` bit 24) and the record's cap (`+0x1c` bits 0–13). Its result is
`mean × ai+0x170 + least × (1 − ai+0x170)`, `ai+0x170` 0.4 and 0 under Show
No Mercy.

**The evaluators** by kind (`0x021ffeac`): 1 harm (`021fb490`: the
forecast on each monster, the hits by `0x021ff002` and the hit code, a
reach 5 by the weapon, then the scorer per group or for all); 2 and 14
heal (`021fb91c`: on each standing member — the actor alone for reach 1 —
the amount's mean capped to what is missing, with 999 for action `0x1fa`
and a check at 0.4 of the actor's HP for kind 14's own; `ai+0x655` set when
the member's HP fraction is under the threshold); 3, 4, 5 levels — on a
foe behaviour 3 and 13/14/15 then `021fdf04(0x11/0x12/0x13)`, on an ally 2
and 5/6/7 then `021fd954`; 7 `fd954(2)`; 8 `fdf04(4)`; 9 `fd954(4)` with
three or more turns needed; 10 the two coups `0x1fc`, `0x20f` (bonus 1000)
else `fdf04(8)`; 16, 17, 19, 21 `fdf04(6, 9, 5, 7)`; 18 the fallen (50, or
100 for action `0x27`, at half their most HP); 20 `fd954(3)`; 22, 23, 32,
39, 61, 62 an ally's protections by the monsters' own flags (`ai+0x6b`
…`0x71`); 24 `fdf04(3)`; 26 Psyche Up's coup `0x202` by the actor's HP;
27 `fd954(7)`; 33 the fallen when two or more are down; 46 by
`ai+0x13c`/`ai+0x154`; 49 a sum over the monsters of their good states
and levels (tables `0x021ff026`, 22 × (flag, weight), and `0x021fefd6`, ten levels × weight; a level above 0 counts its weight, one below three times it); 67 heal with the threshold
0.6 (0.65 Focus On Healing, + 0.2 with few turns or low HP); 68–74 the
coups, bonus 1000 under their own condition. Kinds 6, 13, 25, 28, 36–38,
40–43, 47, 48, 50, 51, 53–56, 63, 64, 73, 75–78 are empty; 0, 11, 12,
29–31, 34, 35, 44, 45, 52, 57–60, 65, 66 null.

`021fdf04` (a state on the monsters) weighs each by its chance
(`021f8bd8`: the record's accuracy, by might or mending between `+0x14`'s
least and most), the target's levels and `+0x21`, and its resistance
(`021f875c` → `func_ov000_02156b38`), passes over a monster whose chance
comes under 30 or under the effect's own floor (33.3; 40.3 for effects 4,
5 and 7; 55.3 for 8), and for each effect asks the target's state and its
susceptibility (the hit code's pair from `0x021fefea`/`0x021fefeb`); the riders' own evaluators (`021fd858`, the table at
`0x021ffcec`, 23 entries) read the **susceptibility bytes `+0x47`–`+0x50`**
of the target's status. `021fd954` (a state on the party) marks a member
in need at 100 and otherwise 50.

**What a build needs that the simulation does not keep**: the
susceptibility bytes (`+0x3e`–`+0x52`; task 18 left them open), the
families' killer bonuses of what is worn, the vocation table `ai+0x654`
(`0x02200154`, outside overlay 24), the monsters' own action flags
(`ai+0x69`–`0x72`, their `+0x6c`–`+0x72`), the character record's
`+0x134 +0x34` and `+0x36`, `func_ov000_0215e9fc`'s count, and the
handlers task 18 left unread for the actions a tactic would choose (§7 of
`T18-handlers.md`). Without them a port scores harm and heal faithfully
but every state change, protection and rider wrongly — and those are what
Fight Wisely and Focus On Healing choose among. **So the tactics are still
not built**; task 17b in `docs/tasks.md` lists the steps.

## 3. The targeting handlers

The dispatcher `func_ov024_021f66cc` takes the action record's `+0x0c` in
AI mode 1 and `+0x0e` in mode 2 (mode from `func_ov000_02159d94`), and a
number of `0xa1` or more as the first handler; below it, the
pointer-to-member at `0x021ff790 + 8n`. All 161 are distinct functions but
for 3 and 4 (one function), 75 and 85, 93 and 129 (one shape, a constant
apart), and six one-instruction refusals (109, 110, 111, 118, 133, 143).
**An odd-numbered handler is usually its even neighbour's mode-2 form**,
with a further test on status `+0x14` bit 9.

**What they share** (read 6 October 2026):

- `func_ov000_0215e9fc(battle, out, n, flags)` — the party standing, in the
  party's order (`func_020114ec`), skipping one gone (`func_ov000_02153c0c`),
  with flag 1 one fallen (`func_02010088`); `func_ov000_0215eb1c` the same
  for the monsters; `func_ov000_0215ec80` one group's;
- `func_ov024_021ed890` — one of a list by `NextRandomMax(n)`;
- `func_ov024_021ed8c0` — a number of weighted picks
  (`func_ov000_02154f30`) by the action's hit code (`+0x1c` bits 14–18):
  3 → `NextRandomBetween(3, 4)`, 4 → 2, 5 → 4, 7 → 7, 8 → 3, any other → 1
  (the jump table at `0x021ed8f0`);
- `func_ov024_021edf00` — a monster made to aim at one of the party
  (status `+0x2e`, when `func_ov024_021e05e4` says so) aims there alone;
- `func_ov024_021ede2c` — refuses when a third or more of the party standing
  have status `+0x14` bit 26 (`func_ov024_021edc08`); handlers 3 and 4 do
  the same with bit 9 (`func_ov024_021eda60`).

**The fighter's status** (`+0x138`), as these read it: `+0x00` HP, `+0x02`
MP, `+0x04` maximum HP, `+0x08` attack, `+0x0a` defence, `+0x0c` agility
(INFERRED from Kabuff's `< 0xffff`, Accelerate's `< 999` and the blow
formula above), `+0x58` bits 3–5 the defence's level and bits 6–8 the
agility's, signed. Bits 9 and 26 of `+0x14` are **not identified**; nothing
the simulation keeps sets them, so the refusals they drive never happen
here.

**Read and built today**:

| # | function | rule |
|---|---|---|
| 3, 4 | `021ee20c` | all of the party; refused when a third or more have status `+0x14` bit 9 (confirms what was built) |
| 5 | `021ee2fc` | Body Slam, Kamikazee, mode 1: only at a third of its HP or less; no target named — **INFERRED**: the first handler's |
| 6 | `021ee33c` | the same at half or less |
| 20 | `021ef074` | Kabuff: `NextRandomMax` among its side's groups with one standing whose defence is under `0xffff` and its level below 2; that group |
| 22 | `021ef388` | Sap: those with a defence and its level above −2, by `021ed8c0`'s picks |
| 26 | `021ef7b8` | Accelerate: `NextRandomMax` among its own whose agility is under 999 and its level below 2 |
| 32 | `021eff3c` | Deceleratle: all of the party, while one has an agility and its level above −2 |
| 61 | `021f1844` | the single abilities: one of the party by `021ed8c0`'s picks |
| 62 | `021f18a0` | all of the party |
| 114 | `021f43b0` | Poison Breath: all of the party, gated by `021ede2c`, refused when none is unpoisoned (`func_020885b4`: status `+0x14` bit 1 with `+0x22` low bits 1) |
| 157 | `021f639c` | the breaths: all of the party, gated by `021ede2c` |

**Read, not built**: 23, Sap in mode 2 — 22's rule, and not status
`+0x14` bit 9, and status byte `+0x50` above 0, which is not identified.
No monster on the cartridge takes it.

**Ours, in what is built**: where a handler makes more than one weighted
pick, the command aims at the first and the resolver makes its own passes
from there; the forced aim of `021edf00` never applies, nothing setting it.

The whole table, with who takes each, is below. **67 handlers that
monsters on the cartridge take are not read**; each takes the first
handler, as before.

| # | function | used by (EU cartridge, modes 1 and 2) | |
|---|---|---|---|
| 0 | `0x021edf6c` | mode 0, and every way whose number is 0 | read, built |
| 1 | `0x021edfa0` | Attack | read, built |
| 2 | `0x021ee0f0` | Whack, Zam, Zammle, Crack, Frizzle, Kafrizz and 1 more | read, built |
| 3 | `0x021ee20c` | Swoosh, Thwack, Woosh, Kaswoosh | read, built |
| 4 | `0x021ee20c` | Bang, Kacrack, Kaboom | read, built |
| 5 | `0x021ee2fc` | Body Slam, Kamikazee | read, built 6 Oct |
| 6 | `0x021ee33c` | Body Slam | read, built 6 Oct |
| 7 | `0x021ee378` | Zam, Crack, Frizz, Zammle, Frizzle, Whack and 4 more | read, built |
| 8 | `0x021ee3e8` | Swoosh, Crackle, Woosh, Kaswoosh, Thwack | read, built |
| 9 | `0x021ee454` | — | not read |
| 10 | `0x021ee574` | — | not read |
| 11 | `0x021ee6a8` | Heal, Midheal, Moreheal, Fullheal | read, built |
| 12 | `0x021ee7a4` | Multiheal, Omniheal | read, built |
| 13 | `0x021ee8b4` | — | not read |
| 14 | `0x021ee9b4` | — | not read |
| 15 | `0x021eeab8` | — | not read |
| 16 | `0x021eebbc` | Zing, Yggdrasil leaf, Kazing | not read |
| 17 | `0x021eecc8` | Kerplunk Dance, Kerplunk | not read |
| 18 | `0x021eee68` | Buff | read, built |
| 19 | `0x021eef68` | Buff | read, built |
| 20 | `0x021ef074` | Kabuff | read, built 6 Oct |
| 21 | `0x021ef1f8` | Kabuff | not read |
| 22 | `0x021ef388` | Sap | read, built 6 Oct |
| 23 | `0x021ef4ac` | — | read; not built |
| 24 | `0x021ef5ec` | Kasap | read, built |
| 25 | `0x021ef6c4` | Kasap | read, built |
| 26 | `0x021ef7b8` | Accelerate | read, built 6 Oct |
| 27 | `0x021ef8b8` | — | not read |
| 28 | `0x021ef9c4` | Acceleratle | not read |
| 29 | `0x021efb48` | — | not read |
| 30 | `0x021efcd8` | #324 | not read |
| 31 | `0x021efdfc` | — | not read |
| 32 | `0x021eff3c` | Deceleratle, Snot Shot | read, built 6 Oct |
| 33 | `0x021f0014` | Deceleratle | not read |
| 34 | `0x021f0108` | Oomph | not read |
| 35 | `0x021f0208` | Oomph | not read |
| 36 | `0x021f0314` | Blunt | not read |
| 37 | `0x021f0438` | Blunt | not read |
| 38 | `0x021f0578` | — | not read |
| 39 | `0x021f063c` | — | not read |
| 40 | `0x021f0720` | Fuddle Dance, Kafuddle | not read |
| 41 | `0x021f0734` | — | not read |
| 42 | `0x021f0748` | Snooze | read, built |
| 43 | `0x021f0810` | Snooze | read, built |
| 44 | `0x021f08f8` | Kasnooze | read, built |
| 45 | `0x021f090c` | Kasnooze | read, built |
| 46 | `0x021f0920` | Bounce | not read |
| 47 | `0x021f094c` | Bounce | not read |
| 48 | `0x021f0a20` | — | not read |
| 49 | `0x021f0b84` | Magic Barrier | not read |
| 50 | `0x021f0d28` | Magic Barrier | not read |
| 51 | `0x021f0e90` | — | not read |
| 52 | `0x021f101c` | Fizzle | not read |
| 53 | `0x021f10e0` | — | not read |
| 54 | `0x021f1198` | Dazzle, #323, Dazzleflash, Flashbang Wallop | not read |
| 55 | `0x021f125c` | — | not read |
| 56 | `0x021f1330` | — | not read |
| 57 | `0x021f145c` | — | not read |
| 58 | `0x021f1578` | — | not read |
| 59 | `0x021f166c` | — | not read |
| 60 | `0x021f1768` | Divine Intervention | not read |
| 61 | `0x021f1844` | #273, #231, #244, Paralaser, Blockenspiel, #281 and 38 more | read, built 6 Oct |
| 62 | `0x021f18a0` | Wind Sickles, Stone’s Throw, #332, Party Pooper, Gigagash | read, built 6 Oct |
| 63 | `0x021f18fc` | — | not read |
| 64 | `0x021f1a0c` | Victimiser | not read |
| 65 | `0x021f1b40` | — | not read |
| 66 | `0x021f1c64` | medicinal herb, Caduceus | not read |
| 67 | `0x021f1d4c` | — | not read |
| 68 | `0x021f1e58` | — | not read |
| 69 | `0x021f1f64` | — | not read |
| 70 | `0x021f2064` | — | not read |
| 71 | `0x021f20b8` | Hustle Dance | not read |
| 72 | `0x021f21b4` | Helm Splitter | not read |
| 73 | `0x021f22d8` | — | not read |
| 74 | `0x021f23e0` | — | not read |
| 75 | `0x021f24fc` | — | not read |
| 76 | `0x021f2548` | Mist Me | not read |
| 77 | `0x021f259c` | Heart Breaker, #238, Sultry Dance, #331, #333, #250 and 1 more | not read |
| 78 | `0x021f26a8` | Back Atcha, #329 | not read |
| 79 | `0x021f26fc` | — | not read |
| 80 | `0x021f2754` | Whipping Boy | not read |
| 81 | `0x021f286c` | — | not read |
| 82 | `0x021f2998` | — | not read |
| 83 | `0x021f2ab4` | Morale Masher | not read |
| 84 | `0x021f2c30` | Attack Attacker | not read |
| 85 | `0x021f2d4c` | — | not read |
| 86 | `0x021f2d98` | — | not read |
| 87 | `0x021f2e88` | — | not read |
| 88 | `0x021f2f78` | — | not read |
| 89 | `0x021f304c` | Spooky Aura | not read |
| 90 | `0x021f3168` | Wizard Ward | not read |
| 91 | `0x021f3248` | — | not read |
| 92 | `0x021f32b4` | — | not read |
| 93 | `0x021f331c` | Channel Anger | not read |
| 94 | `0x021f3368` | — | not read |
| 95 | `0x021f3440` | Weakening Wave | not read |
| 96 | `0x021f3524` | Psyche Up | read, built |
| 97 | `0x021f3564` | — | not read |
| 98 | `0x021f3688` | Meditation | not read |
| 99 | `0x021f36cc` | Egg On, #330 | not read |
| 100 | `0x021f37fc` | — | not read |
| 101 | `0x021f38f0` | Forbearance | not read |
| 102 | `0x021f3a04` | — | not read |
| 103 | `0x021f3b20` | — | not read |
| 104 | `0x021f3c3c` | M-Pathy | not read |
| 105 | `0x021f3d78` | Selflessness | not read |
| 106 | `0x021f3e64` | Disruptive Wave | not read |
| 107 | `0x021f40c8` | — | not read |
| 108 | `0x021f4120` | — | not read |
| 109 | `0x021f4174` | — | not read |
| 110 | `0x021f417c` | — | not read |
| 111 | `0x021f4184` | — | not read |
| 112 | `0x021f418c` | Flee | read, built |
| 113 | `0x021f4294` | — | read, built |
| 114 | `0x021f43b0` | Poison Breath | read, built 6 Oct |
| 115 | `0x021f44ac` | — | not read |
| 116 | `0x021f45c8` | #242, #344, #345, #347, #470, #349 | not read |
| 117 | `0x021f4768` | Weird Dance | not read |
| 118 | `0x021f4878` | — | not read |
| 119 | `0x021f4880` | — | not read |
| 120 | `0x021f4974` | — | not read |
| 121 | `0x021f4a54` | Venom Mist | not read |
| 122 | `0x021f4b60` | — | not read |
| 123 | `0x021f4c8c` | Burning Breath | not read |
| 124 | `0x021f4d6c` | — | not read |
| 125 | `0x021f4e84` | #287, #288 | not read |
| 126 | `0x021f4ed4` | Dazzleflash | not read |
| 127 | `0x021f4fd8` | — | not read |
| 128 | `0x021f50cc` | — | not read |
| 129 | `0x021f51d4` | #326 | not read |
| 130 | `0x021f5220` | #327 | not read |
| 131 | `0x021f5300` | #337 | not read |
| 132 | `0x021f5344` | #339 | not read |
| 133 | `0x021f5420` | — | not read |
| 134 | `0x021f5428` | — | not read |
| 135 | `0x021f5478` | — | not read |
| 136 | `0x021f5558` | — | not read |
| 137 | `0x021f559c` | Drain Magic | not read |
| 138 | `0x021f567c` | Drain Magic | not read |
| 139 | `0x021f5768` | Feel the Burn | not read |
| 140 | `0x021f57a8` | #232 | not read |
| 141 | `0x021f5888` | #281 | not read |
| 142 | `0x021f58dc` | #474 | not read |
| 143 | `0x021f59bc` | — | not read |
| 144 | `0x021f59c4` | — | not read |
| 145 | `0x021f5a08` | Air Pollution | not read |
| 146 | `0x021f5ae0` | Wave of Panic | not read |
| 147 | `0x021f5bb8` | Eerie Light | not read |
| 148 | `0x021f5c80` | — | not read |
| 149 | `0x021f5ce4` | #567 | not read |
| 150 | `0x021f5db0` | #794 | not read |
| 151 | `0x021f5e8c` | Fuddle | not read |
| 152 | `0x021f5f6c` | Fuddle | not read |
| 153 | `0x021f606c` | Lullab-Eye | not read |
| 154 | `0x021f6150` | Antimagic | not read |
| 155 | `0x021f6230` | Double Up | not read |
| 156 | `0x021f6298` | Gritty Ditty | not read |
| 157 | `0x021f639c` | #268, Cool Breath, Fire Breath, #227, Inferno, #269 and 6 more | read, built 6 Oct |
| 158 | `0x021f6424` | Sweet Breath | read, built |
| 159 | `0x021f6500` | #929 | not read |
| 160 | `0x021f65fc` | #472 | not read |
