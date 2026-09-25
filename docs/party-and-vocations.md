# The party, the vocations, and what a character is

Phase 2's reading file — what has been read out of the game for the systems
in `docs/beyond-the-slice.md` §"Phase 2", and what has not. The same rules as
`docs/event-scripts.md`: what is read is cited by address, what is inferred
says so, and what is ours says that.

**Addresses are into the USA build's unpacked ARM9** unless a section says
otherwise, with `dqix-decomp` names where they exist.

## Why this file is not about the game's save format

The done-when is "a created character of any vocation, in a party of four, can
be **saved and loaded**", and it would be easy to read that as needing the
cartridge's save layout. It does not. `minstrel` is a reimplementation, not an
emulator: its save is its own, and nothing has to interchange with a real
cartridge's. What has to be right is the **model** — what a party is, what a
character is, what a vocation does to them — because that is what the game's
behaviour depends on. The bytes it is written in are ours to choose.

So this file reads the model and leaves the game's save alone. The decomp has
almost nothing named for saving anyway.

## 1. The party is four ordered slots and a count

Read 24 September 2026.

The game keeps every character who could ever join in **one table of 233**,
and the party is a short ordered list of indices into it.

`GameState::GetPartyMemberByIndex` (**`0x0200fdf0`**) is the accessor, and its
name is a little misleading — the index is into the table of 233, not into the
party:

```
0200fdf0  cmp   r1, #0
0200fdf4  movlt r0, #0            ; below zero: nobody
0200fdfc  cmp   r1, #0xe9         ; 233
0200fe00  movge r0, #0            ; at or above: nobody
0200fe08  add   r0, r0, r1, lsl #2
0200fe0c  ldr   r0, [r0, #8]      ; a pointer array at +8, 233 entries
0200fe1c  ldrh  r1, [r0]
0200fe20  tst   r1, #0x800        ; a flag; clear means "not one of them"
0200fe24  moveq r0, #0
```

So a character exists in the table whether or not they are with you, and bit
`0x800` of the halfword at their start is what says they are. **What that bit
means exactly is not established** — "in the party" fits every use seen, but
it has not been traced to where it is set.

The **ordered slots** are a byte array at `+0x397c` off the game state, and
the **count** is the byte at `+0x3980`. The walk at `0x02010644` shows both:

```
02010644  add  r0, sl, r6
02010648  add  r0, r0, #0x3000
0201064c  ldrb r7, [r0, #0x97c]   ; slot r6 -> a character index
02010658  bl   #0x200fdf0         ; GetPartyMemberByIndex
...
020106d4  add  r6, r6, #1
020106d8  ldrb r0, [r4, #0x980]   ; r4 = sl + 0x3000, so +0x3980: the count
020106dc  cmp  r6, r0
020106e0  blt  #0x2010644
```

**Four slots — INFERRED**, from the four bytes `+0x397c`–`+0x397f` that the
count at `+0x3980` leaves room for. No bound check of 4 has been found, so
this is an argument from the layout and not from an instruction.

**Slot 0 is the leader.** `0x0200fddc` reads `+0x397c` with no index at all
and hands it straight to the accessor; it is the function the message system
uses to decide who a speaker turns to face — see `docs/event-scripts.md` §7a.

```
0200fddc  ldr  ip, [pc, #8]
0200fde0  add  r1, r0, #0x3000
0200fde4  ldrb r1, [r1, #0x97c]   ; slot 0
0200fde8  bx   ip                 ; -> GetPartyMemberByIndex
```

### What writes the slots has not been found

Three reads of `+0x397c` exist in the ARM9 (`0x0200fde4`, `0x020100b4`,
`0x0201064c`) and **no write**, and the search behind that is now much wider
than the two forms first tried — 25 September 2026.

Every ARM single-data-transfer with an immediate offset was decoded across the
ARM9 and all 35 overlays, of any width and with **any base register**, and
every one landing in `0x97c`–`0x980` or `0x397c`–`0x3980` collected. Nine
turned up: the four known reads, four pc-relative literal loads, and one
apparent `strb` at `0x020002dc` that is Thumb code being decoded as ARM — it
sits among the SDK stubs, beside `LZ77UnCompReadByCallbackWrite16bit` at
`0x020002cc`. **No store.** The constants `0x397c`, `0x097c` and `0x3980` do
not appear as literal-pool words anywhere either.

That is worth stating precisely, because it rules out the shape the reader
uses. The walk folds the index into the base and keeps the offset —
`add r0, sl, r6` then `add r0, r0, #0x3000` then `ldrb r7, [r0, #0x97c]` — so
a writer built the same way would have been found. **It was not, so the array
is not addressed by that offset at all**: whatever writes it holds a pointer
that is neither the state nor `state + 0x3000`, or writes the block in bulk.

Three candidates were followed and are not it: the register-offset store at
`0x020c6d64` is `+0x3f7c`, a different field; the read-modify-write at
`0x020106ec`, immediately after the slot walk, halves a bitfield at `+0x3970`;
and the `ORR`/`BIC #0x800` pairs in the character-record region
(`0x02087914`, `0x02089188`) act on words at `+0x14` and `+0x18` of their
struct, not on a record's first halfword.

**What the accessor does say**, read the same day and new here.
`GetPartyMemberByIndex` at `0x0200fdf0`:

```
0200fdf0  cmp   r1, #0          ; index < 0 -> null
0200fdfc  cmp   r1, #0xe9       ; index >= 233 -> null
0200fe08  add   r0, r0, r1, lsl #2
0200fe0c  ldr   r0, [r0, #8]    ; a pointer array at state+8, one word each
0200fe1c  ldrh  r1, [r0]
0200fe20  tst   r1, #0x800      ; clear -> null
```

So a slot holds an index into a **233-entry pointer table at `state+0x08`**,
and **`0x800` is what the accessor tests** before handing the character back.
That is where the bit earns the reading this file gives it above: a record
whose `0x800` is clear is not returned at all, whoever asks.

### Followed from Patty, and the answer is that nothing writes them

Followed 25 September 2026, from the facility launcher rather than from the
address. It ends in a positive conclusion, not another miss.

**Patty is `0x021b65e0` in overlay 17.** The launcher's arms give her twice —
`mov r1, #0` for facility code 5 and `mov r1, #1` for code 8 — so the mode
byte is the difference between her two doors, and everything else is shared.

**Two fixed globals, not one.** `0x0200f398` is `ldr r0, [pc]; bx lr` over the
word `0x020f33d8`: **the game state is a global at a fixed address**, so the
slots are `0x020f6d54` absolutely and the count `0x020f6d58`. Patty's setup
then calls `0x0202ae18`, which is the same shape over `0x020fefec` — **a
second global, the roster**, and it is that one she works on.

**The roster keeps the party as a bitmask.** `0x0202bd34` asks whether a
character is in the party and answers `tst r0, r1, lsl r4` — a bit per member
— after `0x0202bcbc` turns a character id into a bit index by searching a
signed-byte array at the roster's own `+0x1038`. Neither is the state block.

