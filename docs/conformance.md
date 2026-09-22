# Conformance — the simulation against the game's own code

Begun 19 September 2026, as Phase 0 of `docs/beyond-the-slice.md`. This is the
ledger: each piece of battle arithmetic, what the game's own code says it is,
and how the simulation's stands against it.

**The source is the decompilation** at `~/Projects/dqix-decomp` — its `src/`
where a function is decompiled, its symbols and cross-references where it is
not. That replaces the fan reference emulator as the authority: the reference
reproduces the game, and the decomp *is* the game. Addresses are the USA
build's; the EU cartridge this repository reads sits 0x10 above it in parts of
the ARM9 (`docs/binaries.md`).

**How it is held.** `packages/sim/test/game-oracle.ts` is the game's arithmetic
translated in the 32-bit floats it computes in. `conformance.test.ts` holds the
simulation to it — **exactly**, for everything the simulation has read from the
game: every draw, every blow, every deftness. Where the simulation once parted
from the game, the old form is kept in the tests as a measurement, so that why
a float is in the simulation stays written down beside the proof it matches.

---

## The ledger

| what | the game's | ours | standing |
|---|---|---|---|
| **The generator** | `SeedRandom`, `NextRandom` — `src/Util/Random.cpp`. A 64-bit LCG, `0x5D588B656C078965` and `0x269EC3`, the draw its top 32 bits | `BattleRng` | **the same sequence, one step apart.** The game steps and then draws; ours draws the seed's own top and then steps, as the reference does. `BattleRng.fromGameState` seeds ours from a state read out of the game |
| **A whole number below a maximum** | `NextRandomMax` — `maximum × (float)(next / (double) 0xFFFFFFFF)`, truncated, held below the maximum | `below`, in the game's floats | **the game's, exactly** — every draw, at every maximum from a coin to 10,000. It was `(top × max) >> 32`, which parted about once in 4,000 at 10,000; closed 20 September, see below |
| **Physical damage** | `CalculatePhysicalDamage` — `src/Combat/Main/BasicAttackCalculation.cpp` | `physicalDamage` | **the game's, exactly**, in every one of 200,000 cases, and always the same number of draws. It was the reference's 32.32 form, which agreed to a case in a million. A quarter of `2·attack − defence`, spread a sixteenth either way and then by up to one; or anything up to a sixteenth of the attack when that is more |
| **Truncated, not rounded** | `GetAttackBaseDamage` (overlay 24) returns the float as an `int` | truncates | **settled.** `RoundUp` — `0.5f + x` — sits beside it and is called sixteen bytes before, which invites the other reading; it is applied to a *stat after its multiplier*, not to the damage. Rounded, a third of all blows would land a point differently |
| **The critical chance** | `CalculateCritRate` — `src/Combat/Main/CritRateCalculation.cpp` | `criticalChance` | **settled, and it was an open question.** Two in a hundred, plus a hundredth of a point for each point of deftness **past 150**; an accessory's and a book's bonus added, a skill's multiplying, a move of several hits sharing it out. The reference's 200 in 10,000 is this at any deftness to 150; its 500s are a bonus, not a level |
| **How the chance meets a draw** | `func_ov000_02156cc4`, the one caller: `NextRandomMax(10000) < (int)(100.0f × rate)` — the multiply a float's, the `int` a truncation | `below(10_000) < critical` | **the game's, exactly, at every deftness.** Past 150 that is one *under* `200 + (deftness − 150)` at 151 of the 850 values, because `0.01f` is not a hundredth and the game truncates: deftness 159 gives 208. Closed 20 September, see below |
| **A monster's critical** | `func_020748f8` — `(1 / hits) × (0.0 × skill)` | never | **settled: a literal zero.** A monster never criticals through this roll whatever its skill field says. `still-open.md` had this as the reference's; it is the game's |
| **The rate doubling** | `× 2.0f` when the character has trait `0x11d` and `func_ov000_02155a04` of them is under `0.25f` | not modelled | read, not understood: what the trait is and what the quarter is a quarter *of* are not established |
| **A coin instead of the roll** | actions `0x48` and `0x70` take `NextRandomMax(2) == 0` in place of the critical roll, in `func_ov024_021eb5d0` | not modelled | read. INFERRED: the all-or-nothing blows, which land a critical half the time |
| **A blow that comes to nothing** | the end of `func_ov024_021e6a90`, `0x021e7824`: damage not above nothing, not dodged, not blocked → `NextRandomMax(2)` | `below(2)` | **the game's, and it changed ours.** The code never asks whose blow it is: **the party's feeble blows deal 0 or 1 as a monster's do.** The reference had it for monsters only. Closed 20 September |
| **Defending** | not found. The halving at `0x021e7a80` belongs to **maximum tension**, not to a defence — see below | the reference's halving | **ours.** The bit `0x1000000` is tension at level 4, set by the psyche-up ladder and by nothing else in the ROM; the Defend command's own handler is not located. What the simulation halves is the reference's rule |
| **The whole number, and the cap** | `_ffix` at `0x021e7b28`, then the lower of it and the action's `+0x1C` low 14 bits | `dealt`, with the spell's `cap` | **the game's**: truncated, then held to the action's cap where it has one — Frizz 999, Frizzle 1999, Kafrizz 2999, and the plain Attack none. The loader carries each record's cap; `battle.ts` hands it to `dealt` |
| **A shield's chance of blocking** | `func_ov000_02156118` → `func_02084ee8`: every worn piece's ten bits over `10.0f`, summed; nothing without a shield; not truncated | `blockChance`, from the item table | **the game's, exactly**, at every value the field can hold. It was once in a hundred for any shield, the reference's — which is what the game's comes to for the bronze and the iron. Closed 20 September |
| **Each target's die** | `NextRandomMax(100)` at the top of each target's pass, kept at `[battle + 0x8e6e]` | `below(100)`, spent | **the game's.** Missed in the first reading of the resolver; read by the dodge for a target in a state not established, and otherwise by nothing |
| **An action's amount** | `GetAttackBaseDamage` with a range: a monster's base, or one of the party's least-to-most by might or mending, give or take the spread; drawn twice where it names no number | `drawnAmount`, `partyAmount` | **the game's, exactly** — three forms, every number from 0 to 1,023. It was the reference's one form in 32.32. The herb now costs two draws |
| **A spell going haywire** | the blow's own roll at the spell's `criticalPercent` — 50, so one in a hundred; once a cast for a group or all; **a monster's rate a literal nothing** | `criticalChance(deftness, percent)` | **the game's**, at every deftness for a blow, a spell and an item alike. It was flat: the Hero's own critical chance and every cast's were the reference's 200 and 100, because the engine never handed the sim a deftness. It does now, and the action's own multiplier with it — a herb's nothing, so it can never go haywire |
| **A change of state landing** | it *is* the accuracy roll: a monster's chance the record's `+0x14` bits 0–6, the party's by might; × the target's resistance + ½; a cast gone haywire lands outright. The kind's handler makes no draw | the accuracy's draw under the chance | **the order and the roll are the game's**, and the chances now come from the record — the reference's 75, 75 and 25 are in the data. **Ours still**: every resistance whole |
| **What rides on a blow** | one draw, only after a blow that dealt something, under the action's chance × a hundredth of the target's byte | `poison` on an attack | the game's for the poison attack, whose 12 is in its record; the other riders read and not modelled |
| **Resistances** | `func_ov000_02156b38`: a byte an element, over `100.0f`; a monster's the 22 at `+0x6C` of its record. Damage × it after the critical; a change's accuracy × it + ½; a rider's chance × it | `resistanceTo`, `dealt`; a fighter's `resist` | **the game's, exactly**, at every byte. Frizz on a slime is a quarter more. **Ours still**: the party's whole, the wards and the two statuses that shift them |
| **A monster's HP** | drawn as the battle builds it: `(int)(0.5 + HP × between(0.8, 1.0))`, from the *world's* generator; the table's where the battle's setup says so | `monsterHp` | **the game's, exactly.** The table's HP is a ceiling. **Ours**: taking a battle that cannot be fled for the game's flag |
| **A monster's drops** | `func_ov023_021f454c`, from the victory routine once the experience and gold are settled: a kind of monster at a time, the rare drop rolled first and the ordinary only after it fails, each `func_02032370(one in so many) == 0` against the table at `0x021fd888` — and the generator is **the C library's `rand`**, neither the battle's nor the world's | `dropsWon`, `DropRng` | **the game's**, step for step and table for table; **ours**: the seed of that generator, which the game's is not known to be, and the order the kinds are rolled in. A drop spends **no draw of the battle's**, so a battle replays the same whether it drops or not |
| **The generators** | two: the battle's own, seeded from the clock as it is made; and the world's, `GetBTRandom()` | `BattleRng`, one a battle; the field's | **settled.** A battle's rolls replay from its own seed alone |
| **The surprise round** | `ProcessCombatTurn`: `[battle + 0xe49]` is how the fight opened. At 1 the monsters sit out; at 2 the party does, the first monster always acts, and each after it acts on `NextRandomMax(100) < 67` | not modelled | read into the oracle |
| **How a monster chooses its way** | `func_0208a91c` reads bits 5–7 of the record's `+0x10` and dispatches to one of eight handlers; four draw by a weight table — `func_0208a370`, `NextRandomMax(256) + 1` walked down `monsterActionWeights` at `0x020e8caa` | `chosenWay`, the table by `aiType` | **the game's draw, and now the game's table.** It was the boss bit that chose, which this repository had INFERRED and which is not it: Hexagoon is way 0, where the bit had it drawing by the falling table. **Ours**: ways 3, 5, 6 and 7 — a round robin, a pair and a coin, two passes — fall back to the even table, and a slot the monster cannot use is not scanned past |
| **Initiative** | inlined in `ProcessCombatTurn`: the **buffed** agility, capped at 999, times `NextRandomFloatBetween(0.51, 1.0)`, sorted highest first by a quicksort over floats | `initiative`, over `levelled(agility)` | **the game's**, in its floats, over the buffed agility. It was the reference's arithmetic in exact whole numbers, which orders two close scores differently where a float's rounding parts them. `0.51f` appears once in the whole build. **Ours**: how a tie breaks, the game's sort being unstable, and the 999 cap, which no stat of the slice's reaches |
| **A monster fleeing** | the action dispatcher, `func_ov024_021da670`: action `0xE1` (and `0x395`) on oneself removes the combatant, **with no draw** | a refusal, ours | **a monster that chooses to flee, flees.** If anything refuses it, that is in the choosing and not here. `still-open.md` lists "a monster attacking when its drawn Flee is refused" as ours, and it has no counterpart at this point in the game |
| **Tension** | `CalculateTensionBonus` — `tension × (1 + level / 10)`, the division a whole number's; and the **level's own multiplier**, `func_02074738` reading the table at `0x020e88f8`: `1.0 1.5 2.5 4.0 6.0` for the party, `1.0 1.3 2.0 3.0 4.5` for a monster | not modelled | read into the oracle; levels 10 to 19 all double the bonus. A fighter's tension level is `[status + 0x24]`, 0 to 4, with bits `0x800000` and `0x1000000` saying which — see below. Nothing in the slice psyches up |
| **Buffs** | the six `Calculate…BuffMultiplier`s | `levelled`, for defence and agility | **the game's for the two the slice casts** — Kasap's and Deceleratle's levels multiply as the game's do, half again up and a half then a quarter down. The other four are read into the oracle and not modelled, there being no spell in the slice that casts them. A quarter a level on attack; a half on defence, agility and the magics; defence *down* is a half and then three quarters, not a half a level; charm never falls below whole |
| **A stat after its multiplier** | `RoundUp` — `0.5f + x`, truncated | `levelled` | **the game's**, at every stat from 0 to 2,000 at each of the five levels. It truncated, the reference's way, which was a point low on every odd half: a defence of 41 at −1 is 21 to the game and was 20 to us |

