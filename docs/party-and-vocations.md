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
**sixteen dress**. The thirteen that do not are almost all one problem:

- **Twelve name parts that are well-formed and not in `chara_pc.gp2`** —
  `p_b501`, `p_p201`, `p_p190` and others. Whether they live in
  `chara_pd.gp2`, the larger rig `FORMAT.md`'s "Character parts" mentions, is
  **not established**. Five of the twelve want the same `p_p190`, so finding
  that one archive would answer most of it at once.
- **One is the file being odd**, and `FORMAT.md` already says so by hand:
  preset 23's legwear is `8001`, which is in no part band and names nothing.

Two things in the dressing are **ours** and say so in the code. Hair: a preset
names a face, armour, legwear, gloves, footwear, headgear, a weapon, a shield
and the arms, and **nothing about hair at all**, so every preset wears the
Hero's until character creation offers a choice. And the face mapping —
`9006` to `p_f006` — is INFERRED, from `FORMAT.md`'s note that the value lands
on a face that exists across all 41 presets.

### What is still missing

Alltrades and the change flow; the skill trees, of which only the 12×5 table
of tree *numbers* is read and nothing of panels, costs or abilities; and
spending skill points, which are read and shown and cannot be spent.

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

### What is still missing

The good news the survey found: the Hero is **already** assembled from parts
at runtime and it works — `dressFigure` over `chara_pc.gp2`, re-dressed live
on every equipment change. So assembly is not the blocker anyone feared.

What is: `Loaded` holds exactly one `figure`, so a second assembled character
needs that lifted out into a per-member record. The shared part library is
already the right shape to serve several. And nothing yet turns a preset into
an `Outfit`, or offers a choice of face, hair or proportions.

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
- **Where `p_p190`, `p_b501`, `p_p201` and the rest live.** Twelve of the
  twenty-nine presets want parts that are not in `chara_pc.gp2`;
  `chara_pd.gp2` is the obvious place and has not been looked in.
- Where a preset's hair comes from, if anywhere: the record names none.
- What the 75 item ids at the head of a preset are for.
- What values 75, 77, 88, 89 and 92–101 of a preset mean.
- Everything else in §2, and the rest of §3.
