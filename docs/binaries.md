# What the binaries hold

A record of what has been found in the cartridge's code — the ARM9 binary
and its 35 overlays — as against its files. Begun 16 September 2026, when the
vocations' skill trees turned up in the ARM9 after every search of the
cartridge's files and raw bytes had missed them: **the ARM9 is BLZ-packed on
the cartridge**, and so are some overlays, so a search of the cartridge's own
bytes cannot see what the code holds. Unpack first (`decompressBlz` in
`@minstrel/nitro-comp`; the header says where the ARM9 lies, the overlay
table where each overlay does and whether it is packed).

Offsets are into the *unpacked* image of the reference dump (see
`apps/game/src/cartridge-id.ts`). Every reader finds its table by shape, not
by offset, so another build of the game yields it or says it is not there.
Nothing here is copied into the repository; each is read at runtime.

| what | where | shape | read by | evidence |
|---|---|---|---|---|
| **The vocations' skill trees** | ARM9 `0xEE758` | 13 rows × 5 bytes: row 0 all zero, then row v for vocation v — four weapon/shield/fisticuffs trees (1–14) and the vocation's own (15–26), in the level tables' order. `vocationSkillTrees` in the decomp (USA `0x020ee748`); corrected 17 September from `0xEE75D`, the first row with a vocation in it | `readVocationTrees`, `game-formats/src/vocations.ts` | the shape, unique in the ARM9 and every overlay; the own trees running 15 to 26 in order; the minstrel's row holding the sword, the fan and the shield the let's play's Hero wields. FORMAT.md, "Vocation skill trees" |
| **The battle weight tables** | ARM9 `0xE8CBA` (USA `0x020e8caa`, `monsterActionWeights` in the decomp) | a run of tables of six bytes summing to 256: `43 42 43 43 42 43`, `68 58 48 38 27 17`, `210 29 10 4 2 1`, `70 70 70 16 15 15` | `readWeightTables`, `battle-tables.ts` | the first two are the reference battle emulator's even and boss tables exactly, which it had from the game's disassembly; the run is found by the first. FORMAT.md, "Battle weight tables" |
| **Which monster draws by which** | `mon_btldata.nat`, byte `+0x27` bit 4 | a flag | `MonsterBattle.bossAi` | set on 144 of 159 boss-coded monsters and on the five grotto bosses with ordinary codes; clear on the bosses' minions and every other monster; set on the reference's own boss. Read as: set → the falling table, clear → the even. Which monsters, if any, draw by the third and fourth tables is not read |
| **The field sprites' ids** | overlay 17 `0x4AFCC` | 16 entries of (id, pointer to a name), ended by id −1 and an empty name: `tsubo_01–03` 5, 6, 7; `taru_01–03` 8, 9, 10; `fuki_hkn` 4, `fuki_com` 2, `fuki_in` 3; `field_mon01` 12, `ev_mark` 13, `field_qu` 14, `fuki_com_q` 15, `fuki_com_apc` 16, `field_satori` 17. `fieldSpriteFiles` in the decomp (USA `0x021d656c`) | not yet | the name list at `0x4BE99` and the pointers to it; the −1 and empty name that close it; the code's one reference, which is to the first id. The ids are the game's own numbering of the pot, barrel and bubble sprites; how a treasure's kind chooses among them is still in code, unread — but the shape to look for is now known: field objects carry a radius and a height per record and the engine sets them through `Object3D`, so a pot's are data somewhere too, not a constant. **Corrected 17 September:** first read as (pointer, id) from `0x4AFD0`, which paired each name with the next entry's id and missed `field_satori` |
| **A monster's body** | overlay 17 `func_ov017_021a2128`, which ends by calling `Object3D::SetRadius` and `SetHeight` (the decomp's names; USA `0x020377c4` and `0x020377b4`, **EU 0x10 above**) with `ldrsh r1,[r5,#0xc]; lsl r1,r1,#2` and `ldrsh r1,[r5,#0xe]` | `r5` is an entry of the collection at `+0x2F8` of the resident map, which `0x021b5250` fills from `/data/prm/mon_data.gp2/mon_data_<LG>.nat`. So the record's `+0x0C` is a radius in 1024ths and `+0x0E` a height in `fx32` | `readMonsterNames`' records; FORMAT.md, "Monster data" | the numbers sort the bestiary: the slime 0.80 by 0.80, Greygnarl 7.80 by 5.25, none of the 438 negative. `tools/harness/test/monster-body.test.ts` |

## Looked at and not identified

- **`1024, 2560, 2048, 1024` are heap sizes, not chances** — settled 19
  September: `func_0208b8c4` hands each to `SafeAllocator::Allocate`. The rest
  of this entry stands.
- **Beside the weight tables**, ARM9 `0xE8C60`–`0xE8D40`: before them, sixteen
  words from `0x0E35` to `0x1051` — 12-bit fixed-point multipliers near 1,
  0.89 to 1.02, perhaps — then `02 03`; after them `03 01 04 02 02 03 01 00`,
  the float 0.2, the words 1024, 2560, 2048, 1024, four pointers into the
  ARM9, and the floats 1.3 and 1.0 by `0x80`, `0x60` and `0xD3`. Any of these
  may be the critical, dodge or flee chance; none is tied to one yet.
- **The reference's monster tension table**, `1.3, 2.0, 3.0, 4.5`
  (`Enemy_TensionTable` in the reference battle emulator): not in the ARM9 or
  any overlay as a run of floats, doubles, 4096ths in words or halfwords, or
  tenths in bytes. The float 1.3 at ARM9 `0xE8D24`, beside the weight tables,
  stands alone between `0x80, 0x60` and a 1.0, so it is not tied to tension.