---

## The decision this turned up, and how it was taken

`CLAUDE.md` said: *never let a float enter a gameplay calculation*, for the
sake of RNG reproducibility — and the game itself computes these in `float`. A
32-bit float has 24 significant bits, so it rounds where exact arithmetic does
not, and in two places that changed the answer:

- **a draw below 10,000 differed from the game's about once in four thousand**,
  by one;
- **the critical threshold was one too high at 151 of the 850 deftness values
  past 150** — about one in six.

So the rule's letter and its purpose pointed different ways. Three ways to
stand were set out: leave it, exact to within those; match the game with
`Math.fround`; or reproduce the float's rounding in whole numbers.

**Decided 20 September 2026 by the owner: match the game with `Math.fround`.**
IEEE-754 single precision is specified to the bit and the same on every
machine, so reproducibility — what the rule protects — is kept. `CLAUDE.md`
now says so, and says how narrowly: only in `packages/sim/src/battle`; every
operation's result through `Math.fround` before it is used again, in the
game's order; only `+ − × ÷`, comparison and truncation; and only for a
function translated from the game's own code and held to the oracle.

`below`, `float01`, `floatBetween`, `physicalDamage` and `criticalChance` are
so translated. `initiative`, `criticalBlow`, `criticalDamage` and
`drawnAmount` are still the reference's exact integers, **because they have not
yet been read from the game** — the exception is for what the game is known to
do, not for what it probably does.

