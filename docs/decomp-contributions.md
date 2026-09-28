# What to contribute to the decomp, in C++

A plan, not code. The decompilation project (`~/Projects/dqix-decomp`, upstream
`DQIX/dqix-decomp`, our fork `Moss255/dqix-decomp`) has asked for **functions**,
not only symbol names. This file says which functions minstrel's work has
already read well enough to write, what shape each should take in C++, and
what is still missing before it can be matched. Minstrel comes first; this is
here so the decomp work can be picked up without re-reading the disassembly.

Written 27 September 2026. Addresses are the USA release's (`YDQE`).

**Deferred, 28 September 2026: minstrel is finished first.** Parity with the
game's own code and the pull requests to the decomp come after. Until then this
file is where a function read while building minstrel is written down, so the
contribution can be picked up later without reading the disassembly again. Add
it to "Read since", at the end, as it is read. A finding about a *file* goes in
`upstream-findings.md` and the package's `FORMAT.md` instead, as before.

## What the maintainers have asked for

From their review of our pull requests #18 and #39:

- **C++, not C.** A function that works on an object is a member function of
  it: `CollisionMesh::Initialize(void*, const void*)`, not
  `InitCollisionMesh(CollisionMesh*, …)`. `symbols.txt` holds the **mangled**
  name, which `tools/mangle.py <file.cpp>` produces with the project's own
  compiler.
- **Fixed-point types where they are fixed point**: `fix32_t`, `Vector3i` /
  `Vector3fix` rather than bare `int` arrays.
- **Only what can be named for its purpose.** Small accessors whose meaning is
  unknown are not wanted yet. Purpose is best confirmed in an emulator by
  hand, so that is work for Jack, not Claude.
- **Reference findings** (tables, which functions use them) are welcome as a
  wiki page or an issue. The wiki pages are up: Character-Colours,
  Mini-Medals, Given-Names, Triggers (operation 145) and Battle-Resolution
  ("Sharing the experience").
- **The rules for merging** (`CONTRIBUTING.md`): the build must match byte for
  byte (`ninja`); one logical change per pull request; a file is marked
  `complete` in `delinks.txt` only when every function in its range matches;
  both checklist boxes ticked. A near-match goes to decomp.me and the
  Discord thread, not a pull request.
- **Both releases build.** Sources are compiled for `usa` and `jpn`; a callee
  whose address differs is remapped under `#if defined(jpn)` (see
  `src/Graphics/AtmosphericEffect.cpp`). Every function below still needs its
  JPN address found before it goes in.

## Checked against the US ROM

- `dqix_usa.nds` has the SHA-1 the decomp records (`c7c3014c…6278`), and is
  the same file as `extract/baserom_dqix_usa.nds`. Every disassembly used here
  came from that extract.
- The data behind each finding is **byte for byte the same** in the US and
  European releases: `data/chara/palette.bin` and all 1,737 files under
  `data/chara`, `keyboard_cm.bin` and `keyboard_cs.bin`, `expadj.nat`,
  `str_cm`, `str_mdl` and `str_bres`, and all 76 trigger files. The medal tables
  are at US overlay 4 `0x1c918` / `0x1c930`, with the same items.
- **One correction came out of the check.** Given names are 101 a sex, not the
  "201" the wiki draft had. Fixed before the push.
- Upstream has not named any of the addresses below, so the local renames do
  not conflict.

## Where things stand locally

The 25 symbol renames (`CharaColours_*`, `CharaParts_GetPartNumbers`,
`MiniMedals_*`, `charaColoursOpcodes`, `charaColourTables`,
`miniMedalExchanges`, `miniMedalMilestones`) are **uncommitted** on the branch
`boot-menu-and-game-modes`. They are placeholders. When each group below is
written, its renames move to a new branch off `upstream/main`, as the mangled
names of the C++ that replaces them.

---

## 1. The character colour tables — ARM9, first

**Why first:** it is a use of the game's script system (`Script::Execute` on a
data file with an opcode table), which is the README's own suggested starting
point, next to `src/World/LootableContainer.cpp` and
`src/Graphics/AtmosphericEffect.cpp`. It is small, and every callee is
already named. The README also says matching the globals is optional for this
kind of work: `.text` is what matters.

