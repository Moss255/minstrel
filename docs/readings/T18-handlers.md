# Task 18 — the abilities' and spells' handlers

Read 6 October 2026 from the USA build's overlays 0 and 24 and the ARM9, with
the decomp's symbols and relocations (`~/Projects/dqix-decomp`). Addresses are
the USA build's; the overlays' are shared with the EU cartridge.

## 0. Where it stood

Measured before any change, over every action the 26 skill trees teach and
every spell the six starting vocations learn (`apps/game`'s `battleListsOf`,
as the battle offers them; 181 actions, eight of them not usable in battle):

| how the battle played it | count |
|---|---|
| a spell — heal or harm, `battleSpellOf` | 38 |
| a blow by a read handler, `blowOf` | 49 |
| a blow on slot 0 — played as the plain blow, its rider or own code dropped | 17 |
| Psyche Up | 1 |
| **struck as the Attack** | **76** |

## 1. The kind table — what an action does, by its kind

The resolver calls one handler per target by the action's **kind** (`+0x18`
bits 5–11): 81 pointers-to-member of 8 bytes at `data_ov024_021ff508`, read
by the resolver's one call through it. Each handler is handed the battle,
the actor, the target, the action's record and — on the stack — **whether
the action landed**, which is the accuracy roll's answer
(`func_ov000_02156648`). Every handler of a change makes no draw of its own;
the chance of a change is the accuracy.

The actions the battle offers the party, by kind (slots 30, 34, 59 and 60 are
empty):

| kind | handler | the party's actions on it |
|---|---|---|
| 0 | `func_ov024_021da670` | Counter Wait, Defending Champion, Back Atcha, Whipping Boy, Forbearance, Selflessness |
| 1 | `func_ov024_021da9e0` | Frizz, Frizzle, Kafrizz, Crack, Crackle, Kacrack, Woosh, Swoosh, Kaswoosh, Bang, Boom, Kaboom, Dragon Slash, Metal Slash, Miracle Slash, Falcon Slash, Gigaslash, Gigagash, Mercurial Thrust, Cattle Prod, Pressure Pointer, Thunder Thrust, Multithrust, Lightning Storm, Toxic Dagger, Fly Swat, Victimiser, Assassin's Stab, HP Hoover, Persecutter, Beelzefreeze, Hypnowhip, Lashings of Love, Hit the Hay, Trammel Lash, Schadenfreude, Twin Dragon Lash, Serpent's Bite, Deliverance, Party Pooper, Crushed Ice, Propeller Blade, Can Opener, Flailing Nails, Hardclaw, Rake 'n' Break, Hand of God, Water Slaughterer, Fan Dango, Helm Splitter, Poplar Toppler, Parallax, Hatchet Man, Axes of Evil, Whopper Chop, Heart Breaker, Penny Pincher, Bagsy Last, Monster Masher, Crackerwhack, Big Banga, Crosscutter Throw, Power Throw, Ooze Bruiser, Starburst Throw, Firebird Throw, Metalicker, Gigathrow, Conjury Conductor, Flutter Disaster, Needle Shot, Rain of Pain, Hallowed Arrow, Shining Shot, Blockenspiel, Stone's Throw, Wind Sickles, Knuckle Sandwich, Multifists, Boulder Toss, Miracle Moon, Body Slam, Morale Masher, Attack Attacker, Hot Lick, Clap Trap, Blind Man's Biff, Double-Edged Slash, Solar Flair, Disco Stew, Wolf Whistle, Autograph, Gold Rush, Critical Claim, Kafrizzle, Kacrackle, Have a Ball |
| 2 | `func_ov024_021db3a4` | Heal, Midheal, Moreheal, Fullheal, Multiheal, Meditation, Omniheal, Caduceus, Hustle Dance |
| 3 | `func_ov024_021db5ec` | Oomph, Blunt, Weakening Wave, Double Up, Gritty Ditty |
| 4 | `func_ov024_021db7c0` | Buff, Sap, Kasap |
| 5 | `func_ov024_021db994` | Accelerate, Acceleratle |
| 7 | `func_ov024_021dbc64` | Squelch |
| 8 | `func_ov024_021dbd84` | Snooze |
| 9 | `func_ov024_021dbf18` | Cock-a-doodle-doo, Sobering Slap |
| 10 | `func_ov024_021dc0b8` | Trip of a Deathtime, War Cry, Pratfall, Roaring Tirade, Disco Tech |
| 13 | `func_ov024_021dc540` | M-Pathy |
| 14 | `func_ov024_021dc700` | H-Pathy |
| 15 | `func_ov024_021dc93c` | Psyche Up, Egg On |
| 16 | `func_ov024_021dced0` | Antimagic |
| 17 | `func_ov024_021dd028` | Whack, Thwack, Kathwack |
| 18 | `func_ov024_021dd278` | Zing, Zing Stick |
| 20 | `func_ov024_021dd6f0` | Tingle |
| 21 | `func_ov024_021dd828` | Fuddle |
| 22 | `func_ov024_021dd968` | Spooky Aura, Wizard Ward |
| 23 | `func_ov024_021ddaa0` | Insulate, Insulatle, Mind Over Matter |
| 25 | `func_ov024_021dde08` | Tap Dance |
| 26 | `func_ov024_021ddf5c` | Spelly Breath |
| 31 | `func_ov024_021de678` | Bounce, Magic Mirror |
| 32 | `func_ov024_021de770` | Reverse Cycle |
| 36 | `func_ov024_021dec50` | Schizofanic |
| 37 | `func_ov024_021ded48` | Immense Defence |
| 38 | `func_ov024_021dee84` | Care Prayer |
| 39 | `func_ov024_021deff8` | Alma Mater |
| 40 | `func_ov024_021df0f0` | Rotstopper |
| 41 | `func_ov024_021df1e8` | Wave of Relief |
| 42 | `func_ov024_021df284` | Channel Anger, Caster Sugar |
| 43 | `func_ov024_021df454` | Mens Sana |
| 44 | `func_ov024_021df924` | Half-Inch |
| 45 | `func_ov024_021dfe9c` | Eye for Trouble |
| 46 | `func_ov024_021dff3c` | Fire Fource, Frost Fource, Gale Fource, Funereal Fource, Life Fource |
| 47 | `func_ov024_021e00c0` | Feel the Burn |
| 49 | `func_ov024_021e02b0` | Disruptive Wave |
| 50 | `func_ov024_021e0380` | Extreme Makeover |
| 51 | `func_ov024_021e04e0` | Eyes on Me |
| 52 | `func_ov024_021e05fc` | Mercy |
| 53 | `func_ov024_021e07b0` | Soothe Sayer |
| 55 | `func_ov024_021e0a50` | Mist Me |
| 56 | `func_ov024_021e0b48` | Whistle |
| 63 | `func_ov024_021e1028` | Twocus Pocus |
| 64 | `func_ov024_021e1120` | Holy Impregnable |
| 66 | `func_ov024_021e1328` | Pincushion |
| 67 | `func_ov024_021e13e0` | Choir of Angels |
| 68 | `func_ov024_021e1580` | 0 Zone |
| 69 | `func_ov024_021e16a4` | Itemised Kill |
| 70 | `func_ov024_021e1824` | Rough 'n' Tumble |
| 71 | `func_ov024_021e191c` | Tension Boost |
| 72 | `func_ov024_021e1cbc` | Voice of Experience |
| 73 | `func_ov024_021e1de8` | Knight Watch |
| 74 | `func_ov024_021e1ed4` | Brownie Boost |