---

## Looked for and not found

**The party's flee chance.** Not behind any of these, each of which was the
obvious place:

- **the four words beside the weight tables**, `1024, 2560, 2048, 1024` —
  `docs/binaries.md` and `still-open.md` carried them as candidates "tied to
  nothing". They are tied now, to the wrong thing: `func_0208b8c4` copies them
  to the stack and hands each to `SafeAllocator::Allocate`. **Heap sizes, in
  bytes.** Nobody need look at them again;
- **action 225**, which is a *monster's* flee and has no draw (above);
- **`ProcessCombatTurn`'s one percent roll**, which is the surprise round;
- **the bare coin flips** in `func_ov000_0215f57c` and `0215f67c`, which pick
  among a monster's action slots from an eight-entry table.

What is left is the 60-odd percent rolls in overlays 0 and 24 whose threshold
is a variable. The command the player picks is not action 225, so the anchor
to find is how the Flee command is numbered where the turn is resolved.

---

## The draws a battle makes

Catalogued from the decomp's cross-references: **183** calls to the
generator in overlays 0 and 24. 65 are a percent roll, 17 a coin, 4 a die of
four, one the critical's 10,000; 13 are a float between 0.9 and 1.1. That list
is the work: a battle replays from a seed only when every one of them is made
in the game's order, and the order is what the reference emulator got from
play and this has not yet got from code.

## The resolver of a blow — `func_ov024_021eb5d0`

Read 20 September. 2,224 instructions; this is its spine.

**The order of a blow's draws:**

0. **a die of a hundred for each one the action reaches**, thrown at the top
   of that target's pass (`0x021ebf28`) and kept at `[battle + 0x8e6e]`.
   *Missed when this was first read, and found on 20 September by looking for
   what reads it*: the evasion roll (`func_ov000_02156f98`) and its neighbour
   `func_ov000_02156558` use it **in place of a draw of their own** for a
   target in a state `func_ov000_02156404` tests — under 50 dodges, 50 to 74
   does the neighbour's thing; what state, not established. For anyone else
   nothing reads it, and it is spent all the same;
1. **the critical roll, always.** `func_ov024_021ea4d0` or `021ea500` decides
   whether it is made once for the whole action or once a target, and then it
   is made. **Once for the action, and before any target's die**, when the
   record's reach (`+0x14`, the top four bits) is 3 or 4 — all, or a group —
   and `+0x1C` bits 14–18 are nothing; or for the plain Attack from one of the
   party whose weapon strikes more than one (two bits at `+0x2F4` of what they
   wear). Otherwise once a target, after their die. Inside it a monster's rate is nothing and the draw is spent all the
   same; only an action that is always a critical skips it;
