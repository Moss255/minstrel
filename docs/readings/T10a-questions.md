# T10a — six single questions

Read 4 October 2026. **Code addresses are US** (the disassembly in
the decomp's disassembly, relocs/symbols in `~/Projects/dqix-decomp`). **Cartridge
values are from the European ROM** (`rom/dq9-europe.nds`), read with the project's
parsers in a scratch test, `apps/game/test/zz-t10a.test.ts`, since deleted.
Nothing in the repository was edited.

Tags: **read** = traced in the code at the address given; **INFERRED** = with the
reasoning given; **not established** = where the search stopped.

---

## 1. What sets the Abbey's three flags — **trigger records do, through three actions nobody had searched**

The premise "no trigger record sets them" held only for actions `100` and `130`.
The action interpreter `func_02061c04` (switch on `op − 100`, jump table
`0x02061c2c`) has **dedicated actions** for all three:

| action | case | code | does |
|---|---|---|---|
| **`223 : x`** | 123, `0x02064038` | `ldr r0,=data_02108844; ldrh r3,[r4,#2]; ldr r2,=0x799; add r1,r0,#0x8c; bl func_0206df6c` | **bit `0x799` := (x ≠ 0)** — the Abbey open |
| `224 : x` | 124, `0x02064054` | the same with `0x798` (`.L_020643cc`) | bit `0x798` := (x ≠ 0) — not one of the three |
| **`231 : x`** | 131, `0x0206414c` | unless `func_0202ae18`→`func_0202c540` is non-zero (INFERRED: a wireless guest), `bit 0x796 := x` (`0x02064160`–`0x02064170`); then, once (guard: bit 24 of `[GameState+0x74d0]+0x18`), packs the clock (`func_020ac0b4`, `func_020a0870`/`08a4`/`08d8`/`090c`), the Hero's `[+0x134]+0x30` and the play time `[P+0xf68]+[P+0xf6c]` into that record and sets the bit (`0x02064174`–`0x0206435c`) | **bit `0x796` := (x ≠ 0)** — revocation offered; INFERRED: the record is the "game cleared" stamp |
| **`160 : v`** | 60, `0x02062fd8` | `ldrh r2,[r4,#2]; mov r3,#1; add r2,r2,#0x3f; add r2,r2,#0x1100; bl func_0206df6c` | **bit `0x113F + v` := 1** — the Abbey's own sum (`func_ov003_02156054`, `0x021560a4`–`0x021560ac`) |

`223` names the bank as `data_02108844 + 0x8c` itself, which is what
`func_0205ec34` returns (`0x0205ec34`) and the Abbey tests (`0x02156278`). `160`
and `231` use the interpreter's own object `+0x8c`, the same bank `100`/`101`
use (settled in `docs/party-and-vocations.md`, 3 October).

**On the cartridge** (EU, `allTriggers` → `entriesOf`; none of 160/223/231 takes a
parameter in `PARAMS`, and each appears as an operation, not as a label value):

| flag | record | words |
|---|---|---|
| **`0x799`** | `T01` (Tower of Trades) map 9008, span 6.5, the outcome record of **`ev26510`** — two records | `8:26510 23:2 0:8 … 208:4201 223:1 197:93 132:0(6,6,1) 114:22169 100:7 141:1` and `8:26510 23:2 141:1 223:1 114:22169 100:7 132:0(6,6,1)` |
| **`0x796`** | `X04` (Realm of the Mighty) map 4403, 17.2 — the record that plays **`ev29300`, the credits** (`docs/story-walk.md`), after set battle 25 | `12:25 119:29300 148:0(19,2,1) 197:147 208:109 231:1` |
| `0x1146` (v 7) | `X02` map 4202, 1.1–19.99, character 103 | `55:103(25:0) 11:194 127:25 160:7 106:103 176:25(0:0)` |
| `0x1147` (v 8) | `X02` map 4201, character 105 | `55:105(27:0) 11:194 127:27 160:8 176:27(0:0)` |
| `0x1148` (v 9) | `C02` map 201, 6.1–19.99 | `8:50261 160:9 127:26` |
| `0x1149` (v 10) | `C04` map 405, 7.1–19.99 | `6:200 20:124 11:200 127:124 160:10` |
| `0x114A` (v 11) | `C02` map 219, 6.1–19.99 | `6:219 11:195 160:11 127:128` |
| `0x114B` (v 12) | `D07` map 7700, 7.1–19.99 | `6:202 20:28 11:194 127:28 160:12` |

Every `160 : v` sits beside a `127 : q` (a quest **cleared**, FORMAT.md): quest
25 → 7, 27 → 8, 26 → 9, 124 → 10, 128 → 11, 28 → 12. So **each advanced vocation
is unlocked when its quest is handed in**. Nothing clears any of them (no
`223:0`, `231:0`). `224 : 1` sits on `R01`–`R04` records at 4.1–19.9 (`0x798`).

Other code that sets bits in the `0x1136…` band (not the Abbey's): `0x113E`
(`func_0201229c`, `0x0201233c`), `0x113F` (`func_02052d7c`, `0x02052dc4`, on
equipping anything but places 7/8), `0x1140` (ov017 `0x0218d238`), `0x1141`
(ov002 `0x02157810`), `0x1142` (ov001 `0x0216305c`), `0x1143`
(`func_020abf60`, `0x020abfbc`, once `0x796` is set). Every other literal
`0x799`/`0x796` in the binaries is a **test** (`0x0208ee0c`, `0x020ab7a4`,
`0x020abf80`, ov008 `0x02184ae8`, ov017 `0x0219275c`, `0x021a4c58`); no setter
computes either from a base (`func_0206eb64`'s `id + 0x6FA` path starts at
`0xAFA`).

**What changes in the engine:**

1. `packages/game-formats/src/story.ts`, `outcomeOf` (the `globals`/`unglobals`
   lists, beside `args(OP_SET_GLOBAL)`): add
   - `223 : x` → `0x799` into `globals` when `x ≠ 0`, `unglobals` when 0;
   - `224 : x` → `0x798` the same way;
   - `231 : x` → `0x796` the same way (the guest guard and the clear-stamp are
     not ours to build now);
   - `160 : v` → `0x113F + v` into `globals`.
   With named constants (e.g. `OP_ABBEY_OPEN = 223`, `OP_REVOCATION_OPEN = 231`,
   `OP_VOCATION_UNLOCK = 160`) and these addresses.
2. `apps/game/src/abbey.ts`: `abbeyOpen`'s stand-in (open at the Abbey thread's
   7.1) goes; the game's gate is `0x799` alone, set when `ev26510`'s record runs
   at 6.5. The file comment "No record and no script on the cartridge sets any
   of them" is wrong.
3. `apps/game/src/main.ts`: the `?revoke=` stand-in is no longer needed —
   `0x796` arrives with the credits' record at 17.2.
4. `apps/game/src/companion.ts`, `VOCATION_FLAG`'s comment: set by action `160`
   on the six quest hand-in records above. Whether minstrel runs those records
   depends on the quests being runnable — **not checked**.
5. `docs/party-and-vocations.md` "Ours": the three setters are now read.

## 2. What writes the party's slots and count — **an ordinary field-wise writer, through a base the earlier search never tried**

The slots are **`P + 0xF78`** and the count **`P + 0xF7C`**, where
**`P = GameState + 0x2A04`** (`func_02010828`: `add r0,#0x204; add r0,#0x2800`,
`0x02010828`). `0x2A04 + 0xF78 = 0x397C`. The search in
`docs/party-and-vocations.md` looked for offsets `0x97c`/`0x397c` and for bases
built into `0x3900`–`0x39ff`, so it missed every access through `P` — there are
dozens of reads (`ldrb …,[rP,#0xf78]` in main_28/32/34/36/66/67, ov003, ov006,
ov026 …) and these writes:

| where | what | how |
|---|---|---|
| **`func_ov017_02191108`**, `0x02191204`–`0x02191220` | **the rebuild**: `strb list[i], [P+i, #0xf78]` for i < n, then `strb n, [P, #0xf7c]` | the list comes from `func_ov017_02190884` (below). **25 callers**, among them the action interpreter (action `203`, case 103 at `0x02063b28`: revive the fallen at full/half/1 HP by its value, then rebuild), Quester's Rest/overlay 3 (`0x0215af00`, `0x02166a90`), the field's setup (`func_ov017_0218b688`), `func_ov017_02190264` (renumber after someone leaves) |
| `func_020a95a4`, `0x020a9704`–`0x020a972c` | **the save load**: `memcpy(P+0xF78, src+0x1D0D, 4)`, `strb [src+0x1D11] → P+0xF7C`; the roster `P+0xF80` (count `P+0x2C8C`) from `src` | called from `func_020aaf84`, which reads a block with `func_02075910` and checks it (`func_01ff85b8`) before unpacking — INFERRED the save load |
| `func_0208660c`, `0x020866b8` | the new game: count := 0 | called from `func_0200f3a4`, GameState's reset |
| ov000 `func_ov000_02166e5c`, `0x0216724c`–`0x02167264` | appends object **1** (`slot[n] = 1; n += 1`) after loading a CCHR into a new object | ov000 is the battle overlay (decomp-contributions); INFERRED a guest joining a battle |
| ov000 `func_ov000_021688dc`, `0x02168ab4`–`0x02168ac4` | count −= 1 | the same guest leaving, INFERRED |

**What a slot holds and in what order** (`func_ov017_02190884`, read):

- A slot is a **game-object index** (it goes to `GetPartyMemberByIndex`).
- Candidates are objects **3 down to 0** that pass `func_0200ff58` (object flag
  `0x1000`) and whose `+0x2D0` byte equals the caller's player number
  (`func_020546a8`; 0 alone), plus that player's own object (`func_0200fee0`,
  flag `0x200`) — `0x021909ac`–`0x02190a44`.