**So the search for a writer is finished, and it found that there is none.**
Taken with the previous section: no store anywhere addresses the window by an
immediate offset; the offsets and both absolute addresses appear in no literal
pool; and **no `ADD` immediate anywhere in the ARM9 or the 35 overlays builds
a base into `+0x3900`–`+0x39ff`**, which is the last way to reach the array at
all. Four instructions read it. Nothing writes it field by field, because
nothing addresses it to write.

**INFERRED, and this is the inference the rest rests on:** `+0x397c` is a
*mirror* of a party that is really kept in the roster global, written only
when the state block is copied whole — a save, or an init. The live party
Patty edits is the bitmask at `0x020fefec`. What is established is the
negative and the two globals; that the mirror is written by a bulk copy is the
only mechanism left standing, not something seen happening.

**What is genuinely still open** is narrower than this entry used to claim:
not "what writes `+0x397c`" but **what Patty's confirm does to the roster
bitmask**, and when the mirror is refreshed from it. The state's initialiser
is `0x0200f3a4` — it memsets `state+8` for `0x3a4` bytes and initialises a
block at `state+0x2a04` through `0x0208660c` — and is where a copy of that
kind would be visible.

### What this means for `minstrel`, and what was done about it

The shape to match is **an ordered list of up to four, each naming a character
in a larger table** — not a set. Order is not cosmetic: it decides who leads,
and the leader is what the whole message system turns speakers toward.

**Done, 24 September 2026.** `apps/game` had a `party: Set<number>` of
companions *beside* a Hero made of loose module-level variables — `heroExp`,
`heroHp`, `heroMp`, `heroGains`, `equipped` — with a `companionHp` side table
that was the only thing anyone behind the Hero had. That is not the game's
shape, and the cost was not cosmetic either: only the Hero could have
experience, magic or equipment, because only the Hero had anywhere to keep
them.

The party is now `Member[]` with the Hero at 0 (`companion.ts`), each place
holding what used to be a variable. `partyAfter` keeps whoever is already
there rather than rebuilding, so Ivor rejoining at the landslide is the same
Ivor who left at the pass, with whatever he had.

One behaviour changed with it: `companionsAt` used to return companions in the
**attending table's** order, marked "ours" because nothing decided it. It now
returns them in the order they joined, which is the order the game's own slots
would hold them in. With one companion the two agree, so nothing in the slice
could tell them apart.

**And one thing was left alone.** The field trails are sized `PARTY_MOST - 1`,
which looks like the old "Hero outside the party" assumption and is not: the
Hero follows nobody, so three followers is right for four members either way.

### A party of four is made of *created* characters, not these five

Worth stating plainly, because it decides what the rest of this phase is for
and what can be tested against the cartridge at all.

**`attnpc`'s five are temporary.** Ivor joins when his call ends, goes on
ahead at the pass, joins again at the landslide, and **goes home for good once
the slice returns to Angel Falls** (`ev02400`). The other four are the same
shape of thing: along for a stretch of story, then gone. They carry fixed
numbers because they do not grow.

A party that *stays* four is something else: the Hero plus three characters
**created** at the Quester's Rest, each with an appearance and a vocation, who
level, equip and change vocation. They happen to fill the same four slots the
game keeps at `+0x397c`, and that is the whole of what they share.

Two consequences:

- **The slice's own content never puts more than two in the party**, so
  everything about four is unexercised by the cartridge until recruitment
  exists. Tests can build a party of four; no event on the cartridge will.
- The Hero is not a different kind of thing from a recruit. In this game the
  Hero is *made*, at the Observatory prologue the slice cuts. So "has no
  `attnpc` number" means **created**, not "is the Hero" — the Hero is member
  0, by position, the way the game has it. A predicate here briefly said
  otherwise and was corrected before anything leaned on it.

### The save follows the same shape

**Done, 24 September 2026.** The save kept the Hero's experience, hit points,
magic, seeds and equipment as five fields of its own and everyone else as a
bare list of `attnpc` numbers — so a companion came back whole and
empty-handed, which was honest, because that is all the running game gave them
too.

Version 3 keeps one list of places, each with its own. Versions 1 and 2 are
still read and lifted into it: **the save is one slot in a browser's own
storage, and somebody part-way through the slice has no other copy.**

The round trip lives in `companion.ts` as `partySaved` and `partyRestored`
rather than in `main.ts`, because the phase's done-when is "can be saved and
loaded" and it had been two anonymous blocks in a four-thousand-line module
that nothing could reach to test.

One asymmetry is deliberate: a save writes `null` for the Hero's `attnpc`,
because JSON has no `undefined`, and reads it back as `undefined`, because
that is what "is in no table of attending characters" means in the running
game.

**Adding a field takes no new version; moving one does.** `step`, `flags` and
`party` were all added as optional fields that older saves simply lack. That
is the pattern, and it is why the vocation — which is next — will not need a
version 4.

## 2. Vocations

### The vocation is a member's, and all thirteen tables are read

**Done, 24 September 2026** — the first of the phase's three vocation items.

The cartridge has thirteen level tables, `/data/prm/level0.bin` to `level12`,
one to a vocation in the order the status screen names them. The parser has
read any of them since M0 and `tools/harness/test/levels.test.ts` proves it on
all thirteen — but `apps/game` loaded exactly one, because
`HERO_LEVELS` was `level6.bin` and a party could only ever hold one vocation.

Now `Loaded.levels` is all thirteen by number, and `Member.vocation` says
which each place reads against. Three things that named the constant now ask
the member instead: the level table, the status screen's vocation word
(`str_tm` 2100 + n), and `spellsLearnt`. The Minstrel is 6 in all three
numberings, which is what made the substitution safe.

**The Hero being a Minstrel stays where it was** — `HERO_VOCATION_NUMBER`,
settled by a published guide agreeing with `level6` at all 72 values it gives.
What changed is that it is now a *default* rather than a fact about the
engine.

**Ours, and flagged as such:** a companion joining is given the Hero's
vocation, because **`attnpc` has no vocation field at all** — it carries a
level, stats, a weapon and a shield. What vocation an attending character has
is not read, and until it is, anyone who joins is a Minstrel.

### A preset can be dressed, and sixteen of twenty-nine are

**Done, 24 September 2026.** `outfitOfPreset` turns a preset's ids into the
`Outfit` that `dressFigure` takes, and `?preset=n` puts one on screen. Preset
0, the warrior, comes up in red armour and a helm with a sword and shield on
his back — **somebody who is not the slice's hardcoded Hero, built out of the
file**. That is the end of the chain the phase was worried about: file →
parser → outfit → assembled figure → drawn.

`apps/game/test/presets-dressed.test.ts` asks it of all twenty-nine, and
**all twenty-nine dress**.

It was sixteen first, and the thirteen were worth the chase. The failure said
`armour X legwear Y — not in this wardrobe` and named both when only one was
wrong: **every missing armour is in `chara_pc.gp2`.** Only the legwear was
absent — and absent from `chara_pd.gp2` too, so the larger rig was not the
answer either.