2. **the evasion roll**, if the action can be dodged — `func_ov000_02156f98`:
   a draw below 100 under the target's rate, **truncated**;
3. **the block roll**, if it can be blocked — `func_ov000_02156e30`: the draw
   **as a float** under the rate, untruncated;
4. **the accuracy roll**, `func_ov000_02156648` — below;
5. the damage, `GetAttackBaseDamage`.

**That settles the question this ledger was carrying**, and without the
contradiction it looked like. The game spends a critical draw on a monster's
blow. The reference emulator does too — the simulation's own header has said so
all along, under what is ours: *"the order the numbers are drawn in, which is
not the game's: the reference also steps past draws that do nothing here."* So
the game and the reference agree, and the simulation is knowingly different.
**A battle will not replay from a seed until the simulation makes these draws
in this order**, which is the work that follows from this reading.

**The accuracy roll** — `func_ov000_02156648`, read 20 September. Several of
the target's statuses, and an argument that says it always lands, leave before
any draw. Then **a draw below 100 is made before anything is compared**, so an
action whose accuracy stands at a hundred — the plain Attack's — lands every
time and spends its draw all the same. After it: a die of four that misses on
0, for one of the party with a certain trait on an action flagged `0x10000`;
for a scaling action (`+0x18` bits 16–17 at 1) the accuracy is set between the
record's least and most by one of the attacker's numbers, or **drawn as a float
between them** when none is named; it is then times the target's resistance
plus a half; a **die of eight misses on five faces** when the action is one a
status on the attacker spoils (`+0x10` bit 3) — INFERRED: dazzle; and the blow
lands on the first draw coming in under the accuracy, truncated.

**And the coin is named.** The resolver takes `NextRandomMax(2) == 0` in place
of the critical roll for actions `0x48` and `0x70`, read as the all-or-nothing
blows before their names were: they are **Thunder Thrust** and **Hatchet Man**.

**How the four rolls are gated**, from the stretch between them:

```
evaded = the evasion roll                 always called
if (!evaded) blocked = the block roll     skipped for a blow already dodged
lands = the accuracy roll                 ALWAYS called, dodged or not
if (lands) damage = GetAttackBaseDamage   even for a blow dodged or blocked
```

The dodge and the block ride along as flags in the result; the damage is worked
out regardless, and its draws are spent.

**The simulation makes a plain blow's draws in this order since 20 September**
— the die at step 0 since later the same day.
A monster's blow spends its critical draw; the block is rolled whether or not
there is a shield; a dodged blow still spends its accuracy and its damage.
`battle.test.ts` pins it by difference — a dodged blow spends exactly one draw
fewer than one that lands, the block's.

**What a critical does to the damage** — read 20 September, and it was the one
joint in a blow's order still the reference's. It is not in the 67 handlers:
the plain Attack is on handler 0, which is none. It is at the head of
`func_ov024_021e6a90`, the last function a blow's damage goes through:

```
if (the critical applies)                       func_ov024_021ea7fc
    damage = max(1.2 × base,  func_02074838(value, isAttack, random),  floor)
```

`func_02074838` is both of the reference's critical formulas in one: with its
flag set, **the value times a draw from 0.95 to 1.05**; with it clear, **the
value times a draw from 1.5 to 2.0**. For the plain Attack, `0xDB` and `0x1F9`
the value is the attacker's attack power and the floor the damage itself; for
anything else the value is the damage. The base damage's draws are spent first
and the critical's one after — which the simulation had INFERRED and now has
read. What the reference lacks is the *greatest of three*: with any attack
worth the name the attack power's draw wins, and with an attack of two or three
it does not. `criticalHit`, `criticalBlow` and `criticalDamage` are the game's,
in its floats, and held to the oracle in every case.

**The 67 damage handlers** — `func_ov024_021da55c` dispatches through a table
of member-function pointers at USA `0x021ff1e0` by nine bits of the action's
record, `+0x18` bits 18–26, now `damageHandler` in `readActions`. Slot 0 is
empty and the damage passes as it is: **570 of 681 actions, the plain Attack
among them.** The rest are the skills, mostly one apiece, and the cartridge
names what they are for — Dragon Slash on 1, Metal Slash on 2, Falcon Slash on
9, **Thunder Thrust and Hatchet Man sharing 45**, whose handler holds their own
0.95-to-1.05 draw. None is read yet; none is in the slice.

**Also read on the way, and not yet in the simulation:**

- `GetAttackBaseDamage` has two halves. Handed an action's damage-range record
  it is **the base give or take the spread** — `between(−spread, +spread) +
  base`, the reference's `drawnAmount` — the range chosen by one of the
  caster's numbers between two thresholds, as the accuracy is. Handed none, it
  is the physical formula. So a spell's and an item's amounts are confirmed in
  shape; `drawnAmount` is still the reference's exact integers until that
  scaling is read;
- **the initiative's draw is a float from 0.51 to 1.0**, in `ProcessCombatTurn`
  — the reference's, confirmed. How it meets agility there is not read;
