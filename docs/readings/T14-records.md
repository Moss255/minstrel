# Task 14 — Battle Records and accolades

Read 6 October 2026 from the decomp's USA build (`~/Projects/dqix-decomp`,
symbols and relocations; the disassembly is `dsd dis` of its extract). Every
code address below is USA. The files were read on the European cartridge
with the project's own parsers.

## Where it stood

Nothing was built. `controls.ts` named SELECT "the Battle Records (not
built yet)"; accolades had no reader; the Abbey's revocation titles
(`0x0217f2ce`, 101 to 112) were listed as not built.

## Where the game keeps what was defeated, found and earned

All in `GameState`, beside one another (`func_020ac020`–`func_020ac4f8`):

| where | what | read by |
|---|---|---|
| `+0x7504`, 0x3C bytes | **the accolades earned**, bit `n` for accolade `n` | `func_020ac460` copies it out; `func_020ac3c8(buf, ids, n)` sets bits — its one caller is overlay 23's `func_ov023_021ed724`, which every awarding screen calls |
| `+0x7540`, 0xB0 bytes | **the records block** | `func_020ac4c0` copies it out, `func_020ac494` back — 103 and 32 callers |
| `+0x75f0`, 308 words | **the defeated monster list**: one word a monster, by its number 1 to 308 (`0x134`): bits 0–9 its defeated count (to 999), bit 10 a flag not read, bits 11–17 and 18–24 its two drops' counts (to 99) — read 11 October 2026, `apps/game/src/records.ts` | `func_020ac020(_, ids, out, n)` reads; `func_020abe84` writes, and counts a kind newly defeated (`func_020a0460`); the victory `func_ov023_021edf54`, the loot `func_ov023_021f2a48`, a theft `func_ov024_021df924` |
| `+0x7ac0`, 4 bytes | not read | `func_020ac08c`, `func_020ac0b4` |
| `+0x7ac4`, 471 halfwords (`0x3ae` bytes) | **the Alchenomicon's recipes** — *corrected 11 October 2026; first read as the item list*: an entry is `id << 2`, bit 0 known (every caller), bit 1 made | `func_020ac104` adds entries (callers: the action interpreter `0x02063088`, the bookcase service `func_ov017_021ac3b0`, and overlay 6 — the Krak Pot's, `str_ren` — `func_ov006_02153cbc`, which alone sets made) and, for one newly made, adds to a count in the records (`func_020a0434`); `func_020ac0dc` clears it |

Fields of the records block that were read:

| offset | bits | what | evidence |
|---|---|---|---|
| `+0x08` | 24–31 | title function 111 | `0x021e9944` |
| `+0x0c` | 0–6 | the highest grotto level cleared | function 252, `0x021eaea0` |
| `+0x0c` | 7–13 | the highest grotto boss level beaten | function 253, `0x021eaf50` |
| `+0x0c` | 14–27 | **grottoes cleared** | function 110, `0x021e9910`; `title_gyalel` gives 11 at 10 — "10th grotto clearance" |
| `+0x10` | 0–8 | **accolades earned** | function 112; `func_ov023_021ed724` adds the number awarded (`func_020a03c4`) and returns 1 when it was 0 |
| `+0x10` | 9–22 | title function 109 | `0x021e98dc` |
| `+0x10` | 23–31 | non-zero: the Records list Completion Records (flag `0x4`) | overlay 8 step 0, `0x02184ab8` |
| `+0x4c`… | bits | Stella's comments shown — functions 51 (test) and 52 (set) | `0x021e9278`, `0x021e92f0` |
| `+0x90`, `+0x92` | u16, u8 | the first completion's hours and minutes | function 201, `0x021eab28` |

## The accolades' table and names

`/data/bin/ttldata.gp2/ttldata_<LG>.bin` (ARM9 `func_020a13c4` loads it,
`func_020a15bc` finds a record), a command file: `0x67` is an accolade — its
number, its man's and woman's places in alphabetical order (observed, 442 of
442 each), two values not read, its line. Names: `ttlname0`/`ttlname1` by the
Hero's sex, bit 0 of `+0x49c` (overlay 23 `0x021f3d58`, `sprintf`
`ttlname%d`). `packages/game-formats/FORMAT.md`, "Accolades".

## What awards them