The presets really do name legwear the cartridge has not got. Six parts
between them — `p_p190`, `p_p201`, `p_p101`, `p_p102`, `p_p110`, `p_p112` —
while their neighbours `p_p191`, `p_p200`, `p_p202`, `p_p100`, `p_p103` are
all there. A seventh, preset 23's `8001`, is in no part band at all;
`FORMAT.md` already noticed that one by hand.

So the rig falls back to the underclothes, `p_p090`, which is the rule
`outfitOf` has always used for an empty slot. Thirteen of the twenty-nine do
that, and the test names them.

**Why the file is like that — INFERRED, and only two were looked at.** Preset
11 is a woman in a full-length orange dress and preset 23 a sage in a hooded
robe to the ankles: **the body covers the legs, so there is no legwear to
name.** That fits every borrower having a `b5xx`, `b6xx`, `b3xx` or `b0xx`
body, and the other eleven have not been looked at. It also explains why the
fallback is invisible rather than a character in their underwear.

Two things in the dressing are **ours** and say so in the code. Hair: a preset
names a face, armour, legwear, gloves, footwear, headgear, a weapon, a shield
and the arms, and **nothing about hair at all**, so every preset wears the
Hero's until character creation offers a choice. And the face mapping —
`9006` to `p_f006` — is INFERRED, from `FORMAT.md`'s note that the value lands
on a face that exists across all 41 presets.

### Experience is per vocation, and so is level

**Read 24 September 2026**, and it changed the data model.

The game keeps a character in a `0x23C`-byte record, and inside it:

| offset | what |
|---|---|
| `+0x02` … `+0x0E` | **level, thirteen bytes — one per vocation** |
| `+0x0F` … `+0x1B` | thirteen more bytes, 0–10; a revocation count, INFERRED |
| `+0x1C` … `+0x4F` | **experience, thirteen words — one per vocation** |
| `+0x50` | the current vocation, which picks among them |
| `+0x54` | a bitmask: which vocations they have ever been |
| `+0xF4` | **the skill-point pool — one per character, not per vocation** |
| `+0xF6` … `+0x110` | points spent, twenty-seven bytes, one per tree |

The decisive instruction is the initialiser's thirteen-iteration loop at
`0x02086450`, which writes all three per-vocation arrays together:

```
02086454  add  r1, r6, r5, lsl #2
02086458  str  r4, [r1, #0x1c]     ; exp[v]   = 0
0208645c  add  r1, r6, r5
02086460  strb sb, [r1, #2]        ; level[v] = 1
02086464  strb r4, [r1, #0xf]      ; revoc[v] = 0
02086470  cmp  r5, #0xd            ; thirteen of them
```

and `GetExperience` (ov023 `0x021eea98`) reads `exp[current vocation]`:
`ldr r0,[r1,#0x950]` then `ldr r0,[r0,#0x138]`.

**So changing vocation does not re-read one number against another table.** It
changes an index, and what the old vocation had sits untouched until they
change back. `Member.exp` was a single number, which would have quietly
ruined Alltrades the moment it was built — a character switching would have
had their Warrior experience read as a Mage's.

It is a `Map` from vocation to experience now, and the save keeps pairs the
way the bag keeps its items. **Version 4**, because a field changed shape
rather than being added; a version-3 save's single number becomes the
experience of the vocation it says they were.

**Not established:** the Alltrades routine itself. The setter at `0x02086598`
writes the vocation and ORs the "has been" bit, and its only caller in the
ARM9 and all thirty-five overlays is character creation. Whatever the Abbey
calls was not found.

### The skill trees have contents now

`/data/prm/skilltable.bin` — see `packages/game-formats/FORMAT.md`, "Skill
panels". 287 panels, 26 trees of 11, with a cost, what they give and the
message they say. `readSkillTable` reads it.

So skill points can be spent, in principle: the pool is one per character and
the spend is per tree, which the record above confirms.

### And they can be spent

**Done, 24 September 2026.** The menu has a sixth command, in the game's own
words — `str_tm` 4003, **"Allocate Skill Points"** — and it works: the five
trees the member's vocation may spend in, their points out of a hundred, the
ladder of panels with what each still needs, and the game's own sentence when
one lands. Shown live at Angel Falls: the Hero at level 20 with **38 points**,
Sword taken to 13, *Dragon Slash*, *Attack+10* and *Metal Slash* ticked, and
**"Hero learns Metal Slash!"** underneath.

The five trees are the Minstrel's own — Sword, Whip, Fan, Shield, Litheness —
which is the ARM9 table read against `str_sklc`, and a first check on both.

What was read to build it, all on 24 September:

- **Spending is a point at a time, into the tree.** There is no "buy a panel":
  the menu keeps a delta per tree, `+1` at ov013 `0x02186398`, and on leaving
  writes `tree += delta`, `pool -= Σ delta` (`0x02184c8c`). A panel is *had*
  once the tree's total reaches its cost. `spend` is that; `buy` is the same
  thing done in one press, which suits a list rather than a grid.
- **Three guards**: the pool above zero, the tree not already at 100, the
  total staying under 100 (`0x02186324`). **No refunds** — the delta clamps at
  zero, so only this visit's points come back.
- **A level's award is `column10(new) − column10(old)`** on the vocation's own
  table (`0x020826e8`), clamped to the headroom under **2,600** before it is
  added (`ov023 0x021f0c70`). 2,600 is 200 × 13 — a table's whole column, once
  per vocation. So taking up a second vocation earns its column again, which
  is what makes the pool worth keeping per character.
- **A seed adds 2**, under the same cap (`0x02084df4`).

Ours: the pool is a stored number here as it is there, rather than derived,
because **revocation resets a vocation's level and leaves the pool alone** — a
derived pool would fall when it should not.

### Why the eleventh panel costs nothing: it is unreachable

**Settled 24 September 2026**, and it was worth settling, because the obvious
reading — "cost 0 means free" — would have handed every character Gigagash.

Every tree has a panel reading cost 0, and in all twenty-six it is **eleventh**:
last in the file and last by the second index, after the hundred-point panel.
It holds the tree's best thing — Sword's Gigagash, Shield's Critical Hit Guard,
Courage's Auto Counter.

The ownership walk at `0x0209a678` goes through a tree's eleven records in file
order, counting while the points *exceed* the cost and taking one more if they
*equal* it, then stopping. The tenth costs exactly 100 and a tree caps at 100,
so the walk always stops there. The skill menu draws **ten** a tree
(ov013 `0x02187b64: cmp r7, #0xa`).

So neither of the game's two consumers can reach it. `climbable` leaves it
out and the screen says "not yet" rather than pretending. **What grants it is
still not established** — no code was found that reads it.

### Changing vocation

**Done, 24 September 2026 — and almost nothing happens**, which is the payoff
for having read the data shape first.

`changeVocation` moves the index and ORs the "has been held" bit, exactly as
the game's own setter at `0x02086598` does. Experience and level are already
per vocation, so what a character had as a Minstrel waits where it was, and a
vocation they have never been begins at no experience, which is level one.
Shown live: the Hero at Minstrel level 20 becomes a Guardian at level 1 and
comes back a Minstrel at level 20.

