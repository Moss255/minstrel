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
| **The surprise round** | `ProcessCombatTurn`: `[battle + 0xe49]` is how the fight opened. At 1 the monsters sit out; at 2 the party does, the first monster always acts, and each after it acts on `NextRandomMax(100) < 67` | not modelled | read into the oracle |
| **A monster fleeing** | the action dispatcher, `func_ov024_021da670`: action `0xE1` (and `0x395`) on oneself removes the combatant, **with no draw** | a refusal, ours | **a monster that chooses to flee, flees.** If anything refuses it, that is in the choosing and not here. `still-open.md` lists "a monster attacking when its drawn Flee is refused" as ours, and it has no counterpart at this point in the game |
| **Tension** | `CalculateTensionBonus` — `tension × (1 + level / 10)`, the division a whole number's | not modelled | read into the oracle; levels 10 to 19 all double it |
| **Buffs** | the six `Calculate…BuffMultiplier`s | not modelled | read into the oracle. A quarter a level on attack; a half on defence, agility and the magics; defence *down* is a half and then three quarters, not a half a level; charm never falls below whole |
| **A stat after its multiplier** | `RoundUp` | not modelled | round half up, before the blow is worked out |

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

1. **the critical roll, always.** `func_ov024_021ea4d0` or `021ea500` decides
   whether it is made once for the whole action or once a target, and then it
   is made. Inside it a monster's rate is nothing and the draw is spent all the
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

**The simulation makes a plain blow's draws in this order since 20 September.**
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
shield's. That is not read from the item table yet, so the simulation's shield
still blocks once in a hundred, the reference's. A monster: a second grade in
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
| `criticalPercent` | `+0x14` bits 21–27 | divided by `100.0f`, the skill's multiplier in `CalculateCritRate` | **100 on the plain Attack**, which is what leaves its two in a hundred standing |

`tools/harness/test/blow.test.ts` holds them to the cartridge.

---

## Still to read, in the order it is wanted

- the rest of `func_ov024_021e6a90` after the critical — resistances, the two
  coin flips at `0x021e7904` and `0x021e7958`, and where the float becomes the
  whole number that is dealt;
- a monster's blow that deals nothing dealing 0 or 1, and defending halving a
  blow — both still the reference's, and both somewhere in that function;
- a shield's own chance of blocking, in the item table, which the block rate
  is made of;
- the order of the draws that are *not* a plain blow's: a spell's, an item's, a
  change of state's;
- the party's flee chance, by way of how the command is numbered;
- how a monster weighs its six ways: `func_ov000_0215f57c` is part of it;
- the spell and healing amounts — `drawnAmount`, `criticalDamage` and
  `criticalBlow` are the reference's and not yet held to the game;
- `initiative` — agility times a draw from 0.51 to 1.0, likewise.
