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
| **The hair's shape letters** | ARM9 USA `0x020e883c` (`data_020e883c`) | ten bytes, `bbdcc\0cea\0`, indexed by a headgear's model number ÷ 100 | `hairLetter`, `apps/game/src/hero.ts` | its one reader, `func_02072e94` at `0x02072fc8`, copies it to the stack and indexes it; a `\0` returns no part. Read 4 October 2026 |
| **The battle weight tables** | ARM9 `0xE8CBA` (USA `0x020e8caa`, `monsterActionWeights` in the decomp) | a run of tables of six bytes summing to 256: `43 42 43 43 42 43`, `68 58 48 38 27 17`, `210 29 10 4 2 1`, `70 70 70 16 15 15` | `readWeightTables`, `battle-tables.ts` | the first two are the reference battle emulator's even and boss tables exactly, which it had from the game's disassembly; the run is found by the first. FORMAT.md, "Battle weight tables" |
| **Which monster draws by which** | `mon_btldata.nat`, byte `+0x27` bit 4 | a flag | `MonsterBattle.bossAi` | set on 144 of 159 boss-coded monsters and on the five grotto bosses with ordinary codes; clear on the bosses' minions and every other monster; set on the reference's own boss. Read as: set → the falling table, clear → the even. Which monsters, if any, draw by the third and fourth tables is not read |
| **The field sprites' ids** | overlay 17 `0x4AFCC` | 16 entries of (id, pointer to a name), ended by id −1 and an empty name: `tsubo_01–03` 5, 6, 7; `taru_01–03` 8, 9, 10; `fuki_hkn` 4, `fuki_com` 2, `fuki_in` 3; `field_mon01` 12, `ev_mark` 13, `field_qu` 14, `fuki_com_q` 15, `fuki_com_apc` 16, `field_satori` 17. `fieldSpriteFiles` in the decomp (USA `0x021d656c`) | not yet | the name list at `0x4BE99` and the pointers to it; the −1 and empty name that close it; the code's one reference, which is to the first id. The ids are the game's own numbering of the pot, barrel and bubble sprites; how a treasure's kind chooses among them is still in code, unread — but the shape to look for is now known: field objects carry a radius and a height per record and the engine sets them through `Object3D`, so a pot's are data somewhere too, not a constant. **Corrected 17 September:** first read as (pointer, id) from `0x4AFD0`, which paired each name with the next entry's id and missed `field_satori` |
| **A monster's body** | overlay 17 `func_ov017_021a2128`, which ends by calling `Object3D::SetRadius` and `SetHeight` (the decomp's names; USA `0x020377c4` and `0x020377b4`, **EU 0x10 above**) with `ldrsh r1,[r5,#0xc]; lsl r1,r1,#2` and `ldrsh r1,[r5,#0xe]` | `r5` is an entry of the collection at `+0x2F8` of the resident map, which `0x021b5250` fills from `/data/prm/mon_data.gp2/mon_data_<LG>.nat`. So the record's `+0x0C` is a radius in 1024ths and `+0x0E` a height in `fx32` | `readMonsterNames`' records; FORMAT.md, "Monster data" | the numbers sort the bestiary: the slime 0.80 by 0.80, Greygnarl 7.80 by 5.25, none of the 438 negative. `tools/harness/test/monster-body.test.ts` |
| **A space's width in each font** | ARM9 USA `data_020e7bd8` (and `data_020e7a94`, words, the same low bytes) | two bytes, `02 03`, by font number — 0 `s7`, 1 `me` (`func_02042944`); a space or a character with no glyph is that + 1 | `SPACE_WIDTH`, `apps/game/src/staff-roll.ts` | read by the text drawer (`func_0204f41c`) and the measurer (`func_020420e8`), both adding 1. Read 6 October 2026, task 11 |
| **The staff roll's heading colour and file** | overlay 28 USA, the literal `0x67F5` at `0x021d9178` and `data_ov028_021d9aa0` | BGR555, into the sub screen's colour 5; `data/evspt_lv5/staffroll.bin` | `HEADING_COLOUR`, `STAFF_ROLL_FILE`, `staff-roll.ts` | the set-up's step 2 and 3 (`func_ov028_021d8dd0`); the roll's whole reading is `docs/readings/T11-ending.md` |
| **The maps that mark a Zoom place reached** | overlay 17 USA `0x021d6638` (`data_ov017_021d6638`) | 18 halfwords, map ids: entering the n-th sets game-wide flag `0x200 + n` (`func_ov017_0219e290`, from the map's load at `0x0219d7b0`) — 1100, 1200, 100, 1300, 20007, … 400 | `readPlaceMaps`, `game-formats/src/travel.ts` | found by shape against `loola_en.bin`: the n-th is the town of the n-th place's revival map or its Zoom map, on all 18, and no other run in overlay 17 has it. Read 6 October 2026, `docs/readings/T12-travel.md` |
| **The flight of Zoom and the wing** | overlay 17 USA `func_ov017_021acdf4`, `0x021acdf4`–`0x021adac0`; the effect's name `data_ov017_021d7978` | a task's states: the effect `data/effect/em1810.chr` at each one flown and sound archive `0xb2` entry 0; hidden past 40 vblanks, black over 30 past 100, the map past 140; the ceiling: past 55 dropped 9.8 (`0x9ccc`) and falling `0x51 × n` a pass (`func_0203348c`), `strstd` 57, the camera shaken `0xcc` for 1000 ms, entry 1 | `zoom-flight.ts`, `apps/game` | read 6 October 2026, `docs/readings/T12-travel.md`, "The flight" |
| **A map's start point** | ARM9 USA `func_0201d494`, opcode `0x6E` of `data_020ef388`, the `.bmbl`'s reader | x, y, z and a facing in radians, kept at the map's `+0x6c + 0x70`/`+0x7c`; a map request with no place stands the party there (`func_ov017_0219c598`, `0x0219c648`) | `mapStart`, `game-formats/src/transitions.ts` | one `0x6E` of four floats on 667 of 667 `.bmbl`. Read 6 October 2026 |
| **A set battle's own revival map** | ARM9 USA `func_02061c04` case 80, `0x0206339c` | trigger action `180 : b, m`: during set battle b the request's `+0x22` = m, which the wipe-out passes (`func_ov017_021b790c`, `0x021b7c8c`) | `lostRevival`, `game-formats/src/story.ts` | on 2 records: 14 → 2309, 16 → 5700. Read 6 October 2026 |
| **What an opened treasure sets, and what comes back** | ov017 `func_ov017_021adcb0` `0x021ae528`–`0x021ae58c`; `func_ov017_0218b688` `0x0218c180` | a red chest's flag `0x212 + id`, anything else's `0x79e + id`; the field's start clears `0x2bc` from `0x79e` | `openedFlag`, `game-formats/src/treasure.ts`; `beginPlay`, `main.ts` | the treasure files' ids: 0–206 for red chests, 0–699 for the rest, so the 700 cleared are exactly theirs. Read 6 October 2026, `docs/readings/T13-gathering.md` |
| **The gathering spots' code** | ARM9 `func_0208e520`–`func_0208f168`, strings at `0x020f12b8`–`0x020f1356` | `F%02dflditem.bin` in `data/scenario/flditem.pac`, `fldbias.bin`, `data/bin/izmitm.bin` for `R01M07`; the spot words at `GameState+0x5cdc`, the variant at `+0x5cda`; a minute is `0x42700000`, 60.0; the sparkle `ev999990300.chr` (ov017 `0x0219b834`) | `readGatheringSpots`, `game-formats/src/gathering.ts`; `sim/src/gathering.ts` | the files read whole by the code's own opcodes; 87 spots, ids unique. Read 6 October 2026, `docs/readings/T13-gathering.md` |
| **The accolade scripts' functions** | overlay 23 USA `data_ov023_021fddb8` | 95 pairs of handler and number, ended by a null handler; registered by `func_ov023_021eb000` into the event interpreter's table | `hostOf`, `apps/game/src/accolades.ts` | function 0's handler appends to the list every awarding screen reads; 1 tests `GameState+0x7504`'s bits; the four `title_*.stb` call only numbers in the table. Read 6 October 2026, `docs/readings/T14-records.md` |
| **The accolades earned, the records, the defeated and item lists** | `GameState+0x7504` (0x3C bytes), `+0x7540` (0xB0), `+0x75f0` (308 words), `+0x7ac4` (471 halfwords) | bits by accolade; the records' counts as bit fields; a word a monster, low 10 bits its count; `id << 2` and two flags an item | `accoladesEarned`, `main.ts` (the earned set); the rest not kept | `func_020ac020`–`func_020ac4f8`, and the title functions reading them. Read 6 October 2026 |
| **The command phase's fixed shots** | overlay 26 USA `data_ov026_021de87c` | 47 records of 28 bytes — a key, an eye and a look-at in `fx32` — ended by −1; the key a monster's kind (`mon_data` `+0x10`), 0 for monster 801; `0x115`'s three by the round mod 3 (`func_ov026_021d8aac`) | `readFixedShots`, `fixedShotFor`, `game-formats/src/fixedshots.ts`; `openingShot`, `apps/game/src/stage.ts` | found by shape; the keys are the bosses' kinds `0x101`–`0x133` and two whales'; the hexagoon's eye 4.8 from its row. Read 6 October 2026, `docs/readings/T15-presentation.md` |
| **The chase's start poses** | overlay 0 USA `data_ov000_021832c4` | four of (yaw, height, distance): ±162° and ±18° (`0x2d3c`, `0x505`, reduced), 0.5, 5 or 10 | not used — the first follow's cut covers them | `func_ov000_0216e678`, a forced start. Read 6 October 2026 |
| **The battle's pass** | overlay 17 USA `0x0218c78c`–`0x0218c7b4`; `GameState+0x3c8` | the field's loop waits for two vblanks a pass — 30 a second; `+0x3c8` the vblanks since the last, counted by `func_02012bd8` | `PASS_MS`, `apps/game/src/action-player.ts` | INFERRED that the battle updates once a pass. Read 6 October 2026 |
| **The climb's numbers** | ARM9 USA `func_02038598` (`0x02039184`–`0x020391a8`) and ov017 `func_ov017_021975e4` (`0x02197a60`) | literals: `0xf5` a pass up or down, `0x51` and `0xa3` getting on, `0x199` getting off, `0x1000` the top's drop, `0xccc` the push along it, `0x333` the turn | `ladder.ts` in `sim` | the climb's states read whole; seen in Dourbridge. Read 6 October 2026, `docs/readings/T16-getting-around.md` |
| **The three keys** | ov017 USA `0x021ae728`–`0x021ae730` | words `0x561c`, `0x561a`, `0x561b`: the ultimate, the thief's and the magic key | `KEYS`, `apps/game/src/treasure.ts` | the item names 22042–22044; the chest's lock test beside them (`func_ov017_021adcb0`). Read 6 October 2026 |
| **The ship's model** | ARM9 USA `data_020f1b52` | `data/chara_sub/s201.chr`, with `data/bin/percol.bin` and `data/ani/bg_slime3.pac`, read by the code before the Express's (`func_020a6084`–`func_020a7eb8`) | not yet — task 16b | the reference from the ship's own code. Read 6 October 2026 |
| **A monster's eight way rules** | ARM9 USA `data_020f10b0` | eight pointers-to-member of 8 bytes, by `mon_btldata +0x10` bits 5–7: `func_0208a4ac`, `4cc`, `4ec` (tables 0–2), `52c` (in turn), `50c` (table 3), `5d8` (pairs), `700` (first, then the rest), `840` (in turn by group) | `chooseFoe`, `packages/sim/src/battle/battle.ts` | its one reader `func_0208a91c`; the four table rules pass 0–3 to `func_0208a370`, which indexes the weight tables above. Read 6 October 2026, `docs/readings/T17-ai.md` |
| **The targeting handlers** | overlay 24 USA `data_ov024_021ff790` | 161 pointers-to-member of 8 bytes, by the action's `+0x0c` (mode 1) or `+0x0e` (mode 2); 0 the first handler `func_ov024_021edf6c` | `byHandler`, `battle.ts` | its one reader `func_ov024_021f66cc`; the handlers' own shapes match the actions that name them (Heal's 11, Sap's 22, the breaths' 157). Read 6 October 2026 |
| **The kinds' and the riders' handlers** | overlay 24 USA `data_ov024_021ff508` (81) and `data_ov024_021ff450` (22) | pointers-to-member of 8 bytes, by an action's kind (`+0x18` bits 5–11) and rider (bits 0–4); empty slots 0 | `partyChangeOf`, `apps/game/src/battle-scene.ts`; the change and blow paths of `battle.ts` | the actions on each slot do what their names say — Buff on 4, Zing on 18, Toxic Dagger's rider 4. Read 6 October 2026, `docs/readings/T18-handlers.md` |
| **A level's count, and the poisons** | ARM9 status `+0x58` (attack bits 0–2, defence 3–5, agility 6–8), counts `+0x6e`–`+0x70` (5, 6, 6); `+0x22` low bits 1 poison, 2 envenomation | as said | `States.attack`, `States.envenomed`, `sim/src/battle/states.ts` | their setters `func_020877c0`, `020878b4`, `020879a8`, `02088624`, `02088560`. Read 6 October 2026 |
| **The party's AI tables** | overlay 24 USA `0x021ff054` (the five tactics' functions), `0x021ff084`, `0x021ff0d8`, `0x021ff12c`, `0x021ff180` (21 × chance, MP need, lo, hi — by tactic), `0x021fefc2` (the ten actions decided in the command phase), `0x021ffeac` (79 evaluators by action kind) | as said | not yet — task 17b | `func_ov024_021f8f20`, `021f7478`, `021f9030`, `021f9660`, their only readers. Read 6 October 2026 |

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
- ~~**The inn's price**~~ (found 4 October 2026, as text — see the table below): no string names an inn in the binaries (`inn`, `yado`,
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
| ~~**The inn's price**~~ | **found, 4 October 2026**: text, not code — `str_in<n−1>` line 10000, a head's price, times the living (`0x0215d0d4`–`0x0215d108`); the Quester's Rest's a flat 3. See `apps/game/src/keepers.ts` | | |
| **A treasure's kind → sprite** — the kind is read now (6 October 2026): bits 4–6 the container, 1 and 2 taking different sheets (`func_02013d24`, `+0x480`… and `+0x48c`…); which sheet is which is still the decomp's naming | the code in overlay 17 that reads the table at `0x4AFCC` (`func_ov017_0219b624` in the decomp, USA); a map object's kind value against ids 5–7 (pots) and 8–10 (barrels) | the let's play's pots and barrels on the maps we show, against the objects' kinds in the map files | the emulator, one of each on a known map |
| **How the game keeps time** | the decomp names five values at USA `0x020f030c`–`0x020f031c`: `s_dayTransitionLength`, `s_eveningLength`, `s_dayLength`, `s_morningLength`, `s_nightLength` — read those first; otherwise frame counts for the day's steps — `7200` (`0x1C20`, our 120 s at 60 Hz), `9000` (`0x2328`), or a table of steps — near the code that sets the night pieces; a saved-game field the time goes in | the let's play's evening and night in 2.2, whose seconds are ours; a second video with a different pace would show the rule | leave ours: 120 s to evening, 150 s to night, from the let's play |
| **The Hero's starting purse** | the new-game initialiser's constants: level 1, the starting gold, the first items | the let's play's first look at the gold | the emulator's new game |
| **Ivor's numbers as a guest** | a table of guest party members — a row holding a level and HP, MP, attack, defence, agility that match what Ivor shows in the let's play's fights | the let's play's battle screens with Ivor in the party | the emulator, Ivor's status screen |
| ~~**The shops' selling price**~~ — **settled 22 September 2026**: it is each item's word at `+0x06`, from the guide's item lists; not a ratio | a constant ratio — `75` or a multiply-by-3-and-shift near the shop code; or a table of ratios by kind | the let's play's sale of one item whose price the item table gives | the emulator, selling one item |
| **The drop chance's steps** — read from the guide, 22 September 2026: the steps at `+0x02` are 0 always, 1–6 one in `2^(step+2)`, 7 none; the code's table would confirm it | the table the monster record's drop-rate field indexes — 1/2 … 1/256, or 4096ths | the reference emulator's or the community's drop rates for a known monster | the reference's table, marked INFERRED |
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