Skill points are deliberately untouched. They are **one pool per character**
and the spend is per tree; neither belongs to the vocation being left.

`?vocation=0:0,0:6` changes party place 0 to vocation 0 and then back — ours,
for driving, until the Abbey's own flow is found.

**And the Abbey's own rules are read now** — it is a menu, dispatched exactly
as the shop and the inn are (service 46). The wiki's `Party` page has the
chain; what matters here:

- **Six vocations with no gate at all** — 1 to 6, Warrior through Minstrel,
  the six a game begins with. Then six more, `[7, 9, 8, 12, 10, 11]` in the
  Abbey's own non-numeric order, each behind event flag `0x113F + its number`.
  `vocationsOffered` builds that list.
- **Valid ids are 1 to 12, and zero is refused.** Zero is the Guardian, which
  the game writes when it creates the Hero and the Abbey's own bounds check
  rejects. `changeVocation` refuses it and `isVocation` says why.
- **No level requirement, nothing reads the held mask, and the vocation
  already held is not excluded** — the builder does none of those, and what it
  builds is handed to the setter unfiltered.
- **Skill points survive a change.** Neither the pool nor the points spent per
  tree is touched by the apply or by revocation.

That the ungated six are exactly the starting vocations, and the gated six the
advanced ones, is an independent check on the numbering `FORMAT.md` infers
from the status screen's order.

**Not established, and flagged where it matters:** whether this host's story
flags are numbered as the game's event flags are. `VOCATION_FLAG` is the
game's `0x113F`; ours come from the trigger files' own flag words, and nothing
has tied the two together.

### Equipment is per vocation too

**Done, 24 September 2026.** The game keeps eight equipment slot ids per
vocation at `live+0x4A4 + (v - 1) * 16` — indexed from `v - 1` because zero is
not a vocation — and the apply stows the outgoing set and brings back the
incoming one.

`Member.equipped` became `Member.outfits`, a map from vocation to what is
worn, the same shape experience took. **Changing vocation then stows and
restores nothing**: what a vocation wears is simply what its set holds, and
the index moving is the whole of it. A Warrior's armour waits where it was
while they are a Mage.

A trade nobody has taken up **wears nothing**, which is the game's behaviour
rather than an omission: the incoming block is empty the first time. Shown
live — the Hero changes from Minstrel to Warrior at Alltrades and stands
there in their underclothes.

The save keeps pairs, as it does for experience. **Version 5**, and a
version-4 save's single set becomes the set of the vocation it says they were.

### The Abbey does **not** drop what a vocation may not wear

**Corrected 24 September 2026**, and this file said the opposite four hours
earlier. The reading then was that the apply "unequips to the bag anything the
new vocation or that character's sex may not wear". It does not, and the
correction matters because it turned a piece of missing work into no work at
all.

`0x0215582c` **never calls `0x020dd4c4`**, the game's own "may this character
equip this?" — the ARM9 has no caller of it anywhere, and every overlay caller
is an equip menu. Verified here by disassembly rather than taken on report.
What it really does is two plain loops:

- `0x02155958` — **everything worn goes into the bag, unconditionally.** It
  walks the `0xff`-terminated slot list at `0x0217f2c4` over the equipment
  entries at `live+0x194 + i*0x20` and calls `0x0207c378` with each item id.
- `0x02155bcc` — for each of the eight stored ids, **put it back on if the bag
  still holds one**, else clear the slot. No vocation test, no sex test: the
  block was recorded while that vocation was worn, so it was already legal.

There is one conditional removal and it is narrow: `0x02155b04` does nothing
unless the incoming block's accessory is **item 18048** *and* the bag no longer
holds one, and only then clears what that accessory's sex exemption had been
covering.

So our model — per-vocation outfits, the index moving, nothing stowed or
dropped — is what the game does. The thing that *was* missing is a different
thing, and it is done now.

### Who may wear what, which is the rule that was actually missing

**Done, 24 September 2026.** `mayWear` in `equipment.ts` is `0x020dd4c4`'s two
vocation rules, and the equip panel now leaves out what the chosen member may
not wear.

- **Armour, headgear, gloves, legwear, footwear, accessories** — the in-RAM
  categories 2 to 7 — against a **12-bit mask**, bit `v − 1` for vocation `v`,
  in bits 0 to 11 of the item record's second word (`0x020dd63c`/`0x020dd644`).
  That is `ItemStats.usedBy`, and reading it in the game **confirms the bit
  order** that `charapreset.bin` had only inferred.
- **Weapons and shields** skip that mask entirely and go by the **skill
  trees**: the item's tree against the four weapon trees the vocation holds
  (`0x020dd19c` — whose loop really is `i < 4`, because the fifth is the
  vocation's own tree and never a weapon's, which is what `vocationsWielding`
  already did), **or** the character having earned that tree's Omnivocational
  panel, which `0x020dd4c4` asks *first* (`0x020dd200`, a per-character bit
  array at `live+0x8EC`).

That last one is the single place the skill screen reaches into what somebody
may hold, and it is built: buy the hundred-point panel of a weapon tree and
the vocation stops mattering for it.

`apps/game/test/may-wear.test.ts` holds it to the cartridge: 313 weapons and
shields and 631 pieces of armour, nothing in between, every vocation with
something it may wear and something it may not, and **27 of the 29 presets**
dressed in a kit that agrees on one vocation bit — every piece of which
`mayWear` allows that vocation and refuses another.

### And the sex rule, which the cartridge names for us

**Done, 24 September 2026**, and it is the nicest piece of evidence in this
file, because the game labels its own answer.

Bits 27 and 28 of the item word are "sex 0 may wear it" and "sex 1 may wear
it", used as a **two-entry lookup indexed by bit 0 of `live+0x49C`** rather
than compared (`0x020dd6f8`). `readItemStats` reads them now as `wornBySex`,
and bit 29 as `sexLock`.

Which bit is which is **not a guess**. Of 944 pieces of equipment, 823 are
open to both and **none is closed to both** — already a sign the pair is read
right. Of the rest, bit 0 carries *holy mail*, the *rogue's robes*, the
warrior's gloves, the flamenco shirt and the twinkling tuxedo; bit 1 carries
*holy femail*, the *roguess's robes*, the priestess's pinafore, the dancer's
dress and the bunny suit. **mail/femail and robes/roguess settle it**: bit 0
is male, bit 1 female, and 40 items are his to 81 hers.

`charapreset.bin`'s own `sex` field numbers them the same way, checked
independently: across the 29 ready-made characters, **33 of 33** sex-restricted
pieces they are dressed in allow the sex their record names.

And the exemption is named too. `0x020dd6b8` compares equipment slot 9 with
the literal **18048** before the sex test; on this cartridge item 18048 is the
**wear-with-all award**, an accessory — which is precisely what an item that
lifts the sex rule should be called. 20 of the 121 sex-restricted pieces carry
`sexLock`, which is what the award cannot help with; the bikini tops and
bustiers are among them, the dresses are not.

