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
| 19 | `func_ov024_021dd534` | Flower Power, Scandal Eyes |
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
| 48 | `func_ov024_021e01b8` | Right as Rain |
| 49 | `func_ov024_021e02b0` | Disruptive Wave |
| 50 | `func_ov024_021e0380` | Extreme Makeover |
| 51 | `func_ov024_021e04e0` | Eyes on Me |
| 52 | `func_ov024_021e05fc` | Mercy |
| 53 | `func_ov024_021e07b0` | Soothe Sayer |
| 54 | `func_ov024_021e093c` | Vanish |
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
| 78 | `func_ov024_021e268c` | Focus Pocus |

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

**Still struck as the Attack** (46 — 55 before §9 built kinds 22, 23, 38, 41 and 42), by the kind whose handler is unread:

| kind | handler | actions |
|---|---|---|
| 0 | `func_ov024_021da670` | Counter Wait, Defending Champion, Back Atcha, Whipping Boy, Selflessness, Forbearance |
| 10 | `func_ov024_021dc0b8` | Trip of a Deathtime, War Cry, Pratfall |
| 13 | `func_ov024_021dc540` | M-Pathy |
| 14 | `func_ov024_021dc700` | H-Pathy |
| 16 | `func_ov024_021dced0` | Antimagic |
| 19 | `func_ov024_021dd534` | Flower Power, Scandal Eyes |
| 20 | `func_ov024_021dd6f0` | Tingle |
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
| 48 | `func_ov024_021e01b8` | Right as Rain |
| 49 | `func_ov024_021e02b0` | Disruptive Wave |
| 50 | `func_ov024_021e0380` | Extreme Makeover |
| 51 | `func_ov024_021e04e0` | Eyes on Me |
| 52 | `func_ov024_021e05fc` | Mercy |
| 53 | `func_ov024_021e07b0` | Soothe Sayer |
| 54 | `func_ov024_021e093c` | Vanish |
| 55 | `func_ov024_021e0a50` | Mist Me |
| 56 | `func_ov024_021e0b48` | Whistle |
| 63 | `func_ov024_021e1028` | Twocus Pocus |
| 64 | `func_ov024_021e1120` | Holy Impregnable |
| 66 | `func_ov024_021e1328` | Pincushion |
| 78 | `func_ov024_021e268c` | Focus Pocus |

Most need a status the battle does not keep — a counter, a barrier, Bounce's
mirror, dazzle, confusion, a stance (kind 0 is the six stances: Counter
Wait, Defending Champion …).

**Played as a plain blow, its own code read and not built:** Crosscutter
Throw — its extra pass's target is picked by place on the stage (§8).
~~Propeller Blade, Gold Rush, the six that scale by the table at
`0x021fe8b6`~~ — read and built 6 October 2026, §8.

**Riders not played** (`data_ov024_021ff450`): 1 `021e2bd0` (the dances' and
War Cry's — a turn lost, INFERRED), 5 and 6 (the antidotes') `021e324c`,
`021e32f4`, 9 `021e373c` (Soothe Sayer), 10 `021e386c` (confusion,
INFERRED), 11 `021e3a34` (paralysis, INFERRED), 12 `021e3cec` (Rake 'n'
Break), 13 `021e3d88` (Conjury Conductor), 14 `021e3f14` (Morale Masher),
19 `021e4588` (Sobering Slap), 21 `021e47f4` (Caster Sugar). Their blows
land and deal; the rider is dropped.

**Coups not built** — each says its opening and does nothing: Roaring
Tirade and Disco Tech (kind 10, `021dc0b8`), Spelly Breath (kind 26,
`021ddf5c`, damage handler 48), 0 Zone (68, `021e1580`), Itemised Kill (69,
`021e16a4`), Rough 'n' Tumble (70, `021e1824`), Voice of Experience (72,
`021e1cbc`), Knight Watch (73, `021e1de8`), Brownie Boost (74, `021e1ed4`).

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

Built: `LevelStat`, the four levels and `relieve` in the sim (`battle.ts`,
`states.ts`: `buffedMagic`, `wardMultiplier`); the wards in `dealt`; a
fighter's might and mending at their levels wherever an amount, an accuracy
or a raising scales by them (`atMagicLevels`); the cure-all over every
level; the wear-off lines in `battle-scene.ts`. Struck as the Attack: **46**,
where 55 were.