- **The words before the weight tables' neighbours**, ARM9 `0xE8C40`: pairs
  `(7, 125)`, `(8, 181)`, `(9, 189)`, `(11, 213)`, then two `0xFFFFFFFF`. Not
  identified.
- **The inn's price**: no string names an inn in the binaries (`inn`, `yado`,
  `hotel` are absent); the only run of eight or more halfwords in multiples
  of five is `1100, 1200 … 2000` at ARM9 `0xE6EC4`, which does not look like
  inns. The price the innkeeper's `<val_2>` shows is still not found.

## Still to look for

Each with the shape a search would go by, the witness that would confirm a
find, and what to do if the binaries do not give it up. The witness matters
more than the shape: a run of plausible bytes with nothing independent to
check against is not a find.

| what | shape to search by | witness | otherwise |
|---|---|---|---|
| **How experience is shared** | not a table: the battle-result strings (`/data/bin/str_bres.gp2`, `str_bres_en.bin`, 6 to 9) name up to four members each with their own amount, and 26 says "Each party member receives some experience!", so the game pays per member. A fan forum gives the split as the battle's total over the party's summed levels, times each member's level, with the dead paid by rounds alive; nothing on the cartridge confirms it | a let's play's result screen with two members in the party, whose levels are on screen: the two amounts should stand in the ratio of the levels and sum to the monsters' total | the emulator, one fight with Ivor in the party and one without, against the same monster |
| ~~**The Hero's critical chance**~~ | **found** — `CalculateCritRate`, decompiled in `src/Combat/Main/CritRateCalculation.cpp`: 2.0 + 0.01 × max(0, deftness − 150), plus bonuses. `docs/conformance.md` | the reference's 200 in 10,000 is its base exactly | — |
| **The flee chance, and the words beside the weight tables** | `1024, 2560, 2048, 1024` read against 32768 are 1/32, 5/64, 1/16 and 1/32; against 4096, a quarter and more — and the float `0.2`. The dodge (2 in 100) and a monster's lack of criticals are the reference's and in the sim already | the let's plays' flee attempts, succeeded and failed | the emulator, fleeing a weak monster many times |
| **The damage spread** | the sixteen 12-bit words before the tables, `0x0E35` to `0x1051` — 0.888 to 1.020 in 4096ths, perhaps the multipliers a roll of the damage picks from | the let's plays' damage numbers already checked against the reference formula: their spread should sit inside these bounds and no others | keep the reference's spread, which the let's plays fit |
| **Which monsters draw by the third and fourth tables** | a field in `mon_btldata.nat`'s records with values 0–3 that agrees with the boss bit for the first two; or the code that indexes the run, in the overlay that runs battles | the `210 29 10 4 2 1` table would show as a monster that almost always takes its first way; a let's play against one | the emulator, a long fight with such a monster, counting its ways |
| **The inn's price** | the engine function the innkeeper's script calls to fill `<val_2>` — find the innkeeper's talk script's function numbers first (`packages/script`), then the code behind the one that computes a price; a multiply by the party's size near a small constant | the price the let's play's innkeeper names, with a party of one; the same again with two | the emulator: rest with one and with two in the party |
| **A treasure's kind → sprite** | the code in overlay 17 that reads the table at `0x4AFCC` (`func_ov017_0219b624` in the decomp, USA); a map object's kind value against ids 5–7 (pots) and 8–10 (barrels) | the let's play's pots and barrels on the maps we show, against the objects' kinds in the map files | the emulator, one of each on a known map |
| **How the game keeps time** | the decomp names five values at USA `0x020f030c`–`0x020f031c`: `s_dayTransitionLength`, `s_eveningLength`, `s_dayLength`, `s_morningLength`, `s_nightLength` — read those first; otherwise frame counts for the day's steps — `7200` (`0x1C20`, our 120 s at 60 Hz), `9000` (`0x2328`), or a table of steps — near the code that sets the night pieces; a saved-game field the time goes in | the let's play's evening and night in 2.2, whose seconds are ours; a second video with a different pace would show the rule | leave ours: 120 s to evening, 150 s to night, from the let's play |
| **The Hero's starting purse** | the new-game initialiser's constants: level 1, the starting gold, the first items | the let's play's first look at the gold | the emulator's new game |
| **Ivor's numbers as a guest** | a table of guest party members — a row holding a level and HP, MP, attack, defence, agility that match what Ivor shows in the let's play's fights | the let's play's battle screens with Ivor in the party | the emulator, Ivor's status screen |
| **The shops' selling price** | a constant ratio — `75` or a multiply-by-3-and-shift near the shop code; or a table of ratios by kind | the let's play's sale of one item whose price the item table gives | the emulator, selling one item |
| **The drop chance's steps** | the table the monster record's drop-rate field indexes — 1/2 … 1/256, or 4096ths | the reference emulator's or the community's drop rates for a known monster | the reference's table, marked INFERRED |
| **Which zone roams when** | the code that picks a map's encounter zone by the hour; a table of hour bounds | the let's plays: night on 2.2 roams the night zone; day, the day's | leave ours: the zone kind by the time of day |

The party's colours, Ivor's greeting and the menus' sounds are the files' and
the layouts', not the binaries', and are listed in `docs/next.md`.

## How to search

`scratchpad`-style scripts are not kept; the approach was: unpack the ARM9
and every overlay, then scan for a shape known from the files — a row that
must contain three known values, a table whose rows must end in a rising
sequence, a run of sixes summing to 256 — rather than for values recalled
from anywhere else. A shape unique across the ARM9 and all overlays, with
one independent witness (a let's play, a preset, the reference emulator), is
what counts as found.