- a blow that strikes several weakens as it goes, by `func_02074948`'s table
  **1.0, 0.8, 0.6, 0.4, 0.2**, for actions flagged `0x20000`; and action `0x79`
  deals four fifths.

**A target's chance of blocking** — `func_ov000_02156118`. One of the party:
nothing without a shield, and with one **nothing plus the equipment's own
chance plus a skill's bonus** — the base is zero and the chance is the
shield's. **Read from the item table, 20 September**: `func_02084ee8` walks the
eleven places of what is worn (`0x20` bytes each from `+0x194` of the
equipment at the character's `+0x150`; the shield's is the tenth, its item at
`+0x2CC`) and sums ten bits of each item's record over `10.0f` — the low ten
of the equipment table's word 6, set on 42 of the 45 shields and on nothing
else. The bronze shield's is 5: half a hundredth. **And the rate is not
truncated**, so against a whole draw below 100 that is one in a hundred, the
iron shield's 1.0 the same, the steel's 1.5 two — the reference's "blocked
when the draw is 0" is the game's for any shield of ten tenths or fewer, which
is every one the slice sells. `blockChance` in the simulation, held to the
oracle at all 1,024 values. The skill's bonus (`func_02085b88`: three traits,
each worth a number fetched by `func_0201137c` at `0x22`, `0x24`, `0x26`) and
the doubling are read and not modelled. A monster: a second grade in
its record, bits 16–18, through the same table as its dodge. Doubled under one
status.

**A target's chance of dodging** — `func_ov000_02156270`. One of the party:
**two in a hundred**, which is the simulation's `dodge: 2` and is now the
game's rather than the reference's, plus an accessory's and a skill's bonus. A
monster: by a three-bit grade in its record, **0, 2, 4, 8 or 25** — the table
at USA `0x020e88e4`. Either doubles under one status and is fifty flat under
another.

**Three fields of an action's record**, read from the code that reads them and
now in `readActions`:

| field | where | what reads it | the cartridge's witness |
|---|---|---|---|
| `evadable` | `+0x10` bit 5 | the evasion roll makes no draw without it | the plain Attack has it; the medicinal herb and fleeing do not. 156 of 681 |
| `blockable` | `+0x10` bit 6 | the block roll likewise | 162 of 681, 130 of them dodgeable too |
| `alwaysCritical` | `+0x08` bit 29 | the critical roll hands back 1 **without a draw** | 18 of 681, and one is named **Critical Claim**. Fifteen are a second copy of each attacking spell, Frizz to Kaboom — INFERRED: the spell as it goes haywire |
| `spoiltBySight` | `+0x10` bit 3 | the accuracy roll's die of eight | 110 of 681, **every one a blow that can be dodged**; the plain Attack has it, Heal, Frizz and the herb do not |
| `accuracyMode`, `accuracyRange` | `+0x18` bits 16–17; `+0x14` bits 7–13, 14–20 | whether the accuracy scales, and between what | 202 of 681 scale; the plain Attack does not, so it stands at a hundred |
| `kind` | `+0x18` bits 5–11 | the halving, which is kind 1's alone | 242 of 681 are 1 — the plain Attack, Frizz, Dragon Slash; defending is 0, what heals is 2. The other numbers' meanings are INFERRED from who carries them |
| `damageCap` | `+0x1C` low 14 bits | the lower of it and the whole number | 211 of 681: 999, 1999, 2999 by a spell's rank; none on the plain Attack |
| `worksOnMetal` | `+0x10` bit 24 | the coin, and the metal body's zeroing | 208 of 681: the blows have it and the attacking spells do not |
| `criticalPercent` | `+0x14` bits 21–27 | divided by `100.0f`, the skill's multiplier in `CalculateCritRate` | **100 on the plain Attack**, which is what leaves its two in a hundred standing |

`tools/harness/test/blow.test.ts` holds them to the cartridge.

---

## What is not a plain blow — a spell, an item

Read 20 September. **It is the same resolver**, and so the same order: the
cast's critical roll where it is the cast's; then for each one reached their
die, the critical roll where it is theirs, the dodge and the block *if the
record allows them* — no spell's does, and no draw is made — the accuracy's
draw, and the amount. Frizz at one monster: four draws and the amount's.
Crack at three: one, and three apiece.

**A spell's critical is the blow's roll with the spell's own multiplier**:
`criticalPercent` is 50 on Frizz, Crack, Woosh and Heal, which halves
`CalculateCritRate`'s two in a hundred to **one** — the reference's 100 in
10,000, and like a blow's it climbs with deftness past 150, which the
simulation's flat `magicCritical` does not. **A monster's is the same literal
nothing as its blow's**: a monster's spell never goes haywire, and spends the
draw. The simulation had it going haywire as often as the party's; corrected.
An item's multiplier is 0, so nor does a herb — and it spends the draw too.

**The amount — `GetAttackBaseDamage` (`0x021e7bc0`), handed a range.** The
range's record is a spread (word 0, bits 8–17) and three tens in word 1, and
who is using the action picks among them:

| who | the amount | draws |
|---|---|---|
| a monster | word 1 bits 0–9, give or take the spread | 1 |
| one of the party, the action scaling (`+0x18` bits 16–17 at 2) by a number it names (`+0x10` bit 14 magical might, bit 15 magical mending) | bits 10–19 at or under the record's `lo` (`+0x04` bits 12–21), bits 20–29 at or over its `hi` (bits 22–31), and `(int)((stat − lo) × ((max − min) / (hi − lo))) + min` between; give or take the spread | 1 |
| one of the party otherwise | **drawn** between bits 10–19 and bits 20–29, *then* give or take the spread | **2** |