`Member.sex` holds it, **undefined until somebody chooses** — which leaves the
rule unapplied for the Hero and for a story companion rather than guessing at
one. A created character takes their preset's.

### A correction this turned up in the item parser

`ItemStats.kind` was read as **five** bits of word 3 and is **four**:
`0x020dd5a4` isolates it with `lsl #0x15 / lsr #0x1c`, which is bits 7 to 10.

The cartridge shows the difference plainly. With five bits the values are 0 to
13 on 941 items and **16 on exactly three** — 15100, 15103 and 15106, all
gloves in table `a`. Sixteen is no weapon tree, and armour is supposed to carry
none; read as four bits they are 0, and the vocation mask decides them like
every other glove. Before the fix, preset 17's gloves were refused to the
vocation whose kit they are.

**Bit 11 is something else**, set on those three and nothing else in 944. Not
established; `unknown_entry` carries it.

### Revocation

**Done, 24 September 2026.** `0x02155e38`, reached from the Abbey's step slot
4, loads the current vocation from `live+0x950` **once** and uses it for every
store it makes — level 1, no experience, one more mark at `live+0x186 + v`,
clamped at ten by `cmp r0, #0xa / movhi r0, #0xa`.

`revoke` in `companion.ts` is that, and it is short for the same reason
changing vocation was: the shape was read first. Setting the experience to
nothing *is* setting the level to one, because the level falls out of the
experience here; the other twelve vocations keep theirs; and the **skill
points survive**, pool and trees both, which is the whole point of the
character keeping them rather than the vocation.

`Member.revocations` is the thirteen bytes the record has at `+0x0F`, and the
attributes panel says "revoked 2×" where there is a count. `?revoke=0` drives
it, standing in for the Abbey's own step until that flow is built.

**Not built, and read**: the first-time flag per vocation, `0x118B + v`, which
drives a line the first time — `REVOCATION_FLAG` names it and nothing sets it.
And what reaching ten grants: `0x02157c50` loops the twelve counters and calls
`0x021ed6cc` for each at ten, and what that does is not established.

### What is still missing

**Struck off since this list was written**: the skill screen is built, the
"drop what a vocation may not wear" item turned out to be something the Abbey
does not do, and the eleventh panel's zero is settled.

What is left:

### Recruitment: Patty's Party Planning Place

**Built 25 September 2026**, from the read below, and reached the way she is
reached: `<LUIDA>` at the end of her own talk line, facility code 5 — the same
shape as the pot's `<RENKIN>`. (ルイーダ is the tavern's Japanese name, which
is why the tag is not "PATTY".)

Her four-or-five item menu, in her own words: **Call Up a Friend · Recruit a
Friend · Drop Off a Friend · Part With a Friend**, with Drop Off left out when
the party is only the Hero — her window `0x1D` instead of `0x1E`. Recruiting
asks the **vocation first**, the six a game begins with, and the new character
goes **onto her list, not into the party**.

`recruit.ts` is the model and `Roster` its shape: a character is in the party
or on the list, **never both**, which is how the game has it — her list *is*
the thirteen-record array, and the party is four slots naming ids in it. The
save keeps the list beside the party.

**The creation screens run at the moment of recruiting**, one knob a screen,
in overlay 9's own order: **sex → figure → hair → hair colour → face → skin
colour → eye colour**. Seven screens, then Patty says "That's it! All done.
Your application has been processed!" — her message 22 — and returns to her
menu with the character on her list.

`CREATION_SETTINGS` is what the *screens* offer and `KNOB_SETTINGS` what the
*field* holds, because **two of them differ**: the cartridge has 24 hair
styles and the screen offers ten (ten a sex, INFERRED from `bg_cm_ht_m` and
`bg_cm_ht_f`), and the eye-colour field is four bits while the screen is a
4×2 grid of eight. Which ten hairstyles the screen offers is **not
established**, so ours are the first ten.

**The name is the one screen that does not run.** It is overlay 9's eighth,
with its own keyboard (`keyboard_cm.bin`), and the game offers **201 given
names** to roll from — `str_cm` 20000–20100 male and 21000–21100 female.
Neither the keyboard nor those names is read, so an unnamed recruit goes by
their trade: "a Warrior".

**A bug this turned up**: `nameFor` called *any* unnamed created character
"Hero", so Patty's list showed a second Hero the moment it had somebody on it.
Only party slot 0 is the Hero.

**And a smaller one worth remembering**: her Cancel row printed "Drop Off a
Friend", because it used `bm_rrb`'s label 3 against `bm_lui`. A label number
belongs to the file it came from. Patty's own Cancel id is **not
established** — her window's item 186 maps through `bm_lui_txt`, which is not
read — so that row is ours.

#### What was read

**Read 25 September 2026.** It is Patty's Party Planning Place, service 23, a sixteen-step flow
  in overlay 3 at `0x0217ff68`, and what it does is written down here so that
  building it is transcription rather than invention.

  **Her top-level menu** is four or five items depending on whether the party
  is only the Hero (`0x02162084` opens window `0x1D` instead of `0x1E`):
  **Call Up a Friend · Recruit a Friend · Drop Off a Friend · Part With a
  Friend · Cancel**.

  **Recruiting asks the vocation first and the appearance second.** Step 4
  opens a window of six — Warrior, Priest, Mage, Martial Artist, Thief,
  Minstrel — and hands the choice to service 24, which is character creation
  in overlay 9. **Only the six starting vocations**, which is the same six
  Alltrades offers with no gate.

  **Overlay 9 asks in this order**, from its own thirteen-step table at
  `0x0218ab9c`: **sex → figure → hair → hair colour → face → skin colour → eye
  colour → name**. Five options for the figure, ten each for hair, hair colour
  and face, eight each for the two colours. That is the same knob set
  `appearance.ts` holds, and **the order to ask them in**, which it did not
  have.

  **A new character goes onto Patty's list, not into the party.** Overlay 9
  files them with `func_02086778`, which appends to the thirteen-record array
  at `GameState+0x3984` and bumps the count at `+0x5690` — so **the list and
  the record array are the same thing**, and party membership is the four
  slots at `+0x397c` naming ids within it. Only then does she ask whether they
  should join now.

  **Two limits, and both are checked.** The party is **four**
  (`cmp r0, #4` at `0x021621a4`, `0x021628a4`, `0x0216322c`, `0x021632f0`),
  and the list holds `min(n + 8, 12)` — 8 to 12 — with its own refusals.

  **No cost in gold was found**, and that is a negative result rather than a
  citation: no purse access appears in any of steps 1 to 8, and `str_lui`
  carries no price or refusal-for-money line.

  **Not established:** `str_lui` ids 15 and 16 are absent from the English
  file though the code shows message 16; and where overlay 9's two confirm
  sentences (18000, 18001) are looked up — neither constant appears anywhere
  in that overlay.
- **Mini medals**: the two reward tables are read and nothing hands a medal
  over or spends one.
- **How a battle's experience is split among the party.** Only the leader
  earns anything here, so only the leader levels and only the leader's pool
  grows — which a party of four makes plain. The award is read from
  `battleState + 0x5758 + i*4` for `i < 4`, and how that word is computed is
  not.

