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
| **The ship's model** | ARM9 USA `data_020f1b52` | `data/chara_sub/s201.chr`, with `data/bin/percol.bin` and `data/ani/bg_slime3.pac`, read by the code before the Express's (`func_020a6084`–`func_020a7eb8`) | `ship.ts`, `apps/game` | the reference from the ship's own code. Read 6 October 2026 — `docs/readings/T16b-ship.md`: object 201, scale `0xa0` at sea and `0x180` moored, turn `0xc9`, top speed `0x106`, `10` faster or slower a vblank |
| **A monster's eight way rules** | ARM9 USA `data_020f10b0` | eight pointers-to-member of 8 bytes, by `mon_btldata +0x10` bits 5–7: `func_0208a4ac`, `4cc`, `4ec` (tables 0–2), `52c` (in turn), `50c` (table 3), `5d8` (pairs), `700` (first, then the rest), `840` (in turn by group) | `chooseFoe`, `packages/sim/src/battle/battle.ts` | its one reader `func_0208a91c`; the four table rules pass 0–3 to `func_0208a370`, which indexes the weight tables above. Read 6 October 2026, `docs/readings/T17-ai.md` |
| **The targeting handlers** | overlay 24 USA `data_ov024_021ff790` | 161 pointers-to-member of 8 bytes, by the action's `+0x0c` (mode 1) or `+0x0e` (mode 2); 0 the first handler `func_ov024_021edf6c` | `byHandler`, `battle.ts` | its one reader `func_ov024_021f66cc`; the handlers' own shapes match the actions that name them (Heal's 11, Sap's 22, the breaths' 157). Read 6 October 2026 |
| **The kinds' and the riders' handlers** | overlay 24 USA `data_ov024_021ff508` (81) and `data_ov024_021ff450` (22) | pointers-to-member of 8 bytes, by an action's kind (`+0x18` bits 5–11) and rider (bits 0–4); empty slots 0 | `partyChangeOf`, `apps/game/src/battle-scene.ts`; the change and blow paths of `battle.ts` | the actions on each slot do what their names say — Buff on 4, Zing on 18, Toxic Dagger's rider 4. Read 6 October 2026, `docs/readings/T18-handlers.md` |
| **The status levels' wear-off table** | overlay 0 USA `data_ov000_02182ad4`, read by `func_ov000_0215858c` | five floats by the count left: 1.0, 0.875, 0.75, 0.625, then `0x0000ffff` (a denormal only a draw of 0 is under); each status's count is run down a step and a draw `R(100)/100` taken against it | not applied — the sim keeps the reference's `wornAfterTurn` | the lines it hands each level as it wears off are the `actmsg` "<ACTOR>'s … returns to normal" run `0x1ce`–`0x1db`, one apiece. Read 6 October 2026, `docs/readings/T18-handlers.md` §9 |
| **The skills' scale table** | overlay 24 USA `data_ov024_021fe8b6`, read by `GetAttackBaseDamage` (`0x021e7ca4`) | seven `u16` quads — action, number (filled at run time), `lo`, `hi` — ending `−1`: 67, 68, 74 at 500–1,998; 102 at 300–999; 114 at 250–600; 144 at 500–1,998 | `SKILL_SCALES`, `packages/sim/src/battle/damage.ts` | the six are Gigaslash, Gigagash, Lightning Storm, Hand of God, Whopper Chop, Boulder Toss — the skills `docs/conformance.md` named — and each record says its amount scales (`+0x18` bits 16–17 at 2). Read 6 October 2026, `docs/readings/T18-handlers.md` §8 |
| **A level's count, and the poisons** | ARM9 status `+0x58` (attack bits 0–2, defence 3–5, agility 6–8), counts `+0x6e`–`+0x70` (5, 6, 6); `+0x22` low bits 1 poison, 2 envenomation | as said | `States.attack`, `States.envenomed`, `sim/src/battle/states.ts` | their setters `func_020877c0`, `020878b4`, `020879a8`, `02088624`, `02088560`. Read 6 October 2026 |
| **The party's AI tables** | overlay 24 USA `0x021ff054` (the five tactics' functions), `0x021ff084`, `0x021ff0d8`, `0x021ff12c`, `0x021ff180` (21 × chance, gate, lo, hi — by tactic; the gate is on the turns needed, corrected 6 October from an MP need), `0x021fefc2` (the ten actions decided in the command phase), `0x021ffeac` (79 evaluators by action kind), `0x021ffc98`/`0x021ffca4`/`0x021ffcc5` (the scorer's state weights), `0x021fefa0` (the combo multipliers 1.0, 1.2, 1.5, 2.0), `0x021fefb0` (weapon element → element), `0x021ffcec` (23 rider evaluators) | as said | not yet — task 17b | `func_ov024_021f8f20`, `021f7478`, `021f9030`, `021f9660`, `021f9874`, `021fa7ec`, their only readers. Scoring read whole 6 October 2026, `docs/readings/T17-ai.md` §2b |
| **A weapon's killer bonuses and element** | `itembtlprm.nat` `+0x08`–`+0x13`, twelve six-bit fields; flags bits 23–25 | tenths by family 1–12; an element 1–7, 0 the plain Attack's | `FAMILY_BONUS_FIELDS`, `weaponElement`, `game-formats/src/itembattle.ts` | ARM9 `func_02085968` … `02085888` (twelve) and `func_02085748`, read by the forecast `func_ov024_021fa7ec`; 928 records 10 throughout. Read 6 October 2026 |

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

### Task 18, the coups, the run-down, the lost turn and paralysis (6 October 2026)

`docs/readings/T18-handlers.md` §10. USA addresses; overlay 24 unless it says.

| address | what it does | name proposed |
|---|---|---|
| ov000 `func_ov000_021599f4`, `data_ov000_02182efc`, `data_ov000_02182a94` | each status's count a pass less on its holder's pass, and at 0 its second count started (4, or 1 for 0 Zone and Rough 'n' Tumble); the offsets and starts | `Battle::CountDownStatuses`, `StatusCountTable` |
| ov000 `func_ov000_0215858c` | corrected: the second counts' run-down, a draw of each status's own, by `0x02182ad4` or `0x02182bd4`; Knight Watch's own; the lost turn cleared first | `Battle::RunDownStatuses` |
| ov000 `func_ov000_0215833c` | the turn's start: paralysis freed (action 900), a sleeper woken (901), `+0x81`'s (0x3aa), by the turn-start draw | `Battle::RecoverAtTurnStart` |
| ov000 `func_ov000_02155f9c` | whether one cannot act: paralysis, sleep (`+0x14` bit 4), a lost turn (bit 19) | `Battle::CannotAct` |
| ov000 `func_ov000_0215767c` `0x02157ac0`, `0x02157b60`–`0x02157bb0` | one who cannot act has action 503 in their turn; a lost turn marked to clear | (part of) `Battle::PrepareTurn` |
| ov000 `func_ov000_02156068` | the target's body: family (0), metal `+0x0A` bit 12 (1), bit 11 (2) | `Battle::IsMonsterOfKind` |
| ov000 `func_ov000_02156f98` `0x02156fe8`, `02156270`, `02156558` | Rough 'n' Tumble: a dodge on the pass's die under 50, evasion 50.0, a counter on 50 to 74 | `Battle::RollEvasion`, `GetEvasionChance`, `RollCounter` |
| ov000 `func_ov000_02154f30` `0x02154f9c` | a watched monster's weighted pick: the Paladin, no draw | (part of) `Battle::PickTargetWeighted` |
| ov000 `func_ov000_02156648` `0x02156714`–`0x02156788` | Schizofanic's and Mist Me's one blow missed before the accuracy's draw | (part of) `Battle::RollAccuracy` |
| `func_ov024_021dc0b8` | kind 10: rider 1 with no chance of its own; done or fail line | `Resolver::HandleIntimidate` |
| `func_ov024_021ddf5c`, `func_ov024_021d974c` | kind 26, Spelly Breath; damage handler 48, the most MP × 0.2–0.5 | `Resolver::HandleSpellyBreath`, `Damage::SpellyBreath` |
| `func_ov024_021e1580` | kind 68, 0 Zone | `Resolver::HandleZeroZone` |
| `func_ov024_021e16a4` | kind 69, Itemised Kill: the group's `+0x16` | `Resolver::HandleItemisedKill` |
| `func_ov024_021e1824` | kind 70, Rough 'n' Tumble | `Resolver::HandleRoughNTumble` |
| `func_ov024_021e1cbc`; `func_ov024_021eb5d0` `0x021eba20`–`0x021eba9c` | kind 72, Voice of Experience; its multiplier, drawn in the resolver | `Resolver::HandleVoiceOfExperience` |
| `func_ov024_021e1de8` | kind 73, Knight Watch | `Resolver::HandleKnightWatch` |
| `func_ov024_021e1ed4` | kind 74, Brownie Boost | `Resolver::HandleBrownieBoost` |
| `func_ov024_021eadfc`; `func_ov024_021eaa50` `0x021eabd8` | under 0 Zone; the MP not asked | `Status::IsZeroZone` |
| `func_ov024_021e2bd0`, `021e8fa4`, `021e9018`, `data_ov024_021fe820` | rider 1: a lost turn by `+0x32`; the kinds' table | `Rider::LostTurn` |
| `func_ov024_021e3a34`, `021e9464` | rider 11: paralysis; its line | `Rider::Paralyse` |
| `func_ov024_021e8cfc` | tension taken away, line `0x25c` | `Resolver::ResetTension` |
| ARM9 `func_02088418`, `02088474`, `020884f8` | a lost turn: may take it, set, clear | `Status::CanLoseTurn`, `SetLostTurn`, `ClearLostTurn` |
| ARM9 `func_0208824c`, `0208826c` | paralysis: may take it, set (count 3 at `+0x5c`) | `Status::CanParalyse`, `Paralyse` |
| ARM9 `func_020890c0`/`d4`/`f4`, `02089110`/`24`/`44`, `02088e04`/`48`/`64` | 0 Zone, Rough 'n' Tumble, Knight Watch: test, set, clear | `Status::…ZeroZone`, `…Tumble`, `…KnightWatch` |
| ARM9 `func_020743d4`, `02074478` | `NextRandomFloatScaled`, `NextRandomBetween` | (named already) |
| ov023 `func_ov023_021f454c` `0x021f49e8`, `0x021f4ab0`; ov000 `func_ov000_02155184` `0x0215533c` | a sure drop, rare and ordinary, from the group's `+0x17` and `+0x16` | (part of) `Victory::RollDrops` |
| ov023 `func_ov023_021edf54` `0x021ee05c`–`0x021ee080` | the experience and gold times `battle + 0x8e3c` and `+0x8e40` | (part of) `Victory::Settle` |

### Task 18, the remaining kinds carried on (7 October 2026)

`docs/readings/T18-handlers.md` §11. USA addresses; overlay 24 unless it says.

| address | what it does | name proposed |
|---|---|---|
| ov000 `func_ov000_0215e6e8` | the round's end: guards cleared, then `0215a23c`, then (unless `battle+0x8e14`) `02157e1c` | `Battle::EndRound` |
| ov000 `func_ov000_0215a23c` | what the round's end gives back and tolls: the party's HP (a trait's 25, Right as Rain's), their MP (Focus Pocus's, trait `0x3f`'s), envenomation; the monsters' MP and toll | `Battle::RegenAndToll` |
| ov000 `func_ov000_02157e1c` | corrected: a draw at its head every round (`0x02157ea8`); Focus Pocus, Right as Rain, `+0x18` bits 11 and 6 worn down; the coup counted down | `Battle::CountDownAtRoundEnd` |
| ov000 `func_ov000_0215a16c`, `0215a1d4` | HP, MP given, held to the most | `Battle::GiveHp`, `GiveMp` |
| ov000 `func_ov000_0215c758` | the round's end's HP, MP and toll told, as actions 930–934 | `Battle::ShowRoundEndAmounts` |
| ov000 `func_ov000_02154f30` `0x021550ac`–`0x021550c0` | the vanished halved after the total is made | (part of) `Battle::PickTargetWeighted` |
| ov000 `func_ov000_02156648` `0x02156a90`–`0x02156ac8` | a dazzled striker's die of eight, last, for `+0x10` bit 3 | (part of) `Battle::RollAccuracy` |
| ov000 `func_ov000_02156b38` | the resistance whole: the byte plus Holy Impregnable's −25 (elements 9–21), `+0x18` bit 31's +25, elements 1–7's own −50s, held at 0, over 100 | `Battle::GetResistance` |
| ov000 `func_ov000_0215b5a0` `0x0215b6d0` on | Feel the Burn's mark: a draw against a table by tension, tension up (action 928) | (part of) `Battle::AfterAction` |
| `func_ov024_021dd534`, `021e9198` | kind 19, dazzle of the record's sort, and its lines for one already so | `Handler_Dazzle`, `GetDazzleLine` |
| `func_ov024_021e093c`, `021dec50`, `021e0a50`, `021df0f0`, `021deff8`, `021e1120`, `021e01b8`, `021e268c` | kinds 54, 36, 55, 40, 39, 64, 48, 78: Vanish, Schizofanic, Mist Me, Rotstopper, Alma Mater, Holy Impregnable, Right as Rain, Focus Pocus — the simple shape | `Handler_Vanish`, … |
| `func_ov024_021ea78c`, `data_ov024_021fe6e0` | Alma Mater against Whack, Thwack, Kathwack, Kamikazee | `IsHeavenlyProtected` |
| `func_ov024_021e6a90` `0x021e74f8`–`0x021e7530` | Rotstopper: half from a monster of family 8 | (part of) `CalculateFinalDamage` |
| arm9 `func_0202053c` | a member's level in their vocation | `Character::GetLevel` |

### Task 18, the last kinds (7 October 2026)

`docs/readings/T18-handlers.md` §12. USA addresses; overlay 24 unless it says.

| address | what it does | name proposed |
|---|---|---|
| `func_ov024_021dde08`, `021ded48` | kinds 25 and 37: Tap Dance's evasion and Immense Defence's shield, levels moved by `+0x30`, the record's lines | `Handler_Evasion`, `Handler_ShieldGuard` |
| arm9 `func_02087f24`, `02087f78`, `02087ff0` | evasion's level, `+0x58` bits 27–29 with `+0x14` bit 25: may move, move (count 5 at `+0x77`), clear | `Status::CanMoveEvasion`, `MoveEvasion`, `ClearEvasion` |
| arm9 `func_02088018`, `0208806c`, `020880e4` | the shield's level, `+0x58` bits 24–26 with `+0x18` bit 0: may move, move (5 at `+0x76`), clear | `Status::…ShieldGuard` |
| ov000 `func_ov000_02156118` `0x02156230`–`0x0215624c`, `02156258` | the chance of blocking doubled under `+0x18` bit 0 | (part of) `Battle::GetBlockRate`, `HasShieldGuard` |
| ov000 `func_ov000_02156270` `0x021563ac`–`0x021563c8`, `021563ec`, `02156404` | the evasion doubled under `+0x14` bit 25; 50 under `+0x18` bit 10 | (part of) `Battle::GetEvasion`, `HasEvasionUp`, `HasTumble` |
| `func_ov024_021e02b0`, `021ea85c` | kind 49, Disruptive Wave; the clear of everything magical, its tension's line | `Handler_DisruptiveWave`, `ClearMagicalEffects` |
| `func_ov024_021da998`, `021dd260` | `+0x14` bits 23 and 24 (the tension's two flags) | `HasTension`, `HasTensionB` |
| `func_ov024_021e80e4` `0x021e8560`–`0x021e85d4` | the action's line for kind `0x31`: `0xf1` for one, `0xf2` for more, the target `+0x44` | (part of) `Resolver::SetActionLine` |
| `func_ov024_021df454`, `021df6ec`, `021df704` | kind 43, Mens Sana: poison, envenomation, dazzle, Fizzle, `+0x18` bit 4 and every level below 0 | `Handler_MensSana` |
| arm9 `func_020885b4`, `02088644`, `02088514`, `02088598`, `02088874` | poisoned, poison cleared; envenomated, cleared; dazzle cleared | `Status::IsPoisoned`, `CurePoison`, `IsEnvenomated`, `CureEnvenomation`, `ClearDazzle` |
| `func_ov024_021dc540`, `021dc700` | kinds 13 and 14, M-Pathy and H-Pathy: the resolver's amount held to what the user can spare | `Handler_MPathy`, `Handler_HPathy` |
| ov000 `func_ov000_0215a124` | MP taken, held at 0 | `Battle::TakeMp` |
| `func_ov024_021de678`, `021de770` | kinds 31 and 32, Bounce and Reverse Cycle: the simple shape | `Handler_Bounce`, `Handler_ReverseCycle` |
| arm9 `func_020888e0`, `020888f4`, `02088914`, `02088930`, `02088944`, `02088964` | Bounce (bit 9, 5 at `+0x61`) and Reverse Cycle (bit 26, 5 at `+0x66`): may take, set, clear | `Status::…Bounce`, `…ReverseCycle` |
| `func_ov024_021e9f68` `0x021e9f68`–`0x021ea158` | the redirection: Bounce's and the equipment's turning back of `+0x10` bit 10, Reverse Cycle's of a breath | `Resolver::Reflect` |
| `func_ov024_021dfe9c` | kind 45, Eye for Trouble: a monster's `+0x17e` set, for the defeated list | `Handler_EyeForTrouble` |
| ov000 `func_ov000_021539dc`–`0x02153a0c` | Pincushion (`0x1dc`) at the command: `func_02088db8`, `+0xc1` high nibble 1 | (part of) `Battle::SetCommand` |
| `func_ov024_021e1328` | kind 66, Pincushion's handler: its done line only | `Handler_Pincushion` |