Every arm returns through `_ffix`. `game-formats` had the three tens as
INFERRED from the reference — a monster's base, the party's, a peak — and the
code bears all three out. **Frizz is 14 to 99 as might goes from 50 to 999**;
Heal 35 to 160 as mending does.

**The herb costs two draws.** It names no number, so its base is *drawn*
between 35 and 35 — a draw that can only come to 35, spent — and then spread.
The reference has one. The simulation now makes both.

Six skills scale by a number put together from the user's and what they hold,
by a table at `0x021fe8b6` — Gigaslash, Gigagash and Lightning Storm 500 to
1,998, Hand of God 300 to 999, Whopper Chop 250 to 600, Boulder Toss 500 to
1,998. *Read, not followed*: nothing the slice plays has one.

**In the simulation**: `drawnAmount` and `partyAmount`, held to the oracle —
every spread, every number from 0 to 1,023; a fighter's `might` and `mending`;
the spell's and the item's draws in the resolver's order, pinned in
`battle.test.ts` by difference. **Ours still**: a heal's going haywire
multiplying by 1.5 to 2.0 is the harm's rule applied to it — what the game
does for kind 2 after the amount is not read; and what is worn is not added
to might or mending.

Two more draws in the resolver are **not followed**: `NextRandomMax(100)` at
`0x021ecfd8` and `0x021ed324`, each for one of the party whom
`func_ov024_021eb1ec` picks out, after the damage. And four actions draw
before any target is looked at (`0x1FF`, `0x200`, `0x20B`, `0x20C`).

## A change of state — and what rides on a blow

Read 20 September. Two different things in the game, and the simulation had
them as one kind of roll.

**A change of state that is the action itself** — Kasap, Snooze, Sweet Breath.
The resolver calls a handler by the action's *kind* (`+0x18` bits 5–11; a table
of member pointers at `0x021ff508`: 3 attack, 4 defence `func_ov024_021db7c0`,
5 agility, 6 poison, 8 sleep). **The handler makes no draw.** It is handed
whether the action landed, and that is the resolver's own **accuracy roll** —
so the chance of a change of state *is its accuracy*:

- **a monster's** is the record's `+0x14` bits 0–6. Kasap 75, Deceleratle 75,
  Sweet Breath 25 — **the reference's three, from play, and here they are in
  the data**. Snooze is 37 and Kasnooze 50, which ours had at 25;
- **one of the party's** runs from bits 7–13 to bits 14–20 as their might (or
  mending) runs between the record's `lo` and `hi`, exactly as an amount does —
  Sap 75 to 100 — or is *drawn* between them, one draw more, where it names
  neither;
- then **times the target's resistance** to the action's element (`+0x18` bits
  27–31, through `func_ov000_02156b38`) **plus a half**, truncated, and the
  hundred drawn must come in under it;
- **a cast gone haywire lands outright**, against any resistance above nothing
  (`0x02156a34`);
- what *raises* — Buff, Accelerate, Oomph — does not scale, so its accuracy
  stands at a hundred: it lands every time, and spends the draw;
- how far: the record's `+0x30`, signed, held to two either way. Buff 1, Sap
  −1, Oomph 2, Blunt −2;
- **before any draw**, the roll leaves with a miss for a metal body under an
  action that does not work on one, and for a few of the target's statuses.

The order is the resolver's, so the draws are: the critical once for a group or
all; then each one's die, the critical where it is theirs, **the dodge where
the record allows one — a breath's does, a spell's does not** — the block
likewise, and the accuracy. They are made **before it is known whether there is
anything left to change**: the handler finds that out afterwards
(`func_02087860`), so a cast on one already asleep costs what any cast does.

**What rides on a blow** — Toxic Dagger's poison, Helm Splitter's defence, the
poison attack's poison. `func_ov024_021e4b14` dispatches by the record's
`+0x18` bits 0–4, 22 slots at `0x021ff450`, called from the kind's handler once
the blow has landed. Each handler has one shape:

- nothing **and no draw** for a blow that dealt nothing, a target whose byte
  for it is 0 (status `+0x46` to `+0x52`, one a rider — the target's
  susceptibility, in hundredths), or one who cannot take it now;
- then `NextRandomMax(100)`, as a float, under **the action's chance times a
  hundredth of the target's byte** — a monster's chance bits 0–6, one of the
  party's bits 7–13 — or under a hundred for a critical;
- the levels at `+0x32`.

Slots read from their handlers: 2 lowers attack (`UpdateCombatantAttack`), 8
lowers defence. INFERRED from who carries them: 4 poison, 7 sleep, 10
confusion, 11 paralysis, 20 death. **Action 275 — the reference's poison
attack — is rider 4 at 12**: the reference's 12 in 100, in its own record.

**In the simulation**: the change's draws in this order, its roll the
accuracy's; `haywire` and `evadable` from the record; a `dodged` result; the
poison rolled only for a blow that dealt something. **In the game**
(`foeWaysOf`): chance, levels and dodging from the action's record in place of
our table. **Ours still, and the largest thing left here: nobody has a
resistance.** Every target's is whole and every susceptibility byte a hundred,
which is right for the Hero against the slice's monsters only as far as the
reference goes; where a monster's come from is not read.