## 2a. Alchemy

### The Krak Pot cooks

**Done, 24 September 2026**, and it is one of Phase 2's four named systems.

`/data/bin/recipe.gp2` holds **470 recipes of twenty integers** — one tagged
data table, no string table, because a recipe has no name of its own and is
shown by the name of what it makes. Found by reading **overlay 6**, the pot,
which carries `renkin`, the path and the pot's own art side by side.

| value | what |
|---|---|
| 0 | the recipe's number, 1 to 471 — **359 is absent**, which is why 470 records |
| 1 | the item it makes |
| 2, 4, 6 / 3, 5, 7 | up to three ingredients and their counts; the empty slots are always a suffix |
| 9 | the chance **this** recipe is what comes out, in per cent |
| 14, 15 | the result's own category and subtype |
| 16, 17 | the alchemiracle's two ways |
| 18, 19 | two display ranks |
| 8, 10, 11, 12, 13 | **not established**, and carried |

**The game's own reader was not found**, unlike the skill panels: no per-tag
handler table in the ARM9 or any of the 35 overlays belongs to this file. So
the reading rests on the data and on outside witnesses, and it is worth being
plain that this is a weaker footing than an instruction. What holds it up:

- **`/data/prm/itemsort.gp2`, which the recipe file does not point at**, gives
  every item a category and a subtype. Value 14 matches the result's on
  **470 of 470** and value 15 on **469** — the miss is the leather kilt, a
  skirt filed under trousers. That only lines up if value 1 is the result.
- Value 19's order matches `itemsort`'s own alphabetical rank at **all 469
  steps**.
- A published strategy guide agrees on the eight recipes sampled from it,
  **counts included**, which is what pins values 3, 5 and 7.
- And the pot's own words vouch for the rest. `str_ren` 18 is "there's a
  `<val_2>` per cent chance of success"; 19 "A successful alchemiracle results
  in an item superior to the one indicated in the recipe"; 20 "even if you
  fail … you shan't go away empty-handed". Values 9, 16 and 17 are read as
  exactly those three sentences.

The 22 alchemiracle recipes pair up: each names a better recipe to reach
instead, that one names this one to fall back to, and **both take the same
ingredients** — supernova sword to hypernova sword. The odds are the *better*
recipe's own value 9, not the one being attempted.

### Corrected 25 September 2026: the pot is spoken to

A play session found the Krak Pot as a **field-menu command**, which it never
is. It was put there as a stand-in, the comment said so, and the stand-in
should not have stood.

**A facility is a tag at the end of somebody's talk line.** The message
compiler turns `<SHOP=n>`, `<INN=n>`, `<CHURCH=n>`, `<BANK>` and `<RENKIN>`
into a **facility code**, and `func_0206f6cc` — the one function the talk
service calls for it — switches on that byte:

```
0206f6fc  ldrb  r1, [r5, r4]           ; the facility code
0206f700  cmp   r1, #0xc
0206f704  addls pc, pc, r1, lsl #2     ; code n at 0x0206f70c + 4n
```

1 inn · 2 church · 3 bank · 4 shop · **5 and 8 Patty's party planning** ·
6 and 12 the Quester's Rest counter · **7 the Krak Pot** · 9 and 10 Alltrades
· 11 the Starflight Express.

So `<RENKIN>` is a `Service` now, alongside the three we already read, and
`openService` opens the pot. It is **bare** — there is one pot, so the tag
selects nothing — and it appears two ways on the cartridge: as a line of its
own, and as `…<END><RENKIN>`, which is why `runLine` takes a bare service tag
that immediately follows the end.

**The pot is in the Quester's Rest at Stornway**, `R01M01` — "Stornway, Lobby
Interior 1" in the map index. Its own line: *"I am in tip-top shape, I assure
you. Mentally and physically. A pot I may be, but I am in no way potty!"*

**And the pot's whole interface is on the cartridge**, in `bm_rrb`: **Use A
Recipe** ("Pick a recipe from the Alchenomicon and get kraking"), **Try Your
Luck** ("Take pot luck with your own pick of ingredients"), Cancel, and "How
many?". Then the Alchenomicon's own grouping — All Recipes, Weapons, Armour,
Accessories, Items, ???, Shields, Head, Torso, Arms, Legs, Feet, and **By
Type**: Swords, Spears, Knives, Wands, Whips, Staves, Claws, Fans, Axes,
Hammers, Boomerangs, Bows.

**Which means recipe values 14 and 15 are that grouping**, not merely the
cross-check this file called them — **and values 18 and 19 are its two sort
buttons**, By Type and By Name, which this file called "two display ranks"
and left there.

#### The book's grouping, read and held to the cartridge

`bm_rrb` is a `0x67` table of 48 labels, the same shape as `sta_skl`, so the
words are **read at runtime and not copied here**. Its grouping:

| the book's category | `itemsort` categories | recipes |
|---|---|---|
| All Recipes | all | 470 |
| Weapons | 0 | 185 |
| Armour | 1–6 | 224 |
| Accessories | 7 | 30 |
| Items | 8, 9 | 31 |
| ??? | none | **0** |

And eighteen **By Type** headings: the twelve weapon types, then Shields,
Head, Torso, Arms, Legs, Feet. Those cover Weapons and Armour and nothing
else, because Accessories and Items have no sub-kinds — so a recipe has
exactly one heading if it is in one of those two categories and none if it is
not, which is what `tools/harness/test/recipes.test.ts` now holds.

Every recipe falls in exactly one category with **none left over**, which is
what makes this the book's grouping rather than a plausible arrangement.
**What `???` is for is not established**: nothing on the cartridge lands in
it.

**Try Your Luck** is the pot's other mode — ingredients in, see what comes
out. `tryYourLuck` matches a recipe whose ingredients are *exactly* what went
in, counts and all; a superset is a different attempt rather than a near
miss, which is the reading `str_ren` 11 implies. **Ours**: the game's own
matching was not found.

**"How many?"** cooks a batch, and each one rolls its own alchemiracle — so
ten attempts can come out as some of each, which is what rolling per attempt
means.

**The Alchenomicon is a second way in**, and the pot says so when it hands the
book over: *"The Alchenomicon is now accessible from the battle records
menu."* Which agrees with the code — Battle Records (service 41) begins
service 43, the alchemy overlay.

**Ours, and marked so:** the menu shows what the bag can make first and the
rest after, because the game shows only the recipes whose book you have found
and **where a book is found is not read** — a published guide says bookcases,
rooms and quest rewards, which is event-script work. And **how the game draws
the alchemiracle is not read**, so `cook` takes the roll rather than borrowing
the battle RNG, whose sequence *is* read and should not be spent on a guess.

Shown live at Angel Falls with `?give=20005,18002,12400`: soldier's sword,
raging ruby and warrior's helm go in, and the pot says **"Wow! A warrior's
sword!"** — its own sentence, through the same renderer the battle's words use.

### Mini medals — read, not built