**Only scripts**, and the Abbey: `func_020ac3c8` is called only from
`func_ov023_021ed724`, whose callers are overlay 2 `0x021689e0` (the field
menu's skill screen, `func_ov002_021688f8`), overlay 3 `0x02157e40`
(`func_ov003_021575dc`, the Abbey's revocation step — its own list), overlay
8 `0x02185320` (the Battle Records), and overlay 23 `0x021f1e58` (the
victory's skill step) and `0x021f3d14` (the victory's `title_btl` step).

**The machine.** `func_0209fee4` (ARM9) sets up the event interpreter
(`func_ov017_021d4c04`) and registers overlay 23's function table
(`func_ov023_021eb000`, pairs at `data_ov023_021fddb8`: 95 functions, 0–2,
50–53, 101–177, 201–215, 251–253). `func_0209ff64(vm, 100)` starts section
100; `func_0209ff6c` steps it. Function **0** and **50** both append a number
to the list at `+0x68`/`+0x6a` (up to 50, `func_0209ffe0`); for the title
scripts it is accolades, for Stella's comment scripts comment numbers.

**The four scripts** (`data/scenario/`), every candidate a routine
beginning "has it already?" (function 1):

| script | where it runs | accolades | functions |
|---|---|---|---|
| `title_btl.stb` | victory step 15 (`func_ov023_021f3aac`, the 17 steps at `data_ov023_021fe148`) | 89–100, 2, 3–10 | 101, 251, 252, 253 |
| `title_skl.stb` | victory step 9 (`func_ov023_021f1868`, `0x021f1a70`); field menu (overlay 2 `0x02169194`) | 121–380 | 106 |
| `title_clr.stb` | Battle Records open, when the records' `+0x10` top bits are 0 and flag `0x796` is set (overlay 8 `0x02184ae0`–`0x02184b88`) | 425–454 | 201–215 |
| `title_gyalel.stb` | Battle Records open, when Stella's comment script gave none (overlay 8 step 2, `0x02184cf8`) | 11–88, 113–120, 381–424 | 102–124, 130, 134, 135, 165 |

`title_btl` and `title_skl` award every candidate due; `title_clr` and
`title_gyalel` return after the first (`push 1; return`).

**The functions read** (overlay 23 handlers):

| n | handler | does |
|---|---|---|
| 0, 50 | `0x021e915c`, `0x021e9244` | add the number to the list |
| 1 | `0x021e9190` | whether accolade n is earned, into a reference |
| 2 | `0x021e9208` | two values from `func_0201079c`, `func_020107d0` — not read further |
| 51, 52 | `0x021e9278`, `0x021e92f0` | test, set a bit of the records' `+0x4c` |
| 53 | `0x021e934c` | `func_0201081c`: the Story So Far's number |
| 101 | `0x021e9370` | a member's vocation (`+0x950`), its level (`+0x16c + v*2`), its experience (`+0x138 + v*4`) |
| 102 | `0x021e93e0` | a member's sex |
| 103 | `0x021e9424` | whether a member wears each (slot, item) pair given — outfits |
| 104 | `0x021e94cc` | one of a member's attributes, by index 0–11 |
| 105 | `0x021e96a8` | the sum of an attribute over what a member wears |
| 106 | `0x021e9818` | a member's points in a skill tree, byte `+0x464 + tree` |
| 107, 108 | `0x021e9864`, `0x021e98a0` | `+0x130`'s halfwords 4 and 6 |
| 109–112 | `0x021e98dc`… | record fields, above |
| 113–116 | `0x021e99a8`… | `func_020a0870`, `090c`, `08a4`, `08d8` over the records — not read |
| 117 | `0x021e9a78` | `+0xf68` of `func_02010828`'s — not read |
| 118 | `0x021e9a9c` | today's date (`func_020cf0fc`) against the Hero's birthday (`GameState+0x569c`) |
| 201 | `0x021eab28` | the first completion's time |
| 251 | `0x021eae38` | a monster's defeated count |
| 252, 253 | `0x021eaea0`, `0x021eaf50` | a grotto's level cleared, its boss's — 0 outside a grotto |

The rest (119–177 bar those above, 202–215) are not read.

**A member** is the first value: 0–3 a party slot, −1 the character
`GameState+0x3ac` names (`func_ov023_021e8f28` → `func_020100a8`) —
INFERRED the Hero; −2 and below the party list's. All four scripts ask
about −1 alone.

**The award's lines**: `str_tg` 100, "<ACTOR> is awarded the auspicious
accolade <str_2>!", and 1000 after it the first time — `func_ov023_021ed724`
returns 1 when the records' count was 0 (overlay 23 `0x021f3d24`, kept at
`+0x5d5`, `func_ov023_021f2348`).

## The Battle Records

**Reached two ways**, both by `func_ov017_021c05f4` → `func_ov017_021c0760`
(service **41**, mode at `+0xbc`): the field's SELECT Button (`0x0218cecc`;
`func_02012444(pad, 4)`, game-wide flag **`0x119a`**, the field free, a
sound) and the field menu's row (overlay 2, `0x021624dc`; the row's word is
`strstd` 21 "Battle Records", listed by `func_ov002_0215c178` on the same
flag). **What sets `0x119a` was not found**: no literal outside the tests,
no trigger action, no script push (searched every `.stb` for 4506 as a
constant and a sum). Stella's own event, `ev22593` (2.6, Angel Falls),
explains the X and SELECT Buttons.

**Overlay 8, `func_ov008_02184a4c`**, as it opens (step 0):
game-wide flag **`0x113b`** set means no comment and no award (flag `0x80`):
trigger action **162** sets it on `162:0` and clears it on `162:1` (case 62,
`0x02063094`) — set at 4.7 (`ev5110`), 14.4 and the ending, cleared at 5.2
(`ev5300`), 14.6 and 19.2: Stella away. Otherwise either `title_clr`
(above) or `data/scenario/cmtFileTbl.bin` entry 1000, `cmtHeader.stb`
(`func_020727f8`) — Stella's comment — and, when it gives none, `title_gyalel`.
`cmtFileTbl.bin` maps a number to a comment script and its text: 1 to 148 by
the story's progress (`cmtB13` … `cmtQ141`), 1000 `Header`, 1001 `Clear`,
1002 `TailC`, 1003 `TailG`.

