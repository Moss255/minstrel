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
translated in the 32-bit floats it computes in, and lives in the test tree so
that no float enters the simulation. `conformance.test.ts` holds the
simulation's whole-number forms to it and, where they part, pins **how often
and by how much**. A disagreement that is measured is a decision; one that is
not is a bug waiting for a seed.

---

## The ledger

| what | the game's | ours | standing |
|---|---|---|---|
| **The generator** | `SeedRandom`, `NextRandom` — `src/Util/Random.cpp`. A 64-bit LCG, `0x5D588B656C078965` and `0x269EC3`, the draw its top 32 bits | `BattleRng` | **the same sequence, one step apart.** The game steps and then draws; ours draws the seed's own top and then steps, as the reference does. `BattleRng.fromGameState` seeds ours from a state read out of the game |
| **A whole number below a maximum** | `NextRandomMax` — `maximum × (float)(next / (double) 0xFFFFFFFF)`, truncated, held below the maximum | `below` — `(top × max) >> 32`, exact | **agrees on every draw for small maxima** (2, 6, 10 over 200,000 each); **parts about once in 4,000 at 10,000**, by one. The float has 24 significant bits and the integer form has all of them. *Not closed* — see below |
| **Physical damage** | `CalculatePhysicalDamage` — `src/Combat/Main/BasicAttackCalculation.cpp` | `physicalDamage` | **the same to a case in a million**, and always the same number of draws. A quarter of `2·attack − defence`, spread a sixteenth either way and then by up to one; or anything up to a sixteenth of the attack when that is more |
| **Truncated, not rounded** | `GetAttackBaseDamage` (overlay 24) returns the float as an `int` | truncates | **settled.** `RoundUp` — `0.5f + x` — sits beside it and is called sixteen bytes before, which invites the other reading; it is applied to a *stat after its multiplier*, not to the damage. Rounded, a third of all blows would land a point differently |
| **The critical chance** | `CalculateCritRate` — `src/Combat/Main/CritRateCalculation.cpp` | `criticalChance` | **settled, and it was an open question.** Two in a hundred, plus a hundredth of a point for each point of deftness **past 150**; an accessory's and a book's bonus added, a skill's multiplying, a move of several hits sharing it out. The reference's 200 in 10,000 is this at any deftness to 150; its 500s are a bonus, not a level. Ours has the deftness and not the bonuses, which nothing in the slice has |
| **Tension** | `CalculateTensionBonus` — `tension × (1 + level / 10)`, the division a whole number's | not modelled | read into the oracle; levels 10 to 19 all double it |
| **Buffs** | the six `Calculate…BuffMultiplier`s | not modelled | read into the oracle. A quarter a level on attack; a half on defence, agility and the magics; defence *down* is a half and then three quarters, not a half a level; charm never falls below whole |
| **A stat after its multiplier** | `RoundUp` | not modelled | round half up, before the blow is worked out |

---

## The one decision this has turned up

`CLAUDE.md` says: *never let a float enter a gameplay calculation*. The reason
it gives is RNG reproducibility — and the game itself computes these in
`float`. So the rule and its purpose now point different ways, in one place:

**A draw below 10,000 differs from the game's about once in four thousand.**
That is the critical roll's maximum. The draw *count* never differs, so the
generator never drifts; what differs is one outcome in four thousand, by one.

Three ways to stand, and it is the owner's to choose:

1. **Leave it**, pinned as it is. The simulation stays float-free and is the
   game's to within a roll in four thousand. Honest, and not exact.
2. **Match the game with `Math.fround`**, in the draws only. IEEE-754 single
   precision is the same on every platform, so reproducibility — the rule's
   actual purpose — is kept; the rule's letter is not.
3. **Match it in whole numbers**, by reproducing the float's rounding
   exactly: 24 significant bits, round to nearest even. Keeps both, and is
   fiddlier to be sure of than either.

Until it is chosen the test pins the gap from both sides — that it exists, and
that it is under one in two thousand.

---

## Still to read, in the order it is wanted

From the decomp's symbols, not yet decompiled upstream unless it says so:

- what calls `CalculateCritRate`, and **how the percentage meets a draw** —
  until that is read, 200 against `below(10,000)` is the reference's;
- the flee chance, and the words beside the weight tables
  (`docs/binaries.md`, "Still to look for");
- how a monster weighs its six ways past the first two tables;
- the spell and healing amounts — `drawnAmount`, `criticalDamage` and
  `criticalBlow` are the reference's and not yet held to the game;
- `initiative` — agility times a draw from 0.51 to 1.0, likewise.
