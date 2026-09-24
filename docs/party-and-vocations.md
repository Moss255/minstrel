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

## 2. Vocations

Not yet read. See `docs/beyond-the-slice.md` for what the phase asks for: 13
level tables rather than one, the skill trees, and the change flow at
Alltrades.

## 3. What a character is

Not yet read. The slice plan calls runtime character assembly "the hardest
asset problem in the project", and it is the thing most likely to decide
whether this phase's done-when is reachable.

## Not established

- What bit `0x800` on a character's halfword actually means.
- That the party is four, as opposed to four being what fits.
- What writes the party slots and the count.
- Everything in §2 and §3.