## 2. The handlers read

### Kinds 3, 4 and 5 — attack, defence, agility (`021db5ec`, `021db7c0`, `021db994`)

One shape, three stats. The levels are the record's `+0x30`, signed, held to
±2 (`0x021db61c`–`0x021db634`). Landed: the rider (`func_ov024_021e4b14`,
called with "dealt" 1 — so a rider on a change always rolls), then the
stat's own test — `func_0208776c` attack, `02087860` defence, `02087954`
agility: nothing under bit 0 of status `+0x14`, and a raise only below 2, a
fall only above −2 — then the level moved (`func_020877c0`, `020878b4`,
`020879a8`: the sum held to ±2, a sum of 0 clearing the level) and the stat
worked out again (`UpdateCombatantAttack`, `…Defense`, `…Agility`).

The levels live in status `+0x58`: attack bits 0–2, defence 3–5, agility 6–8,
each signed. Setting one stores a count — **attack 5** (`+0x6e`), **defence
6** (`+0x6f`), **agility 6** (`+0x70`) — and a flag in `+0x14` (`0x400`,
`0x800`, `0x1000`). How the counts run down is not read here.

**Attack's multiplier is not defence's**: `CalculateAttackBuffMultiplier` is
`1 + 0.25 × level` (decompiled, `src/Combat/Main/BasicAttackCalculation.cpp`),
and `UpdateCombatantAttack` truncates the product to a whole number, at most
999 for one of the party.

**The line** (`func_ov024_021e94c4`): by the level it comes to — raised to 2
"increases a lot" (attack `0x47`), to 0 "returns to normal" (`0x4b`),
otherwise "increases a little" (`0x49`); lowered to −2 "decreases a lot"
(`0x48`), to 0 normal, otherwise a little (`0x4a`). Defence's are
`0x3a`–`0x3e` and agility's `0x4c`–`0x50` in the same order. Not moved: the
record's own fail line, `+0x24` bits 10–19 (at one of the party) or 20–29 (at
a monster) — `func_ov024_021da644`, which picks the first for a target 0 to 3.

### Kind 7 — Squelch (`021dbc64`)

Landed on one poisoned (`func_020885b4`) or envenomed (`func_02088514`):
both cleared (`func_02088644`) and "is no longer poisoned" (`0x54`).
Otherwise the record's fail line.

### Kind 8 — sleep (`021dbd84`)

Landed on one who can sleep (`func_0208830c`): asleep (`func_02088338`, which
takes tension away), the line from `func_ov024_021e929c`. Already modelled.

### Kind 9 — waking (`021dbf18`)

Landed: the rider; then a sleeper (`func_020882f8`) wakes (`func_02088390`),
"wakes up" (`0x40`), and status `+0x3b` bit 0 is set. A rider that came to
something without the target waking says `0x173`, "pulls himself together"
(Sobering Slap's rider 19). Otherwise the fail line.

### Kind 17 — Whack, Thwack, Kathwack (`021dd028`)

Landed, and not (a target at the maximum of tension under an action whose
`+0x1c` bits 19–23 are 7): unless `func_ov024_021ea78c` keeps them alive —
a status `func_ov024_021e47dc` tests, for the actions listed at
`0x021fe6e0`, "heavenly protection keeps the reaper at bay" (`0xc8`), left on
1 HP — **all their HP is taken** (`func_ov000_0215a004` with `0xffff`) and the
record's kill line is said, `+0x28` bits 0–9 at one of the party ("dies!",
8) or 10–19 at a monster ("is killed", `0x45`). Not landed: the fail line —
621 at one of the party, 27 at a monster.

### Kind 18 — Zing, Kazing, the Zing stick (`021dd278`)

Landed on one fallen (`func_02010088`): back to life with a share of their
most HP (`func_0208902c`), `+0x3b` bit 0 set and, for one of the party,
`+0x3a` — the revival flag the coup's draw reads. The share, by the action:

- **Zing (38) and the Zing stick (84)**: cast by one of the party, by their
  magical mending against the record's `lo` and `hi` (`+0x04` bits 12–21 and
  22–31): a quarter at or under `lo`, a half at or over `hi`, and between,
  `(int)((25 / (hi − lo)) × (mending − lo))`, plus 25, over 100 — all in
  floats; cast by a monster, a half;
- **Kazing (39)**: a half (`0x021dd31c`);
- anything else that reaches it: whole.

The HP is `(int)(share × most HP)`. Its line is the record's own — `+0x20`
bits 20–29 at one of the party, `+0x24` bits 0–9 at a monster: "returns to
life!" (32). Not landed on the fallen: "remains lifeless" (`0x21`); on the
standing, the fail line.

## 3. What rides on a blow — the rider table (`data_ov024_021ff450`)

22 slots by `+0x18` bits 0–4, dispatched by `func_ov024_021e4b14`. Read here:

- **2, attack down** (`021e2ebc`) and **8, defence down** (`021e3594`): with
  something dealt, a draw below 100 **first**; the levels from `+0x32`, held
  to ±2. A fall lands when the draw is under the target's byte — `+0x4f`
  attack, `+0x50` defence — or at once on a critical; **the action's chance
  is not read**. A byte of 0 refuses it. Double Up (`0xad`) on defence skips
  the test. A raise always lands.
- **4, poison** (`021e303c`): with something dealt and the target's byte
  `+0x4d` not 0, and one who can take it (`func_020885e0`, or
  `func_02088540` for the stronger kind when `+0x32` is above 0): a draw below
  100, as a float, under the action's chance — one of the party's `+0x14`
  bits 7–13, a monster's bits 0–6 — times the byte over 100, or a hundred on
  a critical.
- **7, sleep** (`021e33a4`): the same, byte `+0x47`, one who can sleep
  (`func_0208830c`).
- **20, death** (`021e4604`): a flat 12.5, not the action's chance, byte
  `+0x48`, a metal body's byte passed over — **corrected in §8**; then the
  protection of kind 17, and all HP taken.

The bytes are the target's resistances — §8.

## 4. The record's lines

Three words of an action's record hold its lines, ten bits each:

| word | bits 0–9 | 10–19 | 20–29 |
|---|---|---|---|
| `+0x20` | opening (one of the party acts) | opening (a monster acts) | done, at one of the party |
| `+0x24` | done, at a monster | failed, at one of the party | failed, at a monster |
| `+0x28` | killed, at one of the party | killed, at a monster | its critical |

Read from the handlers that pick them (`func_ov024_021da644`), and borne out
by the cartridge: the Attack's are 1, 1, 2 / 5, 4, 7 / 8, 9, 140; Whack's
fail 621 and 27 and kill 8 and 69; Zing's done 32.

**So `Action.effect`, the byte at `+0x24` read as INFERRED "what it does",
is the low byte of the done line at a monster** — 5 "does damage to" on the
Attack and the attack spells, 22 "wounds are healed" on the heals. The code
still tells heals from harms by it, which holds for the actions it is used on;
the name is left as it is.

## 5. Envenomation, and what a battle tolls — a correction