**File:** `src/Graphics/CharaColours.cpp`, `include/Graphics/CharaColours.h`.
`.text` from `0x02099ac4` to `0x02099ef4`. The function before it
(`0x02099a68`) is an unrelated lookup over 16-byte records, and the one after
(`0x02099ef4`) has not been read.

**The data**, one block of `0x12c` bytes at `0x02109928` (`.bss`). The loader
clears exactly `0x12c` bytes, and the tables fill it exactly:

```
struct CharaColourTables {          // 0x02109928, size 0x12c
    u16 brows[10][2];               // +0x000  tag 0x64, one pair per hair colour
    u16 skin2[8][2];                // +0x028  tag 0x65
    u16 skin4[8][4];                // +0x048  tag 0x66
    u16 skin8[8][8];                // +0x088  tag 0x67
    u16 eyes[8][2];                 // +0x108  tag 0x68
    u16 unknown_0x128;              // +0x128  tag 0x69, reader not established
};                                  // padded to 0x12c
```

**The functions:**

| address | size | what | proposed C++ |
|---|---|---|---|
| `0x02099ac4` … `0x02099c34` | `0x5c` each | the five table handlers: loop rows × each, `params[i].ToInt()` into a halfword, return 1 | `static int CharaColourScript_SetBrows(Script::Parameter* params, int numParams)` and likewise `SetSkin2`, `SetSkin4`, `SetSkin8`, `SetEyes`, in the `EffectScript_*` style |
| `0x02099c90` | `0x1c` | tag `0x69`: one `ToInt()` stored at `+0x128`. The compiler addresses it from `0x02109a28` + `0x28`, which the matching will have to reproduce | `static int CharaColourScript_SetUnknown69(Script::Parameter*, int)` |
| `0x020f1574` (`.data`) | 7 entries | `{tag, handler}` × 6, then `{0, 0}` | `static Script::OpcodeLookupEntry s_charaColourOpcodes[]` |
| `0x02099cb8` | `0x7c` | the loader, called once, from `main` at `0x02000eac` | `void CharaColourTables::Load()` — see below |
| `0x02099d34` | `0xe4` | writes a skin ramp of 2, 4 or 8 shades at a byte offset of every 32-byte palette in a model's TEX0 | `CharaColourTables::ApplySkin(model, int kind, int tone, int offset)` |
| `0x02099e18` | `0xdc` | writes brows, eyes and skin into the start of the face's palette, through two little tables of offsets `{4, 8, 16}` (`0x020e8e20`) and lengths `{4, 4, 16}` (`0x020e8e14`) | `CharaColourTables::ApplyFace(model, int skin, int hairColour, int eyeColour)` |

**The loader, as the disassembly has it:**

```
memset(this, 0, 0x12c);
BackgroundLoader::AddLockGlobal();
data = LoadFileIntoMemory("data/chara/palette.bin", <0x0211e33c>, &size);
if (data) {
    Script script;                 // on the stack, 0x430 bytes
    script.Initialize();
    script.SetOpcodeLookup(s_charaColourOpcodes);
    script.Load(data, size);
    script.Execute();
}
BackgroundLoader::RemoveLockGlobal();
```

**Before writing:**

- Confirm `main` passes `0x02109928` in `fp`, which makes `Load` a member.
- Identify what `0x0211e33c` is (an allocator?).
- Find the model type the two apply functions take. It is the object whose
  TEX0 they walk; `NSBXX.h` probably has it.

**Later, a second pull request.** These are larger, and depend on the
character record and the equipment records, whose structs upstream does not
have yet:

- `0x020730e0` (`0x160`): recolours a character part by part, index 0–7.
- `0x02072afc` (`0x1a0`): the part numbers from the record's `+0x488` block.
- `0x020de2a4` (`0x78`): an item's shade count, from bits 15–18 or 23–26 by
  sex.

## 2. The experience share and `expadj.nat` — overlay 23

**Why:** the purpose of every function is read, and the same arithmetic is now
running in minstrel (`packages/sim/src/battle/experience.ts`, held to an
oracle). It is float code, so the matching is harder.

**File:** `src/Combat/Overlay_23/ExperienceShare.cpp`, and the table class in
its own file, `src/Combat/Overlay_23/ExpAdjustTable.cpp`, `.text`
`0x021f52a0`–`0x021f5598`.

**The table object**, at `[0x021ffefc] + 0xf4`. Its fields come from how
the functions use them:

