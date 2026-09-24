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
`0x0201064c`) and **no write, in the ARM9 or in any of the overlays** — nor
any access at all to `+0x3980` besides the one above. Searched as both
`[base+0x3000, #0x97c]` and `[base, #0x397c]` forms. So recruitment writes
them some other way: through a held pointer, or as part of a bulk copy when a
save is loaded. That is the thread to pull when recruitment is implemented,
and it is not pulled yet.

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
the spend is per tree, which the record above confirms. **Nothing spends them
yet**, and the menu has no skill screen.

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

**One thing the Abbey does that this does not**: drop to the bag whatever the
new vocation or that character's sex may not wear. The apply reads item flags
at `[item + 4]` — two sex bits and a restriction bit — and unequips what
fails. Ours keeps it. The data for the rule is on the cartridge (armour
carries a vocation bit; weapons and shields go by skill tree), so this is work
not done rather than something unread.

### Revocation

**Read, not built.** `0x02155e38` resets **only the vocation currently held**
to level 1 and no experience, and increments a counter for it, hard-capped at
ten; everything else — other vocations, skill points, equipment — is
untouched. Reaching ten does something, and what is not established.

### What is still missing

Revocation, above. Dropping what a vocation may not wear, above. A skill
screen, so the panels can be looked at and bought. A skill screen, so the panels can be looked at
and bought — the data is read and the pool is modelled, and nothing spends it.
Character creation, recruitment and alchemy. And why every tree's eleventh
panel costs nothing.

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

### What is still missing, and why

None of this is guesswork about the game; it is work not done. Listed so that
what the phase left behind is visible rather than discovered later.

- **Character creation itself.** `?party=` makes the *thing* a recruit is — a
  member with no `attnpc`, a vocation and an appearance — but nothing asks a
  player for a name, a face, a hair style or proportions. A preset is
  currently the whole of an appearance, which means choosing one chooses face
  and clothes together rather than separately.
- **Recruitment at the Quester's Rest**, which is where the game makes them.
- **Alltrades and the vocation change flow.** `Member.vocation` is a field
  nothing can change in play.
- **The skill trees.** Only the 12×5 table of tree *numbers* is read — no
  panels, costs, abilities or unlock levels — and skill points are read and
  shown and **cannot be spent**.
- **Alchemy and mini medals**, which the phase lists and which nothing here
  has touched.
- **Hair.** A preset names none, so every created character wears the Hero's.
  Where a preset's hair comes from — if it comes from anywhere — is on the
  wiki's "not established" list.

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
