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
| `0x0205ec70` | `0xd4c` | the record parser: below 100 or from 500 a condition, otherwise an action; each operation takes a fixed number of values after it, stored as halfword pairs (the table is `PARAMS` in `story.ts`) | `TriggerRecord::Parse` |
| `0x0205faf4` | `0x20e4` | the conditions: a switch on the operation, 0 to 99, and more from 500. The composites 52 to 61 call it again for each part | `TriggerTable::TestCondition` |
| `0x02064490` | `0xa0` | the first record of a kind whose conditions all hold (records grouped by kind through `+0x14`, within a kind through `+0x10`) | `TriggerTable::Find(int kind, Context*)` |
| `0x020649b0` | `0x44` | find, then run every action of the record found, with a fresh queue | `TriggerTable::Run(int kind, Context*)` |
| `0x0206f81c` | `0xb5c` | applies the queue: `132`, `148`, `214` through `0x020703c8`; `119` starts the event; `133`, `138` and `226` change map, `138` and `226` each setting one flag of the move | `TriggerTable::ApplyQueue` |
| `0x020703c8` | `0x134` | sets a thread's stage, **only forward** (`major × 10000 + minor × 100 + step`), clearing the banks on a new major or minor; then copies the live thread back into `GameState` | `StoryThreads::MoveTo(int thread, int major, int minor, int step)` |
| `0x0206474c` | `0xf0` | the composites' test of a quest: may be asked of (`0x0206e31c`), and by its mode −1 and 5 at state 0, 0 at 2, 1 its first flag, 2 at 3, 3 at 1, 4 never (`0x0206e120`) | `Quests::Test` |
| `0x0202ae18`, `0x0202b7d8`, `0x0202c1a4` | small | a session object (`0x020fefec`), whether its first word is set, and a per-player byte: condition `23`, and the flag actions' sending over the link | — (multiplayer, INFERRED) |
| `ov017 0x0219ca88` | `0x310` | the field's per-frame checks: doorways, fades, transitions, and then kind 6 for the current map | `Field::CheckWatch`? |
| `ov017 0x0218cbd4` | `0x498` | the field's frame update, which reads the tick count and updates everything, `0x0219ca88` among it | `Field::Update` |

| `0x02062a94` (a case of `0x02061c04`) | — | action `143`: a turned box, its angle from degrees, a squared radius from width and **height**, onto the trigger object's list at `+0x494` (`0x02064af8`) | — |
| `0x020321e0` | `0xe0` | the turned-box test: refuse by squared radius, turn the point back by `RotationMatrixY(−angle)`, test against the corners (`0x02031118`, edges included) | `PointInTurnedBox` |
| `ov017 0x02198e30` | `0x140` | the field's test of the trigger areas: the first holding the Hero, kind 5 on leaving one and kind 2 on entering one, the last kept at `+0x491` | `Field::CheckTriggerAreas` |
| `ov017 0x0219814c` | `0x160` | the same for the map's own type-3 regions (the zone's list at `+0x6c`, by type through `0x0201e838`), the last kept on the Hero | `Field::CheckMapAreas` |
| `0x0201d530`, `0x0201d638` | `0x108`, `0x994` | the link table's (`.bmbl`) handlers for `0x73` (a region: type, centre, size, two angles, squared radius; added by `0x0201e710`) and `0x74` (what the region does, by its type; a type-3 region's number). Their table is at `0x020ef3d8`, tags `0x64` to `0x7e` | `MapLinks_Region`, `MapLinks_RegionAction` |
| `0x02094b9c` | `0x140` | a region's test: off if flag 8; the turned-box test when it has depth; the once-only flags | `MapRegion::Contains` |


### 5. Who stands where — ARM9 and overlay 17, 28 September 2026

Findings in `packages/game-formats/FORMAT.md`, "Who stands where, read from
the game's code". **Where minstrel translates it**: `castAtPoint` and
`readPlaceRecords` in `packages/game-formats/src/npc.ts`, held by
`packages/game-formats/test/cast.test.ts` and the walk.

| address | size | what it does | proposed name |
|---|---|---|---|
| `ov017 0x021a2c14` | `0x38c` | the field's cast loader: opens `data/scenario/%s.npc`, runs each `place.bin` through `0x0206da80` and each `npc.bin` through `0x02064e2c` | `Field::LoadCast` |
| `0x0206da80` | `0xa0` | sets the context (`0x02108cec`: step, minor, major, map, output) and runs `place.bin` as a `Script` with the table at `0x020f0994` | `CastScript::Run` |
| `0x0206c010` | `0xe8` | tag 3, a block: this map only; place, or take away with no place | `CastScript_Block` |
| `0x0206c2c0` | `0x228` | tag 5, a span: the weighed span test, the time of day, another map takes away | `CastScript_Span` |
| `0x0206d4e0` | `0x254` | tag 17: condition pairs on the game-wide bank, then as a span, marked first in order | `CastScript_WhileFlags` |
| `0x0206cbcc` | `0x38c` | tag 14: by the four states of an id (`0x0206e120`), with its own bookkeeping in the context | `CastScript_ByState` |
| `0x0206db48` | `0x220` | adds a placement to its character's ordered chain; the head stands. Six classes: `+0xa` bit `0x04` (tag 17), bit `0x40`, `+0x46` set, a minor with no "to" minor (a span ending at sub-stage 0, or tag 4), another span, a block; class 4 and 1 by their start, the rest by file order | `CastList::Add` |
| `0x0206dd68` | `0x3c` | takes a character's standing placement away | `CastList::Remove` |
| `0x0206bf2c` | `0xe4` | a placement's initialiser (`0x78` bytes; `+0x46` = −1) | `CastPlacement::CastPlacement` |
| `0x0206eb98` | `0x30` | a game-wide flag by number: from `0x400`, displaced by 1,786 bits — `603`'s rule | `TriggerTable::TestFlagById` |

