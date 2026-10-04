# T10b. Four single questions: the drop passes, the critical doubling, the sound ids, the victory's waits

All code addresses are for the **USA** build (the decomp, `config/usa`; disassembly in
the decomp's disassembly). Data facts (skill panels, `str_bres`, the SDATs) were read from the **EU**
cartridge with the project's own parsers in scratch tests (`apps/game/test/zz-panels`, `zz-sound`,
`zz-bres`), since deleted. Nothing was committed or edited in the repository.

---

## 1. The drop roll's four further passes — what scales them

`func_ov023_021f454c`, outer loop `r7` = pass 0…4 (`0x021f4618`, ends `cmp r7,#5` at `.L_021f4b60`).
Pass 0 is the ordinary roll (`[sp+0x18]` = 100, and the drop record's `+5` byte = −1). For pass
`k` ≥ 1 (`0x021f4628`–`0x021f46b8`):

| step | address | what |
|---|---|---|
| member | `0x021f4634` | `id = func_02011518(GameState, k−1)`: byte `GameState+0x571d+(k−1)`, −1 past the count at `+0x5721` (the party lineup) |
| object | `func_0200ff1c(GameState, id)` | the member's game object; none → **pass skipped** |
| present | `0x021f4658` | `func_020a35e0([battle+0x2a0], id)`: bit `id` of `[+0x34]`; absent → skipped |
| standing | `0x021f4668` | `func_02010088(obj)`: `[obj+0x138]+0x14` bit 0, the dead flag (H-result-flags §: set when HP reaches 0); dead → skipped |
| **half the rounds** | `0x021f4678`–`0x021f468c` | `(float)func_02053dfc(obj) / (float)u16[battle+0x58cc] < 0.5f` → skipped. `func_02053dfc` = `[[obj+0x19c]+8]`, the counter `func_02053dd0` adds 1 to for each present, living member once a round (ov026 sub-state 5, `0x021dacb0`). `battle+0x58cc` is stored at `0x021ee0c0` from `[[battle+0x29c]+0x8e20]`, the round counter |
| **the trait** | `0x021f469c` | `func_02083b00([obj+0x150], 0xa4)`: bit `0xa4` of the bitset at character record `+0x8ec` (the skill panels held; FORMAT.md "The eleventh panel…"). Not held → skipped |
| **the scale** | `0x021f46ac` | `L = func_0202053c(obj)` = u16 at `rec + 0x16c + 2 × rec[0x950]` — **the member's level in their current vocation** (same reading as `experience.ts`, `TreasureMapMetadata.cpp`'s `levels[13]` at `0x16c`). Stored to `[sp+0x18]`; and the member's id to the drop record's `+5` (`0x021f46b4`) |

**Panel `0xa4` = 164, read from `skilltable.bin` (EU): tree 19 "Acquisitiveness", cost 0, the
tree's eleventh (book-granted) panel; `sta_skl` label "Autofilch"; grants 0 (message only).**

**So the conformance doc's "above half its HP" is wrong**: it is *half the battle's rounds alive*.

Then, in the ordinary (non-grotto) path, for each kind of monster (same list, same "all fled" skip):

```
rare:   N = data_ov023_021fd888[rec+0x03]           (1, 8, 16, 32, 64, 128, 256, 0)
        N ≤ 0 → try ordinary
        pass 0:  n = N; n = 1 if kind entry +0 bit 14 (0x021f49e8–f4)
        pass k:  n = (N × 100) / L   (_s32_div_f, 0x021f49d0); n = 0 if step == 0 (0x021f49e0)
        n ≤ 0 → try ordinary;  func_02032370(n) == 0 → won (rare, +4 = 2), next kind
ordinary: the same with rec+0x02, bit 15, +4 = 1  (0x021f4a6c–0x021f4b2c)
```

Each landed drop bumps `battle+0x5900`; at 8 the whole roll stops (`0x021f4b4c`). Passes ≥ 1 **do
not skip kinds that already dropped** — a kind can give a second item. The forced bits 14/15 apply
only in pass 0. A pass-k drop's record carries the member at `+5`, which sub-state 13 says as
**`str_bres` 37** "`<DEF_ART_ACTOR>` manages to steal `<INDEF_ART_SGL_I_NAME>`!" (I-battle-end §).

The grotto/legacy-boss path (`[battle+0x2a0]+0x24`/`+0x25` set, `0x021f46c4`–`0x021f4900`) scales
the same way, as `byte × L / 100`, 0 when the byte ≥ 100, against `NextRandomMax(GetBTRandom(),
100)` — the battle's generator. Not the slice's.