Status `+0x14` bit 1 is poisoned, and `+0x22`'s low two bits say which:
**1 poison** (`func_02088624` sets it, `020885b4` tests it), **2
envenomation** (`func_02088560`, `02088514`). A poison rider (4) or kind 6
gives envenomation where the record's `+0x32`/`+0x30` is above 0
(`0x021e309c`, `0x021dbb20`): Toxic Dagger, Venom Mist, Venomissile and the
poison attack 275. Who may take it: nobody at the maximum of tension, and
plain poison not on the envenomated (`func_020885e0`, `func_02088540`) — the
poisoned are poisoned again, "even more powerfully" (`0x53`). Squelch, the
cure-all and the maximum of tension clear both.

**Only envenomation is tolled in a battle** — the round's end,
`func_ov000_0215a23c` `0x0215a5c8`–`0x0215a5f4`: a sixteenth of the most HP,
at most 999 and at least 1. Nothing in the ARM9 or any overlay tests plain
poison in a battle but to cure it, Victimiser's blow (`func_ov024_021d8d38`)
and the AI. The reference's "poison takes a sixteenth" is 275's, which is
envenomation; the simulation had it on plain poison.

## 6. Also read and built

- **Choir of Angels** (kind 67, `021e13e0`): every one of the party,
  `RoundUp(0.4 × most HP)`, at least 75 (`0x021e1418`–`0x021e1440`), healed
  with no test of its landing; then the cure-all (`func_ov024_021eae14`:
  sleep, the poisons, a level below 0 and many statuses the battle does not
  keep). Lines `0x1ba`, `0x16`, `0x1bb`, or `0x1f` for neither.
- **Tension Boost** (kind 71, `021e191c`): "a huge boost all of a sudden"
  (`0x1bc`), then each level to 4 told, no coin; nothing at the maximum.
- **Egg On** is kind 15, Psyche Up's own handler, on an ally.
- **Meditation** is kind 2, a heal, on its user.
- **A metal body's zeroing** (`func_ov024_021e6a90` `0x021e77c4`): a
  non-critical blow aimed at the monsters with `+0x10` bit 24 comes to
  nothing, bar `0x205` and Needle Shot (`0x82`); the coin follows.

Measured after: **55 struck as the Attack, where 76 were**; 19 played as
changes of state, 39 spells, 5 slot-0 blows now carrying their rider.
`apps/game/test/handlers.test.ts` holds the count.

## 7. What is left — by name, and the address that would answer it

**Still struck as the Attack** (36 — 55 before §9 built kinds 16, 20, 22, 23, 38, 41 and 42, 44 before §10 built kind 10, 41 before §11 built 48, 78, 54 and 19), by the kind whose handler is unread:

| kind | handler | actions |
|---|---|---|
| 0 | `func_ov024_021da670` | Counter Wait, Defending Champion, Back Atcha, Whipping Boy, Selflessness, Forbearance |
| 13 | `func_ov024_021dc540` | M-Pathy |
| 14 | `func_ov024_021dc700` | H-Pathy |
| 21 | `func_ov024_021dd828` | Fuddle |
| 25 | `func_ov024_021dde08` | Tap Dance |
| 31 | `func_ov024_021de678` | Magic Mirror, Bounce |
| 32 | `func_ov024_021de770` | Reverse Cycle |
| 36 | `func_ov024_021dec50` | Schizofanic |
| 37 | `func_ov024_021ded48` | Immense Defence |
| 39 | `func_ov024_021deff8` | Alma Mater |
| 40 | `func_ov024_021df0f0` | Rotstopper |
| 43 | `func_ov024_021df454` | Mens Sana |
| 44 | `func_ov024_021df924` | Half-Inch |
| 45 | `func_ov024_021dfe9c` | Eye for Trouble |
| 46 | `func_ov024_021dff3c` | Fire Fource, Frost Fource, Gale Fource, Funereal Fource, Life Fource |
| 47 | `func_ov024_021e00c0` | Feel the Burn |
| 49 | `func_ov024_021e02b0` | Disruptive Wave |
| 50 | `func_ov024_021e0380` | Extreme Makeover |
| 51 | `func_ov024_021e04e0` | Eyes on Me |
| 52 | `func_ov024_021e05fc` | Mercy |
| 53 | `func_ov024_021e07b0` | Soothe Sayer |
| 55 | `func_ov024_021e0a50` | Mist Me |
| 56 | `func_ov024_021e0b48` | Whistle |
| 63 | `func_ov024_021e1028` | Twocus Pocus |
| 64 | `func_ov024_021e1120` | Holy Impregnable |
| 66 | `func_ov024_021e1328` | Pincushion |

Most need a status the battle does not keep — a counter, a barrier, Bounce's
mirror, dazzle, confusion, a stance (kind 0 is the six stances: Counter
Wait, Defending Champion …).

**Bounce and Magic Mirror (kind 31), read toward building** (6 October
2026): the handler sets `+0x14` bit 9 with a count of 5 at `+0x61`
(`func_020888f4`) on anyone not under `+0x14` bit 0; its done line is 168.
The reflection is `func_ov024_021e9f68`, called per target by the resolver
before the combo chain (`0x021ec0f4`): for an action with `+0x10` bit 10
(74 on the cartridge — the spells, Squelch and Snooze among them) aimed at
the other side (`+0x08` bits 8–9 at 1), at a target not its actor and under
bit 9, the actor and the target are swapped (`0x021ea058`–`0x021ea068`) and
a note of kind 1 is put on the result (`func_ov000_0215ff50`); the lines are
169 and 170, "The wall of light deflects the spell" — which says which is
not read. What 021e9f68 does past `0x021ea100` (the other redirections) is
not read.

**Played as a plain blow, its own code read and not built:** Crosscutter
Throw — its extra pass's target is picked by place on the stage (§8).
~~Propeller Blade, Gold Rush, the six that scale by the table at
`0x021fe8b6`~~ — read and built 6 October 2026, §8.