Two arrays in overlay 4, each `(u16 medals, u16 item)`: **ten milestones**
(4 thief's key, 8 Mercury's bandana, 13 bunny suit … 80 dragon robe) bounded by
`cmp r3, #0xa`, and **six repeatable** (3 prayer ring … 20 pixie boots) bounded
by `cmp r4, #6`. `str_mdl` 40 is the milestone line and 60 and 130 the
pick-your-own shop after eighty, which is what says which array is which —
INFERRED.

**How many medals exist is not found.** The mini medal is item 22039 and
nothing in the data counts them; quests award them too.

## 3. What a character is

### The presets can be read now

**Done, 24 September 2026** — the first step of the phase's hardest item.

`/data/bin/charapreset.bin` holds twenty-nine ready-made characters:
twenty-three naming a vocation and a sex, and four named people. Its layout
has been written down in `packages/game-formats/FORMAT.md` since September and
**no code read it**, which meant the description had never been held against a
parser. `readCharacterPresets` does now, and
`tools/harness/test/presets.test.ts` holds it to the cartridge.

Every claim in the description survived: the count, the 27 distinct names over
29 records, the face band, the sex values, value 77's two values, and the item
bands — including the sage man's legwear of 8001, which the description says
names nothing and which the test expects for that reason.

Two things the reader does not do, on purpose:

- **It does not decode the names.** They are Shift-JIS, alone among the
  strings this package reads, and the table turns each byte into one character
  — lossless, and not text. Whoever wants words can have the bytes.
- **It reads ten values of 102 and carries the rest.** 75 item ids whose
  purpose is not established, and eleven other values, go through as
  `unknown_*` rather than being dropped.

### A party of four created characters, dressed, fighting, saved and loaded

**Done, 24 September 2026 — the phase's done-when.**

`Member` gained an `appearance` (which ready-made character they were built
from) and a `name`. `dressParty` dresses every *created* member from parts,
by place, so `Loaded.figure` is now a view of place 0 rather than the only
figure there is. A created follower is posed by `playerPieces` like the Hero;
a story companion keeps their whole `.chr` model.

`?party=0:0,11:3,21:10` makes a party of three created characters beside the
Hero, each a preset and a vocation — **ours**, standing in for the Quester's
Rest. `?save=1` writes a save where it stands, because the church is
otherwise the only way to record anything and that makes the save impossible
to drive from outside.

What that demonstrates, end to end and in a browser:

- four walk in a line, each built from different parts, and the mini-map
  names all four;
- a battle opens with four on the party's side at **their own vocations'
  numbers** — Minstrel 20/6, Warrior 30/10, Mage 18/16, Sage 29/30;
- the save writes version 3 with four members, each with their appearance and
  vocation; a fresh page with no parameters offers the save, and all four come
  back, all four assembled.

One latent bug was fixed on the way rather than waited for: `companionsAt`
leaves out anybody with no `attnpc` record, so indexing it by place — which
the field, the mini-map and the battle all did — would have put a created
character in somebody else's footsteps the moment one walked in front of a
story companion. `followersNow` keys by place instead.

### A created character stands in a battle

**Done, 24 September 2026.** They fought and nothing drew them:
`battleCompanions` held only story companions, because only those have a
`.chr` model. A created character is posed from the parts they are assembled
out of, the same way the Hero is — and it needed no translating, because
**their figure carries the same motion names a companion's model does**:
`attack1a`, `damage`, `death`, `guard`, `magic`, `stand`. The cue table
`COMPANION_MOTIONS` already spoke both languages without anyone noticing.

Their wounds are kept by their place in the party rather than by an `attnpc`
number, which a created character has not got.

### The menu is about one of the party at a time

**Done, 24 September 2026.** `MenuState` gained a `member`, and the
attributes panel's row is what sets it — which is how the game reads: you
pick a character, then look at them. Equipment and spells follow whoever was
picked rather than asking again.

Two things fell out of it:

- **The bag is the party's; the equipment is not.** Anybody can be dressed
  out of the one bag, which is why `taken.equip` acts on the chosen member.
- **What they wear now beats what they were made in.** A created character was
  dressed from their preset and nothing else, so equipping them changed
  nothing at all — a costume they could not take off. The preset is where
  they start; a worn item wins per slot, and only the face stays the
  preset's, because no item is one.

### 3a. Character creation

**Done, 25 September 2026** — Phase 2's fourth system, and the one the slice
plan called "the hardest asset problem in the project".

`Appearance` in `apps/game/src/appearance.ts` is the character's own look, and
its **knob set is the game's**, read from overlay 15's debug viewer whose
labels are `[Gender] [Face] [Eye Colour] [Skin Colour] [Hairstyle] [Hair
Colour]`, seven equipment slots and `[Build]`. Equipment is a member's, so the
other seven are here — plus the hair's shape, because a style has both a shape
and a colour and the two are different files.

`Member.look` holds it, the save keeps it, and the menu has a panel that turns
each knob. `?look=0:sex=1,hair=7,hairColour=3` drives it from outside.

**What changes on screen: the face, the hair style, the hair shape, the hair
colour and the build.** Shown live at Angel Falls — the Hero in hairstyle 7
colour 3 comes up with tall pink hair, and turning the hairstyle knob from the
menu to 4 changes the model under them, which the vertex count moves with.

**What does not: the three colour fields.** Skin and eye colour are read and
carried, and the panel says "not drawn here" on their rows rather than
pretending. Nothing in `render` swaps a palette, which is where that work
belongs and is not Phase 2's.

#### The build is a real table, and it is in the ARM9

Ten pairs of `fx16`, five to a sex, indexed `sex * 5 + rand(5)` at creation
(`0x02010c58` on). `readBuildTable` finds it **by shape** — twenty halfwords
in a band around 4096 whose second of each pair falls strictly across each row
of five — as `readVocationTrees` does, so another build yields it or says it
is not there.

**It is in the European binary exactly once**, at `0xe6da8`, and gives the
same twenty numbers the USA build has at `0x020E6D98`. Two builds agreeing on
twenty values found two different ways is what makes it more than a pattern
that happened to fit. 0.888 to 1.039 of the figure's own size.

`playerPieces` applies it, and **only to what is drawn**: the collision
radius, the camera and the length of a step are untouched, so a broad
character and a slim one walk the same. Whether the game does more with the
numbers is not established.

#### How hair is named, which the rig already knew

A style is `p_h<style×10><variant>.nsbmd` and its colour a texture
`p_h<style×10 + colour>a.nsbtx` — 24 styles of 5 shapes over 121 models, and
207 texture files. `Outfit` has carried the two separately since the slice, so
this needed no rig work at all; only the *choice* was fixed.

**The bands are not full**, and the fallbacks are pinned rather than assumed:
of the 360 shapes and colours the panel offers, **33** land on a file the
cartridge has not got and fall back to the band's own — the high styles, whose
textures are 210, 216, 220, 226, 230, 234 and nothing between.
`apps/game/test/looks.test.ts` walks every one.

#### Two things read and deliberately not acted on