| `0x0206c0f8` | `0x1c8` | tag 4: a placement at one point — stage, sub-stage and step all the context's — then time, map, character, where, as tag 5's | `CastScript_AtPoint` |
| `0x0206c4e8` | `0x12c` | tag 6: a talk box — character, four floats (x and z at most, then at least, ×4096), a label — appended to the character's first placement in this map (`+0x40`, nodes of `0x18`) | `CastScript_TalkBox` |
| `0x0206c614` | `0xe0` | tag 7: four floats onto the placement (`+0x24`–`+0x30`), mode byte `+0x1f` = 7 — a wander box, perhaps | `CastScript_Area`? |
| `0x0206db20` | `0x28` | a character's entry in the cast list by id (`+0x68` links) | `CastList::Find` |

**Open**: which operations use the banks at `+0x08` and `+0x14`; which kind
each of the other lookups asks for (overlays 1 to 4 and 17); tags 4, 8, 11,
14, 15 and 18 to 22 of `place.bin`; the JPN addresses.

### 6. How a talk runs — overlay 17 and ARM9, 28 September 2026

Findings in `packages/game-formats/FORMAT.md`, "How a talk runs" and "A talk
file is a script", and its conditions table. **Where minstrel translates
it**: `pickLine`, `lineFor` and `afterFor` in `apps/game/src/talk.ts`, held
by `apps/game/test/talk.test.ts`, `story-talk.test.ts`, `story.test.ts` and
the walk; the conditions in `flagsHold` (`packages/game-formats/src/story.ts`).