```
struct ExpAdjustBand { u32 bound : 26; u32 add : 6; };   // bound 0 = no bound

class ExpAdjustTable {
    u32 header_;          // +0x00  bits 0-11 band count, 12-30 tail size, 31 loaded
    ExpAdjustBand* bands_;// +0x04
    void* tail_;          // +0x08  not established
    s16 state_;           // +0x0c  0 idle, 1 queue, 2 wait, 3 copy
    int taskId_;          // +0x10  BackgroundLoader task, -1 none
    SafeAllocator* alloc_;// +0x14
};
```

| address | size | what | proposed member |
|---|---|---|---|
| `0x021f52a0` | `0x28` | clears the first 12 bytes, sets `taskId_ = -1`, then `Release()` | constructor |
| `0x021f52c8` | `0x30` | `Release()`, clear, `-1`, `Release()` | `Reset()` |
| `0x021f52f8` | `0x48` | reset, keep the allocator, `state_ = 1`, `Poll()` | `StartLoad(SafeAllocator*)` |
| `0x021f5340` | `0xd0` | 1: `QueueLoadFile("data/bin/expadj.nat")`; 2: `GetTaskStatus`; 3: `GetLoadedFileByID`, `CopyIn`, `Release`. Returns whether done | `bool Poll()` |
| `0x021f5410` | `0x38` | removes the task if any; zeroes state and allocator | `Release()` |
| `0x021f5448` | `0xdc` | copies the header, allocates and copies the bands and the tail, sets bit 31 | `bool CopyIn(SafeAllocator*, const void*, u32)` |
| `0x021f5524` | `0x10` | `(header_ & 0xfff) * 4` | `BandsSize()` |
| `0x021f5534` | `0x44` | the first band whose bound the total does not pass (signed), or an unbounded one; else null | `const ExpAdjustBand* Find(int total)` |
| `0x021f5578` | `0x20` | `Find(total)`'s `add`, or the default | `int GetAdd(int total, int fallback)` |

**The share**, `0x021f4098` (`0x3a0`): `int (battle results*, int member, u32
totalOverride)`. The formula, step by step, is on the wiki's
Battle-Resolution page. Its `this` is the overlay 23 results object, with the
party record at `+0x2a0`, the state at `+0x29c` and the awards at `+0x5758`.
**That class has no name upstream yet**, and needs one first. Its callers are
the victory routine `0x021edf54` (at `0x021ee140`) and the multiplayer path
(`0x021ee400`).

**Before writing:**

- Name the results object and the handful of its fields used here.
- Confirm by hand that the counter at `[+0x19c] + 8` counts rounds and skips
  one who is down. That is INFERRED now, and the maintainers want it
  confirmed.

## 3. Cap'n Max's mini medals — overlay 4, last

The purpose of each function is read (wiki: Mini-Medals), but the object they
belong to is not. They take a service object whose class is unknown, and
they call the bag and item-giving code, which upstream has not decompiled.

| address | size | placeholder name now |
|---|---|---|
| `0x0216794c` | `0xc0` | `MiniMedals_GetProgress` |
| `0x02167a0c` | `0x60` | `MiniMedals_HandOver` |
| `0x02167a6c` | `0x70` | `MiniMedals_GiveItem` |
| `0x02167adc` | `0x9c` | `MiniMedals_HandOverTowardsMilestone` |
| `0x02167b78` | `0x18c` | `MiniMedals_SetMessageValues` |
| `0x02167d90` | `0x98` | `MiniMedals_Start` |
| `0x021680cc` | `0x178` | `MiniMedals_BuildExchangeList` |
| `0x02168318` | `0xb4` | `MiniMedals_ChooseExchange` |
| `0x02168400` | `0x8c` | `MiniMedals_ConfirmExchange` |
| `0x0216fff8`, `0x02170010` | data | `struct MedalReward { u16 medals; u16 item; }` × 6 and × 10 |

**Before writing:** name the service class (what `r0` is on entry), and the
progress record behind `+0xf74`. Until then, this group is a reference, not a
contribution: the wiki page and the table symbols.

---

## Order, and what needs Jack

1. **Character colours**, `.text` only. There is nothing to confirm in the
   emulator beyond what the code already shows.
2. **`ExpAdjustTable`**, then the share once its owner has a name. Needs one
   emulator check: the rounds counter.
3. **Mini medals**, once the service class is known.