## Resistances

Read 20 September. **One function, one array.** `func_ov000_02156b38(target,
element)` is the byte at the target's status `+0x3E + element − 1`, plus a
modifier, held at nothing or above, over `100.0f`; whole for an element outside
1 to 21. Twenty-two bytes, a hundred each until something says otherwise
(`func_020891cc`). The riders' "byte of the target's" at `+0x46` to `+0x52` is
this same array, elements 9 to 21.

**A monster's are in its record**: the 22 bytes at `+0x6C` of
`mon_btldata.nat`, copied in when the battle builds it (`func_02089630`). That
function reads the record's HP, MP, attack, defence and agility from where
`game-formats` had INFERRED them, which settles those too. The cartridge bears
the reading out by name: a firespirit takes 50 of fire and 150 of ice, a slime
125 of all seven, a metal slime nothing of any status — and **all 438 take a
plain blow whole**.

**Where it is used**, all three through that one function:

- **damage**: times the resistance to the action's element (`+0x08` bits
  22–26), straight after the critical and before anything else
  (`0x021e6e8c`). A float until the end — so 1 against a half is 0.5, which is
  above nothing, gets no coin, and deals 0;
- **a change of state**: its accuracy times the resistance to `+0x18` bits
  27–31, plus a half — Kasap's 75 on the slice's boss, whose byte for it is 75,
  is `(int)(56.25 + 0.5)` = 56;
- **a rider**: under its chance times the byte over a hundred, and not rolled
  for at all against a byte of 0.

**The modifier** — read, not modelled: −50 under a ward for each of elements 1
to 7 (five wards: 1, 2, 3 and 4, 5 and 6, 7), nothing for 8, and for 9 to 21
−25 under one status bit and +25 under another.

**In the simulation**: `resistanceTo` and `dealt`, held to the oracle at every
byte and every resistance; a fighter's `resist`; a spell's `element` and `cap`,
a change's `element`. The game gives each monster its record's bytes.
**Ours still**: the party's are whole — the game's start whole too, and what
armour and accessories do to them is not read.

**And a monster's HP is drawn** — see "The two generators", below.

## The two generators, and a monster's HP

Read 20 September, and it answers what the replay harness will need first.

**The battle has a generator of its own, and it is not `GetBTRandom()`'s.**

| | where | seeded | draws |
|---|---|---|---|
| **the battle's** | the head of the battle object — every `NextRandomMax([ctx + 0x10], …)` in overlays 0 and 24 is handed the object itself | when the battle is made, from `GetCurrentTimestamp()` (`InitRandom` at overlay 0 `0x0215d070`). A thunk at `0x0215faa4` re-seeds it from two words, and `0x02160600` reads its state out into `+0x6e3c` of another object — INFERRED: for a battle shared between consoles | every roll this ledger has read |
| **the world's** | a global at `0x02108ddc`, which `GetBTRandom()` returns | once, when the game state is made (`0x0200f540`), beside the C library's `srand` with the same number | the field's — overlay 17 calls it — thirty callers in all, **and a monster's HP** |

So a battle's rolls replay from **the battle's seed alone**, which is what
`BattleRng.fromGameState` takes; and the monsters' HP belong to the world's
stream, drawn before the battle's generator exists.

**A monster's HP** — `func_02089630`, which builds its status from its record:
`_ffixu(0.5f + (float)HP × NextRandomFloatBetween(0.8f, 1.0f))`, one draw from
the world's generator, and that number is its HP and its most HP both. **The
table's HP is a ceiling**: a slime's 8 is 6, 7 or 8. Left as the table's, with
no draw, when the battle's setup holds a number that is not −1 at `+0xC`
(`func_020a3694`) — INFERRED: a scripted battle's number, so a boss has its
table's HP and an encounter's monsters do not. The reference emulator, which
plays a boss, has the table's.

**In the simulation**: `monsterHp`, held to the oracle. **In the game**: drawn
from the field's generator for a battle that can be fled — which stands in for
the game's flag, and is ours.

## What the rest of a blow does — the end of `func_ov024_021e6a90`