| address | size | what it does | proposed name |
|---|---|---|---|
| `ov017 0x021a476c` | `0x584` | the field's talk input: clears the label (`0x021d83a8`), picks the target (`0x021a4e88`), and on to `0x021a4cf0` | `Field::BeginTalk` |
| `ov017 0x021a4e88` | `0x31c` | the talk target: of 32 characters, one whose talk box holds the Hero (its label kept), or one near — within `0x1800` across, `0x1c00` away, a spot (type 1) never so — the most nearly faced under `0x3244` | `Field::PickTalkTarget` |
| `ov017 0x021a4cf0` | `0xe0` | runs kind 0 with who at `+0` and the label at `+0x14`; if none ran, starts the talk (`0x021b8d1c`, `+0x114` who, `+0x124` the label) | `Field::TalkTo` |
| `ov017 0x021b8e8c` | `0xa6c` | the talk's machine, nine states: loads `data/scenario/%s%c0.gp2` and `%03d_<LG>.bin`, runs the line picker, counts the talk, shows the window, and once it closes runs kind 1 with who and the label (two places) | `TalkWindow::Update` |
| `ov017 0x0218d2c4` | `0x2c` | a major stage's chapter letter, `ABCDEFGHIJSTKLMNOPQ` from 1 (`0x021d616c`) | `ChapterLetter` |
| `ov017 0x021ba810` | `0xd0` | the line picker: context at `0x021d8438` (minor, label, the two counts, who), runs the talk file as a `Script` with the table at `0x021d7c58`; the line kept is `+0x10`, else `+0x14` | `TalkScript::PickLine` |
| `ov017 0x021b9d00`, `0x021b9e30`, `0x021ba124`, `0x021ba280`, `0x021ba3dc`, `0x021ba524` | `0x130`–`0x2f4` | the talk file's tags 1 to 6: a line by sub-stage range and time; a quest's line by its state; 3 and 4 in a game played together; 5 and 6 as 1 and 2 while the Hero's value is 0 or below | `TalkScript_Line`, `_QuestLine`, … |
| `ov017 0x021b9bcc` | `0x134` | whether a line's label holds for the one asked: same group of 80, then by place — counts, exact, or the step, highest | `TalkScript::LabelHolds` |
| `0x0206ec1c`, `0x0206ec64`, `0x0206ece8` | small | a character's talk count (a nibble of `0x80` bytes): read, add one to 15, clear | `TalkCounts::Get`, `::Add`, `::Clear` |
| `0x0206ebc8`, `0x0206ebdc`, `0x0206ebf4` | small | clear the area's counts, the map's, both | `TalkCounts::Clear…` |
| `ov017 0x0219d250` | `0x874` | on a new map: clears the map's counts, and the area's when three bytes of the maps' records (`GameState` `+0x468`, `0x02099950`) differ | `Field::EnterMap` |
| `0x0206445c` | `0x34` | queues an action's entry (`118`, `119`, `128`, `155`) at the context's `+0x30` | `TriggerQueue::Push` |
| `0x0206e120`, `0x0206e164`, `0x0206e260`, `0x0206e2dc`, `0x0206e31c` | small | a quest's two bits of state at the trigger object's `+0x2cc`, 204 quests; set them; its two flags; whether it may be asked of (not below 174 in some session state) | `Quests::State`, `::SetState`, … |
| `0x020457e0` | `0x8` | the text system's last answer (`+0x954`); `0x0204500c` sets it to 0 as a window opens | `TextWindow::Answer` |
| cases of `0x0205faf4` | — | conditions 11, 16, 18, 19, 20, 26, 27, 36, 41, 62, 63, 86, 88, 89 — FORMAT.md's table | — |
| cases of `0x02061c04` | — | actions `106` (clear a character's counts), `118`/`119`/`128` (queued), `129` (a quest to state 1), `155` (runs `104` with its value, then queued) | — |
| case `0x0206fa98` of `0x0206f81c` | — | queue `118`: the character by id, `+0x114`, the label at `+0x124`, start the talk | — |

| `ov017 0x021bbc10` | `0x3b4` | a scene's start: picks the event list by the scene's number (`eventlist6` below 21,000, `eventlist_lv5` below 40,000, `evl_quest` above) and queues it | `EventTask::LoadList` |
| `ov017 0x021bbfc4` | `0x71c` | the next state: the scene's entry (`0x02071488`) into the context at `+0xc`; its "played" flag (`910 +` its index); and **a map other than the Hero's** fills the map-change request with it and the scene and ends the task | `EventTask::Begin` |
| `0x02071488`, `0x02071208` | `0xec`, `0x280` | runs an event list as a `Script` (table `0x020f0b80`, opcode 102) and copies the matching scene's record: map `+0xe`, event `+0xa`, flags `+0x44`, … | `EventList::Find`, `EventList_Scene` |
| `ov001 0x02161f80` | `0x13c` | script function `807`: a map, a place ×4096, a facing, and an event or −1, into the map-change request (`0x0200fd0c`, `0x02070378`, committed by `0x0200fcfc`); two map ids set `+0x69` | `EventFn_ChangeMapAt` |
| `ov001 0x02163ccc` | `0xfc` | script function `547`: the battle transition — its object, the `eventbattle.bin` record for the music at `+0xfe`, a task pushed; the fight itself is a record's `120` | `EventFn_BattleTransition` |
| case `220` of `0x0205ec70`, `0x020aee04`, `0x020ae4ec` | —, `0xc4`, `0x50` | action `220`: parsed as two bytes (which, on); in map 7402 only, turns the map's pieces `0x4e`–`0x58` (which 1) or `0x37`–`0x4b` (which 0) to *on* through `0x020ae694`, and sets game-wide flag `830 + 71` or `830 + 72` to it — the block conditions `88`/`89` test. `0x020ae560` on reads the same block for the map's pieces | `Quarantomb_SetSwitch`, `TriggerTable::SetFlagFrom830` |
| `0x02062d80`, `0x02062dfc` (cases `149`, `150` of `0x02061c04`) | — | a map piece's state: where the piece is in the map (`0x02019508`) set it (`0x02013380`); otherwise a bit of the thread bank at `+0x08`/`+0x14` (`0x0206ea8c`) — `149` on, `150` off. Not built | `TriggerAction_PieceOn/Off` |

**Open**: what `func_ov017_021a4700` measures (the pick's angle) and whether
`0x3244` is π; what `0x0202c540` is (tags 5 and 6); which file the maps'
records at `GameState` `+0x468` come from; what the quest system does to
states 2 and 3; the JPN addresses.

### 7. Party tricks, the thread record and the scene's start — ARM9 and overlay 17, 28 September 2026

Read for the story walk's last stretch, FORMAT.md "How a record runs".

| address | size | what it does | a name |
|---|---|---|---|
| `0x020649b0`, its thunks `0x020649f4`, `0x02064a08`, `0x02064a24` | `0x44`, `0x14`, `0x1c`, `0x1c` | the only whole-record runner: the first holding record of a kind, every action; the thunks fix the kind to 3, 15, 16. Every caller listed in FORMAT.md, "Who asks for which kind" | `Triggers::RunFirst`, `::RunEntry`, `::RunWon`, `::RunLost` |
| `0x02064b24` | `0x74` | the first holding record of a kind, **one operation of it** — map loading and doorways call it with `0x6c`, 108 | `Triggers::RunFirstOnly` |
| `0x02064490` | `0xa0` | the first record of a kind (groups by the kind byte at `+6`) whose conditions all hold (`0x0205faf4`) | `Triggers::FirstHolding` |
| `0x02053634` | `0x618` | a party member's field object: plays a list of up to four tricks (`+0x178`, count `+0x17c`, `0x0205308c` loads `data/chara/sg%02d%c.chr`), and when done, if the leader's, asks kind 19 with them at the context's `+0x2a` | `PartyMemberObject::Update` |
| `0x0205308c` | `0x164` | loads trick *n*'s archive, and for 12 to 16 and 30 its sprite `sg%02d_<LG>.spr` | `PartyMemberObject::LoadTrick` |
| `0x02052e2c` | `0x18` | the record whose bit says man or woman (`+0x14`) | — |
| `0x02010890`, `0x0200ff94` | `0x48`, `0x2c` | the filled party slots of four, and whether one is | `GameState::PartySlots`, `::SlotFilled` |
| cases of `0x0205faf4` | — | conditions 13, 14, 15 (party size), 32/33 (tricks, a word of four bytes each), 81 (no session) | — |
| `0x0206e348`, `0x0206e384`, `0x0206e3e8` | `0x3c`, `0x50`, `0x3c` | teach trick *n* (a bit from `0xbf1` + its place, places below 17 refused), the learnt mask, trick to place by the table `0x020e87c0` | `Tricks::Learn`, `::LearntMask`, `::PlaceOf` |
| cases of `0x02061c04` | — | actions `102` (mark, thread record `+3`), `104` (flag, `+0x10`), `110` (`SetTimeOfDay`), `142` (teach a trick), `143` (area, at `0x02062a94`), `197` (a counter, `0x02010810`, with a range table), `216` (`+0x27b4` of the field state, `0x02063eac`), `225` (`0x020961b0`) | — |
| `0x0206df14` | `0x58` | the live thread's stage from its 28-byte record into `GameState` (`0x02010774`, `0x020107a8`, `0x020107dc`) | `Story::LoadStage` |
| `0x0206df6c`, `0x0206dfb0` | `0x44`, `0x38` | set, test a raw bit of a bank — the game-wide bank at `+0x8c`, the thread records | `Bits::Set`, `::Test` |
| `0x0206dfe8` | `0x98` | clear a range of bits: at `0x02071740`, 0–511 and 910–1909, a story reset | `Bits::ClearRange` |
| case `0x0206fca0` of `0x0206f81c` | — | queue `124`: the object by id (`0x0203df78`), bit `0x8000` of its first word — skipped by every lookup (`0x0203df78`, `0x0203dce4`) | — |
| `0x0203df78`, `0x0203dce4` | `0x64`, — | the map's objects by id, by index; both skip `0x8000` | `Objects::ById`, `::At` |
| `ov017 0x021bbfc4`, at `0x021bc424` | — | the scene's start raises the live thread's stage to the entry's (`+0xc`, `+0xd`) when behind, major ≤ 19 | `EventTask::RaiseStage` |
| `ov017 0x021a8614`, `0x021a86d0`, `0x021a8670`, `0x021a932c`, `0x021a933c` | `0x5c`, `0xb78`, `0x60`, `0x10`, `0xb4` | **the Starflight Express's task**: start (mode at `+0x14`, four stops at `+0x18`), its update (load `str_ark`, the list, the stop it is at `+0xc` from the field state `+0x27b4`, the stop chosen `+0x10`, a ride's two scenes — FORMAT.md), reset, set mode, say a conductor's line | `StarflightExpress::Start`, `::Update`, `::Reset`, `::SetMode`, `::Say` |
| `ov017 0x021d1c2c` | `0x58` | the Express is at a stop: field state `+0x27b4`, and sent to the others in a session | `StarflightExpress::SetStop` |
| case `0x02063e80` of `0x02061c04` | — | action `215`: starts the Express | — |
| `0x0202c508`, `0x0202c540`, `0x0202b7d8` | small | in charge (alone, or the host), a guest, in a session | `Session::InCharge`, `::IsGuest`, `::Active` |
| `0x020115f4`, `0x020115e8`, `0x02011600` | small | the pending scene at `GameState` `+0x63d8`: set, get, clear — a parked scene kept over a map change (`ov017 0x021bca4c`, played at `0x0218c5fc`) | `GameState::PendingEvent` |
| `ov017 0x0219f3a0`, `0x0219fd80` | — | the field asks the map's entry record, kind 3, whole on arriving | — |
| `ov017 0x021b7c3c`, `0x021b7c54` | — | the end of a set battle asks kind 16 (lost) or 15 (won) | — |
| ov001 `0x02163308` region, `0x02155704`, `0x021551f4` | — | script functions that test and set raw bits; one asks kind 10 (`0x021551dc`); `538` chains (a scene's `+0x11c`) | — |
| `0x02064574` | — | trigger-file load: runs the file as a `Script`, then the first holding kind-20 record whole (`0x020645f8`) | `Triggers::Load` |

**Open**: what plays `ev29150` (16.1, map 20034) — the Express's task does
not; what `225` does and what `func_ov017_021a65c4` does at a field stop; what `141` does; the trick defaults in the four places
of the B Button; the kinds 9, 10, 12, 18, 22–27, 29, 30's contexts.

### 8. Quests — ARM9 and overlays 17 and 23, 28 September 2026

Read for the quest system; FORMAT.md, "Quests".

| address | size | what it does | a name |
|---|---|---|---|
| `0x0206e120`, `0x0206e164`, `0x0206e100` | `0x44`, `0xb4`, `0x20` | a quest's state (two bits of a nibble at `+0x2cc`, 204 quests), set it, clear it (3) | `Quests::State`, `::SetState`, `::Clear` |
| `0x0206e218`, `0x0206e260` | `0x48`, `0x40` | on offer with the first flag; the first flag | `Quests::OfferFlagged`, `::FirstFlag` |
| `0x0206e2a0`, `0x0206e2dc` | `0x3c`, `0x40` | set, test the second flag — delivered | `Quests::Deliver`, `::Delivered` |
| `0x0206e31c` | `0x2c` | may use a quest: not a session's guest for quests from 174 | `Quests::MayUse` |
| `0x0206474c` | `0xf0` | a quest's test by mode, the composites' | `Quests::Test` |
| `0x02094d6c` | `0xc` | the quest log | `QuestLog::Get` |
| `0x02095578`, `0x0209562c` | `0xb4`, `0x8c` | load `questorder3` for a map as a script (table `0x020f1444`) | `QuestGivers::Load` |
| `0x02094d88` | `0x25c` | the tag-`0x66` opcode: a giver's node (quest, bits, character, stage, conditions by `0x0205ec70`) | `QuestGivers::Record` |
| `0x02095924`, `0x02095ae0` | `0x1bc`, `0x50` | **the offer**, from the talk (ov017 `0x021a4d40`); at 0 or 1 | `QuestGivers::Offer`, `::Offerable` |
| `0x020961b0`, `0x020962f4` | `0x144`, — | accept into the log, eight at most; taken | `QuestLog::Accept` |
| `0x02096134` | `0x58` | a quest's log entry | `QuestLog::Find` |
| `0x02095cfc` | `0x34` | clear: state 3, out of the log | `QuestLog::Clear` |
| cases of `0x02061c04` | — | actions 125, 126, 127, 129, 130, 131, 144, 176, 190, 191 | — |
| cases of `0x0205faf4` | — | conditions 20, 21, 22 and composites 53 to 61 | — |
| `ov023 0x021f5a74`, `ov017 0x021c3bc8` | — | deliver quests: from a list (the online service), from another console | — |

**Open**: `questcancel.bin`; the node bits 9, 11, 12 and 13; action 126's task and
the first-quest task (`0x020d9ae8`); the Quest List screen's own code
(`0x0208bfa0`) and which `questmsg` text it shows when.

### 9. The Starflight Express in flight — ARM9, overlays 2 and 17, 29 September 2026

Read for the flight; FORMAT.md, "The Starflight Express in flight".

| address | size | what it does | a name |
|---|---|---|---|
| `0x020ad61c` | `0x490` | the vehicle each frame: only in 10100; wrap; A, B and taps; the leader rides | `StarflightVehicle::Update` |
| `0x020adaac` | `0x2f8` | flying: height 10, the +Control Pad or touch, turn toward it | `StarflightVehicle::Fly` |
| `0x020adda4`, `0x020adfa8` | `0x204`, `0xcc` | the carriages follow; laid out in a line | `StarflightVehicle::Carriages`, `::LineUp` |
| `0x020ae398`, `0x020ae3f4` | `0x5c`, `0xd4` | descend, climb | `StarflightVehicle::Descend`, `::Climb` |
| `0x020aca88`, `0x020acecc` | `0x444`, `0x324` | load the models and shadows; enter the sky at the take-off place | `StarflightVehicle::Load`, `::Enter` |
| `0x020ae20c`, `0x020ae074` | `0x174`, `0x198` | draw the shadows; draw the train with its bob | `StarflightVehicle::Draw…` |
| `0x0204bef4`, `0x0204bedc` | `0x3c`, — | a sky region's field map; whether it may be landed on | `SkyRegion::Map`, `::Landable` |
| `0x02033fa0` | `0x8` | the vehicle's region record, `+0x114` | — |
| `ov017 0x02193dc4` | — | the region under the vehicle, by its collision | `Field::RegionUnder` |
| `ov017 0x021a72f4`, `0x021a7378` | —, `0x620` | the flight's menus: go inside, disembark, the Realm | `StarflightMenu::Start`, `::Update` |
| `ov017 0x021a6b9c`, `0x021a6c2c` | —, `0x654` | the whistle's summoning | `StarflightSummon` |
| `ov002 0x02157634` | — | the field item code's own cases by item: the whistle, `0x56f0` | `FieldItem::UseSpecial` |
| queue `0x0206fcc0`, `0x0206fd74` | — | `114`, `115`: give and take an item | — |

**Open**: the camera in flight; the landing places (category-11 objects);
whether the Express can coast to a stop; the whistle's route from action 252.

### 10. Where a battle is fought, who stands where, and the battle camera — ARM9, overlays 0, 17 and 25, 29 September 2026

Read for the battle stages; FORMAT.md, "Where a battle is fought".

| address | size | what it does | a name |
|---|---|---|---|
| `0x0204bd7c` | `0x44` | a collision record's battle stage, 30000 + 100a + 10b + c | `GroundRecord::BattleStage` |
| `0x02099950` | `0x3c` | a map-list entry by its id, or none | `MapList::FindById` |
| `0x02099a68` | `0x5c` | a map's kind of ground as a bit, 8 giving none | `MapList::GroundKindBit` |
| `0x020a3578` | `0x54` | a battle request made, stage 30116 | `BattleRequest::Init` |
| `ov017 0x021b848c` | `0x254` | the encounter hands the request its stage (`+0x02`) | `Field::BeginEncounter` |
| `ov017 0x021a26e8` | `0x50` | the ground kind under a field object | — |
| `ov000 0x02166880` | `0xf8` | switch to the stage: the set one's `+0x20`, 30116 for one not listed | `BattleScene::LoadStage` |
| `ov000 0x02164d74` | — | battle set-up: rows, then grids, then all to the grid | `BattleScene::Setup` |
| `ov000 0x021675a0`, `0x021676a8` | — | the party's row places, grid places | `Formation::PartyRow`, `::PartyGrid` |
| `ov000 0x021677fc`, `0x02167cd4` | — | the monsters' row places, grid places | `Formation::MonsterRow`, `::MonsterGrid` |
| `ov000 0x02167b5c` | — | the gap between monsters in a row | `Formation::MonsterGap` |
| `ov000 0x021681f8` | — | a monster's width factor, 0.7 for five kinds in company | — |
| `ov000 0x02167dd8`, `0x02167e6c`, `0x02167f10` | — | everyone to the grid; to the row; to the current slot | `Formation::ToGrid`, `::ToRow`, `::ToSlot` |
| `ov000 0x0216f74c` | — | a grid slot's place: 9 by 9, staggered | `Formation::SlotPlace` |
| `0x02049b20`–`0x02049c60` | — | a fighter's row and grid place and facing, `+0x13c` on | `Fighter::SetRowPlace`… |
| `0x02049e00`, `0x02049d6c`, `0x02048cf0` | — | put a fighter at its grid place, its row place, its slot | `Fighter::ToGrid`, `::ToRow`, `::ToSlot` |
| `ov000 0x021643d4`, `0x02168d08` | — | keep the party's field places, gather the fight's other roamers in; restore after | `BattleScene::KeepField`, `::RestoreField` |
| `0x0202e5c0`–`0x0202ecfc` | — | the camera: eye, look-at, orbit, yaw, distance, roll, frame | `Camera::Set…` |
| `0x0202e9a4` | — | `Camera_SetFov`, half-angle in degrees | — |
| `0x0202e0a4` | — | the camera each frame, through its frame when set | `Camera::Update` |
| `ov000 0x0216d234` | — | a camera frame on a fighter | `BattleCamera::FrameOn` |
| `ov000 0x0216d370`, `0x0216d464` | — | reset (field of view 15); each frame (yaw and distance drift) | `BattleCamera::Reset`, `::Update` |
| `ov000 0x0216d600` | — | frame a side: on the stage's z axis, fitted to the side's extent | `BattleCamera::FrameSide` |
| `ov000 0x0216d90c`, `0x0216da34`, `0x0216dbf0`, `0x0216de00`, `0x0216df00` | — | close-up, two-shot, group orbit, over the shoulder, actor | `BattleCamera::…` |
| `ov000 0x0216118c` | — | the opening: the wide side shot, eased in | `BattleCamera::Opening` |
| `ov025 0x021e3c80` | — | an action's camera command, kind 12, modes 0 to 15 | `ActionPlayer::Camera` |
| `ov025 0x021e6cf4` | `0x204` | an action's formation command, kind 79 | `ActionPlayer::Formation` |
| `ov000 0x02183b5c`, `ov025 0x021ef538` | — | the action script's opcodes: builders, and handlers by kind | `ActionOpcodes`, `ActionHandlers` |
| `ov000 0x0216f2b8` | — | the battle eye kept within 17 and under 5 | `BattleCamera::Limit` |
| `ov025 0x021dcf14`, `0x021dcc70` | — | a close-up on each one struck in turn; the list of them | `ActionPlayer::StruckCamera` |
| `ov000 0x021607d4` | — | the battle's states: load, set up, the loop, leave | `BattleScene::Update` |
| `LightingInfo::LoadFromScript`, `DrawBackgroundGradient` | — | already named: the `.bats` script and the gradient | — |
| `ov000 0x0216e3c4` | `0x2b4` | the victory's shot, from overlay 23's experience step only; its yaw always −0x999 (corrected 1 October: not the command camera) | `BattleCamera::Victory` |
| `ov023 0x021f03a0` | — | the victory's experience step: grid, the victory's shot, the experience line (corrected 1 October: overlay 23 is the results, not the menu) | `BattleResults::Experience` |
| `ov025 0x021db8d8` | — | an action begins: grid, chase shot | `ActionPlayer::Begin` |
| `0x02099f6c`, `0x02099ef4` | —, `0x68` | `wpnpos.bin`: load; tag 100 | `WeaponPlaces::Load`, `::Entry` |
| `0x02053e10` | — | a character's seven bone slots, by name | `Character::FindBoneSlots` |
| `ov017 0x021917f0` | `0x1d8` | hang a character's weapon by `wpnpos` | `Field::HangWeapon` |
| `0x020407b4`, `0x0203db34` | `0x10`, `0x10` | an object's position; its rotation | `Object3D::SetPosition`, `::SetRotation` |
| `0x02072c9c` | — | a character's motion set's name, `mp%02d%02d`, from body and weapon | `Character::MotionSetName` |
| `ov025 0x021e3178`, `0x021e3c3c` | — | an action script's skip, and its end | `ActionPlayer::SkipIf`, `::SkipEnd` |
| `ov025 0x021e6a08` | — | the step in | `ActionPlayer::StepIn` |
| `ov025 0x021e2ca4` | — | the lunge within a motion | `ActionPlayer::Lunge` |
| `ov025 0x021e4868` | — | wait for a motion to be so far through | `ActionPlayer::WaitMotion` |
| `ov000 0x0216e678`, `0x0216ea38` | — | the chase shot; its per-frame aim | `BattleCamera::Chase`, `::ChaseUpdate` |
| `Object3D::AdvanceAnimations_v1`, `GameState::CalculateDeltaTime`, `BCFGScript_Opcode_66` | — | already named: a motion's pace, its `.bcfg` speed every 17 ms | — |
| `0x02039f04`, `0x0203a48c` | — | the battle's numbers: load their sheets; raise one | `BattleNumbers::Load`, `::Raise` |
| `0x02039fec`, `0x0203a0b4`, `0x0203a5e8` | — | a number's frame, its drawing, its nudge clear of others | `BattleNumbers::Update`, `::Draw`, `::Separate` |
| `ov025 0x021e278c` | — | an effect's file by its number | `Effect::FileName` |
| `ov025 0x021e4a08`, `0x021e4a58`, `0x021e41a0` | — | action-script tags 29, 30, 21: load, name, play an effect | `ActionPlayer::LoadEffect`, `::NameEffect`, `::PlayEffect` |
| `ov000 0x02163440` | — | tag 116, the hit-stop | `BattleScene::HitStop` |
| `ov025 0x021e4168`, `0x021e40e4`, `0x021e6304` | — | tags 20, 18, 68: name an effect by path; preload a file; the reaction's flags | `ActionPlayer::NameEffectByPath`, `::Preload`, `::ReactionFlags` |
| `MAT.cpp`, `MAM.cpp`, `CreateTextureMatrix_v0_*` | — | already named: texture and material animation, and the texture matrix | — |

**Open**: what the chase shot's yaw is measured from; the reaction record's parts; the tables
at `ov000 0x02183280` and `0x0218328c`; four more shots (`0x0216e250`,
`0x0216e3c4`, `0x0216e678`, `0x0216ea38`); what fills the request's `+0x20`.

### 11. The action scripts, their reactions and the battle's message box — overlays 0, 24 and 25, 1 October 2026

Read to play every action's own `.bact`; the findings are in
`packages/game-formats/FORMAT.md`, "The action scripts". **Where minstrel
translates it**: `packages/game-formats/src/actionscript.ts` (the builders),
`apps/game/src/action-player.ts` (the run and the players),
`action-reactions.ts` (the record, the queue, the presenter, the message
box), `battle-camera.ts` (the camera command), held by
`packages/game-formats/test/actionscript.test.ts`,
`apps/game/test/action-player.test.ts` and, on a cartridge,
`apps/game/test/action-scripts.test.ts`.

- **The builders**, overlay 0 `data_ov000_02183b5c`: 139 `{tag, builder}`
  pairs handed to `Script::SetOpcodeLookup` by `func_ov000_0216d1c4`, each a
  `int f(Script::Parameter*, int)` that allocates a command `{kind, next, …}`
  and appends it with `func_ov000_02169b78`; sections by `0x02169bf0` (`1`)
  and `0x0216a438` (`16`). Every builder from `0x02169d08` to `0x0216d1b0` is
  named by tag in FORMAT.md's table.
- **The players**, overlay 25 `data_ov025_021ef538 + 4·kind`, run by
  `func_ov025_021e9778` (the loop at `0x021e9830`: 0 again next frame, −1 done
  and stop, else on), the run's end `021e9528`, its tidy-up `021e9558`.
- **Choosing the script**: `func_ov025_021dbe10`, `021dc694` (`sp%03d.bact`
  at `data_ov025_021ef454`), `021dfa9c` (the second blow).
- **Who**: `func_ov000_021820bc` and its table `data_ov000_0218409c`, 58
  entries, each resolver named in FORMAT.md.
- **The reaction**: the record at the player's `+0x540`, `func_ov025_021ecc54`
  (submit), `021ebb90` (the queue, each frame), `func_ov025_021d8c30` (one
  result shown), the death `func_02048690` (ARM9).
- **The result flags' writers** (overlays 0 and 24): `func_ov000_02159eac`
  (set, the partner of `func_ov000_0215fd90`), `func_ov000_0215a004` (HP taken:
  1, or 2 at nothing left), the slot codes by `func_ov024_021e9b74` and
  `021e9f68`. A draw the ledger lacked, `func_ov000_02157288` at `0x02157340`
  — `docs/conformance.md`.
- **The message box**, the player's `+0x5e8`: `func_ov025_021ea474` (the
  action's line), `021ea604`/`021eaf48` (a result's lines), `021ed634` (each
  frame), `021ee438` (whether a result's lines are down).
- **The built-in effects**: `func_ov000_02166a94` from the set-up
  `func_ov000_02163db4` — ids 1, 2, 3, 14, 28 from `data/bin/btarc.nsarc` —
  and the per-action requests of `func_ov025_021e8d20`, made by `021eb204`.

**What is open**: the names of the result flags are read from what each
leads to, not from a symbol; the battle's state 6 and what brings it (which
puts a blow's line up); the animated camera's tracks; the particle format
(`.beff`, `func_02055180`). Upstream names none of the addresses above.

### 12. The way into a battle and out — overlays 17, 23, 26 and ARM9, 1 October 2026

Findings in `packages/game-formats/FORMAT.md`, "The way into a battle, and
out". **Where minstrel translates it**: `apps/game/src/main.ts`
(`startFight`, `battleDarkness`, `beginEnding`, `leaveFight`).

- **In**: the encounter task `func_ov017_021b6f18`, the transition task, the
  swirl `func_0204700c` and its effect object `func_02046e70`; the battle's
  track `func_0209c480`; the load's black (state 0) and the fade up at overlay
  26 `0x021d9d18`; the opening's line `func_ov026_021dd8a8`.
- **Out**: the outcome at overlay 25 `0x021db3c4`; the victory's 17 steps
  (`data_ov023_021fe148`), the fanfare at `0x021ef464`, the level jingle at
  `0x021f1010`; the wipe-out at `0x021f4f1c`; leaving at overlay 0
  `0x02168768`; the field's return `func_ov017_021b790c` (the fade up at
  `0x021b7f3c`, the tune at `0x021b7cd4`, the party's count at `0x021b7bd4`).
- **Sound calls** (ARM9): `func_0209c678` stop with a fade, `func_0209c6d8` a
  jingle, `func_0209c530` the field's tune back.

**What is open**: when the monsters play `appear` at the opening; the swirl
model's placement; the sub screen's fade up after a battle; the tick source.

### 13. Tension and the combo — overlays 0, 24, 25 and ARM9, 1 October 2026

Findings in `docs/conformance.md`, "Tension, modelled" and the combo table's
entry. **Where minstrel translates it**: `packages/sim/src/battle/tension.ts`,
`combo.ts`, `damage.ts` (`dealt`); `apps/game/src/battle-combo.ts`.

- **Tension**: Psyche Up's handler `func_ov024_021dc93c`; its step
  `func_02088208` → `func_0208767c` (the coin at `0x020876b4`); the maximum's
  setter `func_02088150`, the level's `func_02088220`; the gate
  `func_020881c4`; the multiplier `func_02074738` and its table at
  `0x020e88f8`; the head of `func_ov024_021e6a90` (`0x021e6b9c`–`0x021e6d18`)
  and its second multiply against a metal body (`0x021e79d0`); spending in
  `func_ov024_021eb5d0` (`0x021ed48c`–`0x021ed564`) through `func_020881ac` and
  `func_02088234`; the rise when hit `func_ov000_0215b5a0` (its chances at
  `0x02182bf4`); the three callers of the one-step fall `func_02087704`.
- **The combo**: the chain counter `func_ov024_021ea584` (battle `+0x8e50`,
  `+0x8e52`, `+0x8e58`, `+0x8e82`, `+0x8e83`) and its reset
  `func_ov000_0215cd80`; the table at `data_ov024_021fe778`; the display —
  `func_ov000_021823dc` start, `02182498` leave, `021824d8` timers, `0218251c`
  draw, `0218214c` load, its places at `data_ov000_021836d5`.

**What is open**: what `func_ov000_0215af54` queues at the maximum; what reads
`ctx + 0x71`; the tension aura; whether the accuracy roll can fail for
accuracy mode 3.

### 14. A monster's size and a battle's lighting slot — overlays 0, 17 and ARM9, 1 October 2026

Findings in `packages/game-formats/FORMAT.md`, "The size in battle" and the
lighting's slot. **Where minstrel translates it**: `apps/game/src/stage.ts`
(`actorCloseUp`), `action-player.ts` (`sizeScale`, tag 115, the death
effect), `action-reactions.ts` (117), `shadows.ts`, `main.ts` (`startFight`).

- **Size**: `func_02048588` and `func_02048614` (the two writes of
  `+0x18e`); `func_ov000_02165490`, `02166070`, `02166540` and
  `func_020484f8` (the record's way to the object); its readers
  `func_ov000_0216352c`, `0216df00`, `func_02048690`, `func_ov000_02161020` →
  `func_0208f87c`.
- **The slot**: `func_ov017_021b7104`'s block `+0x12`; the roamer's
  `func_ov017_02196430` (`0x02196bbc`); trigger 120 in `func_0206f81c`
  (`0x0206fc5c`); the fixed 2 of `func_ov017_021b8bb0`; the flag at battle
  `+0x55f4` (`0x02164fa0`, cleared at `0x02168790`);
  `GetCurrentAdvancedLightingValues` (`0x02050c20`).

**What is open**: what `func_ov000_021bc77c`'s set battle is; the received
record (`021c530c`, INFERRED multiplayer); whether the day's timer runs during
a battle.

### 15. The battle's command phase — overlays 0 and 26, 2 October 2026

Findings in `packages/game-formats/FORMAT.md`, "The command phase".
**Where minstrel translates it**: `apps/game/src/battle-commands.ts`, and
`packages/sim/src/battle/battle.ts` (the flight before the round).

- **The menu**: `func_ov000_021735d0` (every frame), the party menu
  `func_ov000_02174c14` / `0217c908` / `0217cb5c`, a member's
  `func_ov000_0217f00c` / `0217636c` / `02176500` / `0217ae90`; who is asked
  `func_ov000_0217f6bc`, `021719f8`; the next and the one before
  `func_ov000_0218099c`, `0217f62c`, `0217f78c`; the flight
  `func_ov000_02180394`, `func_ov026_021dd3dc`.
- **The lists**: `func_ov026_021dc8fc` (panels by value 7, then the spell
  table), the costs `func_ov000_02171458`, `021716d0`; the targets
  `func_ov000_02171210`, the monster window `021787b8`, the allies
  `0217edd4`; items `func_ov000_02171c04`.
- **Tactics**: `func_ov000_021777e4`, `02177ac8`, `0217d438`; the default
  `func_02082828`; the AI's entries `func_ov024_021f9030`, `021f8f20`.
- **The hand-off**: `func_ov000_02169850`; targets at the action's turn
  `func_ov000_021540fc`, `02153aa4`, `02153cc0`.

**What is open**: the AI's scoring; what confusion does to the menu;
`func_020dd290`'s cost adjustment; Equipment, Line-Up and Examine; the
multiplayer paths.

### 16. A round's draws and a monster's choosing — overlays 0 and 24 and ARM9, 3 October 2026

Findings in `docs/conformance.md`, "A round's draws, outside the resolver".
**Where minstrel translates it**: `packages/sim/src/battle/battle.ts`
(`chooseFoe`, `byHandler`, `weighted`, `selfPass`, the command phase) and
`states.ts` (`wakes`).

- **The round**: `ProcessCombatTurn` `0x0215d63c` — the initiative
  (`0x0215d828`), the command phase (`0x0215d9fc`–`0x0215e0a8`), the turns
  (`0x0215e0c4` on); the turn `func_ov000_0215767c`; the step after
  `func_ov000_02157d3c`.
- **The draws of a turn**: the charm `func_ov000_0215704c` (its chance
  `0215641c`, INFERRED charm); the turn-start `func_ov000_0215833c`, the
  waking table `0x02182bd4` and `021599f4`; the after-action draw
  `func_ov000_0215858c`; who can act `func_ov000_02155f9c`.
- **A monster's choosing**: the AI mode `func_ov000_02159d94`; actions more
  `func_ov000_0215f57c` (table `0x02182a6c`) — **correcting the ledger line
  that read it as a slot pick**; the way `func_0208a91c` and its usable test
  `func_0208a03c`; the targeting dispatcher `func_ov024_021f66cc` (table
  `0x021ff790`) and the first handler `func_ov024_021edf6c` →
  `func_ov000_02154a04`; Flee's `func_ov024_021f418c`.
- **The weighted pick** `func_ov000_02154f30`, and the striker kept by
  `0x021ed0d4` → `func_0208978c`.
- **The monster record's word `+0x10`**: bits 3–4 the AI mode, 5–7 the way
  rule, 8–10 the extra-action rule, 20–25 the once-a-group mask, 26 the
  memory of who struck. `+0x81`, the 22nd resistance byte, the charm's.

**What is open**: the party's own command-phase processing (`021f9030`,
`021f8f20`); `0215858c` past its first draw; the targeting handlers past those
named; the status bits that rules 4–7 and the weighted pick's halving read.

### 17. What a new character is made wearing — overlays 3, 9 and 21, 3 October 2026

Findings in `docs/party-and-vocations.md`, "What a recruit is made wearing".
**Where minstrel translates it**: `recruitKit` in `apps/game/src/recruit.ts`,
held by `apps/game/test/recruit.test.ts`.

- **Creation's start**: `func_ov009_0218454c(this, vocation, mode)` — the
  vocation to `+0xda2`, the mode to `+0xd95`; called by overlay 3 (Patty,
  `0x0217e8e0`, mode 1, her chosen vocation) and overlay 21 (the Hero,
  `0x0218b95c`, vocation 0, mode 0).
- **The look, and the equipment with it**: `func_ov009_02185634` — the ten
  equipment slots at character `+0x488` from `data_ov009_0218aa40` (all
  empty but slot 2, the hair, `0x233c` + a choice, and slot 3, the face,
  `0x2328` + a choice); with a vocation, slot 7 by the jump table at
  `0x02185b00` and slots 0, 1, 5 and the arms at `+0x49e` from `0x02185b84`;
  in mode 0, slots 0, 1, 5 and the arms again from `0x02185ba4`.
- **Filing**: `func_ov009_0218742c` — vocation (`func_02083ca0`), level 1,
  `data/prm/level%d.bin` applied, the parts of slots 0, 1, 4–8 by the table at
  `data_ov009_0218aac8`, then `func_02086778` appends the record.

**What is open**: what slots 4, 6, 8 and 9 hold by name (head, arms, shield
and accessory by the item tables, INFERRED); `func_ov009_02188b14`'s choices
for the hair and face.

