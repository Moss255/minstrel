# Beyond the slice — implementing the rest of the game

Written 19 September 2026, with Slice 1 held shippable. This is the plan for
everything after it: the story from the slice's title card to the ending, and
the postgame a single player can reach.

The slice plan at the repository root covers what is already built and is not
replaced by this. `docs/still-open.md` remains the standing list of what is
open *within* the slice; nothing here waits on it.

---

## The decisions this plan rests on

Taken 19 September 2026, and each of them changes the shape of the work:

| | |
|---|---|
| **Ends at** | the story to the ending, **plus the postgame** a single player can reach — the legacy bosses, the Realm, grottoes |
| **Not included** | Tag Mode, local co-op, DLC quests. Left out deliberately: netcode and strict determinism would roughly double the sim's constraints, and the risk to *finishing* is not worth it |
| **Accuracy** | **conformance first.** The harness gets built before more content, and the slice's battle maths is rewritten behind it — as the slice plan always said it would be |
| **Systems back in** | character creation and appearance · vocations and Alltrades · party recruitment · alchemy and mini medals |

---

## Where the project stands

Measured against the cartridge today, not estimated:

| | |
|---|---|
| Map archives (`.amdj`) | **669**, of which the slice uses **18** |
| Areas with a cast (`.npc`) | **74**, placing **1,385** characters |
| Event scripts (`.stb`) | **47** |
| Event text files | **1,646** |
| Monsters | **438**, read side by side from two files |
| Engine functions the scripts invoke | **139**, of which about **40** have a reading |
| Collision meshes | **1,178**, every one parsed |
| Materials | **47,953**, every one parsed |
| Tests | **1,340** passing, 166 of them gated on a cartridge |

What that adds up to: **the parsers are not the problem.** Nitro containers,
collision, models, textures, materials, sprites, animation, audio, text,
tables, triggers and the script format are all read, with the evidence in each
package's `FORMAT.md`. The slice proves a village, a dungeon, a boss, a party,
a shop, a menu and a battle all work from cartridge data at runtime.

---

## The shape of the problem

**It is not 669 maps of work.** Assets come from the cartridge at runtime, so a
new area costs no art. What a new area actually costs is:

1. **Engine functions its events call.** 139 are invoked across the cartridge
   and roughly 100 have no reading. The slice's morning alone calls 21 that the
   host answers with 0. Every new area will call some that have never run.
2. **Systems it is the first to need.** A town with an Abbey needs vocations; a
   town with a Quester's Rest needs a party of four.
3. **Per-area quirks.** A sliding piece, a lift, a boat, a poison marsh.

Of those, (1) is the one that scales badly *and silently*. An unread engine
function currently returns 0 and the event carries on, so a scene half-plays
and nothing says why. **That is the single most important thing to fix before
mass content**, and it is cheap.

(2) is the one that scales badly *retroactively*. A party of four changes the
save format, the battle model, the menus and the field follow. Done after six
hundred maps of content, every one of them needs revisiting.

---

## The decomp changes the conformance story

The slice plan assumed conformance meant comparing against `DQIX/BattleEmulator`,
a fan reimplementation. It no longer has to. `~/Projects/dqix-decomp` is a
decompilation with per-overlay symbol tables and full cross-references, and this
session used it to read a monster's collision radius straight out of the
engine's own `Object3D::SetRadius` call.

So "conformance" can now mean **translating the game's own functions** rather
than matching a third party's guesses. That is a materially stronger position
than the slice plan anticipated, and Phase 0 should be built around it:

