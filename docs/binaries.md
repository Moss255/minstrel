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
| **The vocations' skill trees** | ARM9 `0xEE75D` | 12 rows × 5 bytes: four weapon/shield/fisticuffs trees (1–14) and the vocation's own (15–26), in the level tables' order | `readVocationTrees`, `game-formats/src/vocations.ts` | the shape, unique in the ARM9 and every overlay; the own trees running 15 to 26 in order; the minstrel's row holding the sword, the fan and the shield the let's play's Hero wields. FORMAT.md, "Vocation skill trees" |
| **The battle weight tables** | ARM9 `0xE8CBA` | a run of tables of six bytes summing to 256: `43 42 43 43 42 43`, `68 58 48 38 27 17`, `210 29 10 4 2 1`, `70 70 70 16 15 15` | `readWeightTables`, `battle-tables.ts` | the first two are the reference battle emulator's even and boss tables exactly, which it had from the game's disassembly; the run is found by the first. FORMAT.md, "Battle weight tables" |
| **Which monster draws by which** | `mon_btldata.nat`, byte `+0x27` bit 4 | a flag | `MonsterBattle.bossAi` | set on 144 of 159 boss-coded monsters and on the five grotto bosses with ordinary codes; clear on the bosses' minions and every other monster; set on the reference's own boss. Read as: set → the falling table, clear → the even. Which monsters, if any, draw by the third and fourth tables is not read |
| **The field sprites' ids** | overlay 17 `0x4AFD0` | 15 entries of (pointer to a name, id): `tsubo_01–03` 6, 7, 8; `taru_01–03` 9, 10, 4; `fuki_hkn` 2, `fuki_com` 3, `fuki_in` 12; `field_mon01` 13, `ev_mark` 14, `field_qu` 15, `fuki_com_q` 16, `fuki_com_apc` 17 | not yet | the name list at `0x4BE99` and the pointers to it. The ids are the game's own numbering of the pot, barrel and bubble sprites; how a treasure's kind chooses among them is still in code, unread |

## Looked at and not identified

- **Beside the weight tables**, ARM9 `0xE8C60`–`0xE8D40`: before them, sixteen
  words from `0x0E35` to `0x1051` — 12-bit fixed-point multipliers near 1,
  0.89 to 1.02, perhaps — then `02 03`; after them `03 01 04 02 02 03 01 00`,
  the float 0.2, the words 1024, 2560, 2048, 1024, four pointers into the
  ARM9, and the floats 1.3 and 1.0 by `0x80`, `0x60` and `0xD3`. Any of these
  may be the critical, dodge or flee chance; none is tied to one yet.
- **The inn's price**: no string names an inn in the binaries (`inn`, `yado`,
  `hotel` are absent); the only run of eight or more halfwords in multiples
  of five is `1100, 1200 … 2000` at ARM9 `0xE6EC4`, which does not look like
  inns. The price the innkeeper's `<val_2>` shows is still not found.

## How to search

`scratchpad`-style scripts are not kept; the approach was: unpack the ARM9
and every overlay, then scan for a shape known from the files — a row that
must contain three known values, a table whose rows must end in a rising
sequence, a run of sixes summing to 256 — rather than for values recalled
from anywhere else. A shape unique across the ARM9 and all overlays, with
one independent witness (a let's play, a preset, the reference emulator), is
what counts as found.