After the passes (`0x021f4b68`–`0x021f4bf0`) every present member with the same rounds ratio ≥ 0.5
gets bit `place` in `battle+0x5901`. Its reader is not read.

Side finding: kind-entry bits 15/14 ("always drop the ordinary/rare") come from bytes `+0x16`/`+0x17`
of the 0x18-byte group records at `bdata+0x81b4` (`ov000 0x021552bc`…), set by
`func_ov024_021e2298` for every group whose step < 7. Which action that handler is was not read.

**The change** — `packages/sim/src/battle/drops.ts`, `dropsWon(state, rng)`:
- after the existing loop (pass 0), for `k` = 1…4 over the party lineup, member `k−1`: skip unless
  present, `hp > 0`, `Math.fround(roundsAlive) / Math.fround(rounds) >= 0.5` (the game's floats),
  and the member holds panel 164; `L` = their current vocation's level;
- for each kind in the same order and with the same `beaten` test: rare, then ordinary, each with
  `N = DROP_CHANCES[step]`, skip if `N <= 0` or `step === 0`, `n = Math.trunc(N * 100 / L)`, skip if
  `n <= 0`, land on `rng.below(n) === 0`; rare landing skips the ordinary;
- `won.length >= 8` stops everything, across passes;
- `DropWon` gains `by?: number` (the member), and `settleBattle` (`apps/game/src/main.ts`) says
  `str_bres` 37 with that member as ACTOR for such a drop instead of 17 + 19.
- The doc comment's "above half its HP" and "the series' item-finding abilities" become "half the
  rounds alive" and "panel 164, scaled by vocation level". `docs/conformance.md` lines 876–878 the same.
- Unreachable in the slice unless a member carries the book for panel 164; the rounds counter is
  already in `sharesOf`'s input.

---

## 2. The critical rate's doubling

`func_ov000_02156cc4`, party branch (`0x02156d88`–`0x02156dc0`):

```
rate = CalculateCritRate(...)                    0x02156d80
if func_02083b00([attacker+0x150], 0x11d)        0x02156d8c, literal 0x11d at 0x02156e28
   and func_ov000_02155a04(attacker) < 0.25f     0x02156da0, 0x3e800000
      rate = rate × 2.0f                         0x02156db8
threshold = (int)(rate × 100.0f); hit = NextRandomMax(10000) < threshold
```

- **Trait `0x11d` = skill panel 285** (same bitset at record `+0x8ec`): tree 26 "Ruggedness", cost
  0, the tree's eleventh (book-granted) panel; `sta_skl` label **"Critical in a Crisis"**; value 4
  (`grants`) = 3, the "critical hit rate" kind.
- **`func_ov000_02155a04(c)`** (`0x02155a04`) = `(float)u16[[c+0x138]+0] / (float)u16[[c+0x138]+4]`,
  and 0 when the first is 0. Those are `PrimaryCombatStats.currHP` and `.maxHP`
  (`include/Combat/Main/BattleList.h`). **The quarter is a quarter of max HP: current HP below 25%.**
- The monster branch (`func_020748f8`) never doubles.

**The change** — `packages/sim/src/battle/damage.ts`, `criticalChance(deftness, skillPercent,
passes)` gains `crisis = false`: after `per`, `if (crisis) per = f(per * f(2))`, then
`Math.trunc(f(f(100) * per))` as now. `battle.ts:537` passes
`crisis = holdsPanel(me, 285) && f(f(me.hp) / f(me.maxHp)) < 0.25` (and `hp === 0` counts as
`< 0.25`, as the game's 0 does — moot, a fallen fighter does not strike). Golden test: deftness 150,
plain attack, crisis → 400; deftness 159 → 416 (2 × the game's 208). ×2 is exact in single
precision, so the threshold is exactly `trunc(2 × f(100 × per))`. Unreachable in the slice unless
the book for panel 285 is carried. `docs/conformance.md` row 34 and line 885 can be closed.

---

## 3. The sound ids

### Jingles (`<ME_n>` → `n + 49`; `func_0209c6d8` and `func_0209c830`)

**There is no remapping table. The id is the `bgm.sdat` sequence number, and `bgm.sdat`'s SYMB
names sequence 50 `ME_001` … 68 `ME_019`, so `<ME_n>` names `ME_00n` exactly.**

- The music player `snd` = `data_02109bf4` opens **`data/sound/bgm.sdat`** (`func_0209c290`,
  path `data_020f1730`; called at boot, `main_18.s` line 678, and by ov001/004/016/017).
- `func_0209c6d8(snd, n)` → `func_0203aaf8(snd, n, 0)` → `func_020bdc98(n)` (load) and
  `func_0203aba8(snd, n, snd+0xc4)` → `func_020be760(handle, n)` → **`func_020bd454(n)`**: `INFO`
  block (`[arc+0x8c]`), its list at `+0x8` (sequences), `count` then offsets; record `n` directly.
  Its `+9`, `+4`, `+8` (player, bank, priority) are what `func_020be828` is given. INFERRED:
  `NNS_SndArcPlayerStartSeq`.
- EU `bgm.sdat` read: 82 sequence slots; 48 and 49 empty; **50–68 = ME_001–ME_019**: 52 `ME_003`
  (the Abbey's), 53 `ME_004` (level), 54 `ME_005` (victory), 58 `ME_009` (wipe-out), 62 `ME_013`.

**`playJingle(rom, id)`** (`apps/game/src/music.ts:103`) = `songAt(bgm, id)` = `sdat.sequences[id]`,
the INFO sequence list **indexed with gaps kept** (`readSdat` pushes empty slots,
`nitro-snd/src/sdat.ts:285–297`). **It matches.** 0x35, 0x36, 0x3a and 52 are right as they stand,
and a `<ME_n>` cue can be played as `playJingle(cartridge, cue.id)` with the id `talk.ts` already
computes. The comment in `talk.ts:189` ("What that id space is has not been read") is answered.

**But the text tag's call is not the battle's call.** `func_0209c830(snd, id)` (`0x0209c830`)
only stores `+0xce = id`, `+0xc9 = 1`; `func_0209c840` (per frame) then:

| state `+0xc9` | what |
|---|---|
| 1 | wait `+0xca` = 800; if the BGM (`+0xb0` = 1) is playing, `func_020bc180(bgm, 0, 20)` (INFERRED: move volume to 0 over 20 frames); if not, wait 0 → 2 |
| 2 | after the wait (`GetEffectiveDeltaTime`, **milliseconds** per the decomp), pause the BGM (`func_020bc068(bgm,1)`, INFERRED pause), load and start sequence `id` on `+0xc4`; wait 500 → 3 |
| 3 | once `func_020bc0a4(id)` ≤ 0 (INFERRED: count of that sequence playing) **and** 500 ms more: stop it, unpause, volume back, `func_0209c2e0(snd, [+0xcd], 30)` → 0 |

`func_0209c6d8` (the battle's ME_004/005/009) stops the BGM at once (`func_0209c678(snd,0)`) and
starts the jingle with no delay. So an engine `<ME_n>` should: fade the music out over 20 frames,
start the jingle 800 ms after the request, and bring the music back 500 ms after the jingle ends.
`music.jingle` today pauses at once and resumes at once.

### Effects (`<SE_n>` → 14; `func_0205eaa0(se, n, 0)`)

**The effect id is an entry of one sequence archive (SSAR): `[se+0xb4]`, which is 100 on the field
and 101 in battle.**

- `func_0205eaa0(se, n, 0)` → `func_0203ac40(se, [se+0xb4], n, 0)` → `func_020be7a8(handle,
  arcNo, n)` → **`func_020bd4b8(arcNo)`**: INFO list at `+0xc` (sequence archives), record `arcNo`;
  then entry `n` of it (`func_020c01ac`). INFERRED: `NNS_SndArcPlayerStartSeqArc`.
- `func_0205ea20(se, a)` (`0x0205ea20`) opens `data/sound/se_norm.sdat` (`data_020f057c`) for
  `a` = 100, `data/sound/se_btl.sdat` (`data_020f0594`) for 101, loads SEQARC `a`, sets
  `+0xb4 = a`. Called with 100 at boot (`main_18.s` line 683), and in ov000 (`ov000_1.s` line 22539),
  ov001 and ov004; with 101 in battle (`ov000_1.s` line 16501; `music.ts` cites `0x02164028`).
- EU read: `se_norm.sdat` SEQARC 100 has 205 entries, entries 1, 6, 14, 28 present; `se_btl.sdat`
  SEQARC 101 has 103, entries 1, 9, 21, 28 present and 14 absent. The battle's effects 9 (flight)
  and 21 (chest) exist only in 101, which agrees.

So `<SE_014>` on the field is **`se_norm.sdat`, SEQARC 100, entry 14**; `<EXC>` 6 and `<QES>` 28
likewise. `playEffect(rom, index, slot)` takes (SEQARC, entry), so the call is
**`playEffect(cartridge, 100, 14)`**. The old attempt failed because it called
`playEffect(cartridge, 14)` — SEQARC 14, which `se_norm` does not have. In battle a text `<SE_n>`
would ask SEQARC 101 entry 14, which does not exist: silent, which the game would be too (INFERRED).

**The change**: `apps/game/src/main.ts` near 10826 (the cue handler) — for `cue.kind === 'ME'`,
`playJingle(cartridge, cue.id)` with the delayed/ducked timing above; for `'SE'`,
`playEffect(cartridge, FIELD_EFFECTS /* 100 */, cue.id)`. Add `FIELD_EFFECTS = 100` to `music.ts`
beside `BATTLE_SOUNDS = 101`. Update the comments in `talk.ts:180–196` and `docs/still-open.md`.

---

## 4. Victory: the jingle wait, the spell line, the tutorial line

Sub-state 7 = `func_ov023_021f0a5c`, steps in `R+0` (`R = [data_ov023_021ffefc]`), member `R+0x18`.

### 4a. The waits for `ME_004`

- Step 4 (`0x021f0ea0`…) puts up line 10/22 + 34 and **starts `ME_004` at `0x021f1010`** (only for
  a member in the party list, `func_02086ef0`; otherwise steps 5's line and the jingle are skipped,
  `R+0 += 2`).
- **Step 5** (`0x021f105c`) waits for a key (`func_ov023_021f4fc8`) **without** waiting for the
  jingle → line 38 + 34.
- Step 6 (`0x021f10f8`) chooses what follows, no wait.
- **Step 7** (`0x021f11d8`): `if func_0209ca2c(snd)` (jingle requested or `+0xce` ≥ 0 and still
  playing) → stay, **without calling the key test** — a press during the jingle is not taken. Only
  once it has ended is `func_ov023_021f4fc8` asked (`0x021f11e8`); on a key, go to `R+0xe5`
  (10, 12 or 8) or, at −1, back to step 0 and the next member.

So there is **one** wait for the jingle, after line 38's key and before what follows 38.

### 4b. The new spell line (`str_bres` 12)

**When**: at step 1 (`0x021f0cf8`), for a member who levels and is in the party list,
`func_0209aa54(R+0xf0, R+0x1c + i×0x14, obj, oldLevel)` walks the vocation's rows of the in-RAM
spell table `T = [R+0xf0]`: entries at `T + 0x10c + v×0x50 + j×4` (u16 place, u16 level), count at
`T + 0x51c + v×4`, `v = rec[0x950]`. Each with `oldLevel < level ≤ newLevel` is learnt
(`func_02083b60(rec, place)`, INFERRED: sets it learnt) and its **place** stored as a byte; the
count goes to `R+0x6c+i`. Step 6 sends to **sub-state 10 when that count ≠ 0** (`0x021f115c`) —
i.e. after the jingle has ended and a key after 38.

**Sub-state 10** (`func_ov023_021f2368`), one spell per key:
- `place = R+0x1c + i×0x14 + R+0x70`; `func_0209a9dc(R+0xf0, place)` → the `0x66` record
  (place, action) (`0x021f23cc`); `func_02079e2c(func_020797dc(), action)` → the action's
  `actdt_a/b` record (`0x021f23e4`);
- text = `str_bres` **12** + `str_bres` 34 (`0x021f2410`); TARGET (`W+0x10`) = the member
  (`func_020e4bf4`); **`<str_2>` = the action record's `+0x00`**, its name (`func_02046574(W, 1, …)`,
  `0x021f2460`: slot 1 is `str_2`, strncpy 63). Said only when the member's object exists and is in
  the party list.
- "`<Cap><DEF_ART_TARGET>` learns a new spell: `<str_2>`!`<ADD>`" (EU English).
- The order is the table's row order for the vocation (INFERRED: `spelltable.bin`'s file order);
  at most 20 a member (the 0x14-byte list, INFERRED from the stride).
- After the last: skill points gained (`battle+0x579c + i×0x54` u16 bits 7–15) → **12**; else, in
  the party list, `func_ov023_021f5228(i)` and unspent points (`rec+0x564` ≠ 0) → **8**; else → **7**.
  Each by a key (`0x021f25e4`), which also calls `func_ov017_021ccea4(i, list, count)` (not read).

### 4c. The first-time tutorial line (`str_bres` 36)

**Sub-state 8** (`func_ov023_021f1234`) is **the skill-point allocation screen** (overlay 13), not
only the tutorial. It is reached:
- from step 6 of sub-state 7 when no spell, no points gained, but unspent points and a tree under
  100 (`0x021f1188`–`0x021f1198`);
- from sub-state 10's last spell, same test;
- **from sub-state 12** (after "*n* skill points earned.", `str_bres` 13 with `<val_1>` = the points)
  when the member is in the party list and `func_ov023_021f5228` holds.

`func_ov023_021f5228(i)` = true when any of the current vocation's five trees
(`func_020dd11c(voc, j)`, j = 0–4) has `rec[0x464 + tree]` < 100.

On entry it closes the results window (`+0x5588`) and the command windows and builds the overlay-13
screen. Then, step 0 (`0x021f1344`): **if game-wide flag `0x119c` is clear** (`func_0206dfb0`,
`0x021f1360`): set it (`0x021f137c`), and — member in party list — say **`str_bres` 36**
(`0x021f1390`, no `<ADD>` appended; the text ends in its own) and wait for a key (step 100); then
close the box and fade the main screen to −16 over 16 frames (`0x021f1430`). If the flag is set:
close the box and fade at once. Flag `0x119c` is the one the Misc menu tests for "Allocate Skill
Points" (T02-heal-all.md), which is what line 36 announces.

### The change — `apps/game/src/main.ts`, `settleBattle` (and `ResultsSlot`)

Order per member who levels, replacing lines 9055–9079:
1. 10/22 + `jingle: LEVEL_JINGLE` (as now);
2. 38, with a new slot flag `waitJingle: true`: the page after 38 may not be turned until the
   jingle has ended — keys pressed while it plays are dropped. Needs `jingling` added to
   `MusicReport` (`packages/audio/src/worklet.ts`, from `Ensemble.jingling`, `render.ts:119`) and
   read in `turnPages`/the key handler;
3. **new**: for each spell with `vocation = member.vocation` and `before.level < level ≤
   after.level`, in the spell table's file order: `str_bres` 12 with `target` = the member and
   `str_2` = the action's name (`here.actions.get(spell.action)`), one page each (`slots.push({})`);
4. 13 if points > 0 (as now);
5. **new**: if any of the member's five vocation trees is under 100 points and they have unspent
   points: close the results window (a slot that clears `resultsShown`); if story flag `0x119c`
   is clear, set it and say `str_bres` 36 (four pages — it holds three `<PAGE>`s); then open the
   skill screen for that member (`menu.ts`'s `skills`), the battle's end waiting on it. The engine's
   Misc menu entry 4003 should also be gated on flag `0x119c`, as T02 read.

Note the results window then stays closed for the gold and the items (sub-state 8 closed it, and
11/13 do not reopen it).

---

## INFERRED / not established

- `func_020be760` / `020be7a8` / `020bdc98` / `020bc180` / `020bc068` / `020bc0a4` as the NNS calls
  named (StartSeq, StartSeqArc, LoadSeq, MoveVolume, Pause, CountPlayingSeqBySeqNo) — from their
  arguments and the INFO list offsets they read, not from symbols.
- The text-tag jingle's 800/500 ms are `GetEffectiveDeltaTime` units, milliseconds by the decomp's
  member name `effectiveDeltaTimeMilliseconds_`; the 20 and 30 are taken as frames.
- That `<SE_n>` in battle is silent (SEQARC 101 has no entry 14).
- `rec[0x950]` as the current vocation (project's reading, `companion.ts`), `rec+0x564` as unspent
  skill points (from the clamp to 2600 and `+=` gained points at `0x021f0c80`–`0x021f0cb4`),
  `rec[0x464+tree]` as points in a tree (from the `< 100` test).
- That the action record's `+0x00` is a name pointer in RAM (the file holds the name's offset).
- `func_02083b60` setting a spell learnt; the spell-row order being the file's; 20 a member.
- What reads `battle+0x5901` (the rounds ≥ half mask); which action `func_ov024_021e2298` (forced
  drops) belongs to; `func_ov017_021ccea4`, `021ce704`, `021cc730`, `021c9e00`.
- The rounds counter counts rounds: `func_02053dd0` is called once per command-phase end for present,
  living members (P-command-flow §, `experience.ts`) — read as rounds, still INFERRED.
- Whether a pass-k drop's kind also gets the forced bits (it does not, by the code: only pass 0
  reads bits 14/15).
- Panel names are the EU English `sta_skl`; the panel ids and the bit numbers are the same field,
  by FORMAT.md's skill-book reading (`func_ov026_021dc8fc` sets bit = the book's panel id).