- **`charapreset.bin` may not be the game's own file.** The string
  `charapreset` appears in **none** of the ARM9 or the 35 overlays — checked
  here, not taken on report. What the game reads is `/data/bin/presetdt.gp2`,
  a tagged table of 12 records of 35 values with two name lists of 20.
  `readCharacterPresets` still reads `charapreset.bin` and its 29 records
  still dress; what is in doubt is only whether the *game* uses it, and a file
  id could be computed at runtime. Left alone.
- **Where the creation screens are reached from, now read.** The scene table
  is at `0x020e8f20`: 35 records of `{group, name}`, the count `0x20a1940`
  bounds its argument against. Scene 21 is `charamake`, scene 9 `charamake2`,
  scene 17 `gamemain`.

  `main`'s game-mode dispatch is at `0x0200111c` (`cmp r0,#9; addls pc, pc,
  r0, lsl #2`, table at `0x02001124`). Each arm loads one scene:

  | mode | loads | scene |
  |---|---|---|
  | 0, 4, 5, 9 | 17 | `gamemain` |
  | 1 | 15 | `charaview` |
  | **2** | **21** | **`charamake`** |
  | 3 | 16 | `movieview` |
  | 6, 7 | — | falls to the loop bottom |
  | 8 | 27 | `sub_staffroll` |

  **Mode 2 is set in exactly one place** — `ov004 0x0216d19c`, checked by
  scanning the ARM9 and all 35 overlays for a `BL` to the mode setter
  `0x0200fb94`. The same overlay sets the modes for 5, 6, 7, 8 and 9, which
  makes it the boot menu. **So the game makes the Hero straight off the title
  screen, before any map is entered**, and Patty's step 4 drives overlay 9 for
  a recruit. The same screens serve both, which is why the walk is one piece
  of code here too — `Making` in `appearance.ts`, driven by `askCreation` in
  `main.ts` and by `PattyWhere.making`.

  **Corrected:** an earlier note here said mode 3, set from the Observatory
  prologue flag at `[GameState+0x6000+0x3D6]`, was what ran `charamake`. It is
  not. That flag does set mode 3, but mode 3 loads scene 16 `movieview`; the
  byte queues a movie, which is also how `ov017 0x021618d0` reads it.

  `func_0201099c` builds three characters from `presetdt` plus RNG — a default
  party, not a menu — and is a separate thing.

  **What is ours is only the way in.** `?create=1` runs the walk off the start
  screen, before the map, which is where the game runs it; there is no title
  screen yet to hang a New Game item on.

**The name is not asked for yet.** It is one byte per character, at most
twelve, zero-terminated, `0xFF` a space — a game-internal glyph code, not
ASCII or Shift-JIS. `Member.name` holds a string and nothing asks a player to
type one.

### What is still missing, and why

None of this is guesswork about the game; it is work not done. Listed so that
what the phase left behind is visible rather than discovered later.

**Rewritten 25 September 2026.** This list had gone stale in the worst
direction: it named character creation, recruitment, Alltrades, the skill
trees and alchemy as missing, and all five had been built — three of them
described as built *elsewhere in this same file*. What follows is what is
actually left.

- **Mini medals.** Both reward tables are read — ten milestone rewards and six
  repeatable — and **nothing hands one over or spends one**. Nothing in
  `apps/game/src` so much as names them. How many exist is not established
  either: item 22039 is the medal, no table counts them, and quests award them
  too. See §"Mini medals" above.
- **Name entry.** The seven knob screens are built and run both for the Hero
  (`askCreation`) and for a recruit (Patty's step 4), but the game's eighth
  screen is the name and this has none. One byte a character, at most twelve,
  `0xFF` a space, in game-internal glyph codes rather than ASCII —
  `Member.name` holds a string and nothing asks a player to type one. The 201
  given names in `str_cm` (20000–20100 male, 21000–21100 female) and
  `keyboard_cm.bin` are both unread.
- **Three of the seven knobs are read and not drawn**: skin colour, eye
  colour and hair colour. Each is a palette swap and nothing in `render` swaps
  one, so the creation screens offer them and the figure does not change. Not
  Phase 2's work.
- **Where a preset's hair comes from**, if anywhere. The record names none, so
  a character made from a preset wears the Hero's. Still on the wiki's "not
  established" list — this one *is* an unknown rather than work not done.
- **What writes the party slots and the count.** Three reads of `+0x397c` in
  the ARM9 and **no write anywhere**, in the ARM9 or any overlay. This was
  written down as the thread to pull when recruitment was implemented;
  recruitment is now implemented and the thread is still unpulled.
- **How a battle's experience is split among the party.** The game pays each
  member — its result strings name up to four — and the split itself has not
  been found on the cartridge. Only the leader earns anything here, which a
  party of four makes visible.

### The menu shows the party

**Done, 24 September 2026.** The attributes panel knew only the Hero, because
only the Hero had numbers. It now lists the party and the row chooses whose
block to read.

Looking at it in the browser immediately showed something no test would have:
**Ivor came up as level 1 with 20 hit points.** He is level 3 with 25 in
`attnpc`, and `companionFighter` already fights with those — the menu was
reading him against the Minstrel's level table, so it showed the Hero's
numbers under somebody else's name.

A story companion does not level, so their numbers are `attnpc`'s own and
`attendingStanding` builds them. They have no experience and no next level
there, because they gain neither — and **no vocation**, because the record
has no such column, so the line names none rather than borrowing the Hero's.

Whoever is in no such table — the Hero, and anyone created later — is read
against their vocation's level table, which is what levelling means.

## A correction this reading turned up elsewhere

Reading the party led to the wiki's engine-function page, which said the
engine's angles are fixed-point radians and then, thirty lines later, that
engine function **`544`** hands a character's facing back **in degrees**. Only
one of those can be true.

`544`'s handler (ov001 `0x0215ffc0`) reads the three components of the
rotation, converts each with `_fflt` and divides by `0x45800000` — `4096.0f` —
and does nothing else. That is the plain fixed-point-to-float conversion; the
`0x47/4096` that `532` and `327` use to take degrees does not appear. **`544`
hands back radians.**

`apps/game/src/event.ts` had the same contradiction — a comment saying radians
over a line returning `(facing * 180) / Math.PI` — and so did the test that
pinned it. The pairing is what gives it away: `208` *sets* a facing in
radians, so a script that read one back with `544` and set it again would have
turned the character through fifty-seven times the angle it asked for. Fixed,
with a test that now does exactly that round trip.

## Not established

- What bit `0x800` on a character's halfword actually means.
- That the party is four, as opposed to four being what fits.
- What writes the party slots and the count.
- What vocation an attending character has. `attnpc` does not say, so whoever
  joins is given the Hero's.
- **Why six legwear parts the presets name are on neither archive.** The
  reading — that those bodies are robes and dresses that cover the legs — is
  INFERRED from looking at two of the thirteen. The other eleven have not
  been looked at, and that is eyes-on work.
- Where a preset's hair comes from, if anywhere: the record names none.
- What the 75 item ids at the head of a preset are for.
- What values 75, 77, 88, 89 and 92–101 of a preset mean.
- Everything else in §2, and the rest of §3.