**Riders not played** (`data_ov024_021ff450`): ~~1~~ (built, §10), 5 and 6 (the antidotes') `021e324c`,
`021e32f4`, 9 `021e373c` (Soothe Sayer), 10 `021e386c` (confusion,
INFERRED), ~~11~~ (paralysis, built — §10), 12 `021e3cec` (Rake 'n'
Break), 13 `021e3d88` (Conjury Conductor), 14 `021e3f14` (Morale Masher),
19 `021e4588` (Sobering Slap), 21 `021e47f4` (Caster Sugar). Their blows
land and deal; the rider is dropped.

**Coups** — all eight built since (§10).

**Ours in what was built**: ~~nobody's susceptibility bytes~~ — they are
the resistances, used since §8; attack's turns run down as defence's
(its count, 5 at `+0x6e`, is not read in use) and wear off first at the
round's end; a raised one comes back with at least 1 HP; the flags a
raising and a waking set (`+0x3a`, `+0x3b` bit 0) are not kept; Whack's
heavenly protection (`func_ov024_021ea78c`) is a status not kept, so it never
spares; the cure-all clears only what the battle keeps.

## 8. Finishing what §7 left — 6 October 2026

### The six skills of the table at `0x021fe8b6`

`GetAttackBaseDamage` (`0x021e7bc0`), its arm for one of the party whose
amount scales (`+0x18` bits 16–17 at 2, `0x021e7c0c`–`0x021e7c1c`):

- the record's own number first — `+0x10` bit 14 magical might, bit 15
  mending, the fighter's `[obj+0x138]+0x10` bits 10–19 and 20–29 — with the
  record's `lo` and `hi` (`+0x04` bits 12–21, 22–31) (`0x021e7c34`–`0x021e7ca0`);
- then 0x1c halfwords copied from `0x021fe8b6` to the stack
  (`0x021e7ca4`–`0x021e7cbc`): seven entries of `id, number, lo, hi`, the last
  `−1`. On the cartridge: **67 Gigaslash, 68 Gigagash, 74 Lightning Storm
  500–1,998; 102 Hand of God 300–999; 114 Whopper Chop 250–600; 144 Boulder
  Toss 500–1,998**;
- the numbers filled in (`0x021e7cc0`–`0x021e7d2c`): `A` = the character
  record's (`[obj+0x150]`) word 0 bits 0–9, and the fighter's magical might
  now — `A + might` for the first three, `A` for Hand of God and Whopper Chop,
  `A + [rec+4]` bits 0–9 for Boulder Toss; each kept in sixteen bits, signed;
- the action's id (`+0x04` bits 0–11) looked up until the `−1`
  (`0x021e7d3c`–`0x021e7d80`); a match takes the table's number, `lo` and
  `hi`, and goes on through the same three arms as a record's own scaling
  (`0x021e7d8c` on) — the least at or under `lo`, the most at or over `hi`.

`[rec+4]` bits 0–9 is deftness (`RollCritical`, `0x02156d28`; the flight's
roll, `0x0215f9d4`). **`A` is strength — INFERRED**: the record's word 1
starting with deftness puts word 0 at strength, resilience and agility in
the level tables' order, and nothing read here says otherwise.

Built: `SKILL_SCALES` and `scaleStat` in the sim's `damage.ts`; `load.ts`
gives the six their table's scaling; a fighter carries its `strength`. The
amounts stay played as the range's harm (`battleSpellOf`), as before.

### Propeller Blade (97), Crosscutter Throw (121) — the resolver's own

Both are kind 1, damage handler 0; what makes them theirs is in the
resolver (`func_ov024_021eb5d0`), by the action's id:

- **Propeller Blade** (`0x61`): its target list's first is copied to its
  second and the count made 2 (`0x021eb954`–`0x021eb964`), so the passes
  (`func_ov024_021e8dc0`) strike the one target twice. On the second pass
  (`[sl+0x18]` above 0, `0x021ec444`–`0x021ec48c`) the result's critical
  (`+0x1c` bit 7, set by `RollCritical`, `0x021ec2d4`), dodged (bit 1) and
  blocked (bit 2) are cleared — their draws already spent — and the
  accuracy roll is handed a flag that makes it land with no draw
  (`func_ov000_02156648`, `[sp+0x38]`, `0x0215678c`). The kind-1 handler
  says line `0x1f0` on that pass and passes over the record's kill line
  (`0x021daf4c`, `0x021db0b0`–`0x021db0d0`). **Built**: the passes, the
  clearing, the accuracy; the line `0x1f0` is not told.
- **Crosscutter Throw** (`0x79`): one more target is appended
  (`0x021eb974`–`0x021eb994`), `func_ov000_0215cda0`'s: among the eight
  monster slots standing (`func_ov000_0215eb1c`), the one whose place on
  the stage (`func_02049b54`, a `Vector3`) has the least first coordinate.
  The simulation keeps no places, so **not built** — it stays the plain blow
  on all, without the extra pass. A flag marks that last pass for the
  accuracy roll (`[sp+0x40]`, `0x021ec4a4`–`0x021ec4b8`), not followed.

### Gold Rush (479) — post-step 6

`data_ov024_021ff3f8` slot 6, `func_ov024_021e5be4`: after the action, the
record's `+0x32` (Gold Rush's **1,000**) is taken from the party's gold
(`func_02010828()+0xf6c`, `0x021e5c14`–`0x021e5c20`) for one of the party
(`func_ov000_0215fd24`), or from a monster's own gold
(`battle+0x8e84`, by its place). **Before** acting, `func_ov024_021eaa50`
(`0x021ead0c`–`0x021eadd0`) puts action **935** in its place when the gold
is short — 935's opening is actmsg 580, and it does nothing else. **Built**:
`Spell.gold`, `BattleState.purse`, the refusal and the spending; the app
takes it from the purse as the round's events come in. A monster's gold
is not kept, so a monster's Gold Rush is neither refused nor charged.

### The riders' bytes are the resistances — and death's own chance