For each: find the JPN addresses, write the source, match with `ninja`, get
the mangled names from `tools/mangle.py`, rename in both `symbols.txt` files,
and open one pull request per group from a branch off `upstream/main`.

---

## Read since — a backlog, kept while minstrel is built

One entry for each function or group, added when it is read rather than at the end.
Enough to write the C++ from later without going back to the disassembly:

- **address, size, release**: USA unless it says otherwise, and the JPN address if it
  is already known;
- **what it does**, as far as the code shows it, and anything **INFERRED** kept
  separate;
- **where minstrel translates it**: file and function, and the test that holds
  it;
- **what it belongs to**: the object `r0` is, if it is known, and the callers;
- **what is open**: the emulator checks and any name upstream is missing.

The local symbol renames stay placeholders in `~/Projects/dqix-decomp`, as
the three groups above are.

### 4. The trigger interpreter and the story threads — ARM9, 28 September 2026

Read while measuring the story (`docs/story-walk.md`); the findings are in
`packages/game-formats/FORMAT.md`, "Triggers, read from the game's code".
**Where minstrel translates it**: `apps/game/src/story.ts` (the threads and
`threadOf`), `packages/game-formats/src/story.ts` (the words), held by
`apps/game/test/story-walk.test.ts`.

| address | size | what it does | proposed name |
|---|---|---|---|
| `0x0206461c` | `0xe8` | builds `data/scenario/trigger%s.bin` from the area's letters, loads it, hands it to `0x02064574` with the map id and the current stage | `TriggerTable::Load(const Zone*)`? |
| `0x02064574` | `0xa8` | stores the allocator, map and stage at `+0x480`–`+0x48c`, runs the file as a `Script` (table `0x020f05bc`), then takes the kind-20 records (`0x020649b0(this, 0x14, …)`) to `0x0206f81c` | `TriggerTable::Parse` |
| `0x0205f9cc` | `0x100` | tag 1: keeps a record for the current map whose span covers the current stage (`major × 1000 + minor`), allocates `0x18` bytes, parses its words (`0x0205ec70`), adds it (`0x020643fc`) | `TriggerScript_Record` |
| `0x0205f9bc`, `0x0205f9c4` | `0x8` | tags `0x64`, `0x65`: return 1 | — |
| `0x0205ec34` | `0xc` | returns the trigger object, `0x02108844` | `TriggerTable::GetInstance` |
| `0x02064b98` | `0x184` | picks the live story thread from the map id (five ranges, above) and copies its stage into `GameState` | `StoryThreads::Enter(u16 map)` |
| `0x0206df14` | `0x58` | copies the live thread's stage into `GameState` | `StoryThreads::Restore` |
| `0x02010774`, `0x020107a8`, `0x020107dc` | `0x28` | `GameState` setters for stage major, minor and step (`+0x5cb0`, `+0x5cb4`, `+0x5cb8`), each writing the live thread's byte too | `GameState::SetStoryMajor`, `SetStoryMinor`, `SetStoryStep` |
| `0x0201079c`, `0x020107d0`, `0x02010804` | `0xc` | their getters | `GameState::GetStoryMajor` … |
| `0x02061c04` | `0x27dc` | the action interpreter: a switch on `op − 100`, 100 to 233 | `TriggerTable::RunAction` |
| `0x02064b24`, `0x02064530` | `0x74`, `0x44` | run a record's actions, the first with a fresh stage queue at `+0x30` | `TriggerTable::RunActions` |
| `0x0206445c` | `0x34` | append a record to the stage queue (list through `+0x18`) | `QueueStageMove` |
| `0x0206df6c` | `0x44` | set or clear bit *n* of a byte array | `SetBit` |
| `0x0206e080`, `0x0206e0d0` | `0x50`, `0x30` | clear a thread's banks on a new major (all four) or a new minor (`+0x10`, `+0x14`) | `StoryThreads::ClearMajor`, `ClearMinor` |
| `0x020716a4` | `0x16c` | tag `0x66` of the event lists (`0x020f0ba0`): for the chosen event, sets the stage, step and flags in the three banks — a debug start, probably, since `evlist6_d.bin` and `evlist_lv5_d.bin` sit beside it | — |

**Open**: what applies the stage queue, and when; which operations use the
banks at `+0x08` and `+0x14`; the JPN addresses.