Read 20 September, from `0x021e7760` to the return. `r4` is the attacker and
`r5` the target (the function's head fetches them by the ids in `r1` and `r2`);
the damage is a float in `r6` until the last.

In the game's order:

1. **Blocked, then dodged, each zero the damage** (`0x021e777c`, `0x021e77a0`)
   — bits 2 and 1 of the result's byte `+0x1C`. This late: the base damage and
   the critical have already spent their draws.
2. **A metal body** (`func_ov000_02156068(ctx, target, 0, 1)`) zeroes a
   non-critical blow whose action works on metal and is of a certain sort
   (`+0x08` bits 8–9 at 1, or action `0xDB`), bar actions `0x205` and `0x82` and
   a flag on the stack not followed. *Read, not understood, not in the oracle.*
3. **The coin** (`0x021e7824`–`0x021e7904`): damage not above nothing, and not
   blocked, not dodged, not action `0x70` or `0x48`, the target's resistance to
   both of the action's elements above nothing (`func_ov000_02156b38`), not
   action `0x1B` — **Kamikazee**, by the cartridge — and not a metal body under
   an action that does not work on one → `(float) NextRandomMax(2)`.
   **No test of the attacker's side anywhere in it.**
4. **Metal Slash and Metalicker** (`0x40`, `0x7E`) on a metal body, not
   critical: `1.0f + NextRandomMax(2)`, over whatever came before.
5. One more for one of the party when the action has `+0x10` bit 18 and
   `func_02085128` of something at their `+0x150` says so. *Not followed.*
6. When `[ctx + 0x76]` is set and the action has `+0x10` bit 13: an attacker
   carrying status bit `0x800000` or `0x1000000` multiplies by
   `func_02074738(level, isMonster)` — a table at `0x020e88f8` of
   **1, 1.5, 2.5, 4, 6** for the party and **1, 1.3, 2, 3, 4.5** for monsters,
   by a signed byte at status `+0x24`. *What this is, is not established.* The
   same pair of bits at the function's head (`0x021e6b4c`) sends the whole
   blow home with nothing and a 1 or a 2 in `[ctx + 0x47]`.
7. **The halving** (`0x021e7a58`): the *target* carrying status `0x1000000`
   and the action's kind being 1 → `0.5f × damage`.
8. The combo table at `0x021fe778`, for an action with `+0x2C` bit 27 and
   damage of at least one. *Not followed.*
9. **`_ffix`** — the float becomes the whole number, truncated — and **the
   cap**: the action's `+0x1C` low 14 bits, when not nothing and lower.
10. Action `0xAF` — **Double-Edged Slash** — has a quarter of the number kept
    at `[battle + 0x8e38]`: INFERRED, the recoil.

### It was not defending: `0x1000000` is maximum tension — 22 September 2026

**Settled, and it closes the question the ledger carried.** The bit lives at
`[combatant + 0x138] + 0x14`, the status object's flag word, which overlay 24
reads through the one-line predicate `func_ov024_021dd260`. Its writers are all
in the ARM9, and there are four: `func_02088150` sets it (`0x0208819c`,
`orr r2, r2, #0x1000000`), `func_020881ac` clears it, `func_02087704` clears it
as a step decays, and `func_02088474` clears it conditionally.

**What sets it is the tension ladder, not a Defend command.** The setter also
stores **4** in the byte at `[status + 0x24]`, and its callers are the
psyche-up routines: `func_0208767c`, which steps that byte 1, 2, 3 and sets the
bit only as it reaches 4, and the ladder in `func_ov024_021dc93c`, which emits
messages `0x31`, `0x32`, `0x33` through `func_02088220` — the setter of
`0x800000`, which stores the level in the same byte — and calls this one with
message `0x34` when the level to reach is 4. So:

- **`0x800000`** is tension at levels 1 to 3, **`0x1000000`** tension at 4, and
  **`[status + 0x24]`** is the level itself, a signed byte from 0 to 4;
- the level indexes a table of ten floats at `0x020e88f8` through
  `func_02074738(level, isMonster)` — **`1.0 1.5 2.5 4.0 6.0`** for the party
  and **`1.0 1.3 2.0 3.0 4.5`** for a monster — and the symbol immediately
  after it in the ARM9 is `CalculateTensionBonus`, already named by the decomp;
- it is spent when its carrier acts: `ResolveAction` clears both tension bits
  once the action resolves, and `func_02087704` decays the level, swapping
  `0x1000000` off for `0x800000` at 3 and clearing that at 0.

That also explains the bit on the *attacker*, which was what made "defending"
doubtful: at the head of the resolver it writes a message code — 1 psyched up,
2 at maximum — for tension spent on a blow that does nothing, and at step 6 it
multiplies the damage by that table.

**So the halving at `0x021e7a80` is not a defence.** It is *a target at
maximum tension takes half from an action of kind 1*. The simulation's
defending is the reference's, and stays **ours**: nothing in the ARM9 or any of
the 35 overlays sets that bit from a Defend command, and the Defend command's
own handler is not located — the search covered every module's writes of the
status word and every call into the flag class, and every other bit of that
word carries a multi-turn duration byte, which a one-turn defence would not.
The witness experiment is no longer needed to settle the bit; what it would now
measure is our own stand-in.

## Still to read, in the order it is wanted

- **what the Defend command does**, which is still unlocated: the status word
  has no one-turn flag, so the halving may live in the command's own handler or
  in the action data rather than in a status bit;
- the steps of the end of a blow marked *not followed* above: the metal body's
  zeroing, the party's one more, the attacker's status table, the combo table;
- what armour and accessories do to the party's resistances, and the wards;
- what the game does to a heal that goes haywire;
- the party's flee chance, by way of how the command is numbered;
- what seeds the C library's generator, which a drop is rolled from, and what
  the drop roll's four further passes scale their chance by —
  `func_ov023_021f454c` at `0x021f4628` on, one pass a standing party member
  above half its HP: the series' item-finding abilities, which the slice has
  not;
- what the four ways that do not draw by weights do, exactly — a round robin
  (3 and 7), a pair and a coin (5), two passes (6) — and what makes a slot
  unusable, which the game scans past rather than re-drawing;
- what the boss bit at `+0x27` does, now that it is known not to choose the
  weight table;
- action kind `0x22`, which `ProcessCombatTurn` draws again rather than
  taking.