- Each is put in one of two groups by **`[obj+0x130]+0` bit 0** (the bit AA
  reads as dead): clear → `sp+0xC0`, set → `sp+0xB0`.
- Each is then placed at **its own order byte `[obj+0x2D2]`** in an eight-entry
  array — the clear group at 0–3, the set group at 4–7 (`0x02190a74`–`0x02190af8`)
  — and the array compacted (`0x02190b10`–`0x02190b30`).
- **So the slots are: the living by order key, then the fallen by order key.**
  The leader, slot 0 (`0x0200fddc`), is the first one alive.
- Then, only if a map condition holds (`func_020981e4` on `+0x840` of
  `func_02012fe4()`): if slot 0's companion object `0x14 + 3·idx` has id
  `0x2347`–`0x2349` (`func_ov017_02190818`), it is swapped with the first slot
  whose is not (`0x02190b3c`–`0x02190b8c`). **Not established** what those ids
  are (the same three AA met in the ceremony's fixed-position case).
- Then each member is chained to follow the previous (`func_02039858`), and
  object `0xCE`, if it exists as a party member, follows the last
  (`0x02190fac`–`0x02191048`). Not established what `0xCE` is.
- The order byte: `func_ov017_02190264` (`0x021904b0`–`0x021904fc`) renumbers
  objects 1–3 to 1, 2, 3 in key order before rebuilding.

**What changes in the engine:** the order the field, the leader and the Abbey's
who-list use is **living members first, fallen after**, each kept in the
party's own order — rebuilt whenever someone falls, is revived (action `203`),
joins or leaves. Concretely: a `marchingOrder(members)` (stable partition on
"HP > 0") in `apps/game/src/companion.ts`, and the field trail / leader in
`main.ts` taken from it rather than from `members` directly. INFERRED witness:
a let's play where the Hero falls should show a living member leading and the
Hero's coffin at the back.

**Corrections:** `docs/party-and-vocations.md`, "What writes the slots has not
been found", "Followed from Patty, and the answer is that nothing writes them"
and the table row "**nothing writes them field-wise**" are wrong, as is the
inference "the slots are serialisation, not state". `apps/game/src/companion.ts`
line 25 and `recruit.ts` line 15 repeat the 0x397c framing (harmless). The
Abbey's who-list (AA §3) reads exactly these slots.

## 3. A preset's face and hair — **the hair is there; the face is the other value**

**`charapreset.bin` is not loaded by any code found.** Its name appears in no
string in the ARM9 or any overlay (the decomp's extracted binaries and every
`.s` data block searched), and its FAT id (US `0x5C5`, `/data/bin/charapreset.bin`)
appears as no constant. The presets the game **does** load are
**`presetdt_<LG>.bin`** (`data_020f1088`/`data_020f109e`), by
`func_02089de8`, which runs the table as a script with the opcode table at
`0x020f1048` (`0x64`–`0x6a`). Its callers are `func_0201099c`, `func_02086f24`
(action **`219 : n`** — case 119, `0x02063f4c` — builds presetdt record
**n + 7** and appends it to the roster with `func_02086778`) and `func_020a93e0`
(the save load, restoring a preset member's name).

**The `0x6a` record handler `func_02089b90`** (read), then **`func_02086f24`**
copying it into the roster record (base `sp+0xA2C`):

| presetdt value | handler stores | lands in the record | meaning |
|---|---|---|---|
| 0 | `+0x00` byte | — | the number (`func_02089fb0` looks it up) |
| 2 | `+0x08` | `+0x174` bit 0 (`0x02087080`–`0x02087094`) | **sex** |
| 3 | `+0x0A` | `+0x176` (`0x020870e4`) | the arms |
| 5 | `+0x10` | `+0x174` bits 1–3 | **skin tone** |
| 6 | `+0x11` | `+0x175` bits 0–3 (`0x020870d4`–`0x020870e0`) | **hair colour** (part 4's texture number = hair's number + this, `0x02072f5c`–`0x02072f64`) |
| 7 | `+0x12` | `+0x174` bits 4–7 | **eye colour** (`ApplyFaceToModel`'s 4th argument, `0x02073218`) |
| 8 | 0–5 → `+0x14`/`+0x18` floats from `data_020e8c58`/`5c` by sex | `+0x178`/`+0x17A` ×4096 | the build |
| **9–18** | ten halfwords `+0x1C`–`+0x2E` | **`+0x160`–`+0x173`, slots h0–h9 in order** (`VectorizedInvertedMemcpy(+0x1C → rec+0x160, 0x14)`, `0x02087070`) | armour, legwear, **h2 = value 11**, **h3 = value 12**, gloves, footwear, headgear, weapon, shield, accessory |
| 19–31 | 13 bytes `+0x30` | `rec+0x02`… (`0x0208705c`) | INFERRED per-vocation levels: all 1, but Aquila's index 1 is 60 with vocation 1, Patty's index 5 is 28 with vocation 5 |
| 32 | `+0x3D` | `rec+0x50` and `1 << v` into `rec+0x54` | the vocation |
| 33, 34 | `+0x3E`, `+0x3F` | `rec+0x01` bits 0–3; `rec+0x13F` bits 0–2 | not established; 34 is what `func_020a93e0` uses to find the preset's name again |

**Slot h2 is the face and h3 the hair**: `CharaParts_GetPartNumbers`
(`func_02072afc`) lays the block out `[h0,h1,h2,h3,h3,…]`, part 2 gets the face's
recolour (`0x02073210`, `ApplyFaceToModel`) and parts 3/4 are the hair shape and
its colour texture (Y-skin-body.md §2). And the item records agree (EU, `itemdt`
record `+0x10`: letter bits 20–27, number bits 0–9 man / 10–19 woman, `999` →
the other's, `func_020de234`): **9000–9013 are `h`, 9020–9033 are `f`**. On the
cartridge, presetdt value 11 is always 9020–9033 and value 12 always 9000–9013
(e.g. record 9, Erinn: 11 = 9031 → `f021`, 12 = 9011 → `h210`; record 8, Aquila:
9030 → `f020`, 9010 → `h200`).

**So for presetdt: 11 is the face, 12 is the hair, 6 its colour.** FORMAT.md's
"11, 12 … 12 a face, INFERRED" is wrong on 12.

**For `charapreset.bin`, by analogy — INFERRED:** its worn values run 79 armour,
80 legwear, **77, 78**, 81 gloves, 82 footwear, 83 headgear, 84 weapon, 85
shield — the same h0…h8 order with 77/78 in h2/h3's places, and 77 is 9024 (an
`f`) on all 23 vocations, 78 is 9006 (men) / 9005 (women) (`h`). So **77 is the
face and 78 the hair**. A hair colour field in charapreset is **not
established**.

**What changes in the engine:**

1. `packages/game-formats/src/presets.ts`: `PresetOutfit.face` reads value 78; it
   should read **77**, and a new `hair` read **78** (both INFERRED, by the
   analogy above). FORMAT.md "Character presets": 77 = face, 78 = hair; the
   presetdt table: 5 skin, 6 hair colour, 7 eye colour, 8 build, 9–18 the ten
   slots, 11 face, 12 hair.
2. `apps/game/src/hero.ts`, `faceName`: `9000 + n → p_f<n>` is wrong. A face or
   hair id is an item: name = `p_` + letter (`+0x10` bits 20–27) + the number for
   the sex (bits 0–9 man, 10–19 woman, 999 → the other's). 9024 → `p_f004` (man),
   `p_f014` (woman); 9006 → `p_h060` (man); 9005 → `p_h150` (woman). That needs
   `ItemDef` to expose `+0x10` (it has `raw`).
3. `hero.ts`, the preset look: "Hair is not among them … the hair here is the
   Hero's" is wrong — use value 78's item, shape `p_h<number>a` (see §4 on the
   letter), colour texture `p_h<number + colour>a`.
4. `apps/game/src/appearance.ts`: `HERO_APPEARANCE.face: 6` and its comment
   ("`p_f006`, the face the presets give the man of every vocation") come from
   the same misreading — the vocation presets give the man `p_f004` and hair
   `p_h060`. The header line "The face is elsewhere, `+0x01` bits 0–3" is wrong:
   the face is slot h2 (`rec+0x164`, live `+0x48C`); `+0x01` bits 0–3 is
   presetdt value 33, meaning not established.

## 4. The hair's skin ramp — how a style pairs with 9000–9013

**Read:** part 4 (the hair-colour texture) takes its count from **the hair
slot's item** (h3; `CharaParts_GetPartNumbers` gives parts 3 and 4 the same h3),
`GetItemSkinShades(rec, 1, sex)`, written at `+0x10` (`0x020731f0`). The model
number comes from the same item, by sex (`func_020de234`). On the EU cartridge
(`itemdt_en.nat`):

| item | man | woman | shades (man/woman, Y-skin-body §3) |
|---|---|---|---|
| 9000–9005 | 000, 010 … 050 | 100, 110 … 150 | 0/0 |
| 9006 | 060 | **180** | 0/0 |
| 9007 | 070 | **160** | 0/0 |
| 9008 | 080 | **170** | **4**/0 |
| 9009 | 090 | 190 | **4**/0 |
| 9010 | 200 | 999 → 200 | **4**/0 |
| 9011–9013 | 999 → 210, 220, 230 | 210, 220, 230 | 0/0 |

**Character creation** writes h3 = `9000 + remap(sex, choice)` and h2 =
`9020 + remap(sex, choice)` (`func_ov009_02188944`, `0x02188a3c`–`0x02188a5c`
and `0x02188a04`–`0x02188a14`; also `0x021897a0`–`0x021897cc`;
remap `func_ov009_02188b14`, `+0xDA3` INFERRED the sex being edited, since every
knob's choice is kept per `+0xDA3` at `+0xDA4`/`DA6`/`DA8`/`DAA`/`DAC`/`DAE`):

- hair, man: identity → 9000–9009 → models 000–090;
- hair, woman: `[6,0,1,2,3,4,5,7,8,9]` → 9006, 9000–9005, 9007–9009 → models
  180, 100–150, 160, 170, 190;
- face, man: `[4,0,1,2,3,5,6,7,8,9]` → 9024, 9020–9023, 9025–9029 → `f004`,
  `f000`–`f003`, `f005`–`f009`;
- face, woman: `[1,0,2,…,9]` → 9021, 9020, 9022–9029 → `f011`, `f010`, `f012`–`f019`.

So creation's ten hairstyles are **items 9000–9009**, and 9010–9013 (models 200–230)
and faces 9030–9033 (`f020`–`f023`) are the four presetdt NPCs'. That settles
appearance.ts's "Which settings the ten hairstyles are is not established".

**What changes in the engine** — `apps/game/src/main.ts`, `bodySkinOf` (whose
comment says the hair "pairing … is not read"): for the hair-colour texture
`p_h<NNN>a`, find the item in 9000–9013 whose number for `look.sex` equals
`look.hair × 10` (with 999 → the other's); `count` = its `skinShades` for the
sex; ramp = `skinRamp(colours, look.skin, count)`; write with
`skinSlot(S, 16)`, not 4. Result on this cartridge: **a man with `look.hair` 8,
9 or 20 gets the tone's eight shades at colours 8–15 of `p_h0[8|9]<c>a` /
`p_h20<c>a`** (S ≤ 32); everyone else none. A man with `look.hair` 10–19 pairs
with no item (the game cannot make one) → none. The shape model (part 3) is
never recoloured.

**Side finding, read — the hair's variant letter is the headgear's, not a
choice** (`func_02072e94`, `0x02072f68`–`0x0207300c`): the shape's suffix is
`a` with no headgear; otherwise the headgear's model number ÷ 100 indexes
`"bbdcc\0cea\0"` (`data_020e883c`): 0–1 `b`, 2 `d`, 3–4 `c`, 6 `c`, 7 `e`, 8 `a`;
**5, 9 and ≥ 10 draw no hair at all** (return 0); and 3xx on a man whose h3 is
9001 gives `f`. So `appearance.ts`'s `hairVariant` knob is ours; the game's
equivalent follows `headgear`.

## 5. `palette.bin` tag `0x69` — **the characters' outline colour**

`CharaColours_SetUnknown69` (`0x02099c90`) stores it as a halfword at
`data_02109a28 + 0x28` = `0x02109a50` = `charaColourTables + 0x128`. Read by:

- **overlay 23 `func_ov023_021e5628`** (`0x021e565c`–`0x021e5688`): copies it into
  all eight halfwords of a buffer and calls `func_020c555c`, which copies 16 bytes
  to **`0x04000330`, the 3D engine's EDGE_COLOR table** (`0x020c555c`–`0x020c5570`
  → `func_020ca3b8`). Then it draws the figure. Callers: ov009 `func_ov009_02184c30`
  (creation), ov023 `func_ov023_021e3084`, `func_ov023_021fcd70`.
- overlay 15 `func_ov015_0218eb04` (`0x0218eb10`–`0x0218eb40`), the debug viewer,
  the same way.

Nothing else reads `+0x128` of the tables. EU value: **`0x1086`** — the same as
the constant tables the field (ov017 `0x0218bab0`, `data_ov017_021d615c`), overlay
21 and overlay 23's menu state (`0x021e3c7c`, `data_ov023_021fdc94`) load into the
same registers; `func_0203e8f8` loads `0x18C8`.

**What changes in the engine:** nothing now — `packages/render` draws no edge
marking. If it ever does, the outline is `0x1086` (BGR555). Whether edge marking
is switched on (DISP3DCNT bit 5) was **not checked**.

## 6. Overlay 23's second skin path — **the menu/creation figure, not battle**

`func_ov023_021e540c` belongs to overlay 23's **figure module** (`0x021e3030`–
`0x021e6xxx`), which loads `data/ani/lay_mm.lia` and `clmm_<LG>.pac`
(`0x021e3d24`–`0x021e3d30`; "mm" INFERRED main menu) and builds its parts as
**`d_%c%03d%s.%s` out of `data/pack_lv5/chara_pd.gp2`** (`func_ov023_021e5974`,
`0x021e5e58`/`0x021e5e5c`). Y-skin-body's "INFERRED battle" is wrong.

**Which models**: part indices `{0, 1, 5, 4, 6, 7}` (`data_ov023_021fd68a`) —
body, legs, arms/gloves, hair colour, feet, headgear — and first the face, part 2
(its palette base `[fig+0x8DC]` = `0x7FC + 2·0x70`):

- face: brows `tables + 4·hairColour` (4 bytes) to base `+0x24`, eyes
  `tables + 0x108 + 4·eyes` to `+0x28`, skin `tables + 0x88 + 16·tone` (16
  bytes) to `+0x30`, by `StageMemoryToVRAM` (`0x021e5458`–`0x021e54b4`) — the
  `p_` face's offsets `{4, 8, 16}` plus `0x20`;
- each listed part: count `GetItemSkinShades(rec, 0, sex)` — **bits 11–14 man,
  19–22 woman** — giving 2/4/8 colours from `tables + 0x28/0x48/0x88`
  (`0x021e5528`–`0x021e55d0`), written to `base_i + 0x30 + (i == 0 ? 0x200 : 0x20)
  − roundup32(S)` (`0x021e555c`–`0x021e55f8`), `base_i = [fig + 0x7FC + 0x70·i]
  << 3`.

**When** (read): `func_ov023_021e5020`, once the figure's model and animation
(`stand_cm` in creation, else `stand`) have loaded (`0x021e52c0`); and
**character creation** on every skin-tone and eye-colour change
(`func_ov009_02188944`, `0x02188ae0`, `0x02188b0c`). The figure itself is used
by creation (ov009, reached from Patty `func_ov003_0217e6b0` and the Hero's
`func_ov021_0218baf8`), the field's menu (ov017 `func_ov017_021a1284` →
`func_ov023_021e3030`, `0x021a1610`), overlay 23's menu state 3 with the
equipment overlay (`func_ov023_021e33b4` → `func_ov005_0215a960`) and overlay 11
(`func_ov023_021fc518`).

**What changes in the engine:** nothing now — minstrel draws no `d_` part. If
the creation screen or the menu's figure is drawn the game's way, it uses `d_`
parts and `which = 0` (`ItemDef` would need bits 11–14 / 19–22 beside
`skinShades`).

---

## INFERRED / not established

**INFERRED:**

- `231`'s extra writes are a "game cleared" stamp (clock, Hero's `+0x134`
  `+0x30`, play time); its `func_0202ae18`/`0202c540` guard is a wireless guest.
- `func_020aaf84` is the save load (a backup read and a checksum).
- ov000's append/remove of object 1 is a battle guest.
- `[obj+0x130]+0` bit 0 is "fallen" (from AA's reading).
- `+0xDA3` in overlay 9 is the sex being edited.
- charapreset 77 = face, 78 = hair (by analogy with presetdt; the file has no
  reader in the code).
- presetdt values 19–31 are per-vocation levels.
- "mm" = main menu.

**Not established:**

- Whether the EU ARM9 uses the same flag numbers (`0x799`, `0x796`, `0x113F`) —
  only the US code was read; the trigger values are EU.
- Whether minstrel runs the quest hand-in records carrying `160`.
- The map condition and object ids `0x2347`–`0x2349` in the marching-order swap;
  what object `0xCE` is.
- presetdt values 4, 33, 34 (34 is a name key), charapreset's hair colour.
- Whether 3D edge marking is enabled.
- The VRAM base `[fig + 0x7FC + 0x70·i]` and why the parts' offset is
  `0x50 − roundup32(S)`.
- Which overlay 11 and overlay 25 screens show the figure.

**Ours, not the game's** (in the proposed changes): the shape of
`marchingOrder` and where it is called; named constants for the new actions.