Task 17b found the riders' "susceptibility bytes" are status `+0x3E + element
− 1`, the resistances the simulation already keeps (`Fighter.resist`). Each
byte is the element its change lands with: `+0x47` sleep 10, `+0x48` death
11, `+0x4d` poison 16, `+0x4f` attack down 18, `+0x50` defence down 19 —
the landing elements of Snooze, Whack, Toxic Dagger, Blunt and Sap. Now
used: a byte of 0 refuses a rider before its draw (poison `0x021e308c`,
sleep `0x021e33f0`, a fall `0x021e2f3c`); poison and sleep land under
`chance × (byte / 100)` in floats (`0x021e3118`–`0x021e3180`); a fall
under the byte, after its draw.

**Corrected — death (rider 20, `func_ov024_021e4604`)**: it does not land
by the action's chance, and it does not refuse a metal body. Its chance is
a flat **12.5** (`0x021e47d0`), times the byte over 100
(`0x021e4690`–`0x021e46b0`, the divisor the literal's exponent plus three,
100.0); a hundred on a critical (`0x021e46c4`). For a metal body
(`func_ov000_02156068(…, 0, 1)`, `0x021e463c`, `0x021e4684`) the byte is
passed over — neither a 0 refusing it nor scaling it — so Assassin's Stab
and the others fell a metal slime at 12.5 in a hundred, when their blow
deals something. §3 said otherwise.

## 9. The kinds §7 left — 6 October 2026, carried on

### The levels: might, mending, and the resistances to spells and breaths

Four handlers of kind 3's shape (§2), each over its own signed three bits
of status `+0x58`, a count of 5, and a flag in `+0x14`:

| kind | handler | actions | field | test, set | count, flag | worked out again |
|---|---|---|---|---|---|---|
| 22 | `021dd968` | Wizard Ward, Spooky Aura | bits 18–20, resistance to spells | `func_02087d24`, `02087d78` | `+0x74`, bit 16 | — |
| 23 | `021ddaa0` | Insulate, Insulatle, Mind Over Matter | bits 21–23, resistance to breaths | `func_02087e18`, `02087e6c` | `+0x75`, bit 17 | — (it clears `+0x18` bits 1 and 2: `func_02088c38`, `02088c9c`) |
| 38 | `021dee84` | Care Prayer | bits 15–17, magical mending | `func_02087c30`, `02087c84` | `+0x73`, bit 15 | `UpdateCombatantMagicalMending` |
| 42 | `021df284` | Channel Anger, Caster Sugar | bits 12–14, magical might | `func_02087b3c`, `02087b90` | `+0x72`, bit 14 | `UpdateCombatantMagicalMight` |

Each: landed, the level from the record's `+0x30` held to ±2; the test (no
raise past 2, no fall past −2, nothing under `+0x14` bit 0); the set, which
returns the level it came to. Kind 42 rolls its rider first, as kind 3 does
(`0x021df2f0`). Not landed, or at the end already: the record's fail line.

**The multipliers.** Might and mending: `1 + 0.5 × level`, truncated to
sixteen bits, at most 999 for anyone (`UpdateCombatantMagicalMight`,
`…Mending`, decompiled). The resistances, in the final damage
(`func_ov024_021e6a90`): a spell (`+0x10` bit 0) not of kind 2 against one
with `+0x14` bit 16 is multiplied by `func_020748d0(level)` (`0x021e7534`–
`0x021e7584`); then a breath (`+0x10` bit 2) against bit 17 by
`func_020748a8(level)` (`0x021e7588`–`0x021e75c8`). Both are `1 + (−0.25 ×
level)` in floats, the literal `0xbe800000`. They come after the resistance
to the element and before the guard (`0x021e75cc`).

**`+0x10` bits 0–2** are the action's sort: 1 a spell (85 on the cartridge,
every spell, Zoom and Evac among them), 2 a dance (10, every one a dance), 4
a breath (19: the breaths, Hot Lick, Venom Mist). Read by the two tests
above.

**The lines.** Might (`func_ov024_021e9904`): raised to 2 `0xd0`, to 0
`0x1b7`, else `0xd1`; lowered to −2 `0x1b6`, to 0 `0x1b7`, else `0x1b5`.
Mending (`021e9990`): raised to 2 `0xc4`, else `0xc5`; **a fall says
nothing** (it hands back 0). Spells (`021e97f4`): raised to 2 `0xab`, to 0
`0xae`, else `0xac`; lowered to −2 `0xaf`, to 0 `0xae`, else `0xad`; left
where it was on a fall that landed, `0x1f` "But nothing happens"; not landed
on a fall, "isn't affected" (621, 27) unless `battle+0x8e95` is clear and
the target's resistance byte `+0x52` (element 21) is above 0, when the
record's fail line. Breaths (kind 23's own, the pool at `0x021ddc74`): raised
to 2 `0x1b0`, to 0 `0x1af`, else `0x1b1`; lowered to 0 `0x1af`, else
`0x1ae` — **no "a lot" for a fall**.

### Kind 41 — Wave of Relief (`021df1e8`)

The cure-all (`func_ov024_021eae14`) on each one reached, with no test of
its landing, and no line of its own. The cure-all clears sleep, the
poisons, many statuses the battle does not keep, and **every level below 0**
— attack, defence, agility, charm, might, mending, spells, breaths and the
two above (`0x021eaf4c`–`0x021eb05c`) — then `ApplyCombatantBuffs`.

INFERRED: what Wave of Relief says is its record's done line, 203 "is
alleviated of all unfortunate effects", where something was cleared, and
its fail line, 31, where nothing was — the handler adds none, and how the
result is told without one is not read.

### How the levels run down — `func_ov000_0215858c`

Read to find the levels' wear-off lines, and it answers §7's open question,
not yet applied. For each status in turn, with its flag set and its count
not 0: the count less one, then a draw `R(100) / 100` against the table at
`0x02182ad4` by the count — **1.0, 0.875, 0.75, 0.625**, and at 4 a
denormal (`0x0000ffff`), which only a draw of 0 is under; under it, the
level clears and its line is said. The counts the setters store are 5
(attack `+0x6e`, mending `+0x73`, spells `+0x74`, breaths `+0x75`), so a
level wears off by 1 in 100 after a round, then 63, 75, 88 and 100 in 100.
The lines (`0x02158da4`–`0x02158db8`, `0x02159528`): attack `0x1ce`, defence
`0x1cf`, agility `0x1db`, charm `0x1d0`, might `0x1d1`, mending `0x1d2`,
spells `0x1d3`, breaths `0x1d4` — "<ACTOR>'s … returns to normal". The
simulation's run-down is still the reference's (`LEVEL_TURNS`, `wornAfterTurn`)
and now carries the new levels the same way — **ours**; when it is run, and
the counts defence and agility store, are what applying this needs.

### Kind 16 — Antimagic (`021dced0`), and what Fizzle does

Landed on one who may take it (`func_02088890`: not `+0x14` bit 0): one
already fizzled (`func_ov024_021dd010`, `+0x14` bit 8) is "further
prevented" — `0x19` at one of the party, `0x1a` at a monster
(`0x021dcf28`); otherwise the record's done line (23, 24). Either way Fizzle
is set again (`func_020888a4`: a count of 6 at `+0x60`, the flag). Not
landed: the fail line (621, 27).

**What it does** is in `func_ov024_021eaa50`, which puts an action in
another's place before it is played: after the MP is asked
(`0x021eac6c`), a spell (`+0x10` bit 0) from one fizzled is put out as
**action 914** (`0x021eacc4`–`0x021ead08`; the literal `0x392` at
`0x021eadf4`), whose opening is 29, "tries to cast <ACTION>… but can't cast
spells at the moment", and whose cost is 0. The cure-all clears Fizzle
(`0x021eaf14`); its wear-off line is `0x1d6`.

### Kind 20 — Tingle (`021dd6f0`)

Landed on one paralysed (`func_ov024_021da9b0`: `+0x14` bit 3): the record's
done line (505, "is no longer paralysed"), the paralysis cleared
(`func_020882dc`: the bit, and `+0x5c` and `+0x7f`), an event 0x1a
(`func_ov000_02159eac`) and `+0x3b` bit 0 set. Otherwise the fail line (31).
**Nothing in the simulation paralyses** — rider 11, which INFERRED does, is
not read — so Tingle says "But nothing happens" until it is. The cure-all
clears paralysis too (`0x021eae80`).

Built: `LevelStat`, the four levels and `relieve` in the sim (`battle.ts`,
`states.ts`: `buffedMagic`, `wardMultiplier`); the wards in `dealt`; a
fighter's might and mending at their levels wherever an amount, an accuracy
or a raising scales by them (`atMagicLevels`); the cure-all over every
level; the wear-off lines in `battle-scene.ts`. Struck as the Attack: **46**,
where 55 were — and with Antimagic and Tingle, **44**.

## 10. Coups, the run-down, and what is left — 6 October 2026, carried on

### How a status runs down — applied

§9 read `func_ov000_0215858c` as one count against one table. It is two
counts, and the half §9 did not find is `func_ov000_021599f4`, which
`func_ov000_02157d3c` calls right after it for each one in the action's list
(the one who acted):

- **The count** — the status's byte at `+0x5c + n`, set by its setter
  (attack 5 at `+0x6e`, `func_020877c0`; defence 6 at `+0x6f`, `020878b4`;
  agility and charm 6; might, mending and the two wards 5; Fizzle 6 at
  `+0x60`; 0 Zone 5 at `+0x78`; Rough 'n' Tumble 5 at `+0x79`). Each of the
  holder's action passes, `021599f4` takes one off every status held; at 0,
  **the second count** at `+0x7f + n` is set to its start
  (`0x02159c14`–`0x02159c30`). The offsets and starts are the table at
  `data_ov000_02182efc`, 26 pairs — 4 for every one but 0 Zone and Rough 'n'
  Tumble, which start at 1. No draw.
- **The wear-off** — `0215858c`, before it on the same pass: its first draw
  at `0x021585bc` always (the "draw after every action" the battle already
  made), then for each status held whose second count is running, in the
  order of its blocks (Fizzle `+0x83` at `0x02158804` … attack `+0x91` at
  `0x02159050`, defence `+0x92`, agility, charm, might, mending, spells
  `+0x97` at `0x02159428`, breaths `+0x98`, … 0 Zone `+0x9b` at `0x02159688`,
  Rough 'n' Tumble `+0x9c` at `0x02159720`): that count less one, **a draw of
  its own** `R(100) / 100`, and the status cleared, its line said, where the
  table by the count is above it. The table is `0x02182ad4` (1.0, 0.875,
  0.75, 0.625) for most, `0x02182bd4` (1.0, 0.875, 0.625, 0.375) for the
  resistance to spells, 0 Zone and Rough 'n' Tumble, among others.
- So a level of defence holds its holder's next six passes, then wears off
  by 63, 75, 88 and 100 in 100 over the four after; 0 Zone holds five and
  goes on the sixth.

The wear-off lines of the two coups are 0 Zone's `0x1c5` (`0x021596f0`) and
Rough 'n' Tumble's `0x1da` (`0x02159788`).

Built: `countDown`, `runDown`, `LEVEL_COUNTS` and `WEAR_OF` in `states.ts`;
the battle's after-action pass runs them for the one who acted, in place of
the reference's turns at the round's end (`wornAfterTurn`, gone).

### The coups — six of the eight built

Each is the handler its record's kind names (§1's table, kinds 26 and 68–74),
on the one its reach gives; their records say their reach is the actor's
(1) but for Voice of Experience's party (3), Itemised Kill's group (4), and
Roaring Tirade's, Disco Tech's and Knight Watch's monsters (3).

- **0 Zone** (507, kind 68, `021e1580`): landed, on one not `+0x14` bit 0
  (`func_020890c0`), `+0x18` bit 9 with a count of 5 at `+0x78`
  (`func_020890d4`); its done line 520 "can now cast spells without spending
  any MP", else its fail line. **What it does**: `func_ov024_021eadfc` tests
  the bit, and `func_ov024_021eaa50` skips asking the MP at `0x021eabd8`, and
  the resolver clears the spend at `0x021ebbcc`; the AI's own test is
  `func_ov000_02153a8c`. It goes as §10's run-down says, its line `0x1c5`.
- **Rough 'n' Tumble** (510, kind 70, `021e1824`): the same shape, `+0x18`
  bit 10, count 5 at `+0x79` (`func_02089110`, `02089124`), line 518.
  **What it does**: the evasion roll (`func_ov000_02156f98`,
  `0x02156fe8`–`0x02157010`) makes no draw of its own for its holder — they
  dodge when the pass's die (`battle + 0x8e6e`, thrown at `0x021ebf28`) is
  under 50; the evasion chance (`02156270`) is a flat 50.0; and the counter
  (`02156558`, `0x021565e4`) comes when the die is 50 to 74. Wears off with
  `0x1da`.
- **Brownie Boost** (516, kind 74, `021e1ed4`): no test of its landing;
  defence (`func_02087860` with 0, `020878b4` with 1), the resistance to
  breaths (`02087e18`, `02087e6c`) and attack (`0208776c`, `020877c0`) each a
  level up where it may go, each with its line; none moved, the fail line
  (31).
- **Spelly Breath** (514, kind 26, `021ddf5c`): MP back by
  `func_ov000_0215a1d4`, the amount its damage handler's — 48,
  `func_ov024_021d974c`: the target's most MP (`status + 6`) times
  `NextRandomFloatBetween(0.2, 0.5)`, truncated. (Actions `0x19b` and `0x22e`
  take the most MP whole, `0x021ddf88`–`0x021ddfb8`.) Done line 106 where any
  came back or the target is a monster of endless MP; else 31.
- **Itemised Kill** (509, kind 69, `021e16a4`): once an action
  (`battle + 0x6e`), on the target's group record (`battle + 0x81b4 + 0x18 ×
  group`): already marked (`+0x16`), or the monster's ordinary drop of step 7
  (`record + 2`), the fail line and no draw; else a draw below 100 under 100 —
  50 when the battle's request has `+0x24` or `+0x25`, a grotto's or a legacy
  boss's (`0x021e1758`–`0x021e1780`) — marks `+0x16` and says 519. **What it
  does**: the drop list carries `+0x16` as its entry's bit 15
  (`func_ov000_02155184`, `0x0215533c`), and the drop roll
  (`func_ov023_021f454c`, `0x021f4ab0`) makes the ordinary drop's chance one
  in 1 in its first pass. Bit 14, from `+0x17`, does the same for the rare
  (`0x021f49e8`); what sets `+0x17` is not read.
- **Voice of Experience** (512, kind 72, `021e1cbc`): the work is the
  resolver's, before the handler (`0x021eb9dc`–`0x021eba9c`): for one of the
  party, the most is `1 + (level + 11.0) × 0.01`, at most 2.0, their level in
  their vocation (`func_0202053c`); `NextRandomFloatScaled(1.1, most, 1)`
  (`0x020743d4`) draws a whole number of tenths between them by
  `NextRandomBetween` and is kept at `battle + 0x8e3c`, and on the result for
  the line's `%.1f`. The handler says 517 where a group in the battle gives
  experience, else `0x1f`. The victory (`func_ov023_021edf54`, `0x021ee05c`)
  takes the experience as `(unsigned)((float) total × [0x8e3c])`, and the
  gold likewise by `[0x8e40]`, which action `0x20c` sets with the
  experience's to a draw between 1.5 and 3.0 (`0x021ebaa4`).

**Not built**: Roaring Tirade and Disco Tech (kind 10, `021dc0b8`) — rider 1
(`021e2bd0`) with its levels naming a status, `+0x14` bit 19 and `+0x22`
bits 2–5 (`func_02088418`, `02088474`): 5 "stricken with terror" (`0x5e`),
2 "knocked clean off" its feet (`0x150`), 4 Disco Tech's; what the status
does on its holder's turn, and how long it holds, are not read. Knight
Watch (kind 73, `021e1de8`): on each monster not dead, asleep, under bit 19,
paralysed or `+0x14` bit 5 (`func_02088e04`), `+0x18` bit 12 with a count
drawn between the monster's `+0x148 → +0x28` and `+0x29`
(`func_02088e48`), and its actor at `+0x2e`; it runs down by the actor
standing and its own count (`0215858c`, `0x0215861c`–`0x02158760`, line
`0x164`). What bit 12 does to a monster is not read.

### The lost turn — kind 10 and rider 1, built; and Knight Watch, built

**Status `+0x14` bit 19** is a turn lost: `func_ov000_02155f9c`, the test
of whether one can act, counts it (`0x02155ffc`) beside paralysis (bit 3,
`func_ov000_02156038`) and bit 4 (`func_020882f8`); so its holder cannot
dodge, block or choose, and on its turn `func_ov000_0215767c` puts action
503 — nameless, no line — in its action's place (`0x02157ac0`) and sets
`+0x3b` bit 1 (`0x02157b98`–`0x02157bb0`), which the run-down after that
turn reads first, clearing the status (`func_020884f8`, `0x021585d4`–
`0x021585f8`). One turn lost, whenever its holder's next one is.

**Rider 1** (`021e2bd0`): from a blow that dealt something, with the
target's byte `+0x4c` (element 15) not 0, a draw below 100, as a float,
under the action's chance times the byte over 100 — the byte passed over
for `0x239` and Roaring Tirade (`0x021e2cb8`–`0x021e2cc8`), and no
critical's hundred; from kind 10 none of that (`0x021e2c10`). Then the
record's `+0x32` names the lost turn's kind: the table at
`data_ov024_021fe820` knows 2 to 8, and 2 is refused where the monster's
`mon_data +0x0A` bit 11 is set (`func_ov024_021e8fa4`, which asks
`func_ov000_02156068` with 2: 1 asks bit 12, metal; 0 asks the family); one may take it (`func_02088418`) who stands, is
not paralysed, is not at the maximum of tension — but for the two coups
`0x1fc` and `0x20f` — and is not under the same kind; then it is set
(`func_02088474`: bit 19, the kind at `+0x22` bits 2–5, tension taken away,
said with `0x25c` where they had any, `func_ov024_021e8cfc`). From a blow,
kind 2 says `0x150` "knocked clean off", 5 `0x5e` "stricken with terror"
(`0x021e2e0c`). The kinds on the cartridge: 2 Trip of a Deathtime, 3
Pratfall, 4 the dances and Disco Tech, 5 War Cry, Roaring Tirade and Heart
Breaker.

**Kind 10** (`021dc0b8`): landed, its rider with `+0x32`; the rider landed,
its done line (Disco Tech's none, `0x021dc210`); else
`func_ov024_021e9018`'s line, or its fail line. **Not built**: 021e9018's
lines for the paralysed; Pratfall's extra call (`0x021dc194`,
`func_ov000_0215a8d4` with 5, a count kept for something not read); and
what the game shows on the lost turn — **ours**: "cannot move!".

**Knight Watch** (kind 73, `021e1de8`): on each monster that may take it
(`func_02088e04`: standing, not bits 3, 4, 5 or 19), with no test of its
landing, a count `NextRandomBetween(record + 0x28, record + 0x29)` — the
combatant's `+0x148`, its `mon_btldata` record; above 0, `+0x18` bit 12
with the count at `+0x7e` (`func_02088e48`) and the Paladin at `+0x2e`.
**What it does**: the monster's weighted pick (`func_ov000_02154f30`,
`0x02154f9c`–`0x02154fb8`) hands back the watcher, with no draw, while they
stand; a pick made before the watch, as the round began, stands. **How it
goes**: the run-down (`0x0215861c`–`0x02158760`) takes a pass off its count
and at 0 starts its second at 1, looked up at once against 1.0 and the
pass's first draw — so it goes on the pass the count runs out; at once if
the watcher is down or gone (`func_ov000_02153c0c`). Line `0x164`.

Struck as the Attack: **41** (44 before kind 10).

### Paralysis — rider 11, built

`func_ov024_021e3a34`: with something dealt; for action `0x52` only on a
monster of family 9 (`func_ov000_02156068` with 9 and 0), for `0x58` on a
metal body or one whose byte `+0x4e` (element 17) is not 0, any other on
that byte not 0; one who may take it (`func_0208824c`: standing, not at the
maximum of tension); a draw below 100 under the chance times the byte —
`0x52` a flat 25, `0x58` on a metal body a flat 12.5 (`0x021e3bc0`–
`0x021e3bf4`). Then `func_0208826c`: tension, a lost turn and sleep cleared,
`+0x14` bit 3 set with a count of 3 at `+0x5c` and its second at `+0x7f`
cleared; the line `func_ov024_021e9464` gives, "is paralysed!" (`0x1e`) or,
on one already, "is frozen even further" (`0x6e`), and the tension line
where they had any.

**How it goes** — not by the run-down after a pass. `021599f4` counts
`+0x5c` down on its holder's passes as the others, and at 0 starts `+0x7f`
at 4 (the first three of its statuses, offsets at `0x02182a94`, take the
first held alone); then **at the start of each of their turns**,
`func_ov000_0215833c` takes one from `+0x7f` and frees them where
`0x02182ad4` by it is above the turn-start draw — action 900 ("is no longer
paralysed", 115) in their turn. The same function wakes a sleeper (bit 4,
`func_020882f8`, `+0x80`, by `0x02182bd4`, action 901 "wakes up"), which
the battle already did.

**And a correction**: a lost turn of kind 2 is refused not on a metal body
but where `mon_data +0x0A` bit 11 is set — `func_ov000_02156068` asks bit
12 with 1, bit 11 with 2, the family with 0 (`0x021560c0`–`0x02156108`).

### Read toward what is left — the statuses the remaining kinds set

Most of §7's kinds are one shape: a test (`+0x14` bit 0 clear, some with
more), landed, a setter, the done line, else the fail line. **What each
setter stores** (USA ARM9), so that only *what the status does* is left to
read for each:

| kind | actions | flag | count | runs down |
|---|---|---|---|---|
| 19 | Flower Power, Scandal Eyes | `+0x14` bit 6 (`func_02088854`) | 4 at `+0x5f` | `+0x82`, `0x02182bd4` |
| 32 | Reverse Cycle | `+0x14` bit 26 (`02088944`) | 5 at `+0x66` | `+0x89`, `0x02182ad4` |
| 36 | Schizofanic | `+0x14` bit 20, clearing 21 (`02088a94`); test also `+0x18` bit 6 | none | one use (below) |
| 37 | Immense Defence | a level, `+0x58` bits 24–26 (`0208806c`) | — | — |
| 39 | Alma Mater | `+0x14` bit 22 (`02088b14`) | 6 at `+0x67` | `+0x8a`, `0x02182ad4` |
| 40 | Rotstopper | `+0x14` bit 29 (`02088a34`) | 4 at `+0x64` | `+0x87`, `0x02182bd4` |
| 47 | Feel the Burn | `+0x14` bit 28 (`020889e4`) | 4 at `+0x63` | `+0x86`, `0x02182bd4` |
| 48 | Right as Rain | `+0x14` bit 31 (`02088bb4`) | 6 at `+0x69` | not in the run-down's table |
| 54 | Vanish | `+0x14` bit 27 (`02088994`) | 5 at `+0x62` | `+0x85`, `0x02182bd4` |
| 55 | Mist Me | `+0x14` bit 21, clearing 20 (`02088adc`) | none | one use (below) |
| 63 | Twocus Pocus | `+0x18` bit 8 (`02088d7c`) | 5 at `+0x7d` | `+0xa0`, `0x02182ad4` |
| 64 | Holy Impregnable | `+0x18` bit 3 (`02088ccc`) | 5 at `+0x6b` | `+0x8e`, `0x02182ad4`, line `0x25d` |
| 78 | Focus Pocus | `+0x14` bit 30 (`02088b64`) | 6 at `+0x68` | not in the run-down's table |

**Schizofanic and Mist Me, what they do** (read, not built): the accuracy
roll (`func_ov000_02156648`, `0x02156714`–`0x02156788`), before its own
draw, misses an action that a shield may block (`+0x10` bit 6) at one under
bit 20 — the result flagged 8, and bit 20 cleared (`func_02088aa8`) — or
under bit 21, flagged `0x10` and bit 21 cleared (`02088af0`): one blow
missed, then gone. Which line each flag says is not read.

**Dazzle** (kind 19): the actions `+0x10` bit 3 marks (`Action.spoiltBySight`)
throw a die of eight in the accuracy roll for an attacker under it; which bit
that roll tests, and so whether bit 6 is dazzle, is not yet read.

## 11. The remaining kinds — 7 October 2026, carried on

### The round's end, read whole — and a draw it was missing

The round's end (`func_ov000_0215e6e8`) clears each one's guard, then calls
**`func_ov000_0215a23c`** — what is got back and what is tolled — and then,
unless `battle+0x8e14` is set, **`func_ov000_02157e1c`**, the count-down.
The battle had them the other way about, and made no draw in the second.

`0215a23c`, in its order:

1. For the party standing (`func_ov000_0215e9fc` with 1, the list at
   `0x02182b54`): HP — 25 where `func_02085230` holds of their record (an
   equipped trait; not kept), plus, under **Right as Rain** (`+0x14` bit 31,
   `func_ov000_02158324`), the larger of 10 and **half their level in their
   vocation** (`func_0202053c`, `asr #1`, `0x0215a318`–`0x0215a33c`). Given
   by `func_ov000_0215a16c`, which adds and holds it to the most; told only
   where it came to something (`0x0215a3a4`), by `func_ov000_0215c758` as
   action 930 (one) or 931 (more).
