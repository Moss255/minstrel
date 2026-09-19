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

**The open question that matters most** is in there. The critical roll spends
its draw whether or not it lands, and it would for a monster too, whose rate is
zero — *if it is called*. The simulation, following the reference, spends none
on a monster's blow. Its four callers are all in `func_ov024_021eb5d0`, the
blow's resolver, behind flags not yet read. The reference was made to predict
real play and is strong evidence that it is right; the code is how to be sure.

---

## Still to read, in the order it is wanted

- **`func_ov024_021eb5d0`**, the resolver of a blow: which draws it makes, in
  what order, and for whom — the question above;
- the party's flee chance, by way of how the command is numbered;
- how a monster weighs its six ways: `func_ov000_0215f57c` is part of it;
- the spell and healing amounts — `drawnAmount`, `criticalDamage` and
  `criticalBlow` are the reference's and not yet held to the game;
- `initiative` — agility times a draw from 0.51 to 1.0, likewise.