**The menu** (`func_ov008_02186cec`): entries 0, 2, 1 always; 3 with flag
`0x1198` (the Alchenomicon — the Krak Pot's book sets it); 4 with the
records' flag `0x2000`; 5 with `0x119d` (the Quest List, set by an action,
`0x02063000`); 6 with `0x119b` (Accolades Earnt; `str_tg` 1000 says it
opens); 7 with flag `0x4` (Completion Records). The entries are pictures,
`cell_jrm_<LG>.pac`. The summary's words are `str_jr`: 100 "<TARGET> the
<str_1>'s battle records.", 120–125 Battle Victories, Times Alchemy
Performed, Accolades Earnt, Quests Completed, Grottoes Completed, Guests
Canvassed; 130–133 the four completions. The list's are `str_tl`: 0
"Accolades Earnt", 100 "This list is currently empty.", 1000 "By Number",
1001 "By Name".

## Not found, and where the search stopped

- What sets `0x119a`, `0x119b` and the records' `+0x2000` (above).
- Where the Item List and the Wardrobe are kept — not at `+0x7ac4`, which is
  the Alchenomicon's (above, corrected 11 October 2026).
- Where the records' victories, alchemy count and guests are kept: the
  block's other fields are not tied to them.
- What `+0x7ac0` holds, and the item list's two flag bits.
- Title functions 119–177 and 202–215, and the comment scripts' choosing.

## Stella's comments (read 11 October 2026)

**The files.** `data/scenario/cmtFileTbl.bin` is a command file run as a
`Script` (`func_020727f8`, opcode table `0x020f0cc8`): tag `0x103` records
of an entry number and three strings — the entry's text archive, its member
(`B13_<LG>.bin`) and its script (`cmtB13.stb`). Entries 1 to 148 are the
Story So Far's numbers (147 has none); 1000 Header, 1001 Clear, 1002 TailC,
1003 TailG. A text member is a command file of tag `0x67` records: kind, a
message number, the man's line and the woman's.

**The scripts.** Each entry's section 100 is a run of candidates, as the
title scripts are: call a test routine; when it returns 1, function 50 with a
message number (the header's 1001 on, B13's 2001 on), function 52 with the
candidate's bit (the records' `+0x4c` bits; 0 to 58 the header's, 59 on the
next file's), and return 1 — the first that holds is the comment. The tests
ask function 53 (the Story So Far's number) for a range, function 171 — the
wireless session (`func_0202ae18` → `func_0202c540`), which must be 0 — and
function 51, whether the bit is already set; and many ask more (below).

**Overlay 8's flow** (`func_ov008_02184a4c`): as the Records open, with
`0x113b` clear (Stella not away), the header (entry 1000) runs — or
`title_clr` after the ending (its flag `0x2`). Its list's first number
(`+0x6a`, count `+0x68`) is the comment. With none, `title_gyalel` may
award. Then, with no comment yet (`+0xb14` ≤ 0), the entry numbered by the
Story So Far (`func_0201081c`) runs; with none from it, TailC (1002; TailG
1003 in a wireless session), once (flag `0x100`). The comment shown is the
entry's (`+0xb16`) text message (`+0xb14`), the man's or the woman's line by
the Hero's sex (`func_ov008_02185dc0`, `0x02185fe8`–`0x0218604c`).

**Why it is not built.** 620 candidates in all; with the functions read
(0, 1, 50–53, 101, 102, 106, 110, 170, 171, 252, 253), 104 can be answered —
and only 1 of the header's 59. Since the first that holds is shown, a test
not answerable cannot be passed over without showing a comment the game
would not yet give. The functions most asked, and what they read:

| function | asked by | reads |
|---|---|---|
| 157 | 152 | `func_02011494` − 1 |
| 107, 108 | 127, 88 | a member's `+0x130` halfwords 4 and 6 |
| 129, 134, 127, 128 | 94, 34, 23, 20 | the records block's `+0x3c`, `+0x40`, `+0x34`, `+0x38`, low 24 bits |
| 130 | 26 | the records' `+0x08`, low 24 bits |
| 123 | 62 | the records' first word, through `func_ov023_021e8fe8` |
| 169 | 61 | the records' `+0x20`, high half |
| 177 | 56 | `func_02086aec(party, n)`: how many of an item the party holds (INFERRED from its other callers) |
| 174 | 35 | bit 4 of `func_02012fe4()`'s `+0x8` |
| 165, 158, 140 | 31, 22, 21 | a member (`func_020100a8`, `func_0200ff1c`); `func_02011494`; the records' first halfword |

What the records' counters count is the open question — the summary's
victories, alchemy and guests among them (task 14's "not found").