- battle formulas from the decompiled functions, not from a reference emulator;
- the RNG from the game's own, replacing the stand-in rolls
  (`randTTT`/`randTBox` today draw with a roll fixed by the treasure's number);
- the ~100 unread engine functions read from code rather than inferred from
  argument shapes.

`docs/binaries.md` is the record of what has been found in the binaries and is
where each finding belongs. **Read it before disassembling anything** — this
session spent an evening re-deriving a table it had documented two days
earlier.

---

## Phases

Ordered so that each finishes something, and so that nothing later forces a
migration of everything earlier.

### Phase 0 — Conformance, and the battle rewrite

The decision taken above. Nothing else starts until this does.

- A headless harness that drives the sim deterministically and compares runs.
- The game's own RNG, from the decomp.
- Battle maths, critical and flee chances, encounter rates and monster AI
  rewritten against decompiled functions, with golden tests.
- The `docs/still-open.md` §1 questions that conformance answers on the way —
  which level-table column is which, whether the Hero is a Minstrel, the damage
  formula up the curve.

**Done when** a battle can be replayed from a seed and matches the reference,
and the 273 "ours" constants — a grep count, so it drifts — have shrunk measurably.

### Phase 1 — The content pipeline

What makes the remaining areas cheap.

- **Make unknown engine functions loud.** A run that meets one should say so,
  not answer 0 and carry on.
- **Coverage measurement**: run every event on the cartridge against the host
  and report which functions each needs, ordered by where it falls in the
  story. This turns "100 unknown functions" into a worklist with a sequence.
- **Implement them**, cheapest and most-used first, reading from the decomp.
- **The loader against all 669 maps headlessly** — the harness already does
  this kind of sweep for collision and spawns; extend it to a full load.
  **Done, 24 September 2026**: `apps/game/test/maps.test.ts` runs the
  game's own `load` over every map archive in about 50 seconds. **All 669
  read**, none names a resource its archive has not got, and one doorway on
  the cartridge leads to a map that is not there. 197 have no collision — 174
  of them the whole `B` family, which has no region, doorway, cast or trigger
  and is pieces rather than places; twelve are places the index names, and of
  those `M12`, Wormwood Creek's outdoor map, has a cast of eleven and eight
  doors. See `docs/still-open.md`.

  This is what the dip sample could not do. Thirteen areas by hand found two of
  the 197, by luck; the sweep is exhaustive, takes a minute, and needs no
  browser, because `apps/game/src/load.ts` has no DOM in it.
- **Text and talk at scale**: 1,646 event texts, with the markup fully read.
  **Measured, 24 September 2026**: `apps/game/test/text-coverage.test.ts` runs
  every event's English text through the game's own renderer. There are
  **5,157 texts in 687 events**, not 1,646 — the figure above was a third of
  the real number. Nine render to nothing at all; **23 tags are unread**, and
  `<ADD>` alone is in 429 of the 687 events. The game's own vocabulary of 127
  tags has been found at `0x020f0600` and its parser at `0x0206a6b0`, so the
  worklist is known and sequenced. Implementing them is the work that remains.
- **Make a witness cheap** — jump to any map at any stage, a save state, and
  let's-play frames lined up against ours. See "The bottleneck moves" below:
  this is the highest-value work in the phase, because Phase 3 is paced by it
  seventy-four times over.
  **Started, 24 September 2026**: `tools/witness` takes an area and writes one
  HTML page — the map, every doorway, every event its triggers reach, each with
  its status line under it. Gleeba, a town a hundred events past the slice,
  came out at 32 views in about three minutes with nothing failing to load;
  Angel Falls at 59 views in 7.2 minutes.
  **Dip-sampled 13 areas across all seven families** the same day, maps and
  doorways only (what an area's *events* want is already answered for all 75
  areas, headlessly, in two seconds — paying seven minutes an area to learn it
  again is the wrong trade). 68 views, none failed. **Two are worth a look**:
  `O00` and `O01` have no collision mesh, so the engine has nowhere to stand
  the Hero and the map never comes up. They are the whole `O` family, 2 of 75,
  and may be backdrops rather than somewhere walked — see `docs/still-open.md`.

  The sample also caught a fault in the witness itself, which is the argument
  for sampling: the first run called `O00` a good view, because the page had
  not said the word *failed*. It now checks that the overlay names the map it
  should be showing, and reads the status line rather than only displaying it. What it does not yet do is
  the let's-play half: frames beside a recording, which wants the recording as
  an input. Its README says what else it leaves out.

**Done when** an area outside the slice loads, walks, talks and plays its
events without new code — **and** somebody can satisfy themselves that it is
right in minutes rather than an evening.

**Where that stands, 24 September 2026.** The done-when has four verbs and
each now has a measurement of its own rather than an assumption:

| verb | measured by | where it stands |
|---|---|---|
| loads | `apps/game/test/maps.test.ts` | **669 of 669 read.** 196 have no collision, 174 of them one family of pieces |
| plays its events | `apps/game/test/event-coverage.test.ts` | **5 engine functions unanswered** on the whole cartridge; the slice's own area wants none |
| talks | `apps/game/test/talk-coverage.test.ts` | **1,116 of 1,135 speak**, in all 43 areas that have anybody standing in them; none renders blank |
| walks | `apps/game/test/walk-coverage.test.ts` | ten areas walked from where the game stands you, with the game's own controller. **Nobody is stranded**; eight of the ten reach every one of their doorways |

**All four are now evidenced.** The second half of the done-when — satisfying a
person in minutes — has `tools/witness` for the looking and still wants frames
beside a let's play.

Two things the walking sweep taught, both of which had been assumed:

- **A map is not one walkable region.** `C04`, Gittingham Palace, reaches 2 of
  its 12 doorways from where you arrive, and that is right: the forecourt is
  567 cells with two ways out, and the palace grounds beyond are a separate
  region of 11,000 reached through the building.
- **Arrivals are not reciprocal.** `M11`'s entrance is from a dungeon interior
  while its own exits lead to the field, so "you can leave the way you came" is
  not an invariant and cannot be asserted.

### Phase 2 — The systems that restructure data

Before mass content, because each changes shapes that content depends on.

| system | what it changes |
|---|---|
| **Party of four** (recruitment) | save format, battle model, menus, field follow |
| **Vocations and Alltrades** | 13 level tables instead of one, skill trees, the change flow |
| **Character creation** | runtime character assembly — the slice plan calls this "the hardest asset problem in the project" |
| **Alchemy, mini medals** | mostly menu and table work once the recipes are read |

Character creation is also what unlocks the Observatory prologue, which the
slice deliberately cut.

**Done when** a created character of any vocation, in a party of four, can be
saved and loaded.

### Phase 3 — The world

Now content scales. Area by area in story order, each one a checkpoint.

The 74 areas are the unit, not the 669 maps — a map archive is usually one
building. Expect the first few to be slow and to send work back to Phase 1;
expect that to stop.

### Phase 4 — The postgame

- Legacy bosses and the Realm: more of Phase 3.
- **Grottoes are different.** They are procedurally generated, and the `.bpos`
  files — 5 of them, `Z01M0100`..`Z05M0100`, an 11 by 18 grid of codes — are
  read and not modelled. The generator is in code, and `FloorMapGenerator` is
  named in the decomp with its routines, so this is a translation job rather
  than an invention.

### Phase 5 — Ship

---

## What could stop this finishing

Named plainly, because the worry that prompted the scope decision is the right
worry.

| risk | why it bites | what reduces it |
|---|---|---|
| **The engine-function tail** | ~100 unread, silently returning 0, discovered one scene at a time | Phase 1 measures and sequences them before content starts |
| **A system arriving late** | party of four after 600 maps means revisiting 600 maps | Phase 2 is deliberately before Phase 3 |
| **Conformance never ending** | formula archaeology can absorb unlimited time | Phase 0 is timeboxed by its "done when", not by exhaustiveness |
| **A red test going unnoticed** | nothing is checked automatically, and the tests that need a cartridge are skipped without one — so a failure can be invisible to everyone but the person holding a dump. Two assertions sat red from 16 to 19 September | Run `pnpm typecheck && pnpm test && pnpm lint` with `MINSTREL_TEST_ROM` set before committing. It is the whole of the defence, so it has to be habit |
| **Scope creep back to multiplayer** | the excluded thing that would double the sim's constraints | It stays excluded. Revisit only after Phase 5 |
| **The witness loop** | after Phase 2 the constraint is no longer writing an area but *seeing* that it is right, 74 times, and that cannot be scripted | Phase 1 builds the tooling for it; Phase 3 starts by timing one area end to end so the floor is measured rather than feared |

---

## Sizing, against what the slice actually cost

The slice plan priced itself at **38 weeks**. It was built between **5 and 18
September 2026** — 182 commits over **12 working days**. About **22 times**
faster than estimated.

That number is the only calibration this project has, so it is worth being
precise about what produced it and what it does not transfer to.

### Why the slice went twenty-two times faster

**Format work compresses enormously, and the slice was mostly format work.**
The method is: propose a layout, test it against every instance on the
cartridge, keep it only if it holds. A person does that with a hex editor over
days; scripted, it is minutes. The repository's own evidence style — "1,178 of
1,178", "108,471 of 108,471" — *is* that method, and nearly all of the 22×
came from it.

Engine building compressed too, but less: a renderer, a collision system and a
menu are ordinary code.

**And some of the speed was bought rather than earned.** The slice carries 434
`INFERRED` marks, 273 "ours" constants, 152 "not established" and 41 set "by
eye". Every one is a place where the compression failed and a stand-in went in
instead, honestly labelled. The discipline of labelling them is what made the
speed safe; it does not make them free. **Phase 0 is largely the bill.**

### Where the ratio holds, and where it does not

| phase | compresses like | why |
|---|---|---|
| **0 — conformance** | well, ~10× | decomp translation, which is format work by another name — this session found a monster's collision radius through `Object3D::SetRadius` in about an hour |
| **1 — pipeline** | very well | measurement and tooling, the thing scripting is best at |
| **2 — systems** | well, 5–10× | ordinary engine code |
| **3 — the world** | **poorly** | see below |
| **4 — postgame** | mixed | the grotto generator translates; the rest is Phase 3 |

### The bottleneck moves, and this is the plan's real finding

Phase 3 is 74 areas, and an area is not finished when it loads — it is finished
when somebody has *seen* that it is right. `docs/still-open.md` already sorts
its open questions this way: §1b is headed "Needs the emulator, or a video",
§4 is "By ear and by eye". `CLAUDE.md` puts running the emulator and reading a
screen outside what can be automated here at all.

So after Phase 2, **the constraint stops being implementation and becomes
witnesses**. Seventy-four areas times however long it takes one person to
watch one and say "yes, that's right" is the floor, and no amount of speed
before it moves that floor.

Which makes the highest-value work in Phase 1 not the engine functions at all,
but **making a witness cheap**:

- jump to any of the 669 maps at any story stage, from a URL or a key;
- a save state, so a scene can be replayed without playing to it;
- frame extraction from the let's plays lined up against the same moment in
  ours — this session did it by hand to settle how a chest and a barrel behave,
  and it took minutes rather than an evening;
- the status line already naming what is ours on screen, so a watcher knows
  what they are being asked to judge.

Every hour spent there is repaid seventy-four times.

### So what is the number

**Unknown, and deliberately not guessed.** What can be said:

- Phases 0 to 2 are the slice's kind of work, and the slice's calibration
  applies to them. They are weeks, not months.
- Phase 3 is a different kind of work and its cost is the witness loop, which
  has never been measured here. **Measure it**: take one area outside the slice
  through Phase 3 end to end, time it, and multiply by 74. That single
  measurement is worth more than any estimate in this document.
- Phase 4 is Phase 3 plus one translation job.

The mitigation for a project that might not finish is not a better estimate. It
is that Phases 0, 1 and 2 each leave the slice better than they found it, and
Phase 3 is interruptible at any area boundary with everything before it still
playable.

---

## What stays out

Tag Mode, local co-op and DLC quests, by the decision above. Save compatibility
with the original and frame-exact timing remain out, as in the slice.