2. The same party, MP — under **Focus Pocus** (`+0x14` bit 30,
   `func_ov000_0215830c`) the larger of 3 and **a tenth of that level**
   (`_s32_div_f`, `0x0215a450`–`0x0215a468`), plus trait `0x3f`'s (a draw
   between 0 and a tenth of the level, under conditions of `GameState`; not
   kept). Given by `func_ov000_0215a1d4`; told as 932 or 933.
3. Envenomation's toll on the party (`0x0215a5c8` on), told as 934.
4. The monsters (`func_ov000_0215eb1c`): Focus Pocus's MP by
   `func_ov000_02159dbc` (not read; no monster is given it), and their toll.

`02157e1c` (**a draw at its head, `R(100) / 100`, at `0x02157ea8`, every
round** — kept at `[sp+0xc]` for `+0x18` bit 6's wearing off), then for each
one standing (`func_ov000_02153e40`):

- **Focus Pocus** (`+0x68`, second count `+0x8b`) and **Right as Rain**
  (`+0x69`, `+0x8c`): for a holder, a draw of its own first, whichever count
  is running; with the second running, it less one and the status cleared
  where `0x02182ad4` by it is above the draw — Focus Pocus's line `0x1c8`
  (`0x02157f88`), Right as Rain's `0x24c` (`0x02158040`); else the first
  less one, and at 0 the second at 4.
- `+0x18` bit 11 (`+0x7c`, `+0x9f`, a draw of its own, line `0x249`) and
  `+0x18` bit 6 (`+0x7a`, `+0x9d`, the head's draw against `0x02182bd4`,
  line `0x249 − 0x83`): statuses the battle does not keep.
- The coup de grâce held a round less (`0x021581e8`–`0x02158238`).

**Built**: kinds 48 and 78 (`021e01b8`, `021e268c`) — landed, on one who may
take it (`func_02088ba0`, `02088b50`: `+0x14` bit 0 clear), the status with
its count (`func_02088bb4`, `02088b64`), the done line; else the fail line.
The round's end as above, its head draw made. **Ours**: the two traits; a
monster's Focus Pocus; the HP and MP got back told in our words — actions
930–933 have no line of their own, and what the game shows is not read.

### Vanish (kind 54) and dazzle (kind 19) — what each does, built

**Vanish** (`func_ov024_021e093c`): the simple shape — landed (its flag at
`[sp+0x30]`, the frame being larger), on one who may take it
(`func_02088980`: `+0x14` bit 0 clear), `+0x14` bit 27 with a count of 5 at
`+0x62` (`func_02088994`), a picture flag `0x2c` (`func_ov000_02159eac`), the
done line; else the fail line. **What it does** — the one reader in the
battle's rules, `func_ov000_0215516c`, from the monsters' weighted pick
(`func_ov000_02154f30`, `0x021550ac`–`0x021550c0`): each one's weight is added
to the total **and then** halved for one vanished (`asr #1`), so the draw
below the old total can pass every weight and fall to the even draw after it
(`0x0215512c`). Two of the party at 2, one vanished: 3 in 8 for them. Its
other readers draw it (`func_020c5354`) and gather the statuses for the
picture (`func_ov024_021eda78`), and the tactics' scoring (`021fc754`). It
runs down after its holder's pass: second count `+0x85`, start 4
(`data_ov000_02182efc`), the second table, line `0x1c9` "<ACTOR>'s Vanish
wears off" (`0x0215892c`–`0x021589bc`).

**Dazzle** (`func_ov024_021dd534`): may take it (`func_02088840`, bit 0
clear) and landed — the line for one already dazzled **of the record's sort**
(`+0x30`; `+0x22` bits 6–8 hold it), else the done line; dazzled with a count
of 4 at `+0x5f` (`func_02088854`), the sort stored. Not landed: the other
line for one already of that sort, else the fail line. The lines
(`func_ov024_021e9198`), by sort — 1 hallucinating (`0x26` landed, `0x27`
not), 2 dazzled (`0x140`, `0x141`), 3 sand (`0x126`, `0x137`), 4 ink
(`0x13d`, `0x13f`). Flower Power's sort is 1, Scandal Eyes' 2. **What it
does** — the last step of the accuracy roll (`func_ov000_02156648`,
`0x02156a90`–`0x02156ac8`): for an action with `+0x10` bit 3 whose striker
is dazzled (`func_ov000_02156b20`), `R(8)`, under 5 a miss. Thrown after the
accuracy's own draws, and not where the roll has already returned — a sure
action, or one gone haywire on one not immune (`0x02156a34`). A miss deals
nothing and works no damage out (`0x021ec4e4`–`0x021ec4e8`): the action's
handler is handed it, and the plain Attack's fail lines say "Miss!" (4 at one
of the party, 7 at a monster). Runs down: second count `+0x82`, start 4, the
second table, line `0x1c7` "<ACTOR> is no longer dazzled" (`0x02158764`–
`0x021587f4`). `+0x10` bit 3 (`Action.spoiltBySight`, INFERRED dazzle until
now) is on 110 of 681 actions, every one a blow that can be dodged.

**Ours**: a blow other than the Attack missed says its record's fail line,
INFERRED from the Attack's; the picture flags not drawn.

**Order of the run-down after a pass** (`func_ov000_0215858c`), read whole
for placing these: Knight Watch, dazzle (`+0x82`), Fizzle (`+0x83`), Bounce
(`+0x84`, first table), Vanish (`+0x85`), Feel the Burn (`+0x86`, second,
`0x1d7`), Rotstopper (`+0x87`, second, `0x1d8`), Reverse Cycle (`+0x89`,
first, `0x1c4`), Alma Mater (`+0x8a`, first, `0x1cb`), `+0x8d`
(`func_02088660`, second), … Holy Impregnable (`+0x8e`, first, `0x25d`),
`+0x9e`, `+0x8f` (`0x1cc`), …, then attack's at `0x02159050`. The second
counts' starts, by `data_ov000_02182efc` (pairs of offset from `+0x5c` and
start): Rough 'n' Tumble 1, 0 Zone 1, and 4 for every other.
